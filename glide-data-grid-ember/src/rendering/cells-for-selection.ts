// Phase 9. The pure half of `getCellsForSelection` support: synthesising a rectangle of cells from
// a plain `getCellContent`. Ported from the `getCellsForSelectionIn === true` branch of source's
// `data-editor/use-cells-for-selection.ts`.
//
// Lives here rather than in `-private/grid-host-controller.ts` for the usual reason in this port:
// it is framework-agnostic logic with no DOM, no canvas and no Ember, so it belongs in
// `src/rendering/` where it can be unit-tested in bare Node. The controller keeps only the part
// that genuinely needs it -- deciding between this and a consumer-supplied callback, and holding
// the `AbortSignal`.
import { GridCellKind, type CellArray, type GridCell, type Item, type Rectangle } from "./data-grid-types.ts";

/**
 * Builds a `CellArray` for `rect` by calling `getCellContent` once per cell.
 *
 * `rect` is in the consumer's own coordinate space -- no row-marker column. Cells outside the data
 * (negative columns, or rows at or past `rows`) come back as `Loading` rather than being skipped, so
 * the returned array is always exactly `rect.height` x `rect.width`. Callers rely on that: a ragged
 * array would misalign every column index downstream of it.
 */
export function synthesizeCellsForSelection(
    rect: Rectangle,
    rows: number,
    getCellContent: (cell: Item) => GridCell
): CellArray {
    const out: GridCell[][] = [];
    for (let y = rect.y; y < rect.y + rect.height; y++) {
        const row: GridCell[] = [];
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            row.push(x < 0 || y >= rows ? { kind: GridCellKind.Loading, allowOverlay: false } : getCellContent([x, y]));
        }
        out.push(row);
    }
    return out;
}
