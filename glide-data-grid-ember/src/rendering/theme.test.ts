// Phase 9a. Unit tests for the theme system: base themes, dark theme overlay, CSS style
// generation, and theme merging with overlay precedence. See copy-paste.test.ts for conventions
// (test contract not implementation; note surprising but faithful-to-source behavior; prefer
// tables for repeated patterns; no DOM).
//
// BOUNDARY: `bgCell` overlays are not tested here because they route into `blend`, which needs
// a DOM and is deliberately untested in this Node environment (vitest.config.ts). Other theme
// properties can be overlaid freely. See VERIFIED BOUNDARY comment in the task description.
import { describe, expect, it } from "vitest";
import {
    getDataEditorTheme,
    getDataEditorDarkTheme,
    makeCSSStyle,
    mergeAndRealizeTheme,
    type Theme,
    type FullTheme,
} from "./theme.ts";

describe("getDataEditorTheme", () => {
    it("returns the base light theme", () => {
        const theme = getDataEditorTheme();
        expect(theme).toBeDefined();
        expect(theme.accentColor).toBe("#4F5DFF");
        expect(theme.textDark).toBe("#313139");
        expect(theme.bgCell).toBe("#FFFFFF");
    });

    it("returns a full theme with all required string properties", () => {
        const theme = getDataEditorTheme();
        expect(typeof theme.accentColor).toBe("string");
        expect(typeof theme.fontFamily).toBe("string");
        expect(typeof theme.headerFontStyle).toBe("string");
        expect(typeof theme.baseFontStyle).toBe("string");
        expect(typeof theme.markerFontStyle).toBe("string");
    });

    it("returns a full theme with all required numeric properties", () => {
        const theme = getDataEditorTheme();
        expect(typeof theme.cellHorizontalPadding).toBe("number");
        expect(typeof theme.bubbleHeight).toBe("number");
        expect(typeof theme.lineHeight).toBe("number");
    });
});

describe("getDataEditorDarkTheme", () => {
    it("returns a partial theme (overlay), not a full theme", () => {
        const darkTheme = getDataEditorDarkTheme();
        expect(darkTheme).toBeDefined();
        // A partial overlay should have some fields but not all
        expect(darkTheme.textDark).toBe("#ffffff");
        expect(darkTheme.textMedium).toBe("#b8b8b8");
        // Numeric fields like cellHorizontalPadding should not be present
        expect(darkTheme.cellHorizontalPadding).toBeUndefined();
    });

    it("contains color overrides for a dark appearance", () => {
        const darkTheme = getDataEditorDarkTheme();
        // Dark theme overrides should be present but incomplete (partial overlay)
        expect(darkTheme.accentColor).toBe("#8c96ff");
        expect(darkTheme.bgHeader).toBe("#212121");
        expect(darkTheme.bgBubble).toBe("#212121");
    });

    // Note: `mergeAndRealizeTheme(base, getDataEditorDarkTheme())` is intentionally NOT tested
    // because the dark theme includes `bgCell`, which routes into `blend()` and requires a DOM.
    // This is the documented boundary at the top of this file.
});

describe("makeCSSStyle", () => {
    it("maps theme colors to --gdg-* CSS custom properties", () => {
        const theme = getDataEditorTheme();
        const css = makeCSSStyle(theme);

        expect(css["--gdg-accent-color"]).toBe(theme.accentColor);
        expect(css["--gdg-text-dark"]).toBe(theme.textDark);
        expect(css["--gdg-bg-cell"]).toBe(theme.bgCell);
    });

    it("maps numeric properties with px suffix", () => {
        const theme = getDataEditorTheme();
        const css = makeCSSStyle(theme);

        expect(css["--gdg-bubble-height"]).toBe("20px");
        expect(css["--gdg-bubble-padding"]).toBe("6px");
        expect(css["--gdg-cell-horizontal-padding"]).toBe("8px");
    });

    it("uses fallback values for optional theme fields", () => {
        const theme: Theme = {
            ...getDataEditorTheme(),
            textGroupHeader: undefined,
            bgGroupHeader: undefined,
            bgGroupHeaderHovered: undefined,
            resizeIndicatorColor: undefined,
            headerBottomBorderColor: undefined,
            roundingRadius: undefined,
        };
        const css = makeCSSStyle(theme);

        // Falls back to textHeader when textGroupHeader is undefined
        expect(css["--gdg-text-group-header"]).toBe(theme.textHeader);
        // Falls back to bgHeader when bgGroupHeader is undefined
        expect(css["--gdg-bg-group-header"]).toBe(theme.bgHeader);
        // Optional fields should not be in the output when undefined
        expect(css["--gdg-resize-indicator-color"]).toBeUndefined();
        expect(css["--gdg-rounding-radius"]).toBeUndefined();
    });

    it("includes optional fields when they are defined", () => {
        const theme: Theme = {
            ...getDataEditorTheme(),
            resizeIndicatorColor: "#ff0000",
            roundingRadius: 4,
        };
        const css = makeCSSStyle(theme);

        expect(css["--gdg-resize-indicator-color"]).toBe("#ff0000");
        expect(css["--gdg-rounding-radius"]).toBe("4px");
    });
});

