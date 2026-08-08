// Phase 9a. Unit tests for pure geometry and string helpers exported from utils.ts:
// getSquareBB, getSquareXPosFromAlign, getSquareWidth, pointIsWithinBB, direction, and
// makeAccessibilityStringForArray. All are small, pure functions with no DOM usage.
//
// See copy-paste.test.ts for conventions (test contract not implementation; note
// surprising but faithful-to-source behavior; prefer tables for repeated patterns; no DOM).

import { describe, expect, it } from "vitest";
import {
    getSquareBB,
    getSquareXPosFromAlign,
    getSquareWidth,
    pointIsWithinBB,
    direction,
    makeAccessibilityStringForArray,
} from "./utils.ts";

describe("getSquareBB", () => {
    it("computes bounding box centered at given position", () => {
        const bb = getSquareBB(10, 20, 8);
        expect(bb).toEqual({ x1: 6, y1: 16, x2: 14, y2: 24 });
    });

    it("computes bounding box at origin", () => {
        const bb = getSquareBB(0, 0, 10);
        expect(bb).toEqual({ x1: -5, y1: -5, x2: 5, y2: 5 });
    });

    it("handles negative coordinates", () => {
        const bb = getSquareBB(-10, -20, 4);
        expect(bb).toEqual({ x1: -12, y1: -22, x2: -8, y2: -18 });
    });

    it("handles fractional values", () => {
        const bb = getSquareBB(10.5, 20.5, 7);
        expect(bb.x1).toBeCloseTo(7);
        expect(bb.y1).toBeCloseTo(17);
        expect(bb.x2).toBeCloseTo(14);
        expect(bb.y2).toBeCloseTo(24);
    });
});

describe("getSquareXPosFromAlign", () => {
    it.each<
        [
            alignment: "left" | "center" | "right",
            containerX: number,
            containerWidth: number,
            horizontalPadding: number,
            squareWidth: number,
            expected: number,
        ]
    >([
        ["left", 0, 100, 4, 16, 12], // floor(0) + 4 + 16/2 = 12
        ["center", 0, 100, 4, 16, 50], // floor(0 + 100/2) = 50
        ["right", 0, 100, 4, 16, 88], // floor(0 + 100) - 4 - 16/2 = 100 - 4 - 8 = 88
        ["left", 10, 80, 6, 12, 22], // floor(10) + 6 + 12/2 = 22
        ["center", 10, 80, 6, 12, 50], // floor(10 + 80/2) = floor(50) = 50
        ["right", 10, 80, 6, 12, 78], // floor(10 + 80) - 6 - 12/2 = 90 - 6 - 6 = 78
    ])(
        "alignment=%s with container x=$containerX width=$containerWidth returns expected position",
        (alignment, containerX, containerWidth, horizontalPadding, squareWidth, expected) => {
            const result = getSquareXPosFromAlign(
                alignment,
                containerX,
                containerWidth,
                horizontalPadding,
                squareWidth
            );
            expect(result).toBe(expected);
        }
    );

    it("handles fractional container values, applying floor", () => {
        // center: floor(10.7 + 80.3/2) = floor(40.85 + 10.7) = floor(51.55) = 51
        const result = getSquareXPosFromAlign("center", 10.7, 80.3, 0, 0);
        expect(result).toBe(50); // floor(10.7 + 40.15) = floor(50.85) = 50
    });
});

describe("getSquareWidth", () => {
    it("returns maxSize when it is smaller than container minus padding", () => {
        const width = getSquareWidth(10, 100, 5);
        expect(width).toBe(10); // min(10, 100 - 10) = 10
    });

    it("returns reduced size when container is smaller than maxSize", () => {
        const width = getSquareWidth(100, 30, 5);
        expect(width).toBe(20); // min(100, 30 - 10) = 20
    });

    it("returns negative value when vertical padding exceeds container height", () => {
        const width = getSquareWidth(50, 20, 15);
        expect(width).toBe(-10); // min(50, 20 - 30) = min(50, -10) = -10
    });

    it("handles fractional values", () => {
        const width = getSquareWidth(15.5, 35.7, 5.2);
        expect(width).toBeCloseTo(15.5); // min(15.5, 35.7 - 10.4) = min(15.5, 25.3) = 15.5
    });
});

