import type { Theme } from "./theme.ts";
/**
 * One group. `headerIndex` is in the caller's flat, fully-expanded row space — i.e. it does not
 * shift as sibling groups collapse.
 *
 * A bare `number` is accepted as shorthand for an expanded group with no subgroups. Source's
 * `groups` documents this shorthand and its `expandRowGroups` implements it, but its declared type
 * never admitted a number, leaving the branch unreachable; the type is widened here so the
 * documented form actually type-checks. Behaviour is unchanged.
 */
export type RowGroup = number | {
    /** The index of this group's header row with every group flattened and expanded. */
    readonly headerIndex: number;
    readonly isCollapsed: boolean;
    readonly subGroups?: readonly RowGroup[];
};
export interface RowGroupingOptions {
    /** The group headers and their collapse state. Order does not matter; they are sorted by
     *  `headerIndex`. */
    readonly groups: readonly RowGroup[];
    /** The height of every group header row. All group headers share one height, as upstream. */
    readonly height: number;
    /** Merged over the grid theme for group-header rows only. */
    readonly themeOverride?: Partial<Theme>;
    /**
     * How keyboard navigation treats group headers.
     *
     * - `normal` (default) — headers are selectable like any other row.
     * - `skip-up` / `skip-down` — arrowing in that direction steps over headers.
     * - `skip` — both directions.
     * - `block` — `skip`, and additionally *clicking* a group header does not move the selection.
     */
    readonly navigationBehavior?: "normal" | "skip" | "skip-up" | "skip-down" | "block";
    /**
     * Whether a drag-selection may cross a group boundary. `block-spanning` clamps the selection to
     * the group the anchor cell sits in; `allow-spanning` (default) lets it run freely.
     */
    readonly selectionBehavior?: "allow-spanning" | "block-spanning";
}
export type ExpandedRowGroup = {
    readonly headerIndex: number;
    readonly isCollapsed: boolean;
    readonly depth: number;
    readonly path: readonly number[];
    subGroups?: readonly ExpandedRowGroup[];
};
/**
 * Normalises the caller's tree: resolves the bare-number shorthand, stamps each group with its
 * `depth` and its `path` (the chain of sibling indices that {@link getRowGroupingForPath} and
 * {@link updateRowGroupingByPath} address groups by), and sorts every level by `headerIndex`.
 *
 * The sort is why `path` has to be stamped *before* it: a path indexes into the caller's original
 * array order, so it must be captured while that order is still intact.
 */
export declare function expandRowGroups(groups: readonly RowGroup[]): ExpandedRowGroup[];
export interface FlattenedRowGroup {
    /** Where this group's header sits in **row-index** space. */
    readonly rowIndex: number;
    /** Where this group's header sits in the caller's flat, expanded space. */
    readonly headerIndex: number;
    /** The **contentIndex** of the first row in the group. */
    readonly contentIndex: number;
    readonly isCollapsed: boolean;
    readonly depth: number;
    /** Number of content rows in the group, header excluded. */
    readonly rows: number;
    readonly path: readonly number[];
}
/**
 * Flattens the group tree into the linear list every lookup below walks — depth-first, so the list
 * is in visual order.
 *
 * The subtlety worth pausing on is `skip`. A group nested inside a *collapsed* ancestor is still
 * flattened, because its `rows` count is needed to keep the running `contentIndex` correct, and only
 * then filtered out. Counting it and then dropping it is not the same as never counting it: content
 * indices have to stay continuous across a collapse, or the row-marker numbers would jump whenever a
 * parent group folded.
 */
export declare function flattenRowGroups(rowGrouping: RowGroupingOptions, rows: number): FlattenedRowGroup[];
export interface MapResult {
    /** Sibling-index chain to the group, with the row's index inside that group appended — or `-1`
     *  appended when the row *is* the group header. */
    readonly path: readonly number[];
    readonly isGroupHeader: boolean;
    /** The row's index in the caller's flat, fully-expanded space. */
    readonly originalIndex: number;
    /** The row's index within its group (header excluded), or `-1` on a header row. */
    readonly groupIndex: number;
    /** The row's index counting content rows only, or `-1` on a header row. */
    readonly contentIndex: number;
    /** Content rows in the owning group, or `-1` when there is no grouping. */
    readonly groupRows: number;
}
/**
 * Converts a **row index** into its path, its `originalIndex` and its `contentIndex`.
 *
 * The trailing fallback is reached when `row` runs past the last group. Source calls its own copy of
 * this "a fucking awful code smell" and it is kept verbatim — it is what makes an out-of-range row
 * behave as ungrouped rather than throw, and the grid does ask for such rows (a trailing blank row,
 * a stale hit test mid-collapse).
 *
 * One deliberate repair: source guards with `flattenRowGroups.length === 0`, reading `.length` off
 * the *function* rather than the array, so the empty-array case falls through to the loop. It is
 * inert — an empty array loops zero times and lands on the identical fallback — so the guard is
 * written correctly here with no behavioural change.
 */
