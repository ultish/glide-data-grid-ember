// Phase 9a. Tests for the grid's coordinate math: `getStickyWidth`, `getEffectiveColumns`,
// `getColumnIndexForX`, `getRowIndexForY`, `computeBounds`.
//
// THE CENTRAL TEST HERE IS THE ROUND TRIP, and it is worth explaining why. These functions come in
// inverse pairs: `computeBounds(col, row)` says where a cell is drawn, and
// `getColumnIndexForX`/`getRowIndexForY` say which cell a screen point belongs to. Every click,
// hover, drag and scroll-into-view depends on those two answers agreeing. When they disagree the
// grid does not crash or look wrong — it just quietly acts on the wrong cell.
//
// That is not hypothetical either. Phase 7e found `computeBounds` being passed `headerHeight` where
// it wanted `totalHeaderHeight`, a regression introduced by Phase 7b's column grouping: with a group
// header present, every click resolved one row off. It was invisible until someone clicked.
//
// So rather than asserting hard-coded pixel values (which mostly restate the arithmetic), the core
// tests below assert the *invariant*: for a given cell, a point inside its computed rectangle must
// hit-test back to that same cell. A test like that fails loudly for the whole class of off-by-a-
// header-height bugs, whatever their cause.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import {
    computeBounds,
    getColumnIndexForX,
    getEffectiveColumns,
    getRowIndexForY,
    getStickyWidth,
    type MappedGridColumn,
} from "./data-grid-lib.ts";

function col(sourceIndex: number, width: number, sticky = false): MappedGridColumn {
    return { title: `C${sourceIndex}`, width, sourceIndex, sticky } as unknown as MappedGridColumn;
}

/** Six 100px columns, the first `frozen` of them sticky. */
function columns(frozen = 0): MappedGridColumn[] {
    return Array.from({ length: 6 }, (_, i) => col(i, 100, i < frozen));
}

// A grid geometry used by the round-trip tests. Deliberately includes a group header, since that is
// where the Phase 7e regression lived.
const GEO = {
    width: 600,
    height: 400,
    headerHeight: 36,
    groupHeaderHeight: 28,
    rowHeight: 34,
    rows: 100,
};
const TOTAL_HEADER = GEO.headerHeight + GEO.groupHeaderHeight;

describe("getStickyWidth", () => {
    it("is zero when no column is sticky", () => {
        expect(getStickyWidth(columns(0))).toBe(0);
    });

    it("sums the leading sticky columns", () => {
        expect(getStickyWidth(columns(2))).toBe(200);
    });

    it("stops at the first non-sticky column", () => {
        // A sticky column after a non-sticky one is not counted -- stickiness is a prefix, not a
        // per-column property the sum scans for.
        const cols = [col(0, 100, true), col(1, 100, false), col(2, 100, true)];
        expect(getStickyWidth(cols)).toBe(100);
    });
});

describe("getColumnIndexForX", () => {
    const cols = columns(0);

    it.each([
        [0, 0],
        [50, 0],
        [100, 0], // right edge is inclusive: `targetX <= cx + width`
        [101, 1],
        [250, 2],
    ])("x=%i resolves to column %i", (x, expected) => {
        expect(getColumnIndexForX(x, cols)).toBe(expected);
    });

    it("returns -1 past the last column", () => {
        expect(getColumnIndexForX(10_000, cols)).toBe(-1);
    });

    it("returns the sourceIndex, not the array position", () => {
        // `effectiveColumns` is a *window* onto the full column list, so its array indices are not
        // column indices. Returning the position instead of `sourceIndex` would mis-resolve every
        // click once the grid is scrolled horizontally.
        const windowed = [col(4, 100), col(5, 100)];
        expect(getColumnIndexForX(50, windowed)).toBe(4);
        expect(getColumnIndexForX(150, windowed)).toBe(5);
    });

    it("offsets non-sticky columns by translateX but leaves sticky ones alone", () => {
        const cols2 = [col(0, 100, true), col(1, 100, false)];
        // The sticky column ignores translateX, so it still occupies x 0..100 -- and because it is
        // checked first it claims any point in that band, even one the scrolled non-sticky column
        // now sits underneath. That overlap is the point of stickiness, not a bug.
        expect(getColumnIndexForX(60, cols2, -50)).toBe(0);
        // Past the sticky band, the non-sticky column has shifted left by 50, so it spans 50..150
        // and x=110 lands in it.
        expect(getColumnIndexForX(110, cols2, -50)).toBe(1);
    });
});

