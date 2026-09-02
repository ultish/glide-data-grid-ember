import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface UserProfileCellProps {
    readonly kind: "user-profile-cell";
    readonly image: string;
    readonly initial: string;
    readonly tint: string;
    readonly name?: string;
}
export type UserProfileCell = CustomCell<UserProfileCellProps>;
export declare const userProfileCellRenderer: CustomRenderer<UserProfileCell>;
//# sourceMappingURL=user-profile-cell.d.ts.map