// Guide chapter 4. `recordsSource` — the recommended pattern, its four rules, what it does inside,
// and the browser-measured evidence that the per-row memoization is real.
//
// This is the load-bearing half of the cookbook's old chapter 4 (which was the addon's `DATA.md`
// before that). It is the only copy; the cookbook's "Where the data comes from" chapter keeps the
// three-line orientation table and links here.
import type { Section } from "../cookbook/types.ts";

export const recordsSourceSection: Section = {
    id: "records-source",
    title: "Wiring real data: `recordsSource`",
    blocks: [
        {
            kind: "note",
            text: "**There is one recommended pattern, and it does not change shape with size.** Write it this way at 8 rows and it still works at 200,000. Exactly one situation needs something else, and it is decided by a fact about your data rather than a row count you have to guess — chapter 8.",
        },
        {
            kind: "p",
            text: "`recordsSource` takes your array of records and hands back exactly the args the grid wants, with chapter 3's eager read and a per-record memoization already inside. Here is the running example, promoted from plain objects to tracked records:",
        },
        {
            kind: "code",
            text: `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

class Person {
  @tracked name: string;
  @tracked email: string;
  @tracked role: string;
  constructor(name: string, email: string, role: string) {
    this.name = name; this.email = email; this.role = role;
  }
}

// Module scope. Both of these are identity-stable, which is load-bearing: the per-row caches close
// over them, and a new identity rebuilds every one of them.
const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const toCell = (p: Person, col: number): GridCell => {
  const value = [p.name, p.email, p.role][col] ?? "";
  return { kind: GridCellKind.Text, allowOverlay: true, data: value, displayData: value };
};

export default class PeopleTable extends Component {
  @tracked people: readonly Person[] = [new Person("Ada Lovelace", "ada@example.com", "Mathematician")];

  // A class-field arrow, not \`@action\`: Ember 6+ no longer recommends the decorator, and an arrow
  // field is identity-stable per instance — which is exactly what the args below need. The two
  // rules point the same way, so there is no trade-off to make.
  onEdit = (person: Person, col: number, value: GridCell): void => {
    if (col === 0) person.name = value.data as string;
    else if (col === 1) person.email = value.data as string;
    else person.role = value.data as string;
  };

  @cached
  get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
  }
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
            text: "That is the whole thing. Mutating `person.name` in place repaints that cell. Replacing `this.people` repaints the table. Nothing imperative, and no decision to make based on size.",
        },
        {
            kind: "p",
            text: "Note the singular/plural: you write the **per-record** `onCellEdited`, which receives the actual record object, and get back the batched, index-based `onCellsEdited` the grid wants. It is `undefined` if and only if you passed no `onCellEdited`, so a read-only grid needs no handler at all.",
        },
        {
            kind: "code",
            text: `function recordsSource<T extends object>(p: {
  records: readonly T[];
  columns: readonly GridColumn[];
  toCell: (record: T, col: number) => GridCell;
  onCellEdited?: (record: T, col: number, value: GridCell) => void;
}): {
  columns: readonly GridColumn[];
  rows: number;
  getCellContent: (cell: Item) => GridCell;
  onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void;
};`,
        },

        // -- the four rules --------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Four rules. All four are mechanical consequences of chapters 2 and 3, not style.**",
        },
        {
            kind: "list",
            items: [
                "**Call it inside a tracked computation** — a `@cached` getter is the idiomatic place. `recordsSource` projects every row *during the call*, and those reads are what register your records' `@tracked` fields as dependencies of the frame that repaints the grid. Call it from a constructor or an event handler and nothing will ever update.",
                "**`toCell` must be identity-stable** — module scope, a class-field arrow, or a bound method. Not an arrow allocated inline inside the getter. The per-row caches close over it, so a fresh identity rebuilds all of them.",
                "**Replace the `records` array; mutate the records.** Mutating a record's `@tracked` fields in place is the supported way to change data, and is what keeps updates incremental. Adding, removing or reordering rows must produce a **new array** — an in-place `push`/`splice` keeps the array's identity and will be missed.",
                "**Put formatting and nested-data digging in `toCell`, never in `getCellContent`.** `toCell` runs once per record and is memoized; `getCellContent` is on the paint path and `recordsSource` reduces it to a single array index.",
            ],
        },
        {
            kind: "note",
            text: "**⚠️ The one way to break it.** The per-row caches are keyed on the records **array identity**. Derive `records` from something that reallocates on every edit — a `.map()`, a `.filter()`, a fresh array literal in a plain (uncached) getter — and every per-row cache resets on every change. You are then back to full recomputation with extra machinery on top. If updates ever feel slow, check this first; the measurements at the end of this chapter show it is the entire difference.",
        },

        // -- under the hood --------------------------------------------------------------------------
        {
            kind: "p",
            text: "**What it does under the hood**, because knowing the shape is what lets you tell a real problem from a misuse. Each record gets its own tracked cache (`createCache` from `@glimmer/tracking/primitives/cache`, the non-decorator form of `@cached`) whose function reads only that record's fields. The set of caches is rebuilt only when `records` / `columns` / `toCell` change identity. Every call reads all of them eagerly — that is chapter 3's rule — and unchanged rows are cache hits returning the identical array, so a one-field edit costs N cheap hits plus one real projection. `getCellContent` then closes over the resulting array and does one index into it.",
        },
        {
            kind: "p",
            text: "Repeated calls whose row projections all came back identical return the **same result object**, so `getCellContent` keeps its identity and the render engine's scroll fast path stays engaged (chapter 9). When a row really changed, a fresh identity comes back — which is what makes the grid repaint. Written by hand, the same idea looks like this:",
        },
        {
            kind: "code",
            text: `// One view model per record. Its getter reads only THIS record's tracked fields, so a change
// to one record invalidates one row — not the whole table.
class PersonRow {
  constructor(person) { this.person = person; }

  @cached
  get cells() {
    const p = this.person;
    return [text(p.name), text(p.email), text(p.role)];
  }
}

// Keyed on the ARRAY identity, so editing a field does not rebuild the view models.
@cached get rowVMs() { return this.people.map(p => new PersonRow(p)); }

// Reading \`.cells\` HERE — inside the tracking frame — is what registers every record's tracked
// fields as dependencies. Unchanged rows are cache hits.
@cached get getCellContent() {
  const rows = this.rowVMs.map(vm => vm.cells);
  return ([col, row]) => rows[row]?.[col] ?? BLANK;
}`,
        },
        {
            kind: "p",
            text: "Changing one field invalidates exactly one `PersonRow.cells`. The outer `.map()` still runs, but it is *N cache hits plus one real recompute* — an array walk, not N projections. Prefer `recordsSource`; this is here so you recognise the shape when you read it, and so the packaged version is not magic.",
        },

        // -- tuning ----------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Tuning notes.** Only relevant if profiling actually points here.",
        },
        {
            kind: "list",
            items: [
                "**The eager read is O(rows)** even when every row is a cache hit. It is a walk of property reads, so it is cheap — but with hundreds of thousands of *in-memory* records and known-changed rows, moving those rows to `updateCells` (chapter 8) removes it. Keep the per-row memoization either way.",
                "**Don't memoize rows in a `WeakMap` keyed on the record object.** It looks like an obvious win and is wrong for any normalized cache that mutates entities in place: the identity never changes, so the cache silently serves stale rows. `recordsSource` is *not* this — it caches a tracked computation, which that very mutation invalidates, rather than a plain value that has nothing to invalidate it. The distinction is *what* is cached, not what it is keyed on.",
                "**A record class with no `@tracked` fields produces a permanently constant cache.** That is correct rather than stale: nothing about such a record can change without a new `records` array, which rebuilds everything.",
            ],
        },

        // -- evidence --------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Measured, not asserted.** The claim that one edit re-projects one row was measured in Chrome against the built addon, at 1,000 rows and 7 columns, by a projection that increments a counter on every call — so \"rows re-projected since the last action\" is a number on screen rather than an inference. It runs in the **Tracking proof demo** tab, in the *Scale proof* panel below the small table.",
        },
        {
            kind: "table",
            head: ["Action", "Rows re-projected", "`toCell` calls"],
            rows: [
                ["Initial build (cold)", "1000 of 1000", "7000"],
                ["**Edit one field on one record**", "**1 of 1000**", "**7**"],
                ["Edit one field on a row scrolled out of view", "1 of 1000", "7"],
                ["Add a nested related entity to one record", "1 of 1000", "7"],
                ["Re-render touching no record", "0 of 1000", "0"],
                ["Replace the `records` array (same instances)", "1000 of 1000", "7000"],
            ],
        },
        {
            kind: "p",
            text: "The edited row visibly repainted in each case with **no** `updateCells()`, no `@onCellsEdited` (that grid is given no write path at all) and every cell `allowOverlay: false` — so autotracking is the only thing that could have caused it. The out-of-view result shows the count is not an artifact of what happens to be painted. The last row is the concrete cost of *the one way to break it*: those record objects were the identical instances and only the array identity changed, and that alone rebuilt all 1,000 projections.",
        },
    ],
};