describe("getRowIndexForY", () => {
    const call = (targetY: number, hasGroups = true) =>
        getRowIndexForY(
            targetY,
            GEO.height,
            hasGroups,
            GEO.headerHeight,
            hasGroups ? GEO.groupHeaderHeight : 0,
            GEO.rows,
            GEO.rowHeight,
            0,
            0,
            0
        );

    it("returns -2 inside the group header", () => {
        expect(call(10)).toBe(-2);
    });

    it("returns -1 inside the column header", () => {
        expect(call(GEO.groupHeaderHeight + 10)).toBe(-1);
    });

    it("returns 0 for the first body row", () => {
        expect(call(TOTAL_HEADER + 1)).toBe(0);
    });

    it("returns undefined past the last row", () => {
        expect(call(TOTAL_HEADER + GEO.rowHeight * 200)).toBeUndefined();
    });

    it("has no group-header band when hasGroups is false", () => {
        // Same y that was -2 above is now inside the ordinary header.
        expect(call(10, false)).toBe(-1);
    });

    it("resolves frozen trailing rows against the bottom edge, not the scroll offset", () => {
        const row = getRowIndexForY(
            GEO.height - 5, // 5px above the bottom
            GEO.height,
            false,
            GEO.headerHeight,
            0,
            GEO.rows,
            GEO.rowHeight,
            0,
            0,
            2 // last two rows are frozen to the bottom
        );
        expect(row).toBe(GEO.rows - 1);
    });

    it("supports a variable row-height function", () => {
        const varHeight = (i: number) => (i % 2 === 0 ? 20 : 60);
        const at = (y: number) =>
            getRowIndexForY(y, GEO.height, false, GEO.headerHeight, 0, GEO.rows, varHeight, 0, 0, 0);
        // Row 0 occupies 20px after the header, row 1 the next 60px.
        expect(at(GEO.headerHeight + 10)).toBe(0);
        expect(at(GEO.headerHeight + 40)).toBe(1);
    });
});

describe("computeBounds", () => {
    const bounds = (c: number, r: number, cols = columns(0), cellXOffset = 0, cellYOffset = 0) =>
        computeBounds(
            c,
            r,
            GEO.width,
            GEO.height,
            GEO.groupHeaderHeight,
            TOTAL_HEADER,
            cellXOffset,
            cellYOffset,
            0,
            0,
            GEO.rows,
            0,
            0,
            cols,
            GEO.rowHeight
        );

    it("places the first cell just below the full header", () => {
        const r = bounds(0, 0);
        expect(r.x).toBe(0);
        expect(r.y).toBe(TOTAL_HEADER);
        // Note the +1 on both axes: `computeBounds` ends with `result.width += 1` /
        // `result.height += 1` so adjacent cell rects overlap by a pixel and share their gridline.
        // Callers measuring "the width of a cell" from this will be one out if they don't expect it.
        expect(r.height).toBe(GEO.rowHeight + 1);
        expect(r.width).toBe(100 + 1);
    });

    it("advances x by the widths of preceding columns", () => {
        expect(bounds(2, 0).x).toBe(200);
    });

    it("advances y by the heights of preceding rows", () => {
        expect(bounds(0, 3).y).toBe(TOTAL_HEADER + 3 * GEO.rowHeight);
    });

    it("returns an empty rect for an out-of-range cell rather than throwing", () => {
        const r = bounds(99, 0);
        expect(r.width).toBe(0);
        expect(r.height).toBe(0);
    });
});

