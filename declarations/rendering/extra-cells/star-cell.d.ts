import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface StarCellProps {
    readonly kind: "star-cell";
    readonly rating: number;
}
export type StarCell = CustomCell<StarCellProps>;
/**
 * The rating a click/hover at cell-relative `posX` resolves to, or `undefined` when the pointer is
 * left of the first star. Used by BOTH `onClick` and `draw`'s hover preview, deliberately: the
 * preview is only trustworthy if it is computed by the exact code the click uses.
 *
 * Note the whole area right of the fifth star resolves to 5 (`Math.min`) rather than to
 * `undefined` -- that is pre-existing click behaviour, kept, and the preview now makes it visible
 * instead of surprising.
 */
export declare function starRatingForPosX(posX: number, cellHorizontalPadding: number): number | undefined;
export declare const starCellRenderer: CustomRenderer<StarCell>;
//# sourceMappingURL=star-cell.d.ts.map