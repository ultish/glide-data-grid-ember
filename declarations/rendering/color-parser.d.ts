/** `[r, g, b, a]` with `r`/`g`/`b` in 0-255 and `a` in 0-1 — the shape every consumer here expects. */
export type Rgba = readonly [number, number, number, number];
/**
 * OKLab -> sRGB. `l` is 0-1, `a`/`b` are roughly -0.4..0.4, `alpha` 0-1.
 *
 * Pure; no DOM. Matrices are Björn Ottosson's, as specified in CSS Color 4 §10 — OKLab to LMS
 * (cube), LMS to linear sRGB, then gamma encode. Out-of-gamut results are **clamped** per channel
 * rather than gamut-mapped, which is what Chrome does when painting to a canvas.
 *
 * @category Drawing
 */
export declare function oklabToRgb(l: number, a: number, b: number, alpha?: number): Rgba;
/**
 * OKLCH -> sRGB. `l` is 0-1, `c` is chroma (0..~0.4), `h` is a hue **in degrees** (any value; it
 * wraps naturally through `cos`/`sin`), `alpha` 0-1. Pure; no DOM.
 *
 * @category Drawing
 */
export declare function oklchToRgb(l: number, c: number, h: number, alpha?: number): Rgba;
/**
 * Parses a resolved CSS colour *function* to RGBA. Pure; no DOM.
 *
 * Handles `rgb()`/`rgba()` (legacy and modern syntax), `oklch()` and `oklab()`. Returns
 * **`undefined`** for anything else — including `lab()`, `lch()` and `color()` — so the caller can
 * fall back rather than guess. `value` must already be lowercased and trimmed.
 *
 * @category Drawing
 */
export declare function parseCssColorFunction(value: string): Rgba | undefined;
/** @category Drawing */
export declare function parseToRgba(color: string): readonly [number, number, number, number];
/** @category Drawing */
export declare function withAlpha(color: string, alpha: number): string;
export declare function blendCache(color: string, background: string | undefined): string;
/** @category Drawing */
export declare function blend(color: string, background: string | undefined): string;
/** @category Drawing */
export declare function interpolateColors(leftColor: string, rightColor: string, val: number): string;
/**
 * Returns a number (float) representing the luminance of a color.
 *
 * @category Drawing
 */
export declare function getLuminance(color: string): number;
//# sourceMappingURL=color-parser.d.ts.map