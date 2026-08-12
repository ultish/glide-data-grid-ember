// Public `<GlideDataGrid>` component -- Phase 2b of the Ember port. Thin reactivity/lifecycle
// wrapper around the plain-TS `GridHostController` (`../-private/grid-host-controller.ts`), which
// owns all the actual canvas/scroll/resize/hover DOM. This component's only jobs are:
//   1. Render the single container `<div>` the controller mounts itself into.
//   2. Construct the controller once the element exists, destroy it when the component is torn
//      down.
//   3. Re-run `scheduleFullRedraw()` whenever any relevant `@arg` changes, using autotracking
//      rather than any manual dependency list.
//   4. Surface the controller's imperative `updateCells` API to the consumer via `@onReady`.
import Component from "@glimmer/component";
// Structural CSS for the grid's DOM (the `.dvn-*` scroll scaffolding), ported from source's
// Linaria block. Imported here so any bundler picks it up automatically -- consumers never need a
// separate CSS import. See the file header for why this is a stylesheet rather than inline styles.
import "./glide-data-grid.css";
// Overlay-editor chrome, split from the structural sheet above deliberately -- see that file's
// header. Imported here rather than from `src/rendering/`, which is kept free of bundler-dependent
// imports so the vitest suite can import it in bare Node.
import "./glide-data-grid-editors.css";
// The `packages/cells` extra-cell editors. Always loaded, even when a consumer passes no
// `@extraCells` -- a few hundred bytes, against the alternative of importing it from
// `src/rendering/extra-cells/index.ts` and giving that framework-agnostic directory a
// bundler-dependent import.
import "./glide-data-grid-extra-cell-editors.css";
import { cached, tracked } from "@glimmer/tracking";
import { hash } from "@ember/helper";
import { htmlSafe } from "@ember/template";
import { registerDestructor } from "@ember/destroyable";
import { modifier } from "ember-modifier";
import {
    GridHostController,
    type GridHostArgs,
    type SearchState,
    type ContextMenuEventArgs,
    type RowMarkerKind,
    type CellsForSelectionCallback,
    type TrailingRowOptions,
} from "../-private/grid-host-controller.ts";

// Part of this component's public contract (`@onSearchStateChange`, `@rowMarkers`,
// `@getCellsForSelection`, `@trailingRowOptions`), so re-exported here rather than making consumers
// import from `-private/`.
export type {
    SearchState,
    ContextMenuEventArgs,
    RowMarkerKind,
    CellsForSelectionCallback,
    TrailingRowOptions,
    RowAppendedResult,
    ColumnAppendedResult,
} from "../-private/grid-host-controller.ts";
import type { RowAppendedResult, ColumnAppendedResult } from "../-private/grid-host-controller.ts";

import { getCellRenderer as defaultGetCellRenderer } from "../rendering/cells/index.ts";
import { createCombinedCellRenderer } from "../rendering/extra-cells/index.ts";
import type {
    GridColumn,
    GridCell,
    GridSelection,
    Item,
    Rectangle,
    Theme,
    GetCellRendererCallback,
    GetRowThemeCallback,
    GroupDetails,
    SpriteMap,
    CustomRenderer,
    DrawCellCallback,
    DrawHeaderCallback,
    CellList,
    Highlight,
    FillHandleDirection,
    FillPatternEventArgs,
    GridMouseEventArgs,
    SelectionBlending,
    ValidateCellCallback,
    CoercePasteValueCallback,
    PasteBehavior,
    CellClickedEventArgs,
    HeaderClickedEventArgs,
    GroupHeaderClickedEventArgs,
    CellActivatedEventArgs,
    CellActivationBehavior,
    ScrollToParams,
    IsDraggable,
    GridDragEventArgs,
    Keybinds,
} from "../rendering/index.ts";

/**
 * The imperative surface, handed to `@onReady` once the grid exists and also yielded as
 * `api` from the component's block. Port of source's `DataEditorRef` (9f).
 *
 * **Shape decision, settled 9f (2026-08-09).** It stays a plain, flat, reference-stable bag of bound
 * methods rather than becoming a class the consumer constructs and passes in. The alternative
 * inverts construction -- the object would have to exist before the grid, and every method would
 * need a "not attached yet" state -- which buys nothing: the grid already hands the same object out
 * *twice*, through `@onReady` for a consumer who wants to stash it and through the yielded block for
 * one who only needs it in the template. That block form is the Ember-idiomatic "controller the
 * consumer holds", so adding a third mechanism would be two ways to do one thing. Source's ref is
 * flat too, at nine methods.
 *
 * **Every column index here is in consumer space** -- column `0` is your first column, never the
 * row-marker column, in both directions. The same rule as `@onCellsEdited` and the context-menu
 * callbacks.
 */
export interface GlideDataGridApi {
    readonly updateCells: (cells: readonly { cell: Item }[]) => void;

    // --- 9f: the rest of source's `DataEditorRef` -------------------------------------------------

