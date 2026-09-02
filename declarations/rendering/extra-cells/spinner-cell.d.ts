import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface SpinnerCellProps {
    readonly kind: "spinner-cell";
}
export type SpinnerCell = CustomCell<SpinnerCellProps>;
export declare const spinnerCellRenderer: CustomRenderer<SpinnerCell>;
//# sourceMappingURL=spinner-cell.d.ts.map