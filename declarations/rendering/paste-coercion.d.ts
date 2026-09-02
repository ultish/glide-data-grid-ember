import type { GridCell } from "./data-grid-types.ts";
import type { GetCellRendererCallback } from "./cell-types.ts";
import type { CellBuffer } from "./copy-paste.ts";
/**
 * Consumer override for paste coercion. Mirrors source's `coercePasteValue` prop.
 *
 * `val` is the pasted text (a multi-value clipboard entry is joined first), `cell` is the cell being
 * pasted *into*. Return a replacement `GridCell` to take over, or `undefined` to fall through to the
 * built-in per-kind rules below. **Returning a cell of a different `kind` than `cell` is not
 * supported** -- source warns about it in development and this port simply ignores such a result,
 * since the grid's whole layout assumes a column's cells keep their kind.
 */
export type CoercePasteValueCallback = (val: string, cell: GridCell) => GridCell | undefined;
/** Flattens a `CellBuffer` entry to the single string every coercion rule below works from. */
export declare function pasteBufferToString(buf: CellBuffer): string;
/**
 * Coerces a parsed paste-buffer entry into a replacement `GridCell` matching `existing`'s kind, or
 * `undefined` when the value cannot be represented in that kind (the paste for that cell is then
 * skipped, not written as garbage).
 *
 * Order matters and matches source (`data-editor.tsx:3596`): the consumer's `coercePasteValue` is
 * consulted **first** and wins outright when it returns an editable cell of the same kind; only then
 * do the built-in rules run. Those are the inverse of `copy-paste.ts`'s `convertCellToBuffer` for
 * the same kinds, plus a dispatch to each `CustomRenderer`'s own `onPaste`, which is source's
 * mechanism for the `packages/cells` types.
 *
 * Callers are expected to have checked `isReadWriteCell(existing)` already -- the `default` branch
 * is unreachable for the kinds that fails on, and returns `undefined` rather than asserting so a
 * new upstream `GridCell` kind cannot crash a paste.
 */
export declare function coercePasteCell(existing: GridCell, buf: CellBuffer, getCellRenderer: GetCellRendererCallback, coercePasteValue?: CoercePasteValueCallback): GridCell | undefined;
//# sourceMappingURL=paste-coercion.d.ts.map