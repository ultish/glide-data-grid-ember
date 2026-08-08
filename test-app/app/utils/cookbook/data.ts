// The short orientation chapter: which of the three data helpers you want, and why that is a
// question about your data rather than about a row count.
//
// The depth — Ember Data, GraphQL, reactivity, flattening, the measured numbers — is the **Guide**
// tab (`app/utils/guide/`), chapters 3 to 6. Keep this one a map, not a manual: if a recipe here
// grows past a few lines it belongs in the guide, and it must *leave* this file when it goes.
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

// In your component. The \`@cached\` is load-bearing, not style — Guide 3 and 4 explain why.
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
            text: "**The Guide tab is the full version of this chapter** — fetching from an Ember Data store and from GraphQL (chapter 5), what happens to reactivity when a query refetches (chapter 3), flattening nested payloads with and without `object-scan` (chapter 6), and the identity rules that have no error message when you break them (chapter 9). Read it before wiring a real app; none of it is repeated here.",
        },
    ],
};
