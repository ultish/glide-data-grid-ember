// Phase 9a. Unit tests for the pure half of `color-parser.ts`.
//
// WHY THIS FILE EXISTS AT ALL. `color-parser.ts` was the one module in `src/rendering/` with zero
// coverage, because `parseToRgba` resolves colours through a hidden `<div>` + `getComputedStyle`
// and this harness runs in bare Node (see `vitest.config.ts`). The OKLCH fix restructured the
// module so the maths and the CSS component-syntax parsing are pure, DOM-free, exported functions
// and the DOM part is a thin wrapper over them. That is what these tests exercise. `parseToRgba`,
// `blend`, `withAlpha`, `interpolateColors` and `getLuminance` still need a DOM and are still not
// covered here -- they belong in `test-app`'s QUnit harness (PHASES.md 9a item 4).
//
// HOW THE EXPECTED NUMBERS WERE OBTAINED -- do not "fix" them by hand. Every RGB triple below was
// read out of a real Chrome (150.0.0.0, macOS) by painting the colour into a 1x1 canvas and
// reading the pixel back:
//
//     const c = document.createElement("canvas"); c.width = c.height = 1;
//     const ctx = c.getContext("2d");
//     ctx.fillStyle = "oklch(0.7 0.15 250)"; ctx.fillRect(0, 0, 1, 1);
//     ctx.getImageData(0, 0, 1, 1).data;   // => 75, 163, 247, 255
//
// (`getComputedStyle(div).color` cannot be used for this: Chrome hands `oklch()` back unconverted,
// which is the entire bug this module now works around.) Beyond the named cases here, the
// implementation was diffed against that same canvas readback over 7,000 pseudo-random OKLCH and
// OKLab colours: ~97.5% byte-identical, worst-case deviation 1/255 on a rounding boundary. All 25
// of the named cases in this file are byte-identical.
//
// CONVENTIONS: see copy-paste.test.ts. Test the contract, not the implementation; explain in a
// comment why a non-obvious case matters; prefer tables when the assertion shape repeats.
import { describe, expect, it } from "vitest";
import { oklabToRgb, oklchToRgb, parseCssColorFunction } from "./color-parser.ts";

/** Drops alpha so RGB-only expectations read as triples. */
function rgb(result: readonly [number, number, number, number]): [number, number, number] {
    return [result[0], result[1], result[2]];
}

