// `@onItemHovered` — the tooltip recipe.
//
// Its own chapter rather than a bullet in "Selection", because tooltips are the single most
// commonly-asked-for thing this addon could not do before 9g, and because the *placement* half (grid
// coordinates → a positioned DOM element) is the part people get wrong. That half is the same trick
// the sorting chapter's header menu uses, so the two cross-reference rather than repeat.
import type { Section } from "./types.ts";

export const hoverSection: Section = {
    id: "hover",
    title: "Hover, and building a tooltip",
    blocks: [
        {
            kind: "p",
            text: "`@onItemHovered` fires whenever the hovered cell or header **changes**, and once more when the pointer leaves the grid. It is emitted on change only — never per `mousemove` — so your work stays off the pointer path. This is what tooltips, row highlights and hover-driven side panels are built on; the grid ships none of them.",
        },
        {
            kind: "code",
            text: `import { headerKind, outOfBoundsKind } from "glide-data-grid-ember/rendering/index";

@tracked tip = undefined;

handleItemHovered = args => {
  if (args.kind === outOfBoundsKind) { this.tip = undefined; return; }   // pointer left the grid
  const [col, row] = args.location;
  if (args.kind === headerKind) { this.tip = { text: COLUMNS[col].help, bounds: args.bounds }; return; }
  this.tip = { text: this.people[row]?.notes, bounds: args.bounds };
};`,
        },
        {
            kind: "list",
            items: [
                '`args.kind` is `"cell"`, `"header"`, `"group-header"` or `"out-of-bounds"`. Narrow with the exported `headerKind` / `groupHeaderKind` / `outOfBoundsKind` constants — they are value exports precisely so a typo is a compile error.',
                "`args.location` is `[col, row]` in **your** coordinate space: the row-marker column is already subtracted, matching `@onCellsEdited`. Hovering the marker column itself reports `col -1`.",
                "`args.bounds` is the hovered cell's rectangle **in grid-root-relative pixels** — position your tooltip against it, no translation needed. `out-of-bounds` has no bounds.",
                "Header and group-header events also carry `args.group`. Cells carry `args.isFillHandle`, so you can suppress a tooltip over the fill square.",
                "Modifier state (`shiftKey`, `ctrlKey`, `metaKey`) and `isTouch` ride along on every variant.",
            ],
        },
        {
            kind: "p",
            text: "Render the tooltip as a positioned child of the same container the grid is in, exactly as the sorting chapter's header menu does — then `args.bounds` is already in the right coordinate space:",
        },
        {
            kind: "code",
            text: `get tipStyle() {
  const b = this.tip.bounds;
  return htmlSafe(\`position: absolute; left: \${b.x}px; top: \${b.y + b.height}px\`);
}

<div style="position: relative; height: 480px">
  <GlideDataGrid @onItemHovered={{this.handleItemHovered}} ... />
  {{#if this.tip}}<div role="tooltip" style={{this.tipStyle}}>{{this.tip.text}}</div>{{/if}}
</div>`,
        },
        {
            kind: "note",
            text: "**Don't reach for `@drawCell` to draw a tooltip.** A canvas tooltip cannot be selected, cannot be read by a screen reader and clips at the grid's edge. Hover reports coordinates so you can use real DOM; that is the intended split.",
        },
        {
            kind: "p",
            text: "The **Full grid demo** prints what `@onItemHovered` last reported, under the grid — useful as a live reference for the shape of the argument.",
        },
    ],
};
