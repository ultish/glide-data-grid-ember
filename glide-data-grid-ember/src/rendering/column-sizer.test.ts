// Phase 9i tests. The whole module is measurable in bare Node because it takes a `MeasureContext`
// rather than a real canvas -- the stub below is the entire fake needed.
import { describe, expect, test } from "vitest";
import {
    applyColumnGrow,
    DEFAULT_COLUMN_WIDTH,
    measureCell,
    measureColumn,
    sizeColumns,
    type MeasureContext,
} from "./column-sizer.ts";
import {
    GridCellKind,
    type CellArray,
    type GridCell,
    type GridColumn,
    type InnerGridColumn,
} from "./data-grid-types.ts";
import type { GetCellRendererCallback } from "./cell-types.ts";
import { getDataEditorTheme, mergeAndRealizeTheme } from "./theme.ts";

const theme = mergeAndRealizeTheme(getDataEditorTheme());

/** Measures 10px per character, and records the font in effect at each call. */
function stubCtx(): MeasureContext & { readonly fontsUsed: string[] } {
    const fontsUsed: string[] = [];
    return {
        font: "13px sans-serif",
        measureText(text: string) {
            fontsUsed.push(this.font);
            return { width: text.length * 10 };
        },
        fontsUsed,
    };
}

const text = (s: string): GridCell => ({ kind: GridCellKind.Text, data: s, displayData: s, allowOverlay: true });

/** Renderer registry whose `measure` is "10px per character, plus padding". */
const renderer = ((cell: GridCell) =>
    cell.kind === GridCellKind.Text
        ? { measure: (_c: unknown, x: GridCell) => (x as { displayData: string }).displayData.length * 10 + 16 }
        : undefined) as unknown as GetCellRendererCallback;

/** Registry with no `measure` at all, to exercise the fallback. */
const noMeasureRenderer = (() => ({})) as unknown as GetCellRendererCallback;

const opts = { minColumnWidth: 50, maxColumnWidth: 500, removeOutliers: false };

describe("measureCell", () => {
    test("uses the renderer's own measure", () => {
        expect(measureCell(stubCtx(), text("abc"), theme, renderer)).toBe(46);
    });

    test("falls back when the renderer has no measure", () => {
        expect(measureCell(stubCtx(), text("abc"), theme, noMeasureRenderer)).toBe(DEFAULT_COLUMN_WIDTH);
    });

    test("falls back for a missing cell rather than throwing", () => {
        // A ragged sample row would otherwise crash the whole sizing pass.
        expect(measureCell(stubCtx(), undefined, theme, renderer)).toBe(DEFAULT_COLUMN_WIDTH);
    });
});