    /** Focus the grid, so keyboard navigation works without clicking it first. */
    readonly focus: () => void;
    /**
     * Screen-space (client) bounds of a cell, or of a column header when `row` is omitted, or of the
     * entire scrollable content when both are omitted. `undefined` if the target is scrolled out of
     * the drawn region or does not exist.
     *
     * Client coordinates, so it can position a tooltip or popover directly.
     */
    readonly getBounds: (col?: number, row?: number) => Rectangle | undefined;
    /**
     * Scroll a cell into view, the minimum distance by default.
     *
     * `hAlign`/`vAlign` pin it to an edge or centre it instead; `paddingX`/`paddingY` add slack;
     * `dir` restricts which axes may move; `behavior: "smooth"` animates.
     *
     * **Narrower than source in one way:** source also accepts `{amount, unit: "px"}` in place of a
     * column or row index. That form is not ported -- its upstream implementation mixes client and
     * content coordinates in a way this port would have to guess at, and `@scrollOffsetX`/`Y` already
     * cover px positioning. Widening the parameter later is not a breaking change.
     */
    readonly scrollTo: (col: number, row: number, params?: ScrollToParams & { behavior?: ScrollBehavior }) => void;
    /**
     * Re-measure the given columns against their currently-visible cells and report the results
     * through `@onColumnResize`, exactly as dragging a resize handle would.
     *
     * **Notification only.** You own the columns array; nothing changes width until you apply it. Does
     * nothing without an `@onColumnResize`.
     */
    readonly remeasureColumns: (cols: Iterable<number>) => void;
    /**
     * The `GridMouseEventArgs` a pointer at these *client* coordinates would produce, with no pointer
     * event having happened -- the same hit test `@onItemHovered` reports through. For hit-testing a
     * drop target, or a synthetic pointer.
     */
    readonly getMouseArgsForPosition: (
        clientX: number,
        clientY: number,
        ev?: MouseEvent
    ) => GridMouseEventArgs | undefined;
    /**
     * Append a row programmatically, then select `col` in it and (unless `openOverlay` is `false`)
     * open its editor. The programmatic half of `@onRowAppended`, which is still what actually adds
     * the row.
     *
     * Resolves once the focus has landed. It has to be async: your row count is tracked state that
     * has not flushed when `@onRowAppended` returns, so the grid polls for it to grow (with backoff,
     * giving up after ~500ms) before focusing anything. Return `"top"` or a row index from
     * `@onRowAppended` if the new row did not go on the end.
     */
    readonly appendRow: (col: number, openOverlay?: boolean, behavior?: ScrollBehavior) => Promise<void>;
    /** The column equivalent of {@link GlideDataGridApi.appendRow}, driving `@onColumnAppended`. */
    readonly appendColumn: (row: number, openOverlay?: boolean) => Promise<void>;
    /**
     * Synthesise a user interaction. Source takes five event names; this port implements `"delete"`
     * only -- see `GridHostController.emit` for why the other four are not simple exposures of
     * anything that exists here. The union is deliberately narrow so adding them later is not a
     * breaking change.
     */
    readonly emit: (event: "delete") => void;

    // Search (Phase 9e). These are what `<GlideSearchBar>` drives; a consumer building their own
    // search UI uses the same five methods.
    readonly openSearch: () => void;
    readonly closeSearch: () => void;
    readonly setSearchValue: (value: string) => void;
    readonly searchNext: () => void;
    readonly searchPrev: () => void;
    /** Reads the current state directly, for a UI that mounts after a search is already open
     *  rather than waiting for the next `@onSearchStateChange`. */
    readonly getSearchState: () => SearchState;
    /**
     * The grid's root element -- the one carrying `.gdg-root` and this grid's `--gdg-*` theme
     * variables.
     *
     * Exposed for `<GlideSearchBar>`, which portals itself into it with `{{in-element}}`. That is
     * not a convenience: the bar's stylesheet is scoped under `.gdg-root` like every other sheet in
     * this addon, and the theme variables it reads are stamped on this element, so a bar rendered
     * in the consumer's own DOM would get neither. Source has the same structure for the same
     * reason -- its search overlay is a sibling of the canvas inside the grid's own wrapper.
     */
    readonly getRootElement: () => HTMLElement;
}

