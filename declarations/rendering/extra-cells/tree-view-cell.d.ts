import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface TreeViewCellProps {
    readonly kind: "tree-view-cell";
    readonly text: string;
    readonly isOpen: boolean;
    readonly canOpen: boolean;
    readonly depth: number;
    readonly onClickOpener?: (cell: TreeViewCell) => TreeViewCell | undefined;
}
export type TreeViewCell = CustomCell<TreeViewCellProps> & {
    readonly: true;
};
export declare const treeViewCellRenderer: CustomRenderer<TreeViewCell>;
//# sourceMappingURL=tree-view-cell.d.ts.map