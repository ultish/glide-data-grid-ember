import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface LinksCellLink {
    readonly title: string;
    readonly href?: string;
    readonly onClick?: () => void;
}
export interface LinksCellProps {
    readonly kind: "links-cell";
    readonly underlineOffset?: number;
    readonly maxLinks?: number;
    readonly navigateOn?: "click" | "control-click";
    readonly links: readonly LinksCellLink[];
}
export type LinksCell = CustomCell<LinksCellProps>;
export declare const linksCellRenderer: CustomRenderer<LinksCell>;
//# sourceMappingURL=links-cell.d.ts.map