export interface GlideDataGridSignature {
    Element: HTMLDivElement;
    /**
     * Content rendered **inside the grid's own root element**, as a sibling of its canvases.
     *
     * This exists for `<GlideSearchBar>` and anything like it, and the placement is the whole
     * point: every stylesheet in this addon is scoped under `.gdg-root`, and the `--gdg-*` theme
     * variables are stamped on that same element -- so an overlay rendered in the consumer's own
     * DOM gets neither. Source has the identical structure (its search overlay is a sibling of the
     * canvas inside the grid wrapper).
     *
     * It also removes an ordering hazard that a portal does not: `api` only exists once the grid's
     * modifier has run, so a sibling component reading it during the same render pass reads
     * `undefined` and never re-renders. Yielded content renders after, and gets it directly.
     */
    Blocks: {
        default: [
            {
                /** The same object `@onReady` receives, once the controller exists. */
                api: GlideDataGridApi | undefined;
                /** Live search state, updated on every change. Feed straight to `<GlideSearchBar>`. */
                searchState: SearchState | undefined;
            },
        ];
        /**
         * A panel rendered at the far end of the horizontal scroll region, past the last column —
         * the "+ add column" button, a summary rail, a message. Source takes this as a
         * `rightElement` *prop* holding a React node; a named block is the Ember spelling, and a
         * better one: the content stays in the consumer's template, with their own components,
         * services and actions in scope.
         *
         * Pair it with `@rightElementSticky` to pin it to the visible edge, `@rightElementFill` to
         * let it eat the leftover width, and `@paddingRight` to hold it clear of the last column.
         */
        rightElement: [];
    };
    Args: {
        columns: readonly GridColumn[];
        getCellContent: (item: Item) => GridCell;
        rows: number;
        rowHeight?: number | ((row: number) => number);
        headerHeight?: number;
        groupHeaderHeight?: number;
        theme?: Partial<Theme>;
        freezeColumns?: number;
        verticalBorder?: (col: number) => boolean;
        resizeIndicator?: "full" | "header" | "none";
        hyperWrapping?: boolean;
        /**
         * How each column group's header strip is drawn: display `name`, `icon`, `overrideTheme`,
         * and `actions` (hover-revealed icon buttons with their own click targets). Grouping itself
         * is switched on by any column carrying a `group`; this only customises the strip.
         *
         * Everything is optional -- return `undefined`, or an object with just the fields you want
         * to change. Pass a **stable** function reference (a class-field arrow), not an inline
         * arrow: see `GridHostArgs.getGroupDetails`.
         */
        getGroupDetails?: (groupName: string) => Partial<GroupDetails> | undefined;
        /**
         * Extra empty scrollable space past the last column / last row, in px, so a trailing column
         * or row can be scrolled clear of anything floating over the grid's edge. Scaled by
         * `@scaleToRem` like every other pixel dimension.
         */
        overscrollX?: number;
        /** {@inheritDoc overscrollX} */
        overscrollY?: number;
        /**
         * The inset shadows that fade in over the frozen columns' right edge and under the header as
         * the grid scrolls. **On by default** — pass `false` to switch one off. The X shadow needs
         * frozen columns (or a row-marker column) to cast from.
         */
        fixedShadowX?: boolean;
        /** {@inheritDoc fixedShadowX} */
        fixedShadowY?: boolean;
        /**
         * Let a cell draw narrower than the render engine's 10px floor (drops it to 1px). Needed for
         * deliberately hairline columns — `withCollapsingGroups`' 8px slivers are the usual case.
         */
        disableMinimumCellWidth?: boolean;
        /**
         * How the canvas is composited. Leave it alone unless chasing a specific artefact: the
         * default already picks `"double-buffer"` on Safari and `"single-buffer"` elsewhere, and
         * `"direct"` disables the scroll blit fast path.
         */
        renderStrategy?: "single-buffer" | "double-buffer" | "direct";
        /**
         * Drop the canvas resolution while scrolling and restore it 200ms after the last scroll —
         * blurrier in motion, sharp at rest. Each only applies on its own browser and only above 1x
         * DPR. Worth switching on for a wide grid on a hi-DPI screen.
         */
        enableFirefoxRescaling?: boolean;
        /** {@inheritDoc enableFirefoxRescaling} */
        enableSafariRescaling?: boolean;
        /**
         * Refuse to read any cell outside the region last reported to `@onVisibleRegionChanged`,
         * drawing a loading cell instead. A **development harness for paged/async sources**: it
         * turns "the grid quietly rendered whatever the array held" into visible loading cells.
         * The selected cell and frozen columns stay readable. Off by default; leave it off in
         * production.
         */
        strictVisibleRegion?: boolean;
        /**
         * Where the grid attaches its window-level pointer listeners (drag-end, autoscroll's
         * pointer tracking, overlay-editor outside-click). Needed when the grid lives somewhere
         * those never reach `window` — an iframe, a portal. A grid inside a shadow root is already
         * handled without this: the target is resolved from the canvas's `getRootNode()`.
         * Read once, when listeners are attached.
         */
        eventTarget?: HTMLElement | Window | Document | ShadowRoot;
        /**
         * Pin the `<:rightElement>` panel to the visible edge instead of making the user scroll to
         * the end to reveal it.
         */
        rightElementSticky?: boolean;
        /**
         * Let the `<:rightElement>` panel consume the leftover horizontal space rather than sitting
         * immediately after the last column. **Does not play nicely with `grow` columns** — they are
         * competing for the same slack.
         */
        rightElementFill?: boolean;
        /**
         * Reserved empty space at the right and bottom of the scrollable area, in px. Meant to go
         * with `<:rightElement>`: `@paddingRight` holds a sticky panel clear of the last column and
         * is subtracted from the width the visible region is measured against, so cells underneath
         * the panel are not reported as visible. Without a right element, use `@overscrollX`/`Y`.
         */
        paddingRight?: number;
        /** {@inheritDoc paddingRight} */
        paddingBottom?: number;
        // Not part of the original Phase 2 brief's enumerated arg list, but required because
        // `GridHostArgs.getCellRenderer` is non-optional -- see PORTING-NOTES.md "Phase 2b"
        // section for the rationale. Defaults to the real Phase 4a cell-type registry
        // (`../rendering/cells/index.ts`, text/number/boolean/loading/protected/row-id).
        getCellRenderer?: GetCellRendererCallback;
        /**
         * Extra cell types to make available, on top of the built-in ones -- the 13 `CustomRenderer`
         * cells from `glide-data-grid-ember/rendering/extra-cells/index` (sparkline, star, tags,
         * date-picker, ...) or your own. Mirrors source's `customRenderers` prop.
         *
         * This is the recommended way to get the extra cells: the component combines them with the
         * built-in registry via `createCombinedCellRenderer` in a `@cached` getter, which keeps the
         * resulting `getCellRenderer` reference-stable (it is one of `computeCanBlit`'s
         * identity-compared fields -- building the combined renderer inline would silently disable
         * the scroll blit fast path). Pass a stable array; a fresh literal each render defeats the
         * cache.
         *
         * Ignored if you pass `@getCellRenderer` explicitly -- that arg is the full manual override.
         */
        // Renderer payloads are intentionally heterogeneous at this public boundary.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extraCells?: readonly CustomRenderer<any>[];
        /**
         * Extra/override header-icon glyphs (`column.icon`), merged over the built-in set. The
         * built-ins are always available, so this is only for adding custom glyphs. Read once when
         * the grid is created.
         */
        headerIcons?: SpriteMap;
        onReady?: (api: GlideDataGridApi) => void;

        // Selection / interaction config + callbacks (Phase 3a/3c/3d) -- forwarded straight
        // through to `GridHostArgs`; see that interface's doc comments (`grid-host-controller.ts`)
        // for exact semantics, especially the "consumer owns the data, controller only notifies"
        // contract that `onCellsEdited`/`onColumnResize*`/`onColumnMoved` all share.
        rowMarkers?: RowMarkerKind;
        rowMarkerWidth?: number;
        /** The number against the first row (Phase 9g). `1` by default; `0` makes the markers agree
         *  with `@getCellContent`'s row indices. */
        rowMarkerStartIndex?: number;
        /** Theme overlay for the row-marker column alone (Phase 9g). Pass a **stable** object -- it
         *  lands on a column, and columns are identity-compared for the scroll blit fast path. */
        rowMarkerTheme?: Partial<Theme>;
        rowSelect?: "none" | "single" | "multi";
        columnSelect?: "none" | "single" | "multi";
        rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
        rangeSelectionColumnSpanning?: boolean;
        // Selection tuning (Phase 9g). Pure passthroughs -- the selection writers in
        // `rendering/selection-behavior.ts` have been parameterized over all five since Phase 3a.
        // `"exclusive"` (the default) means a cell/range selection clears any row/column selection
        // and vice versa; `"mixed"` keeps them while Ctrl/Cmd is held; `"additive"` always keeps
        // them. The two `*SelectionMode` args make row/header clicks accumulate without a modifier.
        rangeSelectionBlending?: SelectionBlending;
        columnSelectionBlending?: SelectionBlending;
        rowSelectionBlending?: SelectionBlending;
        rowSelectionMode?: "auto" | "multi";
        columnSelectionMode?: "auto" | "multi";
        /**
         * Take ownership of the selection. Pass it and the grid keeps none of its own: every gesture
         * reports the *requested* selection through `@onSelectionChanged` and nothing moves until you
         * pass a new value back — which is what lets you reject it, snap it to whole rows, or keep it
         * in sync with the rest of your UI. Omit it and the grid owns its selection as before.
         */
        selection?: GridSelection;
        onSelectionChanged?: (selection: GridSelection) => void;
        /**
         * The user clicked **outside the grid's content** — past the last row or column — clearing
         * the selection. Deliberately narrow: it does not fire for Escape, a delete, or any other
         * route to an empty selection, matching source.
         */
        onSelectionCleared?: () => void;
        onHeaderMenuClick?: (col: number, bounds: Rectangle) => void;
        onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void;
        onColumnResizeStart?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnResize?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnResizeEnd?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnProposeMove?: (startIndex: number, endIndex: number) => boolean;
        onColumnMoved?: (startIndex: number, endIndex: number) => void;

        // Row reorder + fill handle (Phase 9h) -- forwarded straight through to `GridHostArgs`.
        // `@onRowMoved` both enables row dragging and draws the marker cells' drag handles, and it
        // needs `@rowMarkers` to be on (that column is what you grab). `@fillHandle` is opt-in and
        // off by default, matching source; when on, dragging the handle fills through
        // `@getCellsForSelection` and reports the writes via `@onCellsEdited`.
        onRowMoved?: (startIndex: number, endIndex: number) => void;
        fillHandle?: boolean;
        allowedFillDirections?: FillHandleDirection;
        onFillPattern?: (event: FillPatternEventArgs) => void;

        // Trailing blank row / "add row" affordance (Phase 4d) -- forwarded straight through to
        // `GridHostArgs`; see that interface's doc comments for exact semantics.
        showTrailingBlankRow?: boolean;
        /** Tint / hint text / "+" icon for that row (Phase 9g). Cosmetic only; see
         *  `TrailingRowOptions` for the two of source's fields this port deliberately omits. */
        trailingRowOptions?: TrailingRowOptions;
        /** Return `"top"` or a row index if the new row did not go on the end -- only
         *  `GlideDataGridApi.appendRow` reads it, and returning nothing is fine. */
        onRowAppended?: () => RowAppendedResult | Promise<RowAppendedResult> | void;

        // Theming (Phase 6). `@theme` above is the global overlay on the base theme; this is the
        // per-row overlay, applied after a column's `themeOverride` and before a cell's. See
        // THEMING.md for the full precedence table -- and note the blit-invalidation caveat there:
        // pass a *stable* function reference, not a fresh inline arrow each render.
        getRowThemeOverride?: GetRowThemeCallback;

        // Async / streaming data (Phase 8). Fired -- deduplicated, and deferred to a microtask so
        // it is safe to set tracked state from -- whenever the visible block of cells changes.
        // `region` is in this component's own coordinate space (no row-marker column, real data
        // rows only). See `GridHostArgs.onVisibleRegionChanged` for the full contract.
        onVisibleRegionChanged?: (region: Rectangle) => void;

        /**
         * Read a whole rectangle of cells at once instead of one at a time. Pass `true` for the
         * common in-memory case (the grid synthesises one from `@getCellContent`), or a function
         * when a bulk fetch is cheaper or cells outside the rendered window aren't in memory.
         * See `GridHostArgs.getCellsForSelection` — in particular, the async thunk form is
         * deliberately not used by copy.
         */
        getCellsForSelection?: CellsForSelectionCallback | true;

        // Consumer draw hooks / overlays (Phase 9) -- forwarded straight through to `GridHostArgs`.
        // See that interface's doc comments; note especially that `prelightCells` and
        // `highlightRegions` are identity-compared by `computeCanBlit`, so they must be stable
        // references (build them in a `@cached` getter, not inline in the template).
        drawCell?: DrawCellCallback;
        drawHeader?: DrawHeaderCallback;
        prelightCells?: CellList;
        highlightRegions?: readonly Highlight[];

        // Search (Phase 9e) -- forwarded straight through to `GridHostArgs`; see that interface for
        // exact semantics. All optional: with none of them set, primary+F still opens an internal
        // search that highlights matches, because every piece of state has an uncontrolled
        // fallback. The UI is the separate, opt-in `<GlideSearchBar>` -- pass it the API object
        // from `@onReady`, or drive `@onSearchStateChange` into a UI of your own.
        showSearch?: boolean;
        searchValue?: string;
        onSearchValueChange?: (newValue: string) => void;
        onSearchClose?: () => void;
        searchResults?: CellList;
        onSearchResultsChanged?: (results: CellList, navIndex: number) => void;
        onSearchStateChange?: (state: SearchState) => void;

        // Context menus (Phase 9d). The grid ships no menu UI, only the events -- same precedent as
        // `@onHeaderMenuClick`. The browser's native menu is NOT suppressed unless you call the
        // event's `preventDefault()`.
        // Column auto-sizing (Phase 9i). Bounds for columns that omit `width`; ignored by columns
        // that declare one. Default 50 / 500, as source does.
        minColumnWidth?: number;
        maxColumnWidth?: number;

        onCellContextMenu?: (location: Item, event: ContextMenuEventArgs) => void;
        onHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;
        onGroupHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;

        // Fires when the hovered cell/header changes, and when the pointer leaves the grid
        // (`kind: "out-of-bounds"`). This is what tooltips are built on. `location` is in your
        // coordinate space -- the row-marker column is already subtracted, matching
        // `@onCellsEdited`. Emitted on *change* only, never per mousemove, so consumer work stays
        // off the pointer path. Narrow the union with the exported `headerKind` / `groupHeaderKind`
        // / `outOfBoundsKind` discriminants.
        onItemHovered?: (args: GridMouseEventArgs) => void;

        // Data / editing (Phase 9g) -- forwarded straight through to `GridHostArgs`.
        // `@coercePasteValue` runs ahead of the built-in paste rules, `@copyHeaders` prepends column
        // titles to a copy/cut, and `@onDelete` can veto or redirect a Delete/Backspace (and the
        // clearing half of a cut).

        /**
         * Reject or normalise an edit before it commits. Applies to the **overlay editor only**, on
         * its initial value and on every change, exactly as source applies it -- paste, fill, cut
         * and delete deliberately do not consult it.
         *
         * Return `false` to reject: the editor stays open and usable, but closing it commits
         * nothing. Return a `ValidatedGridCell` to coerce. `cell` is in your own coordinate space
         * (no row-marker column), matching `@onCellsEdited`.
         *
         * **Coercion behaves differently here than in React glide-data-grid, and you will notice.**
         * Source re-renders its editor from the coerced value, so the user watches the correction
         * happen as they type. This addon's editors are DOM factories (`CellEditorHandle`) with no
         * channel to push a value back in, so the coerced value is what gets **committed** while the
         * editor keeps displaying what was typed until it closes. If you need the live-correction
         * UX, do it in a custom editor rather than here. Rejection (`false`) is faithful to source.
         */
        validateCell?: ValidateCellCallback;
        coercePasteValue?: CoercePasteValueCallback;
        /**
         * Accept or refuse a paste **wholesale**, before any cell is written. `false` disables
         * pasting entirely; a callback gets the paste target in your own column space plus the
         * clipboard as raw strings, and must return `true` for the paste to go ahead.
         *
         * Orthogonal to `@coercePasteValue`, which shapes individual values once a paste is already
         * happening. Defaults to allowing the paste — see `GridHostArgs.onPaste` for the one place
         * this differs from source.
         */
        onPaste?: PasteBehavior;
        copyHeaders?: boolean;
        onDelete?: (selection: GridSelection) => boolean | GridSelection;

        // Click / activation notifications (Phase 9g). All three click callbacks fire on
        // **mouseup**, and only when it lands on the same target the mousedown did -- so beginning a
        // drag-selection is not reported as a click. Their `preventDefault()` suppresses the cell
        // renderer's own `onClick` and any activation, but **not** the selection change, which
        // already happened on mousedown (in source too). See `GridHostArgs.onCellClicked`.
        //
        // `onGroupHeaderClicked` is the exception, matching source: group headers select on mouseup,
        // after the callback, so `preventDefault()` there *does* suppress the selection.
        onCellClicked?: (cell: Item, event: CellClickedEventArgs) => void;
        onHeaderClicked?: (colIndex: number, event: HeaderClickedEventArgs) => void;
        onGroupHeaderClicked?: (colIndex: number, event: GroupHeaderClickedEventArgs) => void;
        /**
         * The user renamed a column group. **Passing this is what enables renaming** — it puts a
         * "Rename" button in every group's header, which opens an inline text box over the band.
         * Nothing is renamed for you: a group exists only because columns share a `group` string, so
         * applying it means updating those columns.
         *
         * `groupName` is the group **key** (`column.group`), not its display name — see
         * `GridHostArgs.onGroupHeaderRenamed` for why that differs from source.
         */
        onGroupHeaderRenamed?: (groupName: string, newValue: string) => void;

        // 4.4: external HTML5 drag-and-drop -- dragging data *out of* the grid and dropping data
        // *into* it. Nothing to do with `@onColumnMoved`/`@onRowMoved`, which are internal mouse
        // gestures. `@isDraggable` is what makes the surface draggable at all, and `@onDrop` is what
        // makes it a drop target; the two halves are independent.
        /**
         * Remap or switch off any keyboard gesture: `{ selectAll: false, goDownCell: "ctrl+j" }`.
         * Anything omitted keeps its default. Same string syntax as source, so a React `keybindings`
         * map transfers unchanged — see `GridHostArgs.keybindings` and `ConfigurableKeybinds`.
         */
        keybindings?: Partial<Keybinds>;
        /** `true`, or `"cell"`/`"header"` to restrict which band a drag may start from. See
         *  `GridHostArgs.isDraggable`. */
        isDraggable?: IsDraggable;
        /** Give the drag its payload with `setData(mime, payload)` — **a drag that sets none is
         *  cancelled**. `setDragImage` overrides the rendered-cell image the grid supplies. */
        onDragStart?: (args: GridDragEventArgs) => void;
        /** Fires once per new cell under the pointer, not per `dragover` event. */
        onDragOverCell?: (cell: Item, dataTransfer: DataTransfer | null) => void;
        onDragLeave?: () => void;
        /** Providing this is what lets the browser drop on the grid at all. Nothing is written for
         *  you. */
        onDrop?: (cell: Item, dataTransfer: DataTransfer | null) => void;
        onCellActivated?: (cell: Item, event: CellActivatedEventArgs) => void;
        onFinishedEditing?: (newValue: GridCell | undefined, movement: Item) => void;
        /** Tab in an editor on the last column. Setting it is what enables that gesture. Return
         *  `"left"` or a column index if the new column did not go on the end -- only
         *  `GlideDataGridApi.appendColumn` reads it. */
        onColumnAppended?: () => ColumnAppendedResult | Promise<ColumnAppendedResult> | void;
        /** When a pointer click activates a cell: `"second-click"` (default), `"single-click"` or
         *  `"double-click"`. A cell's own `activationBehaviorOverride` wins over this. */
        cellActivationBehavior?: CellActivationBehavior;

        // Editing behaviour (Phase 9g). `@editOnType` (default `true`) is what makes typing a
        // printable character over the selected cell open its editor seeded with that character;
        // `@trapFocus` (default `false`) stops an at-the-edge arrow key escaping to the next tab
        // stop; `@drawFocusRing` accepts `"no-editor"` to hide the ring only while an editor is open.
        editOnType?: boolean;
        trapFocus?: boolean;
        drawFocusRing?: boolean | "no-editor";

        // Scroll position + rem scaling (Phase 9g). Setting `@scrollOffsetX`/`@scrollOffsetY`
        // scrolls the grid; *changing* it scrolls again, and between changes the user scrolls
        // freely. `@scaleToRem` grows the grid with the root font size.
        scrollOffsetX?: number;
        scrollOffsetY?: number;
        scaleToRem?: boolean;

        /**
         * Size of the grid's container element (Phase 9g). Numbers are px, strings are used as-is
         * (`"50vh"`, `"calc(100% - 2rem)"`). Both default to `100%`, i.e. "fill whatever you are
         * put in", which is what every consumer of this addon has relied on so far.
         *
         * There is deliberately **no `@className`**: source needs one because React has no other
         * channel, whereas this component splats `...attributes`, so `<GlideDataGrid class="...">`
         * (and any other attribute) already works and is the Ember-idiomatic spelling.
         */
        width?: number | string;
        height?: number | string;
    };
}

