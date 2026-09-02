import type { Rectangle } from "./data-grid-types.ts";
/**
 * Which edge(s) the pointer is currently past, as a pair of directions. `0` on an axis means "not
 * past either edge on that axis". Mirrors source's `GridMouseEventArgs["scrollEdge"]`.
 */
export type ScrollEdge = readonly [xDir: -1 | 0 | 1, yDir: -1 | 0 | 1];
/** No scrolling in either axis. Module scope so callers can compare/reuse without allocating. */
export declare const NO_SCROLL_EDGE: ScrollEdge;
export declare function scrollEdgesAreEqual(a: ScrollEdge | undefined, b: ScrollEdge | undefined): boolean;
/**
 * Where a pointer sits relative to the grid's scrollable body, in the same root-relative pixel
 * space the hit-testing code uses. Note the vertical test is against `totalHeaderHeight`, not `0`:
 * dragging up into the *header* must scroll up, because the header covers the top of the body.
 * Mirrors source's `scrollEdge` computation (`data-grid.tsx:569-572`).
 */
export declare function computeScrollEdge(x: number, y: number, width: number, height: number, totalHeaderHeight: number): ScrollEdge;
export interface AutoscrollerOptions {
    /** Applied every frame; the grid's scroller element's `scrollBy` in practice. */
    readonly scrollBy: (dx: number, dy: number) => void;
    /**
     * Called after each frame's scroll, so the in-flight drag can re-resolve what it is now over.
     * Source's `adjustSelectionOnScroll` -- without it the selection would freeze while the grid
     * slid underneath it.
     */
    readonly onTick?: () => void;
    /** Injectable purely so this is testable in bare Node (vitest); defaults to the real rAF. */
    readonly requestFrame?: (cb: (time: number) => void) => number;
    readonly cancelFrame?: (handle: number) => void;
}
export declare class Autoscroller {
    private readonly opts;
    private readonly requestFrame;
    private readonly cancelFrame;
    private direction;
    private handle;
    private lastTime;
    private speedScalar;
    constructor(opts: AutoscrollerOptions);
    /** The direction currently being scrolled, or `undefined` when idle. */
    get currentDirection(): ScrollEdge | undefined;
    /**
     * Idempotent for an unchanged direction -- calling this on every mousemove tick (which is what
     * the controller does) must not restart the ramp, or the speed would never build.
     */
    setDirection(dir: ScrollEdge | undefined): void;
    stop(): void;
    private readonly frame;
}
/**
 * Where a drag that has run off the edge should be treated as pointing, given the currently
 * visible block. Port of source's `adjustSelectionOnScroll` (`data-editor.tsx:2826-2848`): the
 * pointer itself is outside the grid, so its hit test is meaningless -- what the drag should follow
 * is the leading edge of whatever is now scrolled into view.
 *
 * `location`/`visible` are both in the *mangled* column space the controller hit-tests in (i.e.
 * including the row-marker column, if any); `visibleColStart` is that space's leftmost live column.
 */
export declare function adjustDragLocationForScroll(location: readonly [number, number], edge: ScrollEdge, visible: Rectangle, visibleColStart: number, maxCol: number, maxRow: number): readonly [number, number];
//# sourceMappingURL=autoscroll.d.ts.map