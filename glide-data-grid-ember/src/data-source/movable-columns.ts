// Movable columns -- backlog item 9j of the Ember port.
//
// Port of source's `packages/source/src/use-movable-columns.ts`. It is the natural companion to the
// grid's `@onColumnMoved`, which by itself only *reports* a drag: the grid never reorders anything
// on its own (same "consumer owns the data, controller only notifies" contract every other callback
// in this addon follows). This module is the missing other half -- it keeps a display order, hands
// the grid a reordered `columns` array, and remaps every coordinate that crosses the boundary.
//
// Source's own comment on the hook is worth repeating, because it explains the shape:
//
//     this cannot actually be made transparent to the user. Doing so would break things like
//     selection ranges being rectangular. The mangled columns need to actually be returned to the
//     user so they can be referenced and understood correctly in other callbacks they may provide
//
// -------------------------------------------------------------------------------------------
// THE COORDINATE CONTRACT (settled in Phase 8a -- see PORTING-NOTES.md and `column-sort.ts`)
// -------------------------------------------------------------------------------------------
//
// **A decorator that remaps the read path must remap the write path too**, or the two end up in
// different coordinate spaces and every consumer has to bridge them by hand -- silently, and
// invisibly until the next reorder. `withColumnSort` does this for *rows*; this does the identical
// thing for *columns*, in the identical shape: props object in, grid args out, `onCellsEdited`
// taken in and a translated `onCellsEdited` handed back out.
//
// **This is a deliberate divergence from source.** `useMoveableColumns` remaps `getCellContent` only
// and leaves the write path alone; a consumer who reorders columns and then edits a cell writes to
// whichever field originally sat at that screen position. `withColumnSort` had exactly that defect
// in this project's own demo (PORTING-NOTES.md 7f) before Phase 8 made the translation structural.
//
// Not translated, deliberately:
//   * `onSelectionChanged` -- reports what is *visually* selected, which is displayed space. Correct
//     as-is; blanket-translating every callback is the opposite mistake.
//   * `onColumnResize*` / `onColumnMoved` -- these are about the columns on screen, so displayed
//     space is what they mean. The `GridColumn` they hand back is the real object out of your own
//     `columns` array either way (this decorator reorders that array, it does not clone its entries).
//
// -------------------------------------------------------------------------------------------
// WHY THE ORDER IS CONSUMER-OWNED STATE
// -------------------------------------------------------------------------------------------
//
// Source keeps the order in a `React.useState` inside the hook. There is no equivalent hiding place
// here: a plain function cannot hold state that Ember's autotracking will notice, so hidden internal
// state would simply never repaint the grid. So the order lives where every other piece of decorator
// input in this directory lives -- in the consumer's own `@tracked` field -- and the decorator stays
// a pure, memoizable function of it. That is the same arrangement `withColumnSort` uses for `sort`.
//
// The order is expressed as **column keys**, not indices: an index-based order silently corrupts
// itself the moment a column is added, removed or renamed, whereas keys degrade gracefully (see
// `resolveOrder` below, ported from source's `getSortIndexByKey`). Keys are also directly
// persistable to localStorage / a user-preferences record, which is the main reason anyone wants
// movable columns in the first place.
//
// -------------------------------------------------------------------------------------------
// IDENTITY STABILITY -- read `column-sort.ts`'s header first.
// -------------------------------------------------------------------------------------------
//
// Both `getCellContent` *and* `columns` are among the ~18 `DrawGridArg` fields `computeCanBlit`
// compares by identity, so this module memoizes internally exactly as `column-sort.ts` does: same
// module-scope `WeakMap` keyed on the incoming `getCellContent`, same read-half/write-half split so
// a consumer's churning callback identity cannot cost them the blit fast path, and the same rule --
// **every value a cached closure captures must appear in the cache key.**
//
// One extra guarantee this module makes: when the resolved order turns out to be the identity
// permutation (the overwhelmingly common case -- nothing has been dragged yet), the caller's own
// `columns`, `getCellContent` and `onCellsEdited` references are returned **unchanged**, not wrapped.
// Source always allocates a new array from `orderBy`; doing that here would hand the render engine a
// fresh `columns` identity on a grid where nothing has ever moved.

import type { GridCell, GridColumn, Item } from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";

type GetCellContentFn = (cell: Item) => GridCell;
type OnCellsEditedFn = (edits: readonly CellEdit[]) => void;
type OnColumnMovedFn = (startIndex: number, endIndex: number) => void;

