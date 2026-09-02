import { type CellArray, type GridCell, type Item } from "./data-grid-types.ts";
/**
 * The string a cell is matched against, per kind -- ported verbatim from source's `tick()` switch.
 * `undefined` means "this kind is not searchable", and such cells are skipped rather than treated
 * as empty strings (an empty string would match an empty query, which nothing wants).
 *
 * Note `Image`/`Bubble` join their entries with a whale emoji. That is source's own choice, and the
 * comment explaining it is worth preserving: the separator only has to be something no realistic
 * query contains, so that "abc" cannot match across two adjacent entries "ab" and "c".
 */
export declare function getSearchTestString(cell: GridCell): string | undefined;
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
export declare function makeSearchRegex(query: string): RegExp;
/**
 * Scans one already-fetched chunk of cells and returns the matches as `[col, row]` pairs.
 *
 * `cells` is row-major, as `getCellsForSelection` returns it. `originY` is the absolute row index
 * `cells[0]` came from, and `originX` the absolute column index of `cells[n][0]` -- both are added
 * back onto the local indices so results are in the coordinate space the caller asked in. Source
 * hardcodes `originX` to 0 because it always scans full rows; naming it makes the contract explicit
 * and lets a caller scan a column subset later without a silent off-by-N.
 */
export declare function searchCellChunk(cells: CellArray, regex: RegExp, originY: number, originX?: number): Item[];
/** Source's `targetSearchTimeMS` -- the per-tick time budget the adaptive stride aims for. */
export declare const TARGET_SEARCH_TIME_MS = 10;
/** Source's hard result cap: the scan stops early once this many matches exist. */
export declare const MAX_SEARCH_RESULTS = 1000;
/** Source's starting stride, clamped to the row count. */
export declare const INITIAL_SEARCH_STRIDE = 10;
/**
 * Chooses the next chunk size from how long the last one took, aiming at {@link TARGET_SEARCH_TIME_MS}.
 *
 * Extracted from source's `tick()` so it can be tested directly. The `Math.max(elapsed, 1)` floor is
 * load-bearing and is source's: without it a chunk that measures 0ms (entirely plausible on a fast
 * machine with a small stride) makes the scalar `Infinity` and the next stride the whole table,
 * which is precisely the pathological "one long frame" case the adaptive stride exists to avoid.
 */
export declare function nextSearchStride(currentStride: number, elapsedMs: number): number;
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
export declare class IncrementalSearch {
    private readonly opts;
    private handle;
    /** Incremented on every `start`/`cancel`, so a chunk resolving late from a superseded scan can
     *  tell that it is stale and drop its results. Source has no equivalent -- it relies on
     *  `AbortController` for the consumer's fetch, which does not help when the *scan itself* is
     *  restarted while a `Promise` chunk is in flight. Typing a second character into the search box
     *  is exactly that case. */
    private generation;
    private readonly schedule;
    private readonly unschedule;
    private readonly now;
    constructor(opts: IncrementalSearchOptions);
    /** Starts scanning for `query`. An empty query is treated as "no search": the scan is cancelled
     *  and a single empty progress report is emitted, so a caller can clear its results without
     *  special-casing. */
    start(query: string): void;
    /** Stops any scan in progress. Safe to call when nothing is running. */
    cancel(): void;
    /** True while a scan is scheduled or mid-chunk. */
    get isRunning(): boolean;
}
/**
 * Formats source's result summary ("3 of 12 results", "over 1000"). Pure, and pulled out here so
 * `<GlideSearchBar>` stays a template rather than growing string logic -- and so a consumer writing
 * their own bar can reuse the exact wording.
 *
 * `selectedIndex` is 0-based, `-1` meaning "nothing navigated to yet"; the output is 1-based, as
 * source's is.
 */
export declare function formatSearchStatus(status: SearchStatus, selectedIndex: number): string;
//# sourceMappingURL=search.d.ts.map