import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
type DropdownOption = string | {
    value: string;
    label: string;
} | undefined | null;
export interface DropdownCellProps {
    readonly kind: "dropdown-cell";
    readonly value: string | undefined | null;
    readonly allowedValues: readonly DropdownOption[];
}
export type DropdownCell = CustomCell<DropdownCellProps>;
export declare const dropdownCellRenderer: CustomRenderer<DropdownCell>;
export {};
//# sourceMappingURL=dropdown-cell.d.ts.map