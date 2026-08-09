// Guide chapter 7. Editing, told as "the consumer owns the data" rather than as a callback reference.
//
// The cookbook's own `Editing` recipe stays where it is — it is genuinely task-shaped ("how do I make
// cells editable"). This chapter owns the *why it repaints* explanation and the ownership contract,
// which is narrative and applies to every recipe. The sorted-grid coordinate trap is flagged here and
// explained once, in the cookbook's `Sorting` chapter, which is where someone hitting it will look.
import type { Section } from "../cookbook/types.ts";

export const editingSection: Section = {
    id: "editing",
    title: "Editing: you own the data",
    blocks: [
        {
            kind: "note",
            text: '**The grid never mutates your data.** Not once, anywhere, for any cell type. Every write is a *notification*; applying it — and persisting it — is yours. This is the single contract that makes the rest of the addon predictable, and it is why there is no "grid state" to keep in sync with your models.',
        },
        {
            kind: "p",
            text: "With `recordsSource` you already wrote the handler in chapter 4. It receives the **record**, not an index:",
        },
        {
            kind: "code",
            text: `onEdit = (person: Person, col: number, value: GridCell): void => {
  if (col === 0) person.name = value.data as string;
  else if (col === 1) person.email = value.data as string;
  else person.role = value.data as string;
  // person.save();   // an Ember Data model — persisting is yours, and the grid never waits on it
};`,
        },
        {
            kind: "p",
            text: "**Why that repaints, spelled out**, because it is the one piece of this that is not obvious and it is the payoff of chapter 3. The `@cached get gridArgs` getter calls `recordsSource`, which projects **every row during the call** — so `person.name` was read *inside* the tracking frame and is a dependency of that getter. Assigning `person.name = value.data` dirties it. The getter invalidates, the grid's modifier re-runs, `getCellContent` comes back with a fresh identity, and the render engine repaints. Every link in that chain is load-bearing, and the per-record memoization means only the edited row is re-projected.",
        },
        {
            kind: "note",
            text: "**The failure mode is silence.** Write the same edit into a plain (untracked) object, or read your data lazily inside `@getCellContent` instead of eagerly inside a tracked getter, and nothing repaints — no error, no warning. Chapter 3's table is the whole model in one place.",
        },

        {
            kind: "p",
            text: '**Without `recordsSource`**, `@onCellsEdited` hands you the raw batch and you do the same thing by hand — still writing to the model, never to a side table keyed on `"col,row"`:',
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
                "`location` is `[col, row]` in **your** coordinate space: the grid has already stripped the row-marker column, per chapter 2.",
                "A cell is editable when it says so: `allowOverlay: true` opens the overlay editor, `readonly: true` blocks writes. Copy and paste work out of the box, and a paste arrives as one batch.",
                "**Adding a row must produce a new array.** `this.people = [...this.people, new Person()]` — an in-place `push` keeps the array identity and will be missed. This is chapter 4's rule 3, and it is the single most common \"my new row doesn't show up\".",
            ],
        },
        {
            kind: "note",
            text: "**⚠️ If you add column sort, bind the handler the decorator hands back — not your own.** `withColumnSort` remaps rows *above* your data layer, so an edit to the top visible row of a sorted grid arrives as row `0` while your records array is still in original order. Writing it to `records[0]` silently updates a different person, and you will not see it until the next re-sort. Pass your handler *into* `withColumnSort` and wire the returned `onCellsEdited` to the grid; then the read and write coordinate spaces cannot disagree. The composition is three lines, and it is in the **Cookbook → Sorting, and the header menu** recipe.",
        },
        {
            kind: "p",
            text: "That warning generalises, and it is worth stating once as a rule for the whole data-source layer: **a decorator that remaps the read path also remaps the write path.** Every decorator in `glide-data-grid-ember/data-source/index` takes an `onCellsEdited`/`onCellEdited` and returns one, and you always wire the *returned* one. There is deliberately no index-translation for you to do by hand and therefore none to forget.",
        },
    ],
};
