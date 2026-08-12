import type { Section } from "./types.ts";

export const columnsSection: Section = {
    id: "columns",
    title: "Columns",
    blocks: [
        {
            kind: "code",
            text: `const columns = [
  { id: "name",  title: "Name", width: 200 },                    // fixed width
  { id: "notes", title: "Notes", grow: 1 },                      // auto-sized, takes the slack
  { id: "score", title: "Score", width: 90,
group: "Metrics", icon: "headerNumber", hasMenu: true },
];`,
        },
        {
            kind: "list",
            items: [
                'A column **with** `width` is fixed. A column **without** one is auto-sized: the grid measures a sample of its cells plus its own title, clamped by `@minColumnWidth` / `@maxColumnWidth` (default 50 / 500). There is no `width: "auto"`.',
                "Auto-sizing works through each cell renderer's `measure()`, and most *custom* renderers don't have one — a custom-cell column falls back to a flat 150px.",
                "`group` turns on the second header row. Grouping is automatic: set `group` on any column and the band appears.",
                "`icon` draws a header glyph. The built-in set is the `GridColumnIcon` enum; add your own with `@headerIcons`.",
                "`hasMenu` draws the chevron and makes `@onHeaderMenuClick` fire.",
                "`grow` shares out whatever container width is left over once every column has its width, in proportion to each growing column's `grow` value — the same idea as CSS `flex-grow`, and the fix for a grid that leaves a dead strip on the right.",
                "**You own column state.** Resize and reorder are notifications — write the new `columns` array back yourself or nothing sticks.",
            ],
        },
        {
            kind: "note",
            text: '**`grow` is orthogonal to `width`, not an alternative to it.** A fixed-width column with `grow: 1` is a perfectly ordinary way to say "take the slack", and an auto-sized column without `grow` still ignores the leftover space. Because of that split, the resize callbacks report *two* sizes: `newSize` is the column\'s own width and `newSizeWithGrow` adds back the share it was given. Write `newSize` back into your `columns` array — writing `newSizeWithGrow` back would grow the column again on the next layout.',
        },
        {
            kind: "p",
            text: "**Customising the group band.** `group` on a column is only its key. `@getGroupDetails` decides what the strip above it shows — a different display name, an icon, a theme overlay for that strip and the headers under it, and `actions`: icon buttons drawn at the right-hand end that appear on hover and have their own click targets.",
        },
        {
            kind: "code",
            text: `getGroupDetails = (group) => ({
  name: group === "hr" ? "People" : group,   // omit to use the key itself
  icon: "headerRowID",
  overrideTheme: group === "hr" ? { bgHeader: "#2d3f5f" } : undefined,
  actions: [{ title: "Rename", icon: "renameIcon", onClick: e => this.rename(e) }],
});`,
        },
        {
            kind: "list",
            items: [
                "Return `undefined` (or leave fields out) to accept the defaults — only the fields you set change anything.",
                "**Clicking an action reports itself and nothing else**: no `@onGroupHeaderClicked`, and no group-column selection. That is source's behaviour, and it is what makes an action button usable at all.",
                "Pass a **stable** function — a class-field arrow, not an inline one. The grid keeps every render input reference-stable; see *Performance rules*.",
            ],
        },
        {
            kind: "p",
            text: "**Reordering columns for real** — including remapping edits back so they still land on the right field — is `withMovableColumns`. See the *Composing data-source hooks* chapter; the handler below is the by-hand version.",
        },
        {
            kind: "code",
            text: `@tracked columns = COLUMNS;

handleColumnResize = (column, newSize, colIndex) => {
  this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
};

handleColumnMoved = (from, to) => {
  const next = [...this.columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  this.columns = next;
};`,
        },
        {
            kind: "p",
            text: "**Freezing, overscroll and scroll shadows.** `@freezeColumns={{2}}` pins the first N columns while the rest scroll under them (a row-marker column is frozen on top of that, and counts as one). `@overscrollX` / `@overscrollY` add empty scrollable space past the last column and row, so a trailing column can be scrolled clear of anything floating over the grid's edge.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @freezeColumns={{2}}
  @overscrollY={{200}}      {{! 200px of empty space below the last row }}
  @fixedShadowX={{false}}   {{! both shadows are ON by default }}
/>`,
        },
        {
            kind: "list",
            items: [
                "The shadows are the depth cue that makes frozen columns and the header read as floating: one fades in over the frozen columns' right edge as you scroll sideways, one under the header as you scroll down. `@fixedShadowX` / `@fixedShadowY` turn them off.",
                "The X shadow needs something frozen to cast from — with no `@freezeColumns` and no row markers, there is nothing to draw and it stays hidden.",
                "Overscroll is scaled by `@scaleToRem` along with every other pixel dimension, so it keeps its proportion at a larger root font size.",
                "A column narrower than 10px paints its background and **skips its contents** — that floor is what keeps collapsed slivers clean. `@disableMinimumCellWidth` drops it to 1px if you genuinely want a hairline column to show something (you will want to cut its `cellHorizontalPadding` too, or the padding alone will consume the column).",
            ],
        },
    ],
};
