import { pointInRect } from './common/math.js';

// `@strictVisibleRegion` — source's `experimental.strict` (`data-editor.tsx:1350-1372`).
//
// A correctness harness, not an optimisation: with it on, the grid refuses to ask the consumer for
// any cell outside the region it last reported through `onVisibleRegionChanged`, handing back a
// `Loading` cell instead. A paged/async source that only loads what the grid told it to load then
// *shows* its gaps as loading cells rather than quietly reading whatever its array happens to hold.
//
// Extracted from `GridHostController` for the usual reason: the inclusive-bounds arithmetic below is
// off by one on purpose (source's, reproduced), and an off-by-one here fails as "a column at the
// right edge flickers grey", which nothing but a test pins down.
/**
 * Whether `[col, row]` must be answered with a `Loading` cell instead of being read from the
 * consumer's `getCellContent`.
 *
 * `col`/`row` and `region` are all in the **consumer's own space** — the row-marker column is not
 * part of this arithmetic, and the caller must have subtracted it already. So is `freezeColumns`
 * (the arg the consumer passed, not the mangled count), because frozen columns occupy `[0,
 * freezeColumns)` in that space.
 *
 * Three escape hatches, all source's:
 *
 * - the **selected cell** stays readable wherever it is, because the selection outlives a scroll and
 *   the copy/keyboard paths read it directly;
 * - **frozen columns** are permanently on screen, so they are never outside the region even though
 *   the reported region deliberately excludes them (see `computeVisibleRegion`);
 * - the bounds are **inclusive** (`region.x + region.width`, not `- 1`), which grants one extra
 *   row and column beyond the reported block. Source is written this way and it is the safe
 *   direction to be wrong in: the last row/column of the region may be only partially visible, and
 *   its `width`/`height` are counts of *started* cells.
 *
 * `row >= rows` folds into the same test, so the two escape hatches forgive it as well. That is
 * source's structure verbatim, and it costs nothing here: the trailing blank row is answered by the
 * mangled closure before this function is ever reached.
 */
function isOutsideStrictRegion(col, row, region, rows, selected, freezeColumns) {
  const isOutsideMainArea = region.x > col || col > region.x + region.width || region.y > row || row > region.y + region.height || row >= rows;
  if (!isOutsideMainArea) return false;
  if (selected !== undefined && col === selected[0] && row === selected[1]) return false;

  // This port hardcodes `freezeTrailingRows` to 0 (as it does at every other layout site), so
  // source's three freeze regions collapse to the leading-columns one.
  if (freezeColumns > 0) {
    const freezeRegion = {
      x: 0,
      y: region.y,
      width: freezeColumns,
      height: region.height
    };
    if (pointInRect(freezeRegion, col, row)) return false;
  }
  return true;
}

export { isOutsideStrictRegion };
//# sourceMappingURL=strict-region.js.map
