// Collapsing column groups -- backlog item 9j of the Ember port.
//
// Port of source's `packages/source/src/use-collapsing-groups.ts`. Clicking a column group's header
// squashes every column in that group down to a sliver; clicking again (or selecting a cell inside
// it) restores them. Column grouping itself landed in Phase 7b -- it is auto-enabled by
// `column.group` -- so this is purely the collapse/expand behaviour on top.
//
// -------------------------------------------------------------------------------------------
// IT DOES NOT REMAP ANYTHING -- and that is the notable finding, not an omission
// -------------------------------------------------------------------------------------------
//
// PHASES.md 9j says "all three [remaining hooks] remap rows or columns, so all three must adopt the
// decorator coordinate-space contract". Reading source settles that this one does **not**: collapsing
// is implemented entirely by *shrinking widths*, never by removing or reordering columns. Every
// column stays at its own index, so displayed column space === your column space, so there is
// nothing to translate on the write path and no `getOriginalIndex`-style escape hatch to provide.
//
// That is why this module takes no `getCellContent` and no `onCellsEdited`: a decorator that
// remapped neither but took both "for symmetry" would be pure ceremony, and would add two more
// identity-stability hazards for nothing. The contract is "remap the write path *if* you remap the
// read path", and the honest answer here is that neither is remapped.
//
// The one callback it does wrap is `onSelectionChanged`, and that is behaviour rather than
// translation: source expands a collapsed group as soon as the selection lands inside it, which is
// what keeps keyboard navigation from walking invisibly through 8px-wide columns.
//
// -------------------------------------------------------------------------------------------
// COLLAPSED STATE IS CONSUMER-OWNED (same reasoning as `movable-columns.ts`)
// -------------------------------------------------------------------------------------------
//
// Source keeps `collapsed` in a `React.useState` inside the hook. A plain function here has no
// equivalent hiding place -- hidden state Ember's autotracking never sees would simply never
// repaint the grid -- so the collapsed set lives in the consumer's own `@tracked` field and this
// stays a pure, memoizable function of it. Identical arrangement to `withColumnSort`'s `sort`.
//
// -------------------------------------------------------------------------------------------
// WHAT THIS PORT CANNOT DO YET
// -------------------------------------------------------------------------------------------
//
// (The one gap that used to be listed here -- no collapsed-group header tint, because the grid
// hardcoded `getGroupDetails` -- closed when `<GlideDataGrid @getGroupDetails>` landed in 4.2. This
// module now returns one; pass it through.)
//
// -------------------------------------------------------------------------------------------
// IDENTITY STABILITY -- read `column-sort.ts`'s header first.
// -------------------------------------------------------------------------------------------
//
// `columns` is one of the ~18 `DrawGridArg` fields `computeCanBlit` compares by identity, so this
// memoizes internally like every other decorator here: a module-scope `WeakMap` keyed on the
// incoming `columns` array, and the caller's own array returned **unchanged** when nothing is
// collapsed (source always allocates a fresh array from `.map`, which would hand the render engine a
// new `columns` identity on every call of a grid that has never been collapsed).

import type { GridColumn, GridSelection } from "../rendering/data-grid-types.ts";
import type { GroupDetails } from "../rendering/render/data-grid-render.cells.ts";
import type { Theme } from "../rendering/theme.ts";
import { getDataEditorTheme } from "../rendering/theme.ts";

/** Width a collapsed column shrinks to. Source's literal. */
const COLLAPSED_WIDTH = 8;
/** Width of the *last* column in a collapsed run -- wide enough to stay grabbable. Source's literal. */
const COLLAPSED_LAST_WIDTH = 36;

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
    readonly onGroupHeaderClicked: (col: number, event?: { preventDefault: () => void }) => void;
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
 * Runs of consecutive collapsed columns, as `[startIndex, length]`. Ported from source's `spans`
 * memo, including its quirk of only starting a run at a *collapsed* column and closing it whenever
 * the group name changes -- which is what gives adjacent collapsed groups their own end caps rather
 * than one shared one.
 */
function computeSpans(
    columns: readonly GridColumn[],
    collapsed: readonly string[],
    freezeColumns: number
): readonly (readonly [number, number])[] {
    const result: [number, number][] = [];
    let current: [number, number] = [-1, -1];
    let lastGroup: string | undefined;
    for (let i = freezeColumns; i < columns.length; i++) {
        const group = columns[i]?.group ?? "";
        const isCollapsed = collapsed.includes(group);

        if (lastGroup !== group && current[0] !== -1) {
            result.push(current);
            current = [-1, -1];
        }

        if (isCollapsed && current[0] !== -1) {
            current[1] += 1;
        } else if (isCollapsed) {
            current = [i, 1];
        } else if (current[0] !== -1) {
            result.push(current);
            current = [-1, -1];
        }
        lastGroup = group;
    }
    if (current[0] !== -1) result.push(current);
    return result;
}

function applySpans(
    columns: readonly GridColumn[],
    spans: readonly (readonly [number, number])[],
    bgCell: string
): readonly GridColumn[] {
    // No collapsed run -> the caller's own array, by identity. See this file's header.
    if (spans.length === 0) return columns;
    return columns.map((c, index) => {
        for (const [start, length] of spans) {
            if (index >= start && index < start + length) {
                const width = index === start + length - 1 ? COLLAPSED_LAST_WIDTH : COLLAPSED_WIDTH;
                return {
                    ...c,
                    width,
                    // Divergence from source, which writes `themeOverride: { bgCell }` flat and so
                    // silently discards whatever theme override the column already carried. Merging
                    // keeps a consumer's per-column theming intact through a collapse.
                    themeOverride: { ...c.themeOverride, bgCell },
                };
            }
        }
        return c;
    });
}

