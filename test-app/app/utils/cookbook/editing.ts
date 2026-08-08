// Queue item 2: the editing recipe writes to a MODEL, not to a `Map` keyed on "col,row".
//
// The old version worked and taught nothing — it kept edits in a side table that nobody's real app
// has, and it dodged the only interesting question (why does writing a field repaint a canvas?).
// The shape below is the one a real app has, and the "why it repaints" paragraph is the point of the
// whole chapter.
import type { Section } from "./types.ts";

export const editingSection: Section = {
    id: "editing",
    title: "Editing",
    blocks: [
        {
            kind: "note",
            text: "**The grid never mutates your data.** Every write is a notification; applying it — and persisting it — is yours.",
        },
        {
            kind: "p",
            text: "Write the edit into your model. That means a `@tracked` field on a tracked class, or an `@attr` on an Ember Data model — the two behave identically here, because `@attr` is tracked.",
        },
        {
            kind: "code",
            text: `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { recordsSource } from "glide-data-grid-ember/data-source/index";

class Person {
  @tracked name;
  @tracked email;
  constructor(name, email) { this.name = name; this.email = email; }
}

export default class PeopleTable extends Component {
  @tracked people = [new Person("Ada Lovelace", "ada@example.com")];

  // A class-field arrow, not \`@action\`: Ember 6+ no longer recommends the decorator, and an arrow
  // field is identity-stable per instance — which is exactly what \`recordsSource\` needs, since it
  // is part of the memo key. The two rules point the same way, so there is no trade-off to make.
  onEdit = (person, col, value) => {
    if (col === 0) person.name = value.data;
    else person.email = value.data;
    // person.save();   // an Ember Data model — persisting is yours, and the grid never waits on it
  };

  @cached
  get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
  }
}`,
        },
        {
            kind: "p",
            text: "**Why that repaints, spelled out**, because it is the one piece of this that is not obvious. The `@cached get gridArgs` getter calls `recordsSource`, which projects **every row during the call** — so `person.name` was read *inside* the tracking frame and is a dependency of that getter. Assigning `person.name = value.data` dirties it. The getter invalidates, the grid's modifier re-runs, `getCellContent` comes back with a fresh identity, and the render engine repaints. Every link in that chain is load-bearing, and the per-record memoization means only the edited row is re-projected.",
        },
        {
            kind: "note",
            text: "**The failure mode is silence.** Write the same edit into a plain (untracked) object, or read your data lazily inside `@getCellContent` instead of eagerly inside a tracked getter, and nothing repaints — no error, no warning. The previous chapter's *what actually repaints* table is the whole model in one place.",
        },
        {
            kind: "p",
            text: "Without `recordsSource`, `@onCellsEdited` hands you the raw batch and you do the same thing by hand — still writing to the model, never to a side table:",
        },
        {
            kind: "code",
            text: `handleCellsEdited = edits => {
  for (const { location, value } of edits) {
    const [col, row] = location;
    const person = this.people[row];
    if (person === undefined) continue;   // the trailing blank row reports one past the end
    if (col === 0) person.name = value.data;
    else person.email = value.data;
  }
};`,
        },
        {
            kind: "list",
            items: [
                "`@onCellsEdited` fires with a **batch**, once per gesture — one call for a paste, one for a fill-handle drag, one for a delete over a range. Handle the array, not a single edit.",
                "`location` is `[col, row]` in **your** coordinate space: the grid has already stripped the row-marker column. If you use `withColumnSort`, bind the `onCellsEdited` *it* returns so the row index is translated back to original order too — see the sorting chapter.",
                "A cell is editable when it says so: `allowOverlay: true` opens the overlay editor, `readonly: true` blocks writes.",
                "**Copy and paste work out of the box** — real clipboard events, TSV plus an HTML `<table>` so Excel and Sheets round-trip correctly. Nothing to wire, and a paste arrives as one batch.",
                "Overlay editors are real DOM and are styleable by your app; the addon ships their CSS scoped under `.gdg-root`.",
            ],
        },
        {
            kind: "code",
            text: `{{! trailing "add row" affordance }}
<GlideDataGrid @showTrailingBlankRow={{true}} @onRowAppended={{this.addRow}} ... />`,
        },
        {
            kind: "code",
            text: `addRow = () => {
  // Rule 3: adding a row must produce a NEW array. An in-place \`push\` keeps the array's identity
  // and will be missed — this is the single most common "my new row doesn't show up".
  this.people = [...this.people, new Person("", "")];
};`,
        },
        {
            kind: "p",
            text: "The blank row is synthetic — never a row your `@getCellContent` is asked for. Widen your data in `onRowAppended` and the grid picks it up.",
        },
    ],
};
