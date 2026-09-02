import type { Theme } from "./theme.ts";
/** The subset of grid dimensions `scaleToRem` touches. */
export interface RemAdjustableDimensions {
    readonly rowHeight: number | ((row: number) => number);
    readonly headerHeight: number;
    readonly groupHeaderHeight: number;
    readonly theme: Partial<Theme> | undefined;
    /** Empty scrollable space past the last column / row, in px. Absent means none. */
    readonly overscrollX?: number;
    readonly overscrollY?: number;
}
/** The browser default this port, and source, scale relative to. */
export declare const BASE_REM_SIZE = 16;
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
export declare function remAdjustDimensions(dimensions: RemAdjustableDimensions, scaleToRem: boolean, remSize: number): RemAdjustableDimensions;
/**
 * The root element's font size in px, or {@link BASE_REM_SIZE} when it cannot be read (no DOM, or a
 * non-px computed value). Source's `useRemSize` equivalent, minus its observer -- see
 * `GridHostArgs.scaleToRem` for when this port re-reads it.
 */
export declare function measureRemSize(): number;
//# sourceMappingURL=rem-adjuster.d.ts.map