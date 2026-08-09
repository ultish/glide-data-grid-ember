import type { Section } from "./types.ts";

export const customCellsSection: Section = {
    id: "custom-cells",
    title: "Custom cell types",
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
        {
            kind: "p",
            text: "**Writing your own.** A custom cell is a `GridCell` of kind `Custom` carrying whatever `data` you like, plus a `CustomRenderer` that claims it:",
        },
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
};
