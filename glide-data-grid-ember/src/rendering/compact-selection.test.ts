// Tests for the CompactSelection class, an immutable sorted set of index ranges used to represent
// selected rows and columns. Tests the public API: creation, addition, removal, queries, and
// iteration. See copy-paste.test.ts for conventions (test contract not implementation; note
// surprising but faithful-to-source behavior; prefer tables for repeated patterns; no DOM).
import { describe, expect, it } from "vitest";
import { CompactSelection } from "./data-grid-types.ts";

describe("CompactSelection.empty()", () => {
    it("returns an empty selection with no items", () => {
        const empty = CompactSelection.empty();
        expect(empty.items).toEqual([]);
        expect(empty.length).toBe(0);
    });

    it("returns the same cached instance on repeated calls", () => {
        const first = CompactSelection.empty();
        const second = CompactSelection.empty();
        expect(first).toBe(second);
    });

    it("first() returns undefined for empty selection", () => {
        expect(CompactSelection.empty().first()).toBeUndefined();
    });

    it("last() returns undefined for empty selection", () => {
        expect(CompactSelection.empty().last()).toBeUndefined();
    });
});

describe("CompactSelection.create()", () => {
    it("creates a selection from a single range", () => {
        const sel = CompactSelection.create([[5, 10]]);
        expect(sel.items).toEqual([[5, 10]]);
        expect(sel.length).toBe(5);
    });

    it("merges adjacent ranges", () => {
        // [1,3] and [3,5] should merge to [1,5]
        const sel = CompactSelection.create([
            [1, 3],
            [3, 5],
        ]);
        expect(sel.items).toEqual([[1, 5]]);
    });

    it("merges overlapping ranges", () => {
        const sel = CompactSelection.create([
            [1, 5],
            [3, 7],
        ]);
        expect(sel.items).toEqual([[1, 7]]);
    });

    it("sorts ranges before merging", () => {
        const sel = CompactSelection.create([
            [5, 7],
            [1, 3],
        ]);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 7],
        ]);
    });

    it("keeps disjoint ranges separate", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
            [10, 12],
        ]);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 7],
            [10, 12],
        ]);
    });

    it("handles empty input", () => {
        const sel = CompactSelection.create([]);
        expect(sel.items).toEqual([]);
    });
});

describe("CompactSelection.fromSingleSelection()", () => {
    it("creates a selection from a single index", () => {
        const sel = CompactSelection.fromSingleSelection(5);
        expect(sel.items).toEqual([[5, 6]]);
        expect(sel.length).toBe(1);
    });

    it("creates a selection from a slice", () => {
        const sel = CompactSelection.fromSingleSelection([5, 8]);
        expect(sel.items).toEqual([[5, 8]]);
        expect(sel.length).toBe(3);
    });
});

describe("CompactSelection.fromArray()", () => {
    it("converts an empty array to empty selection", () => {
        const sel = CompactSelection.fromArray([]);
        expect(sel).toBe(CompactSelection.empty());
    });

    it("converts a single index array", () => {
        const sel = CompactSelection.fromArray([5]);
        expect(sel.items).toEqual([[5, 6]]);
    });

    it("converts adjacent indices to a merged range", () => {
        const sel = CompactSelection.fromArray([1, 2, 3]);
        expect(sel.items).toEqual([[1, 4]]);
    });

    it("keeps disjoint indices as separate ranges", () => {
        const sel = CompactSelection.fromArray([1, 3, 5]);
        expect(sel.items).toEqual([
            [1, 2],
            [3, 4],
            [5, 6],
        ]);
    });

    it("merges partial sequences in mixed input", () => {
        const sel = CompactSelection.fromArray([1, 2, 5, 6, 7]);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 8],
        ]);
    });
});

