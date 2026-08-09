// Turning one parsed clipboard entry into a replacement `GridCell` -- the paste half of
// `copy-paste.ts`'s round trip, and the hook point for source's `coercePasteValue` prop.
//
// WHY THIS IS ITS OWN MODULE. This was a private method on `GridHostController`
// (`pasteValueIntoCell`) until Phase 9g. It reads nothing from the controller except
// `getCellRenderer`, and it is the kind of per-kind branching that is cheap to get subtly wrong and
// expensive to notice -- the `GridCellKind.Custom` branch silently made paste a no-op for every
// `packages/cells` cell type for three phases (see PORTING-NOTES.md's Phase 5c note). The controller
// cannot be imported by the vitest suite (its constructor needs a real DOM and a real canvas), so
// moving this out is what lets the coercion rules have tests at all.
import { GridCellKind, BooleanEmpty, BooleanIndeterminate, isEditableGridCell } from "./data-grid-types.ts";
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
export function pasteBufferToString(buf: CellBuffer): string {
    return Array.isArray(buf.rawValue)
        ? buf.rawValue.join(", ")
        : (buf.rawValue?.toString() ?? buf.formatted.toString());
}

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
export function coercePasteCell(
    existing: GridCell,
    buf: CellBuffer,
    getCellRenderer: GetCellRendererCallback,
    coercePasteValue?: CoercePasteValueCallback
): GridCell | undefined {
    const raw = pasteBufferToString(buf);

    if (coercePasteValue !== undefined) {
        const coerced = coercePasteValue(raw, existing);
        // The kind check is this port's substitute for source's development-only
        // `console.warn("Coercion should not change cell kind.")`: a kind change is never valid, so
        // ignoring it is strictly safer than writing it and is silent in production either way.
        if (coerced !== undefined && isEditableGridCell(coerced) && coerced.kind === existing.kind) {
            return coerced;
        }
    }

    switch (existing.kind) {
        case GridCellKind.Text:
            return { ...existing, data: raw, displayData: raw };
        case GridCellKind.Number: {
            const trimmed = raw.trim();
            if (trimmed === "") return { ...existing, data: undefined, displayData: "" };
            const n = Number(trimmed);
            if (Number.isNaN(n)) return undefined;
            return { ...existing, data: n, displayData: raw };
        }
        case GridCellKind.Boolean: {
            const upper = raw.trim().toUpperCase();
            const data =
                upper === "TRUE"
                    ? true
                    : upper === "FALSE"
                      ? false
                      : upper === "INDETERMINATE"
                        ? BooleanIndeterminate
                        : BooleanEmpty;
            return { ...existing, data };
        }
        case GridCellKind.Uri:
            return { ...existing, data: raw };
        case GridCellKind.Markdown:
            return { ...existing, data: raw };
        case GridCellKind.Custom: {
            // Phase 5c fix: `isReadWriteCell` (checked by this function's callers) DOES include
            // `GridCellKind.Custom` (`readonly !== true`), so falling into `default` here silently
            // made paste into every `CustomRenderer` cell (Phase 5a/5b/5c's extra cells) a no-op.
            // Dispatches to the matching `CustomRenderer.onPaste`, source's own mechanism.
            const renderer = getCellRenderer(existing);
            if (renderer?.onPaste === undefined) return undefined;
            const newData = renderer.onPaste(raw, existing.data);
            if (newData === undefined) return undefined;
            return { ...existing, data: newData };
        }
        default:
            // Image/Bubble/Drilldown/RowID/Loading/Protected: not writable via `isReadWriteCell`
            // anyway, so `default` is unreachable for those kinds in practice.
            return undefined;
    }
}
