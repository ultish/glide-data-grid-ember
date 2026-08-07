// Phase 7c: a replica of the demo data grid on https://grid.glideapps.com/.
//
// Scope note: this is the **grid only**. The marketing page's hero banner, nav and six feature
// cards are deliberately not built (explicit user instruction narrowing PHASES.md's Phase 7 scope).
// The one non-grid piece of UI here is the column sort menu, which is grid interaction: the addon
// deliberately ships no menu UI (it only fires `onHeaderMenuClick(col, bounds)`), exactly like
// source, whose own header-menu story builds the menu as plain consumer code.
//
// What it exercises: column group headers (4 groups over 11 columns), numbered row markers +
// select-all, all the ported cell types the target site uses (text/image/boolean/uri/sparkline/
// drilldown/number), column resize + reorder, and real column sorting via the addon's Phase 7a
// `withColumnSort` decorator.
//
// -----------------------------------------------------------------------------------------------
// IDENTITY STABILITY -- read before editing any getter here.
// -----------------------------------------------------------------------------------------------
// `computeCanBlit` (`render/data-grid-render.blit.ts`) compares ~18 `DrawGridArg` fields by
// **identity**, and `getCellContent` is one of them. A getter that allocates a fresh closure on
// every read silently disables the scroll blit fast path -- no error, no warning, no visual
// difference, just a full repaint every frame. So: every derived arg below is behind `@cached`
// keyed on tracked inputs, `getCellRenderer` is built once at module scope, and nothing is
// constructed inline in the template. See PORTING-NOTES.md standing lesson #1.
import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { htmlSafe } from "@ember/template";
import { registerDestructor } from "@ember/destroyable";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { withColumnSort, type ColumnSort } from "glide-data-grid-ember/data-source/index";
import {
    getCellRenderer as defaultGetCellRenderer,
    createCombinedCellRenderer,
    allExtraCells,
    type GridCell,
    type GridColumn,
    type Item,
    type Rectangle,
} from "glide-data-grid-ember/rendering/index";
import {
    GLIDE_DEMO_COLUMNS,
    GLIDE_DEMO_ROW_COUNT,
    makeGlideDemoGetCellContent,
} from "test-app/utils/glide-demo-data";

// The "Performance" column is a Phase 5a sparkline `CustomCell`; the Phase 4 built-in registry
// alone can't render it. Built once at module scope -- neither input ever changes.
const getCellRenderer = createCombinedCellRenderer(defaultGetCellRenderer, allExtraCells);

// `rowMarkers: "both"` prepends one synthetic marker column inside the grid, so the `col` index
// handed to `onHeaderMenuClick` (and every other mangled-space index) is one greater than the
// consumer's own column index. See `grid-host-controller.ts`'s `rowMarkerOffset`.
const ROW_MARKER_OFFSET = 1;

const MENU_WIDTH_PX = 176;

type SortDirection = "asc" | "desc";

export default class GlideDemo extends Component {
    // Consumer owns column state: the grid never mutates `columns` itself, so resize/reorder only
    // stick because these handlers write back here (same contract as `<DemoGrid>`).
    @tracked columns: readonly GridColumn[] = GLIDE_DEMO_COLUMNS;

    // Sort state is stored as an id + direction rather than a `ColumnSort` object so it survives a
    // column reorder (which replaces the `GridColumn` objects' positions) and so the tracked state
    // stays primitive.
    @tracked sortColumnId: string | undefined = undefined;
    @tracked sortDirection: SortDirection = "asc";

    // Open sort menu, if any. `col` is in the grid's mangled column space (marker column included);
    // `bounds` is the menu glyph's rect in grid-root-relative coordinates, which is exactly the
    // space the absolutely-positioned menu below is laid out in.
    @tracked menuState: { readonly col: number; readonly bounds: Rectangle } | undefined = undefined;

    constructor(...args: ConstructorParameters<typeof Component>) {
        super(...args);
        // Escape-to-close. A document-level listener rather than a template `{{on "keydown"}}`
        // because focus is usually inside the grid's own root element (or nowhere at all, right
        // after the backdrop swallows a click), and the grid stops some keys itself.
        document.addEventListener("keydown", this.handleDocumentKeydown, true);
        registerDestructor(this, () => {
            document.removeEventListener("keydown", this.handleDocumentKeydown, true);
        });
    }

    // --- Derived grid args ---------------------------------------------------------------------

    /**
     * The columns actually handed to the grid: the tracked list, with a sort arrow appended to the
     * sorted column's title so the current sort is visible on the canvas header itself (the menu
     * below also marks it). Separate from `this.columns` so resize/reorder handlers can keep
     * writing plain, arrow-free titles back.
     */
    @cached
    get displayColumns(): readonly GridColumn[] {
        const sortedId = this.sortColumnId;
        if (sortedId === undefined) return this.columns;
        const arrow = this.sortDirection === "asc" ? " ↑" : " ↓";
        return this.columns.map(c => (c.id === sortedId ? { ...c, title: `${c.title}${arrow}` } : c));
    }

    /**
     * The undecorated cell accessor. Keyed on `this.columns` identity: it closes over the column
     * order (a reorder changes which field physical column N shows), and nothing else.
     */
    @cached
    get baseGetCellContent(): (item: Item) => GridCell {
        return makeGlideDemoGetCellContent(this.columns);
    }