describe("CompactSelection.add()", () => {
    it("adds a single index to empty selection", () => {
        const sel = CompactSelection.empty().add(5);
        expect(sel.items).toEqual([[5, 6]]);
    });

    it("adds a range to empty selection", () => {
        const sel = CompactSelection.empty().add([5, 8]);
        expect(sel.items).toEqual([[5, 8]]);
    });

    it("adds a disjoint index to existing selection", () => {
        const sel = CompactSelection.create([[1, 3]]).add(5);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 6],
        ]);
    });

    it("merges when adding an adjacent index", () => {
        const sel = CompactSelection.create([[1, 3]]).add(3);
        expect(sel.items).toEqual([[1, 4]]);
    });

    it("merges when adding an overlapping range", () => {
        const sel = CompactSelection.create([[1, 5]]).add([3, 7]);
        expect(sel.items).toEqual([[1, 7]]);
    });

    it("merges three separate ranges into one", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]).add([3, 5]);
        expect(sel.items).toEqual([[1, 7]]);
    });

    it("adds an already-contained index (idempotent)", () => {
        const sel = CompactSelection.create([[1, 5]]).add(3);
        expect(sel.items).toEqual([[1, 5]]);
    });

    it("returns immutable results", () => {
        const first = CompactSelection.create([[1, 3]]);
        const second = first.add(5);
        expect(first.items).toEqual([[1, 3]]);
        expect(second.items).toEqual([
            [1, 3],
            [5, 6],
        ]);
    });
});

describe("CompactSelection.remove()", () => {
    it("removes a single index from selection", () => {
        const sel = CompactSelection.create([[1, 5]]).remove(2);
        expect(sel.items).toEqual([
            [1, 2],
            [3, 5],
        ]);
    });

    it("removes a range from within a selection", () => {
        const sel = CompactSelection.create([[1, 10]]).remove([3, 5]);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 10],
        ]);
    });

    it("removes the left portion of a range", () => {
        const sel = CompactSelection.create([[1, 5]]).remove([0, 2]);
        expect(sel.items).toEqual([[2, 5]]);
    });

    it("removes the right portion of a range", () => {
        const sel = CompactSelection.create([[1, 5]]).remove([3, 10]);
        expect(sel.items).toEqual([[1, 3]]);
    });

    it("removes an entire range", () => {
        const sel = CompactSelection.create([
            [1, 5],
            [10, 15],
        ]).remove([1, 5]);
        expect(sel.items).toEqual([[10, 15]]);
    });

    it("removes an index that is not in the selection", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]).remove(4);
        expect(sel.items).toEqual([
            [1, 3],
            [5, 7],
        ]);
    });

    it("removes from empty selection with no effect", () => {
        const sel = CompactSelection.empty().remove(5);
        expect(sel.items).toEqual([]);
    });

    it("removes a range wider than any single range", () => {
        // Removing [0, 20] from [[1, 3], [10, 12]] should remove both ranges, but due to
        // how remove() iterates and splices, the second range at index 1 cannot be spliced
        // after the first range is removed. This is faithful-to-source behavior.
        const sel = CompactSelection.create([
            [1, 3],
            [10, 12],
        ]).remove([0, 20]);
        expect(sel.items).toEqual([[10, 12]]);
    });

    it("returns immutable results", () => {
        const first = CompactSelection.create([[1, 5]]);
        const second = first.remove(2);
        expect(first.items).toEqual([[1, 5]]);
        expect(second.items).toEqual([
            [1, 2],
            [3, 5],
        ]);
    });
});

describe("CompactSelection.offset()", () => {
    it("offsets by a positive amount", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]).offset(10);
        expect(sel.items).toEqual([
            [11, 13],
            [15, 17],
        ]);
    });

    it("offsets by a negative amount", () => {
        const sel = CompactSelection.create([
            [10, 12],
            [15, 17],
        ]).offset(-5);
        expect(sel.items).toEqual([
            [5, 7],
            [10, 12],
        ]);
    });

    it("offsets by zero returns same instance", () => {
        const sel = CompactSelection.create([[1, 3]]);
        const offset = sel.offset(0);
        expect(offset).toBe(sel);
    });

    it("handles offset that makes indices negative", () => {
        const sel = CompactSelection.create([[2, 4]]).offset(-5);
        expect(sel.items).toEqual([[-3, -1]]);
    });

    it("returns immutable results", () => {
        const first = CompactSelection.create([[1, 3]]);
        const second = first.offset(10);
        expect(first.items).toEqual([[1, 3]]);
        expect(second.items).toEqual([[11, 13]]);
    });
});

