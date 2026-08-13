// Row grouping. See `row-grouping.ts` for why this is a pure module: the arithmetic below is three
// coordinate spaces deep (row index / originalIndex / contentIndex) and an off-by-one in any of them
// shows up only as "the marker numbers look a bit wrong", which nothing but a test pins down.
import { describe, expect, test } from "vitest";
import {
    effectiveRowCount,
    expandRowGroups,
    flattenRowGroups,
    getRowGroupingForPath,
    getSelectionRowLimits,
    makeRowHeight,
    makeRowNumberMapper,
    makeRowThemeOverride,
    mapRowIndexToPath,
    rowGroupingApi,
    skipGroupHeaders,
    updateRowGroupingByPath,
    type RowGroup,
    type RowGroupingOptions,
} from "./row-grouping.ts";

const ROWS = 30;

// Three top-level groups over 30 rows, the middle one carrying two subgroups. Deliberately not
// uniform: group sizes 9 / 3 / 5 / 4 / 4 differ, so a mixed-up index reads as a failure instead of
// passing by luck.
//
//   headerIndex  0 ── group A, 9 content rows
//   headerIndex 10 ── group B, 3 content rows
//   headerIndex 14 ──   subgroup B0, 5 content rows
//   headerIndex 20 ──   subgroup B1, 4 content rows
//   headerIndex 25 ── group C, 4 content rows
const groups = (overrides: { b?: boolean; a?: boolean } = {}): readonly RowGroup[] => [
    { headerIndex: 0, isCollapsed: overrides.a ?? false },
    {
        headerIndex: 10,
        isCollapsed: overrides.b ?? false,
        subGroups: [
            { headerIndex: 14, isCollapsed: false },
            { headerIndex: 20, isCollapsed: false },
        ],
    },
    { headerIndex: 25, isCollapsed: false },
];

const options = (overrides: Partial<RowGroupingOptions> = {}): RowGroupingOptions => ({
    groups: groups(),
    height: 55,
    ...overrides,
});

const flatten = (o: RowGroupingOptions = options()) => flattenRowGroups(o, ROWS);

describe("expandRowGroups", () => {
    test("stamps depth and the sibling path, and sorts each level by headerIndex", () => {
        const expanded = expandRowGroups([
            { headerIndex: 20, isCollapsed: false },
            { headerIndex: 5, isCollapsed: false, subGroups: [{ headerIndex: 9, isCollapsed: false }] },
        ]);

        expect(expanded.map(g => g.headerIndex)).toEqual([5, 20]);
        // The path is the index in the caller's ORIGINAL array order, captured before the sort —
        // which is what makes `updateRowGroupingByPath` able to address the caller's own tree.
        expect(expanded[0]!.path).toEqual([1]);
        expect(expanded[1]!.path).toEqual([0]);
        expect(expanded[0]!.subGroups?.[0]).toMatchObject({ depth: 1, path: [1, 0] });
    });

    test("accepts the bare-number shorthand as an expanded group", () => {
        expect(expandRowGroups([7])[0]).toMatchObject({ headerIndex: 7, isCollapsed: false, depth: 0 });
    });
});

