// Phase 9h. Tests for the shared autoscroll-while-dragging engine.
//
// Three drags depend on this one implementation (drag-extend, row reorder, fill-handle drag), which
// is the reason it exists as a separate module at all — so the acceleration curve and the
// "where is the drag pointing now" arithmetic are worth pinning here rather than rediscovering
// three times in a browser.
//
// `Autoscroller` takes its frame scheduler as a constructor option purely so this file can drive it
// deterministically in bare Node: every test below advances time by hand rather than waiting for a
// real `requestAnimationFrame`.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import {
    Autoscroller,
    adjustDragLocationForScroll,
    computeScrollEdge,
    scrollEdgesAreEqual,
    type ScrollEdge,
} from "./autoscroll.ts";

// A hand-cranked frame scheduler. `tick(ms)` runs exactly one pending frame at the given timestamp.
function makeClock() {
    let next: ((time: number) => void) | undefined;
    let handleSeq = 1;
    const scrolls: { dx: number; dy: number }[] = [];
    const cancels: number[] = [];
    return {
        scrolls,
        cancels,
        get pending() {
            return next !== undefined;
        },
        options: {
            scrollBy: (dx: number, dy: number) => scrolls.push({ dx, dy }),
            requestFrame: (cb: (time: number) => void) => {
                next = cb;
                return handleSeq++;
            },
            cancelFrame: (h: number) => {
                cancels.push(h);
                next = undefined;
            },
        },
        tick(time: number) {
            const cb = next;
            next = undefined;
            cb?.(time);
        },
    };
}

describe("computeScrollEdge", () => {
    // 800x600 body, 60px of header on top.
    const edge = (x: number, y: number): ScrollEdge => computeScrollEdge(x, y, 800, 600, 60);

    it("reports no scrolling for a pointer inside the body", () => {
        expect(edge(400, 300)).toEqual([0, 0]);
    });

    it("reports a leftward scroll once the pointer passes the left edge", () => {
        expect(edge(-1, 300)).toEqual([-1, 0]);
    });

    it("reports a rightward scroll once the pointer passes the right edge", () => {
        expect(edge(801, 300)).toEqual([1, 0]);
    });

    it("treats the header strip as 'above the body', so dragging up into it scrolls up", () => {
        // This is the non-obvious one: the vertical test is against the header height, not 0,
        // because the header covers the top of the scrollable body.
        expect(edge(400, 30)).toEqual([0, -1]);
        expect(edge(400, 59)).toEqual([0, -1]);
        expect(edge(400, 60)).toEqual([0, 0]);
    });

    it("reports both axes at once in a corner", () => {
        expect(edge(-5, 700)).toEqual([-1, 1]);
    });
});

describe("scrollEdgesAreEqual", () => {
    it("compares by value, not identity", () => {
        expect(scrollEdgesAreEqual([1, 0], [1, 0])).toBe(true);
        expect(scrollEdgesAreEqual([1, 0], [0, 1])).toBe(false);
    });

    it("treats undefined as equal only to itself", () => {
        expect(scrollEdgesAreEqual(undefined, undefined)).toBe(true);
        expect(scrollEdgesAreEqual(undefined, [0, 0])).toBe(false);
    });
});

