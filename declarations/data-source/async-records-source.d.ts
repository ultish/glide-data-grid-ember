import { type GridCell, type GridColumn, type Item, type Rectangle } from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";
/** Inclusive-exclusive row range, `[startIndex, endIndex)`. Mirrors source's `Range`. */
export type RowRange = readonly [startIndex: number, endIndex: number];
/** The subset of `GlideDataGridApi` this needs -- accepted via `attach`, straight from `@onReady`. */
export interface UpdateCellsApi {
    readonly updateCells: (cells: readonly {
        cell: Item;
    }[]) => void;
}
export interface AsyncRecordsSourceOptions<T> {
    readonly columns: readonly GridColumn[];
    /**
     * Total row count, including rows not yet loaded. The grid needs this up front to size the
     * scrollbar -- same requirement source has. Mutable via {@link AsyncRecordsSource.setRowCount}
     * for the "server told us the real total" case.
     */
    readonly rows: number;
    /** Rows per request. Clamped to >= 1, mirroring source's `Math.max(pageSize, 1)`. */
    readonly pageSize?: number;
    /** Maximum requests in flight at once. @defaultValue 5 */
    readonly maxConcurrency?: number;
    /**
     * Mirror of the grid's own `@freezeColumns`, if you use it. Needed only so that an arriving page
     * damages the frozen columns too: `onVisibleRegionChanged` deliberately reports the *scrolling*
     * block, since frozen columns are permanently visible and would otherwise make the reported rect
     * discontiguous. Leave unset if you have none.
     * @defaultValue 0
     */
    readonly freezeColumns?: number;
    /** Fetches one page. Called at most once per page unless {@link AsyncRecordsSource.invalidate}. */
    readonly getRowData: (range: RowRange) => Promise<readonly T[]>;
    /** Projects a loaded record into a cell. Unloaded rows never reach it -- they draw as `Loading`. */
    readonly toCell: (record: T, col: number) => GridCell;
    /**
     * Applies one committed edit to one loaded record. Return a *replacement* record to swap it into
     * the buffer, or nothing to keep the existing one (the usual case when mutating it in place).
     * Mirrors source's `RowEditedCallback`.
     */
    readonly onCellEdited?: (record: T, col: number, value: GridCell) => T | undefined | void;
}
export declare class AsyncRecordsSource<T> {
    readonly columns: readonly GridColumn[];
    private rowCount;
    private readonly pageSize;
    private readonly maxConcurrency;
    private readonly freezeColumns;
    private readonly getRowData;
    private readonly toCell;
    private readonly onCellEdited;
    /** Sparse: index === row. A hole means "not loaded", which draws as a `Loading` cell. */
    private readonly buffer;
    /** Pages already requested (whether or not they have landed). Mirrors source's `loadingRef`. */
    private readonly requested;
    /** Last region reported by the grid; the damage list for an arriving page is built from it. */
    private visible;
    private api;
    /** In-flight page loads, so `maxConcurrency` is a real limit rather than a suggestion. */
    private inFlight;
    private readonly queue;
    constructor(options: AsyncRecordsSourceOptions<T>);
    /** Current total row count -- pass to `@rows`. */
    get rows(): number;
    /**
     * Wire to `@onReady`. Without it the source still loads pages, but arrived rows only appear when
     * something else happens to repaint -- the damage redraw is what makes them show up promptly.
     */
    readonly attach: (api: UpdateCellsApi) => void;
    /** Lazy O(1) lookup. Unloaded rows draw as `Loading`, exactly as in source. */
    readonly getCellContent: ([col, row]: Item) => GridCell;
    /**
     * Wire to `@onVisibleRegionChanged`. Requests every page overlapping the visible rows plus half a
     * page of overscan either side -- source's own `(r.y - pageSize / 2)` / `(r.y + r.height +
     * pageSize / 2)` window.
     */
    readonly onVisibleRegionChanged: (region: Rectangle) => void;
    /**
     * Wire to `@onCellsEdited`. `location` is in this source's own row space (there is no row
     * remapping here), and edits to rows that haven't loaded are dropped -- there is nothing to
     * write to, and the grid never mutates consumer data itself.
     */
    readonly onCellsEdited: (edits: readonly CellEdit[]) => void;
    /** Replace the total row count (e.g. once the server reports the real total). */
    setRowCount(rows: number): void;
    /** Returns the record at a row if it has loaded. */
    getRecord(row: number): T | undefined;
    /**
     * Drops every loaded row and every "already requested" mark, so the visible pages are fetched
     * again -- for when the underlying query changes (a new filter, a server-side re-sort). Repaints
     * the visible block so the stale rows immediately fall back to `Loading`.
     */
    invalidate(): void;
    private requestPage;
    private loadPage;
    /**
     * Damage exactly the newly-valid cells that are actually on screen. Building the list from the
     * visible column range (rather than all columns) is source's own approach, and is what keeps a
     * page landing cheap on a wide grid.
     */
    private damageVisibleRows;
}
//# sourceMappingURL=async-records-source.d.ts.map