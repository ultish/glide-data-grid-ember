// Phase 9a. Tests for `withColumnSort` — the composable sort decorator, and the one API in this
// addon whose whole purpose is preventing silent data corruption.
//
// WHY THE WRITE-PATH TESTS BELOW MATTER. A decorator that remaps rows for reading must also remap
// them for writing, or the two end up in different coordinate spaces: `onCellsEdited`'s `location`
// arrives in **displayed** row space while the caller's `getCellContent` and records array are in
// **original** row space. Applying such an edit without translating writes to the wrong record —
// silently, and invisibly until the next re-sort. That is not hypothetical: this project's own
// Phase 7c demo shipped with exactly that bug (PORTING-NOTES.md, 7f). Phase 8 made the translation
// structural by having the decorator own both halves; these tests pin that it stays that way.
//
// Phase 8 proved this with throwaway Node scripts that were never kept. This file is those
// assertions made permanent — see PHASES.md 9o, which lists "withColumnSort's write path" as an
// evidence gap. (The remaining half of that gap is a human typing into a sorted cell in a browser;
// a unit test can't close that, and it is still open.)
//
// The identity-stability tests are load-bearing too: `getCellContent` is one of `computeCanBlit`'s
// reference-compared fields, so a decorator returning a fresh closure per call would silently
// disable the scroll blit fast path. See `render/data-grid-render.blit.test.ts`.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { compareRaw, compareSmart, withColumnSort, type CellEdit } from "./column-sort.ts";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "../rendering/data-grid-types.ts";

const COLUMNS: readonly GridColumn[] = [
    { title: "Name", id: "name", width: 100 },
    { title: "Score", id: "score", width: 100 },
];

// Deliberately unsorted, with a distinct value per row so a mis-mapped row is unambiguous.
const NAMES = ["charlie", "alice", "bob"];
const SCORES = ["30", "10", "20"];

/** A fresh `getCellContent` over the fixture above. Fresh, because it is the decorator's cache key. */
function makeGetCellContent(): (cell: Item) => GridCell {
    return ([col, row]: Item): GridCell => {
        const data = col === 0 ? (NAMES[row] ?? "") : (SCORES[row] ?? "");
        return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
    };
}

function textOf(cell: GridCell): string {
    return (cell as { displayData: string }).displayData;
}

/** Reads column `col` down the *displayed* rows. */
function displayedColumn(getCellContent: (cell: Item) => GridCell, col: number, rows: number): string[] {
    return Array.from({ length: rows }, (_, row) => textOf(getCellContent([col, row])));
}

const ASC_BY_NAME = { column: COLUMNS[0]!, direction: "asc" } as const;

describe("withColumnSort — read path", () => {
    it("passes rows through untouched when no sort is active", () => {
        const getCellContent = makeGetCellContent();
        const res = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent });
        expect(displayedColumn(res.getCellContent, 0, 3)).toEqual(["charlie", "alice", "bob"]);
    });

    it("returns the caller's own getCellContent by IDENTITY when unsorted", () => {
        // Not merely equivalent — the same reference. A pass-through wrapper would be a fresh
        // identity every call and would kill the blit fast path on the common (unsorted) case.
        const getCellContent = makeGetCellContent();
        const res = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent });
        expect(res.getCellContent).toBe(getCellContent);
    });

    it("sorts ascending", () => {
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            sort: ASC_BY_NAME,
        });
        expect(displayedColumn(res.getCellContent, 0, 3)).toEqual(["alice", "bob", "charlie"]);
    });

    it("sorts descending", () => {
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            sort: { column: COLUMNS[0]!, direction: "desc" },
        });
        expect(displayedColumn(res.getCellContent, 0, 3)).toEqual(["charlie", "bob", "alice"]);
    });

    it("keeps a row's other columns aligned with it when sorted", () => {
        // The failure this catches is a sort map applied to one column but not another, which would
        // shuffle fields between records — the most damaging possible bug in a grid.
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            sort: ASC_BY_NAME,
        });
        expect(displayedColumn(res.getCellContent, 0, 3)).toEqual(["alice", "bob", "charlie"]);
        expect(displayedColumn(res.getCellContent, 1, 3)).toEqual(["10", "20", "30"]);
    });

    it("maps displayed rows back to original rows via getOriginalIndex", () => {
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            sort: ASC_BY_NAME,
        });
        // displayed 0 = "alice" = original row 1; displayed 2 = "charlie" = original row 0.
        expect(res.getOriginalIndex(0)).toBe(1);
        expect(res.getOriginalIndex(2)).toBe(0);
    });

    it("sorts by a second column to break ties in the first", () => {
        const names = ["b", "a", "a"];
        const scores = ["1", "9", "2"];
        const getCellContent = ([col, row]: Item): GridCell => {
            const data = col === 0 ? (names[row] ?? "") : (scores[row] ?? "");
            return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
        };
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            sort: [
                { column: COLUMNS[0]!, direction: "asc" },
                { column: COLUMNS[1]!, direction: "asc" },
            ],
        });
        expect(displayedColumn(res.getCellContent, 0, 3)).toEqual(["a", "a", "b"]);
        expect(displayedColumn(res.getCellContent, 1, 3)).toEqual(["2", "9", "1"]);
    });
});

