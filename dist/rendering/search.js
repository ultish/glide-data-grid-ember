import { GridCellKind } from './data-grid-types.js';

// Phase 9e. The search *engine*, ported from `packages/core/src/internal/data-grid-search/
// data-grid-search.tsx` (577 lines) with the React component peeled off.
//
// Source fuses three things into one component: the incremental scanner, the result/navigation
// state, and the overlay UI. Only the first two are logic; the third is `@linaria/react` JSX that
// cannot be ported faithfully in any case (see PORTING-NOTES.md's styling section). So the split
// here is: this file is framework-agnostic plain TS with no DOM and no canvas, the controller owns
// the wiring, and `<GlideSearchBar>` is a separate opt-in component a consumer may ignore entirely.
//
// The one deliberate improvement over source: the scan loop's scheduler and clock are **injected**
// rather than reaching for `window.requestAnimationFrame` / `performance.now()` directly. Source
// cannot be tested without a browser; this can be driven deterministically in bare Node, which
// matters because the adaptive-stride logic is exactly the sort of arithmetic that looks right and
// is not (see 9a). Both default to the real thing, so callers pass nothing.

/**
 * The string a cell is matched against, per kind -- ported verbatim from source's `tick()` switch.
 * `undefined` means "this kind is not searchable", and such cells are skipped rather than treated
 * as empty strings (an empty string would match an empty query, which nothing wants).
 *
 * Note `Image`/`Bubble` join their entries with a whale emoji. That is source's own choice, and the
 * comment explaining it is worth preserving: the separator only has to be something no realistic
 * query contains, so that "abc" cannot match across two adjacent entries "ab" and "c".
 */
function getSearchTestString(cell) {
  switch (cell.kind) {
    case GridCellKind.Text:
    case GridCellKind.Number:
      return cell.displayData;
    case GridCellKind.Uri:
    case GridCellKind.Markdown:
      return cell.data;
    case GridCellKind.Boolean:
      return typeof cell.data === "boolean" ? cell.data.toString() : undefined;
    case GridCellKind.Image:
    case GridCellKind.Bubble:
      return cell.data.join("🐳");
    case GridCellKind.Custom:
      return cell.copyData;
    default:
      return undefined;
  }
}

/**
 * Builds the matcher for a raw query string: every regex metacharacter is escaped, so the query is
 * matched literally, and the match is case-insensitive. Ported from source, including its exact
 * escape set.
 *
 * Note what source's set omits: `/` (harmless in a `RegExp` constructor) and, more importantly, it
 * escapes `-` which only matters inside a character class. Kept identical rather than "improved" --
 * an escape set is the wrong place to diverge, since the failure mode is a query that silently
 * matches the wrong thing.
 */
function makeSearchRegex(query) {
  return new RegExp(query.replace(/([$()*+.?[\\\]^{|}-])/g, "\\$1"), "i");
}

/**
 * Scans one already-fetched chunk of cells and returns the matches as `[col, row]` pairs.
 *
 * `cells` is row-major, as `getCellsForSelection` returns it. `originY` is the absolute row index
 * `cells[0]` came from, and `originX` the absolute column index of `cells[n][0]` -- both are added
 * back onto the local indices so results are in the coordinate space the caller asked in. Source
 * hardcodes `originX` to 0 because it always scans full rows; naming it makes the contract explicit
 * and lets a caller scan a column subset later without a silent off-by-N.
 */
function searchCellChunk(cells, regex, originY, originX = 0) {
  const out = [];
  for (const [row, rowCells] of cells.entries()) {
    for (const [col, cell] of rowCells.entries()) {
      const testString = getSearchTestString(cell);
      if (testString !== undefined && regex.test(testString)) {
        out.push([col + originX, row + originY]);
      }
    }
  }
  return out;
}

/** Source's `targetSearchTimeMS` -- the per-tick time budget the adaptive stride aims for. */
const TARGET_SEARCH_TIME_MS = 10;
/** Source's hard result cap: the scan stops early once this many matches exist. */
const MAX_SEARCH_RESULTS = 1000;
/** Source's starting stride, clamped to the row count. */
const INITIAL_SEARCH_STRIDE = 10;

/**
 * Chooses the next chunk size from how long the last one took, aiming at {@link TARGET_SEARCH_TIME_MS}.
 *
 * Extracted from source's `tick()` so it can be tested directly. The `Math.max(elapsed, 1)` floor is
 * load-bearing and is source's: without it a chunk that measures 0ms (entirely plausible on a fast
 * machine with a small stride) makes the scalar `Infinity` and the next stride the whole table,
 * which is precisely the pathological "one long frame" case the adaptive stride exists to avoid.
 */
function nextSearchStride(currentStride, elapsedMs) {
  return Math.ceil(currentStride * (TARGET_SEARCH_TIME_MS / Math.max(elapsedMs, 1)));
}