export default class GlideDataGrid extends Component<GlideDataGridSignature> {
    // Plain (non-tracked) instance field -- deliberately not `@tracked`. Reading it must NOT be
    // an autotracking dependency of `setupGrid` below, or every `scheduleFullRedraw()`-triggering
    // rerun would also register as a change to `this.controller` and could cause redundant reruns.
    private controller: GridHostController | undefined;

    // Yielded to the default block. Both are written from callbacks that only fire *after* the
    // initial render (the modifier's setup, and user interaction respectively), so neither can
    // trigger a backtracking re-render of content that already consumed them.
    @tracked private searchApi: GlideDataGridApi | undefined;
    @tracked private searchState: SearchState | undefined;

    // 4.3: the host node for the `<:rightElement>` block. `{{in-element}}` renders the block *into*
    // it; the controller decides where in the scroller's DOM it sits.
    //
    // WHY THE NODE IS CREATED HERE AND NOT IN THE TEMPLATE. A node Glimmer itself rendered must not
    // be reparented -- Glimmer removes it on teardown through the parent it recorded at insertion
    // time, so moving it into the scroller turns teardown into a `NotFoundError`. A node Glimmer only
    // renders *into* carries no such constraint, which is precisely what `{{in-element}}` is for.
    //
    // WHY LAZILY, AND WHY THAT IS ALSO THE "IS THERE A BLOCK?" SIGNAL. `has-block` is template-only
    // -- there is no `this.hasBlock` to read from JS. But the template only reads this getter from
    // inside `{{#if (has-block "rightElement")}}`, so the node existing *is* the answer, with no
    // heuristic and no extra DOM. The getter runs during render and the controller reads
    // `buildGridHostArgs()` afterwards (modifiers install once the tree is in the DOM), so the
    // ordering is settled rather than lucky.
    private rightHostEl: HTMLElement | undefined;

