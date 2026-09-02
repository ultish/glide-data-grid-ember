import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
type PackedColor = string | readonly [normal: string, hover: string];
export interface ButtonCellProps {
    readonly kind: "button-cell";
    readonly title: string;
    readonly onClick?: () => void;
    readonly backgroundColor?: PackedColor;
    readonly color?: PackedColor;
    readonly borderColor?: PackedColor;
    readonly borderRadius?: number;
}
export type ButtonCell = CustomCell<ButtonCellProps> & {
    readonly: true;
};
export declare const buttonCellRenderer: CustomRenderer<ButtonCell>;
export {};
//# sourceMappingURL=button-cell.d.ts.map