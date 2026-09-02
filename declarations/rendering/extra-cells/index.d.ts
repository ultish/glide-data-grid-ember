import type { CustomRenderer, GetCellRendererCallback } from "../cell-types.ts";
export { sparklineCellRenderer } from "./sparkline-cell.ts";
export type { SparklineCell, SparklineCellProps } from "./sparkline-cell.ts";
export { starCellRenderer } from "./star-cell.ts";
export type { StarCell, StarCellProps } from "./star-cell.ts";
export { rangeCellRenderer } from "./range-cell.ts";
export type { RangeCell, RangeCellProps } from "./range-cell.ts";
export { spinnerCellRenderer } from "./spinner-cell.ts";
export type { SpinnerCell, SpinnerCellProps } from "./spinner-cell.ts";
export { tagsCellRenderer } from "./tags-cell.ts";
export type { TagsCell, TagsCellProps } from "./tags-cell.ts";
export { dropdownCellRenderer } from "./dropdown-cell.ts";
export type { DropdownCell, DropdownCellProps } from "./dropdown-cell.ts";
export { multiSelectCellRenderer } from "./multi-select-cell.ts";
export type { MultiSelectCell, MultiSelectCellProps, SelectOption } from "./multi-select-cell.ts";
export { linksCellRenderer } from "./links-cell.ts";
export type { LinksCell, LinksCellProps, LinksCellLink } from "./links-cell.ts";
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
export declare const allExtraCells: readonly CustomRenderer<any>[];
/** Combines a Phase 4-style built-in `GetCellRendererCallback` (dispatches by `cell.kind`) with a
 * list of Phase 5 `CustomRenderer`s (dispatch by `isMatch` against `GridCellKind.Custom` cells) --
 * tries `base(cell)` first, then falls back to the first matching extra renderer. Mirrors source's
 * own built-in-then-`customRenderers`-fallback order (`data-editor.tsx`'s `getCellRenderer`). */
export declare function createCombinedCellRenderer(base: GetCellRendererCallback, extras: readonly CustomRenderer<any>[]): GetCellRendererCallback;
//# sourceMappingURL=index.d.ts.map