/**
 * The stable identity of a column for ordering purposes. Ported verbatim from source's `colToKey`:
 * `id` when present, otherwise `"<group>/<title>"`.
 *
 * Exported because a consumer persisting a column order needs to be able to produce the initial
 * value (`columns.map(columnOrderKey)`) and to read a saved one back.
 */
export function columnOrderKey(c: GridColumn): string {
    return c.id ?? `${c.group ?? ""}/${c.title}`;
}

/** Input to {@link withMovableColumns}. */
export interface MovableColumnsProps {
    /**
     * Your columns in their *natural* order -- the order `getCellContent`'s column index refers to.
     * This array is never reordered in place; the decorator returns a reordered copy.
     */
    readonly columns: readonly GridColumn[];
    /** Your cell reader, in natural column space. */
    readonly getCellContent: GetCellContentFn;
    /**
     * Your own edit handler, expecting `location[0]` in **natural** column space -- the same space
     * your `getCellContent` and your `columns` array use.
     *
     * Pass it here and wire {@link MovableColumnsResult.onCellsEdited} to the grid instead of wiring
     * this one directly; the decorator then owns both halves of the translation and the read and
     * write paths cannot disagree. Not in source -- see this file's header.
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    /**
     * The current display order, as {@link columnOrderKey} values. Hold this in a `@tracked` field
     * and replace it from {@link MovableColumnsProps.onOrderChange}.
     *
     * `undefined` (or an order naming no live column) means natural order. Keys naming columns that
     * no longer exist are ignored, and columns missing from the order are slotted in next to their
     * nearest left-hand neighbour that *is* in it -- source's `getSortIndexByKey` behaviour, ported,
     * so that adding a column to `columns` doesn't discard a saved order.
     */
    readonly order?: readonly string[];
    /**
     * Called with the new key order when the user finishes dragging a column. Assign it to the
     * `@tracked` field backing {@link MovableColumnsProps.order} (and persist it if you want the
     * order to survive a reload) -- nothing moves until you do, because the order is your state.
     */
    readonly onOrderChange?: (order: readonly string[]) => void;
    /**
     * Your own `@onColumnMoved`, if you have one. Called *after* `onOrderChange`, with the same
     * displayed-space indices the grid reported. Optional: the decorator supplies the reordering
     * itself, so most consumers pass nothing here.
     */
    readonly onColumnMoved?: OnColumnMovedFn;
}

/** Output of {@link withMovableColumns}. Field names match `<GlideDataGrid>`'s args, so it spreads. */
export interface MovableColumnsResult {
    /**
     * Your columns in display order. Pass to `@columns`. Identity-stable across calls with an
     * unchanged order, and *the caller's own array* when the order is the natural one.
     *
     * The entries are the very `GridColumn` objects from your input array, not copies, so a
     * `GridColumn` handed back by `@onColumnResize` is `===`-comparable against your own.
     */
    readonly columns: readonly GridColumn[];
    /** Column-remapping wrapper around your `getCellContent`. Pass to `@getCellContent`. */
    readonly getCellContent: GetCellContentFn;
    /**
     * Wired-up write path: pass to `@onCellsEdited`. Each edit's `location[0]` has already been
     * translated from *displayed* column space back into your natural column space. `location[1]`
     * (row) is untouched -- this decorator does not remap rows.
     *
     * `undefined` if and only if you passed no `onCellsEdited`.
     */
    readonly onCellsEdited?: OnCellsEditedFn;
    /**
     * Pass to `@onColumnMoved`. This is what makes the grid's drag-to-reorder gesture do anything:
     * it computes the new key order, hands it to `onOrderChange`, then forwards to your own
     * `onColumnMoved`. Always defined -- passing it is also what enables the grid's reorder UI.
     */
    readonly onColumnMoved: OnColumnMovedFn;
    /**
     * Maps a *displayed* column index back to its index in your natural `columns` array.
     *
     * **Escape hatch, not the recommended path** -- exactly like `withColumnSort`'s
     * `getOriginalIndex`. Prefer the built-in write path above. Reach for this only where the write
     * path doesn't reach, e.g. correlating an `onSelectionChanged` column (deliberately left in
     * displayed space) back to one of your own.
     *
     * The identity function when no reordering is active, so callers can translate unconditionally.
     */
    readonly getOriginalColumnIndex: (index: number) => number;
}

const identityIndex = (index: number): number => index;

/**
 * Ported from source's `getSortIndexByKey`. Returns the position `needle` should sort to, given a
 * key order that may not mention it.
 *
 * The `+ 0.5` is the interesting part and is source's: a column absent from the order is placed
 * immediately *after* its nearest left-hand neighbour that is present, rather than being dumped at
 * one end. That is what makes "consumer added a column to `columns` while a saved order was in
 * effect" behave sensibly instead of shuffling the new column to the far right.
 */
