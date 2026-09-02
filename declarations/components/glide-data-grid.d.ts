import Component from "@glimmer/component";
import "./glide-data-grid.css";
import "./glide-data-grid-editors.css";
import "./glide-data-grid-extra-cell-editors.css";
import { type SearchState, type ContextMenuEventArgs, type RowMarkerKind, type CellsForSelectionCallback, type TrailingRowOptions } from "../-private/grid-host-controller.ts";
export type { SearchState, ContextMenuEventArgs, RowMarkerKind, CellsForSelectionCallback, TrailingRowOptions, RowAppendedResult, ColumnAppendedResult, } from "../-private/grid-host-controller.ts";
import type { RowAppendedResult, ColumnAppendedResult } from "../-private/grid-host-controller.ts";
import type { GridColumn, GridCell, GridSelection, Item, Rectangle, Theme, GetCellRendererCallback, RowGroupingOptions, GroupDetails, SpriteMap, CustomRenderer, DrawCellCallback, DrawHeaderCallback, CellList, Highlight, FillHandleDirection, FillPatternEventArgs, GridMouseEventArgs, SelectionBlending, ValidateCellCallback, CoercePasteValueCallback, PasteBehavior, CellClickedEventArgs, HeaderClickedEventArgs, GroupHeaderClickedEventArgs, CellActivatedEventArgs, CellActivationBehavior, ScrollToParams, IsDraggable, GridDragEventArgs, Keybinds } from "../rendering/index.ts";
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
    readonly updateCells: (cells: readonly {
        cell: Item;
    }[]) => void;
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
    readonly scrollTo: (col: number, row: number, params?: ScrollToParams & {
        behavior?: ScrollBehavior;
    }) => void;
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
    readonly getMouseArgsForPosition: (clientX: number, clientY: number, ev?: MouseEvent) => GridMouseEventArgs | undefined;
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
            }
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
         * The same scroll-time downscale for Chromium browsers, capping at 1x. **Not an upstream
         * arg** — see `GridHostArgs.enableChromeRescaling` for why this port adds it and why the cap
         * is 1x rather than Safari's 2x.
         */
        enableChromeRescaling?: boolean;
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
        extraCells?: readonly CustomRenderer<any>[];
        /**
         * Extra/override header-icon glyphs (`column.icon`), merged over the built-in set. The
         * built-ins are always available, so this is only for adding custom glyphs. Read once when
         * the grid is created.
         */
        headerIcons?: SpriteMap;
        onReady?: (api: GlideDataGridApi) => void;
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
        /**
         * Click on a column header's menu chevron (`column.hasMenu === true`). `col` is in your
         * coordinate space -- the row-marker column is already subtracted. `bounds` is the
         * chevron's rect in grid-root-relative pixels. The grid ships no menu UI.
         */
        onHeaderMenuClick?: (col: number, bounds: Rectangle) => void;
        /**
         * Click on a column header's indicator icon (`column.indicatorIcon`). Same coordinate
         * space and bounds convention as `@onHeaderMenuClick`.
         */
        onHeaderIndicatorClick?: (col: number, bounds: Rectangle) => void;
        onCellsEdited?: (edits: readonly {
            location: Item;
            value: GridCell;
        }[]) => void;
        onColumnResizeStart?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnResize?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnResizeEnd?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
        onColumnProposeMove?: (startIndex: number, endIndex: number) => boolean;
        onColumnMoved?: (startIndex: number, endIndex: number) => void;
        onRowMoved?: (startIndex: number, endIndex: number) => void;
        fillHandle?: boolean;
        allowedFillDirections?: FillHandleDirection;
        onFillPattern?: (event: FillPatternEventArgs) => void;
        showTrailingBlankRow?: boolean;
        /** Tint / hint text / "+" icon for that row (Phase 9g). Cosmetic only; see
         *  `TrailingRowOptions` for the two of source's fields this port deliberately omits. */
        trailingRowOptions?: TrailingRowOptions;
        /** Return `"top"` or a row index if the new row did not go on the end -- only
         *  `GlideDataGridApi.appendRow` reads it, and returning nothing is fine. */
        onRowAppended?: () => RowAppendedResult | Promise<RowAppendedResult> | void;
        getRowThemeOverride?: (row: number, groupIndex: number, contentIndex: number) => Partial<Theme> | undefined;
        rowGrouping?: RowGroupingOptions;
        onVisibleRegionChanged?: (region: Rectangle) => void;
        /**
         * Read a whole rectangle of cells at once instead of one at a time. Pass `true` for the
         * common in-memory case (the grid synthesises one from `@getCellContent`), or a function
         * when a bulk fetch is cheaper or cells outside the rendered window aren't in memory.
         * See `GridHostArgs.getCellsForSelection` — in particular, the async thunk form is
         * deliberately not used by copy.
         */
        getCellsForSelection?: CellsForSelectionCallback | true;
        drawCell?: DrawCellCallback;
        drawHeader?: DrawHeaderCallback;
        prelightCells?: CellList;
        highlightRegions?: readonly Highlight[];
        showSearch?: boolean;
        searchValue?: string;
        onSearchValueChange?: (newValue: string) => void;
        onSearchClose?: () => void;
        searchResults?: CellList;
        onSearchResultsChanged?: (results: CellList, navIndex: number) => void;
        onSearchStateChange?: (state: SearchState) => void;
        minColumnWidth?: number;
        maxColumnWidth?: number;
        onCellContextMenu?: (location: Item, event: ContextMenuEventArgs) => void;
        onHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;
        onGroupHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;
        onItemHovered?: (args: GridMouseEventArgs) => void;
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
        editOnType?: boolean;
        trapFocus?: boolean;
        drawFocusRing?: boolean | "no-editor";
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
    private controller;
    private searchApi;
    private searchState;
    private rightHostEl;
    private get rightElementHost();
    private readonly handleSearchStateChange;
    private get cellRenderer();
    private readonly buildGridHostArgs;
    /** Inline size for the container div (Phase 9g's `@width`/`@height`). A bare number means px;
     *  anything else is passed through verbatim. `@cached` because it is read in the template on
     *  every render and `htmlSafe` allocates. */
    private get containerStyle();
    private readonly setupGrid;
}
//# sourceMappingURL=glide-data-grid.d.ts.map