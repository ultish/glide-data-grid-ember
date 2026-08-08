// Phase 9a. Tests for the selection writer — `setCurrentSelection`, `setSelectedRows`,
// `setSelectedColumns`. Every mouse click, drag, arrow key and Ctrl+A in the grid routes through
// these three functions (Phase 3a/3b), so they are the behavioural core of the interaction layer.
//
// These are pure `(currentSelection, ...) => nextSelection` functions with no class and no state,
// which is what makes them testable here at all.
//
// WHAT THESE TESTS DELIBERATELY DO **NOT** DO. It would be easy to write a test per branch that
// simply restates the implementation's own conditionals back at it — that kind of test passes
// forever and catches nothing, because it is derived from the code rather than from the behaviour
// the code is supposed to produce. Instead each test below is framed as an *observable selection
// outcome* a user could describe: "clicking a cell clears the selected rows", "shift-clicking with
// multi-rect keeps the previous range on the stack". If a test here fails, a real interaction
// changed.
//
// The three `*Behavior` options are the interesting axis. `GridHostController` currently hardcodes
// all three to `"exclusive"` (`DEFAULT_SELECTION_OPTIONS`), but the writer is fully parameterised
// over them and exposing them is listed as backlog item 9g — so the non-exclusive modes are tested
// here even though nothing reaches them yet, precisely because nothing reaches them yet.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import {
    setCurrentSelection,
    setSelectedColumns,
    setSelectedRows,
    type SelectionBehaviorOptions,
} from "./selection-behavior.ts";
import { CompactSelection, type GridSelection } from "./data-grid-types.ts";

const EXCLUSIVE: SelectionBehaviorOptions = {
    rangeBehavior: "exclusive",
    columnBehavior: "exclusive",
    rowBehavior: "exclusive",
    rangeSelect: "rect",
    rangeSelectionColumnSpanning: true,
};

function opts(over: Partial<SelectionBehaviorOptions> = {}): SelectionBehaviorOptions {
    return { ...EXCLUSIVE, ...over };
}

const EMPTY: GridSelection = {
    current: undefined,
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
};

/**
 * A selection with rows 1-2 and column 3 selected, plus an active cell at [0,0].
 *
 * NOTE: under fully-exclusive options this combination is **not reachable** through the real grid —
 * selecting rows clears the active cell, and vice versa. It is a deliberate synthetic input, used to
 * observe what each writer clears versus preserves. Tests asserting *behaviour a user can trigger*
 * should build a narrower fixture; treat results from this one as characterising the function, not
 * the UI.
 */
function populated(): GridSelection {
    return {
        current: { cell: [0, 0], range: { x: 0, y: 0, width: 1, height: 1 }, rangeStack: [] },
        columns: CompactSelection.fromSingleSelection(3),
        rows: CompactSelection.fromSingleSelection([1, 3]),
    };
}

function cellAt(col: number, row: number) {
    return { cell: [col, row] as const, range: { x: col, y: row, width: 1, height: 1 } };
}

