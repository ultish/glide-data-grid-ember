import type { Theme } from "./theme.ts";
import type { SpriteProps } from "./common/utils.ts";
import { type HeaderIconMap } from "./sprites.ts";
/**
 * A known icon identifier
 *
 * @category Columns
 */
export type HeaderIcon = keyof HeaderIconMap;
/**
 * A method that produces an SVG array from
 * an SVG icon configuration.
 *
 * @category Columns
 */
export type Sprite = (props: SpriteProps) => string;
/**
 * A method that maps from icon names to functions
 * that return SVG strings.
 *
 * @category Columns
 */
export type SpriteMap = Record<string, Sprite>;
/** @category Columns */
export type SpriteVariant = "normal" | "selected" | "special";
/** @category Columns */
export declare class SpriteManager {
    private onSettled;
    private spriteMap;
    private headerIcons;
    private inFlight;
    constructor(headerIcons: SpriteMap | undefined, onSettled: () => void);
    drawSprite(sprite: string, variant: SpriteVariant, ctx: CanvasRenderingContext2D, x: number, y: number, size: number, theme: Theme, alpha?: number): void;
}
//# sourceMappingURL=data-grid-sprites.d.ts.map