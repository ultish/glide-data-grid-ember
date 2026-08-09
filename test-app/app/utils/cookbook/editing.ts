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
            text: "Writing a tracked field is what repaints the row — there is no imperative step and nothing to flush. The chain that makes that true has five links and every one is load-bearing; it is spelled out once, in **Guide 7, *Editing: you own the data***.",
        },
        {
            kind: "note",
            text: "**The failure mode is silence.** Write the same edit into a plain (untracked) object, or read your data lazily inside `@getCellContent` instead of eagerly inside a tracked getter, and nothing repaints — no error, no warning. **Guide 3**'s *what actually repaints* table is the whole model in one place.",
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
            kind: "p",
            text: "**Rejecting or normalising an edit.** `@validateCell` runs on the overlay editor's initial value and again on every change. Return `false` to reject — the editor stays open and usable, but closing it commits nothing — or return a coerced cell to accept a corrected value.",
        },
        {
            kind: "code",
            text: `validateCell = (cell, newValue, prevValue) => {
  const [col] = cell;                                  // your coordinate space, no row-marker column
  if (col !== EMAIL_COL) return true;
  return newValue.data.includes("@")
    ? true
    : { ...newValue, displayData: newValue.data };     // or \`false\` to reject outright
};`,
        },
        {
            kind: "note",
            text: "Two things to know before you rely on it. **It applies to the overlay editor only** — paste, fill, cut and delete deliberately never consult it, matching upstream. And **coercion commits but does not redisplay**: upstream re-renders its editor from the coerced value so the user watches the correction happen, whereas this port's editors are DOM factories with no channel to push a value back in, so the coerced value is what gets *committed* while the editor keeps showing what was typed until it closes. Rejection (`false`) behaves identically to upstream. For live-as-you-type correction, write a custom editor.",
        },
        {
            kind: "p",
            text: "**Paste coercion.** `@coercePasteValue` runs *before* the built-in per-kind rules and before any custom renderer's `onPaste`. Return `undefined` to fall through; returning a cell of a different `kind` than the one being pasted into is ignored, because a column's cells must keep their kind.",
        },
        {
            kind: "code",
            text: `coercePasteValue = (val, cell) => {
  if (cell.kind !== "number") return undefined;               // fall through to the defaults
  const n = Number(val.replace(/[$,\\s]/g, ""));
  return Number.isNaN(n) ? undefined : { ...cell, data: n, displayData: MONEY.format(n) };
};`,
        },
        {
            kind: "p",
            text: "**Copy and delete.** `@copyHeaders` prepends a row of column titles to a copy or cut (copy/cut only — a paste never expects to read them back). `@onDelete` intercepts Delete/Backspace and the clearing half of a cut:",
        },
        {
            kind: "code",
            text: `<GlideDataGrid @copyHeaders={{true}} @onDelete={{this.handleDelete}} ... />

handleDelete = selection => {
  if (this.locked) return false;          // false  -> cancel the delete entirely
  if (selection.columns.length > 0) {     // a GridSelection -> clear THAT instead
    return { ...selection, current: undefined };
  }
  return true;                            // true   -> clear the current selection, as normal
};`,
        },
        {
            kind: "p",
            text: "The selection passed in and any selection you return are both in your own coordinate space — no row-marker column, the same as `@onCellsEdited`.",
        },
        {
            kind: "p",
            text: "**When a click starts an edit.** `@cellActivationBehavior` is `\"second-click\"` by default (a click on the already-selected cell activates it); `\"single-click\"` activates any click, `\"double-click\"` requires a real double-click. A cell's own `activationBehaviorOverride` wins over the grid-wide setting. `@editOnType` (default `true`) is what makes typing a printable character over the selected cell open its editor seeded with that character — set it `false` to require an explicit Enter or activation click.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid @cellActivationBehavior="single-click" @editOnType={{false}} ... />`,
        },
        {
            kind: "code",
            text: `{{! trailing "add row" affordance }}
<GlideDataGrid
  @showTrailingBlankRow={{true}}
  @onRowAppended={{this.addRow}}
  @trailingRowOptions={{this.trailingRowOptions}}    {{! stable object — see below }}
  ...
/>`,
        },
        {
            kind: "list",
            items: [
                "`@trailingRowOptions` is cosmetic: `tint` shades the row as not-real-data, `hint` is the text in its first column (this port defaults it to `\"Add row\"`; pass `\"\"` for upstream's empty default), `addIcon` swaps the built-in `+` glyph for a named header icon.",
                "Upstream's `sticky` and `targetColumn` are deliberately **not** accepted — both would be silently inert here — so nothing you pass is quietly ignored.",
                "A column's own `trailingRowOptions` overrides `hint`/`addIcon` for that column, and `disabled: true` blanks its trailing cell.",
                "Build the object in a module constant or a `@cached` getter rather than inline in the template — the general identity-stability rule for grid args, spelled out in **Guide 9 — The identity rules**.",
            ],
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