describe("pointIsWithinBB", () => {
    const bb = { x1: 10, y1: 20, x2: 30, y2: 40 };

    it("returns true for a point strictly inside", () => {
        expect(pointIsWithinBB(20, 30, bb)).toBe(true);
    });

    it.each<[x: number, y: number, description: string]>([
        [10, 30, "left edge"],
        [30, 30, "right edge"],
        [20, 20, "top edge"],
        [20, 40, "bottom edge"],
        [10, 20, "top-left corner"],
        [30, 20, "top-right corner"],
        [10, 40, "bottom-left corner"],
        [30, 40, "bottom-right corner"],
    ])("returns true for a point exactly on the $description (inclusive)", (x, y) => {
        expect(pointIsWithinBB(x, y, bb)).toBe(true);
    });

    it("returns false for a point just outside the left edge", () => {
        expect(pointIsWithinBB(9.999, 30, bb)).toBe(false);
    });

    it("returns false for a point just outside the right edge", () => {
        expect(pointIsWithinBB(30.001, 30, bb)).toBe(false);
    });

    it("returns false for a point just outside the top edge", () => {
        expect(pointIsWithinBB(20, 19.999, bb)).toBe(false);
    });

    it("returns false for a point just outside the bottom edge", () => {
        expect(pointIsWithinBB(20, 40.001, bb)).toBe(false);
    });

    it("handles negative coordinates", () => {
        const negBB = { x1: -30, y1: -40, x2: -10, y2: -20 };
        expect(pointIsWithinBB(-20, -30, negBB)).toBe(true);
        expect(pointIsWithinBB(-35, -30, negBB)).toBe(false);
    });
});

describe("direction", () => {
    it("returns 'not-rtl' for English text", () => {
        expect(direction("Hello world")).toBe("not-rtl");
    });

    it("returns 'rtl' for Arabic text", () => {
        expect(direction("مرحبا")).toBe("rtl");
    });

    it("returns 'rtl' for Hebrew text", () => {
        expect(direction("שלום")).toBe("rtl");
    });

    it("returns 'not-rtl' for digits only", () => {
        expect(direction("12345")).toBe("not-rtl");
    });

    it("returns 'not-rtl' for empty string", () => {
        expect(direction("")).toBe("not-rtl");
    });

    it("returns 'not-rtl' when text starts with LTR characters even if it contains RTL later", () => {
        // The regex ^[^ltrRange]*[rtlRange] requires non-LTR characters before the RTL character,
        // so text starting with LTR letters never matches. Surprising: the regex doesn't detect
        // "contains RTL", only "starts with non-LTR then has RTL".
        expect(direction("hello مرحبا")).toBe("not-rtl");
    });
});

describe("makeAccessibilityStringForArray", () => {
    it("returns empty string for empty array", () => {
        expect(makeAccessibilityStringForArray([])).toBe("");
    });

    it("returns single element for one-element array", () => {
        expect(makeAccessibilityStringForArray(["item"])).toBe("item");
    });

    it("joins multiple elements with ', ' separator", () => {
        expect(makeAccessibilityStringForArray(["a", "b", "c"])).toBe("a, b, c");
    });

    it("truncates when total length exceeds 10,000 characters", () => {
        const shortString = "x".repeat(5000);
        const array = [shortString, shortString, shortString]; // 15,000 total
        const result = makeAccessibilityStringForArray(array);
        // First element: 5000 chars, second element starts at 5000, total becomes 5005
        // Third element: 5000 chars, total becomes 10005, exceeds 10000, so breaks after 2 elements
        expect(result).toBe(`${shortString}, ${shortString}`);
    });

    it("handles array with long strings that hit the limit mid-array", () => {
        const array = ["a".repeat(9900), "b".repeat(150), "c".repeat(100)];
        const result = makeAccessibilityStringForArray(array);
        // First element: 9900, cumulative: 9900
        // Second element: 150, cumulative: 10050 > 10000, so stops before adding it
        // Result should only include first element
        expect(result).toBe("a".repeat(9900));
    });
});