    private get rightElementHost(): HTMLElement {
        // `ember/no-side-effects` guards against a getter writing *tracked* state, which invalidates
        // mid-render and causes backtracking assertions. This writes one plain, untracked field and
        // does it once: memoizing a detached DOM node so the value stays reference-stable, which
        // `GridHostArgs` requires of everything it carries. Creating it eagerly instead would make
        // the node exist for grids that pass no block, and its existence is the signal that one was.
        // eslint-disable-next-line ember/no-side-effects
        this.rightHostEl ??= document.createElement("div");
        return this.rightHostEl;
    }

    // Wraps the consumer's `@onSearchStateChange` so the yielded `searchState` stays current
    // whether or not they passed one. A stable reference, since it is a `GridHostArgs` field.
    private readonly handleSearchStateChange = (state: SearchState): void => {
        this.searchState = state;
        this.args.onSearchStateChange?.(state);
    };

    // The effective cell-renderer registry. `@cached` is load-bearing, not tidiness:
    // `getCellRenderer` is one of `computeCanBlit`'s ~18 identity-compared `DrawGridArg` fields, so
    // calling `createCombinedCellRenderer` inline in `buildGridHostArgs()` -- which runs on every
    // draw, scroll and hover pass -- would hand the render engine a fresh closure every frame and
    // silently disable the scroll blit fast path, with no error and no visual difference. This is
    // the exact defect Phase 6 found and fixed for three other fields; see PORTING-NOTES.md.
    //
    // `@cached` recomputes only when a tracked value it read changes -- here, the `@extraCells` and
    // `@getCellRenderer` args -- which is precisely the invalidation rule we want, and is why this
    // belongs on a component getter rather than in the (deliberately untracked) controller.
    @cached
    private get cellRenderer(): GetCellRendererCallback {
        const explicit = this.args.getCellRenderer;
        if (explicit !== undefined) return explicit;
        const extras = this.args.extraCells;
        if (extras === undefined || extras.length === 0) return defaultGetCellRenderer;
        return createCombinedCellRenderer(defaultGetCellRenderer, extras);
    }

