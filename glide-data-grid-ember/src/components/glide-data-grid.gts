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
import { registerDestructor } from "@ember/destroyable";
import { modifier } from "ember-modifier";
import {
    GridHostController,
    type GridHostArgs,
    type SearchState,
    type ContextMenuEventArgs,
    type RowMarkerKind,
    type CellsForSelectionCallback,
} from "../-private/grid-host-controller.ts";

// Part of this component's public contract (`@onSearchStateChange`, `@rowMarkers`,
// `@getCellsForSelection`), so re-exported here rather than making consumers import from
// `-private/`.
export type {
    SearchState,
    ContextMenuEventArgs,
    RowMarkerKind,
    CellsForSelectionCallback,
} from "../-private/grid-host-controller.ts";

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
    SpriteMap,
    CustomRenderer,
    DrawCellCallback,
    DrawHeaderCallback,
    CellList,
    Highlight,
    FillHandleDirection,
    FillPatternEventArgs,
} from "../rendering/index.ts";

/** Shape handed to `@onReady` once the underlying `GridHostController` exists. */
export interface GlideDataGridApi {
    readonly updateCells: (cells: readonly { cell: Item }[]) => void;

    // Search (Phase 9e). These are what `<GlideSearchBar>` drives; a consumer building their own
    // search UI uses the same five methods. Note the API object stays a plain bag of bound methods
    // -- 9f flags that this shape gets awkward as it grows, and that decision is still open.
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
        rowSelect?: "none" | "single" | "multi";
        columnSelect?: "none" | "single" | "multi";
        rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
        rangeSelectionColumnSpanning?: boolean;
        onSelectionChanged?: (selection: GridSelection) => void;
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
        onRowAppended?: () => void;

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
        getCellRenderer: this.cellRenderer,
        headerIcons: this.args.headerIcons,
        rowMarkers: this.args.rowMarkers,
        rowMarkerWidth: this.args.rowMarkerWidth,
        rowSelect: this.args.rowSelect,
        columnSelect: this.args.columnSelect,
        rangeSelect: this.args.rangeSelect,
        rangeSelectionColumnSpanning: this.args.rangeSelectionColumnSpanning,
        onSelectionChanged: this.args.onSelectionChanged,
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
    });

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
            const api: GlideDataGridApi = {
                updateCells: (cells: readonly { cell: Item }[]) => controller.updateCells(cells),
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
        <div style="width: 100%; height: 100%;" {{this.setupGrid}} ...attributes>
            {{yield (hash api=this.searchApi searchState=this.searchState)}}
        </div>
    </template>
}
