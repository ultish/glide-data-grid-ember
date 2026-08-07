// Ported from `packages/cells/src/cells/user-profile-cell.tsx` (Phase 5c of the Ember port).
//
// Mostly draw-only, as expected: a tinted initial-letter circle, an avatar image on top of it (via
// the already-ported `ImageWindowLoader`, `imageLoader.loadOrGetImage(image, col, row)` -- same
// primitive `image-cell.ts` uses from Phase 4d), and an optional name label. Source DOES give it a
// (small) editor -- a single-line `TextCellEntry` for editing just the `name` field, not the
// avatar/initial/tint -- so it isn't fully display-only; ported here as a plain `GrowingEntry`
// (this port's disabled/enabled single-line text editor primitive, same one `text-cell.ts`/
// `date-picker-cell.ts`'s readonly case use) in place of source's `TextCellEntry`.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias, measureTextCached } from "../render/data-grid-lib.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export interface UserProfileCellProps {
    readonly kind: "user-profile-cell";
    readonly image: string;
    readonly initial: string;
    readonly tint: string;
    readonly name?: string;
}

export type UserProfileCell = CustomCell<UserProfileCellProps>;

function isUserProfileCell(cell: CustomCell): cell is UserProfileCell {
    return (cell.data as { kind?: unknown }).kind === "user-profile-cell";
}

function buildUserProfileEditor(p: CellEditorProps<UserProfileCell>): CellEditorHandle {
    const entry = new GrowingEntry({
        value: p.value.data.name ?? "",
        theme: p.theme,
        highlight: p.isHighlighted,
        disabled: p.value.readonly === true,
        validatedSelection: p.validatedSelection,
        onChange: value => p.onChange({ ...p.value, data: { ...p.value.data, name: value } }),
    });
    return { element: entry.element, focus: () => entry.focus(), destroy: () => entry.destroy() };
}

export const userProfileCellRenderer: CustomRenderer<UserProfileCell> = {
    kind: GridCellKind.Custom,
    isMatch: isUserProfileCell,
    draw: (args, cell) => {
        const { ctx, rect, theme, imageLoader, col, row } = args;
        const { image, name, initial, tint } = cell.data;

        const xPad = theme.cellHorizontalPadding;
        const radius = Math.min(12, rect.height / 2 - theme.cellVerticalPadding);
        const drawX = rect.x + xPad;

        const imageResult = imageLoader.loadOrGetImage(image, col, row);

        ctx.save();
        ctx.beginPath();
        ctx.arc(drawX + radius, rect.y + rect.height / 2, radius, 0, Math.PI * 2);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = tint;
        ctx.fill();
        ctx.globalAlpha = 1;

        const initialFont = `600 16px ${theme.fontFamily}`;
        ctx.font = initialFont;
        const metrics = measureTextCached(initial[0] ?? "", ctx);
        ctx.fillStyle = theme.textDark;
        ctx.fillText(
            initial[0] ?? "",
            drawX + radius - metrics.width / 2,
            rect.y + rect.height / 2 + getMiddleCenterBias(ctx, initialFont)
        );

        if (imageResult !== undefined) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(drawX + radius, rect.y + rect.height / 2, radius, 0, Math.PI * 2);
            ctx.clip();

            ctx.drawImage(imageResult, drawX, rect.y + rect.height / 2 - radius, radius * 2, radius * 2);

            ctx.restore();
        }

        if (name !== undefined) {
            ctx.font = theme.baseFontFull;
            ctx.fillStyle = theme.textDark;
            ctx.fillText(name, drawX + radius * 2 + xPad, rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme));
        }

        ctx.restore();
    },
    provideEditor: () => ({ editor: buildUserProfileEditor }),
    onPaste: (v, d) => ({ ...d, name: v }),
};