describe("setCurrentSelection", () => {
    it("selects the clicked cell", () => {
        const { selection } = setCurrentSelection(EMPTY, cellAt(2, 5), false, false, "click", opts());
        expect(selection.current?.cell).toEqual([2, 5]);
    });

    it("clicking a cell clears previously selected rows and columns (exclusive)", () => {
        const { selection } = setCurrentSelection(populated(), cellAt(2, 5), false, false, "click", opts());
        expect(selection.rows.length).toBe(0);
        expect(selection.columns.length).toBe(0);
    });

    it("clears the current cell when passed undefined", () => {
        const { selection } = setCurrentSelection(populated(), undefined, false, false, "click", opts());
        expect(selection.current).toBeUndefined();
    });

    it("does not mutate the selection it was given", () => {
        const before = populated();
        setCurrentSelection(before, cellAt(9, 9), false, false, "click", opts());
        expect(before.current?.cell).toEqual([0, 0]);
        expect(before.rows.length).toBe(2);
    });

    it("carries the `expand` flag straight through", () => {
        // Span/merged-cell growth isn't implemented anywhere in this port yet; the flag is a
        // carry-through so callers can ignore it safely. Pinned so it isn't quietly repurposed.
        expect(setCurrentSelection(EMPTY, cellAt(1, 1), true, false, "click", opts()).expand).toBe(true);
        expect(setCurrentSelection(EMPTY, cellAt(1, 1), false, false, "click", opts()).expand).toBe(false);
    });

    describe("rangeSelect modes", () => {
        it('"cell" collapses a multi-cell range down to the single active cell', () => {
            const wide = { cell: [2, 5] as const, range: { x: 0, y: 5, width: 4, height: 1 } };
            const { selection } = setCurrentSelection(
                EMPTY,
                wide,
                false,
                false,
                "click",
                opts({ rangeSelect: "cell" })
            );
            expect(selection.current?.range).toEqual({ x: 2, y: 5, width: 1, height: 1 });
        });

        it('"rect" preserves a multi-cell range', () => {
            const wide = { cell: [2, 5] as const, range: { x: 0, y: 5, width: 4, height: 1 } };
            const { selection } = setCurrentSelection(
                EMPTY,
                wide,
                false,
                false,
                "click",
                opts({ rangeSelect: "rect" })
            );
            expect(selection.current?.range.width).toBe(4);
        });
    });

    it("collapses a range to one column when column spanning is disabled", () => {
        const wide = { cell: [2, 5] as const, range: { x: 0, y: 5, width: 4, height: 1 } };
        const { selection } = setCurrentSelection(
            EMPTY,
            wide,
            false,
            false,
            "click",
            opts({ rangeSelectionColumnSpanning: false })
        );
        expect(selection.current?.range).toEqual({ x: 2, y: 5, width: 1, height: 1 });
    });

    describe("rangeStack (multi-range selection)", () => {
        it("a plain click resets the stack", () => {
            const withStack: GridSelection = {
                ...EMPTY,
                current: {
                    cell: [0, 0],
                    range: { x: 0, y: 0, width: 1, height: 1 },
                    rangeStack: [{ x: 5, y: 5, width: 1, height: 1 }],
                },
            };
            const { selection } = setCurrentSelection(withStack, cellAt(1, 1), false, false, "click", opts());
            expect(selection.current?.rangeStack).toEqual([]);
        });

        it("a drag preserves the existing stack", () => {
            const stack = [{ x: 5, y: 5, width: 1, height: 1 }];
            const withStack: GridSelection = {
                ...EMPTY,
                current: { cell: [0, 0], range: { x: 0, y: 0, width: 1, height: 1 }, rangeStack: stack },
            };
            const { selection } = setCurrentSelection(withStack, cellAt(1, 1), false, false, "drag", opts());
            expect(selection.current?.rangeStack).toEqual(stack);
        });

        it("append pushes the previous range onto the stack in multi-rect mode", () => {
            const prev: GridSelection = {
                ...EMPTY,
                current: { cell: [0, 0], range: { x: 0, y: 0, width: 2, height: 2 }, rangeStack: [] },
            };
            const { selection } = setCurrentSelection(
                prev,
                cellAt(5, 5),
                false,
                true,
                "click",
                opts({ rangeSelect: "multi-rect" })
            );
            expect(selection.current?.rangeStack).toEqual([{ x: 0, y: 0, width: 2, height: 2 }]);
        });

        it("append does NOT stack in single-rect mode", () => {
            const prev: GridSelection = {
                ...EMPTY,
                current: { cell: [0, 0], range: { x: 0, y: 0, width: 2, height: 2 }, rangeStack: [] },
            };
            const { selection } = setCurrentSelection(prev, cellAt(5, 5), false, true, "click", opts());
            expect(selection.current?.rangeStack).toEqual([]);
        });
    });

    describe("co-selection blending", () => {
        it("exclusive drops existing row/column selection", () => {
            const { selection } = setCurrentSelection(populated(), cellAt(1, 1), false, false, "click", opts());
            expect(selection.rows.length).toBe(0);
            expect(selection.columns.length).toBe(0);
        });

        it("additive keeps rows and columns alongside the new cell", () => {
            const { selection } = setCurrentSelection(
                populated(),
                cellAt(1, 1),
                false,
                false,
                "click",
                opts({ rangeBehavior: "additive", rowBehavior: "additive", columnBehavior: "additive" })
            );
            expect(selection.rows.length).toBe(2);
            expect(selection.columns.length).toBe(1);
        });

        it("mixed keeps them only when appending (or dragging)", () => {
            const mixed = opts({ rangeBehavior: "mixed", rowBehavior: "mixed", columnBehavior: "mixed" });
            const plain = setCurrentSelection(populated(), cellAt(1, 1), false, false, "click", mixed);
            expect(plain.selection.rows.length).toBe(0);

            const appended = setCurrentSelection(populated(), cellAt(1, 1), false, true, "click", mixed);
            expect(appended.selection.rows.length).toBe(2);

            const dragged = setCurrentSelection(populated(), cellAt(1, 1), false, false, "drag", mixed);
            expect(dragged.selection.rows.length).toBe(2);
        });
    });
});

