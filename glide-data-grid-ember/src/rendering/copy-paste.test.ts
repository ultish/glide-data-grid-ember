// Phase 9a. Unit tests for the plain-text TSV paste parser (`unquote`) and the copy-buffer
// builder (`getCopyBufferContents`), both ported in Phase 3c from source's
// `data-editor/data-editor-fns.ts` and `data-editor/copy-paste.ts`.
//
// CONVENTIONS FOR THIS SUITE (follow these in any new test file here):
//
//  1. Test the CONTRACT, not the implementation. These are ports -- a test that pins down an
//     incidental detail of how the port happens to be written makes future re-syncs with source
//     harder, not easier.
//  2. Where behaviour looks surprising, say so in a comment and cite source. A port's job is to
//     match source, so "this looks wrong but source does it too" is a passing test with a note,
//     NOT a bug to fix. Do not silently "correct" ported behaviour in a test's expectations.
//  3. No DOM. This file runs in bare Node (see `vitest.config.ts`). `decodeHTML` is deliberately
//     untested here because it uses the browser's HTML parser -- it needs a jsdom/happy-dom
//     environment, which this harness does not yet have.
//  4. Prefer a table (`it.each`) when the same assertion shape repeats over many inputs.
import { describe, expect, it } from "vitest";
import { getCopyBufferContents, unquote } from "./copy-paste.ts";
import { GridCellKind, type GridCell } from "./data-grid-types.ts";

function textCell(data: string): GridCell {
    return {
        kind: GridCellKind.Text,
        data,
        displayData: data,
        allowOverlay: true,
    };
}

function numberCell(data: number | undefined): GridCell {
    return {
        kind: GridCellKind.Number,
        data,
        displayData: String(data ?? ""),
        allowOverlay: true,
    };
}

/** `unquote` returns `CellBuffer`s; every test here only cares about the raw values. */
function raw(buffer: ReturnType<typeof unquote>): string[][] {
    return buffer.map(row => row.map(cell => cell.rawValue as string));
}

describe("unquote (plain-text TSV paste parser)", () => {
    it("parses a single unquoted cell", () => {
        expect(raw(unquote("hello"))).toEqual([["hello"]]);
    });

    it("splits columns on tabs and rows on newlines", () => {
        expect(raw(unquote("a\tb\nc\td"))).toEqual([
            ["a", "b"],
            ["c", "d"],
        ]);
    });

    it("normalises CRLF to LF before parsing", () => {
        expect(raw(unquote("a\tb\r\nc\td"))).toEqual([
            ["a", "b"],
            ["c", "d"],
        ]);
    });

    it("unwraps a quoted field and collapses doubled quotes", () => {
        // `""` inside a quoted field is the escape for a literal `"` -- the inverse of
        // `escapeIfNeeded`, which is what this port's own copy path emits.
        expect(raw(unquote(`"he said ""hi"""`))).toEqual([[`he said "hi"`]]);
    });

    it("keeps tabs and newlines that appear inside a quoted field", () => {
        expect(raw(unquote(`"a\tb"\tc`))).toEqual([["a\tb", "c"]]);
        expect(raw(unquote(`"line1\nline2"\tc`))).toEqual([["line1\nline2", "c"]]);
    });

    it("preserves empty fields rather than dropping them", () => {
        expect(raw(unquote("a\t\tb"))).toEqual([["a", "", "b"]]);
    });

    it("round-trips what this port's own copy path produces", () => {
        // The Phase 3c browser test copied a 2x2 block as `R4C2\tR4C3\nR5C2\tR5C3`; parsing that
        // back must yield the original grid.
        expect(raw(unquote("R4C2\tR4C3\nR5C2\tR5C3"))).toEqual([
            ["R4C2", "R4C3"],
            ["R5C2", "R5C3"],
        ]);
    });

    it("emits a trailing empty row for input ending in a newline", () => {
        // Ported behaviour, matching source's `unquote`: the tokenizer pushes `current`
        // unconditionally at the end, so a trailing newline yields a final empty row. Callers are
        // expected to tolerate it (`GridHostController.onPaste` clamps to the target region).
        expect(raw(unquote("a\n"))).toEqual([["a"], []]);
    });
});

describe("getCopyBufferContents", () => {
    it("produces tab/newline-separated plain text for a 2x2 block", () => {
        const { textPlain } = getCopyBufferContents(
            [
                [textCell("a"), textCell("b")],
                [textCell("c"), textCell("d")],
            ],
            [0, 1]
        );
        expect(textPlain).toBe("a\tb\nc\td");
    });

    it("quotes a value containing a tab so the plain-text form stays parseable", () => {
        const { textPlain } = getCopyBufferContents([[textCell("a\tb"), textCell("c")]], [0]);
        expect(raw(unquote(textPlain))).toEqual([["a\tb", "c"]]);
    });

    it("emits a well-formed HTML table alongside the plain text", () => {
        const { textHtml } = getCopyBufferContents([[textCell("a"), textCell("b")]], [0]);
        expect(textHtml).toContain("<table");
        expect(textHtml).toContain("</table>");
        expect(textHtml).toContain("<td");
    });

    it("renders a number cell's value, and an undefined number as empty", () => {
        const { textPlain } = getCopyBufferContents([[numberCell(42), numberCell(undefined)]], [0]);
        expect(textPlain).toBe("42\t");
    });
});