describe("flattenRowGroups", () => {
    test("orders groups depth-first and sizes each one to the next header at its level", () => {
        expect(flatten().map(g => [g.headerIndex, g.rows])).toEqual([
            [0, 9],
            // B stops at its first subgroup's header (14), not at the next top-level header (25).
            [10, 3],
            [14, 5],
            [20, 4],
            // The last group runs to the end of the data.
            [25, 4],
        ]);
    });

    test("content indices are contiguous and account for every non-header row", () => {
        const f = flatten();
        expect(f.map(g => g.contentIndex)).toEqual([0, 9, 12, 17, 21]);
        // 30 rows minus the 5 header rows.
        expect(f.at(-1)!.contentIndex + f.at(-1)!.rows).toBe(25);
    });

    test("with everything expanded, row indices match the caller's own row space", () => {
        expect(flatten().map(g => g.rowIndex)).toEqual([0, 10, 14, 20, 25]);
        expect(effectiveRowCount(flatten(), ROWS)).toBe(ROWS);
    });

    test("a collapsed group hides its content rows but keeps its header", () => {
        const f = flatten(options({ groups: groups({ a: true }) }));
        expect(effectiveRowCount(f, ROWS)).toBe(ROWS - 9);
        expect(f.map(g => g.rowIndex)).toEqual([0, 1, 5, 11, 16]);
    });

    test("collapsing a group drops its subgroups but not their content indices", () => {
        const f = flatten(options({ groups: groups({ b: true }) }));

        // B's two subgroups are gone from the list entirely.
        expect(f.map(g => g.headerIndex)).toEqual([0, 10, 25]);
        // 30 rows, less B's 3 content rows and both subgroups' headers and content (1+5+1+4).
        expect(effectiveRowCount(f, ROWS)).toBe(16);
        // contentIndex still counts the hidden rows, so a row keeps its number when a group above it
        // folds. This is source's behaviour and is deliberate — see the module.
        expect(f.map(g => g.contentIndex)).toEqual([0, 9, 21]);
    });

    // Regression pin for the one repair this port makes to source. `rowIndex` and
    // `mapRowIndexToPath` are two computations of the same quantity; source lets them disagree
    // whenever a group with subgroups is collapsed, because its `rowIndex` pass runs over the
    // unfiltered list. Source reports 22 here, in a grid that is 16 rows tall.
    test("rowIndex agrees with the mapper even when a parent group is collapsed", () => {
        const f = flatten(options({ groups: groups({ b: true }) }));

        for (const g of f) {
            const mapped = mapRowIndexToPath(g.rowIndex, f);
            expect(mapped.isGroupHeader).toBe(true);
            expect(mapped.originalIndex).toBe(g.headerIndex);
        }

        expect(f.map(g => g.rowIndex)).toEqual([0, 10, 11]);
        expect(f.at(-1)!.rowIndex).toBeLessThan(effectiveRowCount(f, ROWS));
    });
});

describe("mapRowIndexToPath", () => {
    test("returns the identity mapping when there is no grouping", () => {
        expect(mapRowIndexToPath(7, undefined)).toEqual({
            path: [7],
            originalIndex: 7,
            isGroupHeader: false,
            groupIndex: 7,
            contentIndex: 7,
            groupRows: -1,
        });
        // Source guards this case by reading `.length` off the flatten *function* rather than the
        // array, so an empty array falls through to the loop. Inert — it lands on the same
        // fallback — but written correctly here.
        expect(mapRowIndexToPath(7, [])).toMatchObject({ originalIndex: 7, isGroupHeader: false });
    });

    test("identifies header rows and reports the group's size", () => {
        const f = flatten();
        expect(mapRowIndexToPath(0, f)).toMatchObject({ isGroupHeader: true, path: [0, -1], groupRows: 9 });
        expect(mapRowIndexToPath(10, f)).toMatchObject({ isGroupHeader: true, path: [1, -1], groupRows: 3 });
        expect(mapRowIndexToPath(14, f)).toMatchObject({ isGroupHeader: true, path: [1, 0, -1], groupRows: 5 });
        expect(mapRowIndexToPath(25, f)).toMatchObject({ isGroupHeader: true, path: [2, -1], groupRows: 4 });
    });

    test("content rows carry their original index and their index within the group", () => {
        const f = flatten();
        expect(mapRowIndexToPath(1, f)).toMatchObject({
            isGroupHeader: false,
            path: [0, 0],
            originalIndex: 1,
            groupIndex: 0,
            contentIndex: 0,
        });
        expect(mapRowIndexToPath(15, f)).toMatchObject({
            path: [1, 0, 0],
            originalIndex: 15,
            groupIndex: 0,
            contentIndex: 12,
        });
        expect(mapRowIndexToPath(29, f)).toMatchObject({ path: [2, 3], originalIndex: 29, contentIndex: 24 });
    });

    test("with everything expanded, row index and original index coincide", () => {
        const f = flatten();
        for (let row = 0; row < ROWS; row++) {
            expect(mapRowIndexToPath(row, f).originalIndex).toBe(row);
        }
    });

    test("a collapse shifts every row below it onto the hidden group's successor", () => {
        const f = flatten(options({ groups: groups({ a: true }) }));
        // Group A's 9 content rows are gone, so row 1 is now B's header.
        expect(mapRowIndexToPath(1, f)).toMatchObject({ isGroupHeader: true, originalIndex: 10 });
        expect(mapRowIndexToPath(2, f)).toMatchObject({ isGroupHeader: false, originalIndex: 11, contentIndex: 9 });
    });

    test("a row past the last group falls back to the identity mapping rather than throwing", () => {
        // The grid does ask for these — a trailing blank row, or a hit test that lands mid-collapse.
        expect(mapRowIndexToPath(ROWS, flatten())).toMatchObject({ originalIndex: ROWS, isGroupHeader: false });
    });
});