function getSortIndexByKey(needle: GridColumn, current: readonly GridColumn[], keys: readonly string[]): number {
    const index = current.indexOf(needle);
    if (index === -1) return Number.MAX_SAFE_INTEGER; // should never happen

    // If we can directly remap we will.
    const remapped = keys.indexOf(columnOrderKey(needle));
    if (remapped !== -1) return remapped;

    // Look for its nearest left-hand neighbour we can remap, and give a partial index.
    for (let n = index; n >= 0; n--) {
        const neighbour = current[n];
        if (neighbour === undefined) continue;
        const ind = keys.indexOf(columnOrderKey(neighbour));
        if (ind !== -1) return ind + 0.5;
    }

    return -1;
}

/**
 * Resolves `columns` + a key order into the displayed column order.
 *
 * Divergence from source: source uses `lodash/orderBy`. `Array.prototype.sort` has been required to
 * be stable since ES2019, which is the only property `orderBy` was providing here, so this drops a
 * dependency import from the paint-adjacent path for identical behaviour.
 */
function resolveOrder(columns: readonly GridColumn[], keys: readonly string[]): readonly GridColumn[] {
    const ranks = new Map<GridColumn, number>();
    for (const c of columns) ranks.set(c, getSortIndexByKey(c, columns, keys));
    return [...columns].sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));
}

// Same read-half / write-half split as `column-sort.ts`'s cache, for the same reason: rebuilding the
// read half means re-resolving the order and reallocating `columns` (which the render engine
// identity-compares), while rebuilding a callback closure costs one allocation. A consumer whose
// `onCellsEdited` is an inline arrow must not lose the blit fast path over it.
//
// Everything the cached closures capture, and where it is keyed:
//   - `getCellContent`          captures `displayToOriginal` + the incoming `getCellContent` (the WeakMap key)
//   - `onCellsEdited`           captures `displayToOriginal` + the incoming `onCellsEdited`  (`onCellsEditedIn`)
//   - `onColumnMoved`           captures `displayedColumns` + `onOrderChange` + the incoming `onColumnMoved`
//   - `getOriginalColumnIndex`  captures `displayToOriginal`
// ...and `displayToOriginal`/`displayedColumns` are a function of {`columns`, `orderKey`}.
interface CacheEntry {
    readonly orderKey: string;
    readonly displayedColumns: readonly GridColumn[];
    /** `undefined` when the resolved order is the identity permutation (pure passthrough). */
    readonly displayToOriginal: readonly number[] | undefined;
    readonly getCellContent: GetCellContentFn;
    readonly getCellContentIn: GetCellContentFn;
    readonly getOriginalColumnIndex: (index: number) => number;
    /** The *incoming* handlers, not the returned ones. */
    readonly onCellsEditedIn: OnCellsEditedFn | undefined;
    readonly onColumnMovedIn: OnColumnMovedFn | undefined;
    readonly onOrderChange: ((order: readonly string[]) => void) | undefined;
    readonly result: MovableColumnsResult;
}

// The resolved order depends only on the caller's columns array and the structural order key.
// `recordsSource` intentionally replaces getCellContent when data changes, so it must not be the
// outer cache key or the display columns would be reallocated on every data update.
const cache = new WeakMap<readonly GridColumn[], Map<string, CacheEntry>>();

// A structural digest of the requested order, deliberately not the `order` array's identity: a
// consumer writing `get order() { return [...this.savedOrder]; }` allocates a fresh array on every
// read, and keying on identity would re-resolve (and reallocate `columns`) on every single call.
// ` ` cannot appear in a column id or title in any realistic data set, so this is injective in
// practice; a collision would only ever cost a stale *ordering*, never a wrong cell.
function orderCacheKey(order: readonly string[] | undefined): string {
    return order === undefined ? "" : order.join(" ");
}

function isIdentityPermutation(map: readonly number[]): boolean {
    for (let i = 0; i < map.length; i++) {
        if (map[i] !== i) return false;
    }
    return true;
}

/**
 * Reorders columns for display, remapping both the read and the write path so the consumer never
 * translates a column index by hand.
 *
 * Port of source's `useMoveableColumns`, with the order lifted out into consumer-owned tracked state
 * and the write path added (see this file's header for both). Memoized on the *structure* of the
 * inputs, so repeated calls with an unchanged order return the identical `columns` array and the
 * identical `getCellContent` closure -- required by the render engine's blit fast path.
 *
 * ```ts
 * @tracked columnOrder: readonly string[] | undefined = undefined;
 *
 * @cached get gridArgs() {
 *     const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
 *     return {
 *         ...src,
 *         ...withMovableColumns({
 *             ...src,
 *             order: this.columnOrder,
 *             onOrderChange: order => (this.columnOrder = order),
 *         }),
 *     };
 * }
 * ```
 */
