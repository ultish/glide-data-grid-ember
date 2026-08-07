// Cell-type registry (Phase 4a) -- replaces `src/rendering/-temp-text-cell-renderer.ts`'s
// smoke-test stub with a real `GetCellRendererCallback` dispatching by `cell.kind`, same overall
// shape as the stub it replaces (single `switch`, one cast per branch -- `GetCellRendererCallback`
// is generic over the specific cell type per call, so a cast is unavoidable inside a dispatcher
// that switches at runtime).
//
// Scope: text/number/boolean/loading/protected/row-id (Phase 4a), uri/markdown (Phase 4b), plus
// bubble/drilldown (Phase 4c). Every other `GridCellKind` (image/custom) returns `undefined` here,
// same as an unregistered kind always has -- the render engine already handles that gracefully
// (draws an empty cell), and `GridHostController`'s edit/paste/delete paths already have a
// non-renderer-backed fallback for exactly this reason. Later sub-phases (4d, see PORTING-NOTES.md)
// add more `case` branches here, nothing else needs to change.
import { GridCellKind, type InnerGridCell } from "../data-grid-types.ts";
import type { CellRenderer, GetCellRendererCallback } from "../cell-types.ts";
import { textCellRenderer } from "./text-cell.ts";
import { numberCellRenderer } from "./number-cell.ts";
import { booleanCellRenderer } from "./boolean-cell.ts";
import { loadingCellRenderer } from "./loading-cell.ts";
import { protectedCellRenderer } from "./protected-cell.ts";
import { rowIDCellRenderer } from "./row-id-cell.ts";
import { uriCellRenderer } from "./uri-cell.ts";
import { markdownCellRenderer } from "./markdown-cell.ts";
import { bubbleCellRenderer } from "./bubble-cell.ts";
import { drilldownCellRenderer } from "./drilldown-cell.ts";

export { textCellRenderer } from "./text-cell.ts";
export { numberCellRenderer } from "./number-cell.ts";
export { booleanCellRenderer, toggleBoolean } from "./boolean-cell.ts";
export { loadingCellRenderer } from "./loading-cell.ts";
export { protectedCellRenderer } from "./protected-cell.ts";
export { rowIDCellRenderer } from "./row-id-cell.ts";
export { uriCellRenderer } from "./uri-cell.ts";
export { markdownCellRenderer } from "./markdown-cell.ts";
export { bubbleCellRenderer } from "./bubble-cell.ts";
export { drilldownCellRenderer } from "./drilldown-cell.ts";

export const getCellRenderer: GetCellRendererCallback = <T extends InnerGridCell>(cell: T): CellRenderer<T> | undefined => {
    switch (cell.kind) {
        case GridCellKind.Text:
            return textCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Number:
            return numberCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Boolean:
            return booleanCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Loading:
            return loadingCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Protected:
            return protectedCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.RowID:
            return rowIDCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Uri:
            return uriCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Markdown:
            return markdownCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Bubble:
            return bubbleCellRenderer as unknown as CellRenderer<T>;
        case GridCellKind.Drilldown:
            return drilldownCellRenderer as unknown as CellRenderer<T>;
        default:
            return undefined;
    }
};
