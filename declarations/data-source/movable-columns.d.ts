import type { GridCell, GridColumn, Item } from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";
type GetCellContentFn = (cell: Item) => GridCell;
type OnCellsEditedFn = (edits: readonly CellEdit[]) => void;
type OnColumnMovedFn = (startIndex: number, endIndex: number) => void;
/**
 * The stable identity of a column for ordering purposes. Ported verbatim from source's `colToKey`:
 * `id` when present, otherwise `"<group>/<title>"`.
 *
 * Exported because a consumer persisting a column order needs to be able to produce the initial
 * value (`columns.map(columnOrderKey)`) and to read a saved one back.
 */
export declare function columnOrderKey(c: GridColumn): string;
/** Input to {@link withMovableColumns}. */
export interface MovableColumnsProps {
    /**
     * Your columns in their *natural* order -- the order `getCellContent`'s column index refers to.
     * This array is never reordered in place; the decorator returns a reordered copy.
     */
    readonly columns: readonly GridColumn[];
    /** Your cell reader, in natural column space. */
    readonly getCellContent: GetCellContentFn;
    /**
     * Your own edit handler, expecting `location[0]` in **natural** column space -- the same space
     * your `getCellContent` and your `columns` array use.
     *
     * Pass it here and wire {@link MovableColumnsResult.onCellsEdited} to the grid instead of wiring
     * this one directly; the decorator then owns both halves of the translation and the read and
     * write paths cannot disagree. Not in source -- see this file's header.
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    /**
     * The current display order, as {@link columnOrderKey} values. Hold this in a `@tracked` field
     * and replace it from {@link MovableColumnsProps.onOrderChange}.
     *
     * `undefined` (or an order naming no live column) means natural order. Keys naming columns that
     * no longer exist are ignored, and columns missing from the order are slotted in next to their
     * nearest left-hand neighbour that *is* in it -- source's `getSortIndexByKey` behaviour, ported,
     * so that adding a column to `columns` doesn't discard a saved order.
     */
    readonly order?: readonly string[];
    /**
     * Called with the new key order when the user finishes dragging a column. Assign it to the
     * `@tracked` field backing {@link MovableColumnsProps.order} (and persist it if you want the
     * order to survive a reload) -- nothing moves until you do, because the order is your state.
     */
    readonly onOrderChange?: (order: readonly string[]) => void;
    /**
     * Your own `@onColumnMoved`, if you have one. Called *after* `onOrderChange`, with the same
     * displayed-space indices the grid reported. Optional: the decorator supplies the reordering
     * itself, so most consumers pass nothing here.
     */
    readonly onColumnMoved?: OnColumnMovedFn;
}
/** Output of {@link withMovableColumns}. Field names match `<GlideDataGrid>`'s args, so it spreads. */
export interface MovableColumnsResult {
    /**
     * Your columns in display order. Pass to `@columns`. Identity-stable across calls with an
     * unchanged order, and *the caller's own array* when the order is the natural one.
     *
     * The entries are the very `GridColumn` objects from your input array, not copies, so a
     * `GridColumn` handed back by `@onColumnResize` is `===`-comparable against your own.
     */
    readonly columns: readonly GridColumn[];
    /** Column-remapping wrapper around your `getCellContent`. Pass to `@getCellContent`. */
    readonly getCellContent: GetCellContentFn;
    /**
     * Wired-up write path: pass to `@onCellsEdited`. Each edit's `location[0]` has already been
     * translated from *displayed* column space back into your natural column space. `location[1]`
     * (row) is untouched -- this decorator does not remap rows.
     *
     * `undefined` if and only if you passed no `onCellsEdited`.
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    /**
     * Pass to `@onColumnMoved`. This is what makes the grid's drag-to-reorder gesture do anything:
     * it computes the new key order, hands it to `onOrderChange`, then forwards to your own
     * `onColumnMoved`. Always defined -- passing it is also what enables the grid's reorder UI.
     */
    readonly onColumnMoved: OnColumnMovedFn;
    /**
     * Maps a *displayed* column index back to its index in your natural `columns` array.
     *
     * **Escape hatch, not the recommended path** -- exactly like `withColumnSort`'s
     * `getOriginalIndex`. Prefer the built-in write path above. Reach for this only where the write
     * path doesn't reach, e.g. correlating an `onSelectionChanged` column (deliberately left in
     * displayed space) back to one of your own.
     *
     * The identity function when no reordering is active, so callers can translate unconditionally.
     */
    readonly getOriginalColumnIndex: (index: number) => number;
}
/**
 * Reorders columns for display, remapping both the read and the write path so the consumer never
 * translates a column index by hand.
 *
 * Port of source's `useMoveableColumns`, with the order lifted out into consumer-owned tracked state
 * and the write path added (see this file's header for both). Memoized on the *structure* of the
 * inputs, so repeated calls with an unchanged order return the identical `columns` array and the
 * identical `getCellContent` closure -- required by the render engine's blit fast path.
 *
 * ```ts
 * @tracked columnOrder: readonly string[] | undefined = undefined;
 *
 * @cached get gridArgs() {
 *     const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
 *     return {
 *         ...src,
 *         ...withMovableColumns({
 *             ...src,
 *             order: this.columnOrder,
 *             onOrderChange: order => (this.columnOrder = order),
 *         }),
 *     };
 * }
 * ```
 */
export declare function withMovableColumns(p: MovableColumnsProps): MovableColumnsResult;
export {};
//# sourceMappingURL=movable-columns.d.ts.map