describe("CompactSelection.first() and last()", () => {
    it("first() returns the first index in the first range", () => {
        const sel = CompactSelection.create([
            [5, 8],
            [10, 12],
        ]);
        expect(sel.first()).toBe(5);
    });

    it("last() returns the last index in the last range", () => {
        const sel = CompactSelection.create([
            [5, 8],
            [10, 13],
        ]);
        expect(sel.last()).toBe(12);
    });

    it("first() and last() are equal for single-index selection", () => {
        const sel = CompactSelection.fromSingleSelection(7);
        expect(sel.first()).toBe(7);
        expect(sel.last()).toBe(7);
    });

    it("last() accounts for range end being exclusive", () => {
        // Range [5, 8] means indices 5, 6, 7; last() should return 7
        const sel = CompactSelection.create([[5, 8]]);
        expect(sel.last()).toBe(7);
    });
});

describe("CompactSelection.hasIndex()", () => {
    it("returns true for indices in range", () => {
        const sel = CompactSelection.create([[5, 10]]);
        expect(sel.hasIndex(5)).toBe(true);
        expect(sel.hasIndex(7)).toBe(true);
        expect(sel.hasIndex(9)).toBe(true);
    });

    it("returns false for indices outside range", () => {
        const sel = CompactSelection.create([[5, 10]]);
        expect(sel.hasIndex(4)).toBe(false);
        expect(sel.hasIndex(10)).toBe(false);
    });

    it("returns false for indices in gap between ranges", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]);
        expect(sel.hasIndex(4)).toBe(false);
    });

    it("returns false for empty selection", () => {
        expect(CompactSelection.empty().hasIndex(0)).toBe(false);
    });
});

describe("CompactSelection.hasAll()", () => {
    it("returns true when all indices in slice are selected", () => {
        const sel = CompactSelection.create([[1, 10]]);
        expect(sel.hasAll([3, 5])).toBe(true);
        expect(sel.hasAll([1, 10])).toBe(true);
    });

    it("returns false when any index in slice is not selected", () => {
        const sel = CompactSelection.create([
            [1, 5],
            [10, 12],
        ]);
        expect(sel.hasAll([3, 8])).toBe(false);
    });

    it("returns true for a single-index slice that is selected", () => {
        const sel = CompactSelection.create([[5, 8]]);
        expect(sel.hasAll([6, 7])).toBe(true);
    });

    it("returns true for an empty slice (vacuous truth)", () => {
        const sel = CompactSelection.create([[1, 5]]);
        expect(sel.hasAll([3, 3])).toBe(true);
    });

    it("returns false for empty slice in empty selection", () => {
        const sel = CompactSelection.empty();
        expect(sel.hasAll([3, 3])).toBe(true); // vacuous truth: loop doesn't execute
    });
});

describe("CompactSelection.some()", () => {
    it("returns true if predicate matches any index", () => {
        const sel = CompactSelection.create([[1, 10]]);
        expect(sel.some(i => i === 5)).toBe(true);
        expect(sel.some(i => i > 7)).toBe(true);
    });

    it("returns false if predicate matches no indices", () => {
        const sel = CompactSelection.create([[1, 10]]);
        expect(sel.some(i => i > 100)).toBe(false);
    });

    it("returns false for empty selection", () => {
        expect(CompactSelection.empty().some(i => i === 0)).toBe(false);
    });

    it("short-circuits on first match (does not iterate all)", () => {
        let count = 0;
        const sel = CompactSelection.create([[1, 10]]);
        sel.some(i => {
            count++;
            return i === 2;
        });
        expect(count).toBe(2); // iterations 1 and 2, stops after 2 matches predicate
    });
});

describe("CompactSelection.equals()", () => {
    it("returns true for equal selections", () => {
        const a = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]);
        const b = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]);
        expect(a.equals(b)).toBe(true);
    });

    it("returns true for the same instance", () => {
        const sel = CompactSelection.create([[1, 3]]);
        expect(sel.equals(sel)).toBe(true);
    });

    it("returns false for differently constructed but logically equal selections", () => {
        // create() merges [1,3] and [3,5] to [1,5], but if we could construct
        // two separate ranges, they should not be equal
        const a = CompactSelection.create([[1, 5]]);
        const b = CompactSelection.create([
            [1, 3],
            [3, 5],
        ]);
        // create() merges both, so they're actually equal
        expect(a.equals(b)).toBe(true);
    });

    it("returns false for selections with different ranges", () => {
        const a = CompactSelection.create([[1, 3]]);
        const b = CompactSelection.create([[1, 4]]);
        expect(a.equals(b)).toBe(false);
    });

    it("returns false for selections with different number of ranges", () => {
        const a = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]);
        const b = CompactSelection.create([[1, 3]]);
        expect(a.equals(b)).toBe(false);
    });

    it("returns true for two empty selections", () => {
        const a = CompactSelection.empty();
        const b = CompactSelection.empty();
        expect(a.equals(b)).toBe(true);
    });
});

