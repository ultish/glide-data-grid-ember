import type { Section } from "./types.ts";

export const sortingSection: Section = {
    id: "sorting",
    title: "Sorting, and the header menu",
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
            text: "**Bind the `onCellsEdited` the decorator hands back, not your own.** A decorator that remaps rows for reading must remap them for writing too, or an edit on a sorted grid silently lands on the wrong record — and you will not see it until the next re-sort. `withColumnSort` does that translation, but only if the edit handler passes *through* it, which the spread above arranges. (`getOriginalIndex` remains as an escape hatch; you shouldn't need it.) `@onSelectionChanged` deliberately reports **displayed** rows, since that is what is visually selected — see **Guide 7** for the general rule this is an instance of.",
        },
        {
            kind: "code",
            text: `openSortMenu = (col, bounds) => {
  // \`col\` includes the row-marker column if you have one;
  // \`bounds\` is the chevron's rect in grid-root-relative pixels.
  this.menu = { col, bounds };
};

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
};
