// 9j. Tests for `withMovableColumns` — the column-order decorator.
//
// Same shape, and same reason for existing, as `column-sort.test.ts`: a decorator that remaps the
// read path must remap the write path, or an edit lands in a different field from the one the user
// typed into. `withColumnSort` does that for rows; this does it for columns, and source's
// `useMoveableColumns` deliberately does NOT (it remaps `getCellContent` only) — so the write-path
// suite below is testing this port's own divergence, and is the reason it exists.
//
// The identity-stability suite is load-bearing too: BOTH `columns` and `getCellContent` are among
// `computeCanBlit`'s reference-compared `DrawGridArg` fields, so a decorator allocating a fresh
// array or closure per call would silently disable the scroll blit fast path.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { columnOrderKey, withMovableColumns } from "./movable-columns.ts";
import type { CellEdit } from "./column-sort.ts";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "../rendering/data-grid-types.ts";

const COLUMNS: readonly GridColumn[] = [
    { title: "Name", id: "name", width: 100 },
    { title: "Score", id: "score", width: 100 },
    { title: "City", id: "city", width: 100 },
];

// One distinct value per column so a mis-mapped column is unambiguous.
const VALUES = ["nameValue", "scoreValue", "cityValue"];

/** A fresh `getCellContent`, because it is the decorator's cache key. */
function makeGetCellContent(): (cell: Item) => GridCell {
    return ([col]: Item): GridCell => {
        const data = VALUES[col] ?? "";
        return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
    };
}

function textOf(cell: GridCell): string {
    return (cell as { displayData: string }).displayData;
}

/** Reads row 0 across the *displayed* columns. */
function displayedRow(getCellContent: (cell: Item) => GridCell, cols: number): string[] {
    return Array.from({ length: cols }, (_, col) => textOf(getCellContent([col, 0])));
}

const VALUE: GridCell = { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true };

describe("columnOrderKey", () => {
    it("uses the column id when there is one", () => {
        expect(columnOrderKey({ title: "Name", id: "name", width: 10 })).toBe("name");
    });

    it("falls back to group/title, so unidentified columns still order stably", () => {
        expect(columnOrderKey({ title: "Name", group: "Personal", width: 10 })).toBe("Personal/Name");
        expect(columnOrderKey({ title: "Name", width: 10 })).toBe("/Name");
    });
});

describe("withMovableColumns — read path", () => {
    it("passes columns through untouched with no order set", () => {
        const res = withMovableColumns({ columns: COLUMNS, getCellContent: makeGetCellContent() });
        expect(res.columns.map(c => c.title)).toEqual(["Name", "Score", "City"]);
    });

    it("returns the caller's own columns and getCellContent by IDENTITY when unordered", () => {
        // Not merely equivalent — the same references. Source always allocates a fresh array from
        // `orderBy`, which would be a new `columns` identity every call on a grid where nothing has
        // ever been dragged, and `columns` is identity-compared by the blit fast path.
        const getCellContent = makeGetCellContent();
        const res = withMovableColumns({ columns: COLUMNS, getCellContent });
        expect(res.columns).toBe(COLUMNS);
        expect(res.getCellContent).toBe(getCellContent);
    });

    it("reorders columns to match the key order", () => {
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
        });
        expect(res.columns.map(c => c.title)).toEqual(["City", "Name", "Score"]);
    });

    it("reads the reordered column's data at the reordered index", () => {
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
        });
        expect(displayedRow(res.getCellContent, 3)).toEqual(["cityValue", "nameValue", "scoreValue"]);
    });

    it("hands back the very same GridColumn objects, not copies", () => {
        // So a `GridColumn` returned by `@onColumnResize` is `===`-comparable against the consumer's
        // own array — which is how source's comment says consumers are expected to use it.
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
        });
        expect(res.columns[0]).toBe(COLUMNS[2]);
    });

    it("maps displayed columns back to natural ones via getOriginalColumnIndex", () => {
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
        });
        expect(res.getOriginalColumnIndex(0)).toBe(2); // displayed 0 = City = natural 2
        expect(res.getOriginalColumnIndex(1)).toBe(0);
    });

    it("is the identity function when no reordering is active", () => {
        const res = withMovableColumns({ columns: COLUMNS, getCellContent: makeGetCellContent() });
        expect(res.getOriginalColumnIndex(2)).toBe(2);
    });

    it("ignores keys naming columns that no longer exist", () => {
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["gone", "city", "name", "score"],
        });
        expect(res.columns.map(c => c.title)).toEqual(["City", "Name", "Score"]);
    });

    it("slots a newly-added column next to its left-hand neighbour rather than dumping it at an end", () => {
        // Source's `+ 0.5` partial-index trick, which is what makes a *saved* order survive the
        // consumer adding a column. The order names only name/score; "City" is new. Its neighbour
        // is looked up in the NATURAL array (where City follows Score), so it lands at Score's
        // rank + 0.5 — i.e. immediately after Score, not at either end.
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["score", "name"],
        });
        expect(res.columns.map(c => c.title)).toEqual(["Score", "City", "Name"]);
    });
});

