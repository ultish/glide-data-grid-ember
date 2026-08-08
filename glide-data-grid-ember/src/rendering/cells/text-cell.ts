// Ported from `packages/core/src/cells/text-cell.tsx` (Phase 4a). Drawing reuses the already-
// ported `drawTextCell`/`prepTextCell` (`render/data-grid-lib.ts`) and `drawEditHoverIndicator`
// (`render/draw-edit-hover-indicator.ts`) primitives verbatim, same as every other Phase 1 render
// port. The editor uses the plain-DOM `GrowingEntry` (`src/-private/growing-entry.ts`) instead of
// source's React `<GrowingEntry>` component -- see that file's header comment and
// PORTING-NOTES.md's Phase 4a section for why.
import { GridCellKind, type TextCell } from "../data-grid-types.ts";
import type { InternalCellRenderer } from "../cell-types.ts";
import { drawTextCell, prepTextCell } from "../render/data-grid-lib.ts";
import { drawEditHoverIndicator } from "../render/draw-edit-hover-indicator.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export const textCellRenderer: InternalCellRenderer<TextCell> = {
    getAccessibilityString: c => c.data?.toString() ?? "",
    kind: GridCellKind.Text,
    needsHover: textCell => textCell.hoverEffect === true,
    needsHoverPosition: false,
    drawPrep: prepTextCell,
    useLabel: true,
    draw: a => {
        const { cell, hoverAmount, hyperWrapping, ctx, rect, theme, overrideCursor } = a;
        const { displayData, contentAlign, hoverEffect, allowWrapping, hoverEffectTheme } = cell;
        if (hoverEffect === true && hoverAmount > 0) {
            drawEditHoverIndicator(ctx, theme, hoverEffectTheme, displayData, rect, hoverAmount, overrideCursor);
        }
        drawTextCell(a, displayData, contentAlign, allowWrapping, hyperWrapping);
    },
    measure: (ctx, cell, t) => {
        const lines = cell.displayData.split("\n", cell.allowWrapping === true ? undefined : 1);
        let maxLineWidth = 0;
        for (const line of lines) {
            maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
        }
        return maxLineWidth + 2 * t.cellHorizontalPadding;
    },
    // Deviation from source (`onDelete: c => ({...c, data: ""})`, `displayData` left stale): this
    // port has no separate "re-derive displayData from data" step anywhere downstream of an edit
    // (a consumer's `onCellsEdited` handler typically stores the returned cell object verbatim, see
    // the test-app demo), so leaving `displayData` untouched would visibly show the old text after
    // a Delete/Backspace clear. Clearing both fields together is what a consumer would actually
    // want here; noted as an intentional, low-risk improvement over the source's literal behavior.
    onDelete: c => ({ ...c, data: "", displayData: "" }),
    provideEditor: cell => ({
        disablePadding: cell.allowWrapping === true,
        editor: p => {
            const entry = new GrowingEntry({
                value: p.value.data,
                theme: p.theme,
                highlight: p.isHighlighted,
                disabled: p.value.readonly === true,
                wrapping: cell.allowWrapping === true,
                altNewline: true,
                validatedSelection: p.validatedSelection,
                onChange: value => p.onChange({ ...p.value, data: value, displayData: value }),
            });
            return {
                element: entry.element,
                focus: () => entry.focus(),
                destroy: () => entry.destroy(),
            };
        },
    }),
    onPaste: (toPaste, cell, details) =>
        toPaste === cell.data
            ? undefined
            : { ...cell, data: toPaste, displayData: details.formattedString ?? cell.displayData },
};
