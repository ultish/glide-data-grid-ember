import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export type SelectOption = {
    value: string;
    label?: string;
    color?: string;
};
export interface MultiSelectCellProps {
    readonly kind: "multi-select-cell";
    readonly values: string[] | undefined | null;
    readonly options?: readonly (SelectOption | string)[];
    readonly allowCreation?: boolean;
    readonly allowDuplicates?: boolean;
}
export type MultiSelectCell = CustomCell<MultiSelectCellProps>;
export declare const multiSelectCellRenderer: CustomRenderer<MultiSelectCell>;
//# sourceMappingURL=multi-select-cell.d.ts.map