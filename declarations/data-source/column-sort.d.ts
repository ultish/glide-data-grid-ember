import { type GridCell, type GridColumn, type Item } from "../rendering/data-grid-types.ts";
type GetCellContentFn = (cell: Item) => GridCell;
/** One committed edit, exactly as `<GlideDataGrid @onCellsEdited=...>` reports it. */
export interface CellEdit {
    readonly location: Item;
    readonly value: GridCell;
}
type OnCellsEditedFn = (edits: readonly CellEdit[]) => void;
/**
 * A single column's sort instruction.
 *
 * `column` is matched against the supplied `columns` by object identity first, then by `id` -- so
 * a freshly-allocated `GridColumn` still resolves as long as it carries the same `id`.
 *
 * `mode` selects the comparator: `"raw"` = `compareRaw` (plain `>`/`===`), `"smart"` =
 * `compareSmart` (numeric-aware, falls back to `localeCompare`), anything else (the default) =
 * plain `String.localeCompare`.
 */
export type ColumnSort = {
    column: GridColumn;
    mode?: "default" | "raw" | "smart";
    direction?: "asc" | "desc";
};
/** Input to {@link withColumnSort}. Mirrors source's `Props`, plus the write path (see below). */
export interface ColumnSortProps {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    readonly getCellContent: GetCellContentFn;
    /**
     * Your own edit handler, expecting `location` in **original** (unsorted) row space -- i.e. the
     * same space your `getCellContent` sees.
     *
     * Pass it here and consume {@link ColumnSortResult.onCellsEdited} instead of wiring your handler
     * to the grid directly. This decorator then owns both halves of the coordinate translation and
     * the read and write paths cannot disagree. Not in source: source's `useColumnSort` remaps only
     * the read path, which leaves every consumer to translate by hand and silently corrupts data
     * when they forget (it did exactly that in this project's own demo -- PORTING-NOTES.md, 7f).
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    readonly sort?: ColumnSort | readonly ColumnSort[];
}
/** Output of {@link withColumnSort}. Mirrors source's `Result`. */
export interface ColumnSortResult {
    /**
     * Row-remapping wrapper around the input `getCellContent`. Identity-stable across calls with
     * unchanged inputs -- pass it straight to `<GlideDataGrid @getCellContent=...>`.
     */
    readonly getCellContent: GetCellContentFn;
    /**
     * Wired-up write path: pass this to `<GlideDataGrid @onCellsEdited=...>`.
     *
     * Each edit's `location` has already been translated from *displayed* row space into the
     * **original** row space your `getCellContent` and your records array use, so the handler you
     * passed in as {@link ColumnSortProps.onCellsEdited} never has to think about the sort at all.
     * Only `location[1]` (row) is touched -- `location[0]` is already in your own column space,
     * because the grid strips the row-marker column at the callback boundary.
     *
     * `undefined` if and only if you passed no `onCellsEdited`. Identity-stable across calls with
     * unchanged inputs, like `getCellContent`.
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    /**
     * Maps a *displayed* row index back to its index in the caller's original row order.
     *
     * **Escape hatch, not the recommended path.** Prefer passing your handler in as
     * {@link ColumnSortProps.onCellsEdited} and wiring the returned
     * {@link ColumnSortResult.onCellsEdited} to the grid -- that translates every edit for you and
     * makes it structurally impossible for the read and write paths to end up in different
     * coordinate spaces. Reach for this only when you need the mapping somewhere the built-in write
     * path doesn't cover (e.g. correlating a `onSelectionChanged` row, which deliberately stays in
     * displayed space, back to a record).
     *
     * With no sort active this is the identity function, so callers can translate unconditionally
     * rather than branching on whether a sort is set.
     *
     * See `DATA.md`'s "If you add column sort, edits need a row translation" section.
     */
    readonly getOriginalIndex: (index: number) => number;
}
/**
 * Numeric-aware comparator: numeric-looking strings compare as numbers, everything else via
 * `localeCompare`. Ported verbatim from source.
 */
export declare function compareSmart(a: string | number, b: string | number): number;
/** Plain relational comparator. Ported verbatim from source. */
export declare function compareRaw(a: string | number, b: string | number): number;
/**
 * Wraps a `getCellContent` so that rows are served in sorted order.
 *
 * Port of source's `useColumnSort` hook. The result is memoized on the *structure* of the inputs,
 * so repeated calls with unchanged inputs return the identical object and the identical
 * `getCellContent` closure -- required for the render engine's scroll blit fast path (see this
 * file's header comment).
 *
 * When `sort` is undefined, or names no column present in `columns`, the caller's own
 * `getCellContent` and `onCellsEdited` references are returned unchanged and `getOriginalIndex` is
 * the identity function.
 */
export declare function withColumnSort(p: ColumnSortProps): ColumnSortResult;
export {};
//# sourceMappingURL=column-sort.d.ts.map