describe("mergeAndRealizeTheme", () => {
    it("returns the base theme unmodified when no overlays are provided", () => {
        const base = getDataEditorTheme();
        const result = mergeAndRealizeTheme(base);

        expect(result.accentColor).toBe(base.accentColor);
        expect(result.textDark).toBe(base.textDark);
        expect(result.fontFamily).toBe(base.fontFamily);
    });

    it("produces headerFontFull, baseFontFull, and markerFontFull", () => {
        const base = getDataEditorTheme();
        const result = mergeAndRealizeTheme(base);

        expect(result.headerFontFull).toBeDefined();
        expect(result.baseFontFull).toBeDefined();
        expect(result.markerFontFull).toBeDefined();
        expect(typeof result.headerFontFull).toBe("string");
        expect(typeof result.baseFontFull).toBe("string");
        expect(typeof result.markerFontFull).toBe("string");
    });

    it("composes *FontFull fields from fontStyle and fontFamily", () => {
        const base = getDataEditorTheme();
        const result = mergeAndRealizeTheme(base);

        // The *FontFull fields should contain both the font style and the font family
        expect(result.headerFontFull).toContain(base.headerFontStyle);
        expect(result.headerFontFull).toContain(base.fontFamily);
        expect(result.baseFontFull).toContain(base.baseFontStyle);
        expect(result.baseFontFull).toContain(base.fontFamily);
        expect(result.markerFontFull).toContain(base.markerFontStyle);
        expect(result.markerFontFull).toContain(base.fontFamily);
    });

    it("skips undefined overlays entirely", () => {
        const base = getDataEditorTheme();
        const overlay: Partial<Theme> = { textDark: "#000000" };
        const result = mergeAndRealizeTheme(base, undefined, overlay, undefined);

        expect(result.textDark).toBe("#000000");
        expect(result.textMedium).toBe(base.textMedium);
    });

    it("applies overlays in order, with later ones winning", () => {
        const base = getDataEditorTheme();
        const result = mergeAndRealizeTheme(base, { textDark: "#111111" }, { textDark: "#222222" });

        expect(result.textDark).toBe("#222222");
    });

    it("allows undefined keys in overlays to fall through to base", () => {
        const base = getDataEditorTheme();
        const overlay: Partial<Theme> = { textDark: "#000000" };
        const result = mergeAndRealizeTheme(base, overlay);

        expect(result.textDark).toBe("#000000");
        expect(result.textMedium).toBe(base.textMedium);
        expect(result.bgCell).toBe(base.bgCell);
    });

    describe("*FontFull recomputation conditions", () => {
        it("recomputes headerFontFull when headerFontStyle changes", () => {
            const base = getDataEditorTheme();
            const result = mergeAndRealizeTheme(base, {
                headerFontStyle: "700 14px",
            });

            expect(result.headerFontFull).toContain("700 14px");
            expect(result.headerFontFull).toContain(base.fontFamily);
        });

        it("recomputes baseFontFull when baseFontStyle changes", () => {
            const base = getDataEditorTheme();
            const result = mergeAndRealizeTheme(base, {
                baseFontStyle: "14px",
            });

            expect(result.baseFontFull).toContain("14px");
            expect(result.baseFontFull).toContain(base.fontFamily);
        });

        it("recomputes markerFontFull when markerFontStyle changes", () => {
            const base = getDataEditorTheme();
            const result = mergeAndRealizeTheme(base, {
                markerFontStyle: "10px",
            });

            expect(result.markerFontFull).toContain("10px");
            expect(result.markerFontFull).toContain(base.fontFamily);
        });

        it("recomputes headerFontFull when fontFamily changes", () => {
            const base = getDataEditorTheme();
            const newFamily = "Courier New, monospace";
            const result = mergeAndRealizeTheme(base, {
                fontFamily: newFamily,
            });

            expect(result.headerFontFull).toContain(base.headerFontStyle);
            expect(result.headerFontFull).toContain(newFamily);
        });

        it("recomputes baseFontFull when fontFamily changes", () => {
            const base = getDataEditorTheme();
            const newFamily = "Courier New, monospace";
            const result = mergeAndRealizeTheme(base, {
                fontFamily: newFamily,
            });

            expect(result.baseFontFull).toContain(base.baseFontStyle);
            expect(result.baseFontFull).toContain(newFamily);
        });

        it("recomputes markerFontFull when fontFamily changes", () => {
            const base = getDataEditorTheme();
            const newFamily = "Courier New, monospace";
            const result = mergeAndRealizeTheme(base, {
                fontFamily: newFamily,
            });

            expect(result.markerFontFull).toContain(base.markerFontStyle);
            expect(result.markerFontFull).toContain(newFamily);
        });

        it("recomputes headerFontFull when both headerFontStyle and fontFamily change", () => {
            const base = getDataEditorTheme();
            const newStyle = "700 14px";
            const newFamily = "Courier New, monospace";
            const result = mergeAndRealizeTheme(base, {
                headerFontStyle: newStyle,
                fontFamily: newFamily,
            });

            expect(result.headerFontFull).toContain(newStyle);
            expect(result.headerFontFull).toContain(newFamily);
        });

        it("does not recompute headerFontFull if nothing relevant changed", () => {
            const base = getDataEditorTheme();
            const firstResult = mergeAndRealizeTheme(base, { textDark: "#000000" });
            const secondResult = mergeAndRealizeTheme(firstResult, { textMedium: "#111111" });

            // The second merge should not re-run the headerFontFull formula because:
            // - headerFontFull is already defined from the first merge
            // - fontFamily hasn't changed
            // - headerFontStyle hasn't changed
            // So it should be the same object or at least the same value
            expect(secondResult.headerFontFull).toBe(firstResult.headerFontFull);
        });

        it("recomputes *FontFull for each font independently", () => {
            const base = getDataEditorTheme();
            const result = mergeAndRealizeTheme(base, {
                headerFontStyle: "700 14px",
                baseFontStyle: "12px",
                markerFontStyle: "8px",
            });

            expect(result.headerFontFull).toContain("700 14px");
            expect(result.baseFontFull).toContain("12px");
            expect(result.markerFontFull).toContain("8px");
        });
    });

    describe("multiple overlays and precedence", () => {
        it("composes multiple font property changes", () => {
            const base = getDataEditorTheme();
            const overlay1 = { headerFontStyle: "700 14px" };
            const overlay2 = { baseFontStyle: "12px" };
            const result = mergeAndRealizeTheme(base, overlay1, overlay2);

            expect(result.headerFontFull).toContain("700 14px");
            expect(result.baseFontFull).toContain("12px");
            // markerFontFull should still be from base
            expect(result.markerFontFull).toContain(base.markerFontStyle);
        });

        it("handles both color and font property overlays together", () => {
            const base = getDataEditorTheme();
            const overlay = {
                textDark: "#000000",
                headerFontStyle: "700 14px",
                fontFamily: "Courier New, monospace",
            };
            const result = mergeAndRealizeTheme(base, overlay);

            expect(result.textDark).toBe("#000000");
            expect(result.headerFontFull).toContain("700 14px");
            expect(result.headerFontFull).toContain("Courier New, monospace");
        });
    });

    it("returns a FullTheme with all base properties plus *FontFull", () => {
        const base = getDataEditorTheme();
        const result: FullTheme = mergeAndRealizeTheme(base);

        // Should have all base properties
        expect(result.accentColor).toBeDefined();
        expect(result.fontFamily).toBeDefined();
        // Plus the three *FontFull fields
        expect(result.headerFontFull).toBeDefined();
        expect(result.baseFontFull).toBeDefined();
        expect(result.markerFontFull).toBeDefined();
    });
});
