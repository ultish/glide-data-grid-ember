// Registry for Phase 5's "extra cell types" (`packages/cells` in source) -- see PORTING-NOTES.md's
// Phase 5 research section for the full architecture rationale. Unlike Phase 4's built-in cells
// (dispatched by `cell.kind` via a `switch`, see `../cells/index.ts`), every cell here is a
// `CustomRenderer<CustomCell<Props>>`: `kind: GridCellKind.Custom`, matched via `isMatch` against
// a `kind` string discriminant inside `cell.data`. This mirrors source's actual extension
// mechanism (`DataEditorProps.customRenderers`), and this port's `GetCellRendererCallback` was
// already a plain consumer-suppliable function since Phase 2/4a -- no registry-merging machinery
// needed in `GridHostController` itself, just this combinator.
//
// Established as shared infra for all of Phase 5's sub-phases (5a: sparkline/star/range/spinner,
// 5b: tags/dropdown/multi-select/links, 5c: date-picker/button/tree-view/user-profile/article) --
// whichever sub-phase runs first creates this file, the others extend `allExtraCells` with their
// own renderers. Re-check this file's current state before editing if working concurrently with
// another sub-phase (same coordination pattern that worked for Phase 4b/4c's `cells/index.ts`).
import { GridCellKind, type CustomCell, type InnerGridCell } from "../data-grid-types.ts";
import type { CellRenderer, CustomRenderer, GetCellRendererCallback } from "../cell-types.ts";

// 5a
import { sparklineCellRenderer } from "./sparkline-cell.ts";
import { starCellRenderer } from "./star-cell.ts";
import { rangeCellRenderer } from "./range-cell.ts";
import { spinnerCellRenderer } from "./spinner-cell.ts";
// 5b
import { tagsCellRenderer } from "./tags-cell.ts";
import { dropdownCellRenderer } from "./dropdown-cell.ts";
import { multiSelectCellRenderer } from "./multi-select-cell.ts";
import { linksCellRenderer } from "./links-cell.ts";
// 5c
import { datePickerCellRenderer } from "./date-picker-cell.ts";
import { buttonCellRenderer } from "./button-cell.ts";
import { treeViewCellRenderer } from "./tree-view-cell.ts";
import { userProfileCellRenderer } from "./user-profile-cell.ts";
import { articleCellRenderer } from "./article-cell.ts";

// 5a
export { sparklineCellRenderer } from "./sparkline-cell.ts";
export type { SparklineCell, SparklineCellProps } from "./sparkline-cell.ts";
export { starCellRenderer } from "./star-cell.ts";
export type { StarCell, StarCellProps } from "./star-cell.ts";
export { rangeCellRenderer } from "./range-cell.ts";
export type { RangeCell, RangeCellProps } from "./range-cell.ts";
export { spinnerCellRenderer } from "./spinner-cell.ts";
export type { SpinnerCell, SpinnerCellProps } from "./spinner-cell.ts";
// 5b
export { tagsCellRenderer } from "./tags-cell.ts";
export type { TagsCell, TagsCellProps } from "./tags-cell.ts";
export { dropdownCellRenderer } from "./dropdown-cell.ts";
export type { DropdownCell, DropdownCellProps } from "./dropdown-cell.ts";
export { multiSelectCellRenderer } from "./multi-select-cell.ts";
export type { MultiSelectCell, MultiSelectCellProps, SelectOption } from "./multi-select-cell.ts";
export { linksCellRenderer } from "./links-cell.ts";
export type { LinksCell, LinksCellProps, LinksCellLink } from "./links-cell.ts";
// 5c
export { datePickerCellRenderer, formatValueForHTMLInput } from "./date-picker-cell.ts";
export type { DatePickerCell, DatePickerCellProps, DateKind } from "./date-picker-cell.ts";
export { buttonCellRenderer } from "./button-cell.ts";
export type { ButtonCell, ButtonCellProps } from "./button-cell.ts";
export { treeViewCellRenderer } from "./tree-view-cell.ts";
export type { TreeViewCell, TreeViewCellProps } from "./tree-view-cell.ts";
export { userProfileCellRenderer } from "./user-profile-cell.ts";
export type { UserProfileCell, UserProfileCellProps } from "./user-profile-cell.ts";
export { articleCellRenderer } from "./article-cell.ts";
export type { ArticleCell, ArticleCellProps } from "./article-cell.ts";

/** Every Phase 5 `CustomRenderer`, in one array -- pass to `createCombinedCellRenderer` below
 * (or to any other `customRenderers`-style consumer) to make all of them usable at once. Extend
 * this array (and the imports/exports above it) when a new sub-phase's cells land, don't replace
 * it -- this file is a shared coordination point across concurrently-run Phase 5 sub-phases. */
export const allExtraCells: readonly CustomRenderer<any>[] = [
    // 5a
    sparklineCellRenderer,
    starCellRenderer,
    rangeCellRenderer,
    spinnerCellRenderer,
    // 5b
    tagsCellRenderer,
    dropdownCellRenderer,
    multiSelectCellRenderer,
    linksCellRenderer,
    // 5c
    datePickerCellRenderer,
    buttonCellRenderer,
    treeViewCellRenderer,
    userProfileCellRenderer,
    articleCellRenderer,
];

/** Combines a Phase 4-style built-in `GetCellRendererCallback` (dispatches by `cell.kind`) with a
 * list of Phase 5 `CustomRenderer`s (dispatch by `isMatch` against `GridCellKind.Custom` cells) --
 * tries `base(cell)` first, then falls back to the first matching extra renderer. Mirrors source's
 * own built-in-then-`customRenderers`-fallback order (`data-editor.tsx`'s `getCellRenderer`). */
export function createCombinedCellRenderer(
    base: GetCellRendererCallback,
    extras: readonly CustomRenderer<any>[]
): GetCellRendererCallback {
    return <T extends InnerGridCell>(cell: T): CellRenderer<T> | undefined => {
        const baseRenderer = base(cell);
        if (baseRenderer !== undefined) return baseRenderer;
        if (cell.kind !== GridCellKind.Custom) return undefined;
        const match = extras.find(r => r.isMatch(cell as unknown as CustomCell));
        return match as unknown as CellRenderer<T> | undefined;
    };
}
