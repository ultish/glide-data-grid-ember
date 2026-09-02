import type { GridColumn, GridSelection } from "../rendering/data-grid-types.ts";
import type { GroupDetails } from "../rendering/render/data-grid-render.cells.ts";
import type { Theme } from "../rendering/theme.ts";
/** Input to {@link withCollapsingGroups}. */
export interface CollapsingGroupsProps {
    /**
     * Your columns. Grouping is driven by each column's `group` field, exactly as the grid itself
     * does it -- there is no separate group list.
     */
    readonly columns: readonly GridColumn[];
    /**
     * The currently-collapsed group names. Hold this in a `@tracked` field and replace it from
     * {@link CollapsingGroupsProps.onCollapsedChange}.
     */
    readonly collapsed: readonly string[];
    /**
     * Called with the new collapsed set whenever a group is toggled (or auto-expanded by a
     * selection landing inside it). Assign it to the `@tracked` field backing
     * {@link CollapsingGroupsProps.collapsed} -- nothing collapses until you do, because the state
     * is yours.
     */
    readonly onCollapsedChange: (collapsed: readonly string[]) => void;
    /** Mirror of the grid's own `@freezeColumns`. Frozen columns are never collapsed. @defaultValue 0 */
    readonly freezeColumns?: number;
    /**
     * The same `@theme` overlay you pass the grid, if any. Only `bgCellMedium` (the collapsed
     * columns' tint) and `bgHeaderHasFocus` (the collapsed group header's tint) are read; the
     * built-in light theme's values are used for anything not overridden.
     */
    readonly theme?: Partial<Theme>;
    /**
     * Your own `@getGroupDetails`, if you have one. Wrapped rather than replaced: the returned one
     * calls yours first and then adds the collapsed tint.
     */
    readonly getGroupDetails?: (groupName: string) => Partial<GroupDetails> | undefined;
    /**
     * Your own `@onSelectionChanged`, if you have one. Called after the auto-expand check, with the
     * selection untouched.
     */
    readonly onSelectionChanged?: (selection: GridSelection) => void;
    /**
     * @deprecated Ignored, and safe to delete. It existed because `@onSelectionChanged` used to
     * report *mangled* column indices while every other callback reported consumer ones; that split
     * was removed on 2026-08-09 and every consumer-facing callback now speaks consumer space. Still
     * accepted so passing it is not a compile error, but passing `1` no longer shifts anything.
     */
    readonly rowMarkerOffset?: number;
}
/** Output of {@link withCollapsingGroups}. Field names match `<GlideDataGrid>`'s args, so it spreads. */
export interface CollapsingGroupsResult {
    /**
     * Your columns, with collapsed ones shrunk and tinted. Pass to `@columns`. Same length and same
     * order as your input -- collapsing never changes a column's index. Identity-stable across calls
     * with an unchanged collapsed set, and *the caller's own array* when nothing is collapsed.
     */
    readonly columns: readonly GridColumn[];
    /**
     * Pass to `@onSelectionChanged`. Expands a collapsed group when the selection moves into it
     * (source's behaviour -- otherwise keyboard navigation walks invisibly through slivers), then
     * forwards to your own handler.
     *
     * Always defined, even if you passed nothing: the expand behaviour is the point of it.
     */
    readonly onSelectionChanged: (selection: GridSelection) => void;
    /**
     * Pass to `@onGroupHeaderClicked`. Collapses the clicked group, or expands it if already
     * collapsed. Also works on `@onGroupHeaderContextMenu` (right-click to collapse) or from your
     * own chrome via {@link CollapsingGroupsResult.toggleGroup}.
     *
     * It calls `event.preventDefault()` whenever the click hits a real group, matching source --
     * and on `@onGroupHeaderClicked` that is load-bearing rather than decorative: group headers are
     * the one band whose selection is applied on *mouseup*, after this callback, so
     * `preventDefault()` stops the collapse from also selecting every column in the group.
     */
    readonly onGroupHeaderClicked: (col: number, event?: {
        preventDefault: () => void;
    }) => void;
    /**
     * Pass to `@getGroupDetails`. Tints a collapsed group's header strip with `bgHeaderHasFocus`,
     * so the collapsed slivers read as one folded group rather than as narrow columns, and forwards
     * everything else to your own `getGroupDetails`.
     *
     * Divergence from source, matching the one `applySpans` already makes for `themeOverride`: your
     * `overrideTheme` is *merged* under the tint instead of being discarded, and a `name` you
     * return wins over the group key.
     */
    readonly getGroupDetails: (groupName: string) => Partial<GroupDetails>;
    /** Collapse the group if expanded, expand it if collapsed. The primitive the rest is built on. */
    readonly toggleGroup: (group: string) => void;
    /** True if `group` is currently collapsed. For rendering your own chevrons/toggles. */
    readonly isCollapsed: (group: string) => boolean;
}
/**
 * Adds collapse/expand behaviour to column groups.
 *
 * Port of source's `useCollapsingGroups`, with the collapsed set lifted out into consumer-owned
 * tracked state. Memoized on the *structure* of the inputs, so repeated calls with an unchanged
 * collapsed set return the identical `columns` array -- required by the render engine's blit fast
 * path (see this file's header).
 *
 * ```ts
 * @tracked collapsedGroups: readonly string[] = [];
 *
 * @cached get gridArgs() {
 *     const src = recordsSource({ records: this.people, columns: COLUMNS, toCell });
 *     return {
 *         ...src,
 *         ...withCollapsingGroups({
 *             columns: src.columns,
 *             collapsed: this.collapsedGroups,
 *             onCollapsedChange: c => (this.collapsedGroups = c),
 *         }),
 *     };
 * }
 * ```
 */
export declare function withCollapsingGroups(p: CollapsingGroupsProps): CollapsingGroupsResult;
//# sourceMappingURL=collapsing-groups.d.ts.map