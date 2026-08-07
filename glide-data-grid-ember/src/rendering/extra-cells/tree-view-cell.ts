// Ported from `packages/cells/src/cells/tree-view-cell.tsx` (Phase 5c of the Ember port). This is
// the most structurally novel of Phase 5c's cells -- see PORTING-NOTES.md's Phase 5c section for
// the state-storage note below, future phases/consumers need to read it before building anything
// on top of tree views.
//
// **Expand/collapse state storage, confirmed by reading source closely**: there is NO separate
// per-row UI state store anywhere in source's own architecture either -- `isOpen`/`canOpen`/`depth`
// all live directly on the cell's own `data` (`TreeViewCellProps`), i.e. in whatever the *consumer*
// returns from `getCellContent` for that `[col, row]`. Expand/collapse is driven entirely by
// `onClickOpener: (cell: TreeViewCell) => TreeViewCell | undefined`, also carried on `data` --
// clicking the disclosure triangle calls it, and the renderer's `onClick` hook returns whatever
// `TreeViewCell` it hands back (or `undefined` for "no-op"). `GridHostController.
// dispatchCellMouseDown` already commits any non-undefined cell an `onClick` hook returns via
// `commitCellEdit` -> `args.onCellsEdited?.(...)` (Phase 4a plumbing, unchanged for Phase 5) -- so
// the *actual* row-visibility bookkeeping (which rows are currently shown/hidden as a result of
// collapsing a parent) is entirely a consumer concern, exactly as it is in source: the demo's
// `onClickOpener` in `test-app/app/utils/demo-data.ts` mutates the backing row-depth/isOpen data
// and the consumer's `getCellContent`/row-count logic is expected to react (filter hidden rows,
// etc.) -- this port does not add any grid-level "tree" feature (no automatic row hide/show), same
// as source does not either at the `packages/cells` layer.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias } from "../render/data-grid-lib.ts";
import type { FullTheme } from "../theme.ts";

export interface TreeViewCellProps {
    readonly kind: "tree-view-cell";
    readonly text: string;
    readonly isOpen: boolean;
    readonly canOpen: boolean;
    readonly depth: number;
    readonly onClickOpener?: (cell: TreeViewCell) => TreeViewCell | undefined;
}

export type TreeViewCell = CustomCell<TreeViewCellProps> & { readonly: true };

function isTreeViewCell(cell: CustomCell): cell is TreeViewCell {
    return (cell.data as { kind?: unknown }).kind === "tree-view-cell";
}

const depthShift = 16;

function isOverIcon(posX: number, posY: number, inset: number, theme: FullTheme, h: number): boolean {
    return (
        posX >= inset + theme.cellHorizontalPadding - 4 &&
        posX <= inset + theme.cellHorizontalPadding + 18 &&
        posY >= h / 2 - 9 &&
        posY <= h / 2 + 9
    );
}

export const treeViewCellRenderer: CustomRenderer<TreeViewCell> = {
    kind: GridCellKind.Custom,
    isMatch: isTreeViewCell,
    needsHover: true,
    needsHoverPosition: true,
    onClick: args => {
        const { theme, bounds, posX, posY, cell } = args;
        const { height: h } = bounds;
        const { canOpen, depth, onClickOpener } = cell.data;

        if (!canOpen || onClickOpener === undefined) return undefined;

        const overIcon = isOverIcon(posX, posY, depth * depthShift, theme, h);
        return overIcon ? onClickOpener(cell) : undefined;
    },
    measure: (ctx, cell, theme) => {
        const { text, depth } = cell.data;
        // +2 to the depth gives it a bit more space -- otherwise it looks cramped (matches source).
        return ctx.measureText(text).width + theme.cellHorizontalPadding * 2 + (depth + 2) * depthShift;
    },
    draw: (args, cell) => {
        const { ctx, theme, rect, hoverX = 0, hoverY = 0 } = args;
        const { x, y, height: h } = rect;
        const { canOpen, depth, text, isOpen } = cell.data;

        const bias = getMiddleCenterBias(ctx, theme);

        const inset = depth * depthShift;
        const midLine = y + h / 2;

        if (canOpen) {
            const overIcon = isOverIcon(hoverX, hoverY, inset, theme, h);

            ctx.beginPath();
            if (isOpen) {
                ctx.moveTo(inset + x + theme.cellHorizontalPadding, midLine - 2.5);
                ctx.lineTo(inset + x + theme.cellHorizontalPadding + 5, midLine + 2.5);
                ctx.lineTo(inset + x + theme.cellHorizontalPadding + 10, midLine - 2.5);
            } else {
                ctx.moveTo(inset + x + theme.cellHorizontalPadding + 2.5, midLine - 5);
                ctx.lineTo(inset + x + theme.cellHorizontalPadding + 2.5 + 5, midLine);
                ctx.lineTo(inset + x + theme.cellHorizontalPadding + 2.5, midLine + 5);
            }

            ctx.strokeStyle = overIcon ? theme.textMedium : theme.textLight;
            ctx.lineWidth = 2;
            ctx.stroke();

            if (overIcon) args.overrideCursor?.("pointer");
        }

        ctx.fillStyle = theme.textDark;
        ctx.fillText(text, 16 + x + inset + theme.cellHorizontalPadding + 0.5, y + h / 2 + bias);
    },
    provideEditor: undefined,
};
