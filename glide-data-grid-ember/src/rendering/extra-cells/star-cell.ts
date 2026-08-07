// Ported from `packages/cells/src/cells/star-cell.tsx` (Phase 5a of the Ember port).
//
// `draw()` is ported near-verbatim (star polygon path math, hover-fade alpha). Source's editor is
// a small React overlay (`EditorWrap`, five clickable star `<svg>`s) that requires activating the
// cell first (second click / Enter) before any star can be clicked. Per this port's established
// convention (`cells/boolean-cell.ts`'s click-toggle pattern, see its own header comment), this is
// simplified to a **single-click-to-rate** interaction instead: `onClick` computes which star the
// click landed under from `posX` (cell-relative, matches `boolean-cell.ts`'s `isOverEditableRegion`
// coordinate convention) using the exact same layout math `draw()` uses to position the stars, and
// sets the rating directly -- no overlay, no second click required, which is a friendlier UX for a
// rating control anyway. `allowOverlay: false` on demo data for this cell kind (mirrors
// `BooleanCell`'s static `false`) since there is no overlay to open.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";

export interface StarCellProps {
    readonly kind: "star-cell";
    readonly rating: number;
}

export type StarCell = CustomCell<StarCellProps>;

function isStarCell(cell: CustomCell): cell is StarCell {
    return (cell.data as { kind?: unknown }).kind === "star-cell";
}

const starPoints: readonly (readonly [number, number])[] = [
    [50, 5],
    [61.23, 39.55],
    [97.55, 39.55],
    [68.16, 60.9],
    [79.39, 95.45],
    [50, 74.1],
    [20.61, 95.45],
    [31.84, 60.9],
    [2.45, 39.55],
    [38.77, 39.55],
];

function pathStar(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, size: number) {
    let moved = false;
    for (const p of starPoints) {
        const x = (p[0] - 50) * (size / 100) + centerX;
        const y = (p[1] - 50) * (size / 100) + centerY;

        if (moved) {
            ctx.lineTo(x, y);
        } else {
            ctx.moveTo(x, y);
            moved = true;
        }
    }

    ctx.closePath();
}

/** Layout constants shared between `draw()` and the `onClick` hit-test below -- keep in sync. */
const STAR_START_OFFSET = 8;
const STAR_SPACING = 18;
const STAR_SIZE = 16;
const MAX_STARS = 5;

export const starCellRenderer: CustomRenderer<StarCell> = {
    kind: GridCellKind.Custom,
    isMatch: isStarCell,
    needsHover: true,
    draw: (args, cell) => {
        const { ctx, theme, rect, hoverAmount } = args;
        const { rating } = cell.data;
        const padX = theme.cellHorizontalPadding;
        let drawX = rect.x + padX + STAR_START_OFFSET;
        const stars = Math.min(MAX_STARS, Math.ceil(rating));
        ctx.beginPath();
        for (let i = 0; i < stars; i++) {
            pathStar(ctx, drawX, rect.y + rect.height / 2, STAR_SIZE);
            drawX += STAR_SPACING;
        }
        ctx.fillStyle = theme.textDark;
        ctx.globalAlpha = 0.6 + 0.4 * hoverAmount;
        ctx.fill();
        ctx.globalAlpha = 1;
    },
    onClick: e => {
        const { cell, posX, theme } = e;
        const padX = theme.cellHorizontalPadding;
        const relX = posX - padX - STAR_START_OFFSET + STAR_SIZE / 2;
        if (relX < 0) return undefined;
        const index = Math.floor(relX / STAR_SPACING);
        const newRating = Math.min(MAX_STARS, Math.max(1, index + 1));
        if (newRating === cell.data.rating) return undefined;
        return {
            ...cell,
            data: { ...cell.data, rating: newRating },
        };
    },
    onPaste: (val, data) => {
        const num = Number.parseInt(val, 10);
        return {
            ...data,
            rating: Number.isNaN(num) ? 0 : num,
        };
    },
};
