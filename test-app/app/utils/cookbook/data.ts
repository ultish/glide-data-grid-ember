import type { Section } from "./types.ts";

export const dataSection: Section = {
    id: "data",
    title: "Where the data comes from",
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
};
