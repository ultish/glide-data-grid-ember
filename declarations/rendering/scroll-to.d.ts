import type { Rectangle } from "./data-grid-types.ts";
/** `"start"` puts the target against the leading edge, `"end"` against the trailing one, `"center"`
 *  in the middle. Omitted means "scroll the minimum distance that makes it visible". */
export type ScrollAlign = "start" | "center" | "end";
/** Which axes may move. Source's `dir` parameter. */
export type ScrollDirection = "horizontal" | "vertical" | "both";
export interface ScrollToViewport {
    /** The target's rect, root-relative, as `computeBounds` returns it. */
    readonly target: Rectangle;
    /** Grid width in CSS pixels (the drawable area, excluding any native scrollbar). */
    readonly width: number;
    /** Grid height in CSS pixels. */
    readonly height: number;
    /** Left inset that is pinned and therefore cannot reveal anything: sticky/frozen columns plus
     *  the row-marker column. Source's `frozenWidth + rowMarkerOffset * rowMarkerWidth`. */
    readonly frozenWidth: number;
    /** Top inset: the column header plus the group header when groups are on. */
    readonly headerHeight: number;
    /** Bottom inset from frozen trailing rows. Always `0` in this port -- `freezeTrailingRows` is
     *  unported (9g) -- but threaded through so it is one line to wire up when it lands. */
    readonly trailingRowHeight?: number;
}
export interface ScrollToParams {
    readonly dir?: ScrollDirection;
    readonly paddingX?: number;
    readonly paddingY?: number;
    readonly hAlign?: ScrollAlign;
    readonly vAlign?: ScrollAlign;
    /** The target column is frozen, so horizontal scrolling cannot bring it any further into view.
     *  Source's `typeof col === "number" && col < freezeColumns`. */
    readonly targetColumnIsFrozen?: boolean;
    /** The target row is one of the frozen trailing rows. Source's equivalent guard. */
    readonly targetRowIsFrozen?: boolean;
}
/**
 * How far to scroll, in pixels, to bring `target` into the visible window. `{x: 0, y: 0}` means
 * "already where it should be" -- the caller should then not touch `scrollLeft`/`scrollTop` at all,
 * since assigning them can cancel a smooth scroll already in flight.
 *
 * Positive means scroll right/down.
 */
export declare function computeScrollDelta(viewport: ScrollToViewport, params?: ScrollToParams): {
    x: number;
    y: number;
};
//# sourceMappingURL=scroll-to.d.ts.map