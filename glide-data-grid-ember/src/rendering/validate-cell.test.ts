// Phase 9g. Tests for `applyCellValidation` — the resolution of source's three `validateCell`
// return shapes (`false` / `true` / a coerced cell) into the (value, isValid) pair the overlay
// editor acts on.
//
// Small, but worth pinning: `false` and a returned cell are easy to conflate, and getting it wrong
// means either "every edit silently discards" or "invalid values commit anyway" — both of which
// look like a data bug rather than a validation bug.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { applyCellValidation } from "./validate-cell.ts";
import { GridCellKind } from "./data-grid-types.ts";
import type { GridCell, ValidatedGridCell, Item } from "./data-grid-types.ts";

const location: Item = [2, 5];
const prev: GridCell = { kind: GridCellKind.Text, data: "old", displayData: "old", allowOverlay: true };
const next: GridCell = { kind: GridCellKind.Text, data: "new", displayData: "new", allowOverlay: true };

describe("applyCellValidation", () => {
    it("passes the value through untouched when there is no callback", () => {
        const result = applyCellValidation(location, next, prev, undefined);
        expect(result).toEqual({ value: next, isValid: true });
        expect(result.value).toBe(next);
    });

    it("accepts on true", () => {
        expect(applyCellValidation(location, next, prev, () => true)).toEqual({ value: next, isValid: true });
    });

    it("rejects on false, keeping the proposed value so the editor can still show it", () => {
        expect(applyCellValidation(location, next, prev, () => false)).toEqual({ value: next, isValid: false });
    });

    it("swaps in a coerced cell and treats it as valid", () => {
        const coerced: ValidatedGridCell = {
            kind: GridCellKind.Text,
            data: "NEW",
            displayData: "NEW",
            allowOverlay: true,
        };
        expect(applyCellValidation(location, next, prev, () => coerced)).toEqual({ value: coerced, isValid: true });
    });

    it("hands the callback the location, the proposed value and the previous value", () => {
        const spy = vi.fn(() => true);
        applyCellValidation(location, next, prev, spy);
        expect(spy).toHaveBeenCalledWith(location, next, prev);
    });

    it("never consults the callback for a non-editable cell", () => {
        // Mirrors source's `isEditableGridCell(newVal)` guard: a Loading/Protected/Bubble value is
        // not something a consumer's validator was written against, so offering it one would be a
        // divergence, not a courtesy.
        const loading: GridCell = { kind: GridCellKind.Loading, allowOverlay: false };
        const spy = vi.fn(() => false);
        expect(applyCellValidation(location, loading, prev, spy)).toEqual({ value: loading, isValid: true });
        expect(spy).not.toHaveBeenCalled();
    });
});
