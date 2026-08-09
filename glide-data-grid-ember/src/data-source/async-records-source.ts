// Async paged records source -- Phase 8c of the Ember port.
//
// Port of source's `packages/source/src/use-async-data-source.ts`: rows arrive a page at a time from
// an async callback as the user scrolls, unloaded rows draw as `Loading` cells, and each arrived
// page is painted by a **damage** redraw rather than a full repaint.
//
// -------------------------------------------------------------------------------------------
// WHY THIS IS A CLASS AND `recordsSource` IS A FUNCTION
// -------------------------------------------------------------------------------------------
//
// Every other decorator in this directory is a pure function over plain objects, memoized so that
// repeated calls return identical closures (`column-sort.ts`'s header explains why identity matters
// so much here). That works because they own no state: given the same inputs they can always
// reconstruct the same output.
//
// This one is irreducibly stateful -- it owns a sparse row buffer, the set of pages already
// requested, and the last visible region. Source expresses that with a pile of `React.useRef`s that
// survive re-renders. The honest Ember equivalent is an object the consumer constructs **once** and
// holds onto:
//
//     source = new AsyncRecordsSource<Person>({ ... });          // a class field, built once
//
//     <template>
//         <GlideDataGrid
//             @columns={{this.source.columns}}
//             @rows={{this.source.rows}}
//             @getCellContent={{this.source.getCellContent}}
//             @onVisibleRegionChanged={{this.source.onVisibleRegionChanged}}
//             @onCellsEdited={{this.source.onCellsEdited}}
//             @onReady={{this.source.attach}}
//         />
//     </template>
//
// Every one of those is a bound instance field, so identity stability is free and permanent -- there
// is no memo to get wrong, and no `@cached` getter to remember to write.
//
// -------------------------------------------------------------------------------------------
// REACTIVITY: this deliberately does NOT participate in autotracking
// -------------------------------------------------------------------------------------------
//
// The row buffer is a plain array of plain objects, mutated in place. Nothing here is `@tracked`, and
// `getCellContent` is a lazy lookup -- which is exactly the pattern `DATA.md` prescribes for data you
// cannot hold in memory, and exactly the opposite of `records-source.ts`'s eager projection. Repaints
// come from the imperative `updateCells()` damage path instead, which is the whole point: a page
// landing repaints those rows and nothing else. See PORTING-NOTES.md, "Autotracking -> canvas", for
// the two-pattern model this is the second half of.
//
// One consequence worth stating plainly: **do not compose this with `withColumnSort`.** Sorting needs
// to sweep every row to build its map, and by construction most rows here aren't loaded. Sort on the
// server and hand back a different ordering instead.

import {
    GridCellKind,
    type GridCell,
    type GridColumn,
    type Item,
    type Rectangle,
} from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";

/** Inclusive-exclusive row range, `[startIndex, endIndex)`. Mirrors source's `Range`. */
export type RowRange = readonly [startIndex: number, endIndex: number];

/** The subset of `GlideDataGridApi` this needs -- accepted via `attach`, straight from `@onReady`. */
export interface UpdateCellsApi {
    readonly updateCells: (cells: readonly { cell: Item }[]) => void;
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

const LOADING_CELL: GridCell = { kind: GridCellKind.Loading, allowOverlay: false };

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_CONCURRENCY = 5;

export class AsyncRecordsSource<T> {
    readonly columns: readonly GridColumn[];

    private rowCount: number;
    private readonly pageSize: number;
    private readonly maxConcurrency: number;
    private readonly freezeColumns: number;
    private readonly getRowData: (range: RowRange) => Promise<readonly T[]>;
    private readonly toCell: (record: T, col: number) => GridCell;
    private readonly onCellEdited: AsyncRecordsSourceOptions<T>["onCellEdited"];

    /** Sparse: index === row. A hole means "not loaded", which draws as a `Loading` cell. */
    private readonly buffer: (T | undefined)[] = [];
    /** Pages already requested (whether or not they have landed). Mirrors source's `loadingRef`. */
    private readonly requested = new Set<number>();
    /** Last region reported by the grid; the damage list for an arriving page is built from it. */
    private visible: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
    private api: UpdateCellsApi | undefined;
    /** In-flight page loads, so `maxConcurrency` is a real limit rather than a suggestion. */
    private inFlight = 0;
    private readonly queue: number[] = [];

    constructor(options: AsyncRecordsSourceOptions<T>) {
        this.columns = options.columns;
        this.rowCount = options.rows;
        this.pageSize = Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1);
        this.maxConcurrency = Math.max(options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY, 1);
        this.freezeColumns = Math.max(options.freezeColumns ?? 0, 0);
        this.getRowData = options.getRowData;
        this.toCell = options.toCell;
        this.onCellEdited = options.onCellEdited;
    }

    /** Current total row count -- pass to `@rows`. */
    get rows(): number {
        return this.rowCount;
    }