describe("setSelectedRows", () => {
    const rowOpts = { rangeBehavior: "exclusive", columnBehavior: "exclusive", rowBehavior: "exclusive" } as const;

    it("selects the given rows", () => {
        const next = setSelectedRows(EMPTY, CompactSelection.fromSingleSelection([2, 5]), undefined, false, rowOpts);
        expect(next.rows.toArray()).toEqual([2, 3, 4]);
    });

    it("appends to the existing rows when `newRows` is undefined", () => {
        const start: GridSelection = { ...EMPTY, rows: CompactSelection.fromSingleSelection(1) };
        const next = setSelectedRows(start, undefined, 7, false, rowOpts);
        expect(next.rows.toArray()).toEqual([1, 7]);
    });

    it("selecting rows clears the active cell and columns (exclusive)", () => {
        const next = setSelectedRows(populated(), CompactSelection.fromSingleSelection(9), undefined, false, rowOpts);
        expect(next.current).toBeUndefined();
        expect(next.columns.length).toBe(0);
    });

    it("clears the active cell even when selecting NO rows, under fully-exclusive options", () => {
        // Worth knowing, and initially counter-intuitive: the `newRows.length > 0` guard does NOT
        // preserve the active cell here. It only chooses which branch runs, and under exclusive
        // options both branches end with `current: undefined` (the else-branch computes
        // `rangeMixed === false`, so `current = undefined` too). VERIFIED faithful to upstream
        // 2026-08-08 by direct comparison with `use-selection-behavior.ts`.
        const next = setSelectedRows(populated(), CompactSelection.empty(), undefined, false, rowOpts);
        expect(next.current).toBeUndefined();
    });

    it("the length>0 guard is observable only in mixed modes: empty rows then KEEP the active cell", () => {
        // This is what that guard is actually for. With an additive range behavior, *setting* rows
        // still clears the active cell (early return), but *clearing* rows preserves it (else
        // branch, where `rangeMixed` is true). That asymmetry is the whole point.
        const additiveRange = { ...rowOpts, rangeBehavior: "additive" } as const;
        const cleared = setSelectedRows(populated(), CompactSelection.empty(), undefined, false, additiveRange);
        expect(cleared.current).toBeDefined();

        const set = setSelectedRows(
            populated(),
            CompactSelection.fromSingleSelection(9),
            undefined,
            false,
            additiveRange
        );
        expect(set.current).toBeUndefined();
    });

    it("additive row behavior keeps the active cell", () => {
        const next = setSelectedRows(populated(), CompactSelection.fromSingleSelection(9), undefined, false, {
            ...rowOpts,
            rowBehavior: "additive",
            rangeBehavior: "additive",
        });
        expect(next.current).toBeDefined();
    });

    it("does not mutate the selection it was given", () => {
        const before = populated();
        setSelectedRows(before, CompactSelection.fromSingleSelection(9), undefined, false, rowOpts);
        expect(before.rows.toArray()).toEqual([1, 2]);
    });
});

describe("setSelectedColumns", () => {
    const colOpts = { rangeBehavior: "exclusive", columnBehavior: "exclusive", rowBehavior: "exclusive" } as const;

    it("selects the given columns", () => {
        const next = setSelectedColumns(EMPTY, CompactSelection.fromSingleSelection([0, 3]), undefined, false, colOpts);
        expect(next.columns.toArray()).toEqual([0, 1, 2]);
    });

    it("selecting columns clears the active cell and rows (exclusive)", () => {
        const next = setSelectedColumns(
            populated(),
            CompactSelection.fromSingleSelection(5),
            undefined,
            false,
            colOpts
        );
        expect(next.current).toBeUndefined();
        expect(next.rows.length).toBe(0);
    });

    it("clears the active cell even when selecting NO columns, under fully-exclusive options", () => {
        // Same shape as the `setSelectedRows` case above — see the comment there for why the
        // `length > 0` guard does not preserve `current` under exclusive options.
        const next = setSelectedColumns(populated(), CompactSelection.empty(), undefined, false, colOpts);
        expect(next.current).toBeUndefined();
    });

    it("appends a column to the existing selection", () => {
        const start: GridSelection = { ...EMPTY, columns: CompactSelection.fromSingleSelection(1) };
        const next = setSelectedColumns(start, undefined, 4, false, colOpts);
        expect(next.columns.toArray()).toEqual([1, 4]);
    });

    it("does not mutate the selection it was given", () => {
        const before = populated();
        setSelectedColumns(before, CompactSelection.fromSingleSelection(9), undefined, false, colOpts);
        expect(before.columns.toArray()).toEqual([3]);
    });
});
