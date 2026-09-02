import type { Item, Rectangle } from "./data-grid-types.ts";
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
export declare function isOutsideStrictRegion(col: number, row: number, region: Rectangle, rows: number, selected: Item | undefined, freezeColumns: number): boolean;
//# sourceMappingURL=strict-region.d.ts.map