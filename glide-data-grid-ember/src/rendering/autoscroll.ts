// Autoscroll-while-dragging. Framework-agnostic port of source's
// `packages/core/src/data-editor/use-autoscroll.ts` (41 lines, a React hook) -- de-hooked into a
// plain class the same way `use-animation-queue` became `animation-queue.ts` in Phase 2.
//
// One implementation is shared by every drag that can run past the viewport edge (drag-extend a
// selection, reorder a row, drag the fill handle). Building it three times is how it ends up
// subtly different three times.
//
// The acceleration curve is source's, verbatim: speed ramps from a standstill to full speed over
// `MS_TO_FULL_SPEED`, shaped by an `x ** 1.618` ease so a small overshoot past the edge nudges
// gently while holding the pointer far outside scrolls fast.

import type { Rectangle } from "./data-grid-types.ts";

/**
 * Which edge(s) the pointer is currently past, as a pair of directions. `0` on an axis means "not
 * past either edge on that axis". Mirrors source's `GridMouseEventArgs["scrollEdge"]`.
 */
export type ScrollEdge = readonly [xDir: -1 | 0 | 1, yDir: -1 | 0 | 1];

const MAX_PX_PER_MS = 2;
const MS_TO_FULL_SPEED = 1300;

/** No scrolling in either axis. Module scope so callers can compare/reuse without allocating. */
export const NO_SCROLL_EDGE: ScrollEdge = [0, 0];

export function scrollEdgesAreEqual(a: ScrollEdge | undefined, b: ScrollEdge | undefined): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    return a[0] === b[0] && a[1] === b[1];
}

/**
 * Where a pointer sits relative to the grid's scrollable body, in the same root-relative pixel
 * space the hit-testing code uses. Note the vertical test is against `totalHeaderHeight`, not `0`:
 * dragging up into the *header* must scroll up, because the header covers the top of the body.
 * Mirrors source's `scrollEdge` computation (`data-grid.tsx:569-572`).
 */
export function computeScrollEdge(
    x: number,
    y: number,
    width: number,
    height: number,
    totalHeaderHeight: number
): ScrollEdge {
    return [x < 0 ? -1 : width < x ? 1 : 0, y < totalHeaderHeight ? -1 : height < y ? 1 : 0];
}

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

export class Autoscroller {
    private readonly opts: AutoscrollerOptions;
    private readonly requestFrame: (cb: (time: number) => void) => number;
    private readonly cancelFrame: (handle: number) => void;

    private direction: ScrollEdge | undefined = undefined;
    private handle: number | undefined = undefined;
    // Deliberate divergence from source, which uses `lastTime = 0` as its "no baseline yet"
    // sentinel. A real `requestAnimationFrame` timestamp of exactly 0 is possible (it is a
    // document-relative time), and there it would silently swallow a second frame. `undefined` says
    // what it means and costs nothing.
    private lastTime: number | undefined = undefined;
    private speedScalar = 0;

    constructor(opts: AutoscrollerOptions) {
        this.opts = opts;
        this.requestFrame = opts.requestFrame ?? (cb => requestAnimationFrame(cb));
        this.cancelFrame = opts.cancelFrame ?? (h => cancelAnimationFrame(h));
    }

    /** The direction currently being scrolled, or `undefined` when idle. */
    get currentDirection(): ScrollEdge | undefined {
        return this.direction;
    }

    /**
     * Idempotent for an unchanged direction -- calling this on every mousemove tick (which is what
     * the controller does) must not restart the ramp, or the speed would never build.
     */
    setDirection(dir: ScrollEdge | undefined): void {
        if (scrollEdgesAreEqual(this.direction, dir)) return;

        if (dir === undefined || (dir[0] === 0 && dir[1] === 0)) {
            this.stop();
            return;
        }

        this.direction = dir;
        // Source's effect re-runs on any direction change, which resets `lastTime` (a local) but
        // keeps `speedScalar` (a ref) -- so changing from "past the right edge" to "past the
        // bottom-right corner" mid-drag keeps the speed already built up.
        this.lastTime = undefined;
        if (this.handle === undefined) {
            this.handle = this.requestFrame(this.frame);
        }
    }

    stop(): void {
        this.direction = undefined;
        this.speedScalar = 0;
        this.lastTime = undefined;
        if (this.handle !== undefined) {
            this.cancelFrame(this.handle);
            this.handle = undefined;
        }
    }

    private readonly frame = (time: number): void => {
        const dir = this.direction;
        if (dir === undefined) {
            this.handle = undefined;
            return;
        }
        if (this.lastTime === undefined) {
            this.lastTime = time;
        } else {
            const step = time - this.lastTime;
            this.speedScalar = Math.min(1, this.speedScalar + step / MS_TO_FULL_SPEED);
            const motion = this.speedScalar ** 1.618 * step * MAX_PX_PER_MS;
            this.lastTime = time;
            this.opts.scrollBy(dir[0] * motion, dir[1] * motion);
            this.opts.onTick?.();
        }
        // Re-read: `onTick` may have stopped us (e.g. the drag ended).
        this.handle = this.direction === undefined ? undefined : this.requestFrame(this.frame);
    };
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
export function adjustDragLocationForScroll(
    location: readonly [number, number],
    edge: ScrollEdge,
    visible: Rectangle,
    visibleColStart: number,
    maxCol: number,
    maxRow: number
): readonly [number, number] {
    let [col, row] = location;
    const [xDir, yDir] = edge;
    if (xDir === -1) {
        col = visibleColStart;
    } else if (xDir === 1) {
        col = visibleColStart + visible.width;
    }
    if (yDir === -1) {
        row = Math.max(0, visible.y);
    } else if (yDir === 1) {
        row = visible.y + visible.height;
    }
    return [clampInt(col, 0, maxCol), clampInt(row, 0, maxRow)];
}

function clampInt(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
