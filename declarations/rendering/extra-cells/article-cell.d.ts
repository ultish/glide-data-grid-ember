import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface ArticleCellProps {
    readonly kind: "article-cell";
    readonly markdown: string;
}
export type ArticleCell = CustomCell<ArticleCellProps>;
export declare const articleCellRenderer: CustomRenderer<ArticleCell>;
//# sourceMappingURL=article-cell.d.ts.map