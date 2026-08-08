// Demo-app backing component for the `<GlideDataGrid>` smoke-test route.
//
// Holds `@tracked columns` so resize/reorder round-trip visually -- `GridHostController` never
// mutates column state itself (documented "consumer owns the data" contract in
// `grid-host-controller.ts`), so a real consumer needs exactly this kind of tracked-state +
// handler wiring to make resize/reorder actually stick. `ember-route-template`'s `Route(<template>)`
// pattern (used in `application.gts`) has no backing class, hence this separate component.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { htmlSafe } from "@ember/template";
import GlideDataGrid, {
    type GlideDataGridApi,
    type ContextMenuEventArgs,
} from "glide-data-grid-ember/components/glide-data-grid";
import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";
import type { SearchState } from "glide-data-grid-ember/components/glide-search-bar";
import { demoColumns, demoGetCellContent, demoGetRowThemeOverride, DEMO_ROW_COUNT } from "test-app/utils/demo-data";
import { formatSearchStatus } from "glide-data-grid-ember/rendering/index";
import { cached } from "@glimmer/tracking";
import {
    allExtraCells,
    getDataEditorDarkTheme,
    type GridColumn,
    type GridCell,
    type Item,
    type Theme,
    type CellList,
    type DrawCellCallback,
    type DrawHeaderCallback,
    type Highlight,
} from "glide-data-grid-ember/rendering/index";

// Phase 9: `@extraCells` replaces this demo's old hand-built `createCombinedCellRenderer(...)`
// call. The grid now combines Phase 5's `CustomRenderer` cells (sparkline/star/range/...) with the
// Phase 4 built-in registry itself, behind a `@cached` getter that keeps the resulting
// `getCellRenderer` reference-stable for the scroll blit fast path. `allExtraCells` is a
// module-scope constant, which is the stable reference that arg wants.