    // Reads every `@arg` this component exposes and shapes them into `GridHostArgs`. Called both:
    //   (a) synchronously inside `setupGrid` below -- reading `this.args.*` here, inside that
    //       modifier's autotracking frame, is what makes Ember consider the modifier "dirty" (and
    //       therefore re-run it) whenever any of these args change later.
    //   (b) as the `getArgs` closure `GridHostController` calls fresh on every internal draw/
    //       scroll/hover pass, per its documented calling convention (never cached internally).
    private readonly buildGridHostArgs = (): GridHostArgs => ({
        columns: this.args.columns,
        getCellContent: this.args.getCellContent,
        rows: this.args.rows,
        rowHeight: this.args.rowHeight,
        headerHeight: this.args.headerHeight,
        groupHeaderHeight: this.args.groupHeaderHeight,
        theme: this.args.theme,
        freezeColumns: this.args.freezeColumns,
        verticalBorder: this.args.verticalBorder,
        resizeIndicator: this.args.resizeIndicator,
        hyperWrapping: this.args.hyperWrapping,
        getGroupDetails: this.args.getGroupDetails,
        overscrollX: this.args.overscrollX,
        overscrollY: this.args.overscrollY,
        fixedShadowX: this.args.fixedShadowX,
        fixedShadowY: this.args.fixedShadowY,
        disableMinimumCellWidth: this.args.disableMinimumCellWidth,
        renderStrategy: this.args.renderStrategy,
        enableFirefoxRescaling: this.args.enableFirefoxRescaling,
        enableSafariRescaling: this.args.enableSafariRescaling,
        strictVisibleRegion: this.args.strictVisibleRegion,
        eventTarget: this.args.eventTarget,
        // `undefined` until the template has rendered a `<:rightElement>` block -- see the getter.
        rightElement: this.rightHostEl,
        rightElementSticky: this.args.rightElementSticky,
        rightElementFill: this.args.rightElementFill,
        paddingRight: this.args.paddingRight,
        paddingBottom: this.args.paddingBottom,
        getCellRenderer: this.cellRenderer,
        headerIcons: this.args.headerIcons,
        rowMarkers: this.args.rowMarkers,
        rowMarkerWidth: this.args.rowMarkerWidth,
        rowMarkerStartIndex: this.args.rowMarkerStartIndex,
        rowMarkerTheme: this.args.rowMarkerTheme,
        rowSelect: this.args.rowSelect,
        columnSelect: this.args.columnSelect,
        rangeSelect: this.args.rangeSelect,
        rangeSelectionColumnSpanning: this.args.rangeSelectionColumnSpanning,
        rangeSelectionBlending: this.args.rangeSelectionBlending,
        columnSelectionBlending: this.args.columnSelectionBlending,
        rowSelectionBlending: this.args.rowSelectionBlending,
        rowSelectionMode: this.args.rowSelectionMode,
        columnSelectionMode: this.args.columnSelectionMode,
        selection: this.args.selection,
        onSelectionChanged: this.args.onSelectionChanged,
        onSelectionCleared: this.args.onSelectionCleared,
        onHeaderMenuClick: this.args.onHeaderMenuClick,
        onCellsEdited: this.args.onCellsEdited,
        onColumnResizeStart: this.args.onColumnResizeStart,
        onColumnResize: this.args.onColumnResize,
        onColumnResizeEnd: this.args.onColumnResizeEnd,
        onColumnProposeMove: this.args.onColumnProposeMove,
        onColumnMoved: this.args.onColumnMoved,
        onRowMoved: this.args.onRowMoved,
        fillHandle: this.args.fillHandle,
        allowedFillDirections: this.args.allowedFillDirections,
        onFillPattern: this.args.onFillPattern,
        showTrailingBlankRow: this.args.showTrailingBlankRow,
        trailingRowOptions: this.args.trailingRowOptions,
        onRowAppended: this.args.onRowAppended,
        getRowThemeOverride: this.args.getRowThemeOverride,
        onVisibleRegionChanged: this.args.onVisibleRegionChanged,
        getCellsForSelection: this.args.getCellsForSelection,
        drawCell: this.args.drawCell,
        drawHeader: this.args.drawHeader,
        prelightCells: this.args.prelightCells,
        highlightRegions: this.args.highlightRegions,
        showSearch: this.args.showSearch,
        searchValue: this.args.searchValue,
        onSearchValueChange: this.args.onSearchValueChange,
        onSearchClose: this.args.onSearchClose,
        searchResults: this.args.searchResults,
        onSearchResultsChanged: this.args.onSearchResultsChanged,
        onSearchStateChange: this.handleSearchStateChange,
        minColumnWidth: this.args.minColumnWidth,
        maxColumnWidth: this.args.maxColumnWidth,
        onCellContextMenu: this.args.onCellContextMenu,
        onHeaderContextMenu: this.args.onHeaderContextMenu,
        onGroupHeaderContextMenu: this.args.onGroupHeaderContextMenu,
        onItemHovered: this.args.onItemHovered,
        validateCell: this.args.validateCell,
        coercePasteValue: this.args.coercePasteValue,
        onPaste: this.args.onPaste,
        copyHeaders: this.args.copyHeaders,
        onDelete: this.args.onDelete,
        onCellClicked: this.args.onCellClicked,
        onHeaderClicked: this.args.onHeaderClicked,
        onGroupHeaderClicked: this.args.onGroupHeaderClicked,
        onGroupHeaderRenamed: this.args.onGroupHeaderRenamed,
        keybindings: this.args.keybindings,
        isDraggable: this.args.isDraggable,
        onDragStart: this.args.onDragStart,
        onDragOverCell: this.args.onDragOverCell,
        onDragLeave: this.args.onDragLeave,
        onDrop: this.args.onDrop,
        onCellActivated: this.args.onCellActivated,
        onFinishedEditing: this.args.onFinishedEditing,
        onColumnAppended: this.args.onColumnAppended,
        cellActivationBehavior: this.args.cellActivationBehavior,
        editOnType: this.args.editOnType,
        trapFocus: this.args.trapFocus,
        drawFocusRing: this.args.drawFocusRing,
        scrollOffsetX: this.args.scrollOffsetX,
        scrollOffsetY: this.args.scrollOffsetY,
        scaleToRem: this.args.scaleToRem,
    });