export function withMovableColumns(p: MovableColumnsProps): MovableColumnsResult {
    const {
        columns,
        getCellContent: getCellContentIn,
        onCellsEdited: onCellsEditedIn,
        order,
        onOrderChange,
        onColumnMoved: onColumnMovedIn,
    } = p;

    const orderKey = orderCacheKey(order);
    const entries = cache.get(columns);
    const cached = entries?.get(orderKey);
    const readReusable = cached !== undefined;
    if (
        readReusable &&
        cached.getCellContentIn === getCellContentIn &&
        cached.onCellsEditedIn === onCellsEditedIn &&
        cached.onColumnMovedIn === onColumnMovedIn &&
        cached.onOrderChange === onOrderChange
    ) {
        return cached.result;
    }

    let displayedColumns: readonly GridColumn[];
    let displayToOriginal: readonly number[] | undefined;
    let getCellContent: GetCellContentFn;
    let getOriginalColumnIndex: (index: number) => number;

    if (readReusable) {
        // Only callback identities changed. Reuse the resolved order and columns; refresh only the
        // wrappers that captured an incoming callback identity.
        ({ displayedColumns, displayToOriginal, getOriginalColumnIndex } = cached);
        const map = displayToOriginal;
        getCellContent =
            cached.getCellContentIn === getCellContentIn
                ? cached.getCellContent
                : map === undefined
                  ? getCellContentIn
                  : ([col, row]: Item): GridCell => getCellContentIn([map[col] ?? col, row]);
    } else {
        const resolved = resolveOrder(columns, order ?? []);
        const map = resolved.map(c => columns.indexOf(c));
        if (isIdentityPermutation(map)) {
            // Nothing has moved. Hand back the caller's own array and function -- a reordered copy
            // that happens to be in the original order would still be a fresh identity, and
            // `columns` is one of the fields `computeCanBlit` compares by reference.
            displayedColumns = columns;
            displayToOriginal = undefined;
            getCellContent = getCellContentIn;
            getOriginalColumnIndex = identityIndex;
        } else {
            displayedColumns = resolved;
            displayToOriginal = map;
            getCellContent = ([col, row]: Item): GridCell => getCellContentIn([map[col] ?? col, row]);
            getOriginalColumnIndex = (index: number): number => map[index] ?? index;
        }
    }

    const map = displayToOriginal;
    const displayed = displayedColumns;
    const result: MovableColumnsResult = {
        columns: displayedColumns,
        getCellContent,
        // With no reordering active, displayed order *is* natural order, so the caller's own handler
        // comes back unwrapped -- one less identity to churn on the common path.
        onCellsEdited:
            map === undefined || onCellsEditedIn === undefined
                ? onCellsEditedIn
                : (edits: readonly CellEdit[]): void => {
                      // Translate displayed -> natural column, then forward the batch in ONE call so
                      // a paste (which arrives as a single multi-cell batch) stays one notification.
                      // `location[1]` is left alone: this decorator does not touch rows.
                      onCellsEditedIn(
                          edits.map(({ location, value }) => {
                              const [col, row] = location;
                              const item: Item = [map[col] ?? col, row];
                              return { location: item, value };
                          })
                      );
                  },
        onColumnMoved: (startIndex: number, endIndex: number): void => {
            // The grid reports both indices in *displayed* space, and `displayed` is in displayed
            // space, so the splice is a straight positional move -- no translation. (Source splices
            // its `keys` state the same way for the same reason.)
            const keys = displayed.map(columnOrderKey);
            const [moved] = keys.splice(startIndex, 1);
            if (moved !== undefined) keys.splice(endIndex, 0, moved);
            onOrderChange?.(keys);
            // After the state update, like source, so a consumer's handler observing both sees them
            // in the same order source produces.
            onColumnMovedIn?.(startIndex, endIndex);
        },
        getOriginalColumnIndex,
    };

    const cacheEntry: CacheEntry = {
        orderKey,
        displayedColumns,
        displayToOriginal,
        getCellContent,
        getCellContentIn,
        getOriginalColumnIndex,
        onCellsEditedIn,
        onColumnMovedIn,
        onOrderChange,
        result,
    };
    if (entries === undefined) {
        cache.set(columns, new Map([[orderKey, cacheEntry]]));
    } else {
        entries.set(orderKey, cacheEntry);
    }
    return result;
}