describe("makeRowNumberMapper", () => {
    test("returns undefined on header rows and the content index elsewhere", () => {
        const mapper = makeRowNumberMapper(flatten());
        expect(mapper(0)).toBeUndefined();
        expect(mapper(10)).toBeUndefined();
        expect(mapper(14)).toBeUndefined();

        // The point of the whole mapper: numbering runs 0,1,2… straight through the headers rather
        // than burning a number on each one.
        expect(mapper(1)).toBe(0);
        expect(mapper(9)).toBe(8);
        expect(mapper(11)).toBe(9);
        expect(mapper(15)).toBe(12);
    });

    test("every visible content row gets a distinct number", () => {
        const f = flatten();
        const numbers = [...Array(effectiveRowCount(f, ROWS)).keys()]
            .map(r => makeRowNumberMapper(f)(r))
            .filter((n): n is number => n !== undefined);
        expect(numbers).toEqual([...Array(25).keys()]);
    });
});

describe("makeRowHeight", () => {
    test("hands back the plain number when the group height already matches it", () => {
        // Identity matters: `computeCanBlit` compares `rowHeight` by ===, so returning a fresh
        // closure here would silently disable the scroll blit fast path.
        expect(makeRowHeight(flatten(), options({ height: 34 }), 34)).toBe(34);
    });

    test("gives header rows the group height and leaves the rest alone", () => {
        const rowHeight = makeRowHeight(flatten(), options(), 34) as (row: number) => number;
        expect(rowHeight(0)).toBe(55);
        expect(rowHeight(14)).toBe(55);
        expect(rowHeight(1)).toBe(34);
        expect(rowHeight(29)).toBe(34);
    });

    test("defers to a variable row height for non-header rows", () => {
        const rowHeight = makeRowHeight(flatten(), options(), r => 20 + r) as (row: number) => number;
        expect(rowHeight(0)).toBe(55);
        expect(rowHeight(3)).toBe(23);
    });
});

describe("makeRowThemeOverride", () => {
    test("stays undefined when there is no theming to do", () => {
        // Also a rule-1 concern: an undefined arg keeps the blit fast path open.
        expect(makeRowThemeOverride(flatten(), options(), undefined)).toBeUndefined();
    });

    test("themes header rows and passes content rows to the consumer with all three indices", () => {
        const seen: number[][] = [];
        const themeOverride = { bgCell: "#eee" };
        const cb = makeRowThemeOverride(flatten(), options({ themeOverride }), (row, groupIndex, contentIndex) => {
            seen.push([row, groupIndex, contentIndex]);
            return { bgCell: "#fff" };
        })!;

        expect(cb(0)).toBe(themeOverride);
        expect(cb(15)).toEqual({ bgCell: "#fff" });
        expect(seen).toEqual([[15, 0, 12]]);
    });

    test("a consumer callback alone is enough to switch it on", () => {
        const cb = makeRowThemeOverride(flatten(), options(), () => ({ bgCell: "#fff" }))!;
        expect(cb).toBeDefined();
        // No themeOverride configured, so a header row gets nothing.
        expect(cb(0)).toBeUndefined();
    });
});

describe("getSelectionRowLimits", () => {
    const f = flatten();

    test("is unrestricted unless block-spanning is asked for", () => {
        expect(getSelectionRowLimits(5, f, undefined)).toBeUndefined();
        expect(getSelectionRowLimits(5, f, "allow-spanning")).toBeUndefined();
        expect(getSelectionRowLimits(5, undefined, "block-spanning")).toBeUndefined();
    });

    test("clamps a content row to its own group's bounds", () => {
        // Group A's content occupies rows 1..9.
        expect(getSelectionRowLimits(5, f, "block-spanning")).toEqual([1, 9]);
        expect(getSelectionRowLimits(1, f, "block-spanning")).toEqual([1, 9]);
        // Subgroup B0's content occupies rows 15..19.
        expect(getSelectionRowLimits(17, f, "block-spanning")).toEqual([15, 19]);
    });

    test("pins a group header to itself", () => {
        expect(getSelectionRowLimits(10, f, "block-spanning")).toEqual([10, 10]);
    });
});

