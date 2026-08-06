// Adapted from packages/core/src/common/utils.tsx for the Ember port.
//
// Phase 1 scope note: the source file mixes pure canvas/geometry helpers with React hooks
// (useEventListener, useDebouncedMemo, useStateWithReactiveInput, useDeepMemo) and two React
// components (EditPencil, Checkmark) that render pencil/checkmark icon SVGs for cell editors.
// Only the pure, non-React exports actually consumed by the ported render engine are kept here:
//   - SpriteProps (used by sprites.ts / data-grid-sprites.ts)
//   - getSquareBB, getSquareXPosFromAlign, getSquareWidth, pointIsWithinBB (used by draw-checkbox.ts)
//   - direction (used by data-grid-lib.ts and data-grid-render.header.ts)
// EditPencil/Checkmark and the hooks are not referenced anywhere in the render engine (they are
// only used by the cell overlay editors, which are out of scope until Phase 4), so they were not
// ported.

/**
 * The input provided to a sprite function.
 *
 * @category Columns
 */
export interface SpriteProps {
    fgColor: string;
    bgColor: string;
}

export const getSquareBB = (posX: number, posY: number, squareSideLength: number) => ({
    x1: posX - squareSideLength / 2,
    y1: posY - squareSideLength / 2,
    x2: posX + squareSideLength / 2,
    y2: posY + squareSideLength / 2,
});

export const getSquareXPosFromAlign = (
    alignment: "left" | "center" | "right",
    containerX: number,
    containerWidth: number,
    horizontalPadding: number,
    squareWidth: number
) => {
    switch (alignment) {
        case "left":
            return Math.floor(containerX) + horizontalPadding + squareWidth / 2;
        case "center":
            return Math.floor(containerX + containerWidth / 2);
        case "right":
            return Math.floor(containerX + containerWidth) - horizontalPadding - squareWidth / 2;
    }
};
export const getSquareWidth = (maxSize: number, containerHeight: number, verticalPadding: number) =>
    Math.min(maxSize, containerHeight - verticalPadding * 2);

type BoundingBox = { x1: number; y1: number; x2: number; y2: number };
export const pointIsWithinBB = (x: number, y: number, bb: BoundingBox) =>
    bb.x1 <= x && x <= bb.x2 && bb.y1 <= y && y <= bb.y2;

// Shamelessly inline direction to avoid conflicts with 1.0 and 2.0.
const rtlRange = "\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC";
const ltrRange =
    "A-Za-z\u00C0-\u00D6\u00D8-\u00F6" +
    "\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF\u200E\u2C00-\uFB1C" +
    "\uFE00-\uFE6F\uFEFD-\uFFFF";

/* eslint-disable no-misleading-character-class */
const rtl = new RegExp("^[^" + ltrRange + "]*[" + rtlRange + "]");
/* eslint-enable no-misleading-character-class */

export function direction(value: string): "rtl" | "not-rtl" {
    return rtl.test(value) ? "rtl" : "not-rtl";
}
