import type { Section } from "./types.ts";

export const renderSection: Section = {
    id: "render",
    title: "Install and render",
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
                '**The grid sizes itself to its container, and has no `width`/`height` args.** A container with no height renders a zero-height grid. This is the most common "nothing appears" cause.',
                "**The addon imports its own CSS.** There is no stylesheet to add and none to forget.",
            ],
        },
        {
            kind: "note",
            text: "**Starting from nothing? Read the Guide tab instead.** It begins with this same first render and then walks the rest in order — the pull model, the reactivity rules, wiring a real store, editing, theming, and the identity rules. These recipes assume all of it.",
        },
    ],
};