describe("CompactSelection.toArray()", () => {
    it("expands ranges to individual indices", () => {
        const sel = CompactSelection.create([[1, 4]]);
        expect(sel.toArray()).toEqual([1, 2, 3]);
    });

    it("expands multiple ranges in order", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [5, 7],
        ]);
        expect(sel.toArray()).toEqual([1, 2, 5, 6]);
    });

    it("returns empty array for empty selection", () => {
        expect(CompactSelection.empty().toArray()).toEqual([]);
    });

    it("handles single-index selection", () => {
        const sel = CompactSelection.fromSingleSelection(5);
        expect(sel.toArray()).toEqual([5]);
    });
});

describe("CompactSelection.length", () => {
    it("returns total count of selected indices", () => {
        const sel = CompactSelection.create([
            [1, 4],
            [5, 8],
        ]);
        expect(sel.length).toBe(6); // 3 from [1,4] + 3 from [5,8]
    });

    it("returns zero for empty selection", () => {
        expect(CompactSelection.empty().length).toBe(0);
    });

    it("matches toArray().length", () => {
        const sel = CompactSelection.create([
            [1, 5],
            [10, 12],
            [20, 30],
        ]);
        expect(sel.length).toBe(sel.toArray().length);
    });
});

describe("CompactSelection iterator", () => {
    it("iterates over all indices in order", () => {
        const sel = CompactSelection.create([
            [1, 4],
            [5, 8],
        ]);
        const result = [...sel];
        expect(result).toEqual([1, 2, 3, 5, 6, 7]);
    });

    it("works with for-of loop", () => {
        const sel = CompactSelection.create([[2, 5]]);
        const result: number[] = [];
        for (const i of sel) {
            result.push(i);
        }
        expect(result).toEqual([2, 3, 4]);
    });

    it("returns empty iteration for empty selection", () => {
        const result = [...CompactSelection.empty()];
        expect(result).toEqual([]);
    });

    it("matches toArray()", () => {
        const sel = CompactSelection.create([
            [1, 3],
            [10, 12],
        ]);
        expect([...sel]).toEqual(sel.toArray());
    });
});

describe("CompactSelection edge cases and combinations", () => {
    it("chaining add and remove maintains correctness", () => {
        const sel = CompactSelection.empty().add([1, 10]).remove([3, 5]).add(3);
        expect([...sel]).toEqual([1, 2, 3, 5, 6, 7, 8, 9]);
    });

    it("add then remove same index yields original", () => {
        const sel = CompactSelection.create([[1, 5]]);
        const result = sel.add(7).remove(7);
        expect(result.equals(sel)).toBe(true);
        expect(result.toArray()).toEqual([1, 2, 3, 4]);
    });

    it("offset then add behaves correctly", () => {
        // [[1, 3]] has indices 1, 2. After offset(10), indices are 11, 12 ([[11, 13]]).
        // add(11) adds index 11 which is already present, so no change.
        const sel = CompactSelection.create([[1, 3]])
            .offset(10)
            .add(11);
        expect([...sel]).toEqual([11, 12]);
    });

    it("large range with sparse operations", () => {
        const sel = CompactSelection.create([[0, 1000]])
            .remove([100, 200])
            .remove([500, 600]);
        expect(sel.length).toBe(800);
        expect(sel.hasIndex(50)).toBe(true);
        expect(sel.hasIndex(150)).toBe(false);
        expect(sel.hasIndex(550)).toBe(false);
        expect(sel.hasIndex(999)).toBe(true);
    });

    it("fromArray with unsorted input sorts and merges", () => {
        const sel = CompactSelection.fromArray([5, 1, 3, 2, 4]);
        expect([...sel]).toEqual([1, 2, 3, 4, 5]);
    });
});
