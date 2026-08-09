// Group-header selection (the mouseup half of `@onGroupHeaderClicked`).
//
// The regression these pin down: this port used to select group headers on **mousedown**, alongside
// ordinary headers, which meant (a) a click selected only the single column under the pointer rather
// than the group's span, and (b) `@onGroupHeaderClicked`'s `preventDefault()` had nothing left to
// gate, because selection had already happened by the time the callback fired. Source
// (`data-editor.tsx:2498-2509`) defers group-header selection to mouseup precisely so it *is*
// suppressible -- group headers are the one band in the whole grid where that is true.
//
// The `preventDefault()` half itself lives in `GridHostController.dispatchClick`, which vitest
// cannot import; what is testable here is everything the controller feeds it, i.e. that a
// suppressed click and a "nothing should change" click are the same no-op, and that an allowed one
// selects the whole span.
import { describe, expect, test } from "vitest";
import { computeGroupHeaderSpan, computeGroupHeaderSelection } from "./group-header-selection.ts";
import { setSelectedColumns } from "./selection-behavior.ts";
import { CompactSelection } from "./data-grid-types.ts";
import type { GridSelection } from "./data-grid-types.ts";

// Mangled space: index 0 is the row-marker column when `rowMarkerOffset` is 1.
const MARKER = { group: undefined };
const COLS = [
    MARKER, //          0 -- row marker
    { group: "A" }, //  1
    { group: "A" }, //  2
    { group: "A" }, //  3
    { group: "B" }, //  4
    { group: "B" }, //  5
    { group: undefined }, // 6 -- ungrouped
];

const EXCLUSIVE = {
    rangeBehavior: "exclusive",
    columnBehavior: "exclusive",
    rowBehavior: "exclusive",
} as const;

const emptySelection: GridSelection = {
    current: undefined,
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
};

function baseInput(overrides: Partial<Parameters<typeof computeGroupHeaderSelection>[0]> = {}) {
    return {
        mappedColumns: COLS,
        col: 2,
        rowMarkerOffset: 1,
        selectedColumns: CompactSelection.empty(),
        columnSelect: "multi" as const,
        columnSelectionMode: "auto" as const,
        isMultiKey: false,
        ...overrides,
    };
}

describe("computeGroupHeaderSpan", () => {
    test("walks both ways to the group's edges", () => {
        expect(computeGroupHeaderSpan(COLS, 2, 1)).toEqual([1, 4]);
        expect(computeGroupHeaderSpan(COLS, 1, 1)).toEqual([1, 4]);
        expect(computeGroupHeaderSpan(COLS, 3, 1)).toEqual([1, 4]);
    });

    test("a second group is its own span", () => {
        expect(computeGroupHeaderSpan(COLS, 4, 1)).toEqual([4, 6]);
        expect(computeGroupHeaderSpan(COLS, 5, 1)).toEqual([4, 6]);
    });

    test("the leftward walk stops at rowMarkerOffset, never at the marker column", () => {
        // The marker column's group is `undefined`, same as column 6's -- so a naive walk from an
        // ungrouped column would swallow it if the bound were missing.
        expect(computeGroupHeaderSpan(COLS, 6, 1)).toEqual([6, 7]);
    });

    test("undefined and empty-string groups are the same group (isGroupEqual)", () => {
        const cols = [MARKER, { group: "" }, { group: undefined }, { group: "A" }];
        expect(computeGroupHeaderSpan(cols, 1, 1)).toEqual([1, 3]);
    });

    test("the row-marker column has no span", () => {
        expect(computeGroupHeaderSpan(COLS, 0, 1)).toBeUndefined();
    });

    test("with no row markers the walk bound is 0", () => {
        expect(computeGroupHeaderSpan([{ group: "A" }, { group: "A" }, { group: "B" }], 1, 0)).toEqual([0, 2]);
    });

    test("out of range is undefined, not a crash", () => {
        expect(computeGroupHeaderSpan(COLS, 99, 1)).toBeUndefined();
    });
});

