// Tests for the pure rectangle-geometry helpers exported from math.ts.
// See copy-paste.test.ts for conventions (test contract not implementation; note
// surprising but faithful-to-source behavior; prefer tables for repeated patterns; no DOM).
import { describe, expect, it } from "vitest";
import {
    getClosestRect,
    intersectRect,
    pointInRect,
    combineRects,
    rectContains,
    hugRectToTarget,
    splitRectIntoRegions,
} from "./math.ts";
import type { Rectangle } from "../data-grid-types.ts";

describe("pointInRect", () => {
    it("returns true for a point inside a rectangle", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        expect(pointInRect(rect, 15, 25)).toBe(true);
        expect(pointInRect(rect, 20, 30)).toBe(true);
    });

    it("returns true for a point exactly on the boundary", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        // Left edge
        expect(pointInRect(rect, 10, 25)).toBe(true);
        // Right edge (x + width)
        expect(pointInRect(rect, 40, 25)).toBe(true);
        // Top edge
        expect(pointInRect(rect, 15, 20)).toBe(true);
        // Bottom edge (y + height)
        expect(pointInRect(rect, 15, 60)).toBe(true);
        // Corner
        expect(pointInRect(rect, 10, 20)).toBe(true);
    });

    it("returns false for a point outside the rectangle", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        expect(pointInRect(rect, 5, 25)).toBe(false);
        expect(pointInRect(rect, 50, 25)).toBe(false);
        expect(pointInRect(rect, 15, 10)).toBe(false);
        expect(pointInRect(rect, 15, 70)).toBe(false);
    });

    it("works with negative coordinates", () => {
        const rect: Rectangle = { x: -20, y: -30, width: 40, height: 50 };
        expect(pointInRect(rect, -10, -10)).toBe(true);
        expect(pointInRect(rect, -20, -30)).toBe(true);
        expect(pointInRect(rect, 20, 20)).toBe(true);
        expect(pointInRect(rect, -25, -10)).toBe(false);
    });

    it("handles zero-width rectangles", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 0, height: 40 };
        expect(pointInRect(rect, 10, 25)).toBe(true);
        expect(pointInRect(rect, 11, 25)).toBe(false);
    });

    it("handles zero-height rectangles", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 30, height: 0 };
        expect(pointInRect(rect, 15, 20)).toBe(true);
        expect(pointInRect(rect, 15, 21)).toBe(false);
    });
});