describe("Autoscroller", () => {
    it("does nothing at all while the direction is zero", () => {
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([0, 0]);
        expect(clock.pending).toBe(false);
        expect(clock.scrolls).toHaveLength(0);
    });

    it("consumes its first frame as a time baseline and scrolls nothing", () => {
        // The first frame has no elapsed step to integrate, so scrolling on it would mean scrolling
        // by an arbitrary amount determined by whenever the browser happened to schedule it.
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([1, 0]);
        clock.tick(1000);
        expect(clock.scrolls).toHaveLength(0);
        expect(clock.pending).toBe(true);
    });

    it("accelerates: later frames of equal length scroll further than earlier ones", () => {
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([1, 0]);
        clock.tick(0);
        for (let t = 16; t <= 16 * 8; t += 16) clock.tick(t);

        expect(clock.scrolls.length).toBe(8);
        const first = clock.scrolls[0]!.dx;
        const last = clock.scrolls.at(-1)!.dx;
        expect(first).toBeGreaterThan(0);
        expect(last).toBeGreaterThan(first);
        // Monotonic all the way up — the ramp never stalls or reverses.
        for (let i = 1; i < clock.scrolls.length; i++) {
            expect(clock.scrolls[i]!.dx).toBeGreaterThan(clock.scrolls[i - 1]!.dx);
        }
    });

    it("tops out at the documented maximum speed of 2px per ms", () => {
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([1, 0]);
        clock.tick(0);
        // Well past `MS_TO_FULL_SPEED` (1300ms).
        for (let t = 16; t <= 4000; t += 16) clock.tick(t);
        const last = clock.scrolls.at(-1)!.dx;
        expect(last).toBeCloseTo(16 * 2, 5);
    });

    it("scrolls along both axes when dragged into a corner", () => {
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([-1, 1]);
        clock.tick(0);
        clock.tick(16);
        const { dx, dy } = clock.scrolls[0]!;
        expect(dx).toBeLessThan(0);
        expect(dy).toBeGreaterThan(0);
        expect(dx).toBeCloseTo(-dy, 10);
    });

    it("keeps the speed already built up when the drag rounds a corner mid-flight", () => {
        // Changing direction restarts the frame timing but must NOT restart the ramp: a drag that
        // slides along the right edge and then into the bottom-right corner shouldn't stall.
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([1, 0]);
        clock.tick(0);
        for (let t = 16; t <= 800; t += 16) clock.tick(t);
        const beforeTurn = clock.scrolls.at(-1)!.dx;

        a.setDirection([1, 1]);
        clock.tick(816); // baseline frame for the new direction
        clock.tick(832);
        const afterTurn = clock.scrolls.at(-1)!.dx;
        expect(afterTurn).toBeGreaterThan(beforeTurn);
    });

    it("does not restart the ramp when the same direction is set repeatedly", () => {
        // The controller calls `setDirection` on every mousemove tick; if that reset the timing
        // baseline each time, the speed would never build at all.
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([0, 1]);
        clock.tick(0);
        for (let t = 16; t <= 800; t += 16) {
            a.setDirection([0, 1]);
            clock.tick(t);
        }
        expect(clock.scrolls.at(-1)!.dy).toBeGreaterThan(clock.scrolls[0]!.dy);
    });

    it("stops on a zero direction and forgets the speed it had built", () => {
        const clock = makeClock();
        const a = new Autoscroller(clock.options);
        a.setDirection([0, 1]);
        clock.tick(0);
        for (let t = 16; t <= 800; t += 16) clock.tick(t);
        const atSpeed = clock.scrolls.at(-1)!.dy;

        a.setDirection([0, 0]);
        expect(a.currentDirection).toBeUndefined();
        expect(clock.pending).toBe(false);

        a.setDirection([0, 1]);
        clock.tick(1000);
        clock.tick(1016);
        expect(clock.scrolls.at(-1)!.dy).toBeLessThan(atSpeed);
    });

    it("fires onTick once per scrolling frame", () => {
        const clock = makeClock();
        let ticks = 0;
        const a = new Autoscroller({ ...clock.options, onTick: () => ticks++ });
        a.setDirection([1, 0]);
        clock.tick(0);
        expect(ticks).toBe(0); // baseline frame scrolls nothing, so nothing to react to
        clock.tick(16);
        clock.tick(32);
        expect(ticks).toBe(2);
    });

    it("stops immediately when onTick ends the drag, without scheduling another frame", () => {
        const clock = makeClock();
        // The callback needs the instance, so initialization must happen in two statements.
        let a!: Autoscroller;
        // The callback above needs the instance before it is assigned.
        // eslint-disable-next-line prefer-const
        a = new Autoscroller({ ...clock.options, onTick: () => a.stop() });
        a.setDirection([1, 0]);
        clock.tick(0);
        clock.tick(16);
        expect(clock.pending).toBe(false);
    });
});

describe("adjustDragLocationForScroll", () => {
    // 10 columns visible starting at mangled column 3; 20 rows visible starting at row 40.
    const visible = { x: 2, y: 40, width: 10, height: 20 };
    const visibleColStart = 3;

    it("leaves the location alone when the pointer is still inside the grid", () => {
        expect(adjustDragLocationForScroll([5, 44], [0, 0], visible, visibleColStart, 99, 999)).toEqual([5, 44]);
    });

    it("follows the top row into view when dragging up past the header", () => {
        expect(adjustDragLocationForScroll([5, 44], [0, -1], visible, visibleColStart, 99, 999)).toEqual([5, 40]);
    });

    it("follows the bottom row into view when dragging below the grid", () => {
        expect(adjustDragLocationForScroll([5, 44], [0, 1], visible, visibleColStart, 99, 999)).toEqual([5, 60]);
    });

    it("follows the leading column when dragging off either side", () => {
        expect(adjustDragLocationForScroll([5, 44], [-1, 0], visible, visibleColStart, 99, 999)).toEqual([3, 44]);
        expect(adjustDragLocationForScroll([5, 44], [1, 0], visible, visibleColStart, 99, 999)).toEqual([13, 44]);
    });

    it("clamps to the real grid bounds rather than running past the last row", () => {
        // The interesting case: the drag is already at the bottom, so the visible region's bottom
        // edge is past the end of the data.
        expect(adjustDragLocationForScroll([5, 44], [1, 1], visible, visibleColStart, 8, 55)).toEqual([8, 55]);
    });

    it("never returns a negative index", () => {
        expect(
            adjustDragLocationForScroll([5, 44], [-1, -1], { x: 0, y: -3, width: 4, height: 5 }, -2, 99, 999)
        ).toEqual([0, 0]);
    });
});
