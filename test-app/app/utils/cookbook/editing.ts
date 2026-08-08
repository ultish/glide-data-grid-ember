import type { Section } from "./types.ts";

export const editingSection: Section = {
    id: "editing",
    title: "Editing",
    blocks: [
        { kind: "note", text: "**The grid never mutates your data.** Every write is a notification; applying it is yours." },
        {
            kind: "code",
            text: `@tracked edits = new Map();

getCellContent = ([col, row]) => {
  return this.edits.get(\`\${col},\${row}\`) ?? this.baseCell(col, row);
};

@action
handleCellsEdited(edits) {
  const next = new Map(this.edits);
  for (const e of edits) next.set(\`\${e.location[0]},\${e.location[1]}\`, e.value);
  this.edits = next;          // replace, don't mutate — tracking is on the reference
}`,
        },
        {
            kind: "list",
            items: [
                "`@onCellsEdited` fires with a **batch**, once per gesture — one call for a paste, one for a fill-handle drag, one for a delete over a range. Handle the array, not a single edit.",
                "A cell is editable when it says so: `allowOverlay: true` opens the overlay editor, `readonly: true` blocks writes.",
                "**Copy and paste work out of the box** — real clipboard events, TSV plus an HTML `<table>` so Excel and Sheets round-trip correctly. Nothing to wire.",
                "Overlay editors are real DOM and are styleable by your app; the addon ships their CSS scoped under `.gdg-root`.",
            ],
        },
        {
            kind: "code",
            text: `{{! trailing "add row" affordance }}
<GlideDataGrid @showTrailingBlankRow={{true}} @onRowAppended={{this.addRow}} ... />`,
        },
        {
            kind: "p",
            text: "The blank row is synthetic — never a row your `@getCellContent` is asked for. Widen your data in `onRowAppended` and the grid picks it up.",
        },
    ],
};
