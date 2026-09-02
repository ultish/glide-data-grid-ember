import { isReadWriteCell } from './data-grid-types.js';
import { itemIsInRect } from './render/data-grid-lib.js';

// Phase 9h. The two pure kernels behind row reorder and drag-to-fill.
//
// Both live here rather than inline in `GridHostController` for the reason PHASES.md 9a gives for
// the whole test strategy: the grid is a canvas, so the only assertions worth writing are the ones
// that can be pushed down into plain TypeScript. These two are exactly the parts where a
// off-by-one is invisible on screen until someone's data is silently wrong.


/**
 * Which underlying row a given on-screen row should read from while a row-reorder drag is in
 * flight. Port of `data-grid-dnd.tsx`'s `getMangledCellContent` remap.
 *
 * Nothing is committed during the drag: the grid simply *reads* rows in the order they would be in
 * after the drop, so what the user sees is the result of the move they are proposing. Dropping is
 * what calls `onRowMoved`; if the consumer declines to reorder anything, the preview evaporates.
 */
function previewRowOrder(screenRow, srcRow, dropRow) {
  // The dragged row itself is shown wherever it has been dragged to.
  if (screenRow === dropRow) return srcRow;
  // Everything else closes up behind the row that left and opens up ahead of where it landed.
  let row = screenRow;
  if (row > dropRow) row -= 1;
  if (row >= srcRow) row += 1;
  return row;
}
/**
 * The edits a completed fill drag should produce. Port of source's `fillPattern` loop
 * (`data-editor.tsx:2272-2288`).
 *
 * Three rules, all of which source encodes and none of which is obvious from the feature name:
 * the pattern tiles by modulo in both axes; cells that lie *inside* the pattern are skipped (they
 * are the source, not a destination); and non-read-write cells are skipped rather than replaced.
 */
function computeFillEdits(args) {
  const {
    pattern,
    source,
    destination,
    columnCount,
    rowCount
  } = args;
  const edits = [];
  if (source.width <= 0 || source.height <= 0) return edits;
  for (let x = 0; x < destination.width; x++) {
    for (let y = 0; y < destination.height; y++) {
      const location = [destination.x + x, destination.y + y];
      if (location[0] < 0 || location[0] >= columnCount) continue;
      if (location[1] < 0 || location[1] >= rowCount) continue;
      if (itemIsInRect(location, source)) continue;
      const cell = pattern[y % source.height]?.[x % source.width];
      if (cell === undefined || !isReadWriteCell(cell)) continue;
      edits.push({
        location,
        value: {
          ...cell
        }
      });
    }
  }
  return edits;
}

export { computeFillEdits, previewRowOrder };
//# sourceMappingURL=drag-and-fill.js.map
