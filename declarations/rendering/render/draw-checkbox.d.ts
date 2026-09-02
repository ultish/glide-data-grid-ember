import type { Theme } from "../theme.ts";
import { BooleanEmpty, BooleanIndeterminate, type BaseGridCell } from "../data-grid-types.ts";
export declare function drawCheckbox(ctx: CanvasRenderingContext2D, theme: Theme, checked: boolean | BooleanEmpty | BooleanIndeterminate, x: number, y: number, width: number, height: number, highlighted: boolean, hoverX?: number, hoverY?: number, maxSize?: number | undefined, alignment?: BaseGridCell["contentAlign"], style?: "circle" | "square"): void;
//# sourceMappingURL=draw-checkbox.d.ts.map