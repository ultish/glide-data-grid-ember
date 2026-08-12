// Phase 9g. Tests for `remAdjustDimensions` — the `scaleToRem` scaling rules.
//
// The assertion that matters most here is the *identity* one: the no-op path must return its
// argument object, not an equal copy. `GridHostController` feeds the returned `theme` into
// `mergedThemeCache`, which is identity-keyed, and `computeCanBlit` compares the realized theme by
// identity beyond that — so an equal-but-fresh object in the untouched case would silently disable
// the scroll blit fast path for every grid in the addon, scaling or not. That is precisely the
// defect class PORTING-NOTES.md's Phase 6 section records, and it has no visible symptom.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { remAdjustDimensions, BASE_REM_SIZE, type RemAdjustableDimensions } from "./rem-adjuster.ts";
import { getDataEditorTheme } from "./theme.ts";

const base: RemAdjustableDimensions = {
    rowHeight: 34,
    headerHeight: 36,
    groupHeaderHeight: 36,
    theme: undefined,
};

describe("remAdjustDimensions", () => {
    it("returns the very same object when scaling is off", () => {
        expect(remAdjustDimensions(base, false, 20)).toBe(base);
    });

    it("returns the very same object at the base rem size, even with scaling on", () => {
        expect(remAdjustDimensions(base, true, BASE_REM_SIZE)).toBe(base);
    });

    it("scales a numeric row height and ceils the header heights", () => {
        const result = remAdjustDimensions(base, true, 20); // scaler 1.25
        expect(result.rowHeight).toBe(42.5);
        expect(result.headerHeight).toBe(45);
        expect(result.groupHeaderHeight).toBe(45);
    });

    it("scales a row-height function per row, ceiling each result", () => {
        const dims: RemAdjustableDimensions = { ...base, rowHeight: (row: number) => 30 + row };
        const scaled = remAdjustDimensions(dims, true, 24).rowHeight; // scaler 1.5
        expect(typeof scaled).toBe("function");
        expect((scaled as (row: number) => number)(0)).toBe(45);
        expect((scaled as (row: number) => number)(1)).toBe(47); // ceil(31 * 1.5) === 47
    });

    it("scales the three theme values that must track the heights, off the base theme by default", () => {
        const theme = getDataEditorTheme();
        const result = remAdjustDimensions(base, true, 32); // scaler 2
        expect(result.theme?.headerIconSize).toBe(theme.headerIconSize * 2);
        expect(result.theme?.cellHorizontalPadding).toBe(theme.cellHorizontalPadding * 2);
        expect(result.theme?.cellVerticalPadding).toBe(theme.cellVerticalPadding * 2);
    });

    it("scales a consumer's own overrides rather than the base values", () => {
        const dims: RemAdjustableDimensions = { ...base, theme: { cellHorizontalPadding: 10 } };
        expect(remAdjustDimensions(dims, true, 32).theme?.cellHorizontalPadding).toBe(20);
    });

    it("carries the rest of a consumer's theme overlay through untouched", () => {
        const dims: RemAdjustableDimensions = { ...base, theme: { accentColor: "#ff0000" } };
        expect(remAdjustDimensions(dims, true, 32).theme?.accentColor).toBe("#ff0000");
    });

    it("scales down as well as up", () => {
        expect(remAdjustDimensions(base, true, 8).rowHeight).toBe(17);
    });
});

describe("remAdjustDimensions — overscroll (4.5)", () => {
    const base = { rowHeight: 34, headerHeight: 36, groupHeaderHeight: 36, theme: undefined };

    it("scales overscroll alongside the heights", () => {
        const out = remAdjustDimensions({ ...base, overscrollX: 100, overscrollY: 50 }, true, 20);
        // 20/16 = 1.25, and source ceils each one.
        expect(out.overscrollX).toBe(125);
        expect(out.overscrollY).toBe(63);
    });

    it("keeps `undefined` distinguishable from zero", () => {
        // Source turns an absent value into `0` here; this port keeps it absent so the scroll-extent
        // code has one case to test rather than two. Either way nothing is added.
        const out = remAdjustDimensions({ ...base, overscrollY: 40 }, true, 20);
        expect(out.overscrollX).toBeUndefined();
        expect(out.overscrollY).toBe(50);
    });

    it("returns the input untouched when scaling is off", () => {
        const input = { ...base, overscrollX: 100, overscrollY: 50 };
        expect(remAdjustDimensions(input, false, 20)).toBe(input);
        expect(remAdjustDimensions(input, true, 16)).toBe(input);
    });
});
