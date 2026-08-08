// The long chapter: everything a consumer needs to wire real Ember data into the grid.
//
// This absorbs the addon's former `DATA.md` in full (queue items 3 + 4a) — that file is deleted, and
// this is the only copy. It is deliberately the longest chapter in the book, because the two rules it
// encodes (identity stability, and "autotracking only records reads made during the tracking frame")
// have no error message, no warning and no visual symptom when you get them wrong.
import type { Section } from "./types.ts";

export const emberSection: Section = {
    id: "ember",
    title: "Using the grid in Ember",
    blocks: [
        {
            kind: "note",
            text: "**There is one recommended pattern, and it does not change shape with size.** Write it this way at 8 rows and it still works at 200,000. Exactly one situation needs something else, and it is decided by a fact about your data rather than by a row count you have to guess — see *When you can't hold the data in memory*, near the end.",
        },

        // -- the contract ------------------------------------------------------------------------
        {
            kind: "p",
            text: "**The contract underneath.** `<GlideDataGrid>` is a *pull* API: you give it `@columns`, `@rows` (a count) and `@getCellContent`, and it asks for cells as it paints them. Two consequences drive everything below.",
        },
        {
            kind: "p",
            text: "**1. `getCellContent` must be an O(1) lookup, never a computation.** It is called once per painted cell, inside the draw loop — a full repaint of an ordinary viewport is a few hundred calls, and a fast scroll is a fresh strip every frame. Formatting, date parsing, or digging through nested objects inside `getCellContent` puts that work directly on the paint path.",
        },
        {
            kind: "p",
            text: "**2. Autotracking only records reads that happen *during* the tracking frame.** The grid's modifier reads `this.args.getCellContent` — the function *reference*. It never calls it. So any `@tracked` property your closure touches later, when the grid invokes it at paint time, is read outside the frame and **never becomes a dependency**. This is the single most common way to end up with a grid that silently doesn't update:",
        },
        {
            kind: "code",
            text: `// ✗ Never repaints on a tracked change. The read of \`person.name\` happens at paint time,
//   long after the frame that established the grid's dependencies has closed.
getCellContent = ([col, row]) => cellFor(this.people[row], col);`,
        },
        {
            kind: "p",
            text: "The pattern below satisfies both rules by construction, which is why it is the one to use — and why `recordsSource` exists at all.",
        },

        // -- recordsSource -----------------------------------------------------------------------
        {
            kind: "p",
            text: "**The pattern, packaged: `recordsSource`.** It takes your array of records and hands back exactly the args the grid wants, with the eager read and the per-row memoization already inside.",
        },
        {
            kind: "code",
            text: `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind } from "glide-data-grid-ember/rendering/index";

// Module scope. Both of these are identity-stable, which is load-bearing: the per-row caches
// close over them, and a new identity rebuilds every one of them.
const COLUMNS = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 240 },
  { id: "age",   title: "Age",   width: 90 },
];

const toCell = (p, col) => {
  switch (col) {
    case 0:  return { kind: GridCellKind.Text,   allowOverlay: true, data: p.name,  displayData: p.name };
    case 1:  return { kind: GridCellKind.Text,   allowOverlay: true, data: p.email, displayData: p.email };
    default: return { kind: GridCellKind.Number, allowOverlay: true, data: p.age,   displayData: String(p.age) };
  }
};

export default class PeopleTable extends Component {
  @tracked people = [];

  // A class-field arrow, not \`@action\`: Ember 6+ no longer recommends the decorator, and an
  // arrow field is identity-stable per instance — which is exactly what the identity-compared
  // args below need. The two rules point the same way.
  onEdit = (person, col, value) => {
    if (col === 0) person.name = value.data;
    else if (col === 1) person.email = value.data;
    else person.age = value.data;
  };

  @cached
  get gridArgs() {
    return recordsSource({
      records: this.people,
      columns: COLUMNS,
      toCell,
      onCellEdited: this.onEdit,
    });
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
        {
            kind: "p",
            text: "**Four rules. All four are mechanical consequences of the two contract points above, not style.**",
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
            text: "**⚠️ The one way to break it.** The per-row caches are keyed on the records *array* identity. Derive `records` from something that reallocates on every edit — a `.map()`, a `.filter()`, a fresh array literal in a plain (uncached) getter — and every per-row cache resets on every change. You are then back to full recomputation with extra machinery on top. If updates ever feel slow, check this first; it is measurably the whole difference (see the table at the end of this chapter).",
        },

        // -- under the hood ----------------------------------------------------------------------
        {
            kind: "p",
            text: "**What it does under the hood**, because knowing the shape is what lets you tell a real problem from a misuse. Each record gets its own tracked cache (`createCache` from `@glimmer/tracking/primitives/cache`, the non-decorator form of `@cached`) whose function reads only that record's fields. The set of caches is rebuilt only when `records` / `columns` / `toCell` change identity. Every call reads all of them eagerly; unchanged rows are cache hits returning the identical array, so a one-field edit costs N cheap hits plus one real projection. `getCellContent` then closes over the resulting array and does one index into it.",
        },
        {
            kind: "p",
            text: "Repeated calls whose row projections all came back identical return the **same result object**, so `getCellContent` keeps its identity and the render engine's scroll fast path stays engaged. When a row really changed, a fresh identity comes back — which is what makes the grid repaint. Written by hand, the same idea looks like this:",
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
    return [
      { kind: GridCellKind.Text,   allowOverlay: true,  data: p.name,  displayData: p.name },
      { kind: GridCellKind.Text,   allowOverlay: true,  data: p.email, displayData: p.email },
      { kind: GridCellKind.Number, allowOverlay: true,  data: p.age,   displayData: String(p.age) },
      { kind: GridCellKind.Boolean, allowOverlay: false, data: p.active },
    ];
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
            text: "Changing one field invalidates exactly one `PersonRow.cells`. The outer `.map()` still runs, but it is *N cache hits plus one real recompute* — an array walk, not N projections. Prefer `recordsSource`; this is here so you recognise the shape when you read it.",
        },

        // -- Ember Data --------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Fetching from an Ember Data store.** An `@attr` field is tracked, so an Ember Data model *is* a record in the sense above — mutate it in place and the row repaints, with no extra machinery.",
        },
        {
            kind: "code",
            text: `// app/models/person.ts
import Model, { attr } from "@ember-data/model";

export default class Person extends Model {
  @attr("string") declare name: string;
  @attr("string") declare email: string;
  @attr("number") declare age: number;
}

// app/routes/people.ts — load it the ordinary way; the grid has no opinion about fetching.
export default class PeopleRoute extends Route {
  @service declare store: Store;
  model() { return this.store.findAll("person"); }
}`,
        },
        {
            kind: "code",
            text: `// app/components/people-table.gts
export default class PeopleTable extends Component {
  @service declare store;

  // \`peekAll\` returns a LIVE array whose identity never changes. Spread it: the spread reads the
  // live array's tracked length, so this getter re-runs when a record is added or removed — and it
  // hands \`recordsSource\` a fresh array identity, which is rule 3.
  @cached get people() { return [...this.store.peekAll("person")]; }

  onEdit = (person, col, value) => {
    if (col === 0) person.name = value.data;
    else if (col === 1) person.email = value.data;
    else person.age = value.data;
    // Persisting is yours. The grid never saves, and never mutates your data.
  };

  @cached get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
  }
}`,
        },
        {
            kind: "note",
            text: "**⚠️ Do not hand a live array straight to `recordsSource`.** `store.peekAll(...)` (and a `findAll` result you hold onto) keeps one identity for the life of the store. `recordsSource` keys its per-row caches on that identity, so when a record is added the caches are reused at the *old* length while `rows` comes from the *new* one — the added row asks for a projection that does not exist and paints as blank cells. The `[...spread]` above is the fix, and it is one character of ceremony.",
        },
        {
            kind: "p",
            text: "Everything else follows from the four rules: `person.save()`, `store.unloadRecord()` and friends are yours to call; deleting a record changes the live array's length, which re-runs the `@cached` getter, which produces a new array, which re-projects. Sorting or filtering server-side likewise produces a new array — correct, and correctly costs a full re-projection.",
        },

        // -- GraphQL -----------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Fetching from GraphQL.** The important difference from Ember Data is that a GraphQL client hands you **plain objects**, and plain objects are not tracked. So there is exactly one reactivity edge available by default: assigning the new result array to a `@tracked` field.",
        },
        {
            kind: "code",
            text: `const PEOPLE_QUERY = gql\`
  query People {
    people { id name email profile { address { city country } pets { name species } } }
  }
\`;

export default class PeopleTable extends Component {
  @tracked people = [];
  @tracked loading = false;

  // Class-field arrow: identity-stable, and usable directly as {{on "click" this.load}}.
  load = async () => {
    this.loading = true;
    try {
      const { data } = await client.query({ query: PEOPLE_QUERY });
      this.people = data.people;   // NEW array identity -> every row re-projects. Correct here.
    } finally {
      this.loading = false;
    }
  };

  @cached get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell: gqlPersonToCell });
  }
}`,
        },
        {
            kind: "p",
            text: "For a refetch that genuinely replaced the data, re-projecting every row is the right cost and there is nothing to tune. It stops being right when a poll or a subscription refetches the *same* rows every few seconds: each response is a new array, so every row re-projects even though almost nothing changed. That is the case for reconciling into tracked models keyed by id.",
        },
        {
            kind: "code",
            text: `class PersonRow {
  @tracked name; @tracked email;
  @tracked profile;                 // the nested blob, replaced wholesale — one tracked write
  constructor(raw) { this.id = raw.id; this.apply(raw); }

  // Guard every assignment. \`@tracked\` dirties its tag on EVERY set, equal value or not, so an
  // unguarded \`this.name = raw.name\` would re-project every row on every poll.
  apply = raw => {
    if (this.name !== raw.name) this.name = raw.name;
    if (this.email !== raw.email) this.email = raw.email;
    if (!sameProfile(this.profile, raw.profile)) this.profile = raw.profile;
  };
}

#byId = new Map();

reconcile = rows => {
  let membershipChanged = rows.length !== this.people.length;
  const next = rows.map((raw, i) => {
    let vm = this.#byId.get(raw.id);
    if (vm === undefined) { vm = new PersonRow(raw); this.#byId.set(raw.id, vm); membershipChanged = true; }
    else vm.apply(raw);                                  // tracked writes -> only real changes dirty
    if (this.people[i] !== vm) membershipChanged = true;  // reordered
    return vm;
  });
  // Keep the SAME array when membership and order are unchanged: a new array identity would rebuild
  // every per-row cache and throw away the incrementality the guards above just bought.
  if (membershipChanged) this.people = next;
};`,
        },
        {
            kind: "list",
            items: [
                "**Most clients reallocate nested objects on every response**, even when the values are identical — so an identity check on `profile` never matches. Compare the fields you actually display (`sameProfile` above), or key off a server-supplied version/`updatedAt`.",
                "**A normalized cache that mutates entities in place (Apollo and friends) changes nothing you can observe from Ember.** The entity's identity is the same and its fields are not tracked, so no repaint happens. The reconcile above is the bridge: your tracked `PersonRow` is what Ember watches, and the cache entity is just the payload it copies from.",
                "**Don't reach for `updateCells` to paper over this.** It is the right tool for a genuinely lazy buffer (below), not a workaround for an untracked read.",
            ],
        },

        // -- object-scan -------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Flattening a model into the fields a grid row needs — `object-scan` as an optional helper.** The grid wants a flat list of values per row; your data is usually not flat. Ember Data records have relationships, GraphQL results are nested and carry arrays of related entities, and a domain class has whatever shape it has. `toCell` is where that flattening belongs, because it is the memoized side of the boundary — done here, it runs once per record rather than once per painted cell.",
        },
        {
            kind: "note",
            text: "**`object-scan` is entirely optional, and it is one of several equally fine choices.** The addon has no opinion and no dependency on it. Reach for it when the shapes are deep or variable enough that hand-written walks stop paying; a plain accessor is frequently the whole answer, so start there.",
        },
        {
            kind: "p",
            text: "Without any library at all:",
        },
        {
            kind: "code",
            text: `// No dependency, no compilation step, and it type-checks. Prefer this until it stops scaling.
const gqlPersonToCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(p.profile?.address?.city ?? "");
    default: {
      const pets = (p.profile?.pets ?? []).map(pet => pet.name).sort().join(", ");
      return text(pets === "" ? "—" : pets);
    }
  }
};`,
        },
        {
            kind: "p",
            text: "And with `object-scan`, when a column's value could be at one of several depths, or you want one declarative needle instead of a chain of `?.` and `.map().filter()`. The rule that matters is **compile once per column, at module scope** — `objectScan(...)` parses its needles and builds a matcher, and doing that inside `toCell` rebuilds it once per cell:",
        },
        {
            kind: "code",
            text: `import objectScan from "object-scan";

// \`useArraySelector: false\` -> array indices are not part of the needle, so \`pets.name\` matches
// every element of \`pets\`. \`rtn: "value"\` -> matched values, not their key paths.
const compile = needle => objectScan([needle], { useArraySelector: false, rtn: "value" });

// One scanner per column, hoisted. Two \`objectScan\` calls for the life of the page — not two per
// cell, which on a 1,000-row × 7-column sweep would be 14,000.
const scanCity     = compile("address.city");
const scanPetNames = compile("pets.name");

const gqlPersonToCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    // Note the scan target: the plain nested payload, NOT the record object. See the warning below.
    case 1: return text(scanCity(p.profile)[0] ?? "");
    default: {
      const names = [...scanPetNames(p.profile)].sort().join(", ");
      return text(names === "" ? "—" : names);
    }
  }
};`,
        },
        {
            kind: "note",
            text: "**⚠️ Point path scanners at plain data, not at a class instance — this is the one that bites when flattening models.** `object-scan`, like most traversal libraries, walks **own enumerable** properties, while `@tracked` fields and Ember Data `@attr`s are accessors on the *prototype*. A scanner aimed straight at a tracked model or an Ember Data record matches **nothing, silently** — no error, just empty cells. Two ways out, both fine: scan the plain nested blob the response actually handed you (`person.profile`, `person.pets`) and read the model's own top-level fields with ordinary property access, or convert the record to a POJO first (`record.toJSON()`, a serializer, your own mapper) and scan that. The first is cheaper and is what `<ScaleProof>` does.",
        },
        {
            kind: "p",
            text: "**The addon depends on no traversal library and never will.** `toCell` is a plain accessor function generic over your row type; there is deliberately no path-string syntax to learn and nothing to escape. `object-scan`, `lodash.get`, `jsonpath` or a hand-written closure are all equally fine and all live on your side of the boundary — in this repo `object-scan` is a **test-app** dependency only. The worked version of the code above, with the compile-count counter that proves \"twice, not fourteen thousand\", is in `app/utils/scale-records.ts` and runs live in the **Scale proof** tab.",
        },

        // -- what repaints -----------------------------------------------------------------------
        {
            kind: "p",
            text: "**What actually repaints, and why.** This table is the whole reactivity model in one place; every row of it is a consequence of the two contract points at the top.",
        },
        {
            kind: "table",
            head: ["What you did", "What re-projects", "Why"],
            rows: [
                [
                    "Mutate a `@tracked` field on one record",
                    "that one row",
                    "the record's own cache consumed that tag during the eager read",
                ],
                ["Write an `@attr` on an Ember Data model", "that one row", "`@attr` is tracked; identical to the row above"],
                [
                    "Replace a nested blob (`person.profile = {...}`)",
                    "that one row",
                    "one tracked write — the idiomatic way to change nested GQL data",
                ],
                [
                    "Assign a new `records` array (refetch, filter, server sort)",
                    "**every row**",
                    "the array identity is the caches' key, so they are all rebuilt",
                ],
                [
                    "`push` / `splice` the existing array",
                    "**nothing**",
                    "identity unchanged and no tag was dirtied — the grid never hears about it",
                ],
                [
                    "Mutate an untracked plain object from a GQL cache",
                    "**nothing**",
                    "there is no tag to dirty; wrap it in a tracked class, or assign a new array",
                ],
                [
                    "Read tracked state lazily inside `getCellContent`",
                    "**nothing, ever**",
                    "the read happens at paint time, outside the tracking frame",
                ],
                [
                    "`api.updateCells([{ cell: [c, r] }])`",
                    "nothing re-projects; those cells repaint",
                    "imperative damage path — bypasses autotracking entirely",
                ],
            ],
        },

        // -- sort coordinate contract ------------------------------------------------------------
        {
            kind: "p",
            text: "**If you add column sort, hand your edit handler to the decorator.** Read this before wiring `@onCellsEdited` on a sorted grid: getting it wrong corrupts data silently, and you will not see it until the next re-sort.",
        },
        {
            kind: "p",
            text: "`withColumnSort` remaps rows *above* your data layer, so the row index the grid reports for an edit is the **displayed** one, while your `getCellContent` and your records array work in **original** order. An edit to the top visible row of a sorted grid arrives as row `0`; writing it to record `0` updates whichever record happens to be first *unsorted* — a different person.",
        },
        {
            kind: "code",
            text: `// The rule: a decorator that remaps the READ path also remaps the WRITE path. Pass your handler
// in, and bind the one it hands back. Then the two coordinate spaces cannot disagree.
@cached
get gridArgs() {
  const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
  return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
}`,
        },
        {
            kind: "p",
            text: "The two compose by spreading because `recordsSource` returns its fields under exactly the names `withColumnSort` takes. `withColumnSort` translates each edit's row back to original space, `recordsSource` looks up `records[row]`, and your `onEdit` receives the right object. No `getOriginalIndex` call anywhere, and no way to forget one.",
        },
        {
            kind: "list",
            items: [
                "`location[0]` needs **no** adjustment — it is already in your own column space, because the grid strips the row-marker column at the callback boundary.",
                "`@onSelectionChanged` reports **displayed** rows deliberately, since that is what is visually selected. `getOriginalIndex(displayedRow)` is the escape hatch for correlating one back to a record; with no sort active it is the identity function.",
                "The handler you pass *in* must itself be identity-stable — a class-field arrow or a module-scope function — because it is part of the decorator's memo key.",
                "Prefer keying stored edits by a stable **record id and column id** rather than numeric indices, so they also survive a column reorder.",
            ],
        },

        // -- async -------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**When you can't hold the data in memory.** Everything above assumes a materialized array. The only case that needs something different is when you fundamentally do not have one — and note that this is a question about your *data*, not a row count. 200,000 records genuinely in memory can use the pattern above; 500 rows arriving page-by-page from a server cannot.",
        },
        {
            kind: "list",
            items: [
                "an infinite or async feed where rows load as you scroll",
                "server-side pagination",
                "synthetic or computed rows, with no backing objects at all",
                "a high-frequency stream where you already know exactly which cells changed",
            ],
        },
        {
            kind: "code",
            text: `import { AsyncRecordsSource } from "glide-data-grid-ember/data-source/index";

export default class PagedTable extends Component {
  // Constructed ONCE, as a class field. It owns a row buffer and page state, so unlike the pure
  // decorators it is an object you hold rather than a function you re-call — and its bound instance
  // fields are identity-stable for free, with no \`@cached\` to remember.
  source = new AsyncRecordsSource({
    columns: COLUMNS,
    rows: 100_000,          // total, including rows not yet loaded — the scrollbar needs it up front
    pageSize: 100,
    maxConcurrency: 4,
    toCell,                 // unloaded rows never reach it; they draw as \`Loading\` cells
    getRowData: async ([start, end]) => fetchPage(start, end),
    onCellEdited: (record, col, value) => { /* return a replacement record, or mutate in place */ },
  });
}`,
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @columns={{this.source.columns}}
  @rows={{this.source.rows}}
  @getCellContent={{this.source.getCellContent}}
  @onCellsEdited={{this.source.onCellsEdited}}
  @onVisibleRegionChanged={{this.source.onVisibleRegionChanged}}
  @onReady={{this.source.attach}}
/>`,
        },
        {
            kind: "p",
            text: "Both of the last two args are required and do different jobs. `@onVisibleRegionChanged` tells the source which rows are on screen, so it knows what to fetch. `@onReady` hands it the grid's imperative `updateCells` API, which is what repaints a page once it lands — without it the pages still load, and nothing shows them until some unrelated event happens to repaint. `setRowCount()` updates the total when the server tells you the real one, and `invalidate()` drops the buffer so pages refetch. The **Async paging** tab is this, live, at 100,000 rows.",
        },
        {
            kind: "p",
            text: "The same imperative escape hatch is available on any grid, streaming or not:",
        },
        {
            kind: "code",
            text: `onGridReady = api => { this.api = api; };     // <GlideDataGrid @onReady={{this.onGridReady}} />

// ...later, from a websocket tick:
this.api.updateCells([{ cell: [3, 91] }, { cell: [4, 91] }]);`,
        },
        {
            kind: "p",
            text: "`updateCells` does a damage-based partial repaint of exactly those cells and bypasses autotracking entirely. It is how the grid gets its high-frequency-update numbers (the **Streaming updates** tab measures it at hundreds of thousands of cells per second) — and it is deliberately imperative. It is not a fallback for having written the tracked pattern wrong.",
        },

        // -- tuning ------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Tuning notes.** Only relevant if profiling actually points here.",
        },
        {
            kind: "list",
            items: [
                "**The eager read is O(rows)** even when every row is a cache hit. It is a walk of property reads, so it is cheap — but with hundreds of thousands of *in-memory* records and known-changed rows, switching those rows to `updateCells` removes it. Keep the per-row memoization either way.",
                "**Don't memoize rows in a `WeakMap` keyed on the record object.** It looks like an obvious win and is wrong for any normalized cache that mutates entities in place: the identity never changes, so the cache silently serves stale rows. `recordsSource` is *not* this — it caches a tracked computation, which that very mutation invalidates, rather than a plain value that has nothing to invalidate it.",
                "**A record class with no `@tracked` fields produces a permanently constant cache.** That is correct rather than stale: nothing about such a record can change without a new `records` array, which rebuilds everything.",
            ],
        },

        // -- evidence ----------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Measured, not asserted.** The claim that one edit re-projects one row was measured in Chrome against the built addon, at 1,000 rows and 7 columns, by a projection that increments a counter on every call — so \"rows re-projected since the last action\" is a number on screen rather than an inference. It is the **Scale proof** tab.",
        },
        {
            kind: "table",
            head: ["Action", "Rows re-projected", "`toCell` calls"],
            rows: [
                ["Initial build (cold)", "1000 of 1000", "7000"],
                ["**Edit one field on one record**", "**1 of 1000**", "**7**"],
                ["Add a nested related entity to one record", "1 of 1000", "7"],
                ["Re-render touching no record", "0 of 1000", "0"],
                ["Replace the `records` array", "1000 of 1000", "7000"],
            ],
        },
        {
            kind: "p",
            text: "The edited row visibly repainted in each case with **no** `updateCells()`, no `@onCellsEdited` (that grid is given no write path at all) and every cell `allowOverlay: false` — so autotracking is the only thing that could have caused it. The 1-row result holds for a row scrolled out of view as well as a visible one, so it is not an artifact of what is painted. The last row is the concrete cost of *the one way to break it*: those record objects were identical instances and only the array identity changed, and that alone rebuilt all 1,000 projections.",
        },
    ],
};
