// Phase 9a. Tests for `synthesizeCellsForSelection` — the pure half of `getCellsForSelection`
// support, and the path taken whenever a consumer passes `@getCellsForSelection={{true}}` or omits
// it entirely (which is every consumer today).
//
// The invariant worth protecting is **shape**: the result must always be exactly
// `rect.height` x `rect.width`, with out-of-data positions filled by `Loading` rather than skipped.
// A ragged array would silently misalign column indexes in the copy buffer — the copied TSV would
// have cells under the wrong headers, which looks like corrupted data rather than a bug in the
// grid.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { synthesizeCellsForSelection } from "./cells-for-selection.ts";
import { GridCellKind, type GridCell, type Item } from "./data-grid-types.ts";

const ROWS = 10;

function getCellContent([col, row]: Item): GridCell {
    const data = `R${row}C${col}`;
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
}

function textGrid(cells: ReturnType<typeof synthesizeCellsForSelection>): string[][] {
    return cells.map(row =>
        row.map(c => (c.kind === GridCellKind.Loading ? "LOADING" : (c as { displayData: string }).displayData))
    );
}

describe("synthesizeCellsForSelection", () => {
    it("returns the requested rectangle in row-major order", () => {
        const cells = synthesizeCellsForSelection({ x: 1, y: 2, width: 2, height: 3 }, ROWS, getCellContent);
        expect(textGrid(cells)).toEqual([
            ["R2C1", "R2C2"],
            ["R3C1", "R3C2"],
            ["R4C1", "R4C2"],
        ]);
    });

    it("is exactly height x width", () => {
        const cells = synthesizeCellsForSelection({ x: 0, y: 0, width: 4, height: 3 }, ROWS, getCellContent);
        expect(cells).toHaveLength(3);
        for (const row of cells) expect(row).toHaveLength(4);
    });

    it("returns a single cell for a 1x1 rect", () => {
        const cells = synthesizeCellsForSelection({ x: 3, y: 7, width: 1, height: 1 }, ROWS, getCellContent);
        expect(textGrid(cells)).toEqual([["R7C3"]]);
    });

    it("returns an empty array for a zero-height rect", () => {
        expect(synthesizeCellsForSelection({ x: 0, y: 0, width: 3, height: 0 }, ROWS, getCellContent)).toEqual([]);
    });

    it("returns empty rows — not an empty array — for a zero-width rect", () => {
        // Shape matters more than emptiness: `height` rows of nothing, so downstream row indexing
        // still lines up.
        const cells = synthesizeCellsForSelection({ x: 0, y: 0, width: 0, height: 2 }, ROWS, getCellContent);
        expect(cells).toHaveLength(2);
        expect(cells[0]).toEqual([]);
    });

    describe("out-of-data positions become Loading, and the rect stays rectangular", () => {
        it("pads rows at or past the row count", () => {
            const cells = synthesizeCellsForSelection({ x: 0, y: 8, width: 2, height: 4 }, ROWS, getCellContent);
            expect(textGrid(cells)).toEqual([
                ["R8C0", "R8C1"],
                ["R9C0", "R9C1"],
                ["LOADING", "LOADING"], // row 10 — past the end
                ["LOADING", "LOADING"], // row 11
            ]);
        });

        it("pads negative columns", () => {
            // Reachable when a selection starts at the row-marker column: the controller subtracts
            // `rowMarkerOffset` before asking, which can push `x` to -1.
            const cells = synthesizeCellsForSelection({ x: -1, y: 0, width: 3, height: 1 }, ROWS, getCellContent);
            expect(textGrid(cells)).toEqual([["LOADING", "R0C0", "R0C1"]]);
        });

        it("never asks getCellContent for an out-of-data position", () => {
            // The guard has to short-circuit, not merely discard the answer — a consumer's
            // `getCellContent` is entitled to throw or misbehave outside its own bounds.
            const asked: Item[] = [];
            const spy = (item: Item): GridCell => {
                asked.push([...item] as Item);
                return getCellContent(item);
            };
            synthesizeCellsForSelection({ x: -1, y: 9, width: 2, height: 2 }, ROWS, spy);
            expect(asked).toEqual([[0, 9]]); // only the one in-bounds cell
        });
    });

    it("does not require the rect to fit inside the data at all", () => {
        const cells = synthesizeCellsForSelection({ x: -2, y: 50, width: 2, height: 2 }, ROWS, getCellContent);
        expect(textGrid(cells)).toEqual([
            ["LOADING", "LOADING"],
            ["LOADING", "LOADING"],
        ]);
    });
});
