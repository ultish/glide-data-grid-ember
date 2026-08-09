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
                "A column **with** `width` is fixed. A column **without** one is auto-sized: the grid measures a sample of its cells plus its own title, clamped by `@minColumnWidth` / `@maxColumnWidth` (default 50 / 500). There is no `width: \"auto\"`.",
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
            text: "**`grow` is orthogonal to `width`, not an alternative to it.** A fixed-width column with `grow: 1` is a perfectly ordinary way to say \"take the slack\", and an auto-sized column without `grow` still ignores the leftover space. Because of that split, the resize callbacks report *two* sizes: `newSize` is the column's own width and `newSizeWithGrow` adds back the share it was given. Write `newSize` back into your `columns` array — writing `newSizeWithGrow` back would grow the column again on the next layout.",
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
    ],
};