describe("withMovableColumns — WRITE path (the data-corruption guard, not in source)", () => {
    it("translates an edit's column from displayed space into natural space", () => {
        // Sorted [City, Name, Score]: displayed column 0 is City, which is NATURAL column 2. An edit
        // there must be reported at column 2 — reporting column 0 would overwrite Name.
        const onCellsEdited = vi.fn();
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            order: ["city", "name", "score"],
        });
        res.onCellsEdited?.([{ location: [0, 5], value: VALUE }]);

        expect(onCellsEdited).toHaveBeenCalledTimes(1);
        const edits = onCellsEdited.mock.calls[0]![0] as readonly CellEdit[];
        expect(edits[0]!.location).toEqual([2, 5]);
    });

    it("leaves the row index alone", () => {
        // This decorator remaps columns only. Touching the row would be a second, independent bug.
        const onCellsEdited = vi.fn();
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            order: ["city", "name", "score"],
        });
        res.onCellsEdited?.([{ location: [1, 7], value: VALUE }]);
        expect((onCellsEdited.mock.calls[0]![0] as readonly CellEdit[])[0]!.location).toEqual([0, 7]);
    });

    it("forwards a multi-cell batch as ONE call, every location translated", () => {
        const onCellsEdited = vi.fn();
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            order: ["city", "name", "score"],
        });
        res.onCellsEdited?.([
            { location: [0, 0], value: VALUE },
            { location: [2, 0], value: VALUE },
        ]);

        expect(onCellsEdited).toHaveBeenCalledTimes(1);
        const edits = onCellsEdited.mock.calls[0]![0] as readonly CellEdit[];
        expect(edits.map(e => e.location)).toEqual([
            [2, 0],
            [1, 0],
        ]);
    });

    it("round-trips: editing displayed column C targets the column shown at displayed column C", () => {
        // The property that actually matters, stated directly.
        const onCellsEdited = vi.fn();
        const getCellContent = makeGetCellContent();
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent,
            onCellsEdited,
            order: ["city", "name", "score"],
        });

        for (let displayedCol = 0; displayedCol < 3; displayedCol++) {
            onCellsEdited.mockClear();
            const shown = textOf(res.getCellContent([displayedCol, 0]));
            res.onCellsEdited?.([{ location: [displayedCol, 0], value: VALUE }]);
            const reported = (onCellsEdited.mock.calls[0]![0] as readonly CellEdit[])[0]!.location[0];
            expect(textOf(getCellContent([reported, 0]))).toBe(shown);
        }
    });

    it("returns the caller's own handler by identity when no reordering is active", () => {
        const onCellsEdited = vi.fn();
        const res = withMovableColumns({ columns: COLUMNS, getCellContent: makeGetCellContent(), onCellsEdited });
        expect(res.onCellsEdited).toBe(onCellsEdited);
    });

    it("is undefined when the caller passed no handler", () => {
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
        });
        expect(res.onCellsEdited).toBeUndefined();
    });
});