    @cached
    get sort(): ColumnSort | undefined {
        const id = this.sortColumnId;
        if (id === undefined) return undefined;
        const column = this.displayColumns.find(c => c.id === id);
        if (column === undefined) return undefined;
        // "smart" so the numeric Level column sorts 2 < 10 rather than lexicographically. For the
        // plain-text columns it is identical to the default `localeCompare`.
        return { column, direction: this.sortDirection, mode: "smart" };
    }

    /**
     * Phase 7a's decorator. Identity-stable by construction: `withColumnSort` memoizes internally on
     * the incoming `getCellContent` identity + a *structural* digest of the sort, and returns the
     * original reference untouched when there is no sort. The `@cached` here is belt-and-braces.
     */
    @cached
    get getCellContent(): (item: Item) => GridCell {
        return withColumnSort({
            columns: this.displayColumns,
            rows: GLIDE_DEMO_ROW_COUNT,
            getCellContent: this.baseGetCellContent,
            sort: this.sort,
        }).getCellContent;
    }

    // --- Sort menu ------------------------------------------------------------------------------

    get menuColumnId(): string | undefined {
        const state = this.menuState;
        if (state === undefined) return undefined;
        return this.displayColumns[state.col - ROW_MARKER_OFFSET]?.id;
    }

    get menuColumnTitle(): string {
        const state = this.menuState;
        if (state === undefined) return "";
        return this.columns[state.col - ROW_MARKER_OFFSET]?.title ?? "";
    }

    get menuSortAscActive(): boolean {
        return this.sortColumnId !== undefined && this.sortColumnId === this.menuColumnId && this.sortDirection === "asc";
    }

    get menuSortDescActive(): boolean {
        return this.sortColumnId !== undefined && this.sortColumnId === this.menuColumnId && this.sortDirection === "desc";
    }

    get menuStyle(): ReturnType<typeof htmlSafe> {
        const bounds = this.menuState?.bounds;
        if (bounds === undefined) return htmlSafe("");
        // Right-align the menu against the glyph, clamped so it can't hang off the left edge.
        const left = Math.max(4, bounds.x + bounds.width - MENU_WIDTH_PX);
        const top = bounds.y + bounds.height + 2;
        return htmlSafe(`left: ${left}px; top: ${top}px; width: ${MENU_WIDTH_PX}px;`);
    }

    @action
    handleHeaderMenuClick(col: number, bounds: Rectangle): void {
        this.menuState = { col, bounds };
    }

    @action
    closeMenu(): void {
        this.menuState = undefined;
    }

    private readonly handleDocumentKeydown = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape" && this.menuState !== undefined) {
            this.menuState = undefined;
        }
    };

    private applySort(direction: SortDirection): void {
        const id = this.menuColumnId;
        this.menuState = undefined;
        if (id === undefined) return;
        this.sortColumnId = id;
        this.sortDirection = direction;
    }

    @action
    sortAscending(): void {
        this.applySort("asc");
    }

    @action
    sortDescending(): void {
        this.applySort("desc");
    }

    // --- Column resize / reorder -----------------------------------------------------------------

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
        this.menuState = undefined;
    }

    <template>
        <div style="position: relative; width: 100%; height: 100%;">
            <GlideDataGrid
                @columns={{this.displayColumns}}
                @getCellContent={{this.getCellContent}}
                @getCellRenderer={{getCellRenderer}}
                @rows={{GLIDE_DEMO_ROW_COUNT}}
                @rowMarkers="both"
                @rowSelect="multi"
                @groupHeaderHeight={{28}}
                @headerHeight={{34}}
                @onHeaderMenuClick={{this.handleHeaderMenuClick}}
                @onColumnResize={{this.handleColumnResize}}
                @onColumnMoved={{this.handleColumnMoved}}
            />

            {{#if this.menuState}}
                {{! Backdrop: closes the menu on any outside click, and keeps that click from also
                    reaching the grid underneath. }}
                <div
                    data-test-sort-menu-backdrop
                    role="presentation"
                    style="position: fixed; inset: 0; z-index: 20;"
                    {{on "mousedown" this.closeMenu}}
                ></div>
                <div
                    data-test-sort-menu
                    style={{this.menuStyle}}
                    class="gdg-demo-sort-menu"
                >
                    <div class="gdg-demo-sort-menu__title">{{this.menuColumnTitle}}</div>
                    <button
                        type="button"
                        data-test-sort-asc
                        class="gdg-demo-sort-menu__item"
                        {{on "click" this.sortAscending}}
                    >
                        <span class="gdg-demo-sort-menu__check">{{if this.menuSortAscActive "✓" ""}}</span>
                        Sort ascending
                    </button>
                    <button
                        type="button"
                        data-test-sort-desc
                        class="gdg-demo-sort-menu__item"
                        {{on "click" this.sortDescending}}
                    >
                        <span class="gdg-demo-sort-menu__check">{{if this.menuSortDescActive "✓" ""}}</span>
                        Sort descending
                    </button>
                </div>
            {{/if}}
        </div>
    </template>
}
