// Row grouping — source's `data-editor/row-grouping.ts` (326 lines) and `row-grouping-api.ts` (72).
//
// The single most important thing to understand before reading further: **the grid does not draw
// group headers.** Source doesn't either. A group header is an ordinary row that the *consumer*
// recognises (via {@link mapRowIndexToPath}) and returns whatever cell content it likes for. All the
// grid contributes is four things, and every one of them is a transform applied to an existing arg:
//
// | what                    | transform                                                        |
// |-------------------------|------------------------------------------------------------------|
// | `rows`                  | -> {@link effectiveRowCount}: collapsed groups contribute 1 row   |
// | `rowHeight`             | -> {@link makeRowHeight}: header rows get `options.height`        |
// | `getRowThemeOverride`   | -> {@link makeRowThemeOverride}: header rows get `themeOverride`  |
// | the row-marker number   | -> {@link makeRowNumberMapper}: `undefined` on a header row       |
//
// Because they are all *arg transforms*, this whole feature lands in `resolveArgs` and the rest of
// the controller is untouched. That is source's structure too (`useRowGroupingInner` runs near the
// top of `DataEditor`, and everything downstream sees only the already-transformed values), and it
// is what keeps row grouping from colliding with the decorator coordinate contract in the way
// TODO.md §4.1 warned about: nothing below `resolveArgs` learns that grouping exists.
//
// Three coordinate spaces appear here and they are easy to confuse:
//
// - **row index** — what the grid draws and what every grid callback reports. Counts group-header
//   rows, and omits the rows inside a collapsed group.
// - **originalIndex** — the index in the caller's flat, fully-expanded row space, i.e. the space
//   `headerIndex` is expressed in. This is what a consumer feeds back to its own data array.
// - **contentIndex** — the index counting *only* content rows, headers excluded. This is what the
//   row-marker column numbers with, so that turning grouping on doesn't make the visible row numbers
//   skip.
//
// {@link mapRowIndexToPath} converts the first into the other two.
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
export type RowGroup =
    | number
    | {
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
export function expandRowGroups(groups: readonly RowGroup[]): ExpandedRowGroup[] {
    function processGroup(group: RowGroup, depth: number, path: readonly number[]): ExpandedRowGroup {
        if (typeof group === "number") {
            return { headerIndex: group, isCollapsed: false, depth, path };
        }

        const expandedGroup: ExpandedRowGroup = {
            headerIndex: group.headerIndex,
            isCollapsed: group.isCollapsed,
            depth,
            path,
        };

        if (group.subGroups !== undefined) {
            expandedGroup.subGroups = group.subGroups
                .map((x, ind) => processGroup(x, depth + 1, [...path, ind]))
                .sort((a, b) => a.headerIndex - b.headerIndex);
        }

        return expandedGroup;
    }

    return groups.map((group, i) => processGroup(group, 0, [i])).sort((a, b) => a.headerIndex - b.headerIndex);
}

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

interface SkippableFlattenedRowGroup extends FlattenedRowGroup {
    readonly skip: boolean;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

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
export function flattenRowGroups(rowGrouping: RowGroupingOptions, rows: number): FlattenedRowGroup[] {
    const flattened: SkippableFlattenedRowGroup[] = [];

    function processGroup(group: ExpandedRowGroup, nextHeaderIndex: number | null, skipChildren = false): void {
        // A group runs until the next header at its own level, or to the end of the data. If it has
        // subgroups, it instead runs only until its *first* subgroup's header — the rows after that
        // belong to the children, not to it.
        let rowsInGroup = nextHeaderIndex !== null ? nextHeaderIndex - group.headerIndex : rows - group.headerIndex;
        if (group.subGroups !== undefined && group.subGroups.length > 0) {
            rowsInGroup = group.subGroups[0]!.headerIndex - group.headerIndex;
        }

        rowsInGroup--; // the header row itself is not one of the group's content rows

        flattened.push({
            rowIndex: -1, // filled in below, once the whole tree's order is known
            headerIndex: group.headerIndex,
            contentIndex: -1, // ditto
            skip: skipChildren,
            isCollapsed: group.isCollapsed,
            depth: group.depth,
            path: group.path,
            rows: rowsInGroup,
        });

        if (group.subGroups !== undefined) {
            for (let i = 0; i < group.subGroups.length; i++) {
                const nextSubHeaderIndex =
                    i < group.subGroups.length - 1 ? group.subGroups[i + 1]!.headerIndex : nextHeaderIndex;
                processGroup(group.subGroups[i]!, nextSubHeaderIndex, skipChildren || group.isCollapsed);
            }
        }
    }

    const expandedGroups = expandRowGroups(rowGrouping.groups);

    for (let i = 0; i < expandedGroups.length; i++) {
        const nextHeaderIndex = i < expandedGroups.length - 1 ? expandedGroups[i + 1]!.headerIndex : null;
        processGroup(expandedGroups[i]!, nextHeaderIndex);
    }

    // `contentIndex` accumulates across *every* group, hidden ones included. That is deliberate and
    // is source's behaviour: it is an index into the fully-expanded content space, so a row keeps its
    // number when a group above it folds. The row-marker column therefore shows a gap over a
    // collapsed group rather than renumbering everything below it.
    let contentIndex = 0;
    for (const g of flattened as Mutable<FlattenedRowGroup & { skip: boolean }>[]) {
        g.contentIndex = contentIndex;
        contentIndex += g.rows;
    }

    const visible = flattened
        .filter(x => !x.skip)
        .map((x): FlattenedRowGroup => {
            const { skip, ...rest } = x;
            void skip;
            return rest;
        });

    // `rowIndex` is assigned over the *visible* groups only — a repair, see below.
    //
    // Source runs this in the same loop as `contentIndex`, i.e. over the unfiltered list, so groups
    // hidden inside a collapsed parent still advance it. The result disagrees with
    // `mapRowIndexToPath`, which is the other computation of the same quantity and the one that
    // decides what actually gets drawn. Verified against source verbatim: for three groups over 30
    // rows where the middle group has two subgroups and is collapsed, source reports `rowIndex: 22`
    // for the last group's header while its mapper puts that header at row 11, in a grid that is 16
    // rows tall. Since `rowIndex`'s only consumer is the group-header row-height lookup
    // (`makeRowHeight`), upstream's effect is that collapsing a parent group makes every group header
    // below it lose its `options.height`.
    //
    // Walking the filtered list makes the two agree by construction: this is the same accumulation
    // `mapRowIndexToPath` performs.
    let rowIndex = 0;
    for (const g of visible as Mutable<FlattenedRowGroup>[]) {
        g.rowIndex = rowIndex;
        // A collapsed group occupies exactly its header row; an expanded one occupies its header
        // plus its content. This is the same sum `effectiveRowCount` reports.
        rowIndex += g.isCollapsed ? 1 : g.rows + 1;
    }

    return visible;
}

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

/** What every lookup returns when grouping is off — the identity mapping. */
function ungrouped(row: number): MapResult {
    return {
        path: [row],
        originalIndex: row,
        isGroupHeader: false,
        groupIndex: row,
        contentIndex: row,
        groupRows: -1,
    };
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
export function mapRowIndexToPath(row: number, flattenedRowGroups?: readonly FlattenedRowGroup[]): MapResult {
    if (flattenedRowGroups === undefined || flattenedRowGroups.length === 0) return ungrouped(row);

    let toGo = row;
    for (const group of flattenedRowGroups) {
        if (toGo === 0)
            return {
                path: [...group.path, -1],
                originalIndex: group.headerIndex,
                isGroupHeader: true,
                groupIndex: -1,
                contentIndex: -1,
                groupRows: group.rows,
            };
        if (group.isCollapsed) {
            toGo--;
            continue;
        }
        if (toGo <= group.rows)
            return {
                path: [...group.path, toGo - 1],
                originalIndex: group.headerIndex + toGo,
                isGroupHeader: false,
                groupIndex: toGo - 1,
                contentIndex: group.contentIndex + toGo - 1,
                groupRows: group.rows,
            };
        toGo = toGo - group.rows - 1;
    }

    return ungrouped(row);
}

/** Total rows the grid should lay out — collapsed groups contribute their header alone. */
export function effectiveRowCount(flattenedRowGroups: readonly FlattenedRowGroup[], rows: number): number {
    if (flattenedRowGroups.length === 0) return rows;
    return flattenedRowGroups.reduce((acc, group) => acc + (group.isCollapsed ? 1 : group.rows + 1), 0);
}

/**
 * The row-marker numbering. Returns the row's **contentIndex**, or `undefined` on a group header —
 * which is the signal the marker column uses to draw nothing there, so the visible numbering counts
 * 1, 2, 3 straight through a header instead of skipping a value at every group.
 */
export function makeRowNumberMapper(
    flattenedRowGroups: readonly FlattenedRowGroup[]
): (row: number) => number | undefined {
    return (row: number): number | undefined => {
        let toGo = row;
        for (const group of flattenedRowGroups) {
            if (toGo === 0) return undefined;
            toGo--;
            if (!group.isCollapsed) {
                if (toGo < group.rows) return group.contentIndex + toGo;
                toGo -= group.rows;
            }
        }
        return row;
    };
}

/** `rowHeight`, with group-header rows forced to `options.height`. */
export function makeRowHeight(
    flattenedRowGroups: readonly FlattenedRowGroup[],
    options: RowGroupingOptions,
    rowHeightIn: number | ((row: number) => number)
): number | ((row: number) => number) {
    // When the group height already equals a uniform row height there is nothing to vary, so hand
    // back the number unchanged. Not just an optimisation: a `number` keeps `computeCanBlit`'s
    // identity check on `rowHeight` satisfied, where a fresh closure would fail it every resolve.
    if (typeof rowHeightIn === "number" && options.height === rowHeightIn) return rowHeightIn;

    const headerRows = new Set(flattenedRowGroups.map(g => g.rowIndex));
    return (rowIndex: number): number => {
        if (headerRows.has(rowIndex)) return options.height;
        return typeof rowHeightIn === "number" ? rowHeightIn : rowHeightIn(rowIndex);
    };
}

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
export function makeRowThemeOverride(
    flattenedRowGroups: readonly FlattenedRowGroup[],
    options: RowGroupingOptions,
    getRowThemeOverrideIn:
        ((row: number, groupIndex: number, contentIndex: number) => Partial<Theme> | undefined) | undefined
): ((row: number) => Partial<Theme> | undefined) | undefined {
    if (getRowThemeOverrideIn === undefined && options.themeOverride === undefined) return undefined;

    return (row: number): Partial<Theme> | undefined => {
        const { isGroupHeader, contentIndex, groupIndex } = mapRowIndexToPath(row, flattenedRowGroups);
        if (isGroupHeader) return options.themeOverride;
        return getRowThemeOverrideIn?.(row, groupIndex, contentIndex);
    };
}

/**
 * The row range a `block-spanning` drag-selection anchored on `selectedRow` may cover, or
 * `undefined` when spanning is unrestricted. Both bounds are inclusive row indices.
 *
 * A group header pins the selection to itself alone — source's choice, and the reason `block`
 * navigation pairs naturally with it.
 */
export function getSelectionRowLimits(
    selectedRow: number,
    flattenedRowGroups: readonly FlattenedRowGroup[] | undefined,
    selectionBehavior: RowGroupingOptions["selectionBehavior"]
): readonly [number, number] | undefined {
    if (selectionBehavior !== "block-spanning" || flattenedRowGroups === undefined) return undefined;

    const { isGroupHeader, path, groupRows } = mapRowIndexToPath(selectedRow, flattenedRowGroups);
    if (isGroupHeader) return [selectedRow, selectedRow];

    const groupRowIndex = path[path.length - 1] ?? 0;
    return [selectedRow - groupRowIndex, selectedRow + groupRows - groupRowIndex - 1];
}

/**
 * Walks `row` off any group header it landed on, in the direction the caller moved.
 *
 * `startRow` is both the origin and the give-up value: if skipping runs out of grid, source restores
 * the original row rather than leaving the selection on a header, and that is reproduced here.
 */
export function skipGroupHeaders(
    row: number,
    startRow: number,
    rows: number,
    flattenedRowGroups: readonly FlattenedRowGroup[] | undefined,
    navigationBehavior: RowGroupingOptions["navigationBehavior"]
): number {
    if (
        flattenedRowGroups === undefined ||
        navigationBehavior === undefined ||
        navigationBehavior === "normal" ||
        row === startRow
    )
        return row;

    const skipUp = navigationBehavior === "skip-up" || navigationBehavior === "skip" || navigationBehavior === "block";
    const skipDown =
        navigationBehavior === "skip-down" || navigationBehavior === "skip" || navigationBehavior === "block";

    const didMoveUp = row < startRow;
    if (didMoveUp && skipUp) {
        while (row >= 0 && mapRowIndexToPath(row, flattenedRowGroups).isGroupHeader) row--;
        if (row < 0) return startRow;
    } else if (!didMoveUp && skipDown) {
        while (row < rows && mapRowIndexToPath(row, flattenedRowGroups).isGroupHeader) row++;
        if (row >= rows) return startRow;
    }

    return row;
}

/**
 * Returns a copy of `rowGrouping` with `update` merged into the group at `path`. Immutable, so the
 * result is a fresh array the consumer can assign straight to tracked state.
 *
 * `path` is what {@link mapRowIndexToPath} handed back — its `-1` terminator is what marks "this
 * level is the target", so a path taken from a *content* row addresses that row's owning group.
 */
export function updateRowGroupingByPath(
    rowGrouping: readonly RowGroup[],
    path: readonly number[],
    update: Partial<Exclude<RowGroup, number>>
): readonly RowGroup[] {
    const [index, ...rest] = path;
    const normalize = (group: RowGroup): Exclude<RowGroup, number> =>
        typeof group === "number" ? { headerIndex: group, isCollapsed: false } : group;

    if (rest[0] === -1) {
        return rowGrouping.map((group, i) => (i === index ? { ...normalize(group), ...update } : group));
    }
    return rowGrouping.map((group, i) =>
        i === index
            ? {
                  ...normalize(group),
                  subGroups: updateRowGroupingByPath(normalize(group).subGroups ?? [], rest, update),
              }
            : group
    );
}

/** The group a {@link MapResult} path points at. */
export function getRowGroupingForPath(rowGrouping: readonly RowGroup[], path: readonly number[]): RowGroup {
    const [index, ...rest] = path;
    const group = rowGrouping[index!]!;
    if (rest[0] === -1) return group;
    return getRowGroupingForPath((typeof group === "number" ? undefined : group.subGroups) ?? [], rest);
}

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
export function rowGroupingApi(options: RowGroupingOptions | undefined, rows: number): RowGroupingApi {
    const flattened = options === undefined ? [] : flattenRowGroups(options, rows);
    return {
        flattened,
        rows: effectiveRowCount(flattened, rows),
        mapper: (row: number) => mapRowIndexToPath(row, options === undefined ? undefined : flattened),
    };
}