describe("withMovableColumns — onColumnMoved", () => {
    it("reports the new key order in displayed space", () => {
        const onOrderChange = vi.fn();
        const res = withMovableColumns({ columns: COLUMNS, getCellContent: makeGetCellContent(), onOrderChange });
        // Drag "Name" (displayed 0) to the end.
        res.onColumnMoved(0, 2);
        expect(onOrderChange).toHaveBeenCalledWith(["score", "city", "name"]);
    });

    it("splices relative to the CURRENT display order, not the natural one", () => {
        // The whole hazard of a reorder decorator: the grid reports displayed indices, so applying
        // them to the natural key list would move the wrong column on the second drag.
        const onOrderChange = vi.fn();
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order: ["city", "name", "score"],
            onOrderChange,
        });
        // Displayed order is [City, Name, Score]; drag displayed 0 (City) to position 1.
        res.onColumnMoved(0, 1);
        expect(onOrderChange).toHaveBeenCalledWith(["name", "city", "score"]);
    });

    it("forwards to the consumer's own onColumnMoved, after the order change", () => {
        const calls: string[] = [];
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            onOrderChange: () => calls.push("order"),
            onColumnMoved: () => calls.push("moved"),
        });
        res.onColumnMoved(0, 1);
        expect(calls).toEqual(["order", "moved"]);
    });

    it("does not mutate the consumer's order array", () => {
        const order = ["city", "name", "score"];
        const res = withMovableColumns({
            columns: COLUMNS,
            getCellContent: makeGetCellContent(),
            order,
            onOrderChange: () => undefined,
        });
        res.onColumnMoved(0, 2);
        expect(order).toEqual(["city", "name", "score"]);
    });
});

describe("withMovableColumns — identity stability (protects the blit fast path)", () => {
    it("returns identical columns and getCellContent across calls with an unchanged order", () => {
        const getCellContent = makeGetCellContent();
        const order = ["city", "name", "score"];
        const a = withMovableColumns({ columns: COLUMNS, getCellContent, order });
        const b = withMovableColumns({ columns: COLUMNS, getCellContent, order });
        expect(b.columns).toBe(a.columns);
        expect(b.getCellContent).toBe(a.getCellContent);
    });

    it("survives a freshly allocated but structurally identical order array", () => {
        // A consumer building the order in a getter allocates a new array on every read. The
        // decorator keys on a structural digest precisely so that doesn't reallocate `columns`.
        const getCellContent = makeGetCellContent();
        const a = withMovableColumns({ columns: COLUMNS, getCellContent, order: ["city", "name", "score"] });
        const b = withMovableColumns({ columns: COLUMNS, getCellContent, order: ["city", "name", "score"] });
        expect(b.columns).toBe(a.columns);
        expect(b.getCellContent).toBe(a.getCellContent);
    });

    it("keeps columns and getCellContent stable when ONLY a callback identity changes", () => {
        // The read/write cache split. A consumer whose handler is an inline arrow shouldn't lose the
        // blit fast path over it.
        const getCellContent = makeGetCellContent();
        const order = ["city", "name", "score"];
        const a = withMovableColumns({ columns: COLUMNS, getCellContent, order, onCellsEdited: () => undefined });
        const b = withMovableColumns({ columns: COLUMNS, getCellContent, order, onCellsEdited: () => undefined });
        expect(b.columns).toBe(a.columns);
        expect(b.getCellContent).toBe(a.getCellContent);
        expect(b.onCellsEdited).not.toBe(a.onCellsEdited);
    });

    it("rebuilds when the order actually changes", () => {
        const getCellContent = makeGetCellContent();
        const a = withMovableColumns({ columns: COLUMNS, getCellContent, order: ["city", "name", "score"] });
        const b = withMovableColumns({ columns: COLUMNS, getCellContent, order: ["name", "city", "score"] });
        expect(b.columns).not.toBe(a.columns);
        expect(b.columns.map(c => c.title)).toEqual(["Name", "City", "Score"]);
    });

    it("rebuilds when the columns array identity changes", () => {
        const getCellContent = makeGetCellContent();
        const order = ["city", "name", "score"];
        const a = withMovableColumns({ columns: COLUMNS, getCellContent, order });
        const b = withMovableColumns({ columns: [...COLUMNS], getCellContent, order });
        expect(b.columns).not.toBe(a.columns);
    });
});
