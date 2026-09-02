import { type BooleanCell, BooleanEmpty, BooleanIndeterminate } from "../data-grid-types.ts";
import type { InternalCellRenderer } from "../cell-types.ts";
/** Mirrors source's `data-editor-fns.ts#toggleBoolean` exactly. */
export declare function toggleBoolean(data: boolean | BooleanEmpty | BooleanIndeterminate): boolean | BooleanEmpty | BooleanIndeterminate;
export declare const booleanCellRenderer: InternalCellRenderer<BooleanCell>;
//# sourceMappingURL=boolean-cell.d.ts.map