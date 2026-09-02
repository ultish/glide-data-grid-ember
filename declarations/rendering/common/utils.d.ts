/**
 * The input provided to a sprite function.
 *
 * @category Columns
 */
export interface SpriteProps {
    fgColor: string;
    bgColor: string;
}
export declare const getSquareBB: (posX: number, posY: number, squareSideLength: number) => {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};
export declare const getSquareXPosFromAlign: (alignment: "left" | "center" | "right", containerX: number, containerWidth: number, horizontalPadding: number, squareWidth: number) => number;
export declare const getSquareWidth: (maxSize: number, containerHeight: number, verticalPadding: number) => number;
type BoundingBox = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};
export declare const pointIsWithinBB: (x: number, y: number, bb: BoundingBox) => boolean;
export declare function direction(value: string): "rtl" | "not-rtl";
export declare function makeAccessibilityStringForArray(arr: readonly string[]): string;
export {};
//# sourceMappingURL=utils.d.ts.map