    /** Inline size for the container div (Phase 9g's `@width`/`@height`). A bare number means px;
     *  anything else is passed through verbatim. `@cached` because it is read in the template on
     *  every render and `htmlSafe` allocates. */
    @cached
    private get containerStyle(): ReturnType<typeof htmlSafe> {
        const size = (value: number | string | undefined): string => {
            if (value === undefined) return "100%";
            return typeof value === "number" ? `${value}px` : value;
        };
        // Both halves are either a number this component stringified itself or a CSS length the
        // consumer supplied for their own page -- the same trust level as any `style` attribute
        // they could set through `...attributes`.
        return htmlSafe(`width: ${size(this.args.width)}; height: ${size(this.args.height)};`);
    }

    // Installs `GridHostController` on the container div on first insert. `ember-modifier`'s
    // functional `modifier()` autotracks its whole function body: this function re-runs whenever
    // any tracked value it read on a previous run changes. `buildGridHostArgs()` below reads every
    // reactive `@arg`, so any of them changing re-runs this function -- at which point
    // `this.controller` is already set, so we just call `scheduleFullRedraw()` rather than
    // reconstructing anything.
    //
    // Deliberately does NOT return a teardown function: `ember-modifier` calls a returned teardown
    // both before every rerun AND on final element removal, with no way to distinguish the two --
    // returning `() => controller.destroy()` here would wrongly destroy the live controller on
    // every single arg change instead of just redrawing it. Final cleanup is instead wired via
    // `registerDestructor`, tied to the component's own destruction, not the modifier's rerun
    // cycle.
    private readonly setupGrid = modifier((element: HTMLDivElement) => {
        // Establishes the autotracking dependency for this modifier's rerun -- see comment above.
        const args = this.buildGridHostArgs();

        if (this.controller === undefined) {
            const controller = new GridHostController({
                root: element,
                getArgs: this.buildGridHostArgs,
            });
            this.controller = controller;
            registerDestructor(this, () => controller.destroy());
            // Built once and never rebuilt: the consumer is expected to stash this from `@onReady`,
            // and `<GlideSearchBar>` holds it across rerenders too.
            const api: GlideDataGridApi = {
                updateCells: (cells: readonly { cell: Item }[]) => controller.updateCells(cells),
                focus: () => controller.focus(),
                getBounds: (col?: number, row?: number) => controller.getBounds(col, row),
                scrollTo: (col, row, params) => controller.scrollTo(col, row, params),
                remeasureColumns: (cols: Iterable<number>) => controller.remeasureColumns(cols),
                getMouseArgsForPosition: (clientX: number, clientY: number, ev?: MouseEvent) =>
                    controller.getMouseArgsForPosition(clientX, clientY, ev),
                appendRow: (col: number, openOverlay?: boolean, behavior?: ScrollBehavior) =>
                    controller.appendRow(col, openOverlay, behavior),
                appendColumn: (row: number, openOverlay?: boolean) => controller.appendColumn(row, openOverlay),
                emit: (event: "delete") => controller.emit(event),
                openSearch: () => controller.openSearch(),
                closeSearch: () => controller.closeSearch(),
                setSearchValue: (value: string) => controller.setSearchValue(value),
                searchNext: () => controller.searchNext(),
                searchPrev: () => controller.searchPrev(),
                getSearchState: () => controller.getSearchState(),
                getRootElement: () => element,
            };
            this.searchApi = api;
            this.args.onReady?.(api);
        } else {
            void args; // already consumed for tracking; nothing else to do with it here
            this.controller.scheduleFullRedraw();
        }
    });

    <template>
        <div style={{this.containerStyle}} {{this.setupGrid}} ...attributes>
            {{yield (hash api=this.searchApi searchState=this.searchState)}}
            {{! 4.3. The block renders into a detached node the controller then places inside the
                scroller, past the last column. The in-element keyword rather than plain markup,
                because the node has to live somewhere Glimmer did not put it -- see the
                `rightElementHost` getter for why that distinction is load-bearing.

                NB: a template comment ends at the first closing double-brace, so writing a curly
                expression inside one silently truncates it and leaks the remainder as text. }}
            {{#if (has-block "rightElement")}}
                {{#in-element this.rightElementHost}}{{yield to="rightElement"}}{{/in-element}}
            {{/if}}
        </div>
    </template>
}
