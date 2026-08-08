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
import { GridCellKind, type CellArray, type GridCell, type Item } from "./data-grid-types.ts";

/**
 * The string a cell is matched against, per kind -- ported verbatim from source's `tick()` switch.
 * `undefined` means "this kind is not searchable", and such cells are skipped rather than treated
 * as empty strings (an empty string would match an empty query, which nothing wants).
 *
 * Note `Image`/`Bubble` join their entries with a whale emoji. That is source's own choice, and the
 * comment explaining it is worth preserving: the separator only has to be something no realistic
 * query contains, so that "abc" cannot match across two adjacent entries "ab" and "c".
 */
export function getSearchTestString(cell: GridCell): string | undefined {
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
export function makeSearchRegex(query: string): RegExp {
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
export function searchCellChunk(cells: CellArray, regex: RegExp, originY: number, originX = 0): Item[] {
    const out: Item[] = [];
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
export const TARGET_SEARCH_TIME_MS = 10;
/** Source's hard result cap: the scan stops early once this many matches exist. */
export const MAX_SEARCH_RESULTS = 1000;
/** Source's starting stride, clamped to the row count. */
export const INITIAL_SEARCH_STRIDE = 10;

/**
 * Chooses the next chunk size from how long the last one took, aiming at {@link TARGET_SEARCH_TIME_MS}.
 *
 * Extracted from source's `tick()` so it can be tested directly. The `Math.max(elapsed, 1)` floor is
 * load-bearing and is source's: without it a chunk that measures 0ms (entirely plausible on a fast
 * machine with a small stride) makes the scalar `Infinity` and the next stride the whole table,
 * which is precisely the pathological "one long frame" case the adaptive stride exists to avoid.
 */
export function nextSearchStride(currentStride: number, elapsedMs: number): number {
    return Math.ceil(currentStride * (TARGET_SEARCH_TIME_MS / Math.max(elapsedMs, 1)));
}

/** How the scan reports progress. Mirrors source's `searchStatus` state object. */
export interface SearchStatus {
    /** Rows examined so far, out of the total. Drives the progress bar. */
    readonly rowsSearched: number;
    /** Matches found so far. */
    readonly results: number;
}

export interface IncrementalSearchOptions {
    /** Total rows to scan. */
    readonly rows: number;
    /** Absolute row to begin at -- source starts at the current scroll position, so the first
     *  results are the ones already on screen, then wraps around to row 0. */
    readonly startRow: number;
    /**
     * Fetches one chunk. Returning `undefined` means "cannot answer synchronously" and ends the
     * scan; the caller decides whether that is worth surfacing. A `Promise` is awaited, which is how
     * an async/paged source participates -- unlike the copy path, search may await freely, since it
     * is not running inside a `copy` event (see `buildCopyBuffer`'s note in the controller).
     */
    readonly fetchChunk: (startRow: number, height: number) => CellArray | Promise<CellArray> | undefined;
    /** Called after every chunk with the results so far and the progress. `results` is a fresh
     *  array each time, so a consumer may hold onto it. */
    readonly onProgress: (results: readonly Item[], status: SearchStatus) => void;
    /** Schedules the next chunk. Defaults to `requestAnimationFrame`; injected for testing. */
    readonly schedule?: (fn: () => void) => number;
    /** Cancels a scheduled chunk. Defaults to `cancelAnimationFrame`. */
    readonly unschedule?: (handle: number) => void;
    /** Millisecond clock. Defaults to `performance.now`. */
    readonly now?: () => number;
}

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
export class IncrementalSearch {
    private handle: number | undefined;
    /** Incremented on every `start`/`cancel`, so a chunk resolving late from a superseded scan can
     *  tell that it is stale and drop its results. Source has no equivalent -- it relies on
     *  `AbortController` for the consumer's fetch, which does not help when the *scan itself* is
     *  restarted while a `Promise` chunk is in flight. Typing a second character into the search box
     *  is exactly that case. */
    private generation = 0;

    private readonly schedule: (fn: () => void) => number;
    private readonly unschedule: (handle: number) => void;
    private readonly now: () => number;

    constructor(private readonly opts: IncrementalSearchOptions) {
        this.schedule = opts.schedule ?? (fn => requestAnimationFrame(fn));
        this.unschedule = opts.unschedule ?? (h => cancelAnimationFrame(h));
        this.now = opts.now ?? (() => performance.now());
    }

    /** Starts scanning for `query`. An empty query is treated as "no search": the scan is cancelled
     *  and a single empty progress report is emitted, so a caller can clear its results without
     *  special-casing. */
    start(query: string): void {
        this.cancel();
        if (query === "") {
            this.opts.onProgress([], { rowsSearched: 0, results: 0 });
            return;
        }

        const { rows, startRow, fetchChunk, onProgress } = this.opts;
        const regex = makeSearchRegex(query);
        const generation = this.generation;

        let nextRow = Math.min(Math.max(startRow, 0), Math.max(rows - 1, 0));
        let stride = Math.min(INITIAL_SEARCH_STRIDE, rows);
        let rowsSearched = 0;
        const found: Item[] = [];

        const tick = async (): Promise<void> => {
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

            onProgress([...found], { rowsSearched, results: found.length });

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
    cancel(): void {
        if (this.handle !== undefined) {
            this.unschedule(this.handle);
            this.handle = undefined;
        }
        this.generation++;
    }

    /** True while a scan is scheduled or mid-chunk. */
    get isRunning(): boolean {
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
export function formatSearchStatus(status: SearchStatus, selectedIndex: number): string {
    const base =
        status.results >= MAX_SEARCH_RESULTS
            ? "over 1000"
            : `${status.results} result${status.results === 1 ? "" : "s"}`;
    return selectedIndex >= 0 ? `${selectedIndex + 1} of ${base}` : base;
}