describe("oklchToRgb", () => {
    // Browser-verified pairs. The three primaries are the load-bearing ones: if the OKLab matrices
    // or the gamma transfer function were transcribed wrong, sRGB red/green/blue would be the first
    // thing to drift, and they would drift by a lot rather than by a rounding unit.
    it.each([
        ["achromatic black", 0, 0, 0, [0, 0, 0]],
        ["achromatic white", 1, 0, 0, [255, 255, 255]],
        ["achromatic mid grey", 0.5, 0, 0, [99, 99, 99]],
        ["sRGB red", 0.628, 0.2577, 29.23, [255, 0, 0]],
        ["sRGB green", 0.8664, 0.2948, 142.5, [0, 255, 0]],
        ["sRGB blue", 0.452, 0.3132, 264.05, [0, 0, 255]],
        ["a mid blue", 0.7, 0.15, 250, [75, 163, 247]],
        ["a dark red", 0.5, 0.2, 30, [186, 13, 1]],
        ["a vivid red", 0.65, 0.25, 26, [255, 36, 48]],
        ["a vivid green", 0.72, 0.19, 150, [32, 196, 95]],
        ["a near-white cream", 0.98, 0.02, 95, [252, 249, 234]],
        ["a dark purple", 0.25, 0.08, 300, [40, 22, 65]],
        ["a muted slate", 0.4, 0.05, 250, [51, 74, 98]],
        ["a teal", 0.6, 0.118, 184.704, [0, 150, 137]],
        ["a saturated indigo", 0.4912, 0.3096, 275.75, [74, 0, 255]],
    ])("converts %s", (_name, l, c, h, expected) => {
        expect(rgb(oklchToRgb(l, c, h))).toEqual(expected);
    });

    it("defaults alpha to 1 and passes a supplied alpha through untouched", () => {
        expect(oklchToRgb(0.7, 0.15, 250)).toEqual([75, 163, 247, 1]);
        expect(oklchToRgb(0.7, 0.15, 250, 0.5)).toEqual([75, 163, 247, 0.5]);
        // Alpha must not perturb the colour -- it is carried, not composited. A translucent fill is
        // still the same colour; `blend` is what composites it.
        expect(rgb(oklchToRgb(0.7, 0.15, 250, 0))).toEqual([75, 163, 247]);
    });

    it("clamps alpha into 0-1", () => {
        expect(oklchToRgb(0.5, 0, 0, 5)[3]).toBe(1);
        expect(oklchToRgb(0.5, 0, 0, -2)[3]).toBe(0);
        expect(oklchToRgb(0.5, 0, 0, Number.NaN)[3]).toBe(0);
    });

    it("treats hue as an angle that wraps", () => {
        // 250deg, -110deg and 610deg are the same hue. This falls out of cos/sin, but it is worth
        // pinning: CSS explicitly allows out-of-range hues, and a naive `% 360` guard written later
        // would break negative hues.
        const reference = oklchToRgb(0.7, 0.15, 250);
        expect(oklchToRgb(0.7, 0.15, -110)).toEqual(reference);
        expect(oklchToRgb(0.7, 0.15, 610)).toEqual(reference);
    });

    it("clamps out-of-gamut results into 0-255 instead of overflowing", () => {
        // `oklch(0.9 0.4 140)` is far outside sRGB: the linear-light green channel comes out well
        // above 1 and red/blue come out negative. Unclamped this produced negative and >255
        // components, which `withAlpha`/`blend` would then emit into an `rgba()` string. Chrome
        // clips the same way when painting (browser-verified: 0,255,0).
        expect(rgb(oklchToRgb(0.9, 0.4, 140))).toEqual([0, 255, 0]);

        for (const [l, c, h] of [
            [0.9, 0.4, 140],
            [0.5, 0.4, 0],
            [0.2, 0.37, 300],
            [1, 0.4, 200],
            [0, 0.4, 90],
        ]) {
            for (const channel of rgb(oklchToRgb(l as number, c as number, h as number))) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(255);
                expect(Number.isInteger(channel)).toBe(true);
            }
        }
    });

    it("keeps a zero-lightness colour dark rather than producing garbage", () => {
        // L=0 with non-zero chroma is legal CSS and is what `none` for lightness resolves to. The
        // result is nearly black but not exactly black, and Chrome agrees: 3,0,27.
        expect(rgb(oklchToRgb(0, 0.15, 250))).toEqual([3, 0, 27]);
    });
});

describe("oklabToRgb", () => {
    it.each([
        ["a light purple", 0.7, 0.1, -0.1, [191, 129, 218]],
        ["a mid green", 0.5, -0.1, 0.05, [32, 117, 68]],
        ["a mid purple", 0.5, 0.1, -0.1, [129, 69, 154]],
        ["black", 0, 0, 0, [0, 0, 0]],
        ["white", 1, 0, 0, [255, 255, 255]],
    ])("converts %s", (_name, l, a, b, expected) => {
        expect(rgb(oklabToRgb(l, a, b))).toEqual(expected);
    });

    it("agrees with oklchToRgb for the equivalent polar coordinates", () => {
        // oklch(L C H) is oklab(L, C*cos(H), C*sin(H)). Stating it as a property rather than a
        // second table keeps the two functions from drifting apart.
        const c = 0.15;
        for (const h of [0, 30, 90, 137, 180, 250, 359]) {
            const radians = (h * Math.PI) / 180;
            expect(oklchToRgb(0.6, c, h)).toEqual(oklabToRgb(0.6, c * Math.cos(radians), c * Math.sin(radians)));
        }
    });
});

