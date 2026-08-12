// Phase 10a: **the fully-featured reference grid.** This demo's job is coverage -- every arg
// `<GlideDataGrid>` ships is switched on here, with a toggle wherever two settings are mutually
// exclusive.
//
// That is not tidiness. This project's most expensive recurring lesson is that *a feature no demo
// has ever switched on is effectively unverified code, however many phases have been
// "browser-verified"*: turning row markers, column groups and header icons on for the first time in
// Phase 7 surfaced five latent defects at once, and Phase 9h found two more the moment row markers
// and `@highlightRegions` were finally enabled together. The toggle row below is part of the
// deliverable -- it is what makes a regression visible without reading code.
//
// The other demos are NOT redundant with this one and must not be deleted: `<StreamingDemo>` proves
// the damage path under load, `<ScaleProof>` the 1,000-row incremental projection, `<AsyncDemo>`
// paging, `<TrackingDemo>` autotracking, `<DaisyDemo>` live theme switching, `<GlideDemo>` the
// grid.glideapps.com replica. This one covers *args*; those cover *behaviours under load*.
//
// It is also the source COOKBOOK.md's recipes are lifted from, which is the cheapest way to keep
// that document true -- if a recipe stops working, this demo stops working.
//
// Holds `@tracked columns` so resize/reorder round-trip visually -- `GridHostController` never
// mutates column state itself (documented "consumer owns the data" contract in
// `grid-host-controller.ts`), so a real consumer needs exactly this kind of tracked-state +
// handler wiring to make resize/reorder actually stick. The route-template pattern
// pattern (used in `application.gts`) has no backing class, hence this separate component.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { htmlSafe } from "@ember/template";
import GlideDataGrid, {
    type GlideDataGridApi,
    type ContextMenuEventArgs,
    type RowMarkerKind,
    type TrailingRowOptions,
} from "glide-data-grid-ember/components/glide-data-grid";
import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";
import type { SearchState } from "glide-data-grid-ember/components/glide-search-bar";
import {
    demoColumns,
    demoColumnNote,
    demoGetCellContent,
    demoGetRowThemeOverride,
    normalizeEditedCell,
    setDemoActivityListener,
    DEMO_ROW_COUNT,
} from "test-app/utils/demo-data";
import {
    formatSearchStatus,
    headerKind,
    groupHeaderKind,
    outOfBoundsKind,
} from "glide-data-grid-ember/rendering/index";
import { cached } from "@glimmer/tracking";
import {
    allExtraCells,
    CompactSelection,
    getDataEditorDarkTheme,
    GridCellKind,
    isSizedGridColumn,
    type AutoGridColumn,
    type SizedGridColumn,
    type GridColumn,
    type GridCell,
    type Item,
    type Rectangle,
    type Theme,
    type CellList,
    type DrawCellCallback,
    type DrawHeaderCallback,
    type FillHandleDirection,
    type FillPatternEventArgs,
    type GridSelection,
    type Highlight,
    type SpriteMap,
    type GridMouseEventArgs,
    type SelectionBlending,
    type ValidateCellCallback,
    type CoercePasteValueCallback,
    type PasteBehavior,
    type CellActivatedEventArgs,
    type CellActivationBehavior,
    type GroupHeaderClickedEventArgs,
    type GroupDetails,
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
const DEMO_VERTICAL_BORDER = (col: number): boolean => col % 2 === 0;

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

// --- Phase 10a: column groups, header icons, and one deliberately auto-sized column ------------
//
// `demoColumns` owns each column's title, width and icon -- those are properties of the column, so
// `<DaisyDemo>` reuses them for free. What this demo adds on top is *presentation for this demo*:
// group headings, `hasMenu`, one deliberately auto-sized column, and a custom header glyph.
//
// Groups are what make `@onGroupHeaderContextMenu` reachable at all (no groups, no group header to
// right-click), and header icons were dead code for six phases because nothing ever set
// `column.icon`.
const COLUMN_GROUPS = ["Identity", "Content", "Media", "Signals", "Records"] as const;

// 4.2: what each group's header strip shows, beyond its name. `getGroupDetails` was hardcoded to
// `name => ({ name })` from Phase 7b until 4.2, so **the icon, per-group theme and action paths in
// `drawGroups` had never once run** even though the render engine has consumed all three since
// Phase 1 -- the same dormant-feature shape as `column.icon` and `grow` before it.
//
// One group gets a theme override and one gets two actions, so a single glance covers: icon-only,
// theme-only, actions, and (for the ungrouped tail columns) no details at all.
const GROUP_ICONS: Readonly<Record<string, string>> = {
    Identity: "headerRowID",
    Content: "headerString",
    Media: "headerImage",
    Signals: "headerMath",
    Records: "headerArray",
};
/** The group whose strip is re-themed, to prove `overrideTheme` merges over the grid theme. */
const THEMED_GROUP = "Media";
/** The group carrying action icons. Two of them, so their left-to-right order is checkable. */
const ACTION_GROUP = "Signals";

// A custom glyph merged **over** the built-in set via `@headerIcons`. The built-ins are always
// present, so this is only needed to add a glyph of your own or restyle a stock one. The `fg`/`bg`
// placeholders are substituted by the addon's `SpriteManager` from the current theme, which is why
// a custom icon themes itself for free.
const CUSTOM_HEADER_ICONS: SpriteMap = {
    demoStar: p =>
        `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="16" height="16" rx="4" fill="${p.bgColor}" />
            <path d="M10 5.5l1.6 3.2 3.4.5-2.5 2.4.6 3.4-3.1-1.6-3.1 1.6.6-3.4L5 9.2l3.4-.5L10 5.5z"
                  fill="${p.fgColor}" />
        </svg>`,
};

/** Which column-group heading a column belongs to. Only the first 16 columns are grouped; the rest
 *  are deliberately left ungrouped so the "some columns have no group" rendering path runs too. */
function groupFor(index: number): string | undefined {
    if (index >= 16) return undefined;
    return COLUMN_GROUPS[Math.floor(index / 4)] ?? undefined;
}

// The one auto-sized column. Omitting `width` makes a column an `AutoGridColumn`, which the addon
// measures from its content (Phase 9i) instead of falling back to a fixed default.
//
// Column 3 is chosen deliberately: it is the Profile uri column, whose values
// are far wider than its nominal fixed width, so a working measurement is obvious at a glance -- the
// column comes out visibly wider than its neighbours and is then clamped by `@maxColumnWidth`. Pick a
// `Custom` cell instead and you get the flat `DEFAULT_COLUMN_WIDTH` fallback, because auto-sizing
// works through each renderer's own `measure()` and most custom renderers don't have one.
const AUTO_SIZED_COLUMN = 3;

// N1: the two columns that share leftover container width. `grow` is orthogonal to `width` -- these
// keep their fixed widths as a *floor* and split whatever space is left over 2:1, so widening the
// window widens column 1 twice as fast as column 2. Nothing demoed `grow` before, which is precisely
// how it stayed dead: the type field existed and `growOffset` was read in three resize callbacks,
// but no code ever computed it, so setting `grow` did nothing and said nothing.
const GROW_COLUMNS: Readonly<Record<number, number>> = { 1: 2, 2: 1 };

function buildDemoColumns(): readonly GridColumn[] {
    return demoColumns.map((column, i) => {
        const common = {
            id: column.id ?? `col-${i}`,
            title: column.title,
            group: groupFor(i),
            themeOverride: column.themeOverride,
            // `hasMenu` is what draws the chevron and makes `@onHeaderMenuClick` fire. The menu UI
            // itself is consumer chrome -- the addon ships none, by design.
            hasMenu: true,
            // Every column's own `icon` comes from `demo-data.ts`; column 0 is overridden with
            // the custom glyph below purely to prove `@headerIcons` merges over the built-in set.
            icon: i === 0 ? "demoStar" : column.icon,
            ...(GROW_COLUMNS[i] === undefined ? {} : { grow: GROW_COLUMNS[i] }),
        };
        // The distinction is exactly this: a column WITH `width` is a `SizedGridColumn`, one
        // WITHOUT is an `AutoGridColumn` that the grid measures. There is no `width: "auto"`.
        if (i === AUTO_SIZED_COLUMN) return common satisfies AutoGridColumn;
        return { ...common, width: isSizedGridColumn(column) ? column.width : 120 } satisfies SizedGridColumn;
    });
}

/** Maps a displayed demo column back to the natural index used by `demoGetCellContent`. */
function naturalDemoColumnIndex(column: GridColumn | undefined, fallback: number): number {
    const id = column?.id;
    if (id === undefined) return fallback;
    const natural = demoColumns.findIndex(candidate => candidate.id === id);
    return natural === -1 ? fallback : natural;
}

// Cycled by the "Row markers" control. `"none"` is included on purpose: it is the default, and it
// is the setting that turns row reordering off (there is nothing left to grab).
const ROW_MARKER_KINDS: readonly RowMarkerKind[] = ["both", "checkbox", "number", "clickable-number", "none"];
const RANGE_SELECT_MODES = ["rect", "multi-rect", "cell", "multi-cell", "none"] as const;
const FILL_DIRECTIONS: readonly FillHandleDirection[] = ["orthogonal", "vertical", "horizontal", "any"];

// 9g. All three blending args are cycled together, because the interesting thing to see is whether
// a cell selection and a row/column selection can coexist at all -- and that needs the range side
// and the row/column side to agree. `"exclusive"` is source's default (and this port's old
// hardcoded value), `"mixed"` co-selects while Ctrl/Cmd is held, `"additive"` always co-selects.
const SELECTION_BLENDINGS: readonly SelectionBlending[] = ["exclusive", "mixed", "additive"];
// `"no-editor"` is the value worth having a demo for: the ring is drawn normally, and vanishes for
// as long as an overlay editor is open over the cell.
const FOCUS_RING_MODES: readonly (boolean | "no-editor")[] = [true, "no-editor", false];

// 9g: `onDelete`'s three return shapes, one per cycle position -- `undefined` (no callback at all),
// `false` (veto) and a replacement `GridSelection` (delete something else instead).
const DELETE_MODES = ["normal", "veto", "whole-column"] as const;

// 4.5: `@renderStrategy`. `"default"` means passing nothing, i.e. letting the grid derive it from
// the browser -- which is what every consumer should do.
const RENDER_STRATEGIES = ["default", "single-buffer", "double-buffer", "direct"] as const;

// 4.5: `@disableMinimumCellWidth`. Three states because the flag alone is invisible -- see
// `effectiveColumns`.
const HAIRLINE_MODES = ["off", "8px, floor 10", "8px, floor 1"] as const;

// 4.5: `@onPaste`'s three shapes. `"single-cell"` is the callback form refusing anything wider than
// one cell, which is the realistic use — a consumer whose backend writes one field at a time.
const PASTE_MODES = ["allow", "single-cell", "off"] as const;

// 9g. Only `"second-click"` existed before -- `"single-click"` opens the editor on the very first
// click, `"double-click"` needs a real double-click on the already-selected cell.
const ACTIVATION_BEHAVIORS: readonly CellActivationBehavior[] = ["second-click", "single-click", "double-click"];

// 9g. Frozen module-scope constants because both land somewhere the grid identity-compares:
// `rowMarkerTheme` becomes the marker column's `themeOverride` (columns feed `computeCanBlit`), and
// `trailingRowOptions` is part of the mangled-cell-content cache key.
const ROW_MARKER_THEME: Partial<Theme> = { bgCell: "#eef4ff", textDark: "#0d5bd1" };
// `targetColumn` (9f) says which column's editor opens in the newly-appended row, whichever column
// was clicked. Column 1 is the Name column, which is the one you actually want to type into --
// clicking the trailing row under "Avatar" and landing in an image editor is the case this exists
// for. It only means anything now that `appendRow`'s focus flow exists; it was deferred in 9g
// precisely because without it the option would have compiled and done nothing.
const PLAIN_TRAILING_ROW: TrailingRowOptions = { hint: "Add row", targetColumn: 1 };
const TINTED_TRAILING_ROW: TrailingRowOptions = {
    hint: "Add row",
    tint: true,
    addIcon: "headerRowID",
    targetColumn: 1,
};

export default class DemoGrid extends Component {
    constructor(...args: ConstructorParameters<typeof Component>) {
        super(...args);
        // Cell-carried callbacks (`ButtonCell.onClick`, `UriCell.onClickUri`, `LinksCell`'s
        // per-link `onClick`) are the only way those three cell kinds do anything, and they are
        // built inside `demoGetCellContent`, a module-scope pure function of `[col, row]` with no
        // route to this component. `setDemoActivityListener` is that route -- see `demo-data.ts`.
        setDemoActivityListener(message => {
            this.lastActivity = message;
        });
    }

    willDestroy(): void {
        super.willDestroy();
        setDemoActivityListener(undefined);
    }

    /** Whatever a cell-carried callback last reported. Arrow field, not `@action`: Ember 6 idiom,
     *  and identity-stable, which every arg the grid identity-compares wants anyway. */
    @tracked lastActivity: string | undefined;

    @tracked columns: readonly GridColumn[] = buildDemoColumns();
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

    /** Drives `handleGroupHeaderClicked`'s `preventDefault()`. See that method. */
    @tracked suppressGroupHeaderSelect = false;

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

    toggleExternalSearch = (): void => {
        this.useExternalSearch = !this.useExternalSearch;
        // Leaving a stale query behind when switching modes just looks broken.
        this.gridApi?.setSearchValue("");
    };

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

    handleCellContextMenu = (location: Item, event: ContextMenuEventArgs): void => {
        this.openContextMenu(`Cell ${location[0]}, ${location[1]}`, event);
    };

    handleHeaderContextMenu = (col: number, event: ContextMenuEventArgs): void => {
        this.openContextMenu(`Column ${col} header`, event);
    };

    handleGroupHeaderContextMenu = (col: number, event: ContextMenuEventArgs): void => {
        this.openContextMenu(`Group header over column ${col}`, event);
    };

    closeContextMenu = (): void => {
        this.contextMenu = undefined;
    };

    /** `position: fixed` off the event's viewport coordinates. `htmlSafe` over two numbers this
     *  component produced itself -- no external input reaches it. */
    get contextMenuStyle(): ReturnType<typeof htmlSafe> {
        const menu = this.contextMenu;
        if (menu === undefined) return htmlSafe("");
        return htmlSafe(`position: fixed; left: ${menu.x}px; top: ${menu.y}px;`);
    }

    handleExternalSearchInput = (ev: Event): void => {
        this.gridApi?.setSearchValue((ev.target as HTMLInputElement).value);
    };

    searchNext = (): void => {
        this.gridApi?.searchNext();
    };

    searchPrev = (): void => {
        this.gridApi?.searchPrev();
    };

    handleReady = (api: GlideDataGridApi): void => {
        this.gridApi = api;
    };

    handleSearchStateChange = (state: SearchState): void => {
        this.searchState = state;
    };

    toggleDrawHooks = (): void => {
        this.showDrawHooks = !this.showDrawHooks;
    };

    get theme(): Partial<Theme> | undefined {
        return this.isDark ? DARK_THEME : undefined;
    }

    // Deliberately a plain module-scope function reference (not a getter returning a fresh arrow):
    // the render engine compares `getRowThemeOverride` by identity for its blit/scroll fast path.
    readonly getRowThemeOverride = demoGetRowThemeOverride;

    // `@headerIcons` is read once, when the grid's `SpriteManager` is built -- changing it later has
    // no effect -- so a module-scope constant is both sufficient and correct.
    readonly headerIcons = CUSTOM_HEADER_ICONS;

    /** Cosmetic: the search shortcut is Cmd+F on macOS and Ctrl+F elsewhere, matching what the
     *  addon's own keybinding does. */
    readonly isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

    toggleTheme = (): void => {
        this.isDark = !this.isDark;
    };

    getCellContent = (item: Item): GridCell => {
        const row = this.sourceRow(item[1]);
        const col = naturalDemoColumnIndex(this.columns[item[0]], item[0]);
        return this.edits.get(`${col},${row}`) ?? demoGetCellContent([col, row]);
    };

    handleColumnResize = (_column: GridColumn, newSize: number, colIndex: number): void => {
        this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
    };

    handleColumnMoved = (startIndex: number, endIndex: number): void => {
        const cols = [...this.columns];
        const [moved] = cols.splice(startIndex, 1);
        if (moved === undefined) return;
        cols.splice(endIndex, 0, moved);
        this.columns = cols;
    };

    handleCellsEdited = (edits: readonly { location: Item; value: GridCell }[]): void => {
        const next = new Map(this.edits);
        // Keyed by the *underlying* row, not the displayed one -- otherwise an edit made after a row
        // reorder would follow the position rather than the record. Same read/write coordinate-space
        // rule `withColumnSort` settled in Phase 8, here in its simplest possible form.
        // `normalizeEditedCell` recomputes derived display fields the *consumer* owns -- the Progress
        // column's `${value}%` label being the one that bites. See its doc comment for why that sync
        // is the consumer's job for `range-cell` and the addon's job for `displayData`/`displayDate`.
        for (const edit of edits)
            next.set(
                `${naturalDemoColumnIndex(this.columns[edit.location[0]], edit.location[0])},${this.sourceRow(edit.location[1])}`,
                normalizeEditedCell(edit.value)
            );
        this.edits = next;
    };

    // --- Phase 9h: row reorder + fill handle ------------------------------------------------------
    // `@onRowMoved` enables dragging a row by its marker cell and draws the handle dots there; the
    // grid previews the move live and then throws the preview away on drop, so the consumer has to
    // actually reorder its data. This demo's rows are generated from their index by
    // `demoGetCellContent`, so "reordering the data" means keeping a permutation and reading through
    // it -- which is what a real consumer's array `splice` does, just spelled out.
    @tracked rowOrder: readonly number[] | undefined = undefined;

    private sourceRow(row: number): number {
        return this.rowOrder?.[row] ?? row;
    }

    handleRowMoved = (startIndex: number, endIndex: number): void => {
        const order = [...(this.rowOrder ?? Array.from({ length: this.rows }, (_, i) => i))];
        const [moved] = order.splice(startIndex, 1);
        if (moved === undefined) return;
        order.splice(endIndex, 0, moved);
        this.rowOrder = order;
    };

    // Fill handle is opt-in (`@fillHandle`), matching source. Toggled here so the "handle drawn but
    // inert" state this port shipped before 9h can't quietly come back unnoticed.
    @tracked useFillHandle = true;

    toggleFillHandle = (): void => {
        this.useFillHandle = !this.useFillHandle;
    };

    // --- Phase 10a: the mutually-exclusive settings, as cycling controls -------------------------
    // Each of these is an arg where only one value can be live at a time, so a toggle is the only
    // way a demo can cover more than one of them.

    @tracked rowMarkerIndex = 0;
    @tracked rangeSelectIndex = 0;
    @tracked fillDirectionIndex = 0;
    @tracked freezeColumns = 0;

    get rowMarkers(): RowMarkerKind {
        return ROW_MARKER_KINDS[this.rowMarkerIndex] ?? "both";
    }

    get rangeSelect(): (typeof RANGE_SELECT_MODES)[number] {
        return RANGE_SELECT_MODES[this.rangeSelectIndex] ?? "rect";
    }

    get allowedFillDirections(): FillHandleDirection {
        return FILL_DIRECTIONS[this.fillDirectionIndex] ?? "orthogonal";
    }

    /** Row reorder is grabbed from the marker column, so with `@rowMarkers="none"` there is nothing
     *  to grab. Passing `undefined` then is honest: it also stops the marker cells advertising a
     *  drag handle they cannot offer. */
    get onRowMovedIfAvailable(): ((s: number, e: number) => void) | undefined {
        return this.rowMarkers === "none" ? undefined : this.handleRowMoved;
    }

    cycleRowMarkers = (): void => {
        this.rowMarkerIndex = (this.rowMarkerIndex + 1) % ROW_MARKER_KINDS.length;
    };

    cycleRangeSelect = (): void => {
        this.rangeSelectIndex = (this.rangeSelectIndex + 1) % RANGE_SELECT_MODES.length;
    };

    cycleFillDirection = (): void => {
        this.fillDirectionIndex = (this.fillDirectionIndex + 1) % FILL_DIRECTIONS.length;
    };

    toggleFreezeColumns = (): void => {
        this.freezeColumns = this.freezeColumns === 0 ? 2 : 0;
    };

    // --- Phase 9g: selection tuning + editing behaviour ------------------------------------------
    // Five selection args that were hardcoded until 9g, plus three editing-behaviour flags. Every
    // one of them is invisible in a screenshot, which is exactly why they get controls: with
    // `"additive"` blending a cell selection and a row selection coexist, with `"exclusive"` they
    // cannot, and nothing but trying it says which is live.
    @tracked selectionBlendingIndex = 0;
    @tracked multiSelectionMode = false;
    @tracked editOnType = true;
    @tracked trapFocus = false;
    @tracked focusRingIndex = 0;

    get selectionBlending(): SelectionBlending {
        return SELECTION_BLENDINGS[this.selectionBlendingIndex] ?? "exclusive";
    }

    get selectionMode(): "auto" | "multi" {
        return this.multiSelectionMode ? "multi" : "auto";
    }

    get drawFocusRing(): boolean | "no-editor" {
        return FOCUS_RING_MODES[this.focusRingIndex] ?? true;
    }

    get focusRingLabel(): string {
        const mode = this.drawFocusRing;
        return mode === "no-editor" ? "no-editor" : mode ? "on" : "off";
    }

    cycleSelectionBlending = (): void => {
        this.selectionBlendingIndex = (this.selectionBlendingIndex + 1) % SELECTION_BLENDINGS.length;
    };

    toggleSelectionMode = (): void => {
        this.multiSelectionMode = !this.multiSelectionMode;
    };

    toggleEditOnType = (): void => {
        this.editOnType = !this.editOnType;
    };

    toggleTrapFocus = (): void => {
        this.trapFocus = !this.trapFocus;
    };

    cycleFocusRing = (): void => {
        this.focusRingIndex = (this.focusRingIndex + 1) % FOCUS_RING_MODES.length;
    };

    // --- Phase 9g: validation, paste coercion, copy headers, delete interception ------------------
    // Four args that change what an *edit* does rather than what the grid looks like, so each one
    // gets both a toggle and a line in the status row -- otherwise "my edit didn't stick" and "the
    // grid is broken" are the same observation.
    @tracked useValidation = false;
    @tracked useCoercion = false;
    @tracked copyHeaders = false;
    @tracked deleteModeIndex = 0;
    /** What the last guarded edit/delete decided. Rendered in the status row. */
    @tracked lastGuard: string | undefined;

    get deleteMode(): (typeof DELETE_MODES)[number] {
        return DELETE_MODES[this.deleteModeIndex] ?? "normal";
    }

    toggleValidation = (): void => {
        this.useValidation = !this.useValidation;
    };

    toggleCoercion = (): void => {
        this.useCoercion = !this.useCoercion;
    };

    toggleCopyHeaders = (): void => {
        this.copyHeaders = !this.copyHeaders;
    };

    cycleDeleteMode = (): void => {
        this.deleteModeIndex = (this.deleteModeIndex + 1) % DELETE_MODES.length;
    };

    // 4.5: scroll shadows and overscroll. The shadows are ON by default, so the toggle exists to
    // show what the grid looks like *without* them — which is what it looked like before 4.5, since
    // the port drew none. Overscroll is off by default and adds trailing empty scroll space.
    @tracked scrollShadows = true;
    @tracked useOverscroll = false;

    toggleScrollShadows = (): void => {
        this.scrollShadows = !this.scrollShadows;
    };

    toggleOverscroll = (): void => {
        this.useOverscroll = !this.useOverscroll;
    };

    get overscroll(): number | undefined {
        return this.useOverscroll ? 200 : undefined;
    }

    // 4.5: the render/perf knobs from source's `experimental` bag, flattened into real args here
    // (the same call 2.5 made for `hyperWrapping`). `renderStrategy` is the one worth a toggle: it
    // is the only way to *see* that the scroll blit fast path exists, since `"direct"` turns it off.
    @tracked renderStrategyIndex = 0;
    @tracked hairlineIndex = 0;

    get renderStrategy(): (typeof RENDER_STRATEGIES)[number] {
        return RENDER_STRATEGIES[this.renderStrategyIndex] ?? "default";
    }

    get renderStrategyArg(): "single-buffer" | "double-buffer" | "direct" | undefined {
        const strategy = this.renderStrategy;
        return strategy === "default" ? undefined : strategy;
    }

    cycleRenderStrategy = (): void => {
        this.renderStrategyIndex = (this.renderStrategyIndex + 1) % RENDER_STRATEGIES.length;
    };

    get hairlineMode(): (typeof HAIRLINE_MODES)[number] {
        return HAIRLINE_MODES[this.hairlineIndex] ?? "off";
    }

    cycleHairline = (): void => {
        this.hairlineIndex = (this.hairlineIndex + 1) % HAIRLINE_MODES.length;
    };

    get disableMinimumCellWidth(): boolean {
        return this.hairlineMode === "8px, floor 1";
    }

    /**
     * `@disableMinimumCellWidth` only *does* anything to a column narrower than 10px — it lowers the
     * floor below which the render engine paints a cell's background and skips its contents. Nothing
     * here is that narrow, so the toggle squashes the Salary column to 8px and then cycles the flag,
     * which is what makes the difference observable: **"8px, floor 10"** paints an empty sliver,
     * **"8px, floor 1"** paints the number into it. A two-state toggle would have been a switch with
     * no visible effect, which is the exact dead-arg shape this demo exists to prevent.
     *
     * `@cached` so the array keeps its identity between draws.
     */
    @cached
    get effectiveColumns(): readonly GridColumn[] {
        if (this.hairlineMode === "off") return this.columns;
        // The padding override is needed, not decorative: with the theme's default 8px of cell
        // padding on each side, an 8px column has no room left and the text is clipped away
        // whichever floor is in force -- so the flag would look like it did nothing.
        return this.columns.map((c, i) =>
            i === 1
                ? { ...c, width: 8, grow: undefined, themeOverride: { ...c.themeOverride, cellHorizontalPadding: 1 } }
                : c
        );
    }

    // 4.5: `@onPaste`. All-or-nothing, and checked before a single cell is written — where
    // `@coercePasteValue` above shapes values once a paste is already going ahead.
    @tracked pasteModeIndex = 0;

    get pasteMode(): (typeof PASTE_MODES)[number] {
        return PASTE_MODES[this.pasteModeIndex] ?? "allow";
    }

    cyclePasteMode = (): void => {
        this.pasteModeIndex = (this.pasteModeIndex + 1) % PASTE_MODES.length;
    };

    /** A getter rather than a class field because the arg's *value* changes with the toggle; the
     *  callback identity churning is fine here, since `onPaste` is read at paste time and is not a
     *  `DrawGridArg` field. */
    get onPaste(): PasteBehavior | undefined {
        if (this.pasteMode === "allow") return undefined;
        if (this.pasteMode === "off") return false;
        return (target, values) => {
            const cells = values.reduce((n, row) => n + row.length, 0);
            if (cells <= 1) return true;
            this.lastGuard = `onPaste refused a ${values.length}x${values[0]?.length ?? 0} paste at col ${target[0]}, row ${target[1]}`;
            return false;
        };
    }

    /** Rejects a blank text value and a negative number. Deliberately a *rejection* rather than a
     *  coercion: rejection is the half of `validateCell` this port implements exactly like source
     *  (see the arg's doc comment for the coercion caveat). The editor stays open and usable; what
     *  is suppressed is the commit. */
    get validateCell(): ValidateCellCallback | undefined {
        if (!this.useValidation) return undefined;
        return (cell, newValue) => {
            if (newValue.kind === GridCellKind.Text && newValue.data.trim() === "") {
                this.lastGuard = `validateCell rejected an empty value at col ${cell[0]}`;
                return false;
            }
            if (newValue.kind === GridCellKind.Number && (newValue.data ?? 0) < 0) {
                this.lastGuard = `validateCell rejected a negative number at col ${cell[0]}`;
                return false;
            }
            return true;
        };
    }

    /** Upper-cases pasted text before the built-in rules see it. Returning `undefined` for any other
     *  kind is what "fall through to the default" looks like. */
    get coercePasteValue(): CoercePasteValueCallback | undefined {
        if (!this.useCoercion) return undefined;
        return (val, cell) => {
            if (cell.kind !== GridCellKind.Text) return undefined;
            const data = val.toUpperCase();
            this.lastGuard = `coercePasteValue upper-cased "${val}"`;
            return { ...cell, data, displayData: data };
        };
    }

    // --- Phase 9g: the click / activation notifications ------------------------------------------
    // Pure notifications, so they go where every other notification-only arg in this demo goes: a
    // status line. `cellActivationBehavior` gets a cycling control because its three values are
    // mutually exclusive and the difference (does one click open the editor, or two?) is only
    // observable by trying it.
    @tracked lastClick = "—";
    @tracked lastActivation = "—";
    @tracked lastEditFinish = "—";
    @tracked activationBehaviorIndex = 0;

    get cellActivationBehavior(): CellActivationBehavior {
        return ACTIVATION_BEHAVIORS[this.activationBehaviorIndex] ?? "second-click";
    }

    cycleActivationBehavior = (): void => {
        this.activationBehaviorIndex = (this.activationBehaviorIndex + 1) % ACTIVATION_BEHAVIORS.length;
    };

    // --- Phase 9g: presentation -------------------------------------------------------------------
    // `rowMarkerStartIndex` / `rowMarkerTheme` / `trailingRowOptions` / `scaleToRem`, plus a
    // `scrollOffsetY` button. All frozen module-scope constants where the grid identity-compares
    // them -- `rowMarkerTheme` lands on a column, and columns feed `computeCanBlit`.
    @tracked zeroBasedRowMarkers = false;
    @tracked useRowMarkerTheme = false;
    @tracked tintTrailingRow = false;
    @tracked scaleToRem = false;
    /** Bumped by the "Scroll to row 50" button. Changing the value is what makes the grid scroll --
     *  see the arg's doc comment; between changes the user scrolls freely. */
    @tracked scrollOffsetY: number | undefined;

    get rowMarkerStartIndex(): number {
        return this.zeroBasedRowMarkers ? 0 : 1;
    }

    get rowMarkerTheme(): Partial<Theme> | undefined {
        return this.useRowMarkerTheme ? ROW_MARKER_THEME : undefined;
    }

    get trailingRowOptions(): TrailingRowOptions {
        return this.tintTrailingRow ? TINTED_TRAILING_ROW : PLAIN_TRAILING_ROW;
    }

    toggleRowMarkerStart = (): void => {
        this.zeroBasedRowMarkers = !this.zeroBasedRowMarkers;
    };

    toggleRowMarkerTheme = (): void => {
        this.useRowMarkerTheme = !this.useRowMarkerTheme;
    };

    toggleTrailingRowTint = (): void => {
        this.tintTrailingRow = !this.tintTrailingRow;
    };

    toggleScaleToRem = (): void => {
        this.scaleToRem = !this.scaleToRem;
    };

    scrollToRow50 = (): void => {
        // Nudged by a pixel when already there, because the grid applies the offset once per
        // *change* -- re-passing the same number is deliberately a no-op.
        this.scrollOffsetY = this.scrollOffsetY === 50 * 34 ? 50 * 34 + 1 : 50 * 34;
    };

    handleCellClicked = (cell: Item): void => {
        // Fires on mouseup, and only when it lands on the cell the mousedown did -- so starting a
        // drag-selection does NOT report a click here. Watch this readout while dragging: it stays
        // put. Calling `event.preventDefault()` would suppress the cell renderer's own `onClick` and
        // any activation, but not the selection change, which already happened on mousedown.
        this.lastClick = `cell ${cell[0]},${cell[1]}`;
    };

    handleHeaderClicked = (col: number): void => {
        this.lastClick = `header ${col}`;
    };

    /**
     * Group headers are the ONE place where `preventDefault()` suppresses the selection: they select
     * on mouseup, right after this callback, where cells and ordinary headers select on mousedown
     * long before theirs fires. Flip "Suppress group select" and click a group band: the readout
     * still updates, the column selection does not.
     */
    handleGroupHeaderClicked = (col: number, event: GroupHeaderClickedEventArgs): void => {
        if (this.suppressGroupHeaderSelect) {
            event.preventDefault();
            this.lastClick = `group header over col ${col} (selection suppressed)`;
            return;
        }
        this.lastClick = `group header over col ${col}`;
    };

    /**
     * 4.2: `@getGroupDetails`. A class-field arrow, so its identity never changes -- the controller
     * memoizes its wrapper on it, and every `DrawGridArg` field this port hands over is kept
     * reference-stable (rule 1).
     *
     * The actions are hover-revealed: they draw, and are clickable, only while the pointer is over
     * their group's strip. Clicking one reports itself and nothing else -- no `@onGroupHeaderClicked`
     * and no group-column selection -- which is what the `lastClick` readout below distinguishes.
     */
    getGroupDetails = (group: string): Partial<GroupDetails> | undefined => {
        if (group === "") return undefined;
        const icon = GROUP_ICONS[group];
        const actions =
            group === ACTION_GROUP
                ? ([
                      {
                          title: "Rename",
                          icon: "renameIcon",
                          onClick: () => {
                              this.lastClick = `group action "Rename" on ${group}`;
                          },
                      },
                      {
                          title: "Info",
                          icon: "headerReference",
                          onClick: () => {
                              this.lastClick = `group action "Info" on ${group}`;
                          },
                      },
                  ] satisfies GroupDetails["actions"])
                : undefined;
        return {
            // The strip's label need not be the key on `column.group`; this proves it.
            name: group === THEMED_GROUP ? `${group} (themed)` : group,
            icon,
            overrideTheme: group === THEMED_GROUP ? { bgHeader: "#2d3f5f", textGroupHeader: "#ffffff" } : undefined,
            actions,
        };
    };

    toggleSuppressGroupHeaderSelect = (): void => {
        this.suppressGroupHeaderSelect = !this.suppressGroupHeaderSelect;
    };

    handleCellActivated = (cell: Item, event: CellActivatedEventArgs): void => {
        const how = event.inputType === "keyboard" ? `key ${event.key}` : event.pointerActivation;
        this.lastActivation = `${cell[0]},${cell[1]} via ${how}`;
    };

    handleFinishedEditing = (newValue: GridCell | undefined, movement: Item): void => {
        this.lastEditFinish = `${newValue === undefined ? "cancelled" : "committed"}, moved ${movement[0]},${movement[1]}`;
    };

    /** Tab off the last column. The grid only notifies -- the columns array is this component's, so
     *  a column only appears because this handler adds one. */
    handleColumnAppended = (): void => {
        const index = this.columns.length;
        this.columns = [
            ...this.columns,
            { id: `col-${index}`, title: `New ${index}`, width: 120, hasMenu: true } satisfies SizedGridColumn,
        ];
        this.lastActivity = `onColumnAppended added column ${index}`;
    };

    /** All three of source's return shapes, one per cycle position: `true` (normal), `false` (veto),
     *  and a replacement `GridSelection` -- here the whole column under the active cell, which is
     *  the "delete columns, not cells" case this arg exists for. */
    get onDelete(): ((selection: GridSelection) => boolean | GridSelection) | undefined {
        if (this.deleteMode === "normal") return undefined;
        return (selection: GridSelection): boolean | GridSelection => {
            if (this.deleteMode === "veto") {
                this.lastGuard = "onDelete vetoed the delete";
                return false;
            }
            const current = selection.current;
            if (current === undefined) return true;
            const col = current.cell[0];
            this.lastGuard = `onDelete widened the delete to all of column ${col}`;
            return {
                current: {
                    cell: [col, 0],
                    range: { x: col, y: 0, width: 1, height: this.rows },
                    rangeStack: [],
                },
                rows: CompactSelection.empty(),
                columns: CompactSelection.empty(),
            };
        };
    }

    // --- Phase 10a: the notification-only args, surfaced as a live status line ------------------
    // `@onSelectionChanged` and `@onVisibleRegionChanged` are pure notifications. Rendering them
    // costs nothing and turns two otherwise-invisible callbacks into something a regression can
    // break loudly.
    //
    // Note `@onVisibleRegionChanged` is already deferred to a microtask by the addon precisely so
    // setting tracked state from it is safe -- see its doc comment.
    @tracked selectionSummary = "none";
    /** N2: what `@onItemHovered` last reported. This is the raw material a tooltip is built from —
     *  the demo just prints it, so a regression is visible without reading code. */
    @tracked hoverSummary = "—";
    @tracked visibleRegionSummary = "-";
    @tracked lastFill: string | undefined;
    /** Column of the selected cell, in the consumer's own space. Drives the per-column note. */
    @tracked selectedColumn: number | undefined;

    /** `undefined` for every column whose behaviour is self-evident. See `demo-data.ts`. */
    get columnNote(): string | undefined {
        return this.selectedColumn === undefined ? undefined : demoColumnNote(this.selectedColumn);
    }

    // This component used to carry a `rowMarkerOffset` getter and subtract it from every column
    // index below, because `@onSelectionChanged` reported the grid's *internal* column space while
    // `@onCellsEdited` and the context-menu callbacks reported the consumer's. That split is gone as
    // of 2026-08-09 -- the grid now reports consumer space everywhere, matching source -- so the
    // correction has been deleted rather than kept "just in case": leaving it would have subtracted
    // the offset twice and pointed every column note at the wrong column.
    handleItemHovered = (args: GridMouseEventArgs): void => {
        if (args.kind === outOfBoundsKind) {
            this.hoverSummary = "off-grid";
            return;
        }
        const [col, row] = args.location;
        // `location` arrives in consumer space already — the row-marker column is subtracted by the
        // grid, so a hover over the marker itself reports col -1.
        const where =
            args.kind === headerKind ? "header" : args.kind === groupHeaderKind ? "group header" : `row ${row}`;
        this.hoverSummary = `col ${col}, ${where}`;
    };

    handleSelectionChanged = (selection: GridSelection): void => {
        const current = selection.current;
        const parts: string[] = [];
        this.selectedColumn = current === undefined ? undefined : current.cell[0];
        if (current !== undefined) {
            const r = current.range;
            parts.push(
                r.width * r.height === 1 ? `cell ${r.x},${r.y}` : `range ${r.width}x${r.height} at ${r.x},${r.y}`
            );
        }
        if (selection.rows.length > 0) parts.push(`${selection.rows.length} row(s)`);
        if (selection.columns.length > 0) parts.push(`${selection.columns.length} col(s)`);
        this.selectionSummary = parts.length > 0 ? parts.join(", ") : "none";
    };

    handleVisibleRegionChanged = (region: Rectangle): void => {
        this.visibleRegionSummary = `cols ${region.x}-${region.x + region.width - 1}, rows ${region.y}-${region.y + region.height - 1}`;
    };

    /** Fires just before a fill's edits are computed. Calling `preventDefault()` would hand the
     *  whole fill over to this component; here it only reports, so the default still runs. */
    handleFillPattern = (event: FillPatternEventArgs): void => {
        const d = event.fillDestination;
        this.lastFill = `${d.width}x${d.height} from ${event.patternSource.x},${event.patternSource.y}`;
    };

    /** Live veto during a column-reorder drag. Refusing position 0 is arbitrary but visible: the
     *  drop indicator simply refuses to appear there. */
    handleColumnProposeMove = (_startIndex: number, endIndex: number): boolean => {
        return endIndex !== 0;
    };

    /** `@onHeaderMenuClick` fires only on the chevron glyph, never on the header body -- that is a
     *  separate, precise hit test. `bounds` is the glyph's rect in **grid-root-relative** pixels,
     *  which is exactly the space an absolutely-positioned child of the grid's own container is
     *  laid out in (contrast the context menus below, which get viewport coordinates from the
     *  event). The menu itself is consumer chrome; the addon ships none, by design. */
    @tracked headerMenu: { col: number; bounds: Rectangle } | undefined;

    handleHeaderMenuClick = (col: number, bounds: Rectangle): void => {
        this.headerMenu = { col, bounds };
    };

    closeHeaderMenu = (): void => {
        this.headerMenu = undefined;
    };

    get headerMenuStyle(): ReturnType<typeof htmlSafe> {
        const menu = this.headerMenu;
        if (menu === undefined) return htmlSafe("");
        return htmlSafe(`left: ${menu.bounds.x}px; top: ${menu.bounds.y + menu.bounds.height}px;`);
    }

    // Phase 4d: `demoGetCellContent` is a pure function of `[col, row]` (no upper bound baked in),
    // so simply widening `rows` is enough for the newly-appended row to render real (generated)
    // content immediately -- no separate "seed the new row's data" step needed for this demo.
    //
    // 9f: the returned index is what `api.appendRow()` focuses. Returning it explicitly (rather than
    // `undefined`, which means "on the end" and would land in the same place here) is what exercises
    // the numeric branch of `RowAppendedResult`.
    handleRowAppended = (): number => {
        const index = this.rows;
        this.rows = index + 1;
        return index;
    };

    // --- Phase 9f: the imperative API ------------------------------------------------------------
    //
    // Every one of these is a method on the object `@onReady` hands over. They are buttons rather
    // than a written-down recipe for this project's standard reason: an API surface nothing calls is
    // unverified code, and `api.appendRow`'s poll-then-focus flow in particular cannot be checked by
    // reading it.

    /** Whatever the last API call reported back, for the methods that return something. */
    @tracked lastApiResult: string | undefined;

    apiFocus = (): void => {
        this.gridApi?.focus();
        this.lastApiResult = "focus() — arrow keys now move the selection";
    };

    /** Deep into the grid on both axes, centred, so the alignment options are visibly doing work. */
    apiScrollTo = (): void => {
        this.gridApi?.scrollTo(8, 500, { hAlign: "center", vAlign: "center", behavior: "smooth" });
        this.lastApiResult = "scrollTo(8, 500) centred, smooth";
    };

    /** Client coordinates, so this is directly usable for positioning a popover. */
    apiGetBounds = (): void => {
        const cell = this.gridApi?.getBounds(0, 0);
        const all = this.gridApi?.getBounds();
        this.lastApiResult =
            cell === undefined
                ? "getBounds(0,0) — undefined (scrolled out of view)"
                : `getBounds(0,0) = ${Math.round(cell.x)},${Math.round(cell.y)} ${Math.round(cell.width)}x${Math.round(cell.height)}` +
                  ` · content ${Math.round(all?.width ?? 0)}x${Math.round(all?.height ?? 0)}`;
    };

    /** Feeds straight back into `@onColumnResize`, which is what actually applies the width -- the
     *  grid only measures and reports, exactly like a resize drag. */
    apiRemeasure = (): void => {
        const targets = [0, 1, 2, 3, 4];
        this.gridApi?.remeasureColumns(targets);
        this.lastApiResult = `remeasureColumns([${targets.join(", ")}]) — widths applied via @onColumnResize`;
    };

    apiAppendRow = (): void => {
        void this.gridApi?.appendRow(1).then(() => {
            this.lastApiResult = `appendRow(1) — row ${this.rows - 1} focused, editor open`;
        });
    };

    apiAppendColumn = (): void => {
        void this.gridApi?.appendColumn(0).then(() => {
            this.lastApiResult = `appendColumn(0) — column ${this.columns.length - 1} focused`;
        });
    };

    apiEmitDelete = (): void => {
        this.gridApi?.emit("delete");
        this.lastApiResult = "emit('delete') — same path as the Delete key";
    };

    /** The centre of the grid element, hit-tested with no pointer event at all. */
    apiHitTest = (): void => {
        const root = this.gridApi?.getRootElement();
        if (root === undefined) return;
        const rect = root.getBoundingClientRect();
        const hit = this.gridApi?.getMouseArgsForPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
        this.lastApiResult =
            hit === undefined
                ? "getMouseArgsForPosition — undefined"
                : `getMouseArgsForPosition(centre) = ${hit.kind} ${hit.location[0]},${hit.location[1]}`;
    };

    <template>
        <div class="gdg-full">
            {{! Phase 10a: the toggle row is part of the deliverable -- it is what makes a
                regression in any of these args visible without reading code. }}
            <div class="gdg-full__controls">
                <button type="button" class="gdg-full__toggle" data-test-theme-toggle {{on "click" this.toggleTheme}}>
                    Theme:
                    <b>{{if this.isDark "dark" "light"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-row-markers-toggle
                    {{on "click" this.cycleRowMarkers}}
                >
                    Row markers:
                    <b>{{this.rowMarkers}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-range-select-toggle
                    {{on "click" this.cycleRangeSelect}}
                >
                    Range select:
                    <b>{{this.rangeSelect}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-freeze-toggle
                    {{on "click" this.toggleFreezeColumns}}
                >
                    Frozen columns:
                    <b>{{this.freezeColumns}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-fill-handle-toggle
                    {{on "click" this.toggleFillHandle}}
                >
                    Fill handle:
                    <b>{{if this.useFillHandle "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-fill-direction-toggle
                    {{on "click" this.cycleFillDirection}}
                >
                    Fill axis:
                    <b>{{this.allowedFillDirections}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-draw-hooks-toggle
                    {{on "click" this.toggleDrawHooks}}
                >
                    Draw hooks:
                    <b>{{if this.showDrawHooks "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-suppress-group-select-toggle
                    {{on "click" this.toggleSuppressGroupHeaderSelect}}
                >
                    Suppress group select:
                    <b>{{if this.suppressGroupHeaderSelect "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-external-search-toggle
                    {{on "click" this.toggleExternalSearch}}
                >
                    App-owned search:
                    <b>{{if this.useExternalSearch "on" "off"}}</b>
                </button>
                {{! Phase 9g. }}
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-selection-blending-toggle
                    {{on "click" this.cycleSelectionBlending}}
                >
                    Selection blending:
                    <b>{{this.selectionBlending}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-selection-mode-toggle
                    {{on "click" this.toggleSelectionMode}}
                >
                    Selection mode:
                    <b>{{this.selectionMode}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-edit-on-type-toggle
                    {{on "click" this.toggleEditOnType}}
                >
                    Edit on type:
                    <b>{{if this.editOnType "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-trap-focus-toggle
                    {{on "click" this.toggleTrapFocus}}
                >
                    Trap focus:
                    <b>{{if this.trapFocus "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-focus-ring-toggle
                    {{on "click" this.cycleFocusRing}}
                >
                    Focus ring:
                    <b>{{this.focusRingLabel}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-validate-toggle
                    {{on "click" this.toggleValidation}}
                >
                    Validate edits:
                    <b>{{if this.useValidation "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-coerce-paste-toggle
                    {{on "click" this.toggleCoercion}}
                >
                    Coerce paste:
                    <b>{{if this.useCoercion "UPPER" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-copy-headers-toggle
                    {{on "click" this.toggleCopyHeaders}}
                >
                    Copy headers:
                    <b>{{if this.copyHeaders "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-render-strategy-toggle
                    {{on "click" this.cycleRenderStrategy}}
                >
                    Render:
                    <b>{{this.renderStrategy}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-hairline-cells-toggle
                    {{on "click" this.cycleHairline}}
                >
                    Hairline cells:
                    <b>{{this.hairlineMode}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-scroll-shadows-toggle
                    {{on "click" this.toggleScrollShadows}}
                >
                    Scroll shadows:
                    <b>{{if this.scrollShadows "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-overscroll-toggle
                    {{on "click" this.toggleOverscroll}}
                >
                    Overscroll:
                    <b>{{if this.useOverscroll "200px" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-paste-mode-toggle
                    {{on "click" this.cyclePasteMode}}
                >
                    Paste:
                    <b>{{this.pasteMode}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-delete-mode-toggle
                    {{on "click" this.cycleDeleteMode}}
                >
                    Delete:
                    <b>{{this.deleteMode}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-activation-behavior-toggle
                    {{on "click" this.cycleActivationBehavior}}
                >
                    Activate on:
                    <b>{{this.cellActivationBehavior}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-row-marker-start-toggle
                    {{on "click" this.toggleRowMarkerStart}}
                >
                    Row numbers from:
                    <b>{{this.rowMarkerStartIndex}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-row-marker-theme-toggle
                    {{on "click" this.toggleRowMarkerTheme}}
                >
                    Marker theme:
                    <b>{{if this.useRowMarkerTheme "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-trailing-tint-toggle
                    {{on "click" this.toggleTrailingRowTint}}
                >
                    Trailing row:
                    <b>{{if this.tintTrailingRow "tinted + icon" "plain"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-scale-to-rem-toggle
                    {{on "click" this.toggleScaleToRem}}
                >
                    Scale to rem:
                    <b>{{if this.scaleToRem "on" "off"}}</b>
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-scroll-offset
                    {{on "click" this.scrollToRow50}}
                >
                    Scroll to row 50
                </button>
            </div>

            {{! Phase 9f: the imperative API. Separate row because these are *calls*, not settings --
                nothing here is a mode the grid stays in. }}
            <div class="gdg-full__controls">
                <span class="gdg-full__hint" style="align-self: center;">Imperative API:</span>
                <button type="button" class="gdg-full__toggle" data-test-api-focus {{on "click" this.apiFocus}}>
                    focus()
                </button>
                <button type="button" class="gdg-full__toggle" data-test-api-scroll-to {{on "click" this.apiScrollTo}}>
                    scrollTo(8, 500) centred
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-api-get-bounds
                    {{on "click" this.apiGetBounds}}
                >
                    getBounds()
                </button>
                <button type="button" class="gdg-full__toggle" data-test-api-remeasure {{on "click" this.apiRemeasure}}>
                    remeasureColumns(0-4)
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-api-append-row
                    {{on "click" this.apiAppendRow}}
                >
                    appendRow(1)
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-api-append-column
                    {{on "click" this.apiAppendColumn}}
                >
                    appendColumn(0)
                </button>
                <button type="button" class="gdg-full__toggle" data-test-api-hit-test {{on "click" this.apiHitTest}}>
                    getMouseArgsForPosition(centre)
                </button>
                <button
                    type="button"
                    class="gdg-full__toggle"
                    data-test-api-emit-delete
                    {{on "click" this.apiEmitDelete}}
                >
                    emit('delete')
                </button>
            </div>

            {{! Notification-only args, rendered so they are observable rather than merely wired. }}
            <div class="gdg-full__status">
                <span>Selection: <b data-test-selection-summary>{{this.selectionSummary}}</b></span>
                <span>Hover: <b data-test-hover-summary>{{this.hoverSummary}}</b></span>
                <span>Visible: <b data-test-visible-region>{{this.visibleRegionSummary}}</b></span>
                {{#if this.lastFill}}<span>Last fill: <b data-test-last-fill>{{this.lastFill}}</b></span>{{/if}}
                {{! Phase 9g: an edit that is silently refused is indistinguishable from a broken
                    grid, so every guard decision is reported. }}
                {{#if this.lastGuard}}<span>Guard: <b data-test-last-guard>{{this.lastGuard}}</b></span>{{/if}}
                {{#if this.lastApiResult}}<span>API:
                        <b data-test-last-api-result>{{this.lastApiResult}}</b></span>{{/if}}
                <span>Click: <b data-test-last-click>{{this.lastClick}}</b></span>
                <span>Activated: <b data-test-last-activation>{{this.lastActivation}}</b></span>
                <span>Edit end: <b data-test-last-edit-finish>{{this.lastEditFinish}}</b></span>
                {{! Cell-carried callbacks (button / uri / links) have no other way to be seen. }}
                <span class="gdg-full__hint">
                    Drag a row by its marker to reorder &middot; drag the selection's corner handle to fill &middot;
                    right-click a cell, header or group header &middot;
                    {{if this.isMac "Cmd" "Ctrl"}}+F to search
                </span>
            </div>

            {{! Two things a canvas grid cannot say for itself, on one always-present row.

                LEFT -- what a cell-carried callback just did. `ButtonCell.onClick`,
                `UriCell.onClickUri` and `LinksCell`'s per-link `onClick` produce no cell edit and
                no selection change, so without this they are indistinguishable from nothing
                happening. That is exactly how three of this demo's columns came to be reported as
                broken.

                RIGHT -- what the selected column actually does. A canvas cell cannot draw "I am
                deliberately display-only", which is why the bubble and drilldown columns read as a
                mystery rather than as a documented design decision.

                Both halves are rendered unconditionally and clamped to one line: this row sits
                ABOVE the grid, so anything that appears, disappears or wraps here moves every row
                underneath it -- and a click already aimed at a row then lands on its neighbour. }}
            <div class="gdg-full__status" style="align-items: baseline;">
                <span style="min-width: 0; flex: 1 1 40%;">Last action:
                    <b
                        data-test-last-activity
                        title={{this.lastActivity}}
                        style="display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;"
                    >{{if this.lastActivity this.lastActivity "-"}}</b>
                </span>
                <span
                    class="gdg-full__hint"
                    data-test-column-note
                    title={{this.columnNote}}
                    style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                >
                    {{#if this.columnNote}}{{this.columnNote}}{{else}}Select a cell to see what that column does.{{/if}}
                </span>
            </div>

            {{#if this.useExternalSearch}}
                {{! UI #2: an ordinary app-owned input, outside the grid entirely. Note there is no
                    addon component here at all -- just `setSearchValue` and the state snapshot. }}
                <div style="flex: 0 0 auto; display: flex; align-items: center; gap: 8px;" data-test-external-search>
                    <label for="external-search">Search (app-owned input):</label>
                    <input
                        id="external-search"
                        type="text"
                        placeholder="Try &quot;Lovelace&quot; or &quot;Renewal&quot;"
                        value={{this.searchValue}}
                        style="width: 260px;"
                        {{on "input" this.handleExternalSearchInput}}
                    />
                    <button
                        class="btn btn-xs"
                        type="button"
                        disabled={{unless this.hasSearchResults "disabled"}}
                        {{on "click" this.searchPrev}}
                    >
                        Prev
                    </button>
                    <button
                        class="btn btn-xs"
                        type="button"
                        disabled={{unless this.hasSearchResults "disabled"}}
                        {{on "click" this.searchNext}}
                    >
                        Next
                    </button>
                    <span data-test-external-search-status>{{this.searchStatusText}}</span>
                </div>
            {{/if}}
            <div class="gdg-full__grid">
                <GlideDataGrid
                    @columns={{this.effectiveColumns}}
                    @getCellContent={{this.getCellContent}}
                    @extraCells={{allExtraCells}}
                    @rows={{this.rows}}
                    @theme={{this.theme}}
                    @getRowThemeOverride={{this.getRowThemeOverride}}
                    {{! Column groups + header icons (Phase 7b / Phase 1's sprite set). Groups are
                        also the only way `@onGroupHeaderContextMenu` is reachable. }}
                    @headerIcons={{this.headerIcons}}
                    {{! 4.2: group-header icons, per-group theme, and hover-revealed action icons. }}
                    @getGroupDetails={{this.getGroupDetails}}
                    @freezeColumns={{this.freezeColumns}}
                    @verticalBorder={{DEMO_VERTICAL_BORDER}}
                    @resizeIndicator="full"
                    @hyperWrapping={{true}}
                    @onColumnResize={{this.handleColumnResize}}
                    @onColumnMoved={{this.handleColumnMoved}}
                    @onColumnProposeMove={{this.handleColumnProposeMove}}
                    @minColumnWidth={{50}}
                    @maxColumnWidth={{420}}
                    @onCellsEdited={{this.handleCellsEdited}}
                    {{! Phase 9h. Row markers are what a row reorder is grabbed from, so they have to
                        be on for `@onRowMoved` to do anything -- and turning them on here is also
                        what first exercised the row-marker offset in `@highlightRegions`. }}
                    @rowMarkers={{this.rowMarkers}}
                    {{! Phase 9g: presentation. }}
                    @rowMarkerStartIndex={{this.rowMarkerStartIndex}}
                    @rowMarkerTheme={{this.rowMarkerTheme}}
                    @trailingRowOptions={{this.trailingRowOptions}}
                    @scaleToRem={{this.scaleToRem}}
                    @scrollOffsetY={{this.scrollOffsetY}}
                    @rangeSelect={{this.rangeSelect}}
                    {{! Phase 9g: selection tuning + editing behaviour. }}
                    @rangeSelectionBlending={{this.selectionBlending}}
                    @columnSelectionBlending={{this.selectionBlending}}
                    @rowSelectionBlending={{this.selectionBlending}}
                    @rowSelectionMode={{this.selectionMode}}
                    @columnSelectionMode={{this.selectionMode}}
                    @editOnType={{this.editOnType}}
                    @trapFocus={{this.trapFocus}}
                    @drawFocusRing={{this.drawFocusRing}}
                    @validateCell={{this.validateCell}}
                    @coercePasteValue={{this.coercePasteValue}}
                    {{! 4.5: all-or-nothing paste veto, checked before any cell is written. }}
                    @onPaste={{this.onPaste}}
                    {{! 4.5: scroll shadows (on by default) and trailing overscroll space. }}
                    @fixedShadowX={{this.scrollShadows}}
                    @fixedShadowY={{this.scrollShadows}}
                    @overscrollX={{this.overscroll}}
                    @overscrollY={{this.overscroll}}
                    {{! 4.5: source's `experimental` bag, flattened. Both rescaling flags are on so
                        the scroll-time downscale is exercised on the browsers that honour it; each
                        is a no-op elsewhere. }}
                    @renderStrategy={{this.renderStrategyArg}}
                    @disableMinimumCellWidth={{this.disableMinimumCellWidth}}
                    @enableFirefoxRescaling={{true}}
                    @enableSafariRescaling={{true}}
                    @copyHeaders={{this.copyHeaders}}
                    @onDelete={{this.onDelete}}
                    @cellActivationBehavior={{this.cellActivationBehavior}}
                    @onCellClicked={{this.handleCellClicked}}
                    @onHeaderClicked={{this.handleHeaderClicked}}
                    @onGroupHeaderClicked={{this.handleGroupHeaderClicked}}
                    @onCellActivated={{this.handleCellActivated}}
                    @onFinishedEditing={{this.handleFinishedEditing}}
                    @onColumnAppended={{this.handleColumnAppended}}
                    @onRowMoved={{this.onRowMovedIfAvailable}}
                    @fillHandle={{this.useFillHandle}}
                    @allowedFillDirections={{this.allowedFillDirections}}
                    @onFillPattern={{this.handleFillPattern}}
                    @getCellsForSelection={{true}}
                    @showTrailingBlankRow={{true}}
                    @onRowAppended={{this.handleRowAppended}}
                    @drawCell={{this.drawCell}}
                    @drawHeader={{this.drawHeader}}
                    @prelightCells={{this.prelightCells}}
                    @highlightRegions={{this.highlightRegions}}
                    @showSearch={{this.showSearch}}
                    @onReady={{this.handleReady}}
                    @onSearchStateChange={{this.handleSearchStateChange}}
                    @onSelectionChanged={{this.handleSelectionChanged}}
                    @onItemHovered={{this.handleItemHovered}}
                    @onVisibleRegionChanged={{this.handleVisibleRegionChanged}}
                    @onHeaderMenuClick={{this.handleHeaderMenuClick}}
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

                {{#if this.headerMenu}}
                    {{! `bounds` is grid-root-relative, and this div is a child of the grid's own
                        (positioned) container -- so the coordinates need no translation. }}
                    <div class="gdg-demo-sort-menu" role="menu" data-test-header-menu style={{this.headerMenuStyle}}>
                        <div class="gdg-demo-sort-menu__title">Column {{this.headerMenu.col}}</div>
                        <button type="button" class="gdg-demo-sort-menu__item" {{on "click" this.closeHeaderMenu}}>
                            Close
                        </button>
                    </div>
                {{/if}}
            </div>

            {{#if this.contextMenu}}
                {{! Consumer-owned chrome, positioned from the event's viewport coordinates. }}
                <div class="gdg-demo-sort-menu" role="menu" data-test-context-menu style={{this.contextMenuStyle}}>
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
