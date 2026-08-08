// Tests for the CellSet class, an immutable-like set of grid cell coordinates [col, row] used to
// describe which cells need repainting. See copy-paste.test.ts for conventions (test contract not
// implementation; note surprising but faithful-to-source behavior; prefer tables for repeated
// patterns; no DOM).
import { describe, expect, it } from "vitest";
import { CellSet } from "./cell-set.ts";
import type { Item } from "./data-grid-types.ts";

describe("CellSet.constructor", () => {
    it("creates an empty set with default no-arg constructor", () => {
        const set = new CellSet();
        expect(set.size).toBe(0);
    });

    it("creates a set from an array of items", () => {
        const set = new CellSet([
            [0, 0],
            [1, 2],
            [3, 4],
        ]);
        expect(set.size).toBe(3);
        expect(set.has([0, 0])).toBe(true);
        expect(set.has([1, 2])).toBe(true);
        expect(set.has([3, 4])).toBe(true);
    });

    it("deduplicates items in the constructor", () => {
        const set = new CellSet([
            [1, 2],
            [1, 2],
            [3, 4],
        ]);
        expect(set.size).toBe(2);
    });
});

describe("CellSet.add", () => {
    it("adds a single cell to an empty set", () => {
        const set = new CellSet();
        set.add([5, 10]);
        expect(set.size).toBe(1);
        expect(set.has([5, 10])).toBe(true);
    });

    it("adds multiple cells", () => {
        const set = new CellSet();
        set.add([0, 0]);
        set.add([1, 1]);
        set.add([2, 2]);
        expect(set.size).toBe(3);
    });

    it("silently ignores adding a duplicate", () => {
        const set = new CellSet([[1, 2]]);
        set.add([1, 2]);
        expect(set.size).toBe(1);
    });

    it("does not confuse [col, row] with [row, col]", () => {
        const set = new CellSet();
        set.add([1, 2]);
        set.add([2, 1]);
        expect(set.size).toBe(2);
        expect(set.has([1, 2])).toBe(true);
        expect(set.has([2, 1])).toBe(true);
    });
});

describe("CellSet.has", () => {
    it("returns true for an existing cell", () => {
        const set = new CellSet([[3, 5]]);
        expect(set.has([3, 5])).toBe(true);
    });

    it("returns false for a non-existing cell", () => {
        const set = new CellSet([[3, 5]]);
        expect(set.has([1, 1])).toBe(false);
    });

    it("returns false for undefined (safe guard)", () => {
        const set = new CellSet([[1, 2]]);
        expect(set.has(undefined)).toBe(false);
    });

    it("returns true for [0, 0]", () => {
        const set = new CellSet([[0, 0]]);
        expect(set.has([0, 0])).toBe(true);
    });

    it("returns false for [0, 0] when empty", () => {
        const set = new CellSet();
        expect(set.has([0, 0])).toBe(false);
    });
});

describe("CellSet.remove", () => {
    it("removes an existing cell", () => {
        const set = new CellSet([
            [1, 2],
            [3, 4],
        ]);
        set.remove([1, 2]);
        expect(set.size).toBe(1);
        expect(set.has([1, 2])).toBe(false);
        expect(set.has([3, 4])).toBe(true);
    });

    it("silently ignores removing a non-existing cell", () => {
        const set = new CellSet([[1, 2]]);
        set.remove([5, 6]);
        expect(set.size).toBe(1);
        expect(set.has([1, 2])).toBe(true);
    });

    it("removes from an empty set with no effect", () => {
        const set = new CellSet();
        set.remove([1, 2]);
        expect(set.size).toBe(0);
    });
});

describe("CellSet.clear", () => {
    it("empties the set", () => {
        const set = new CellSet([
            [1, 2],
            [3, 4],
            [5, 6],
        ]);
        set.clear();
        expect(set.size).toBe(0);
        expect(set.has([1, 2])).toBe(false);
    });

    it("has no effect on an empty set", () => {
        const set = new CellSet();
        set.clear();
        expect(set.size).toBe(0);
    });
});

describe("CellSet.size", () => {
    it("returns 0 for an empty set", () => {
        const set = new CellSet();
        expect(set.size).toBe(0);
    });

    it("returns the correct count after operations", () => {
        const set = new CellSet();
        expect(set.size).toBe(0);
        set.add([1, 2]);
        expect(set.size).toBe(1);
        set.add([3, 4]);
        expect(set.size).toBe(2);
        set.remove([1, 2]);
        expect(set.size).toBe(1);
    });
});

describe("CellSet.hasHeader", () => {
    it("returns false for an empty set", () => {
        const set = new CellSet();
        expect(set.hasHeader()).toBe(false);
    });

    it("returns false when no cells have negative row", () => {
        const set = new CellSet([
            [0, 0],
            [1, 1],
            [2, 5],
        ]);
        expect(set.hasHeader()).toBe(false);
    });

    it("returns true when any cell has row < 0", () => {
        const set = new CellSet([
            [0, 0],
            [1, -1],
            [2, 5],
        ]);
        expect(set.hasHeader()).toBe(true);
    });

    it("returns true with only header cells (row -1)", () => {
        const set = new CellSet([
            [0, -1],
            [1, -1],
        ]);
        expect(set.hasHeader()).toBe(true);
    });

    it("returns true with row -2 (very early header)", () => {
        const set = new CellSet([[5, -2]]);
        expect(set.hasHeader()).toBe(true);
    });
});

