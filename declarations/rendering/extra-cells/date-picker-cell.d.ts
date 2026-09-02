import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export type DateKind = "date" | "time" | "datetime-local";
export interface DatePickerCellProps {
    readonly kind: "date-picker-cell";
    readonly date: Date | undefined | null;
    readonly displayDate: string;
    readonly format: DateKind;
    readonly timezoneOffset?: number;
    readonly min?: string | Date;
    readonly max?: string | Date;
    readonly step?: string;
}
export type DatePickerCell = CustomCell<DatePickerCellProps>;
export declare function formatValueForHTMLInput(dateKind: DateKind, date: Date | undefined | null, timezoneOffsetMs?: number): string;
export declare const datePickerCellRenderer: CustomRenderer<DatePickerCell>;
//# sourceMappingURL=date-picker-cell.d.ts.map