import type { GridCell, Item, Rectangle } from "./data-grid-types.ts";
/**
 * Which underlying row a given on-screen row should read from while a row-reorder drag is in
 * flight. Port of `data-grid-dnd.tsx`'s `getMangledCellContent` remap.
 *
 * Nothing is committed during the drag: the grid simply *reads* rows in the order they would be in
 * after the drop, so what the user sees is the result of the move they are proposing. Dropping is
 * what calls `onRowMoved`; if the consumer declines to reorder anything, the preview evaporates.
 */
export declare function previewRowOrder(screenRow: number, srcRow: number, dropRow: number): number;
export interface FillEditsArgs {
    /** Cells of `source`, row-major, as returned by `getCellsForSelection`. */
    readonly pattern: readonly (readonly GridCell[])[];
    /** The rectangle the pattern was read from. Consumer column space. */
    readonly source: Rectangle;
    /** The rectangle to fill, which *includes* `source`. Consumer column space. */
    readonly destination: Rectangle;
    /** Grid bounds, so a fill dragged past the end writes nothing out of range. */
    readonly columnCount: number;
    readonly rowCount: number;
}
/**
 * The edits a completed fill drag should produce. Port of source's `fillPattern` loop
 * (`data-editor.tsx:2272-2288`).
 *
 * Three rules, all of which source encodes and none of which is obvious from the feature name:
 * the pattern tiles by modulo in both axes; cells that lie *inside* the pattern are skipped (they
 * are the source, not a destination); and non-read-write cells are skipped rather than replaced.
 */
export declare function computeFillEdits(args: FillEditsArgs): {
    location: Item;
    value: GridCell;
}[];
//# sourceMappingURL=drag-and-fill.d.ts.map