    /**
     * Wire to `@onReady`. Without it the source still loads pages, but arrived rows only appear when
     * something else happens to repaint -- the damage redraw is what makes them show up promptly.
     */
    readonly attach = (api: UpdateCellsApi): void => {
        this.api = api;
    };

    /** Lazy O(1) lookup. Unloaded rows draw as `Loading`, exactly as in source. */
    readonly getCellContent = ([col, row]: Item): GridCell => {
        const record = this.buffer[row];
        if (record === undefined) return LOADING_CELL;
        return this.toCell(record, col);
    };

    /**
     * Wire to `@onVisibleRegionChanged`. Requests every page overlapping the visible rows plus half a
     * page of overscan either side -- source's own `(r.y - pageSize / 2)` / `(r.y + r.height +
     * pageSize / 2)` window.
     */
    readonly onVisibleRegionChanged = (region: Rectangle): void => {
        this.visible = region;
        const firstPage = Math.max(0, Math.floor((region.y - this.pageSize / 2) / this.pageSize));
        const lastPage = Math.floor((region.y + region.height + this.pageSize / 2) / this.pageSize);
        for (let page = firstPage; page <= lastPage; page++) {
            if (page * this.pageSize >= this.rowCount) break;
            this.requestPage(page);
        }
    };

    /**
     * Wire to `@onCellsEdited`. `location` is in this source's own row space (there is no row
     * remapping here), and edits to rows that haven't loaded are dropped -- there is nothing to
     * write to, and the grid never mutates consumer data itself.
     */
    readonly onCellsEdited = (edits: readonly CellEdit[]): void => {
        if (this.onCellEdited === undefined) return;
        const damage: { cell: Item }[] = [];
        for (const { location, value } of edits) {
            const [col, row] = location;
            const record = this.buffer[row];
            if (record === undefined) continue;
            const replacement = this.onCellEdited(record, col, value);
            if (replacement !== undefined) this.buffer[row] = replacement;
            damage.push({ cell: [col, row] });
        }
        if (damage.length > 0) this.api?.updateCells(damage);
    };

    /** Replace the total row count (e.g. once the server reports the real total). */
    setRowCount(rows: number): void {
        this.rowCount = rows;
    }

    /** Returns the record at a row if it has loaded. */
    getRecord(row: number): T | undefined {
        return this.buffer[row];
    }

    /**
     * Drops every loaded row and every "already requested" mark, so the visible pages are fetched
     * again -- for when the underlying query changes (a new filter, a server-side re-sort). Repaints
     * the visible block so the stale rows immediately fall back to `Loading`.
     */
    invalidate(): void {
        this.buffer.length = 0;
        this.requested.clear();
        this.queue.length = 0;
        this.damageVisibleRows(this.visible.y, this.visible.y + this.visible.height);
        this.onVisibleRegionChanged(this.visible);
    }

    private requestPage(page: number): void {
        if (this.requested.has(page)) return;
        this.requested.add(page);
        if (this.inFlight >= this.maxConcurrency) {
            this.queue.push(page);
            return;
        }
        void this.loadPage(page);
    }

    private async loadPage(page: number): Promise<void> {
        this.inFlight++;
        const startIndex = page * this.pageSize;
        try {
            const data = await this.getRowData([startIndex, Math.min(startIndex + this.pageSize, this.rowCount)]);
            for (let i = 0; i < data.length; i++) {
                this.buffer[startIndex + i] = data[i];
            }
            this.damageVisibleRows(startIndex, startIndex + data.length);
        } catch {
            // A failed page must not be remembered as loaded, or it can never be retried. Scrolling
            // away and back re-requests it. Surfacing the error is the consumer's job -- `getRowData`
            // is theirs, and this class deliberately has no error channel of its own.
            this.requested.delete(page);
        } finally {
            this.inFlight--;
            const next = this.queue.shift();
            if (next !== undefined) void this.loadPage(next);
        }
    }

    /**
     * Damage exactly the newly-valid cells that are actually on screen. Building the list from the
     * visible column range (rather than all columns) is source's own approach, and is what keeps a
     * page landing cheap on a wide grid.
     */
    private damageVisibleRows(startRow: number, endRow: number): void {
        const api = this.api;
        if (api === undefined) return;
        const { x, width, y, height } = this.visible;
        const firstRow = Math.max(startRow, y);
        const lastRow = Math.min(endRow, y + height);
        if (lastRow <= firstRow || width <= 0) return;

        const damage: { cell: Item }[] = [];
        for (let row = firstRow; row < lastRow; row++) {
            // Frozen columns first: they are always on screen but never part of the reported region.
            for (let col = 0; col < this.freezeColumns; col++) {
                damage.push({ cell: [col, row] });
            }
            for (let col = Math.max(x, this.freezeColumns); col < x + width; col++) {
                damage.push({ cell: [col, row] });
            }
        }
        if (damage.length > 0) api.updateCells(damage);
    }
}
