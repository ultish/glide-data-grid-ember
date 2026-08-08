import type { Section } from "./types.ts";

export const columnsSection: Section = {
    id: "columns",
    title: "Columns",
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
};