describe("measureColumn", () => {
    const column: GridColumn = { title: "T", width: 0 } as GridColumn;
    const sample = (values: string[]): CellArray => values.map(v => [text(v)]);

    test("takes the widest cell", () => {
        expect(measureColumn(stubCtx(), theme, column, 0, sample(["a", "abcd", "ab"]), renderer, opts)).toBe(56);
    });

    test("clamps to minColumnWidth", () => {
        expect(
            measureColumn(stubCtx(), theme, column, 0, sample(["a"]), renderer, { ...opts, minColumnWidth: 200 })
        ).toBe(200);
    });

    test("clamps to maxColumnWidth", () => {
        expect(
            measureColumn(stubCtx(), theme, column, 0, sample(["a".repeat(100)]), renderer, {
                ...opts,
                maxColumnWidth: 120,
            })
        ).toBe(120);
    });

    test("the header is measured too, so a wide title still fits", () => {
        const wide: GridColumn = { title: "a-very-wide-title", width: 0 } as GridColumn;
        // Header: 17 chars * 10 + 2 * cellHorizontalPadding. Well past the 26px the "a" cell wants.
        const result = measureColumn(stubCtx(), theme, wide, 0, sample(["a"]), renderer, opts);
        expect(result).toBe(170 + theme.cellHorizontalPadding * 2);
    });

    test("an icon adds an allowance to the header measurement", () => {
        const plain: GridColumn = { title: "title", width: 0 } as GridColumn;
        const withIcon: GridColumn = { title: "title", width: 0, icon: "headerString" } as GridColumn;
        const a = measureColumn(stubCtx(), theme, plain, 0, sample(["a"]), renderer, opts);
        const b = measureColumn(stubCtx(), theme, withIcon, 0, sample(["a"]), renderer, opts);
        expect(b - a).toBe(28);
    });

    test("restores ctx.font after measuring the header", () => {
        // Load-bearing: the caller's ctx is the live render context, so leaving the header font set
        // would silently mis-measure whatever draws next.
        const ctx = stubCtx();
        ctx.font = "sentinel-font";
        measureColumn(ctx, theme, column, 0, sample(["a"]), renderer, opts);
        expect(ctx.font).toBe("sentinel-font");
        // ...and the header really was measured in the header font, not the sentinel.
        expect(ctx.fontsUsed).toContain(theme.headerFontFull);
    });

    test("removeOutliers ignores cells more than twice the average", () => {
        // Six values so the >5 threshold is met; one is a huge outlier.
        const values = ["a", "a", "a", "a", "a", "a".repeat(40)];
        const withOutliers = measureColumn(stubCtx(), theme, column, 0, sample(values), renderer, opts);
        const without = measureColumn(stubCtx(), theme, column, 0, sample(values), renderer, {
            ...opts,
            removeOutliers: true,
        });
        expect(withOutliers).toBeGreaterThan(without);
    });

    test("removeOutliers does nothing at 5 samples or fewer", () => {
        const values = ["a", "a", "a", "a", "a".repeat(40)];
        const off = measureColumn(stubCtx(), theme, column, 0, sample(values), renderer, opts);
        const on = measureColumn(stubCtx(), theme, column, 0, sample(values), renderer, {
            ...opts,
            removeOutliers: true,
        });
        expect(on).toBe(off);
    });

    test("an empty sample still yields at least the header width", () => {
        expect(measureColumn(stubCtx(), theme, column, 0, [], renderer, opts)).toBeGreaterThanOrEqual(
            opts.minColumnWidth
        );
    });
});

describe("sizeColumns", () => {
    const sample: CellArray = [[text("a"), text("bbbbbbbbbb")]];

    test("columns that declare a width are passed through untouched", () => {
        const columns = [{ title: "A", width: 123 }] as GridColumn[];
        const out = sizeColumns(columns, stubCtx(), theme, sample, renderer, opts);
        expect(out[0]!.width).toBe(123);
    });

    test("auto columns get a measured width", () => {
        const columns = [{ title: "A" }, { title: "B" }] as unknown as GridColumn[];
        const out = sizeColumns(columns, stubCtx(), theme, sample, renderer, opts);
        // Column 1's sampled cell is far wider than column 0's, so they must differ -- the whole
        // point of measuring rather than using one flat number.
        expect(out[1]!.width).toBeGreaterThan(out[0]!.width);
    });

    test("without a context, auto columns fall back instead of measuring against nothing", () => {
        const columns = [{ title: "A" }] as unknown as GridColumn[];
        const out = sizeColumns(columns, undefined, theme, sample, renderer, opts);
        expect(out[0]!.width).toBe(DEFAULT_COLUMN_WIDTH);
    });

    test("a mixed set keeps sized columns exact and measures only the auto ones", () => {
        const columns = [{ title: "A", width: 77 }, { title: "B" }] as unknown as GridColumn[];
        const out = sizeColumns(columns, stubCtx(), theme, sample, renderer, opts);
        expect(out[0]!.width).toBe(77);
        expect(out[1]!.width).not.toBe(77);
    });

    // Phase 10a regression. Cell renderers' `measure()` calls `ctx.measureText` directly, so the
    // font must be the theme's *cell* font before any of them runs. This port shipped without that
    // line (source has it at `use-column-sizer.ts:184`) and so measured every column in whatever
    // font the previous draw had left on the live render context -- `10px sans-serif` on the first
    // pass. Nothing looked broken: columns still came out at varying, plausible, wrong widths.
    test("measures cells in the theme's cell font, not whatever the context was left in", () => {
        // Unlike the `renderer` above, this one measures through the context, exactly as every real
        // cell renderer does -- which is what makes the ambient font load-bearing.
        const ctxMeasuring = (() => ({
            measure: (c: MeasureContext, cell: GridCell) =>
                c.measureText((cell as { displayData: string }).displayData).width,
        })) as unknown as GetCellRendererCallback;

        const ctx = stubCtx();
        ctx.font = "10px sans-serif"; // what a fresh canvas context reports
        const columns = [{ title: "A" }] as unknown as GridColumn[];
        sizeColumns(columns, ctx, theme, sample, ctxMeasuring, opts);
        // First measurement is the sampled cell; it must have used the cell font.
        expect(ctx.fontsUsed[0]).toBe(theme.baseFontFull);
        // ...and the header, measured after it, must have used the header font.
        expect(ctx.fontsUsed.at(-1)).toBe(theme.headerFontFull);
    });

    test("restores the caller's font afterwards", () => {
        // The controller hands over the *live* rendering context. Leaving the measuring font behind
        // would silently mis-render the next thing drawn.
        const ctx = stubCtx();
        ctx.font = "italic 17px serif";
        const columns = [{ title: "A" }] as unknown as GridColumn[];
        sizeColumns(columns, ctx, theme, sample, renderer, opts);
        expect(ctx.font).toBe("italic 17px serif");
    });

    test("restores the font even when a renderer's measure throws", () => {
        const ctx = stubCtx();
        ctx.font = "italic 17px serif";
        const exploding = (() => ({
            measure: () => {
                throw new Error("boom");
            },
        })) as unknown as GetCellRendererCallback;
        const columns = [{ title: "A" }] as unknown as GridColumn[];
        expect(() => sizeColumns(columns, ctx, theme, sample, exploding, opts)).toThrow("boom");
        expect(ctx.font).toBe("italic 17px serif");
    });
});

