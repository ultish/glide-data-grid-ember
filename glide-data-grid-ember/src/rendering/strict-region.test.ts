// `@strictVisibleRegion` (source's `experimental.strict`). See `strict-region.ts` for why this is a
// module of its own: every bound in it is inclusive on purpose, and an off-by-one shows up only as
// an edge column that flickers grey.
import { describe, expect, test } from "vitest";
import { isOutsideStrictRegion } from "./strict-region.ts";
import type { Rectangle } from "./data-grid-types.ts";

// Columns 2..7, rows 10..19 — deliberately not anchored at the origin, so an accidental `region.x`
// drop reads as a failure rather than passing by luck.
const REGION: Rectangle = { x: 2, y: 10, width: 5, height: 9 };
const ROWS = 1000;

const outside = (col: number, row: number, freezeColumns = 0, selected?: [number, number]) =>
    isOutsideStrictRegion(col, row, REGION, ROWS, selected, freezeColumns);

describe("isOutsideStrictRegion", () => {
    test("a cell in the middle of the reported region is available", () => {
        expect(outside(4, 14)).toBe(false);
    });

    test("cells before the region are unavailable on both axes", () => {
        expect(outside(1, 14)).toBe(true);
        expect(outside(4, 9)).toBe(true);
    });

    test("the far edges are inclusive, granting one extra row and column", () => {
        // `x + width` and `y + height`, not `- 1`. Source is written this way because the last
        // row/column of the region may be only partially visible.
        expect(outside(REGION.x + REGION.width, 14)).toBe(false);
        expect(outside(4, REGION.y + REGION.height)).toBe(false);
        expect(outside(REGION.x + REGION.width + 1, 14)).toBe(true);
        expect(outside(4, REGION.y + REGION.height + 1)).toBe(true);
    });

    test("rows past the end of the data are unavailable even inside the region's span", () => {
        const atEnd: Rectangle = { x: 0, y: 995, width: 5, height: 20 };
        expect(isOutsideStrictRegion(2, 1000, atEnd, ROWS, undefined, 0)).toBe(true);
        expect(isOutsideStrictRegion(2, 999, atEnd, ROWS, undefined, 0)).toBe(false);
    });

    test("the selected cell stays available wherever it is", () => {
        expect(outside(40, 900)).toBe(true);
        expect(outside(40, 900, 0, [40, 900])).toBe(false);
        // ...and only that exact cell, not its row or column.
        expect(outside(40, 901, 0, [40, 900])).toBe(true);
        expect(outside(41, 900, 0, [40, 900])).toBe(true);
    });

    test("frozen columns are available even though the region excludes them", () => {
        // `computeVisibleRegion` deliberately reports only the scrolling block, so a frozen column
        // is always "outside" it. Without this escape hatch the frozen columns would go grey the
        // moment the grid was scrolled right.
        expect(outside(0, 14)).toBe(true);
        expect(outside(0, 14, 2)).toBe(false);
        expect(outside(1, 14, 2)).toBe(false);
        expect(outside(2, 14, 2)).toBe(false); // inside the region anyway
    });

    test("the freeze escape hatch is bounded by the region's rows, not the whole column", () => {
        // The freeze region is `{x: 0, y: region.y, width: freezeColumns, height: region.height}` —
        // a frozen column is only exempt for rows that are on screen.
        expect(outside(0, 14, 2)).toBe(false);
        expect(outside(0, 900, 2)).toBe(true);
    });

    test("freezeColumns is in consumer space, so 0 exempts nothing", () => {
        expect(outside(0, 14, 0)).toBe(true);
    });
});
