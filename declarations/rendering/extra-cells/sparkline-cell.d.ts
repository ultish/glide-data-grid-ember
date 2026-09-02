import { type CustomCell, type Item } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface SparklineCellProps {
    readonly kind: "sparkline-cell";
    readonly graphKind?: "line" | "bar" | "area";
    readonly values: readonly number[];
    readonly displayValues?: readonly string[];
    /** Reuses source's `Item` tuple type as a loose `[minY, maxY]` pair -- matches source exactly,
     * despite `Item` semantically meaning `[col, row]` everywhere else in this codebase. */
    readonly yAxis: Item;
    readonly color?: string;
    readonly hideAxis?: boolean;
}
export type SparklineCell = CustomCell<SparklineCellProps>;
export declare const sparklineCellRenderer: CustomRenderer<SparklineCell>;
//# sourceMappingURL=sparkline-cell.d.ts.map