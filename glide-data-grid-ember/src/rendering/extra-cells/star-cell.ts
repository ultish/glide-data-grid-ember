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
//
// **2026-08-09: the hover preview.** That simplification traded source's DOM affordances (cursor,
// `:hover`, `.gdg-active` colouring on real `<svg>` stars) for a bare canvas click with no feedback
// at all -- you could not tell what a click would set until you had already set it. `draw` now
// renders the *prospective* rating faintly under the cursor, computed by `starRatingForPosX`, the
// same function `onClick` uses. Source has no equivalent because it does not need one.
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
/** Opacity of the "this is what a click would do" stars. Low enough to read as a preview. */
const PREVIEW_ALPHA = 0.25;

/**
 * The rating a click/hover at cell-relative `posX` resolves to, or `undefined` when the pointer is
 * left of the first star. Used by BOTH `onClick` and `draw`'s hover preview, deliberately: the
 * preview is only trustworthy if it is computed by the exact code the click uses.
 *
 * Note the whole area right of the fifth star resolves to 5 (`Math.min`) rather than to
 * `undefined` -- that is pre-existing click behaviour, kept, and the preview now makes it visible
 * instead of surprising.
 */
export function starRatingForPosX(posX: number, cellHorizontalPadding: number): number | undefined {
    const relX = posX - cellHorizontalPadding - STAR_START_OFFSET + STAR_SIZE / 2;
    if (relX < 0) return undefined;
    const index = Math.floor(relX / STAR_SPACING);
    return Math.min(MAX_STARS, Math.max(1, index + 1));
}

export const starCellRenderer: CustomRenderer<StarCell> = {
    kind: GridCellKind.Custom,
    isMatch: isStarCell,
    needsHover: true,
    // **Deliberate divergence from source, and the reason for it.** Source's star cell has no
    // hover position and no preview: rating there happens in an *overlay editor* of real DOM stars,
    // which get their affordance from the browser (cursor, `:hover`, `.gdg-active` colouring). This
    // port replaced that editor with a single click on the canvas (see the header comment), and a
    // canvas click has no affordance at all -- there was no way to tell what a click would set
    // until after it was set. The preview below is what puts that affordance back; it is a
    // consequence of the click-to-rate simplification, not a gap against source.
    needsHoverPosition: true,
    draw: (args, cell) => {
        const { ctx, theme, rect, hoverAmount, hoverX } = args;
        const { rating } = cell.data;
        const padX = theme.cellHorizontalPadding;
        const midY = rect.y + rect.height / 2;
        const filled = Math.min(MAX_STARS, Math.ceil(rating));

        // The rating a click right now would produce. `undefined` when not hovering the cell at all
        // (`hoverX` is only supplied while hovered) or when the pointer is left of the first star.
        const prospective = hoverX === undefined ? undefined : starRatingForPosX(hoverX, padX);
        // Stars up to the *smaller* of the two are solid either way; the ones between the two are
        // the difference the click would make, drawn faint. With no hover the two are equal and
        // this collapses to exactly the previous behaviour.
        const solid = prospective === undefined ? filled : Math.min(filled, prospective);
        const previewTo = prospective === undefined ? filled : Math.max(filled, prospective);

        const starX = (i: number): number => rect.x + padX + STAR_START_OFFSET + i * STAR_SPACING;

        ctx.fillStyle = theme.textDark;
        const baseAlpha = 0.6 + 0.4 * hoverAmount;

        if (solid > 0) {
            ctx.beginPath();
            for (let i = 0; i < solid; i++) pathStar(ctx, starX(i), midY, STAR_SIZE);
            ctx.globalAlpha = baseAlpha;
            ctx.fill();
        }

        if (previewTo > solid) {
            ctx.beginPath();
            for (let i = solid; i < previewTo; i++) pathStar(ctx, starX(i), midY, STAR_SIZE);
            ctx.globalAlpha = PREVIEW_ALPHA;
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        // Same affordance `tree-view-cell` uses for its disclosure triangle: the cursor is the only
        // hint a canvas cell can give that the pointer is over something clickable.
        if (prospective !== undefined) args.overrideCursor?.("pointer");
    },
    onClick: e => {
        const { cell, posX, theme } = e;
        const newRating = starRatingForPosX(posX, theme.cellHorizontalPadding);
        if (newRating === undefined || newRating === cell.data.rating) return undefined;
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
