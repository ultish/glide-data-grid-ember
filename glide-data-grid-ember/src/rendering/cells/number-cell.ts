// Ported from `packages/core/src/cells/number-cell.tsx` (Phase 4a). Drawing reuses the already-
// ported `drawTextCell`/`prepTextCell` and `drawEditHoverIndicator` verbatim.
//
// **Editor deviates from source**: source's editor is `NumberOverlayEditor`, built on the
// `react-number-format` package (live thousand-separator formatting, `fixedDecimals`,
// `allowNegative`, locale decimal separators). Per PORTING-NOTES.md's Phase 4a research, this
// port instead reuses the same plain-DOM `GrowingEntry` the text/row-id editors use, with basic
// `Number.parseFloat` coercion on every keystroke -- YAGNI per this project's norms (no
// react-number-format dependency for Phase 4a; `fixedDecimals`/`allowNegative`/
// `thousandSeparator`/`decimalSeparator` on `NumberCell` are accepted by the type but not yet
// consumed by this editor). Revisit if a later phase needs real formatted-number editing UX.
import { GridCellKind, type NumberCell } from "../data-grid-types.ts";
import type { InternalCellRenderer } from "../cell-types.ts";
import { drawTextCell, prepTextCell } from "../render/data-grid-lib.ts";
import { drawEditHoverIndicator } from "../render/draw-edit-hover-indicator.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export const numberCellRenderer: InternalCellRenderer<NumberCell> = {
    getAccessibilityString: c => c.data?.toString() ?? "",
    kind: GridCellKind.Number,
    needsHover: cell => cell.hoverEffect === true,
    needsHoverPosition: false,
    useLabel: true,
    drawPrep: prepTextCell,
    draw: a => {
        const { hoverAmount, cell, ctx, theme, rect, overrideCursor } = a;
        const { hoverEffect, displayData, hoverEffectTheme } = cell;

        if (hoverEffect === true && hoverAmount > 0) {
            drawEditHoverIndicator(ctx, theme, hoverEffectTheme, displayData, rect, hoverAmount, overrideCursor);
        }
        drawTextCell(a, a.cell.displayData, a.cell.contentAlign);
    },
    measure: (ctx, cell, theme) => ctx.measureText(cell.displayData).width + theme.cellHorizontalPadding * 2,
    // Deviation from source (`onDelete: c => ({...c, data: undefined})`, `displayData` left stale)
    // -- same reasoning as `text-cell.ts`'s `onDelete`, see its comment.
    onDelete: c => ({ ...c, data: undefined, displayData: "" }),
    provideEditor: () => p => {
        const entry = new GrowingEntry({
            value: p.value.displayData,
            theme: p.theme,
            highlight: p.isHighlighted,
            readOnly: p.value.readonly === true,
            validatedSelection: p.validatedSelection,
            onChange: value => {
                const trimmed = value.trim();
                const n = trimmed === "" ? Number.NaN : Number.parseFloat(trimmed);
                p.onChange({
                    ...p.value,
                    data: Number.isNaN(n) ? undefined : n,
                    displayData: value,
                });
            },
        });
        return {
            element: entry.element,
            focus: () => entry.focus(),
            destroy: () => entry.destroy(),
        };
    },
    onPaste: (toPaste, cell, details) => {
        const newNumber =
            typeof details.rawValue === "number"
                ? details.rawValue
                : Number.parseFloat(typeof details.rawValue === "string" ? details.rawValue : toPaste);
        if (Number.isNaN(newNumber) || cell.data === newNumber) return undefined;
        return { ...cell, data: newNumber, displayData: details.formattedString ?? cell.displayData };
    },
};
