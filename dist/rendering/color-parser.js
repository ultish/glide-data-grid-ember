// Shamelessly stolen from https://github.com/ricokahler/color2k
// We don't need all the color functions but we deeply appreciate their work.

// Phase 1 note: the source relies on `@types/node`'s ambient `process` global (bundlers replace
// `process.env.NODE_ENV` with a string literal at build time; it is never actually read at
// runtime in a browser). This addon's tsconfig does not pull in Node types, so a minimal
// module-local shim is declared here rather than adding a `node` dependency for one dev-only check.

const cache = {};

/** `[r, g, b, a]` with `r`/`g`/`b` in 0-255 and `a` in 0-1 — the shape every consumer here expects. */

// ---------------------------------------------------------------------------
// Pure colour maths. Everything in this block is DOM-free on purpose: it is the
// only reason this module can be unit tested at all (the vitest harness runs in
// bare Node — see `vitest.config.ts`). Do not reach for `document` in here.
// ---------------------------------------------------------------------------

function clampChannel(x) {
  // Written as `!(x > 0)` rather than `x < 0` so that `NaN` and **`-0`** both collapse to a plain
  // `0`. `Math.round` of a small negative yields `-0`, which stringifies as "0" in an `rgba()`
  // literal but is not `Object.is`-equal to `0` -- an avoidable trap for anything comparing
  // parsed colours.
  if (!(x > 0)) return 0;
  return x > 255 ? 255 : x;
}
function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Linear-light sRGB -> gamma-encoded sRGB (CSS Color 4 §14.2). Negative inputs stay negative and
 * are clamped away by the caller; `Math.pow` is only reached on the strictly-positive branch.
 */