// N1 (TBD.md): `GridColumn.grow` was declared, and `growOffset` read in three resize callbacks, but
// nothing ever computed it -- the field was dead. These pin the distribution pass that fixes it.
describe("applyColumnGrow", () => {
    const col = (id: string, width: number, grow?: number): InnerGridColumn =>
        ({ id, title: id, width, ...(grow === undefined ? {} : { grow }) }) as InnerGridColumn;

    test("returns the input array by identity when no column grows", () => {
        // Identity matters, not just equality: `mappedColumns` feeds `computeCanBlit`, so a fresh
        // array here would defeat the blit fast path for every grid that does not use `grow`.
        const columns = [col("a", 100), col("b", 100)];
        expect(applyColumnGrow(columns, 1000)).toBe(columns);
    });

    test("returns the input by identity when the columns already overflow", () => {
        const columns = [col("a", 600, 1), col("b", 600, 1)];
        expect(applyColumnGrow(columns, 500)).toBe(columns);
    });

    test("distributes leftover width in proportion to `grow`", () => {
        // 300 used of 600 -> 300 spare, split 1:2.
        const result = applyColumnGrow([col("a", 100, 1), col("b", 100, 2), col("c", 100)], 600);

        expect(result[0]!.width).toBe(200);
        expect(result[0]!.growOffset).toBe(100);
        expect(result[1]!.width).toBe(300);
        expect(result[1]!.growOffset).toBe(200);
        // No `grow` -> untouched, and no `growOffset` invented.
        expect(result[2]!.width).toBe(100);
        expect(result[2]!.growOffset).toBeUndefined();
    });

    test("fills the container exactly, giving the rounding remainder to the last grower", () => {
        // 100 spare split three ways does not divide evenly; source lets the last absorb the rest
        // rather than leaving a visible gap at the right edge.
        const result = applyColumnGrow([col("a", 100, 1), col("b", 100, 1), col("c", 100, 1)], 400);

        expect(result.reduce((sum, c) => sum + c.width, 0)).toBe(400);
        expect(result[2]!.growOffset).toBe(34);
    });

    test("applies to fixed-width columns too -- `grow` and `width` are orthogonal", () => {
        const result = applyColumnGrow([col("fixed", 200, 1)], 500);
        expect(result[0]!.width).toBe(500);
    });

    test("ignores non-positive `grow`", () => {
        const columns = [col("a", 100, 0), col("b", 100)];
        expect(applyColumnGrow(columns, 900)).toBe(columns);
    });
});