// --- Phase 9: consumer draw hooks (`@drawCell` / `@drawHeader` / `@prelightCells` /
// `@highlightRegions`) -------------------------------------------------------------------------
// All four are `DrawGridArg` fields the render engine has supported since Phase 1 but which the
// controller hardcoded to `undefined` until Phase 9. This demo exists to prove they are actually
// reachable from a consumer -- toggled, so the difference is visible rather than asserted.
//
// Both callbacks are module-scope constants on purpose: a fresh arrow per render is the exact shape
// that silently broke the blit path in Phase 6.
const drawCellHook: DrawCellCallback = (args, drawContent) => {
    drawContent();
    const { ctx, rect, col, row } = args;
    if ((col + row) % 7 !== 0) return;
    ctx.save();
    ctx.fillStyle = "#e5484d";
    ctx.beginPath();
    ctx.arc(rect.x + rect.width - 8, rect.y + 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

const drawHeaderHook: DrawHeaderCallback = (args, drawContent) => {
    drawContent();
    const { ctx, rect, columnIndex } = args;
    if (columnIndex % 3 !== 0) return;
    ctx.save();
    ctx.fillStyle = "#0090ff";
    ctx.fillRect(rect.x, rect.y + rect.height - 3, rect.width, 3);
    ctx.restore();
};

// `Highlight`/`CellList` values must be reference-stable across draws -- `computeCanBlit`
// identity-compares both. Frozen module-scope constants, swapped in wholesale by the toggle.
const DEMO_HIGHLIGHT_REGIONS: readonly Highlight[] = [
    { color: "#4f9ffb33", range: { x: 1, y: 2, width: 3, height: 4 } },
];
const DEMO_PRELIGHT_CELLS: CellList = [
    [1, 8],
    [2, 8],
    [3, 8],
];

// Phase 6: the stock dark theme, resolved once at module scope. `getDataEditorDarkTheme()` returns
// a `Partial<Theme>` overlay meant to be layered over the base theme -- passing it as `@theme` is
// exactly that (the grid does `mergeAndRealizeTheme(getDataEditorTheme(), @theme)` internally).
const DARK_THEME: Partial<Theme> = getDataEditorDarkTheme();

export default class DemoGrid extends Component {
    @tracked columns: readonly GridColumn[] = demoColumns;
    // Phase 4a: cell edits (from the overlay editor / boolean toggle / delete) land here rather
    // than mutating `demoGetCellContent`'s output directly -- `GridHostController` never owns cell
    // data itself (same "consumer owns the data" contract as columns above), so a real consumer
    // needs exactly this kind of override-map + `onCellsEdited` handler to make edits stick.
    @tracked edits: ReadonlyMap<string, GridCell> = new Map();
    // Phase 4d: `@tracked` (not a plain field like the rest of this demo's row count used to be) --
    // `onRowAppended` increments this, and the grid needs to actually re-render with the new row
    // count for the trailing-blank-row "add row" affordance to visibly do anything.
    @tracked rows = DEMO_ROW_COUNT;

    // Phase 6: light/dark toggle. `undefined` = no global overlay, i.e. the stock light theme.
    @tracked isDark = false;

    // Phase 9: draw-hooks toggle (see the module-scope hooks above).
    @tracked showDrawHooks = false;

    get drawCell(): DrawCellCallback | undefined {
        return this.showDrawHooks ? drawCellHook : undefined;
    }

    get drawHeader(): DrawHeaderCallback | undefined {
        return this.showDrawHooks ? drawHeaderHook : undefined;
    }

    // `@cached` isn't strictly needed while these return frozen module-scope constants, but it is
    // the pattern a real consumer building regions from tracked state must use -- an ordinary getter
    // that allocates would return a fresh array on every draw and kill the blit path.
    @cached
    get highlightRegions(): readonly Highlight[] | undefined {
        return this.showDrawHooks ? DEMO_HIGHLIGHT_REGIONS : undefined;
    }

    @cached
    get prelightCells(): CellList | undefined {
        return this.showDrawHooks ? DEMO_PRELIGHT_CELLS : undefined;
    }

    // --- Phase 9e: search, demonstrated BOTH ways -------------------------------------------------
    // The grid owns the engine; a UI is just something that calls `setSearchValue`/`searchNext`/
    // `searchPrev` on the API and renders from the state snapshot. This demo shows the two supported
    // shapes at once, deliberately, so the difference is visible rather than described:
    //
    //   1. `<GlideSearchBar>` -- the addon's opt-in bar. Floats over the grid at its top-right,
    //      hidden until Cmd/Ctrl+F opens it. Zero UI code here.
    //   2. A plain `<input>` in this component's own toolbar -- always visible, styled by the app,
    //      living entirely outside the grid's DOM.
    //
    // Both drive the *same* engine, so typing in either updates the other: both render their value
    // from the same `searchState`. That is the point of showing them together.
    //
    // The external input needs `@showSearch={{true}}`, because result highlighting is gated on
    // search being open -- otherwise it would set the query and nothing would light up. Passing that
    // arg also takes control of visibility, so Escape and Cmd/Ctrl+F can no longer close search
    // while external mode is on, and `<GlideSearchBar>` is therefore pinned open too.
    @tracked gridApi: GlideDataGridApi | undefined;
    @tracked searchState: SearchState | undefined;
    @tracked useExternalSearch = false;

    /** `true` pins search open for the external input; `undefined` leaves the grid uncontrolled,
     *  so Cmd/Ctrl+F toggles `<GlideSearchBar>` as normal. */
    get showSearch(): boolean | undefined {
        return this.useExternalSearch ? true : undefined;
    }

    get searchValue(): string {
        return this.searchState?.value ?? "";
    }

    get hasSearchResults(): boolean {
        return (this.searchState?.results.length ?? 0) > 0;
    }

    /** Source's exact wording, reused from the addon so the two UIs read identically. */
    get searchStatusText(): string {
        const state = this.searchState;
        if (state?.status === undefined) return "Type to search";
        return formatSearchStatus(state.status, state.selectedIndex);
    }

    @action
    toggleExternalSearch(): void {
        this.useExternalSearch = !this.useExternalSearch;
        // Leaving a stale query behind when switching modes just looks broken.
        this.gridApi?.setSearchValue("");
    }

    // --- Phase 9d: context menus ------------------------------------------------------------------
    // The addon fires the event and hands over the geometry; the menu itself is consumer chrome,
    // exactly like the sort menu in `glide-demo.gts`. All three targets are wired so the demo
    // proves each one is reachable, including the group header -- which only exists on grids that
    // set `column.group`, so this demo shows the cell/header pair and `<GlideDemo>` is where a
    // grouped grid lives.
    @tracked contextMenu: { x: number; y: number; label: string } | undefined;

    private openContextMenu(label: string, event: ContextMenuEventArgs): void {
        // Suppressing the browser menu is opt-in -- the addon deliberately does not do it for you.
        event.preventDefault();
        this.contextMenu = { x: event.clientX, y: event.clientY, label };
    }

    @action
    handleCellContextMenu(location: Item, event: ContextMenuEventArgs): void {
        this.openContextMenu(`Cell ${location[0]}, ${location[1]}`, event);
    }

    @action
    handleHeaderContextMenu(col: number, event: ContextMenuEventArgs): void {
        this.openContextMenu(`Column ${col} header`, event);
    }

    @action
    handleGroupHeaderContextMenu(col: number, event: ContextMenuEventArgs): void {
        this.openContextMenu(`Group header over column ${col}`, event);
    }

    @action
    closeContextMenu(): void {
        this.contextMenu = undefined;
    }

    /** `position: fixed` off the event's viewport coordinates. `htmlSafe` over two numbers this
     *  component produced itself -- no external input reaches it. */
    get contextMenuStyle(): ReturnType<typeof htmlSafe> {
        const menu = this.contextMenu;
        if (menu === undefined) return htmlSafe("");
        return htmlSafe(`position: fixed; left: ${menu.x}px; top: ${menu.y}px;`);
    }

    @action
    handleExternalSearchInput(ev: Event): void {
        this.gridApi?.setSearchValue((ev.target as HTMLInputElement).value);
    }

    @action
    searchNext(): void {
        this.gridApi?.searchNext();
    }

    @action
    searchPrev(): void {
        this.gridApi?.searchPrev();
    }

    @action
    handleReady(api: GlideDataGridApi): void {
        this.gridApi = api;
    }

    @action
    handleSearchStateChange(state: SearchState): void {
        this.searchState = state;
    }

    @action
    toggleDrawHooks(): void {
        this.showDrawHooks = !this.showDrawHooks;
    }

    get theme(): Partial<Theme> | undefined {
        return this.isDark ? DARK_THEME : undefined;
    }

    // Deliberately a plain module-scope function reference (not a getter returning a fresh arrow):
    // the render engine compares `getRowThemeOverride` by identity for its blit/scroll fast path.
    readonly getRowThemeOverride = demoGetRowThemeOverride;

    @action
    toggleTheme(): void {
        this.isDark = !this.isDark;
    }

    getCellContent = (item: Item): GridCell => {
        return this.edits.get(`${item[0]},${item[1]}`) ?? demoGetCellContent(item);
    };

    @action
    handleColumnResize(_column: GridColumn, newSize: number, colIndex: number): void {
        this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
    }

    @action
    handleColumnMoved(startIndex: number, endIndex: number): void {
        const cols = [...this.columns];
        const [moved] = cols.splice(startIndex, 1);
        if (moved === undefined) return;
        cols.splice(endIndex, 0, moved);
        this.columns = cols;
    }

    @action
    handleCellsEdited(edits: readonly { location: Item; value: GridCell }[]): void {
        const next = new Map(this.edits);
        for (const edit of edits) next.set(`${edit.location[0]},${edit.location[1]}`, edit.value);
        this.edits = next;
    }

    // Phase 4d: `demoGetCellContent` is a pure function of `[col, row]` (no upper bound baked in),
    // so simply widening `rows` is enough for the newly-appended row to render real (generated)
    // content immediately -- no separate "seed the new row's data" step needed for this demo.
    @action
    handleRowAppended(): void {
        this.rows = this.rows + 1;
    }

    <template>
        <div style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
            <div style="flex: 0 0 auto;">
                <button type="button" data-test-theme-toggle {{on "click" this.toggleTheme}}>
                    {{if this.isDark "Switch to light theme" "Switch to dark theme"}}
                </button>
                <button type="button" data-test-draw-hooks-toggle {{on "click" this.toggleDrawHooks}}>
                    {{if this.showDrawHooks "Hide draw hooks" "Show draw hooks"}}
                </button>
                <button type="button" data-test-external-search-toggle {{on "click" this.toggleExternalSearch}}>
                    {{if this.useExternalSearch "Hide external search input" "Show external search input"}}
                </button>
            </div>

            {{#if this.useExternalSearch}}
                {{! UI #2: an ordinary app-owned input, outside the grid entirely. Note there is no
                    addon component here at all -- just `setSearchValue` and the state snapshot. }}
                <div
                    style="flex: 0 0 auto; display: flex; align-items: center; gap: 8px;"
                    data-test-external-search
                >
                    <label for="external-search">Search (app-owned input):</label>
                    <input
                        id="external-search"
                        type="text"
                        placeholder="Try &quot;Row note&quot; or &quot;items/4&quot;"
                        value={{this.searchValue}}
                        style="width: 260px;"
                        {{on "input" this.handleExternalSearchInput}}
                    />
                    <button type="button" disabled={{unless this.hasSearchResults "disabled"}} {{on "click" this.searchPrev}}>
                        Prev
                    </button>
                    <button type="button" disabled={{unless this.hasSearchResults "disabled"}} {{on "click" this.searchNext}}>
                        Next
                    </button>
                    <span data-test-external-search-status>{{this.searchStatusText}}</span>
                </div>
            {{/if}}
            <div style="flex: 1 1 auto; min-height: 0;">
                <GlideDataGrid
                    @columns={{this.columns}}
                    @getCellContent={{this.getCellContent}}
                    @extraCells={{allExtraCells}}
                    @rows={{this.rows}}
                    @theme={{this.theme}}
                    @getRowThemeOverride={{this.getRowThemeOverride}}
                    @onColumnResize={{this.handleColumnResize}}
                    @onColumnMoved={{this.handleColumnMoved}}
                    @onCellsEdited={{this.handleCellsEdited}}
                    @showTrailingBlankRow={{true}}
                    @onRowAppended={{this.handleRowAppended}}
                    @drawCell={{this.drawCell}}
                    @drawHeader={{this.drawHeader}}
                    @prelightCells={{this.prelightCells}}
                    @highlightRegions={{this.highlightRegions}}
                    @showSearch={{this.showSearch}}
                    @onReady={{this.handleReady}}
                    @onSearchStateChange={{this.handleSearchStateChange}}
                    @onCellContextMenu={{this.handleCellContextMenu}}
                    @onHeaderContextMenu={{this.handleHeaderContextMenu}}
                    @onGroupHeaderContextMenu={{this.handleGroupHeaderContextMenu}}
                    {{! UI #1: the addon's own bar. The block renders inside the grid's own root,
                        which is where its `.gdg-root`-scoped CSS and `--gdg-*` theme variables live.
                        Both values come from the block, so no `@onReady` plumbing is needed for it. }}
                    as |grid|
                >
                    <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
                </GlideDataGrid>
            </div>

            {{#if this.contextMenu}}
                {{! Consumer-owned chrome, positioned from the event's viewport coordinates. }}
                <div
                    class="gdg-demo-sort-menu"
                    role="menu"
                    data-test-context-menu
                    style={{this.contextMenuStyle}}
                >
                    <div class="gdg-demo-sort-menu__title">{{this.contextMenu.label}}</div>
                    <button
                        type="button"
                        class="gdg-demo-sort-menu__item"
                        {{on "click" this.closeContextMenu}}
                    >Close</button>
                </div>
            {{/if}}
        </div>
    </template>
}
