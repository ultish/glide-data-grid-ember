import type { GetCellRendererCallback } from "./cell-types.ts";
import type { CellArray, GridCell, GridColumn, InnerGridColumn } from "./data-grid-types.ts";
import type { FullTheme } from "./theme.ts";
/** Source's `defaultSize` -- what a cell whose renderer has no `measure` contributes. */
export declare const DEFAULT_COLUMN_WIDTH = 150;
/** Minimal slice of a 2D context this module needs. Narrower than `CanvasRenderingContext2D` so a
 *  test can supply a stub without faking a whole canvas. */
export interface MeasureContext {
    font: string;
    measureText: (text: string) => {
        readonly width: number;
    };
}
/** Width one cell wants, via its renderer's own `measure`. Renderers without one fall back. */
export declare function measureCell(ctx: MeasureContext, cell: GridCell | undefined, theme: FullTheme, getCellRenderer: GetCellRendererCallback): number;
export interface MeasureColumnOptions {
    readonly minColumnWidth: number;
    readonly maxColumnWidth: number;
    /**
     * Discard cells more than twice the sample average before taking the max.
     *
     * Ported from source, and worth keeping: without it a single long value in a sampled column
     * stretches it to `maxColumnWidth` and squashes everything else. Only applies once there are
     * more than 5 samples, since below that "outlier" is meaningless.
     */
    readonly removeOutliers: boolean;
}
/**
 * The measured width for one column, given a sample of its cells.
 *
 * `sample` is row-major and must be indexed by `colIndex` -- i.e. it is a slice of the grid, not of
 * the column. That is source's shape and it matters, because the caller fetches one rectangle
 * covering every auto column rather than one per column.
 *
 * The header is always measured too, in the header font, plus padding and whatever its affordances
 * reserve (see `headerAffordanceWidth`) -- a column whose title is wider than any of its values
 * still has to fit its own title.
 */
export declare function measureColumn(ctx: MeasureContext, theme: FullTheme, column: GridColumn, colIndex: number, sample: CellArray, getCellRenderer: GetCellRendererCallback, options: MeasureColumnOptions): number;
/**
 * Gives every column a concrete pixel width, measuring the ones that don't declare their own.
 *
 * Columns that already carry a `width` are passed through untouched -- auto-sizing is opt-in per
 * column, by omitting `width`, which is what distinguishes `AutoGridColumn` from `SizedGridColumn`.
 * When there are no auto columns at all this returns without measuring anything, so a grid that
 * never uses the feature pays nothing.
 *
 * **Sets `ctx.font` to the theme's cell font before measuring, and restores it afterwards.** That is
 * source's `ctx.font = themeRef.current.baseFontFull` (`use-column-sizer.ts:184`), and it was
 * missing from this port until Phase 10a. Cell renderers' `measure()` implementations call
 * `ctx.measureText` directly, so without it every column was measured in *whatever font the last
 * draw happened to leave on the live render context* -- the canvas default `10px sans-serif` on the
 * very first pass. The symptom is not "no auto-sizing": columns still came out at plausible,
 * varying, wrong widths, with long text clipped. Restoring the font matters here specifically
 * because the caller hands over the live rendering context, not a scratch one.
 */
export declare function sizeColumns(columns: readonly GridColumn[], ctx: MeasureContext | undefined, theme: FullTheme, sample: CellArray, getCellRenderer: GetCellRendererCallback, options: MeasureColumnOptions): InnerGridColumn[];
/**
 * Distribute the container's leftover width across columns that declare `grow` (N1 in `TBD.md`).
 *
 * Ported from `use-column-sizer.ts:218-245`. `GridColumn.grow` and `InnerGridColumn.growOffset` were
 * both ported in Phase 1 and `growOffset` is *read* in three of the controller's resize callbacks —
 * but nothing ever computed it, so the field was dead: a consumer read the addon's own exported type,
 * set `grow`, and got silence. This is the missing pass.
 *
 * Applies to **every** column, not only auto-sized ones — `grow` and `width` are orthogonal, and a
 * fixed-width column with `grow: 1` is a perfectly ordinary way to say "take the slack".
 *
 * `growOffset` is recorded separately from the widened `width` because the resize callbacks report
 * both a raw and a grow-inclusive size (`newSize` / `newSizeWithGrow`); without it the two can never
 * differ, which is what made the dead field visible in the first place.
 *
 * Returns the input array **by identity** when there is nothing to distribute, so the caller's
 * `computeCanBlit` identity checks are unaffected in the common case.
 */
export declare function applyColumnGrow(columns: readonly InnerGridColumn[], clientWidth: number): InnerGridColumn[];
//# sourceMappingURL=column-sizer.d.ts.map