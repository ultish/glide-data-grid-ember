// Phase 9i. Real column auto-sizing: measuring an `AutoGridColumn`'s content instead of giving it a
// flat fallback width. Ported from `packages/core/src/data-editor/use-column-sizer.ts`'s
// `measureCell`/`measureColumn`, with the React hook left behind -- the controller owns the caching
// and the sampling, exactly as it does for search.
//
// Framework-agnostic and DOM-free apart from the `ctx` it is handed, which is why it lives here and
// can be unit-tested against a stub context in bare Node.
import type { GetCellRendererCallback } from "./cell-types.ts";
import type { CellArray, GridCell, GridColumn, InnerGridColumn } from "./data-grid-types.ts";
import type { FullTheme } from "./theme.ts";

/** Source's `defaultSize` -- what a cell whose renderer has no `measure` contributes. */
export const DEFAULT_COLUMN_WIDTH = 150;

/** Minimal slice of a 2D context this module needs. Narrower than `CanvasRenderingContext2D` so a
 *  test can supply a stub without faking a whole canvas. */
export interface MeasureContext {
    font: string;
    measureText: (text: string) => { readonly width: number };
}

/** Width one cell wants, via its renderer's own `measure`. Renderers without one fall back. */
export function measureCell(
    ctx: MeasureContext,
    cell: GridCell | undefined,
    theme: FullTheme,
    getCellRenderer: GetCellRendererCallback
): number {
    if (cell === undefined) return DEFAULT_COLUMN_WIDTH;
    const renderer = getCellRenderer(cell);
    return renderer?.measure?.(ctx as unknown as CanvasRenderingContext2D, cell as never, theme) ?? DEFAULT_COLUMN_WIDTH;
}

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
 * The header is always measured too, in the header font, plus padding and an icon allowance -- a
 * column whose title is wider than any of its values still has to fit its own title.
 */
export function measureColumn(
    ctx: MeasureContext,
    theme: FullTheme,
    column: GridColumn,
    colIndex: number,
    sample: CellArray,
    getCellRenderer: GetCellRendererCallback,
    options: MeasureColumnOptions
): number {
    let max = 0;
    const sizes = sample.map(row => {
        const size = measureCell(ctx, row[colIndex], theme, getCellRenderer);
        max = Math.max(max, size);
        return size;
    });

    if (sizes.length > 5 && options.removeOutliers) {
        const average = sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
        max = 0;
        for (const size of sizes) {
            if (size < average * 2) max = Math.max(max, size);
        }
    }

    // Header measurement. `ctx.font` is saved and restored because the caller's context is the live
    // render context -- leaving the header font set would silently mis-measure the next caller.
    const previousFont = ctx.font;
    ctx.font = theme.headerFontFull;
    const iconAllowance = column.icon === undefined ? 0 : 28;
    max = Math.max(max, ctx.measureText(column.title).width + theme.cellHorizontalPadding * 2 + iconAllowance);
    ctx.font = previousFont;

    return Math.max(Math.ceil(options.minColumnWidth), Math.min(Math.floor(options.maxColumnWidth), Math.ceil(max)));
}

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
export function sizeColumns(
    columns: readonly GridColumn[],
    ctx: MeasureContext | undefined,
    theme: FullTheme,
    sample: CellArray,
    getCellRenderer: GetCellRendererCallback,
    options: MeasureColumnOptions
): InnerGridColumn[] {
    const previousFont = ctx?.font;
    if (ctx !== undefined) ctx.font = theme.baseFontFull;
    try {
        return columns.map((c, i) => {
            if ("width" in c && typeof c.width === "number") return c as InnerGridColumn;
            // No context available yet (the canvas hasn't been created): fall back rather than
            // measuring against nothing. The controller re-measures once it can.
            if (ctx === undefined) return { ...c, width: DEFAULT_COLUMN_WIDTH } as InnerGridColumn;
            return { ...c, width: measureColumn(ctx, theme, c, i, sample, getCellRenderer, options) } as InnerGridColumn;
        });
    } finally {
        if (ctx !== undefined && previousFont !== undefined) ctx.font = previousFont;
    }
}
