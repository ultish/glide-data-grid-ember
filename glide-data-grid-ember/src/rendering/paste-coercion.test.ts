// Phase 9g. Tests for `coercePasteCell` — every rule that decides what a pasted string becomes.
//
// This logic lived as a private method on `GridHostController` until 9g, i.e. it was only ever
// verified by pasting into a browser. It is worth real tests for one specific reason recorded in
// PORTING-NOTES.md: its `GridCellKind.Custom` branch was *wrong* for three phases and the symptom
// was "paste into a sparkline/star/tags cell does nothing", which is indistinguishable from
// "pasting there isn't supported". A returned `undefined` is a silent skip by design, so every
// `undefined` below is an assertion that the skip is deliberate rather than an accident.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { coercePasteCell, pasteBufferToString } from "./paste-coercion.ts";
import { BooleanEmpty, BooleanIndeterminate, GridCellKind } from "./data-grid-types.ts";
import type { GridCell, CustomCell } from "./data-grid-types.ts";
import type { CellBuffer } from "./copy-paste.ts";
import type { GetCellRendererCallback } from "./cell-types.ts";

function buf(rawValue: CellBuffer["rawValue"], formatted = ""): CellBuffer {
    return { rawValue, formatted, format: "string" } as CellBuffer;
}

const noRenderer: GetCellRendererCallback = () => undefined;

const textCell: GridCell = { kind: GridCellKind.Text, data: "old", displayData: "old", allowOverlay: true };
const numberCell: GridCell = { kind: GridCellKind.Number, data: 1, displayData: "1", allowOverlay: true };
const booleanCell: GridCell = { kind: GridCellKind.Boolean, data: true, allowOverlay: false };
const uriCell: GridCell = { kind: GridCellKind.Uri, data: "https://old", allowOverlay: true };

describe("pasteBufferToString", () => {
    it("joins a string-array buffer with commas", () => {
        expect(pasteBufferToString(buf(["a", "b"]))).toBe("a, b");
    });

    it("falls back to the formatted value when there is no raw value", () => {
        expect(pasteBufferToString(buf(undefined, "shown"))).toBe("shown");
    });

    it("stringifies a numeric raw value rather than using the formatted one", () => {
        expect(pasteBufferToString(buf(1234, "1,234"))).toBe("1234");
    });
});

describe("coercePasteCell — built-in kinds", () => {
    it("text takes the pasted string as both data and displayData", () => {
        expect(coercePasteCell(textCell, buf("new"), noRenderer)).toEqual({ ...textCell, data: "new", displayData: "new" });
    });

    it("number parses, keeping the pasted text as the display value", () => {
        expect(coercePasteCell(numberCell, buf("42"), noRenderer)).toEqual({
            ...numberCell,
            data: 42,
            displayData: "42",
        });
    });

    it("number treats an empty paste as clearing the cell, not as zero", () => {
        expect(coercePasteCell(numberCell, buf("   "), noRenderer)).toEqual({
            ...numberCell,
            data: undefined,
            displayData: "",
        });
    });

    it("number refuses a non-numeric paste rather than writing NaN", () => {
        expect(coercePasteCell(numberCell, buf("banana"), noRenderer)).toBeUndefined();
    });

    it.each([
        ["TRUE", true],
        ["true", true],
        [" False ", false],
        ["indeterminate", BooleanIndeterminate],
        ["yes", BooleanEmpty],
        ["", BooleanEmpty],
    ])("boolean maps %j to %j", (raw, expected) => {
        expect(coercePasteCell(booleanCell, buf(raw), noRenderer)).toEqual({ ...booleanCell, data: expected });
    });

    it("uri replaces data and leaves the rest of the cell alone", () => {
        expect(coercePasteCell(uriCell, buf("https://new"), noRenderer)).toEqual({ ...uriCell, data: "https://new" });
    });

    it("skips a kind with no paste rule", () => {
        const image: GridCell = { kind: GridCellKind.Image, data: ["a.png"], allowOverlay: false };
        expect(coercePasteCell(image, buf("b.png"), noRenderer)).toBeUndefined();
    });
});

describe("coercePasteCell — custom cells", () => {
    const customCell: CustomCell<{ v: string }> = {
        kind: GridCellKind.Custom,
        data: { v: "old" },
        copyData: "old",
        allowOverlay: true,
    };

    it("dispatches to the renderer's own onPaste", () => {
        const getCellRenderer = (() => ({ onPaste: (v: string) => ({ v }) })) as unknown as GetCellRendererCallback;
        expect(coercePasteCell(customCell, buf("new"), getCellRenderer)).toEqual({ ...customCell, data: { v: "new" } });
    });

    it("skips when the renderer declines the value", () => {
        const getCellRenderer = (() => ({ onPaste: () => undefined })) as unknown as GetCellRendererCallback;
        expect(coercePasteCell(customCell, buf("new"), getCellRenderer)).toBeUndefined();
    });

    it("skips when the renderer has no onPaste at all", () => {
        expect(coercePasteCell(customCell, buf("new"), noRenderer)).toBeUndefined();
    });
});

describe("coercePasteCell — the coercePasteValue override", () => {
    it("wins outright over the built-in rule", () => {
        const coerced: GridCell = { kind: GridCellKind.Number, data: 7, displayData: "seven", allowOverlay: true };
        expect(coercePasteCell(numberCell, buf("banana"), noRenderer, () => coerced)).toBe(coerced);
    });

    it("receives the flattened string and the cell being pasted into", () => {
        const spy = vi.fn(() => undefined);
        coercePasteCell(textCell, buf(["a", "b"]), noRenderer, spy);
        expect(spy).toHaveBeenCalledWith("a, b", textCell);
    });

    it("falls through to the built-in rule when it returns undefined", () => {
        expect(coercePasteCell(textCell, buf("new"), noRenderer, () => undefined)).toEqual({
            ...textCell,
            data: "new",
            displayData: "new",
        });
    });

    it("is ignored when it tries to change the cell's kind", () => {
        // A kind change would break the column's layout; source only warns in development, this
        // port drops the result and falls through, which is the same outcome minus the surprise.
        const wrongKind: GridCell = { kind: GridCellKind.Number, data: 7, displayData: "7", allowOverlay: true };
        expect(coercePasteCell(textCell, buf("new"), noRenderer, () => wrongKind)).toEqual({
            ...textCell,
            data: "new",
            displayData: "new",
        });
    });

    it("is ignored when it returns a non-editable cell", () => {
        const notEditable: GridCell = { kind: GridCellKind.Loading, allowOverlay: false };
        expect(coercePasteCell(textCell, buf("new"), noRenderer, () => notEditable)).toEqual({
            ...textCell,
            data: "new",
            displayData: "new",
        });
    });
});