function gammaEncode(x) {
  return x <= 0.003_130_8 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/**
 * OKLab -> sRGB. `l` is 0-1, `a`/`b` are roughly -0.4..0.4, `alpha` 0-1.
 *
 * Pure; no DOM. Matrices are Björn Ottosson's, as specified in CSS Color 4 §10 — OKLab to LMS
 * (cube), LMS to linear sRGB, then gamma encode. Out-of-gamut results are **clamped** per channel
 * rather than gamut-mapped, which is what Chrome does when painting to a canvas.
 *
 * @category Drawing
 */
function oklabToRgb(l, a, b, alpha = 1) {
  const lp = l + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const mp = l - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const sp = l - 0.089_484_177_5 * a - 1.291_485_548 * b;
  const lc = lp * lp * lp;
  const mc = mp * mp * mp;
  const sc = sp * sp * sp;
  const rLinear = 4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc;
  const gLinear = -1.2684380046 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc;
  const bLinear = -0.0041960863 * lc - 0.703_418_614_7 * mc + 1.707_614_701 * sc;
  return [clampChannel(Math.round(gammaEncode(rLinear) * 255)), clampChannel(Math.round(gammaEncode(gLinear) * 255)), clampChannel(Math.round(gammaEncode(bLinear) * 255)), clamp01(alpha)];
}

/**
 * OKLCH -> sRGB. `l` is 0-1, `c` is chroma (0..~0.4), `h` is a hue **in degrees** (any value; it
 * wraps naturally through `cos`/`sin`), `alpha` 0-1. Pure; no DOM.
 *
 * @category Drawing
 */
function oklchToRgb(l, c, h, alpha = 1) {
  const radians = h * Math.PI / 180;
  return oklabToRgb(l, c * Math.cos(radians), c * Math.sin(radians), alpha);
}

/**
 * Splits `name(...)` into its component tokens, tolerating every separator CSS allows: legacy
 * commas (`rgba(1, 2, 3, 0.5)`), modern spaces (`oklch(0.7 0.15 250)`) and the alpha slash with or
 * without surrounding whitespace (`oklch(0.7 0.15 250/0.5)`). Returns `undefined` if `value` is not
 * a call to `name`.
 */
function splitColorFunction(value, name) {
  if (!value.startsWith(`${name}(`) || !value.endsWith(")")) return undefined;
  return value.slice(name.length + 1, -1).replace(/[,/]/g, " ").trim().split(/\s+/).filter(t => t.length > 0);
}

/**
 * One numeric component. `none` is 0 (CSS Color 4 treats it as a missing component, which resolves
 * to zero for every conversion we do here). A percentage is scaled by `percentReference` — 255 for
 * an sRGB channel, 1 for lightness/alpha, 0.4 for OKLab chroma/a/b (browser-confirmed: Chrome
 * computes `oklch(0.5 50% 30)` to `oklch(0.5 0.2 30)`). Returns `NaN` when unparseable.
 */
function parseComponent(token, percentReference) {
  if (token === "none") return 0;
  const n = Number.parseFloat(token);
  if (Number.isNaN(n)) return Number.NaN;
  return token.endsWith("%") ? n / 100 * percentReference : n;
}

/** A hue component: bare number or `deg`/`grad`/`rad`/`turn`, normalised to degrees. */
function parseHue(token) {
  if (token === "none") return 0;
  const n = Number.parseFloat(token);
  if (Number.isNaN(n)) return Number.NaN;
  // `grad` must be tested before `rad` — it ends with it.
  if (token.endsWith("grad")) return n * 0.9;
  if (token.endsWith("rad")) return n * 180 / Math.PI;
  if (token.endsWith("turn")) return n * 360;
  return n;
}

/**
 * Parses a resolved CSS colour *function* to RGBA. Pure; no DOM.
 *
 * Handles `rgb()`/`rgba()` (legacy and modern syntax), `oklch()` and `oklab()`. Returns
 * **`undefined`** for anything else — including `lab()`, `lch()` and `color()` — so the caller can
 * fall back rather than guess. `value` must already be lowercased and trimmed.
 *
 * @category Drawing
 */
function parseCssColorFunction(value) {
  const rgbTokens = splitColorFunction(value, "rgb") ?? splitColorFunction(value, "rgba");
  if (rgbTokens !== undefined) {
    if (rgbTokens.length < 3) return undefined;
    const r = parseComponent(rgbTokens[0], 255);
    const g = parseComponent(rgbTokens[1], 255);
    const b = parseComponent(rgbTokens[2], 255);
    const a = rgbTokens.length > 3 ? parseComponent(rgbTokens[3], 1) : 1;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return undefined;
    // NOTE: deliberately *not* clamped or rounded. `getComputedStyle` only ever hands back
    // in-range integers here, and leaving the numbers untouched keeps this path byte-identical
    // to the pre-OKLCH implementation for every input that already worked.
    return [r, g, b, a];
  }
  const oklchTokens = splitColorFunction(value, "oklch");
  if (oklchTokens !== undefined) {
    if (oklchTokens.length < 3) return undefined;
    const l = parseComponent(oklchTokens[0], 1);
    const c = parseComponent(oklchTokens[1], 0.4);
    const h = parseHue(oklchTokens[2]);
    const a = oklchTokens.length > 3 ? parseComponent(oklchTokens[3], 1) : 1;
    if (Number.isNaN(l) || Number.isNaN(c) || Number.isNaN(h) || Number.isNaN(a)) return undefined;
    // CSS clamps lightness to 0-1 and chroma at 0; browser-confirmed (`oklch(1.5 0 0)` computes
    // to `oklch(1 0 0)`). Doing it here means the maths functions stay unopinionated.
    return oklchToRgb(clamp01(l), Math.max(0, c), h, a);
  }
  const oklabTokens = splitColorFunction(value, "oklab");
  if (oklabTokens !== undefined) {
    if (oklabTokens.length < 3) return undefined;
    const l = parseComponent(oklabTokens[0], 1);
    // `a` and `b` are signed and unbounded in CSS, so only lightness is clamped.
    const a = parseComponent(oklabTokens[1], 0.4);
    const b = parseComponent(oklabTokens[2], 0.4);
    const alpha = oklabTokens.length > 3 ? parseComponent(oklabTokens[3], 1) : 1;
    if (Number.isNaN(l) || Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(alpha)) return undefined;
    return oklabToRgb(clamp01(l), a, b, alpha);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// DOM-touching wrappers. Keep these thin -- all real logic belongs above.
// ---------------------------------------------------------------------------

let div = null;
function createDiv() {
  const d = document.createElement("div");
  d.style.opacity = "0";
  d.style.pointerEvents = "none";
  d.style.position = "fixed";
  // div must be mounted for `getComputedStyle` to work
  document.body.append(d);
  return d;
}

// `undefined` = not tried yet, `null` = tried and unavailable.
let fallbackCtx;

/**
 * Last-resort resolver for colour syntaxes `parseCssColorFunction` does not special-case (`lab()`,
 * `lch()`, `color()`, ...): paint one pixel and read it back. Only ever reached for already-valid
 * colours, so a failure here means the environment has no working 2d canvas.
 *
 * Known limitation: `getImageData` un-premultiplies, so for a translucent colour the RGB it returns
 * can be off by ~1/alpha units, and at alpha 0 it is black. Both are invisible in practice and this
 * path is cached anyway.
 */
function resolveViaCanvas(color) {
  if (fallbackCtx === undefined) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      fallbackCtx = canvas.getContext("2d", {
        willReadFrequently: true
      });
    } catch {
      fallbackCtx = null;
    }
  }
  const ctx = fallbackCtx;
  if (ctx === null || ctx === undefined) return undefined;
  try {
    ctx.clearRect(0, 0, 1, 1);
    // If `color` were invalid the assignment is ignored and the previous value would leak
    // through; seeding with a sentinel makes that detectable, and callers have already
    // validated the colour anyway.
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  } catch {
    return undefined;
  }
}

/** @category Drawing */
function parseToRgba(color) {
  // normalize the color
  const normalizedColor = color.toLowerCase().trim();
  if (cache[normalizedColor] !== undefined) return cache[normalizedColor];
  div = div || createDiv();
  div.style.color = "#000";
  div.style.color = normalizedColor;
  const control = getComputedStyle(div).color;
  div.style.color = "#fff";
  div.style.color = normalizedColor;
  const computedColor = getComputedStyle(div).color;
  if (computedColor !== control) return [0, 0, 0, 1];

  // Chrome resolves `oklch()`/`oklab()`/`lab()`/`lch()`/`color()` to *themselves*, not to
  // `rgb()`, so the computed value is not necessarily an sRGB triple. DaisyUI 5's whole palette
  // is OKLCH, which is how this was found.
  const resolved = computedColor.toLowerCase();
  let result = parseCssColorFunction(resolved) ?? resolveViaCanvas(resolved);
  if (result === undefined) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Could not parse color", color);
    }
    result = [0, 0, 0, 1];
  }
  cache[normalizedColor] = result;
  return result;
}

