// 9j. Tests for `withCollapsingGroups`.
//
// The first suite below pins the thing PHASES.md's 9j entry got wrong, and which is worth a test
// rather than only a comment: collapsing **does not remap anything**. Source implements it purely by
// shrinking widths, so every column keeps its index, so there is no write path to translate. If a
// future change ever starts dropping or reordering columns here, `keeps every column at its own
// index` fails and whoever made that change learns they now owe a coordinate translation.
//
// The identity-stability suite matters for the usual reason: `columns` is one of `computeCanBlit`'s
// reference-compared `DrawGridArg` fields.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { withCollapsingGroups } from "./collapsing-groups.ts";
import { CompactSelection } from "../rendering/data-grid-types.ts";
import type { GridColumn, GridSelection } from "../rendering/data-grid-types.ts";

/** Two groups of two, so a collapsed run has a distinguishable first and last column. */
const COLUMNS: readonly GridColumn[] = [
    { title: "First", id: "first", group: "Personal", width: 100 },
    { title: "Last", id: "last", group: "Personal", width: 100 },
    { title: "Company", id: "company", group: "Work", width: 100 },
    { title: "Title", id: "title", group: "Work", width: 100 },
];

const noop = (): void => undefined;

function widthsOf(columns: readonly GridColumn[]): number[] {
    return columns.map(c => (c as { width: number }).width);
}

function selectionAt(col: number): GridSelection {
    return {
        current: { cell: [col, 0], range: { x: col, y: 0, width: 1, height: 1 }, rangeStack: [] },
        rows: CompactSelection.empty(),
        columns: CompactSelection.empty(),
    };
}

describe("withCollapsingGroups — it remaps nothing (the contract check)", () => {
    it("keeps every column at its own index when a group is collapsed", () => {
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        expect(res.columns).toHaveLength(COLUMNS.length);
        expect(res.columns.map(c => c.title)).toEqual(["First", "Last", "Company", "Title"]);
    });

    it("exposes no write path or index-translation escape hatch, because it needs none", () => {
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        expect("onCellsEdited" in res).toBe(false);
        expect("getCellContent" in res).toBe(false);
    });
});

describe("withCollapsingGroups — collapsed columns", () => {
    it("returns the caller's own columns by IDENTITY when nothing is collapsed", () => {
        // Source always allocates from `.map`; that would be a fresh `columns` identity on every
        // call of a grid nobody has ever collapsed, and `columns` is identity-compared by the blit.
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: [], onCollapsedChange: noop });
        expect(res.columns).toBe(COLUMNS);
    });

    it("shrinks a collapsed group, leaving the last column wide enough to grab", () => {
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        expect(widthsOf(res.columns)).toEqual([8, 36, 100, 100]);
    });

    it("gives each collapsed group its own end cap rather than one shared one", () => {
        // Source closes a run whenever the group name changes, which is what produces this.
        const res = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Personal", "Work"],
            onCollapsedChange: noop,
        });
        expect(widthsOf(res.columns)).toEqual([8, 36, 8, 36]);
    });

    it("tints collapsed cells with bgCellMedium", () => {
        const res = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Personal"],
            onCollapsedChange: noop,
            theme: { bgCellMedium: "#123456" },
        });
        expect(res.columns[0]!.themeOverride?.bgCell).toBe("#123456");
        expect(res.columns[2]!.themeOverride).toBeUndefined();
    });

    it("falls back to the built-in theme when no overlay is passed", () => {
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        expect(res.columns[0]!.themeOverride?.bgCell).toBe("#FAFAFB");
    });

    it("preserves a column's existing themeOverride (divergence from source, which drops it)", () => {
        const columns: readonly GridColumn[] = [
            { title: "A", id: "a", group: "G", width: 100, themeOverride: { textDark: "#f00" } },
        ];
        const res = withCollapsingGroups({ columns, collapsed: ["G"], onCollapsedChange: noop });
        expect(res.columns[0]!.themeOverride).toEqual({ textDark: "#f00", bgCell: "#FAFAFB" });
    });

    it("never collapses frozen columns", () => {
        const res = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Personal"],
            onCollapsedChange: noop,
            freezeColumns: 1,
        });
        // Column 0 is frozen, so the run starts (and ends) at column 1.
        expect(widthsOf(res.columns)).toEqual([100, 36, 100, 100]);
    });
});