describe("CellSet.hasItemInRectangle", () => {
    it("returns false for an empty set", () => {
        const set = new CellSet();
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    });

    it("returns true when rectangle contains a cell", () => {
        const set = new CellSet([[5, 5]]);
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    });

    it("returns false when rectangle does not contain any cell", () => {
        const set = new CellSet([[15, 15]]);
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    });

    it("detects cell at rectangle boundary (inclusive start)", () => {
        const set = new CellSet([[0, 0]]);
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 5, height: 5 })).toBe(true);
    });

    it("does not detect cell at rectangle exclusive end", () => {
        const set = new CellSet([[10, 10]]);
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    });

    it("returns true when rectangle contains one of multiple cells", () => {
        const set = new CellSet([
            [1, 1],
            [20, 20],
        ]);
        expect(set.hasItemInRectangle({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    });

    it("returns true with a 1x1 rectangle matching a cell", () => {
        const set = new CellSet([[5, 5]]);
        expect(set.hasItemInRectangle({ x: 5, y: 5, width: 1, height: 1 })).toBe(true);
    });
});

describe("CellSet.hasItemInRegion", () => {
    it("returns false for an empty set", () => {
        const set = new CellSet();
        expect(
            set.hasItemInRegion([
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 20, y: 20, width: 10, height: 10 },
            ])
        ).toBe(false);
    });

    it("returns true when any rectangle in region contains a cell", () => {
        const set = new CellSet([[25, 25]]);
        expect(
            set.hasItemInRegion([
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 20, y: 20, width: 10, height: 10 },
            ])
        ).toBe(true);
    });

    it("returns false when no rectangle in region contains a cell", () => {
        const set = new CellSet([[50, 50]]);
        expect(
            set.hasItemInRegion([
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 20, y: 20, width: 10, height: 10 },
            ])
        ).toBe(false);
    });

    it("handles region with when property", () => {
        const set = new CellSet([[5, 5]]);
        expect(
            set.hasItemInRegion([
                { x: 0, y: 0, width: 10, height: 10, when: true },
                { x: 20, y: 20, width: 10, height: 10, when: false },
            ])
        ).toBe(true);
    });

    it("returns false for an empty region array", () => {
        const set = new CellSet([[5, 5]]);
        expect(set.hasItemInRegion([])).toBe(false);
    });
});

describe("CellSet.values iterator", () => {
    it("yields all items in the set", () => {
        const set = new CellSet([
            [1, 2],
            [3, 4],
            [5, 6],
        ]);
        const items = [...set.values()];
        expect(items.length).toBe(3);
        expect(items).toContainEqual([1, 2]);
        expect(items).toContainEqual([3, 4]);
        expect(items).toContainEqual([5, 6]);
    });

    it("yields nothing for empty set", () => {
        const set = new CellSet();
        const items = [...set.values()];
        expect(items).toEqual([]);
    });

    it("works with for-of loop", () => {
        const set = new CellSet([
            [0, 0],
            [1, 1],
        ]);
        const items: Item[] = [];
        for (const item of set.values()) {
            items.push(item);
        }
        expect(items.length).toBe(2);
        expect(items).toContainEqual([0, 0]);
        expect(items).toContainEqual([1, 1]);
    });
});

describe("CellSet edge cases and combinations", () => {
    it("handles negative row indices (headers)", () => {
        const set = new CellSet([
            [-1, -1],
            [0, 0],
            [5, 5],
        ]);
        expect(set.size).toBe(3);
        expect(set.has([-1, -1])).toBe(true);
        expect(set.hasHeader()).toBe(true);
    });

    it("handles large coordinate values", () => {
        const set = new CellSet([[10000, 10000]]);
        expect(set.has([10000, 10000])).toBe(true);
        expect(set.has([10000, 9999])).toBe(false);
    });

    it("chaining add/remove preserves correctness", () => {
        const set = new CellSet([[1, 1]]);
        set.add([2, 2]);
        set.add([3, 3]);
        set.remove([2, 2]);
        expect(set.size).toBe(2);
        expect(set.has([1, 1])).toBe(true);
        expect(set.has([2, 2])).toBe(false);
        expect(set.has([3, 3])).toBe(true);
    });

    it("clear then add works correctly", () => {
        const set = new CellSet([
            [1, 2],
            [3, 4],
        ]);
        set.clear();
        expect(set.size).toBe(0);
        set.add([5, 6]);
        expect(set.size).toBe(1);
        expect(set.has([5, 6])).toBe(true);
    });

    it("values() returns all items after multiple operations", () => {
        const set = new CellSet([[1, 1]]);
        set.add([2, 2]);
        set.add([3, 3]);
        set.remove([2, 2]);
        const items = [...set.values()];
        expect(items.length).toBe(2);
        expect(items).toContainEqual([1, 1]);
        expect(items).toContainEqual([3, 3]);
    });
});