// ---------------------------------------------------------------------------------------------
// The round trip. This is the part that earns its keep.
// ---------------------------------------------------------------------------------------------
describe("computeBounds <-> hit-test round trip", () => {
    const CASES: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [1, 0],
        [3, 5],
        [5, 42],
        [2, 99],
    ];

    it.each(CASES)("a point inside cell [%i,%i]'s rect hit-tests back to that cell", (c, r) => {
        const cols = columns(0);
        const rect = computeBounds(
            c,
            r,
            GEO.width,
            GEO.height,
            GEO.groupHeaderHeight,
            TOTAL_HEADER,
            0,
            0,
            0,
            0,
            GEO.rows,
            0,
            0,
            cols,
            GEO.rowHeight
        );

        // Aim at the middle of the returned rectangle.
        const px = rect.x + rect.width / 2;
        const py = rect.y + rect.height / 2;

        expect(getColumnIndexForX(px, cols)).toBe(c);
        expect(
            getRowIndexForY(
                py,
                GEO.height,
                true,
                GEO.headerHeight,
                GEO.groupHeaderHeight,
                GEO.rows,
                GEO.rowHeight,
                0,
                0,
                0
            )
        ).toBe(r);
    });

    it("REGRESSION (Phase 7e): passing headerHeight where totalHeaderHeight is wanted shifts the hit test", () => {
        // The actual Phase 7e defect, reproduced deliberately so the failure mode is documented and
        // the round-trip tests above are demonstrably sensitive to it. `computeBounds` is given
        // `headerHeight` (36) instead of `totalHeaderHeight` (64) while the hit test still accounts
        // for the group header -- the rect lands 28px too high and resolves to the wrong row.
        const cols = columns(0);
        const wrong = computeBounds(
            0,
            5,
            GEO.width,
            GEO.height,
            GEO.groupHeaderHeight,
            GEO.headerHeight, // <-- the bug
            0,
            0,
            0,
            0,
            GEO.rows,
            0,
            0,
            cols,
            GEO.rowHeight
        );
        const hit = getRowIndexForY(
            wrong.y + wrong.height / 2,
            GEO.height,
            true,
            GEO.headerHeight,
            GEO.groupHeaderHeight,
            GEO.rows,
            GEO.rowHeight,
            0,
            0,
            0
        );
        expect(hit).not.toBe(5);
    });

    it("round-trips with frozen columns, where x is measured from the sticky edge", () => {
        const cols = columns(2); // first two columns sticky
        const target = 4;
        // `cellXOffset` MUST start at `freezeColumns`, not 0. Passing 0 here makes `computeBounds`
        // walk from column 0 and add the two frozen widths a second time on top of `getStickyWidth`,
        // pushing the rect a full 200px off the end of the grid. That exact mistake was a real
        // defect in this port -- Phase 7e, "cellXOffset initialised to 0 instead of freezeColumns".
        const cellXOffset = 2;
        const rect = computeBounds(
            target,
            0,
            GEO.width,
            GEO.height,
            GEO.groupHeaderHeight,
            TOTAL_HEADER,
            cellXOffset,
            0,
            0,
            0,
            GEO.rows,
            2,
            0,
            cols,
            GEO.rowHeight
        );
        const effective = getEffectiveColumns(cols, cellXOffset, GEO.width);
        expect(getColumnIndexForX(rect.x + rect.width / 2, effective)).toBe(target);
    });
});

describe("getEffectiveColumns", () => {
    it("always includes the sticky prefix", () => {
        const effective = getEffectiveColumns(columns(2), 4, 600);
        expect(effective.slice(0, 2).map(c => c.sourceIndex)).toEqual([0, 1]);
    });

    it("includes the scrolled-to columns after the sticky ones", () => {
        const effective = getEffectiveColumns(columns(2), 4, 600);
        expect(effective.map(c => c.sourceIndex)).toContain(4);
    });

    it("does not duplicate a sticky column that is also in the scrolled window", () => {
        // `cellXOffset` 0 means the window starts at column 0, which is also sticky. Emitting it
        // twice would double-count its width in every downstream x calculation.
        const effective = getEffectiveColumns(columns(2), 0, 600);
        const zeros = effective.filter(c => c.sourceIndex === 0).length;
        expect(zeros).toBe(1);
    });
});
