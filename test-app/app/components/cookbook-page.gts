// Phase 10b: the consumer cookbook, as a real page rather than a markdown file.
//
// It lives in the test-app on purpose: this app is what gets deployed, so the cookbook ships with
// the demos it describes, and the "one-line render" recipe at the top is an actual live grid rather
// than a screenshot of one. The addon's README covers install and the minimal render and links
// here; `DATA.md` and `THEMING.md` remain the deep guides and are not restated.
//
// Content is a plain data model (`SECTIONS` below) rendered by a small template, for two reasons:
// code samples containing `{{ }}` would otherwise be parsed as Glimmer, and keeping prose as data
// means editing a recipe is editing one string rather than surgery on markup.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { htmlSafe } from "@ember/template";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

// --- the live example at the top of the page ---------------------------------------------------
// Deliberately the exact code the first recipe shows, so the two cannot drift.
const LIVE_COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 190 },
    { id: "email", title: "Email", width: 240 },
    { id: "role", title: "Role", width: 150 },
];

const LIVE_PEOPLE = [
    { name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" },
    { name: "Grace Hopper", email: "grace@example.com", role: "Rear Admiral" },
    { name: "Alan Turing", email: "alan@example.com", role: "Cryptanalyst" },
    { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
    { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

function text(value: string): GridCell {
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
}

// --- content model ------------------------------------------------------------------------------

type Block =
    | { kind: "p"; text: string }
    | { kind: "code"; text: string }
    | { kind: "list"; items: readonly string[] }
    | { kind: "note"; text: string }
    | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }
    | { kind: "live" };

interface Section {
    readonly id: string;
    readonly title: string;
    readonly blocks: readonly Block[];
}

const SECTIONS: readonly Section[] = [
    {
        id: "render",
        title: "1. Install and render",
        blocks: [
            { kind: "code", text: `ember install glide-data-grid-ember` },
            {
                kind: "p",
                text: "The grid never sees your array. It asks `@getCellContent` for one cell at a time, only for the cells it is actually painting — which is why 200,000 rows costs about what 20 does.",
            },
            {
                kind: "code",
                text: `import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind } from "glide-data-grid-ember/rendering/index";

const columns = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const people = [
  { name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" },
  // ...
];

function getCellContent([col, row]) {
  const person = people[row];
  const value = [person.name, person.email, person.role][col];
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
}

<template>
  {{! The grid fills its container — so the container needs a height. }}
  <div style="height: 220px">
    <GlideDataGrid
      @columns={{columns}}
      @rows={{people.length}}
      @getCellContent={{getCellContent}}
    />
  </div>
</template>`,
            },
            { kind: "p", text: "That code, running:" },
            { kind: "live" },
            {
                kind: "list",
                items: [
                    "**`@rows` is a count, not data.** Nothing is materialised up front.",
                    "**`@getCellContent` receives `[column, row]`** — both zero-based, both in *your* coordinate space. Row markers, frozen columns and the trailing blank row are the grid's business; it never shifts your indices.",
                    "**The grid sizes itself to its container, and has no `width`/`height` args.** A container with no height renders a zero-height grid. This is the most common \"nothing appears\" cause.",
                    "**The addon imports its own CSS.** There is no stylesheet to add and none to forget.",
                ],
            },
        ],
    },
    {
        id: "columns",
        title: "2. Columns",
        blocks: [
            {
                kind: "code",
                text: `const columns = [
  { id: "name",  title: "Name", width: 200 },                    // fixed width
  { id: "notes", title: "Notes" },                               // auto-sized from content
  { id: "score", title: "Score", width: 90,
    group: "Metrics", icon: "headerNumber", hasMenu: true },
];`,
            },
            {
                kind: "list",
                items: [
                    "A column **with** `width` is fixed. A column **without** one is auto-sized: the grid measures a sample of its cells plus its own title, clamped by `@minColumnWidth` / `@maxColumnWidth` (default 50 / 500). There is no `width: \"auto\"`.",
                    "Auto-sizing works through each cell renderer's `measure()`, and most *custom* renderers don't have one — a custom-cell column falls back to a flat 150px.",
                    "`group` turns on the second header row. Grouping is automatic: set `group` on any column and the band appears.",
                    "`icon` draws a header glyph. The built-in set is the `GridColumnIcon` enum; add your own with `@headerIcons`.",
                    "`hasMenu` draws the chevron and makes `@onHeaderMenuClick` fire.",
                    "**You own column state.** Resize and reorder are notifications — write the new `columns` array back yourself or nothing sticks.",
                ],
            },
            {
                kind: "code",
                text: `@tracked columns = COLUMNS;

@action
handleColumnResize(column, newSize, colIndex) {
  this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
}

@action
handleColumnMoved(from, to) {
  const next = [...this.columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  this.columns = next;
}`,
            },
        ],
    },
    {
        id: "data",
        title: "3. Where the data comes from",
        blocks: [
            {
                kind: "p",
                text: "`DATA.md` in the addon is the full answer and is not restated here. The packaged version of its recommended pattern is `recordsSource`:",
            },
            {
                kind: "code",
                text: `import { recordsSource } from "glide-data-grid-ember/data-source/index";

// Module scope: both must be identity-stable — the per-row caches close over them.
const COLUMNS = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 260 },
];

function toCell(person, col) {
  const value = col === 0 ? person.name : person.email;
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
}

function onCellEdited(person, col, value) {
  if (col === 0) person.name = value.data;    // a tracked field on the record
  else person.email = value.data;
}

// In your component:
@cached
get gridArgs() {
  return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
}`,
            },
            {
                kind: "code",
                text: `<GlideDataGrid
  @columns={{this.gridArgs.columns}}
  @rows={{this.gridArgs.rows}}
  @getCellContent={{this.gridArgs.getCellContent}}
  @onCellsEdited={{this.gridArgs.onCellsEdited}}
/>`,
            },
            {
                kind: "p",
                text: "Note the singular/plural: you write the **per-record** `onCellEdited`, and get back the batched, index-based `onCellsEdited` the grid wants.",
            },
            {
                kind: "p",
                text: "`recordsSource` memoises per record, so editing one field in a 1,000-row table re-projects one row rather than a thousand — measured in a browser, not assumed. For data that isn't in memory, `AsyncRecordsSource` pages it in as `@onVisibleRegionChanged` reports what's on screen; the **Async paging** demo is that, live.",
            },
            {
                kind: "p",
                text: "`toCell` is a plain accessor function, deliberately: no path-string syntax, and the addon depends on no object-traversal library. Dig values out however you like on your side of the boundary.",
            },
        ],
    },
    {
        id: "editing",
        title: "4. Editing",
        blocks: [
            { kind: "note", text: "**The grid never mutates your data.** Every write is a notification; applying it is yours." },
            {
                kind: "code",
                text: `@tracked edits = new Map();

getCellContent = ([col, row]) => {
  return this.edits.get(\`\${col},\${row}\`) ?? this.baseCell(col, row);
};

@action
handleCellsEdited(edits) {
  const next = new Map(this.edits);
  for (const e of edits) next.set(\`\${e.location[0]},\${e.location[1]}\`, e.value);
  this.edits = next;          // replace, don't mutate — tracking is on the reference
}`,
            },
            {
                kind: "list",
                items: [
                    "`@onCellsEdited` fires with a **batch**, once per gesture — one call for a paste, one for a fill-handle drag, one for a delete over a range. Handle the array, not a single edit.",
                    "A cell is editable when it says so: `allowOverlay: true` opens the overlay editor, `readonly: true` blocks writes.",
                    "**Copy and paste work out of the box** — real clipboard events, TSV plus an HTML `<table>` so Excel and Sheets round-trip correctly. Nothing to wire.",
                    "Overlay editors are real DOM and are styleable by your app; the addon ships their CSS scoped under `.gdg-root`.",
                ],
            },
            {
                kind: "code",
                text: `{{! trailing "add row" affordance }}
<GlideDataGrid @showTrailingBlankRow={{true}} @onRowAppended={{this.addRow}} ... />`,
            },
            {
                kind: "p",
                text: "The blank row is synthetic — never a row your `@getCellContent` is asked for. Widen your data in `onRowAppended` and the grid picks it up.",
            },
        ],
    },
    {
        id: "selection",
        title: "5. Selection, row markers, reordering, fill",
        blocks: [
            {
                kind: "code",
                text: `<GlideDataGrid
  @rowMarkers="both"          {{! none | checkbox | number | both | clickable-number }}
  @rowSelect="multi"
  @columnSelect="multi"
  @rangeSelect="rect"         {{! none | cell | rect | multi-cell | multi-rect }}
  @onSelectionChanged={{this.handleSelectionChanged}}
  ...
/>`,
            },
            {
                kind: "p",
                text: "Row markers are a **native grid feature**, not something you build: the checkbox column, the tri-state select-all in the header, shift-to-extend and drag-to-extend all come with it.",
            },
            {
                kind: "code",
                text: `@action
handleSelectionChanged(selection) {
  // selection.current?.cell   -> [col, row] of the focused cell
  // selection.current?.range  -> { x, y, width, height }
  // selection.rows / .columns -> CompactSelection (sparse, iterable, .hasIndex(), .length)
  this.selectedRowCount = selection.rows.length;
}`,
            },
            {
                kind: "p",
                text: "`@onSelectionChanged` reports **displayed** rows. That is deliberate — it is what is visually selected. Contrast the *write* path under sorting, where displayed-space is a trap.",
            },
            { kind: "p", text: "**Row reordering.** Setting `@onRowMoved` both enables the drag and draws the handle dots on the marker cells. It needs a marker column — that column is what you grab. The grid previews the move live and throws the preview away on drop, so you must reorder your data:" },
            {
                kind: "code",
                text: `<GlideDataGrid @rowMarkers="both" @onRowMoved={{this.handleRowMoved}} ... />

@action
handleRowMoved(from, to) {
  const next = [...this.people];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  this.people = next;
}`,
            },
            { kind: "p", text: "**Fill handle.** Off by default. When on, dragging the small square at the selection's bottom-right corner tiles the selected pattern across the dragged region and reports the writes through `@onCellsEdited` — so the handler above is all you need." },
            {
                kind: "code",
                text: `<GlideDataGrid
  @fillHandle={{true}}
  @allowedFillDirections="orthogonal"   {{! orthogonal | vertical | horizontal | any }}
  @getCellsForSelection={{true}}
  @onCellsEdited={{this.handleCellsEdited}}
  ...
/>`,
            },
            { kind: "p", text: "`@onFillPattern` fires first if you want to inspect the fill or `preventDefault()` it and do your own." },
        ],
    },
    {
        id: "sorting",
        title: "6. Sorting, and the header menu",
        blocks: [
            {
                kind: "p",
                text: "The grid has **no sort**, and that is not an omission — the upstream library doesn't either. Sorting is a data concern, so it lives in the data-source layer, and the menu is ordinary app chrome.",
            },
            {
                kind: "code",
                text: `import { withColumnSort } from "glide-data-grid-ember/data-source/index";

@tracked sort = undefined;    // { column, direction: "asc" | "desc" } | undefined

@cached
get gridArgs() {
  const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
  return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
}`,
            },
            {
                kind: "p",
                text: "The two compose by spreading because `recordsSource` returns its fields under exactly the names `withColumnSort` takes.",
            },
            {
                kind: "note",
                text: "**Bind the `onCellsEdited` the decorator hands back, not your own.** A decorator that remaps rows for reading must remap them for writing too, or an edit on a sorted grid silently lands on the wrong record. `withColumnSort` does that translation — but only if the edit handler passes *through* it, which the spread above arranges. (`getOriginalIndex` remains as an escape hatch; you shouldn't need it.)",
            },
            {
                kind: "code",
                text: `@action
openSortMenu(col, bounds) {
  // \`col\` includes the row-marker column if you have one;
  // \`bounds\` is the chevron's rect in grid-root-relative pixels.
  this.menu = { col, bounds };
}

// Render the menu as a positioned child of the grid's own container,
// so those bounds need no translation:
<div style="position: relative; height: 480px">
  <GlideDataGrid @onHeaderMenuClick={{this.openSortMenu}} ... />
  {{#if this.menu}}<div style={{this.menuStyle}} role="menu"> ... </div>{{/if}}
</div>`,
            },
            {
                kind: "p",
                text: "`@onHeaderMenuClick` fires only for a click on the chevron glyph itself, and only on columns with `hasMenu: true` — clicking the header body runs ordinary column selection instead. The **Glide demo grid** tab has a working sort menu built exactly this way.",
            },
        ],
    },
    {
        id: "theming",
        title: "7. Theming",
        blocks: [
            { kind: "p", text: "`THEMING.md` in the addon is the full guide. The two-line version:" },
            {
                kind: "code",
                text: `import { getDataEditorDarkTheme } from "glide-data-grid-ember/rendering/index";

const DARK = getDataEditorDarkTheme();     // module scope — see the performance chapter

<GlideDataGrid @theme={{if this.isDark DARK undefined}} ... />`,
            },
            {
                kind: "p",
                text: "Overrides stack: `@theme` → `column.themeOverride` → `@getRowThemeOverride` → `cell.themeOverride`.",
            },
            {
                kind: "p",
                text: "**\"My app already has a design system.\"** The grid stamps every theme value onto its root as a `--gdg-*` custom property, and `CssThemeWatcher` reads a theme back *out* of CSS variables — so a Tailwind or DaisyUI palette can drive the canvas, and switching `data-theme` switches the grid. The **DaisyUI theming** tab is that, live.",
            },
        ],
    },
    {
        id: "search",
        title: "8. Search",
        blocks: [
            { kind: "p", text: "Two shapes, both driving the same engine. Take either — or both, as the full grid demo does." },
            { kind: "p", text: "**The addon's bar**, rendered in the grid's own block so it inherits the grid's CSS and theme. Cmd/Ctrl+F opens it; nothing else to write." },
            {
                kind: "code",
                text: `import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";

<GlideDataGrid @columns={{this.columns}} ... as |grid|>
  <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
</GlideDataGrid>`,
            },
            { kind: "p", text: "**Your own input**, anywhere in your app:" },
            {
                kind: "code",
                text: `<input value={{this.searchValue}} {{on "input" this.handleSearchInput}} />

<GlideDataGrid
  @showSearch={{true}}          {{! required: highlighting is gated on search being open }}
  @onReady={{this.handleReady}}
  @onSearchStateChange={{this.handleSearchState}}
  ...
/>

@action handleReady(api) { this.gridApi = api; }
@action handleSearchState(state) { this.searchState = state; }
@action handleSearchInput(ev) { this.gridApi?.setSearchValue(ev.target.value); }
// this.gridApi.searchNext() / .searchPrev() / .closeSearch()`,
            },
            {
                kind: "list",
                items: [
                    "`@showSearch={{true}}` takes control of visibility, so Escape and Cmd/Ctrl+F stop toggling it.",
                    "The scan is incremental and chunked, so it doesn't block on a large grid.",
                    "`RowID` cells are deliberately not searchable, matching upstream.",
                ],
            },
        ],
    },
    {
        id: "context-menus",
        title: "9. Context menus",
        blocks: [
            {
                kind: "code",
                text: `<GlideDataGrid
  @onCellContextMenu={{this.cellMenu}}
  @onHeaderContextMenu={{this.headerMenu}}
  @onGroupHeaderContextMenu={{this.groupMenu}}
  ...
/>

@action
cellMenu(location, event) {
  event.preventDefault();       // the browser menu is NOT suppressed unless you say so
  this.menu = { x: event.clientX, y: event.clientY, location };
}`,
            },
            {
                kind: "p",
                text: "The event carries `clientX`/`clientY` (viewport, for `position: fixed` chrome), `localEventX`/`localEventY` (grid-relative) and `bounds` (the target cell's rect). The row-marker column never fires these — it is not one of your columns.",
            },
        ],
    },
    {
        id: "custom-cells",
        title: "10. Custom cell types",
        blocks: [
            {
                kind: "p",
                text: "**The 13 extra cells that ship with the addon** — sparkline, star rating, tags, dropdown, multi-select, date picker, range, links, button, tree view, user profile, article, spinner:",
            },
            {
                kind: "code",
                text: `import { allExtraCells } from "glide-data-grid-ember/rendering/index";

<GlideDataGrid @extraCells={{allExtraCells}} ... />`,
            },
            {
                kind: "p",
                text: "`allExtraCells` is a module-scope constant, which is the stable reference this arg wants. Import individual renderers instead if you only need a few.",
            },
            { kind: "p", text: "**Writing your own.** A custom cell is a `GridCell` of kind `Custom` carrying whatever `data` you like, plus a `CustomRenderer` that claims it:" },
            {
                kind: "code",
                text: `import { GridCellKind } from "glide-data-grid-ember/rendering/index";

const progressRenderer = {
  kind: GridCellKind.Custom,

  // Claims the cell. Make this a real type guard — it is how the registry dispatches.
  isMatch: cell => cell.data?.kind === "progress",

  draw: (args, cell) => {
    const { ctx, theme, rect } = args;
    const pad = theme.cellHorizontalPadding;
    const pct = Math.max(0, Math.min(1, cell.data.value));
    const y = rect.y + rect.height / 2 - 3;
    ctx.fillStyle = theme.bgBubble;
    ctx.fillRect(rect.x + pad, y, rect.width - pad * 2, 6);
    ctx.fillStyle = theme.accentColor;
    ctx.fillRect(rect.x + pad, y, (rect.width - pad * 2) * pct, 6);
    return true;                          // true = "I drew it"
  },

  onPaste: (value, data) => ({ ...data, value: Number(value) }),
  measure: (ctx, cell, theme) => 120,     // only needed if the column is auto-sized
  needsHover: false,                      // true if draw() reads args.hoverAmount
  // provideEditor: () => ({ editor: makeEditorElement }),   // omit for display-only
};`,
            },
            {
                kind: "list",
                items: [
                    "**`draw` must return `true`** if it painted. Returning `false`/`undefined` lets the default drawing run underneath.",
                    "**Read `args.theme`, never a hard-coded colour** — that is what makes your cell theme itself, and it already carries any per-column/row/cell override.",
                    "**Editors are DOM factories, not components.** They return `{ element, focus(), destroy() }`. The grid's controller deliberately has no Ember owner, so there is no `renderComponent` path yet.",
                    "**If your cell has a separate display field** (a formatted string alongside a raw value), every path that changes the raw value must recompute the display field in the same place. Nothing does it for you, and `draw` reads the display field.",
                ],
            },
        ],
    },
    {
        id: "performance",
        title: "11. Performance rules",
        blocks: [
            {
                kind: "note",
                text: "This is not an appendix. **The identity-stability rule is the single biggest silent footgun this addon has** — it has no error, no warning and no visual symptom.",
            },
            {
                kind: "p",
                text: "The render engine has a fast path: when only the scroll offsets changed, it *blits* the previous frame instead of repainting. To decide that, it compares about eighteen fields **by identity**. A freshly allocated value in any of them makes the check fail permanently, and the grid quietly repaints from scratch every frame.",
            },
            {
                kind: "p",
                text: "These args are identity-compared. Each must be a `@cached` getter, a module-scope constant, or a stable instance field — never an inline arrow or object literal in the template:",
            },
            {
                kind: "table",
                head: ["Arg", "Notes"],
                rows: [
                    ["`@getCellContent`", "the big one — a getter returning a fresh closure defeats it"],
                    ["`@theme`", "build it once; `getDataEditorDarkTheme()` at module scope"],
                    ["`@getRowThemeOverride`", "a plain function reference, not `{{fn this.x}}`"],
                    ["`@getCellRenderer` / `@extraCells`", "pass `allExtraCells`, or a `@cached` combination"],
                    ["`@prelightCells`", "pass `undefined` for \"none\", not `[]`"],
                    ["`@highlightRegions`", "same"],
                    ["`@columns`", "replaced wholesale on resize/reorder — just don't rebuild it per render"],
                ],
            },
            {
                kind: "code",
                text: `// ✗ a fresh closure every render — blit path silently off
get getCellContent() {
  return ([col, row]) => this.project(col, row);
}

// ✓ stable
getCellContent = ([col, row]) => this.project(col, row);

// ✓ also stable, and re-derived only when \`records\` changes
@cached get gridArgs() { return recordsSource({ records: this.records, columns: COLUMNS, toCell }); }`,
            },
            {
                kind: "p",
                text: "**The reactivity rule.** Autotracking only records reads made *during* the tracking frame. A `@getCellContent` closure that reads tracked state lazily — later, when the grid calls it — never registers a dependency, so mutating that state repaints nothing. `DATA.md` has the mechanism and the two patterns that work; `recordsSource` packages the safe one.",
            },
            {
                kind: "p",
                text: "**High-frequency updates.** A `@tracked` change triggers a full-viewport redraw, which is cheap because the grid is virtualised. For genuinely high-frequency streams — thousands of cells a second — bypass tracking and use the imperative damage API:",
            },
            {
                kind: "code",
                text: `@action handleReady(api) { this.api = api; }

// ...later, from a websocket tick:
this.api.updateCells([{ cell: [3, 91] }, { cell: [4, 91] }]);`,
            },
            {
                kind: "p",
                text: "That repaints exactly those cells. It is how the upstream library gets its numbers, and it is not something `@tracked` should be made to do on a large dataset. The **Streaming updates** tab measures it.",
            },
        ],
    },
    {
        id: "gotchas",
        title: "12. Gotchas worth knowing once",
        blocks: [
            {
                kind: "list",
                items: [
                    "**The grid is a canvas.** DOM-assertion testing buys almost nothing above the component boundary — there are no cell elements to query. Push assertions down into plain functions, or probe canvas pixels.",
                    "**The container needs a height.** Repeated because it is the most common first problem.",
                    "**`@rows` past the end of your data is your bug, not the grid's** — `@getCellContent` will be asked for those cells and must return something.",
                    "**The row-marker column is not one of your columns.** Every callback that hands you a column index has already removed it.",
                    "**Overlay editors clamp themselves to the window**, so one opened on a cell at the right edge nudges back into view rather than being cut off.",
                    "**Not implemented in this port** (deliberate, tracked): accessibility/ARIA, touch input, row grouping, undo/redo.",
                ],
            },
        ],
    },
];

// --- tiny inline formatter ----------------------------------------------------------------------
// Escapes first, then applies a deliberately small markdown subset: `code`, **bold**, and nothing
// else. Escaping before substitution is what makes the `htmlSafe` below safe; the content is
// module-scope constants in this file either way.
function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): ReturnType<typeof htmlSafe> {
    const escaped = escapeHtml(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        // Bold before italic: `**x**` would otherwise be eaten by the single-asterisk rule.
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return htmlSafe(escaped);
}

// Flattened for rendering: one uniform shape with `is*` booleans, rather than a discriminated union.
// Glimmer templates cannot narrow a union, so this is what keeps the template both type-checkable
// and free of helper gymnastics.
interface RenderBlock {
    readonly isP: boolean;
    readonly isCode: boolean;
    readonly isNote: boolean;
    readonly isList: boolean;
    readonly isTable: boolean;
    readonly isLive: boolean;
    readonly html: ReturnType<typeof htmlSafe> | undefined;
    readonly text: string;
    readonly htmlItems: readonly ReturnType<typeof htmlSafe>[];
    readonly head: readonly string[];
    readonly htmlRows: readonly (readonly ReturnType<typeof htmlSafe>[])[];
}

function toRenderBlock(block: Block): RenderBlock {
    return {
        isP: block.kind === "p",
        isCode: block.kind === "code",
        isNote: block.kind === "note",
        isList: block.kind === "list",
        isTable: block.kind === "table",
        isLive: block.kind === "live",
        html: block.kind === "p" || block.kind === "note" ? inline(block.text) : undefined,
        text: block.kind === "code" ? block.text : "",
        htmlItems: block.kind === "list" ? block.items.map(inline) : [],
        head: block.kind === "table" ? block.head : [],
        htmlRows: block.kind === "table" ? block.rows.map(row => row.map(inline)) : [],
    };
}

export default class CookbookPage extends Component {
    readonly sections = SECTIONS.map(section => ({
        id: section.id,
        title: section.title,
        blocks: section.blocks.map(toRenderBlock),
    }));

    readonly liveColumns = LIVE_COLUMNS;
    readonly liveRows = LIVE_PEOPLE.length;

    @tracked private liveEdits: ReadonlyMap<string, GridCell> = new Map();

    getCellContent = ([col, row]: Item): GridCell => {
        const edited = this.liveEdits.get(`${col},${row}`);
        if (edited !== undefined) return edited;
        const person = LIVE_PEOPLE[row];
        if (person === undefined) return text("");
        return text([person.name, person.email, person.role][col] ?? "");
    };

    @action
    handleCellsEdited(edits: readonly { location: Item; value: GridCell }[]): void {
        const next = new Map(this.liveEdits);
        for (const e of edits) next.set(`${e.location[0]},${e.location[1]}`, e.value);
        this.liveEdits = next;
    }

    <template>
        <div class="gdg-cookbook">
            <nav class="gdg-cookbook__toc">
                <div class="gdg-cookbook__toc-title">Cookbook</div>
                {{#each this.sections as |chapter|}}
                    <a href="#{{chapter.id}}">{{chapter.title}}</a>
                {{/each}}
                <div class="gdg-cookbook__toc-note">
                    Deep guides live in the addon:
                    <code>DATA.md</code>
                    and
                    <code>THEMING.md</code>. Every other tab above is a working demo of something
                    described here.
                </div>
            </nav>

            <article class="gdg-cookbook__body">
                <header class="gdg-cookbook__intro">
                    <h1>Using <code>&lt;GlideDataGrid&gt;</code> in an Ember app</h1>
                    <p>
                        Task-oriented recipes, each one copy-pasteable. They are lifted from the demos in
                        the other tabs — so if a recipe here stops working, a demo stops working.
                    </p>
                </header>

                {{! `section` would shadow the `<section>` element in a strict-mode template --
                    any lowercase tag matching an in-scope binding resolves to that binding. }}
                {{#each this.sections as |chapter|}}
                    <section id={{chapter.id}} class="gdg-cookbook__section">
                        <h2>{{chapter.title}}</h2>
                        {{#each chapter.blocks as |block|}}
                            {{#if block.isP}}
                                <p>{{block.html}}</p>
                            {{else if block.isCode}}
                                <pre class="gdg-cookbook__code"><code>{{block.text}}</code></pre>
                            {{else if block.isNote}}
                                <p class="gdg-cookbook__note">{{block.html}}</p>
                            {{else if block.isList}}
                                <ul>
                                    {{#each block.htmlItems as |item|}}<li>{{item}}</li>{{/each}}
                                </ul>
                            {{else if block.isTable}}
                                <table class="gdg-cookbook__table">
                                    <thead>
                                        <tr>{{#each block.head as |h|}}<th>{{h}}</th>{{/each}}</tr>
                                    </thead>
                                    <tbody>
                                        {{#each block.htmlRows as |row|}}
                                            <tr>{{#each row as |cell|}}<td>{{cell}}</td>{{/each}}</tr>
                                        {{/each}}
                                    </tbody>
                                </table>
                            {{else if block.isLive}}
                                <div class="gdg-cookbook__live" data-test-cookbook-live-grid>
                                    <GlideDataGrid
                                        @columns={{this.liveColumns}}
                                        @rows={{this.liveRows}}
                                        @getCellContent={{this.getCellContent}}
                                        @onCellsEdited={{this.handleCellsEdited}}
                                    />
                                </div>
                                <p class="gdg-cookbook__caption">
                                    A real grid, not a screenshot — click a cell, type, press Enter.
                                </p>
                            {{/if}}
                        {{/each}}
                    </section>
                {{/each}}
            </article>
        </div>
    </template>
}