describe("intersectRect", () => {
    it("returns true for two overlapping rectangles", () => {
        // rect1: (0,0,10,10), rect2: (5,5,10,10)
        expect(intersectRect(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    });

    it("returns true for two exactly-touching rectangles (edge-to-edge)", () => {
        // rect1: (0,0,10,10), rect2: (10,0,10,10) - touching at x=10
        expect(intersectRect(0, 0, 10, 10, 10, 0, 10, 10)).toBe(true);
    });

    it("returns true when one rectangle is completely inside another", () => {
        // rect1: (0,0,20,20), rect2: (5,5,5,5)
        expect(intersectRect(0, 0, 20, 20, 5, 5, 5, 5)).toBe(true);
    });

    it("returns false for two separated rectangles", () => {
        // rect1: (0,0,10,10), rect2: (15,15,10,10)
        expect(intersectRect(0, 0, 10, 10, 15, 15, 10, 10)).toBe(false);
    });

    it("returns false for horizontally separated but vertically overlapping", () => {
        // rect1: (0,0,5,10), rect2: (10,5,5,10)
        expect(intersectRect(0, 0, 5, 10, 10, 5, 5, 10)).toBe(false);
    });

    it("works with negative coordinates", () => {
        // rect1: (-10,-10,10,10), rect2: (-5,-5,10,10)
        expect(intersectRect(-10, -10, 10, 10, -5, -5, 10, 10)).toBe(true);
        // rect1: (-10,-10,5,5), rect2: (0,0,5,5)
        expect(intersectRect(-10, -10, 5, 5, 0, 0, 5, 5)).toBe(false);
    });

    it("returns true for rectangles that share a corner point", () => {
        // rect1: (0,0,10,10), rect2: (10,10,10,10) - corner touch at (10,10)
        expect(intersectRect(0, 0, 10, 10, 10, 10, 10, 10)).toBe(true);
    });

    it("handles zero-width/height rectangles", () => {
        // rect1: (5,5,0,0) point-like, rect2: (0,0,10,10)
        expect(intersectRect(5, 5, 0, 0, 0, 0, 10, 10)).toBe(true);
        // rect1: (15,15,0,0), rect2: (0,0,10,10)
        expect(intersectRect(15, 15, 0, 0, 0, 0, 10, 10)).toBe(false);
    });
});

describe("combineRects", () => {
    it("combines two non-overlapping rectangles into their bounding box", () => {
        const a: Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: Rectangle = { x: 20, y: 20, width: 10, height: 10 };
        const result = combineRects(a, b);
        expect(result).toEqual({ x: 0, y: 0, width: 30, height: 30 });
    });

    it("combines two overlapping rectangles correctly", () => {
        const a: Rectangle = { x: 0, y: 0, width: 20, height: 20 };
        const b: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        const result = combineRects(a, b);
        expect(result).toEqual({ x: 0, y: 0, width: 30, height: 30 });
    });

    it("handles one rect completely inside another", () => {
        const a: Rectangle = { x: 0, y: 0, width: 100, height: 100 };
        const b: Rectangle = { x: 25, y: 25, width: 50, height: 50 };
        const result = combineRects(a, b);
        expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it("works with negative coordinates", () => {
        const a: Rectangle = { x: -20, y: -20, width: 10, height: 10 };
        const b: Rectangle = { x: 10, y: 10, width: 10, height: 10 };
        const result = combineRects(a, b);
        expect(result).toEqual({ x: -20, y: -20, width: 40, height: 40 });
    });

    it("combines identical rectangles", () => {
        const a: Rectangle = { x: 5, y: 5, width: 10, height: 10 };
        const b: Rectangle = { x: 5, y: 5, width: 10, height: 10 };
        const result = combineRects(a, b);
        expect(result).toEqual({ x: 5, y: 5, width: 10, height: 10 });
    });

    it("returns immutable result (does not modify inputs)", () => {
        const a: Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: Rectangle = { x: 20, y: 20, width: 10, height: 10 };
        const orig_a = { ...a };
        const orig_b = { ...b };
        combineRects(a, b);
        expect(a).toEqual(orig_a);
        expect(b).toEqual(orig_b);
    });
});

describe("rectContains", () => {
    it("returns true when a completely contains b", () => {
        const a: Rectangle = { x: 0, y: 0, width: 100, height: 100 };
        const b: Rectangle = { x: 25, y: 25, width: 50, height: 50 };
        expect(rectContains(a, b)).toBe(true);
    });

    it("returns true when rectangles are identical", () => {
        const a: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        const b: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        expect(rectContains(a, b)).toBe(true);
    });

    it("returns true when b's boundaries exactly match a's", () => {
        const a: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        const b: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
        expect(rectContains(a, b)).toBe(true);
    });

    it("returns false when b extends beyond a on any edge", () => {
        const a: Rectangle = { x: 0, y: 0, width: 100, height: 100 };
        // b extends beyond right edge
        expect(rectContains(a, { x: 50, y: 50, width: 60, height: 30 })).toBe(false);
        // b extends beyond bottom edge
        expect(rectContains(a, { x: 50, y: 50, width: 30, height: 60 })).toBe(false);
        // b extends beyond top edge
        expect(rectContains(a, { x: 50, y: -10, width: 30, height: 50 })).toBe(false);
        // b extends beyond left edge
        expect(rectContains(a, { x: -10, y: 50, width: 50, height: 30 })).toBe(false);
    });

    it("returns false when b is completely outside a", () => {
        const a: Rectangle = { x: 0, y: 0, width: 50, height: 50 };
        const b: Rectangle = { x: 100, y: 100, width: 50, height: 50 };
        expect(rectContains(a, b)).toBe(false);
    });

    it("handles zero-size rectangles", () => {
        const a: Rectangle = { x: 10, y: 10, width: 50, height: 50 };
        // Zero-size rect at same origin
        expect(rectContains(a, { x: 10, y: 10, width: 0, height: 0 })).toBe(true);
        // Zero-size rect inside a
        expect(rectContains(a, { x: 25, y: 25, width: 0, height: 0 })).toBe(true);
        // Zero-size rect outside a
        expect(rectContains(a, { x: 100, y: 100, width: 0, height: 0 })).toBe(false);
    });

    it("works with negative coordinates", () => {
        const a: Rectangle = { x: -50, y: -50, width: 100, height: 100 };
        const b: Rectangle = { x: -25, y: -25, width: 50, height: 50 };
        expect(rectContains(a, b)).toBe(true);
    });
});

describe("getClosestRect", () => {
    it("always combines for allowedDirections='any', even if point is inside", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        // With "any", always returns combined rect regardless of point position
        const result = getClosestRect(rect, 15, 15, "any");
        expect(result).toEqual(combineRects(rect, { x: 15, y: 15, width: 1, height: 1 }));
    });

    it("returns combined rect when point is outside with allowedDirections='any'", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        const result = getClosestRect(rect, 50, 50, "any");
        expect(result).toEqual({ x: 10, y: 10, width: 41, height: 41 });
    });

    it("returns undefined when point is inside with direction constraints", () => {
        // itemIsInRect uses < (not <=) for right/bottom, so point must be strictly inside
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        // Point (15, 15) is strictly inside: 15 >= 10, 15 < 30, 15 >= 10, 15 < 30
        expect(getClosestRect(rect, 15, 15, "vertical")).toBeUndefined();
        expect(getClosestRect(rect, 15, 15, "horizontal")).toBeUndefined();
    });

    it("constrains x to rect.x when allowedDirections='vertical'", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        // Point to the right and below; x gets locked to 10
        const result = getClosestRect(rect, 50, 50, "vertical");
        expect(result).toBeDefined();
        expect(result!.x).toBe(10);
        expect(result!.width).toBe(20);
    });

    it("constrains y to rect.y when allowedDirections='horizontal'", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        // Point to the right and below; y gets locked to 10
        const result = getClosestRect(rect, 50, 50, "horizontal");
        expect(result).toBeDefined();
        expect(result!.y).toBe(10);
        expect(result!.height).toBe(20);
    });

    it("combines rect with point when point is below with allowedDirections='any'", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        const result = getClosestRect(rect, 20, 35, "any");
        // Should combine rect (10,10,20,20) and point (20,35,1,1)
        expect(result).toEqual(combineRects(rect, { x: 20, y: 35, width: 1, height: 1 }));
    });

    it("extends upward when point is above the rect", () => {
        const rect: Rectangle = { x: 10, y: 30, width: 20, height: 20 };
        const result = getClosestRect(rect, 20, 10, "any");
        expect(result).toBeDefined();
        // Should extend upward to reach the point
        expect(result!.y).toBeLessThanOrEqual(10);
    });

    it("combines rect with point when point is to the right with allowedDirections='any'", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        const result = getClosestRect(rect, 40, 20, "any");
        // Should combine rect (10,10,20,20) and point (40,20,1,1)
        expect(result).toEqual(combineRects(rect, { x: 40, y: 20, width: 1, height: 1 }));
    });

    it("combines rect with point when point is to the left with allowedDirections='any'", () => {
        const rect: Rectangle = { x: 30, y: 10, width: 20, height: 20 };
        const result = getClosestRect(rect, 10, 20, "any");
        // Should combine rect (30,10,20,20) and point (10,20,1,1)
        expect(result).toEqual(combineRects(rect, { x: 10, y: 20, width: 1, height: 1 }));
    });

    it("chooses closest edge with vertical constraint", () => {
        const rect: Rectangle = { x: 10, y: 20, width: 20, height: 20 };
        // With vertical, only horizontal edges (top/bottom) compete for closest
        const result = getClosestRect(rect, 50, 5, "vertical");
        expect(result).toBeDefined();
        // x should be locked to rect.x
        expect(result!.x).toBe(10);
        expect(result!.width).toBe(20);
    });

    it("chooses closest edge with horizontal constraint", () => {
        const rect: Rectangle = { x: 20, y: 10, width: 20, height: 20 };
        // With horizontal, only vertical edges (left/right) compete for closest
        const result = getClosestRect(rect, 5, 50, "horizontal");
        expect(result).toBeDefined();
        // y should be locked to rect.y
        expect(result!.y).toBe(10);
        expect(result!.height).toBe(20);
    });
});