/** How the scan reports progress. Mirrors source's `searchStatus` state object. */

/**
 * The incremental, chunked table scan. One instance per grid; `start()` replaces any scan already
 * running.
 *
 * **Why chunked at all**: `getCellContent` is called once per cell, and a consumer's implementation
 * is allowed to be arbitrarily expensive. Scanning a 100k-row table in one pass would block the main
 * thread for seconds. Source's answer -- which this keeps -- is to scan a handful of rows per
 * animation frame and grow or shrink that stride to hold each frame near
 * {@link TARGET_SEARCH_TIME_MS}, so the grid stays interactive while results stream in.
 */
class IncrementalSearch {
  handle;
  /** Incremented on every `start`/`cancel`, so a chunk resolving late from a superseded scan can
   *  tell that it is stale and drop its results. Source has no equivalent -- it relies on
   *  `AbortController` for the consumer's fetch, which does not help when the *scan itself* is
   *  restarted while a `Promise` chunk is in flight. Typing a second character into the search box
   *  is exactly that case. */
  generation = 0;
  schedule;
  unschedule;
  now;
  constructor(opts) {
    this.opts = opts;
    this.schedule = opts.schedule ?? (fn => requestAnimationFrame(fn));
    this.unschedule = opts.unschedule ?? (h => cancelAnimationFrame(h));
    this.now = opts.now ?? (() => performance.now());
  }

  /** Starts scanning for `query`. An empty query is treated as "no search": the scan is cancelled
   *  and a single empty progress report is emitted, so a caller can clear its results without
   *  special-casing. */
  start(query) {
    this.cancel();
    if (query === "") {
      this.opts.onProgress([], {
        rowsSearched: 0,
        results: 0
      });
      return;
    }
    const {
      rows,
      startRow,
      fetchChunk,
      onProgress
    } = this.opts;
    const regex = makeSearchRegex(query);
    const generation = this.generation;
    let nextRow = Math.min(Math.max(startRow, 0), Math.max(rows - 1, 0));
    let stride = Math.min(INITIAL_SEARCH_STRIDE, rows);
    let rowsSearched = 0;
    const found = [];
    const tick = async () => {
      if (generation !== this.generation) return;
      const tStart = this.now();
      // Three-way clamp, all of it source's: never past the end of the table, never more than
      // the rows still unsearched (the scan wraps, so those differ), and never more than the
      // stride.
      const height = Math.min(stride, rows - rowsSearched, rows - nextRow);
      if (height <= 0) return;
      let chunk = fetchChunk(nextRow, height);
      if (chunk instanceof Promise) chunk = await chunk;
      // A superseded scan's chunk resolving after `await`. Drop it -- pushing these into
      // `found` would interleave two queries' results.
      if (generation !== this.generation) return;
      if (chunk === undefined) return;
      found.push(...searchCellChunk(chunk, regex, nextRow));
      rowsSearched += chunk.length;
      const elapsed = this.now() - tStart;
      onProgress([...found], {
        rowsSearched,
        results: found.length
      });

      // Wrap to the top once the bottom is reached, so a search started mid-table still
      // covers the rows above it. `rowsSearched` (not the row index) is what terminates.
      nextRow = nextRow + stride >= rows ? 0 : nextRow + stride;
      stride = nextSearchStride(stride, elapsed);
      if (rowsSearched < rows && found.length < MAX_SEARCH_RESULTS) {
        this.handle = this.schedule(() => void tick());
      } else {
        this.handle = undefined;
      }
    };
    this.handle = this.schedule(() => void tick());
  }

  /** Stops any scan in progress. Safe to call when nothing is running. */
  cancel() {
    if (this.handle !== undefined) {
      this.unschedule(this.handle);
      this.handle = undefined;
    }
    this.generation++;
  }

  /** True while a scan is scheduled or mid-chunk. */
  get isRunning() {
    return this.handle !== undefined;
  }
}

/**
 * Formats source's result summary ("3 of 12 results", "over 1000"). Pure, and pulled out here so
 * `<GlideSearchBar>` stays a template rather than growing string logic -- and so a consumer writing
 * their own bar can reuse the exact wording.
 *
 * `selectedIndex` is 0-based, `-1` meaning "nothing navigated to yet"; the output is 1-based, as
 * source's is.
 */
function formatSearchStatus(status, selectedIndex) {
  const base = status.results >= MAX_SEARCH_RESULTS ? "over 1000" : `${status.results} result${status.results === 1 ? "" : "s"}`;
  return selectedIndex >= 0 ? `${selectedIndex + 1} of ${base}` : base;
}

export { INITIAL_SEARCH_STRIDE, IncrementalSearch, MAX_SEARCH_RESULTS, TARGET_SEARCH_TIME_MS, formatSearchStatus, getSearchTestString, makeSearchRegex, nextSearchStride, searchCellChunk };
//# sourceMappingURL=search.js.map
