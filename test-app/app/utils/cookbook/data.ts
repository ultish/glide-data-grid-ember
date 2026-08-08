// The short orientation chapter. The depth — Ember Data, GraphQL, reactivity, object-scan, the
// measured numbers — lives in the next chapter (`ember.ts`), which absorbed the addon's old
// `DATA.md`. Keep this one a map, not a manual: if a recipe here grows past a few lines it belongs
// next door.
import type { Section } from "./types.ts";

export const dataSection: Section = {
    id: "data",
    title: "Where the data comes from",
    blocks: [
        {
            kind: "p",
            text: "The grid never sees your array. It is a *pull* API: you hand it `@columns`, `@rows` (a count) and `@getCellContent`, and it asks for cells as it paints them. Nothing is materialised for you, and nothing is copied.",
        },
        {
            kind: "p",
            text: "Which helper you want is decided by a fact about **your data**, not by a row count you have to estimate. 200,000 records genuinely in memory use the first row below; 500 rows arriving page-by-page from a server cannot.",
        },
        {
            kind: "table",
            head: ["Your data is…", "Use", "Live demo"],
            rows: [
                ["an array you hold in memory", "`recordsSource`", "Scale proof, Tracking"],
                ["paged, streamed or generated on demand", "`AsyncRecordsSource` + `@onVisibleRegionChanged`", "Async paging"],
                ["a firehose where you know which cells changed", "`updateCells()` from `@onReady`", "Streaming updates"],
            ],
        },
        {
            kind: "p",
            text: "The common case, end to end:",
        },
        {
            kind: "code",
            text: `import { recordsSource } from "glide-data-grid-ember/data-source/index";

// Module scope: both must be identity-stable — the per-row caches close over them.
const COLUMNS = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 260 },
];

const toCell = (person, col) => {
  const value = col === 0 ? person.name : person.email;
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
};

// In your component. The \`@cached\` is load-bearing, not style — see the next chapter.
@cached
get gridArgs() {
  return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
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
            text: "`recordsSource` memoises per record, so editing one field in a 1,000-row table re-projects one row rather than a thousand — measured in a browser, not assumed.",
        },
        {
            kind: "p",
            text: "`toCell` is a plain accessor function, deliberately: no path-string syntax, and the addon depends on no object-traversal library. Dig values out however you like on your side of the boundary.",
        },
        {
            kind: "note",
            text: "**The next chapter is the full version of this one** — fetching from an Ember Data store and from GraphQL, what happens to reactivity when a query refetches, flattening nested payloads with and without `object-scan`, and the rules about identity that have no error message when you break them. Read it before wiring a real app.",
        },
    ],
};
