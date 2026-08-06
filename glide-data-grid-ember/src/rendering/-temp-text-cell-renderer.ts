// TEMPORARY smoke-test cell renderer -- Phase 2b of the Ember port.
//
// The real cell-type system (`packages/core/src/cells/*.tsx` in the source repo: text-cell,
// number-cell, boolean-cell, image-cell, etc., plus their editors and the `provideEditor` overlay
// machinery) is out of scope until Phase 4. Until then, `GridHostController` still needs a real
// `GetCellRendererCallback` to draw anything at all, so this file provides the bare minimum: a
// text-cell-only renderer good enough to prove the render/scroll/virtualization pipeline actually
// paints readable content.
//
// DELETE THIS FILE (and its `getCellRenderer` export) once Phase 4 ports the real cell-type
// registry -- do not build on top of it, do not add more cell kinds here.
//
// Modeled on `packages/core/src/cells/text-cell.tsx`'s `textCellRenderer`, stripped of:
//   - `drawPrep`/hover-effect drawing (`drawEditHoverIndicator`) -- no hover styling
//   - `provideEditor` (`GrowingEntry` React overlay editor) -- editing is Phase 4
//   - `measure` (auto column width) -- column auto-sizing is out of scope (see
//     `DEFAULT_AUTO_COLUMN_WIDTH` in `grid-host-controller.ts`)
// It reuses the already-ported `drawTextCell` drawing primitive from
// `render/data-grid-lib.ts` (same function the real renderer will eventually call), so text
// layout/alignment/truncation/wrapping behavior matches the source faithfully even though the
// renderer wrapper itself is a stub.
import { GridCellKind, type TextCell, type InnerGridCell } from "./data-grid-types.ts";
import type { InternalCellRenderer, CellRenderer, GetCellRendererCallback } from "./cell-types.ts";
import { drawTextCell } from "./render/data-grid-lib.ts";

const tempTextCellRenderer: InternalCellRenderer<TextCell> = {
    kind: GridCellKind.Text,
    getAccessibilityString: cell => cell.data?.toString() ?? "",
    draw: args => {
        const { cell, ctx, rect, theme } = args;
        ctx.fillStyle = theme.textDark;
        drawTextCell(
            { ctx, rect, theme },
            cell.displayData,
            cell.contentAlign,
            cell.allowWrapping,
            args.hyperWrapping
        );
    },
    onPaste: (toPaste, cell) => (toPaste === cell.data ? undefined : { ...cell, data: toPaste, displayData: toPaste }),
};

/**
 * Minimal `GetCellRendererCallback` for smoke-testing: renders `GridCellKind.Text` cells via
 * `tempTextCellRenderer`, returns `undefined` for every other kind (drawn as an empty cell by the
 * render engine). Use as a `GridHostArgs.getCellRenderer` / `<GlideDataGrid @getCellRenderer>`
 * default until Phase 4's real cell-type registry exists.
 */
export const getCellRenderer: GetCellRendererCallback = <T extends InnerGridCell>(
    cell: T
): CellRenderer<T> | undefined => {
    if (cell.kind === GridCellKind.Text) {
        return tempTextCellRenderer as unknown as CellRenderer<T>;
    }
    return undefined;
};
