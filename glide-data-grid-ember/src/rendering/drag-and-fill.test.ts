// Phase 9h. Tests for the row-reorder preview remap and the fill-pattern edit computation.
//
// These two are where 9h can silently corrupt data rather than merely look wrong: the remap decides
// which record each screen row displays mid-drag, and the fill decides which cells get overwritten
// with what. Both are index arithmetic with an off-by-one on either side, so each test below is
// written as a whole-table outcome ("after dragging row 0 to row 3, the screen reads B C D A E")
// rather than as a restatement of the formula.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { computeFillEdits, previewRowOrder } from "./drag-and-fill.ts";
import { GridCellKind, type GridCell } from "./data-grid-types.ts";

// Renders the whole preview as the letters a user would actually see, given rows A..E.
function previewOf(rowCount: number, srcRow: number, dropRow: number): string {
    const letters = "ABCDEFGHIJ";
    let out = "";
    for (let screen = 0; screen < rowCount; screen++) {
        out += letters[previewRowOrder(screen, srcRow, dropRow)] ?? "?";
    }
    return out;
}

describe("previewRowOrder", () => {
    it("shows the dragged row at the drop position", () => {
        expect(previewRowOrder(3, 0, 3)).toBe(0);
    });

    it("shifts the rows between source and destination up when dragging downwards", () => {
        // A dragged from the top to position 3: B C D close up behind it, A lands after D.
        expect(previewOf(5, 0, 3)).toBe("BCDAE");
    });

    it("shifts the rows between destination and source down when dragging upwards", () => {
        // D dragged from position 3 up to position 1: A stays, D lands, B C push down.
        expect(previewOf(5, 3, 1)).toBe("ADBCE");
    });

    it("is the identity when the row is dropped where it started", () => {
        expect(previewOf(5, 2, 2)).toBe("ABCDE");
    });

    it("handles a single-step move in either direction", () => {
        expect(previewOf(5, 1, 2)).toBe("ACBDE");
        expect(previewOf(5, 2, 1)).toBe("ACBDE");
    });

    it("handles dragging the first row to the last position and back", () => {
        expect(previewOf(5, 0, 4)).toBe("BCDEA");
        expect(previewOf(5, 4, 0)).toBe("EABCD");
    });

    it("is a permutation: every row appears exactly once, whatever the move", () => {
        // The property that actually matters -- a remap that loses or duplicates a row would show a
        // plausible-looking table with a row silently missing.
        for (let src = 0; src < 6; src++) {
            for (let drop = 0; drop < 6; drop++) {
                const seen = new Set<number>();
                for (let screen = 0; screen < 6; screen++) seen.add(previewRowOrder(screen, src, drop));
                expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
            }
        }
    });
});

function text(data: string): GridCell {
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
}

function readonlyText(data: string): GridCell {
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true, readonly: true };
}

const FULL_GRID = { columnCount: 10, rowCount: 10 };

describe("computeFillEdits", () => {
    it("fills downwards from a single-cell pattern", () => {
        const edits = computeFillEdits({
            pattern: [[text("x")]],
            source: { x: 1, y: 1, width: 1, height: 1 },
            destination: { x: 1, y: 1, width: 1, height: 4 },
            ...FULL_GRID,
        });
        expect(edits.map(e => e.location)).toEqual([
            [1, 2],
            [1, 3],
            [1, 4],
        ]);
        expect(edits.every(e => (e.value as { data: string }).data === "x")).toBe(true);
    });

    it("never writes back over the pattern it is copying from", () => {
        const edits = computeFillEdits({
            pattern: [[text("a")], [text("b")]],
            source: { x: 0, y: 0, width: 1, height: 2 },
            destination: { x: 0, y: 0, width: 1, height: 6 },
            ...FULL_GRID,
        });
        expect(edits.map(e => e.location[1])).toEqual([2, 3, 4, 5]);
    });

    it("tiles a multi-row pattern by repeating it", () => {
        const edits = computeFillEdits({
            pattern: [[text("a")], [text("b")]],
            source: { x: 0, y: 0, width: 1, height: 2 },
            destination: { x: 0, y: 0, width: 1, height: 6 },
            ...FULL_GRID,
        });
        expect(edits.map(e => (e.value as { data: string }).data)).toEqual(["a", "b", "a", "b"]);
    });

    it("tiles in both axes at once", () => {
        const edits = computeFillEdits({
            pattern: [
                [text("a"), text("b")],
                [text("c"), text("d")],
            ],
            source: { x: 0, y: 0, width: 2, height: 2 },
            destination: { x: 0, y: 0, width: 4, height: 2 },
            ...FULL_GRID,
        });
        // Only the right-hand half is outside the pattern; it repeats the same two columns.
        expect(edits.map(e => [e.location[0], e.location[1], (e.value as { data: string }).data])).toEqual([
            [2, 0, "a"],
            [2, 1, "c"],
            [3, 0, "b"],
            [3, 1, "d"],
        ]);
    });

    it("fills upwards when the destination starts above the pattern", () => {
        const edits = computeFillEdits({
            pattern: [[text("z")]],
            source: { x: 0, y: 5, width: 1, height: 1 },
            destination: { x: 0, y: 2, width: 1, height: 4 },
            ...FULL_GRID,
        });
        expect(edits.map(e => e.location[1])).toEqual([2, 3, 4]);
    });

    it("skips cells that are not read-write rather than replacing them", () => {
        const edits = computeFillEdits({
            pattern: [[readonlyText("locked")]],
            source: { x: 0, y: 0, width: 1, height: 1 },
            destination: { x: 0, y: 0, width: 1, height: 3 },
            ...FULL_GRID,
        });
        expect(edits).toEqual([]);
    });

    it("clamps to the grid rather than writing past the last row or column", () => {
        const edits = computeFillEdits({
            pattern: [[text("x")]],
            source: { x: 0, y: 0, width: 1, height: 1 },
            destination: { x: 0, y: 0, width: 1, height: 10 },
            columnCount: 3,
            rowCount: 4,
        });
        expect(edits.map(e => e.location[1])).toEqual([1, 2, 3]);
    });

    it("returns nothing for an empty pattern instead of dividing by zero", () => {
        expect(
            computeFillEdits({
                pattern: [],
                source: { x: 0, y: 0, width: 0, height: 0 },
                destination: { x: 0, y: 0, width: 3, height: 3 },
                ...FULL_GRID,
            })
        ).toEqual([]);
    });

    it("copies the pattern cells rather than aliasing them", () => {
        // Every filled cell must be its own object: handing the same reference to N locations makes
        // a later in-place edit of one cell silently change all of them.
        const cell = text("shared");
        const edits = computeFillEdits({
            pattern: [[cell]],
            source: { x: 0, y: 0, width: 1, height: 1 },
            destination: { x: 0, y: 0, width: 1, height: 4 },
            ...FULL_GRID,
        });
        expect(edits).toHaveLength(3);
        for (const e of edits) expect(e.value).not.toBe(cell);
        expect(new Set(edits.map(e => e.value)).size).toBe(3);
    });
});