describe("withCollapsingGroups — toggling", () => {
    it("collapses an expanded group", () => {
        const onCollapsedChange = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: [], onCollapsedChange });
        res.toggleGroup("Work");
        expect(onCollapsedChange).toHaveBeenCalledWith(["Work"]);
    });

    it("expands a collapsed group", () => {
        const onCollapsedChange = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal", "Work"], onCollapsedChange });
        res.toggleGroup("Work");
        expect(onCollapsedChange).toHaveBeenCalledWith(["Personal"]);
    });

    it("refuses to collapse the unnamed group", () => {
        // Ungrouped columns normalise to "". Collapsing them would hide them with no group header
        // to click to get them back.
        const onCollapsedChange = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: [], onCollapsedChange });
        res.toggleGroup("");
        expect(onCollapsedChange).not.toHaveBeenCalled();
    });

    it("reports collapsed state", () => {
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Work"], onCollapsedChange: noop });
        expect(res.isCollapsed("Work")).toBe(true);
        expect(res.isCollapsed("Personal")).toBe(false);
    });

    it("toggles the group of the clicked column, and suppresses the event's default", () => {
        const onCollapsedChange = vi.fn();
        const preventDefault = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: [], onCollapsedChange });
        res.onGroupHeaderClicked(2, { preventDefault });
        expect(onCollapsedChange).toHaveBeenCalledWith(["Work"]);
        expect(preventDefault).toHaveBeenCalled();
    });

    it("ignores a click on a column with no group", () => {
        const onCollapsedChange = vi.fn();
        const preventDefault = vi.fn();
        const res = withCollapsingGroups({
            columns: [{ title: "Loose", id: "loose", width: 100 }],
            collapsed: [],
            onCollapsedChange,
        });
        res.onGroupHeaderClicked(0, { preventDefault });
        expect(onCollapsedChange).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });
});

describe("withCollapsingGroups — auto-expand on selection", () => {
    it("expands a collapsed group when the selection lands inside it", () => {
        const onCollapsedChange = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Work"], onCollapsedChange });
        res.onSelectionChanged(selectionAt(2));
        expect(onCollapsedChange).toHaveBeenCalledWith([]);
    });

    it("leaves an already-expanded group alone", () => {
        const onCollapsedChange = vi.fn();
        const res = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Work"], onCollapsedChange });
        res.onSelectionChanged(selectionAt(0));
        expect(onCollapsedChange).not.toHaveBeenCalled();
    });

    it("reads the selection in CONSUMER space, and `rowMarkerOffset` no longer shifts it", () => {
        // Regression. `@onSelectionChanged` used to report mangled column indices while every other
        // callback reported consumer ones, so this module subtracted `rowMarkerOffset` here. That
        // split was removed on 2026-08-09; the subtraction then became the bug, expanding the group
        // one column to the LEFT of the selected one on any grid with row markers. The option is
        // kept as a deprecated no-op, which is what this pins: passing it changes nothing.
        const withOffset = vi.fn();
        withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Work"],
            onCollapsedChange: withOffset,
            rowMarkerOffset: 1,
        }).onSelectionChanged(selectionAt(2)); // consumer column 2 == "Company", in group "Work"
        expect(withOffset).toHaveBeenCalledWith([]);

        const withoutOffset = vi.fn();
        withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Work"],
            onCollapsedChange: withoutOffset,
        }).onSelectionChanged(selectionAt(2));
        expect(withoutOffset).toHaveBeenCalledWith([]);
    });

    it("forwards to the consumer's own handler, selection untouched", () => {
        const onSelectionChanged = vi.fn();
        const res = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: [],
            onCollapsedChange: noop,
            onSelectionChanged,
        });
        const selection = selectionAt(2);
        res.onSelectionChanged(selection);
        expect(onSelectionChanged).toHaveBeenCalledWith(selection);
    });

    it("forwards a selection with no current cell", () => {
        const onSelectionChanged = vi.fn();
        const res = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Work"],
            onCollapsedChange: noop,
            onSelectionChanged,
        });
        const empty: GridSelection = {
            current: undefined,
            rows: CompactSelection.empty(),
            columns: CompactSelection.empty(),
        };
        res.onSelectionChanged(empty);
        expect(onSelectionChanged).toHaveBeenCalledWith(empty);
    });
});

describe("withCollapsingGroups — identity stability (protects the blit fast path)", () => {
    it("returns identical columns across calls with an unchanged collapsed set", () => {
        const collapsed = ["Personal"];
        const a = withCollapsingGroups({ columns: COLUMNS, collapsed, onCollapsedChange: noop });
        const b = withCollapsingGroups({ columns: COLUMNS, collapsed, onCollapsedChange: noop });
        expect(b.columns).toBe(a.columns);
    });

    it("survives a freshly allocated but structurally identical collapsed array", () => {
        const a = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        const b = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        expect(b.columns).toBe(a.columns);
    });

    it("rebuilds when the collapsed set actually changes", () => {
        const a = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Personal"], onCollapsedChange: noop });
        const b = withCollapsingGroups({ columns: COLUMNS, collapsed: ["Work"], onCollapsedChange: noop });
        expect(b.columns).not.toBe(a.columns);
        expect(widthsOf(b.columns)).toEqual([100, 100, 8, 36]);
    });

    it("rebuilds when the theme's collapsed tint changes", () => {
        const a = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Personal"],
            onCollapsedChange: noop,
            theme: { bgCellMedium: "#111" },
        });
        const b = withCollapsingGroups({
            columns: COLUMNS,
            collapsed: ["Personal"],
            onCollapsedChange: noop,
            theme: { bgCellMedium: "#222" },
        });
        expect(b.columns[0]!.themeOverride?.bgCell).toBe("#222");
        expect(a.columns[0]!.themeOverride?.bgCell).toBe("#111");
    });
});