describe("skipGroupHeaders", () => {
    const f = flatten();
    const skip = (row: number, startRow: number, behavior: RowGroupingOptions["navigationBehavior"]) =>
        skipGroupHeaders(row, startRow, effectiveRowCount(f, ROWS), f, behavior);

    test("leaves the row alone under normal navigation", () => {
        expect(skip(10, 9, "normal")).toBe(10);
        expect(skip(10, 9, undefined)).toBe(10);
    });

    test("steps down past a header when moving down", () => {
        // Row 10 is group B's header; moving down from 9 lands past it.
        expect(skip(10, 9, "skip-down")).toBe(11);
        expect(skip(10, 9, "skip")).toBe(11);
        expect(skip(10, 9, "block")).toBe(11);
        // skip-up must not interfere with downward movement.
        expect(skip(10, 9, "skip-up")).toBe(10);
    });

    test("steps up past a header when moving up", () => {
        expect(skip(10, 11, "skip-up")).toBe(9);
        expect(skip(10, 11, "skip-down")).toBe(10);
    });

    test("steps over a subgroup header just like a top-level one", () => {
        // Row 20 is subgroup B1's header; from row 21 moving up it is skipped to 19.
        expect(skip(20, 21, "skip")).toBe(19);
    });

    test("steps over consecutive headers", () => {
        // An empty group puts two headers back to back: group B at headerIndex 5 has no content
        // rows, so row 5 is B's header and row 6 is C's, with no gap between them.
        const backToBack = flattenRowGroups(
            {
                groups: [
                    { headerIndex: 0, isCollapsed: false },
                    { headerIndex: 5, isCollapsed: false },
                    { headerIndex: 6, isCollapsed: false },
                ],
                height: 55,
            },
            12
        );
        expect(backToBack.map(g => g.rowIndex)).toEqual([0, 5, 6]);

        // Moving down from row 4 must clear both headers in one go, not stop on the second.
        expect(skipGroupHeaders(5, 4, 12, backToBack, "skip-down")).toBe(7);
    });

    test("gives up and restores the origin when skipping runs out of grid", () => {
        // Row 0 is a header and there is nothing above it.
        expect(skip(0, 1, "skip-up")).toBe(1);
    });

    test("a row that did not move is never adjusted", () => {
        expect(skip(10, 10, "skip")).toBe(10);
    });
});

describe("updateRowGroupingByPath / getRowGroupingForPath", () => {
    test("addresses a top-level group by the path the mapper produced", () => {
        const f = flatten();
        const { path } = mapRowIndexToPath(10, f);
        const updated = updateRowGroupingByPath(groups(), path, { isCollapsed: true });

        expect(getRowGroupingForPath(updated, path)).toMatchObject({ headerIndex: 10, isCollapsed: true });
        // Immutable — the caller's array is untouched, so it can be assigned straight to tracked state.
        expect(getRowGroupingForPath(groups(), path)).toMatchObject({ isCollapsed: false });
    });

    test("addresses a nested subgroup", () => {
        const f = flatten();
        const { path } = mapRowIndexToPath(14, f);
        expect(path).toEqual([1, 0, -1]);

        const updated = updateRowGroupingByPath(groups(), path, { isCollapsed: true });
        expect(getRowGroupingForPath(updated, path)).toMatchObject({ headerIndex: 14, isCollapsed: true });
        // Its sibling is unaffected.
        expect(getRowGroupingForPath(updated, [1, 1, -1])).toMatchObject({ headerIndex: 20, isCollapsed: false });
    });

    test("a content row's path addresses its owning group", () => {
        const f = flatten();
        // Row 5 sits inside group A; its path is [0, 4], so the group it addresses is [0].
        const { path } = mapRowIndexToPath(5, f);
        expect(getRowGroupingForPath(groups(), [...path.slice(0, -1), -1])).toMatchObject({ headerIndex: 0 });
    });

    test("normalises the bare-number shorthand on update", () => {
        expect(updateRowGroupingByPath([7], [0, -1], { isCollapsed: true })[0]).toEqual({
            headerIndex: 7,
            isCollapsed: true,
        });
    });
});

describe("rowGroupingApi", () => {
    test("is the identity when there is no grouping", () => {
        const api = rowGroupingApi(undefined, ROWS);
        expect(api.rows).toBe(ROWS);
        expect(api.flattened).toEqual([]);
        expect(api.mapper(7)).toMatchObject({ originalIndex: 7, isGroupHeader: false });
    });

    test("reports the collapsed row count and maps through the same flattened tree", () => {
        const api = rowGroupingApi(options({ groups: groups({ b: true }) }), ROWS);
        expect(api.rows).toBe(16);
        expect(api.mapper(11)).toMatchObject({ isGroupHeader: true, originalIndex: 25 });
    });
});