export declare function mapRowIndexToPath(row: number, flattenedRowGroups?: readonly FlattenedRowGroup[]): MapResult;
/** Total rows the grid should lay out — collapsed groups contribute their header alone. */
export declare function effectiveRowCount(flattenedRowGroups: readonly FlattenedRowGroup[], rows: number): number;
/**
 * The row-marker numbering. Returns the row's **contentIndex**, or `undefined` on a group header —
 * which is the signal the marker column uses to draw nothing there, so the visible numbering counts
 * 1, 2, 3 straight through a header instead of skipping a value at every group.
 */
export declare function makeRowNumberMapper(flattenedRowGroups: readonly FlattenedRowGroup[]): (row: number) => number | undefined;
/** `rowHeight`, with group-header rows forced to `options.height`. */
export declare function makeRowHeight(flattenedRowGroups: readonly FlattenedRowGroup[], options: RowGroupingOptions, rowHeightIn: number | ((row: number) => number)): number | ((row: number) => number);
/**
 * `getRowThemeOverride`, with group-header rows themed by `options.themeOverride`.
 *
 * Returns `undefined` when neither the consumer's callback nor `themeOverride` exists — source does
 * the same via `whenDefined`, and it matters here for rule 1: leaving the arg `undefined` keeps the
 * blit fast path available to grids that do no row theming at all.
 *
 * Content rows are passed through to the consumer's callback with source's three arguments —
 * `(row, groupIndex, contentIndex)`. This port's callback had only ever taken `row`; the two extra
 * arguments are additive, so existing callbacks are unaffected.
 */
export declare function makeRowThemeOverride(flattenedRowGroups: readonly FlattenedRowGroup[], options: RowGroupingOptions, getRowThemeOverrideIn: ((row: number, groupIndex: number, contentIndex: number) => Partial<Theme> | undefined) | undefined): ((row: number) => Partial<Theme> | undefined) | undefined;
/**
 * The row range a `block-spanning` drag-selection anchored on `selectedRow` may cover, or
 * `undefined` when spanning is unrestricted. Both bounds are inclusive row indices.
 *
 * A group header pins the selection to itself alone — source's choice, and the reason `block`
 * navigation pairs naturally with it.
 */
export declare function getSelectionRowLimits(selectedRow: number, flattenedRowGroups: readonly FlattenedRowGroup[] | undefined, selectionBehavior: RowGroupingOptions["selectionBehavior"]): readonly [number, number] | undefined;
/**
 * Walks `row` off any group header it landed on, in the direction the caller moved.
 *
 * `startRow` is both the origin and the give-up value: if skipping runs out of grid, source restores
 * the original row rather than leaving the selection on a header, and that is reproduced here.
 */
export declare function skipGroupHeaders(row: number, startRow: number, rows: number, flattenedRowGroups: readonly FlattenedRowGroup[] | undefined, navigationBehavior: RowGroupingOptions["navigationBehavior"]): number;
/**
 * Returns a copy of `rowGrouping` with `update` merged into the group at `path`. Immutable, so the
 * result is a fresh array the consumer can assign straight to tracked state.
 *
 * `path` is what {@link mapRowIndexToPath} handed back — its `-1` terminator is what marks "this
 * level is the target", so a path taken from a *content* row addresses that row's owning group.
 */
export declare function updateRowGroupingByPath(rowGrouping: readonly RowGroup[], path: readonly number[], update: Partial<Exclude<RowGroup, number>>): readonly RowGroup[];
/** The group a {@link MapResult} path points at. */
export declare function getRowGroupingForPath(rowGrouping: readonly RowGroup[], path: readonly number[]): RowGroup;
export interface RowGroupingApi {
    /** Row index -> path, `originalIndex` and `contentIndex`. */
    readonly mapper: (row: number) => MapResult;
    /** The flattened groups, should a consumer want to drive its own UI from them. */
    readonly flattened: readonly FlattenedRowGroup[];
    /** Rows the grid will actually lay out, collapses applied. */
    readonly rows: number;
}
/**
 * The consumer-facing entry point — source's `useRowGrouping`, minus the hook.
 *
 * Call it in a `@cached` getter keyed on the same `(options, rows)` the grid receives, so the
 * `mapper` a `getCellContent` closes over is the one the grid is using. Rebuilding it per call would
 * work but re-flattens the tree every time; the grid memoizes its own copy for exactly that reason.
 */
export declare function rowGroupingApi(options: RowGroupingOptions | undefined, rows: number): RowGroupingApi;
//# sourceMappingURL=row-grouping.d.ts.map