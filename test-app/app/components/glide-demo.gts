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
import { on } from "@ember/modifier";
import { htmlSafe } from "@ember/template";
import { registerDestructor } from "@ember/destroyable";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { withColumnSort, type ColumnSort, type ColumnSortResult } from "glide-data-grid-ember/data-source/index";
import {
    allExtraCells,
    type GridCell,
    type GridColumn,
    type Item,
    type Rectangle,
} from "glide-data-grid-ember/rendering/index";
import { GLIDE_DEMO_COLUMNS, GLIDE_DEMO_ROW_COUNT, makeGlideDemoGetCellContent } from "test-app/utils/glide-demo-data";

// The "Performance" column is a Phase 5a sparkline `CustomCell`; the Phase 4 built-in registry
// alone can't render it. `@extraCells` (Phase 9) hands the array straight to the grid, which
// combines it with the built-in registry behind a `@cached` getter -- so this demo no longer builds
// a `getCellRenderer` itself. `allExtraCells` is a module-scope constant, i.e. the stable reference
// that arg wants.

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

    // Open sort menu, if any. `col` is in the consumer's column space (row-marker already
    // subtracted); `bounds` is the menu glyph's rect in grid-root-relative coordinates, which is
    // exactly the space the absolutely-positioned menu below is laid out in.
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
     * Committed cell edits, keyed `"<originalRow>:<columnId>"`.
     *
     * The grid never mutates consumer data -- `onCellsEdited` is a *notification*, and applying it
     * is the consumer's job (same contract as `onColumnResize`/`onColumnMoved` above). Without this
     * map and its handler, the overlay editor opens and accepts input but every commit is silently
     * dropped -- and so are Delete and paste, which funnel through the same callback.
     *
     * Keyed by **original** row (not displayed row) so edits survive re-sorting, and by **column
     * id** (not index) so they survive a column reorder.
     */
    @tracked edits: ReadonlyMap<string, GridCell> = new Map();

    /**
     * The undecorated cell accessor, with committed edits layered on top.
     *
     * Note the row index reaching this closure is already the **original** index: `withColumnSort`
     * remaps `row` before delegating, so everything below the decorator works in unsorted space.
     *
     * Keyed on `this.columns` (it closes over the column order) and `this.edits`. Re-reading after
     * an edit yields a new closure identity, which is correct -- the data really did change, so the
     * blit fast path *should* be invalidated and the sort map rebuilt.
     */
    @cached
    get baseGetCellContent(): (item: Item) => GridCell {
        const inner = makeGlideDemoGetCellContent(this.columns);
        const edits = this.edits;
        if (edits.size === 0) return inner;
        const fieldIds = this.columns.map(c => c.id ?? "");
        return (item: Item): GridCell => {
            const [col, row] = item;
            return edits.get(`${row}:${fieldIds[col] ?? ""}`) ?? inner(item);
        };
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
     * Phase 7a's decorator, with Phase 8a's write path. Identity-stable by construction:
     * `withColumnSort` memoizes internally on the incoming `getCellContent` identity + the incoming
     * `onCellsEdited` identity + a *structural* digest of the sort, and returns both original
     * references untouched when there is no sort. The `@cached` here is belt-and-braces.
     *
     * `applyEdits` is passed *in* here rather than being wired to the grid directly; the grid gets
     * `this.sortResult.onCellsEdited`, which has already translated every row index out of displayed
     * space. `applyEdits` is a class-field arrow (the Ember 6 idiom that replaces `@action`), which
     * is created once per instance and so is a stable reference -- exactly what the memo needs.
     */
    @cached
    get sortResult(): ColumnSortResult {
        return withColumnSort({
            columns: this.displayColumns,
            rows: GLIDE_DEMO_ROW_COUNT,
            getCellContent: this.baseGetCellContent,
            onCellsEdited: this.applyEdits,
            sort: this.sort,
        });
    }

    get getCellContent(): (item: Item) => GridCell {
        return this.sortResult.getCellContent;
    }

    get onCellsEdited(): ColumnSortResult["onCellsEdited"] {
        return this.sortResult.onCellsEdited;
    }

    // --- Sort menu ------------------------------------------------------------------------------

    get menuColumnId(): string | undefined {
        const state = this.menuState;
        if (state === undefined) return undefined;
        return this.displayColumns[state.col]?.id;
    }

    get menuColumnTitle(): string {
        const state = this.menuState;
        if (state === undefined) return "";
        return this.columns[state.col]?.title ?? "";
    }

    get menuSortAscActive(): boolean {
        return (
            this.sortColumnId !== undefined && this.sortColumnId === this.menuColumnId && this.sortDirection === "asc"
        );
    }

    get menuSortDescActive(): boolean {
        return (
            this.sortColumnId !== undefined && this.sortColumnId === this.menuColumnId && this.sortDirection === "desc"
        );
    }

    get menuStyle(): ReturnType<typeof htmlSafe> {
        const bounds = this.menuState?.bounds;
        if (bounds === undefined) return htmlSafe("");
        // Right-align the menu against the glyph, clamped so it can't hang off the left edge.
        const left = Math.max(4, bounds.x + bounds.width - MENU_WIDTH_PX);
        const top = bounds.y + bounds.height + 2;
        return htmlSafe(`left: ${left}px; top: ${top}px; width: ${MENU_WIDTH_PX}px;`);
    }

    handleHeaderMenuClick = (col: number, bounds: Rectangle): void => {
        this.menuState = { col, bounds };
    };

    closeMenu = (): void => {
        this.menuState = undefined;
    };

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

    sortAscending = (): void => {
        this.applySort("asc");
    };

    sortDescending = (): void => {
        this.applySort("desc");
    };

    // --- Cell edits ------------------------------------------------------------------------------

    /**
     * Applies committed edits from the overlay editor, the Delete key, and paste -- all three
     * funnel through this one callback.
     *
     * **This is handed to `withColumnSort`, not to the grid**, so `location[1]` has already been
     * translated out of displayed row space into the original record order this component's edit map
     * is keyed on. Wiring it to `<GlideDataGrid @onCellsEdited=...>` directly would reintroduce the
     * Phase 7f bug: an edit on a sorted grid would be stored against a different person's record,
     * invisibly until the next re-sort. (Before Phase 8a the decorator had no write path, and this
     * method had to call `sortResult.getOriginalIndex(displayedRow)` itself -- that remains available
     * as an escape hatch but is no longer the recommended shape.)
     *
     * `location[0]` is already in *real* column space -- the grid strips the row-marker column at
     * the callback boundary -- so it indexes `this.columns` directly.
     */
    applyEdits = (edits: readonly { location: Item; value: GridCell }[]): void => {
        const next = new Map(this.edits);
        for (const { location, value } of edits) {
            const [col, originalRow] = location;
            const fieldId = this.columns[col]?.id;
            if (fieldId === undefined) continue;
            next.set(`${originalRow}:${fieldId}`, value);
        }
        this.edits = next;
    };

    // --- Column resize / reorder -----------------------------------------------------------------

    handleColumnResize = (_column: GridColumn, newSize: number, colIndex: number): void => {
        this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
    };

    handleColumnMoved = (startIndex: number, endIndex: number): void => {
        const cols = [...this.columns];
        const [moved] = cols.splice(startIndex, 1);
        if (moved === undefined) return;
        cols.splice(endIndex, 0, moved);
        this.columns = cols;
        this.menuState = undefined;
    };

    <template>
        <div style="position: relative; width: 100%; height: 100%;">
            <GlideDataGrid
                @columns={{this.displayColumns}}
                @getCellContent={{this.getCellContent}}
                @extraCells={{allExtraCells}}
                @rows={{GLIDE_DEMO_ROW_COUNT}}
                @rowMarkers="both"
                @rowSelect="multi"
                @groupHeaderHeight={{28}}
                @headerHeight={{34}}
                @onCellsEdited={{this.onCellsEdited}}
                @onHeaderMenuClick={{this.handleHeaderMenuClick}}
                @onColumnResize={{this.handleColumnResize}}
                @onColumnMoved={{this.handleColumnMoved}}
            />

            {{#if this.menuState}}
                {{! Backdrop: closes the menu on any outside click, and keeps that click from also
                    reaching the grid underneath. }}
                {{! template-lint-disable no-invalid-interactive no-pointer-down-event-binding }}
                <div
                    data-test-sort-menu-backdrop
                    role="presentation"
                    style="position: fixed; inset: 0; z-index: 20;"
                    {{on "mousedown" this.closeMenu}}
                ></div>
                <div data-test-sort-menu style={{this.menuStyle}} class="gdg-demo-sort-menu">
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