describe("parseCssColorFunction: rgb / rgba", () => {
    // This is the path that already worked before OKLCH support existed. These tests exist to pin
    // that it still behaves identically -- `blend`, `withAlpha`, `interpolateColors` and
    // `getLuminance` all sit on top of it, and every theme colour in this addon is a hex string
    // that Chrome resolves to `rgb(...)`.
    it.each([
        ["rgb(0, 0, 0)", [0, 0, 0, 1]],
        ["rgb(79, 93, 255)", [79, 93, 255, 1]],
        ["rgb(255, 255, 255)", [255, 255, 255, 1]],
        ["rgba(255, 0, 0, 0.5)", [255, 0, 0, 0.5]],
        ["rgba(0, 0, 0, 0)", [0, 0, 0, 0]],
    ])("parses the legacy comma form %s", (input, expected) => {
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it.each([
        ["rgb(255 0 0)", [255, 0, 0, 1]],
        ["rgb(255 0 0 / 0.5)", [255, 0, 0, 0.5]],
        ["rgb(255 0 0/0.5)", [255, 0, 0, 0.5]],
        ["rgb(255 0 0 / 50%)", [255, 0, 0, 0.5]],
        // 127.5, not 128: the rgb path deliberately does no rounding or clamping, because it must
        // stay byte-identical to the pre-OKLCH implementation for every value `getComputedStyle`
        // actually produces (always in-range integers). Chrome would say 128 here. Recorded rather
        // than "fixed" -- rounding this path would be a behaviour change for no benefit.
        ["rgb(100% 0% 50%)", [255, 0, 127.5, 1]],
    ])("parses the modern space-separated form %s", (input, expected) => {
        // Chrome currently serialises computed colours in the legacy form, so nothing in this addon
        // reaches these today. They are covered because the old regex mangled them in exactly the
        // same way it mangled `oklch()` -- stripping the spaces and yielding one number -- and this
        // is the cheapest guard against that class coming back.
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it("defaults a missing alpha to 1", () => {
        expect(parseCssColorFunction("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    });

    it("returns undefined rather than a partial result when components are missing", () => {
        expect(parseCssColorFunction("rgb(1, 2)")).toBeUndefined();
        expect(parseCssColorFunction("rgb()")).toBeUndefined();
    });
});

describe("parseCssColorFunction: oklch / oklab", () => {
    it("parses the plain three-component form", () => {
        // THE REGRESSION THIS MODULE EXISTS FOR. The previous implementation ran
        // `.replace(/[^\d.,]/g, "").split(",")` over the computed value, so `oklch(0.7 0.15 250)`
        // collapsed to the single string "0.70.15250" -> [0.70152500] -- one nonsense number where
        // four components were expected, silently, with no warning. DaisyUI 5's entire palette is
        // OKLCH, so every themed colour would have been garbage.
        expect(parseCssColorFunction("oklch(0.7 0.15 250)")).toEqual([75, 163, 247, 1]);
    });

    it.each([
        ["oklch(0.7 0.15 250 / 0.5)", [75, 163, 247, 0.5]],
        ["oklch(0.7 0.15 250/0.5)", [75, 163, 247, 0.5]],
        ["oklch(0.7 0.15 250 / 50%)", [75, 163, 247, 0.5]],
        ["oklch(0.7 0.15 250 / 0)", [75, 163, 247, 0]],
    ])("parses the optional slash-alpha in %s", (input, expected) => {
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it.each([
        // Percentage references differ per component and are not guessable: lightness and alpha are
        // out of 1, but chroma (and OKLab's a/b) are out of 0.4. Browser-verified -- Chrome computes
        // `oklch(0.5 50% 30)` to `oklch(0.5 0.2 30)` and `oklab(0.5 25% -25%)` to
        // `oklab(0.5 0.1 -0.1)`.
        ["oklch(70% 0.15 250)", [75, 163, 247, 1]],
        ["oklch(0.5 50% 30)", [186, 13, 1, 1]],
        ["oklab(0.5 25% -25%)", [129, 69, 154, 1]],
    ])("scales percentages per component in %s", (input, expected) => {
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it.each([
        ["oklch(0.7 0.15 250deg)", [75, 163, 247, 1]],
        ["oklch(0.2 0.05 0.5turn)", [0, 29, 23, 1]],
        ["oklch(0.3 0.1 1.5rad)", [68, 39, 0, 1]],
        ["oklch(0.3 0.1 200grad)", [0, 60, 48, 1]],
    ])("accepts every CSS angle unit in %s", (input, expected) => {
        // `grad` is the trap here: it ends with "rad", so a naive suffix check converts 200grad as
        // 200 radians. Chrome computes both `0.5turn` and `200grad` to exactly 180deg.
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it.each([
        ["oklch(0.7 0.15 none)", [231, 114, 155, 1]],
        ["oklch(none 0.15 250)", [3, 0, 27, 1]],
        // Zero chroma is achromatic: a grey at that lightness, hue irrelevant.
        ["oklch(0.7 none 250)", [158, 158, 158, 1]],
        ["oklch(0.7 0.15 250 / none)", [75, 163, 247, 0]],
        ["oklab(none none none)", [0, 0, 0, 1]],
    ])("treats `none` as a zero component in %s", (input, expected) => {
        // CSS Color 4 calls these "missing components"; for the conversions done here they resolve
        // to zero. All browser-verified except the alpha case, which canvas readback cannot check
        // (a fully transparent pixel loses its colour).
        expect(parseCssColorFunction(input)).toEqual(expected);
    });

    it("clamps lightness to 0-1 and chroma at zero, as CSS does", () => {
        // Browser-verified: Chrome computes `oklch(1.5 0 0)` to `oklch(1 0 0)` and
        // `oklch(-0.5 0 0)` to `oklch(0 0 0)`.
        expect(parseCssColorFunction("oklch(1.5 0 0)")).toEqual([255, 255, 255, 1]);
        expect(parseCssColorFunction("oklch(-0.5 0 0)")).toEqual([0, 0, 0, 1]);
        expect(parseCssColorFunction("oklch(0.5 -1 30)")).toEqual(parseCssColorFunction("oklch(0.5 0 30)"));
    });

    it("does not clamp OKLab's a and b, which are legitimately signed", () => {
        expect(parseCssColorFunction("oklab(0.5 -0.1 0.05)")).toEqual([32, 117, 68, 1]);
    });

    it("returns undefined rather than a partial result when components are missing", () => {
        expect(parseCssColorFunction("oklch(0.7 0.15)")).toBeUndefined();
        expect(parseCssColorFunction("oklab(0.5)")).toBeUndefined();
    });
});

describe("parseCssColorFunction: unhandled syntaxes", () => {
    it.each([
        // Chrome resolves these to *themselves*, exactly as it does OKLCH, so they can genuinely
        // reach this function. Returning undefined is the contract: it routes the caller to the
        // canvas fallback in `parseToRgba` instead of producing a plausible-looking wrong colour,
        // which is the failure mode this whole change is eliminating.
        "lab(50 40 59.5)",
        "lch(50 70 40)",
        "color(display-p3 1 0 0)",
        "color(srgb 1 0 0)",
        // These never appear as computed values, but the contract is the same.
        "hsl(120, 50%, 50%)",
        "#4f5dff",
        "red",
        "transparent",
        "",
        "notacolor",
    ])("returns undefined for %s", input => {
        expect(parseCssColorFunction(input)).toBeUndefined();
    });

    it("does not mistake a prefix for a function call", () => {
        // `oklch` is a prefix of nothing here, but `rgb` is a prefix of `rgba` and both are
        // accepted; the guard that matters is that a name is only matched with its opening paren.
        expect(parseCssColorFunction("oklchish(0.5 0 0)")).toBeUndefined();
        expect(parseCssColorFunction("oklch 0.5 0 0")).toBeUndefined();
        expect(parseCssColorFunction("oklch(0.5 0 0")).toBeUndefined();
    });
});
