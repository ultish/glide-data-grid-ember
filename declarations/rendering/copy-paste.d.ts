import { BooleanEmpty, BooleanIndeterminate, type GridCell, type Item } from "./data-grid-types.ts";
/** @category Copy/Paste */
export type StringArrayCellBuffer = {
    formatted: string[];
    rawValue: string[];
    format: "string-array";
    doNotEscape?: boolean;
};
/** @category Copy/Paste */
export type BasicCellBuffer = {
    formatted: string;
    rawValue: string | number | boolean | BooleanEmpty | BooleanIndeterminate;
    format: "string" | "number" | "boolean" | "url";
    doNotEscape?: boolean;
};
/** @category Copy/Paste */
export type CellBuffer = StringArrayCellBuffer | BasicCellBuffer;
/** @category Copy/Paste */
export type CopyBuffer = CellBuffer[][];
/** @category Copy/Paste */
export declare function getCopyBufferContents(cells: readonly (readonly GridCell[])[], columnIndexes: readonly number[]): {
    readonly textPlain: string;
    readonly textHtml: string;
};
/**
 * The header row source prepends to the copy buffer when `copyHeaders` is on
 * (`data-editor.tsx:3787-3796`) -- one non-overlay `Text` cell per copied column, carrying the
 * column's `title`.
 *
 * `columnIndexes` is in the **consumer's** column space (no row-marker column), the same space
 * `getCopyBufferContents` takes and the same space `columns` is indexed in. A column index with no
 * matching column yields an empty title rather than throwing: the copied region is clamped
 * elsewhere, and a missing header is a strictly better failure than a lost copy.
 *
 * @category Copy/Paste
 */
export declare function copyHeaderRow(columns: readonly {
    readonly title: string;
}[], columnIndexes: readonly number[]): GridCell[];
/** @category Copy/Paste */
export declare function decodeHTML(html: string): CopyBuffer | undefined;
/** @category Copy/Paste */
export declare function unquote(str: string): CopyBuffer;
/**
 * A consumer's `@onPaste`. `target` is in the consumer's own column space (row-marker column already
 * subtracted) and `values` is the clipboard as raw strings, *unclipped* — rows and columns past the
 * end of the grid are still reported, exactly as source does, so a consumer can decline a paste that
 * would not fit. Return `true` to let it through; anything else cancels it.
 */
export type PasteVetoCallback = (target: Item, values: readonly (readonly string[])[]) => boolean;
/** `@onPaste`'s accepted shapes. See {@link shouldAcceptPaste} for what each one means. */
export type PasteBehavior = boolean | PasteVetoCallback;
/**
 * Decides whether a decoded clipboard buffer may be written, and is the whole of `@onPaste`'s
 * semantics. Source's guard is `onPaste === false || (typeof onPaste === "function" &&
 * onPaste(...) !== true)` (`data-editor.tsx:3714-3722`) — note `!== true`, not `=== false`: a
 * callback that forgets to return anything cancels the paste rather than allowing it, and that is
 * deliberate upstream.
 *
 * **Divergence, and it is in the `undefined` case only.** Source treats an absent `onPaste` as
 * "paste the raw clipboard text into the single target cell, no splitting" (`:3699-3707`). This port
 * treats it as `true` — split on tabs/newlines and write the range — because that is what it has
 * always done and what every demo and the cookbook describe. `false` and the callback form match
 * source exactly.
 */
export declare function shouldAcceptPaste(onPaste: PasteBehavior | undefined, target: Item, buffer: CopyBuffer): boolean;
//# sourceMappingURL=copy-paste.d.ts.map