describe("withColumnSort — WRITE path (the data-corruption guard)", () => {
    it("translates an edit's row from displayed space into original space", () => {
        // The headline case. Sorted ascending, displayed row 0 is "alice", which is ORIGINAL row 1.
        // An edit there must be reported at row 1, not row 0 — reporting row 0 would overwrite
        // "charlie".
        const onCellsEdited = vi.fn();
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            sort: ASC_BY_NAME,
        });
        const value: GridCell = { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true };
        res.onCellsEdited?.([{ location: [0, 0], value }]);

        expect(onCellsEdited).toHaveBeenCalledTimes(1);
        const edits = onCellsEdited.mock.calls[0]![0] as readonly CellEdit[];
        expect(edits[0]!.location).toEqual([0, 1]);
    });

    it("leaves the column index alone", () => {
        // `location[0]` is already in the consumer's own column space — the grid strips the
        // row-marker column at the callback boundary. Translating it too would be a second bug.
        const onCellsEdited = vi.fn();
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            sort: ASC_BY_NAME,
        });
        const value: GridCell = { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true };
        res.onCellsEdited?.([{ location: [1, 0], value }]);
        expect((onCellsEdited.mock.calls[0]![0] as readonly CellEdit[])[0]!.location).toEqual([1, 1]);
    });

    it("forwards a multi-cell batch as ONE call, every location translated", () => {
        // A paste arrives as a single batch; splitting it would turn one consumer notification into
        // many and could re-render per cell.
        const onCellsEdited = vi.fn();
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
            sort: ASC_BY_NAME,
        });
        const value: GridCell = { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true };
        res.onCellsEdited?.([
            { location: [0, 0], value },
            { location: [0, 2], value },
        ]);

        expect(onCellsEdited).toHaveBeenCalledTimes(1);
        const edits = onCellsEdited.mock.calls[0]![0] as readonly CellEdit[];
        // displayed 0 -> original 1 ("alice"); displayed 2 -> original 0 ("charlie").
        expect(edits.map(e => e.location)).toEqual([
            [0, 1],
            [0, 0],
        ]);
    });

    it("round-trips: editing displayed row R targets the record shown at displayed row R", () => {
        // The property that actually matters, stated directly: whatever the user sees at displayed
        // row R is the record their edit lands on.
        const onCellsEdited = vi.fn();
        const getCellContent = makeGetCellContent();
        const res = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent, onCellsEdited, sort: ASC_BY_NAME });
        const value: GridCell = { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true };

        for (let displayedRow = 0; displayedRow < 3; displayedRow++) {
            onCellsEdited.mockClear();
            const shown = textOf(res.getCellContent([0, displayedRow]));
            res.onCellsEdited?.([{ location: [0, displayedRow], value }]);
            const reported = (onCellsEdited.mock.calls[0]![0] as readonly CellEdit[])[0]!.location[1];
            expect(textOf(getCellContent([0, reported]))).toBe(shown);
        }
    });

    it("returns the caller's own handler by identity when no sort is active", () => {
        const onCellsEdited = vi.fn();
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            onCellsEdited,
        });
        expect(res.onCellsEdited).toBe(onCellsEdited);
    });

    it("is undefined when the caller passed no handler", () => {
        const res = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: makeGetCellContent(),
            sort: ASC_BY_NAME,
        });
        expect(res.onCellsEdited).toBeUndefined();
    });
});

