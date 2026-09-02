import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface RangeCellProps {
    readonly kind: "range-cell";
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly label?: string;
    readonly measureLabel?: string;
    /** The color of the range, fallback to theme.accentColor. */
    readonly color?: string;
}
export type RangeCell = CustomCell<RangeCellProps>;
export declare const rangeCellRenderer: CustomRenderer<RangeCell>;
//# sourceMappingURL=range-cell.d.ts.map