// Everything the cached closures capture, and where it is keyed:
//   - `columns` (the WeakMap key) is captured by `onSelectionChanged` and `onGroupHeaderClicked`
//   - `collapsed` + `onCollapsedChange` are captured by every toggle closure  (`collapsedKey`, identity)
//   - `bgCell` and `freezeColumns` only affect the derived `columns` array
//   - `onSelectionChangedIn` is captured by the returned `onSelectionChanged`
interface CacheEntry {
    readonly collapsedKey: string;
    readonly freezeColumns: number;
    readonly bgCell: string;
    readonly bgHeaderCollapsed: string;
    readonly rowMarkerOffset: number;
    readonly onCollapsedChange: (collapsed: readonly string[]) => void;
    readonly onSelectionChangedIn: ((selection: GridSelection) => void) | undefined;
    readonly getGroupDetailsIn: ((groupName: string) => Partial<GroupDetails> | undefined) | undefined;
    readonly result: CollapsingGroupsResult;
}

const cache = new WeakMap<object, CacheEntry>();

// Structural digest, deliberately not the `collapsed` array's identity -- a consumer computing it in
// a getter allocates a fresh array on every read, and keying on identity would reallocate `columns`
// (an identity-compared `DrawGridArg` field) on every call. Order-sensitive on purpose: it is
// cheaper than sorting, and a reordered-but-equal set only costs one wasted rebuild.
function collapsedCacheKey(collapsed: readonly string[]): string {
    return collapsed.join(" ");
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
export function withCollapsingGroups(p: CollapsingGroupsProps): CollapsingGroupsResult {
    const {
        columns,
        collapsed,
        onCollapsedChange,
        onSelectionChanged: onSelectionChangedIn,
        getGroupDetails: getGroupDetailsIn,
        freezeColumns = 0,
        rowMarkerOffset = 0,
    } = p;
    const bgCell = p.theme?.bgCellMedium ?? getDataEditorTheme().bgCellMedium;
    const bgHeaderCollapsed = p.theme?.bgHeaderHasFocus ?? getDataEditorTheme().bgHeaderHasFocus;
    const collapsedKey = collapsedCacheKey(collapsed);

    const cached = cache.get(columns);
    if (
        cached !== undefined &&
        cached.collapsedKey === collapsedKey &&
        cached.freezeColumns === freezeColumns &&
        cached.bgCell === bgCell &&
        cached.bgHeaderCollapsed === bgHeaderCollapsed &&
        cached.rowMarkerOffset === rowMarkerOffset &&
        cached.onCollapsedChange === onCollapsedChange &&
        cached.onSelectionChangedIn === onSelectionChangedIn &&
        cached.getGroupDetailsIn === getGroupDetailsIn
    ) {
        return cached.result;
    }

    const mangledColumns = applySpans(columns, computeSpans(columns, collapsed, freezeColumns), bgCell);

    const isCollapsed = (group: string): boolean => collapsed.includes(group);
    const toggleGroup = (group: string): void => {
        // Ungrouped columns carry `group === undefined`, which normalises to `""`. Collapsing "the
        // group with no name" would hide every ungrouped column with no header to click to get them
        // back, so it is refused -- source refuses it in `onGroupHeaderClicked` for the same reason.
        if (group === "") return;
        onCollapsedChange(isCollapsed(group) ? collapsed.filter(g => g !== group) : [...collapsed, group]);
    };

    const result: CollapsingGroupsResult = {
        columns: mangledColumns,
        onSelectionChanged: (selection: GridSelection): void => {
            const current = selection.current;
            if (current !== undefined) {
                // Consumer space, same as `columns` -- see `rowMarkerOffset`'s doc comment for the
                // subtraction that used to be here and why it is gone.
                const group = columns[current.cell[0]]?.group ?? "";
                if (group !== "" && isCollapsed(group)) {
                    onCollapsedChange(collapsed.filter(g => g !== group));
                }
            }
            onSelectionChangedIn?.(selection);
        },
        onGroupHeaderClicked: (col: number, event?: { preventDefault: () => void }): void => {
            const group = columns[col]?.group ?? "";
            if (group === "") return;
            // Source calls this before toggling, so a consumer suppressing the browser's own
            // behaviour still gets the collapse.
            event?.preventDefault();
            toggleGroup(group);
        },
        getGroupDetails: (groupName: string): Partial<GroupDetails> => {
            const incoming = getGroupDetailsIn?.(groupName);
            if (!isCollapsed(groupName)) return incoming ?? { name: groupName };
            return {
                ...incoming,
                name: incoming?.name ?? groupName,
                overrideTheme: { ...incoming?.overrideTheme, bgHeader: bgHeaderCollapsed },
            };
        },
        toggleGroup,
        isCollapsed,
    };

    cache.set(columns, {
        collapsedKey,
        freezeColumns,
        bgCell,
        bgHeaderCollapsed,
        rowMarkerOffset,
        onCollapsedChange,
        onSelectionChangedIn,
        getGroupDetailsIn,
        result,
    });
    return result;
}
