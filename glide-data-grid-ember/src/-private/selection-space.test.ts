// The column coordinate space of `@onSelectionChanged` (2026-08-09).
//
// THE DEFECT THIS PINS. With row markers on, the grid inserts a synthetic marker column at internal
// index 0, so the consumer's first column is internally index 1. `@onCellsEdited` and all three
// context-menu callbacks subtract that offset before calling the consumer; `@onSelectionChanged` did
// not, so the *same* column arrived with two different numbers depending on which callback reported
// it. `GridHostController` now holds its selection in consumer space and converts on the way out to
// the renderer, mirroring source's `shiftSelection(newVal, -rowMarkerOffset)`
// (`data-editor.tsx:1009`). The two header-glyph callbacks were a second miss of the same shape
// (a scalar `col: number` the brands cannot catch) and are pinned by `unmangleColumn` below.
//
// WHY IT NEEDS A TEST AT ALL, given the brands in `selection-space.ts` make a missed conversion a
// compile error: the brands police *where* conversions happen, not whether the conversion itself is
// right, and `rowMarkerOffset` is 0 whenever row markers are off -- so every marker-less demo and
// test passes identically either way. Every case below is therefore run with markers on AND off.
//
// What this file cannot cover: which call sites in `GridHostController` are on which side of the
// boundary. That needs a DOM (see `vitest.config.ts`) and, for drag-extend / row+column range
// selection / select-all, a human click. Flagged in the handoff notes rather than silently omitted.
import { describe, expect, it } from "vitest";
import {
    asConsumerSelection,
    EMPTY_SELECTION,
    MangledSelectionCache,
    shiftSelection,
    unmangleColumn,
    unmangleSelection,
    type MangledSelection,
} from "./selection-space.ts";
import { CompactSelection } from "../rendering/data-grid-types.ts";
import type { GridSelection } from "../rendering/data-grid-types.ts";

/**
 * Fabricate a mangled selection for a test that needs one as *input*.
 *
 * `selection-space.ts` deliberately exports no `asMangledSelection`: the whole value of the brand is
 * that only the conversion can mint a `MangledSelection`, so a stray object literal in the
 * controller becomes a compile error rather than a silent off-by-one. A test constructing a
 * synthetic input is the one legitimate exception, and it goes through `unknown` here so that the
 * exception stays visible and stays confined to this file — do not add this helper to the module.
 */
function fabricateMangled(selection: GridSelection): MangledSelection {
    return selection as unknown as MangledSelection;
}

/** A selection of consumer column 2, row 5, with a 2-wide range and column 2 also column-selected. */
function consumerSelection(): GridSelection {
    return asConsumerSelection({
        current: {
            cell: [2, 5],
            range: { x: 2, y: 5, width: 2, height: 1 },
            rangeStack: [{ x: 0, y: 0, width: 1, height: 1 }],
        },
        rows: CompactSelection.fromSingleSelection([3, 6]),
        columns: CompactSelection.fromSingleSelection(2),
    });
}

describe("shiftSelection", () => {
    it("shifts cell, range, rangeStack and selected columns", () => {
        const shifted = shiftSelection(consumerSelection(), 1);
        expect(shifted.current?.cell).toEqual([3, 5]);
        expect(shifted.current?.range).toEqual({ x: 3, y: 5, width: 2, height: 1 });
        expect(shifted.current?.rangeStack).toEqual([{ x: 1, y: 0, width: 1, height: 1 }]);
        expect(shifted.columns.toArray()).toEqual([3]);
    });

    it("leaves selected ROWS alone -- the marker column is a column", () => {
        const shifted = shiftSelection(consumerSelection(), 1);
        expect(shifted.rows.toArray()).toEqual([3, 4, 5]);
    });

    it("round-trips", () => {
        const original = consumerSelection();
        const there = shiftSelection(original, 1);
        const back = shiftSelection(there, -1);
        expect(back).toEqual(original);
    });

    it("is the identity function at offset 0, reference and all", () => {
        // Load-bearing: `computeCanBlit` identity-compares `DrawGridArg.selection`, so a
        // marker-less grid must not pay a fresh allocation for a no-op shift.
        const original = consumerSelection();
        expect(shiftSelection(original, 1234)).not.toBe(original);
        expect(shiftSelection(original, 0)).toBe(original);
    });

    it("returns the input untouched when there is nothing with a column coordinate", () => {
        // Source's own early-out (`data-editor.tsx:179`). A rows-only selection is the same value
        // in both spaces, so it keeps its identity even with markers on.
        const rowsOnly = asConsumerSelection({
            current: undefined,
            rows: CompactSelection.fromSingleSelection([0, 3]),
            columns: CompactSelection.empty(),
        });
        expect(shiftSelection(rowsOnly, 1)).toBe(rowsOnly);
        expect(shiftSelection(EMPTY_SELECTION, 1)).toBe(EMPTY_SELECTION);
    });
});