describe("computeGroupHeaderSelection", () => {
    test("a plain click replaces the selection with the whole span", () => {
        const res = computeGroupHeaderSelection(baseInput());
        expect(res?.span).toEqual([1, 4]);
        expect(res?.append).toBeUndefined();
        expect(res?.newColumns?.toArray()).toEqual([1, 2, 3]);
    });

    test("selecting a group selects EVERY column in it, not just the clicked one", () => {
        // The whole point of the mousedown-to-mouseup move: the old path ran through the ordinary
        // header branch and selected exactly one column.
        const res = computeGroupHeaderSelection(baseInput({ col: 5 }));
        expect(res?.newColumns?.toArray()).toEqual([4, 5]);
    });

    test("columnSelect !== multi is a total no-op", () => {
        // Source's `:2143` guard. Note this is NOT "select the single column instead".
        expect(computeGroupHeaderSelection(baseInput({ columnSelect: "single" }))).toBeUndefined();
        expect(computeGroupHeaderSelection(baseInput({ columnSelect: "none" }))).toBeUndefined();
    });

    test("the row-marker column selects nothing", () => {
        expect(computeGroupHeaderSelection(baseInput({ col: 0 }))).toBeUndefined();
    });

    test("multi-key appends the span instead of replacing", () => {
        const res = computeGroupHeaderSelection(
            baseInput({ col: 4, isMultiKey: true, selectedColumns: CompactSelection.fromSingleSelection([1, 4]) })
        );
        expect(res?.newColumns).toBeUndefined();
        expect(res?.append).toEqual([4, 6]);
    });

    test("columnSelectionMode 'multi' appends without any modifier key", () => {
        const res = computeGroupHeaderSelection(
            baseInput({ col: 4, columnSelectionMode: "multi", selectedColumns: CompactSelection.fromSingleSelection([1, 4]) })
        );
        expect(res?.append).toEqual([4, 6]);
    });

    test("isTouch appends too, matching source's `args.isTouch ||` arm", () => {
        const res = computeGroupHeaderSelection(baseInput({ col: 4, isTouch: true }));
        expect(res?.append).toEqual([4, 6]);
    });

    test("re-clicking an already-fully-selected group with multi-key deselects the whole span", () => {
        const res = computeGroupHeaderSelection(
            baseInput({
                col: 2,
                isMultiKey: true,
                selectedColumns: CompactSelection.fromSingleSelection([1, 6]),
            })
        );
        expect(res?.append).toBeUndefined();
        expect(res?.newColumns?.toArray()).toEqual([4, 5]);
    });

    test("a PARTIALLY selected group is completed, not toggled off", () => {
        // `hasAll`, not `hasIndex` -- clicking a group where only one member is selected must select
        // the rest rather than clearing it.
        const res = computeGroupHeaderSelection(
            baseInput({ col: 2, isMultiKey: true, selectedColumns: CompactSelection.fromSingleSelection(1) })
        );
        expect(res?.append).toEqual([1, 4]);
    });

    test("with no row markers, offset 0, the first group still resolves", () => {
        const res = computeGroupHeaderSelection(
            baseInput({ mappedColumns: [{ group: "A" }, { group: "A" }, { group: "B" }], col: 0, rowMarkerOffset: 0 })
        );
        expect(res?.newColumns?.toArray()).toEqual([0, 1]);
    });
});

describe("feeding the result into setSelectedColumns (what the controller does)", () => {
    test("a plain group click ends up with the span selected", () => {
        const res = computeGroupHeaderSelection(baseInput());
        expect(res).toBeDefined();
        const next = setSelectedColumns(emptySelection, res!.newColumns, res!.append, false, EXCLUSIVE);
        expect(next.columns.toArray()).toEqual([1, 2, 3]);
    });

    // A model of `GridHostController.dispatchClick`'s group-header branch. The controller itself
    // cannot be imported by vitest, so this mirrors its three lines exactly -- callback first,
    // selection second, gated on `!prevented` -- and the two tests below differ *only* in what the
    // consumer callback does. If the ordering in `dispatchClick` were ever inverted, this model
    // would stop describing it, so keep the two in sync.
    function dispatchGroupHeaderClick(
        selection: GridSelection,
        col: number,
        onGroupHeaderClicked?: (col: number, ev: { preventDefault: () => void }) => void
    ): GridSelection {
        let prevented = false;
        onGroupHeaderClicked?.(col, {
            preventDefault: () => {
                prevented = true;
            },
        });
        if (prevented) return selection;
        const res = computeGroupHeaderSelection(baseInput({ col, selectedColumns: selection.columns }));
        if (res === undefined) return selection;
        return setSelectedColumns(selection, res.newColumns, res.append, false, EXCLUSIVE);
    }

    test("preventDefault() in the callback leaves the selection unchanged", () => {
        const previous: GridSelection = { ...emptySelection, columns: CompactSelection.fromSingleSelection(5) };
        const next = dispatchGroupHeaderClick(previous, 2, (_col, ev) => ev.preventDefault());
        expect(next).toBe(previous);
        expect(next.columns.toArray()).toEqual([5]);
    });

    test("without preventDefault() the same click selects the group's column span", () => {
        const previous: GridSelection = { ...emptySelection, columns: CompactSelection.fromSingleSelection(5) };
        const next = dispatchGroupHeaderClick(previous, 2, () => {});
        expect(next.columns.toArray()).toEqual([1, 2, 3]);
    });

    test("no callback at all still selects -- suppression is opt-in", () => {
        const next = dispatchGroupHeaderClick(emptySelection, 4);
        expect(next.columns.toArray()).toEqual([4, 5]);
    });

    test("append then deselect round-trips back to the starting selection", () => {
        const start: GridSelection = { ...emptySelection, columns: CompactSelection.fromSingleSelection([1, 4]) };
        const add = computeGroupHeaderSelection(
            baseInput({ col: 4, isMultiKey: true, selectedColumns: start.columns })
        );
        const added = setSelectedColumns(start, add!.newColumns, add!.append, true, EXCLUSIVE);
        expect(added.columns.toArray()).toEqual([1, 2, 3, 4, 5]);

        const remove = computeGroupHeaderSelection(
            baseInput({ col: 4, isMultiKey: true, selectedColumns: added.columns })
        );
        const removed = setSelectedColumns(added, remove!.newColumns, remove!.append, true, EXCLUSIVE);
        expect(removed.columns.toArray()).toEqual([1, 2, 3]);
    });
});