describe("withColumnSort — identity stability (protects the blit fast path)", () => {
    it("returns an identical getCellContent across calls with unchanged inputs", () => {
        const getCellContent = makeGetCellContent();
        const a = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent, sort: ASC_BY_NAME });
        const b = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent, sort: ASC_BY_NAME });
        expect(b.getCellContent).toBe(a.getCellContent);
    });

    it("survives a freshly allocated but structurally identical sort object", () => {
        // A consumer building `sort` in a getter allocates a new object every call. The decorator
        // memoizes on a structural key precisely so that doesn't thrash the sort map.
        const getCellContent = makeGetCellContent();
        const a = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            sort: { column: COLUMNS[0]!, direction: "asc" },
        });
        const b = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            sort: { column: COLUMNS[0]!, direction: "asc" },
        });
        expect(b.getCellContent).toBe(a.getCellContent);
    });

    it("keeps getCellContent's identity when ONLY the edit handler changes", () => {
        // The read and write halves are cached separately for exactly this case: a consumer whose
        // edit handler is an inline arrow shouldn't lose the blit fast path (or trigger an O(rows)
        // re-sort) just because that one reference churned.
        const getCellContent = makeGetCellContent();
        const a = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            onCellsEdited: () => undefined,
            sort: ASC_BY_NAME,
        });
        const b = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            onCellsEdited: () => undefined,
            sort: ASC_BY_NAME,
        });
        expect(b.getCellContent).toBe(a.getCellContent);
        expect(b.onCellsEdited).not.toBe(a.onCellsEdited);
    });

    it("rebuilds getCellContent when the sort direction actually changes", () => {
        const getCellContent = makeGetCellContent();
        const asc = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent, sort: ASC_BY_NAME });
        const desc = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent,
            sort: { column: COLUMNS[0]!, direction: "desc" },
        });
        expect(desc.getCellContent).not.toBe(asc.getCellContent);
    });

    it("rebuilds when the row count changes", () => {
        const getCellContent = makeGetCellContent();
        const a = withColumnSort({ columns: COLUMNS, rows: 3, getCellContent, sort: ASC_BY_NAME });
        const b = withColumnSort({ columns: COLUMNS, rows: 2, getCellContent, sort: ASC_BY_NAME });
        expect(b.getCellContent).not.toBe(a.getCellContent);
    });
});

describe("comparators", () => {
    it("compareRaw orders relationally", () => {
        expect(compareRaw(1, 2)).toBe(-1);
        expect(compareRaw(2, 1)).toBe(1);
        expect(compareRaw(2, 2)).toBe(0);
        expect(compareRaw("a", "b")).toBe(-1);
    });

    it("compareSmart orders numeric strings numerically, not lexically", () => {
        // The whole point of "smart": raw/lexical ordering puts "10" before "9".
        expect(compareSmart("9", "10")).toBe(-1);
        expect(compareRaw("9", "10")).toBe(1);
    });

    it("compareSmart treats a number and its string form as equal", () => {
        // Surprising: uses loose equality (`a == b`) to catch the mixed number/string case.
        expect(compareSmart(1, "1")).toBe(0);
    });

    it("compareSmart falls back to locale comparison for non-numeric strings", () => {
        expect(compareSmart("apple", "banana")).toBe(-1);
        expect(compareSmart("banana", "apple")).toBe(1);
        expect(compareSmart("apple", "apple")).toBe(0);
    });
});