describe("@onSelectionChanged reports the consumer's column space", () => {
    // `MangledSelectionCache.get` is what the renderer/hit-testing sees; `unmangleSelection` is what
    // `applySelection` -> `onSelectionChanged` sees. The pair below is the whole contract.
    it.each([
        ["row markers off", 0],
        ["row markers on", 1],
    ])("%s: what the renderer draws is offset, what the callback receives is not", (_label, offset) => {
        const cache = new MangledSelectionCache();
        const consumer = consumerSelection();
        const drawn = cache.get(asConsumerSelection(consumer), offset);

        // The renderer sees the marker column accounted for...
        expect(drawn.current?.cell[0]).toBe(2 + offset);
        expect(drawn.current?.range.x).toBe(2 + offset);
        expect(drawn.columns.toArray()).toEqual([2 + offset]);

        // ...and the consumer sees its own column 2, exactly like `@onCellsEdited` would report it.
        const reported = unmangleSelection(drawn, offset);
        expect(reported.current?.cell[0]).toBe(2);
        expect(reported.current?.range.x).toBe(2);
        expect(reported.columns.toArray()).toEqual([2]);
        expect(reported.rows.toArray()).toEqual([3, 4, 5]);
    });

    it.each([
        ["row markers off", 0],
        ["row markers on", 1],
    ])("%s: a click resolved in hit-test space reports the consumer's column", (_label, offset) => {
        // Models `dispatchCellMouseDown`: a click on the consumer's first column arrives as
        // `hit.location[0] === offset`, is written into the mangled selection, and must come back
        // out as column 0.
        const clickedMangledCol = offset;
        const mangled = fabricateMangled({
            current: {
                cell: [clickedMangledCol, 4],
                range: { x: clickedMangledCol, y: 4, width: 1, height: 1 },
                rangeStack: [],
            },
            rows: CompactSelection.empty(),
            columns: CompactSelection.empty(),
        });

        expect(unmangleSelection(mangled, offset).current?.cell).toEqual([0, 4]);
    });

    it.each([
        ["row markers off", 0],
        ["row markers on", 1],
    ])("%s: select-all covers every consumer column and never the marker column", (_label, offset) => {
        // `selectAll` builds consumer space directly: columns 0..3 of a 3-column grid.
        const selectAll = asConsumerSelection({
            current: { cell: [0, 0], range: { x: 0, y: 0, width: 3, height: 10 }, rangeStack: [] },
            rows: CompactSelection.empty(),
            columns: CompactSelection.empty(),
        });
        const drawn = new MangledSelectionCache().get(selectAll, offset);
        // Drawn: starts right after the marker column, still 3 columns wide.
        expect(drawn.current?.range).toEqual({ x: offset, y: 0, width: 3, height: 10 });
        // Reported: the consumer's whole grid, from column 0.
        expect(unmangleSelection(drawn, offset).current?.range).toEqual({ x: 0, y: 0, width: 3, height: 10 });
    });

    it("a column-selection range keeps its width when converted", () => {
        // Column *ranges* are the case a per-cell fix would miss: `CompactSelection.offset` has to
        // move every slice, not just the first index.
        const consumer = asConsumerSelection({
            current: undefined,
            rows: CompactSelection.empty(),
            columns: CompactSelection.fromSingleSelection([1, 4]).add(7),
        });
        const drawn = new MangledSelectionCache().get(consumer, 1);
        expect(drawn.columns.toArray()).toEqual([2, 3, 4, 8]);
        expect(unmangleSelection(drawn, 1).columns.toArray()).toEqual([1, 2, 3, 7]);
    });
});

describe("unmangleColumn — header-glyph callbacks (§4b.7)", () => {
    // `@onHeaderMenuClick` / `@onHeaderIndicatorClick` take a scalar `col: number`, so the
    // `GridSelection` brands cannot catch a missed conversion. These two shipped mangled from
    // 2026-08-09 until 2026-08-22. The fire site is `unmangleColumn(pending.col, rowMarkerOffset)`.
    it.each([
        ["row markers off", 0],
        ["row markers on", 1],
    ])("%s: a glyph click on consumer column 4 (Notes) reports 4", (_label, offset) => {
        const consumerCol = 4;
        expect(unmangleColumn(consumerCol + offset, offset)).toBe(consumerCol);
    });

    it("a click on the first consumer column is 0, not the marker", () => {
        expect(unmangleColumn(1, 1)).toBe(0);
        expect(unmangleColumn(0, 0)).toBe(0);
    });
});

describe("MangledSelectionCache", () => {
    it("returns the same object for the same selection, so the blit survives", () => {
        // Same defect class as `mangled-layout.test.ts`: `computeCanBlit` compares
        // `DrawGridArg.selection` by identity, so re-shifting per draw would silently disable the
        // scroll fast path.
        const cache = new MangledSelectionCache();
        const consumer = asConsumerSelection(consumerSelection());
        expect(cache.get(consumer, 1)).toBe(cache.get(consumer, 1));
    });

    it("invalidates when the selection changes", () => {
        const cache = new MangledSelectionCache();
        const first = cache.get(asConsumerSelection(consumerSelection()), 1);
        expect(cache.get(asConsumerSelection(consumerSelection()), 1)).not.toBe(first);
    });

    it("invalidates when row markers are toggled", () => {
        const cache = new MangledSelectionCache();
        const consumer = asConsumerSelection(consumerSelection());
        const withMarkers = cache.get(consumer, 1);
        const without = cache.get(consumer, 0);
        expect(without).not.toBe(withMarkers);
        expect(without.current?.cell[0]).toBe(2);
    });
});