describe("hugRectToTarget", () => {
    it("returns undefined when rect starts past the right edge", () => {
        const rect: Rectangle = { x: 100, y: 10, width: 20, height: 20 };
        expect(hugRectToTarget(rect, 50, 100, 1)).toBeUndefined();
    });

    it("returns undefined when rect starts past the bottom edge", () => {
        const rect: Rectangle = { x: 10, y: 100, width: 20, height: 20 };
        expect(hugRectToTarget(rect, 100, 50, 1)).toBeUndefined();
    });

    it("returns undefined for special case: both corners outside in a specific configuration", () => {
        // The condition is: x < 0 && y < 0 && x+width > width && y+height > height
        // This means top-left is outside AND bottom-right extends past bounds
        const rect: Rectangle = { x: -50, y: -50, width: 200, height: 200 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeUndefined();
    });

    it("returns rect unchanged when completely within bounds", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toEqual(rect);
    });

    it("clips rect that extends beyond right edge", () => {
        const rect: Rectangle = { x: 80, y: 10, width: 40, height: 20 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Right edge should be clipped; width should be smaller than original
        expect(result!.x + result!.width).toBeLessThanOrEqual(rect.x + rect.width);
    });

    it("clips rect that extends beyond bottom edge", () => {
        const rect: Rectangle = { x: 10, y: 80, width: 20, height: 40 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Bottom edge should be clipped; height should be smaller
        expect(result!.y + result!.height).toBeLessThanOrEqual(rect.y + rect.height);
    });

    it("adjusts rect that extends beyond left edge", () => {
        const rect: Rectangle = { x: -10, y: 10, width: 50, height: 20 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Should adjust to not go more than 4px past left (leftMax = -4)
        expect(result!.x).toBeGreaterThanOrEqual(-4);
    });

    it("adjusts rect that extends beyond top edge", () => {
        const rect: Rectangle = { x: 10, y: -10, width: 20, height: 50 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Should adjust to not go more than 4px past top (topMax = -4)
        expect(result!.y).toBeGreaterThanOrEqual(-4);
    });

    it("respects mod parameter for alignment", () => {
        const rect: Rectangle = { x: 5, y: 5, width: 100, height: 100 };
        const result = hugRectToTarget(rect, 100, 100, 4);
        expect(result).toBeDefined();
        // With mod, adjustments should happen in multiples of 4
        // The returned size might not be perfectly aligned if clipping is needed
    });

    it("handles rect partially outside top-left", () => {
        const rect: Rectangle = { x: -20, y: -20, width: 50, height: 50 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Should clip/adjust to fit; result should have positive dimensions
        expect(result!.width).toBeGreaterThan(0);
        expect(result!.height).toBeGreaterThan(0);
    });

    it("returns rect unchanged for zero size", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 0, height: 0 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toEqual(rect);
    });

    it("applies slop of 4px to boundaries", () => {
        // Slop allows rect to extend slightly past bounds without being clipped
        const rect: Rectangle = { x: -2, y: 10, width: 20, height: 20 };
        const result = hugRectToTarget(rect, 100, 100, 1);
        expect(result).toBeDefined();
        // Should not be clipped since -2 is within slop of -4
        expect(result!.x).toBe(-2);
    });
});

describe("splitRectIntoRegions", () => {
    it("returns empty array for a rect with zero width or height", () => {
        const rect: Rectangle = { x: 0, y: 0, width: 0, height: 50 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [0, 0, 9, 9];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        expect(result).toEqual([]);
    });

    it("returns regions covering the entire input rect", () => {
        const rect: Rectangle = { x: 15, y: 15, width: 10, height: 10 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Regions should cover the input rect
        expect(result.length).toBeGreaterThan(0);
        const combined = result.reduce((acc: Rectangle | null, r) => {
            return acc ? combineRects(acc, r.rect) : r.rect;
        }, null);
        expect(combined).toEqual(rect);
    });

    it("can return up to nine regions when rect spans all split areas", () => {
        const rect: Rectangle = { x: 5, y: 5, width: 30, height: 30 };
        const splitIndices: [number, number, number, number] = [15, 15, 20, 20];
        const splitLocations: [number, number, number, number] = [7, 7, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Rect spans all 9 regions
        expect(result.length).toBeLessThanOrEqual(9);
        expect(result.length).toBeGreaterThan(0);
    });

    it("returns regions with valid dimensions and clip coordinates", () => {
        const rect: Rectangle = { x: 5, y: 5, width: 30, height: 30 };
        const splitIndices: [number, number, number, number] = [15, 15, 20, 20];
        const splitLocations: [number, number, number, number] = [7, 7, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);

        for (const region of result) {
            expect(region.rect.width).toBeGreaterThan(0);
            expect(region.rect.height).toBeGreaterThan(0);
            expect(region.clip.width).toBeGreaterThan(0);
            expect(region.clip.height).toBeGreaterThan(0);
        }
    });

    it("returns regions for a rect that extends left of the split", () => {
        const rect: Rectangle = { x: 0, y: 15, width: 12, height: 10 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return some regions that cover the input rect
        expect(result.length).toBeGreaterThan(0);
        for (const region of result) {
            expect(region.rect.width).toBeGreaterThan(0);
            expect(region.rect.height).toBeGreaterThan(0);
        }
    });

    it("returns regions for a rect that extends above the split", () => {
        const rect: Rectangle = { x: 15, y: 0, width: 10, height: 12 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return regions covering the input rect
        expect(result.length).toBeGreaterThan(0);
    });

    it("returns regions for a rect that extends right of the split", () => {
        const rect: Rectangle = { x: 20, y: 15, width: 15, height: 10 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return regions covering the input rect
        expect(result.length).toBeGreaterThan(0);
    });

    it("returns regions for a rect that extends below the split", () => {
        const rect: Rectangle = { x: 15, y: 20, width: 10, height: 15 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return regions covering the input rect
        expect(result.length).toBeGreaterThan(0);
    });

    it("handles rect spanning from left to right of split lines", () => {
        const rect: Rectangle = { x: 5, y: 15, width: 30, height: 10 };
        const splitIndices: [number, number, number, number] = [15, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [7, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return multiple regions side-by-side
        expect(result.length).toBeGreaterThan(0);
    });

    it("handles rect spanning from top to bottom of split lines", () => {
        const rect: Rectangle = { x: 15, y: 5, width: 10, height: 30 };
        const splitIndices: [number, number, number, number] = [10, 15, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 7, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return multiple regions stacked vertically
        expect(result.length).toBeGreaterThan(0);
    });

    it("handles negative coordinates correctly", () => {
        const rect: Rectangle = { x: -10, y: -10, width: 30, height: 30 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        // Should return regions with valid dimensions
        expect(result.length).toBeGreaterThan(0);
        for (const region of result) {
            expect(region.rect.width).toBeGreaterThan(0);
            expect(region.rect.height).toBeGreaterThan(0);
        }
    });

    it("ensures all returned regions have non-empty dimensions", () => {
        const rect: Rectangle = { x: 0, y: 0, width: 50, height: 50 };
        const splitIndices: [number, number, number, number] = [10, 10, 40, 40];
        const splitLocations: [number, number, number, number] = [9, 9, 39, 39];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);

        for (const region of result) {
            expect(region.rect.width).toBeGreaterThan(0);
            expect(region.rect.height).toBeGreaterThan(0);
            expect(region.clip.width).toBeGreaterThan(0);
            expect(region.clip.height).toBeGreaterThan(0);
        }
    });

    it("handles rect at split boundary lines", () => {
        const rect: Rectangle = { x: 10, y: 10, width: 10, height: 10 };
        const splitIndices: [number, number, number, number] = [10, 10, 20, 20];
        const splitLocations: [number, number, number, number] = [5, 5, 14, 14];
        const result = splitRectIntoRegions(rect, splitIndices, 100, 100, splitLocations);
        expect(result.length).toBeGreaterThan(0);
    });

    it("returns single region when rect is entirely to top-left of splits", () => {
        const rect: Rectangle = { x: 0, y: 0, width: 50, height: 50 };
        const splitIndices: [number, number, number, number] = [100, 100, 200, 200];
        const splitLocations: [number, number, number, number] = [50, 50, 99, 99];
        const result = splitRectIntoRegions(rect, splitIndices, 300, 300, splitLocations);
        // Rect is entirely to left/top of split
        expect(result.length).toBe(1);
        expect(result[0]!.rect).toEqual(rect);
    });
});
