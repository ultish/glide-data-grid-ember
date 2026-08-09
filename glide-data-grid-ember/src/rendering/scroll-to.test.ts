// `computeScrollDelta` — the arithmetic behind `GlideDataGridApi.scrollTo` (9f).
//
// Worth testing exhaustively because it is invisible when wrong: a scroll that lands a few pixels
// off, or ignores an alignment, looks like "the grid scrolled" and reads as correct. The alignment
// modes in particular are expressed as a *narrowing of the acceptable window* rather than as a
// target position, which is source's trick and is not obvious from the code.
//
// Fixture: a 1000x600 grid, 60px of header, 100px of frozen columns on the left.
import { describe, expect, test } from "vitest";
import { computeScrollDelta, type ScrollToViewport } from "./scroll-to.ts";
import type { Rectangle } from "./data-grid-types.ts";

function viewport(target: Rectangle, overrides: Partial<ScrollToViewport> = {}): ScrollToViewport {
    return { target, width: 1000, height: 600, frozenWidth: 100, headerHeight: 60, ...overrides };
}

const CELL: Rectangle = { x: 300, y: 200, width: 150, height: 34 };

describe("no scroll needed", () => {
    test("a cell fully inside the window does not move", () => {
        expect(computeScrollDelta(viewport(CELL))).toEqual({ x: 0, y: 0 });
    });

    test("a cell flush against each edge is still 'inside'", () => {
        expect(computeScrollDelta(viewport({ x: 100, y: 60, width: 150, height: 34 }))).toEqual({ x: 0, y: 0 });
        expect(computeScrollDelta(viewport({ x: 850, y: 566, width: 150, height: 34 }))).toEqual({ x: 0, y: 0 });
    });
});

describe("minimum-distance scrolling", () => {
    test("a cell hidden behind the frozen columns scrolls left by exactly the overlap", () => {
        // Frozen columns are painted over the scrolling ones, so "visible" starts at x=100.
        expect(computeScrollDelta(viewport({ x: 40, y: 200, width: 150, height: 34 })).x).toBe(-60);
    });

    test("a cell past the right edge scrolls right by exactly the overhang", () => {
        expect(computeScrollDelta(viewport({ x: 900, y: 200, width: 150, height: 34 })).x).toBe(50);
    });

    test("a cell under the header scrolls up by the overlap", () => {
        expect(computeScrollDelta(viewport({ x: 300, y: 40, width: 150, height: 34 })).y).toBe(-20);
    });

    test("a cell past the bottom scrolls down by the overhang", () => {
        expect(computeScrollDelta(viewport({ x: 300, y: 580, width: 150, height: 34 })).y).toBe(14);
    });

    test("both axes move at once when both are off-screen", () => {
        expect(computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }))).toEqual({ x: -80, y: 24 });
    });
});

describe("padding", () => {
    test("padding widens the target, so it scrolls further than strictly needed", () => {
        // Flush against the left edge, so no scroll without padding...
        expect(computeScrollDelta(viewport({ x: 100, y: 200, width: 150, height: 34 })).x).toBe(0);
        // ...and 20px of slack demanded on each side pulls it 20px clear.
        expect(computeScrollDelta(viewport({ x: 100, y: 200, width: 150, height: 34 }), { paddingX: 20 }).x).toBe(-20);
    });

    test("padding on an axis that does not need to move changes nothing", () => {
        expect(computeScrollDelta(viewport(CELL), { paddingX: 40, paddingY: 40 })).toEqual({ x: 0, y: 0 });
    });
});

describe("alignment", () => {
    test("hAlign start pins the cell to the left edge even when it is already visible", () => {
        // Already visible at x=300; "start" means "put it at x=100". A POSITIVE delta scrolls the
        // content left, which moves the cell left on screen -- the sign is the scroll's, not the
        // cell's, and getting that backwards is the single easiest mistake here.
        expect(computeScrollDelta(viewport(CELL), { hAlign: "start" }).x).toBe(200);
    });

    test("hAlign end pins it to the right edge", () => {
        // Right edge is 1000, cell is 150 wide, so it wants x=850 -- to the right of where it is,
        // which means scrolling the content back by 550.
        expect(computeScrollDelta(viewport(CELL), { hAlign: "end" }).x).toBe(-550);
    });

    test("hAlign center puts it in the middle of the scrollable area", () => {
        // Window is [100, 1000], midpoint 550, cell half-width 75 -> wants x=475.
        expect(computeScrollDelta(viewport(CELL), { hAlign: "center" }).x).toBe(-175);
    });

    test("vAlign start pins it under the header", () => {
        expect(computeScrollDelta(viewport(CELL), { vAlign: "start" }).y).toBe(140);
    });

    test("vAlign end pins it to the bottom", () => {
        expect(computeScrollDelta(viewport(CELL), { vAlign: "end" }).y).toBe(-366);
    });

    test("vAlign center centres it vertically", () => {
        // Window [60, 600], midpoint 330, half-height 17 -> wants y=313.
        expect(computeScrollDelta(viewport(CELL), { vAlign: "center" }).y).toBe(-113);
    });

    test("the two axes align independently", () => {
        const d = computeScrollDelta(viewport(CELL), { hAlign: "start", vAlign: "start" });
        expect(d).toEqual({ x: 200, y: 140 });
    });

    test("alignment composes with padding", () => {
        // "start" with 10px padding lands the cell 10px clear of the frozen columns.
        expect(computeScrollDelta(viewport(CELL), { hAlign: "start", paddingX: 10 }).x).toBe(190);
    });
});

describe("dir, and the frozen-target guards", () => {
    test("dir vertical pins the horizontal axis", () => {
        const d = computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }), { dir: "vertical" });
        expect(d).toEqual({ x: 0, y: 24 });
    });

    test("dir horizontal pins the vertical axis", () => {
        const d = computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }), { dir: "horizontal" });
        expect(d).toEqual({ x: -80, y: 0 });
    });

    test("a frozen target column cannot be scrolled to horizontally", () => {
        const d = computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }), {
            targetColumnIsFrozen: true,
        });
        expect(d.x).toBe(0);
        // ...but the vertical axis still moves. This is the `else if` in source, and the reason the
        // two guards are NOT independent: see the comment on that branch.
        expect(d.y).toBe(24);
    });

    test("a frozen target row pins the vertical axis only", () => {
        const d = computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }), { targetRowIsFrozen: true });
        expect(d).toEqual({ x: -80, y: 0 });
    });

    test("a frozen column wins over dir:horizontal — source's else-if, preserved deliberately", () => {
        // Reading the two guards as independent would give `{x: 0, y: 0}` here. Source gives this.
        const d = computeScrollDelta(viewport({ x: 20, y: 590, width: 150, height: 34 }), {
            dir: "horizontal",
            targetColumnIsFrozen: true,
        });
        expect(d).toEqual({ x: 0, y: 24 });
    });
});

describe("trailing frozen rows (threaded through, unused until freezeTrailingRows lands)", () => {
    test("a bottom inset shrinks the window from below", () => {
        const d = computeScrollDelta(
            viewport({ x: 300, y: 540, width: 150, height: 34 }, { trailingRowHeight: 100 })
        );
        // Window bottom is 600 - 100 = 500; cell ends at 574, so scroll down 74.
        expect(d.y).toBe(74);
    });

    test("omitting it is the same as zero", () => {
        expect(computeScrollDelta(viewport(CELL, { trailingRowHeight: 0 }))).toEqual(computeScrollDelta(viewport(CELL)));
    });
});
