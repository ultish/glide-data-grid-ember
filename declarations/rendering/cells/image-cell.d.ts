import { type BaseGridCell, type ImageCell } from "../data-grid-types.ts";
import type { BaseDrawArgs, InternalCellRenderer } from "../cell-types.ts";
export declare const imageCellRenderer: InternalCellRenderer<ImageCell>;
export declare function drawImage(args: BaseDrawArgs, data: readonly string[], rounding: number, contentAlign?: BaseGridCell["contentAlign"]): void;
//# sourceMappingURL=image-cell.d.ts.map