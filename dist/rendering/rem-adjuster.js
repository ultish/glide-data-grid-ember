import { getDataEditorTheme } from './theme.js';

// `scaleToRem` -- scaling the grid's own dimensions with the root font size (Phase 9g).
//
// Verbatim port of the rules in `packages/core/src/data-editor/use-rem-adjuster.ts`, minus the React
// hook shell: source's `useRemAdjuster` is a `useMemo` over exactly this computation, so the
// de-hooking is "drop the memo, return the value, let the caller cache it". `GridHostController`
// does cache it, and has to -- the returned `theme` object is identity-compared downstream
// (`mergedThemeCache`, and `computeCanBlit` beyond it), so recomputing it per draw would silently
// disable the scroll blit fast path. That is the same trap PORTING-NOTES.md's Phase 6 section
// records three instances of.
//
// `overscrollX`/`overscrollY` are scaled here too, exactly as source does -- they are pixel
// dimensions like the heights above, so a grid that scales with the root font size has to scale its
// trailing empty space with it or the proportion drifts.


/** The subset of grid dimensions `scaleToRem` touches. */

/** The browser default this port, and source, scale relative to. */
const BASE_REM_SIZE = 16;

/**
 * Scales row/header heights and the three theme values that must track them, or returns the inputs
 * untouched when scaling is off or unnecessary.
 *
 * **Returns its argument by identity in the no-op case** (`scaleToRem === false`, or a root font
 * size of exactly 16px). That is load-bearing rather than tidy: it is what keeps a grid that never
 * opts in byte-identical to its pre-9g behaviour, including the identity of the `theme` object.
 *
 * Only `headerIconSize`, `cellHorizontalPadding` and `cellVerticalPadding` are scaled -- source
 * scales exactly these three and leaves font sizes to the browser, since a `rem`-sized font already
 * follows the root size on its own.
 */
function remAdjustDimensions(dimensions, scaleToRem, remSize) {
  if (!scaleToRem || remSize === BASE_REM_SIZE) return dimensions;
  const scaler = remSize / BASE_REM_SIZE;
  const {
    rowHeight,
    headerHeight,
    groupHeaderHeight,
    theme,
    overscrollX,
    overscrollY
  } = dimensions;
  const base = getDataEditorTheme();
  return {
    // Source scales these unconditionally, turning an absent value into `0`
    // (`use-rem-adjuster.ts`, `Math.ceil((overscrollXIn ?? 0) * scaler)`). Kept as `undefined`
    // here when it was absent, so "no overscroll" stays distinguishable from "0px of it" and the
    // scroll-extent code has one thing to test rather than two.
    overscrollX: overscrollX === undefined ? undefined : Math.ceil(overscrollX * scaler),
    overscrollY: overscrollY === undefined ? undefined : Math.ceil(overscrollY * scaler),
    rowHeight: typeof rowHeight === "number" ? rowHeight * scaler : row => Math.ceil(rowHeight(row) * scaler),
    headerHeight: Math.ceil(headerHeight * scaler),
    groupHeaderHeight: Math.ceil(groupHeaderHeight * scaler),
    theme: {
      ...theme,
      headerIconSize: (theme?.headerIconSize ?? base.headerIconSize) * scaler,
      cellHorizontalPadding: (theme?.cellHorizontalPadding ?? base.cellHorizontalPadding) * scaler,
      cellVerticalPadding: (theme?.cellVerticalPadding ?? base.cellVerticalPadding) * scaler
    }
  };
}

/**
 * The root element's font size in px, or {@link BASE_REM_SIZE} when it cannot be read (no DOM, or a
 * non-px computed value). Source's `useRemSize` equivalent, minus its observer -- see
 * `GridHostArgs.scaleToRem` for when this port re-reads it.
 */
function measureRemSize() {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return BASE_REM_SIZE;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : BASE_REM_SIZE;
}

export { BASE_REM_SIZE, measureRemSize, remAdjustDimensions };
//# sourceMappingURL=rem-adjuster.js.map