/** @category Drawing */
function withAlpha(color, alpha) {
  const [r, g, b] = parseToRgba(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const blendResultCache = new Map();
function blendCache(color, background) {
  const cacheKey = `${color}-${background}`;
  const maybe = blendResultCache.get(cacheKey);
  if (maybe !== undefined) return maybe;
  const result = blend(color, background);
  blendResultCache.set(cacheKey, result);
  return result;
}

/** @category Drawing */
function blend(color, background) {
  if (background === undefined) return color;
  const [r, g, b, a] = parseToRgba(color);
  if (a === 1) return color;
  const [br, bg, bb, ba] = parseToRgba(background);
  const ao = a + ba * (1 - a);
  // (xaA + xaB·(1−aA))/aR
  const ro = (a * r + ba * br * (1 - a)) / ao;
  const go = (a * g + ba * bg * (1 - a)) / ao;
  const bo = (a * b + ba * bb * (1 - a)) / ao;
  return `rgba(${ro}, ${go}, ${bo}, ${ao})`;
}

/** @category Drawing */
function interpolateColors(leftColor, rightColor, val) {
  // toot toot im a GPU
  if (val <= 0) return leftColor;
  if (val >= 1) return rightColor;

  // Parse to rgba returns straight alpha colors, for interpolation we want pre-multiplied alpha
  const [lr, lg, lb, la] = parseToRgba(leftColor);
  const [rr, rg, rb, ra] = parseToRgba(rightColor);
  const leftR = lr * la;
  const leftG = lg * la;
  const leftB = lb * la;
  const rightR = rr * ra;
  const rightG = rg * ra;
  const rightB = rb * ra;
  const hScaler = val;
  const nScaler = 1 - val;
  const a = la * nScaler + ra * hScaler;
  // If both colors are fully transparent the resulting alpha can be 0, avoid dividing by 0
  if (a === 0) return "rgba(0, 0, 0, 0)";
  // now we need to divide the alpha back out to get linear alpha back for the final result
  const r = Math.floor((leftR * nScaler + rightR * hScaler) / a);
  const g = Math.floor((leftG * nScaler + rightG * hScaler) / a);
  const b = Math.floor((leftB * nScaler + rightB * hScaler) / a);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Returns a number (float) representing the luminance of a color.
 *
 * @category Drawing
 */
function getLuminance(color) {
  if (color === "transparent") return 0;
  function f(x) {
    const channel = x / 255;
    return channel <= 0.040_45 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }
  const [r, g, b] = parseToRgba(color);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export { blend, blendCache, getLuminance, interpolateColors, oklabToRgb, oklchToRgb, parseCssColorFunction, parseToRgba, withAlpha };
//# sourceMappingURL=color-parser.js.map
