import { type CellArray, type GridCell, type Item, type Rectangle } from "./data-grid-types.ts";
/**
 * Builds a `CellArray` for `rect` by calling `getCellContent` once per cell.
 *
 * `rect` is in the consumer's own coordinate space -- no row-marker column. Cells outside the data
 * (negative columns, or rows at or past `rows`) come back as `Loading` rather than being skipped, so
 * the returned array is always exactly `rect.height` x `rect.width`. Callers rely on that: a ragged
 * array would misalign every column index downstream of it.
 */
export declare function synthesizeCellsForSelection(rect: Rectangle, rows: number, getCellContent: (cell: Item) => GridCell): CellArray;
//# sourceMappingURL=cells-for-selection.d.ts.map