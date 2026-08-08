# Feeding data into `<GlideDataGrid>`

**There is one recommended pattern. Write it this way every time and it scales from 8 rows to
hundreds of thousands without changing shape.** If you only read one section, read
[The pattern](#the-pattern).

There is exactly one situation that needs something different, and it is decided by a fact about
your data rather than by a row count you have to estimate — see
[When you can't hold the data in memory](#when-you-cant-hold-the-data-in-memory).

---

## The contract underneath

`<GlideDataGrid>` is a *pull* API: you give it `@columns`, `@rows` (a count) and `@getCellContent`,
and it asks for cells as it paints them. Two consequences drive everything below.

**1. `getCellContent` must be an O(1) lookup, never a computation.** It is called once per painted
cell, inside the draw loop — a full repaint of a normal viewport is a few hundred calls, and a fast
scroll is a fresh strip every frame. Formatting, date parsing, or digging through nested objects
inside `getCellContent` puts that work directly on the paint path.

**2. Autotracking only records reads that happen *during* the tracking frame.** The grid's modifier
reads `this.args.getCellContent` — the *function reference*. It never calls it. So any `@tracked`
property your closure touches later, when the grid invokes it at paint time, is read outside the
frame and **never becomes a dependency**. This is the single most common way to end up with a grid
that silently doesn't update:

```js
// ❌ Never repaints on a tracked change. The read of `person.name` happens at paint time.
getCellContent = ([col, row]) => cellFor(this.people[row], col);
```

The pattern below satisfies both rules by construction, which is why it's the one to use.

---

## The pattern

Two pieces: a per-row view model that projects one record, and a getter that reads them all.

> The addon ships this as a one-call helper — see
> [`recordsSource`: the pattern, packaged](#recordssource-the-pattern-packaged). Use that. Read the
> hand-written version below anyway: it is exactly what the helper does internally, and knowing the
> shape is what lets you tell a real problem from a misuse.

```ts
import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

// 1. One view model per record. Its getter reads only THIS record's tracked fields, so a change
//    to one record invalidates one row -- not the whole table.
class PersonRow {
    constructor(private readonly person: Person) {}

    @cached
    get cells(): readonly GridCell[] {
        const p = this.person;
        return [
            { kind: GridCellKind.Text, allowOverlay: true, data: p.name, displayData: p.name },
            { kind: GridCellKind.Text, allowOverlay: true, data: p.email, displayData: p.email },
            { kind: GridCellKind.Number, allowOverlay: true, data: p.age, displayData: String(p.age) },
            { kind: GridCellKind.Boolean, allowOverlay: false, data: p.active },
        ];
    }
}

export default class PeopleTable extends Component {
    @tracked people: readonly Person[] = [];

    readonly columns: readonly GridColumn[] = [
        { title: "Name", width: 200 },
        { title: "Email", width: 240 },
        { title: "Age", width: 90 },
        { title: "Active", width: 90 },
    ];

    get rows() {
        return this.people.length;
    }

    // 2. Keyed on the ARRAY identity, so editing a field does not rebuild the view models.
    //    This is load-bearing -- see the warning below.
    @cached
    get rowVMs(): readonly PersonRow[] {
        return this.people.map(p => new PersonRow(p));
    }

    // 3. Reading `.cells` here (inside the tracking frame) is what registers every record's
    //    tracked fields as dependencies. Unchanged rows are cache hits.
    get getCellContent(): (item: Item) => GridCell {
        const rows = this.rowVMs.map(vm => vm.cells);
        return ([col, row]: Item) =>
            rows[row]?.[col] ?? { kind: GridCellKind.Text, allowOverlay: false, data: "", displayData: "" };
    }

    <template>
        <GlideDataGrid
            @columns={{this.columns}}
            @rows={{this.rows}}
            @getCellContent={{this.getCellContent}}
        />
    </template>
}
```

That's it. Mutating `person.name` in place repaints that cell. Replacing `this.people` wholesale
repaints the table. You don't call anything imperative, and you don't decide anything based on size.

### Why this scales

Changing one field invalidates exactly one `PersonRow.cells` cache. The outer `.map()` re-runs, but
it is *N cache hits plus one real recompute* — array iteration, not N projections. At 1,000 rows
that's ~999 property reads and one rebuild instead of 1,000 rebuilds.

### ⚠️ The one way to break it

**`rowVMs` must be keyed on the records *array* identity, not rebuilt when a field changes.** If you
drop the `@cached`, or derive `rowVMs` from something that changes on every edit, every per-row
cache resets on every change and you are back to full recomputation — with extra machinery on top.
If updates feel slow, check this first.

### Where formatting and nested data go

Inside `PersonRow.cells`, never inside `getCellContent`. That includes digging values out of nested
GQL results:

```ts
// Compile once, at module scope, one scanner per column -- not per row, and definitely not per
// cell. Recompiling inside the projection is the single biggest cost in the naive form.
const petNames = objectScan(["pets.name"], { useArraySelector: false, rtn: "value" });

@cached get cells() {
    return [
        // ...
        // Note the scan target: the plain nested payload, not the record object. See the warning below.
        { kind: GridCellKind.Text, allowOverlay: false, data: petNames(this.person.profile).sort().join(", ") },
    ];
}
```

> ⚠️ **Point path scanners at the plain nested payload, not at a class instance.** `object-scan` (and
> most traversal libraries) walk **own enumerable** properties, while `@tracked` fields are accessors
> on the prototype. A scanner aimed at a model object matches nothing, silently. Scanning the nested
> blob a GraphQL response actually hands you — `person.profile`, `person.pets` — sidesteps it.

The grid has no opinion about how you do this and takes no dependency on any path/traversal library
— `object-scan`, `lodash.get`, or a hand-written closure are all equally fine. Just keep it on the
`cells` side of the boundary. A worked example, including the per-column hoisting, is in
`test-app/app/utils/scale-records.ts`.

---

## When you can't hold the data in memory

The pattern above assumes you have a materialized array. The **only** case that needs something
different is when you fundamentally don't — data that is paged, streamed, or generated on demand,
where "project every row" isn't a thing you *can* do:

- an infinite/async feed where rows load as you scroll
- server-side pagination
- synthetic or computed rows (no backing objects at all)
- a high-frequency stream where you already know exactly which cells changed

Note this is a question about **your data**, not about a row count. 200,000 records genuinely in
memory can use the pattern above; 500 rows arriving page-by-page from a server cannot.

In that case, write `getCellContent` as a lazy lookup over whatever buffer you do have, and tell the
grid explicitly when something changed:

```ts
<GlideDataGrid @onReady={{this.onGridReady}} ... />

onGridReady = (api: GlideDataGridApi) => (this.grid = api);

// When a row arrives or a value changes:
this.grid.updateCells([{ cell: [col, row] }]);
```

`updateCells` does a damage-based partial repaint of just those cells and bypasses autotracking
entirely. That is the mechanism behind the grid's high-frequency-update performance, and it is
deliberately imperative — it is not a fallback for having written the tracked pattern wrong.

---

## Tuning notes

Only relevant if profiling actually points here.

- **The outer `.map()` in `getCellContent` is O(rows)** even with all cache hits. Cheap (property
  reads), but if you have hundreds of thousands of *in-memory* records and updates feel sluggish,
  switching that one row to `updateCells` for known-changed records removes it. Keep the per-row
  `@cached` either way.
- **`@cached` on `cells` is what makes updates incremental.** Removing it still works and still
  repaints correctly — it just recomputes everything on every change.
- **Don't memoize rows in a `WeakMap` keyed on the record object.** It looks like an obvious win and
  is wrong for any normalized cache (Apollo included) that mutates entities in place: the identity
  doesn't change, so the cache silently serves stale rows. Key on an explicit version field if you
  need this.

---

## ⚠️ If you add column sort, hand your edit handler to the decorator

**Read this before wiring `@onCellsEdited` on a sorted grid. Getting it wrong corrupts data
silently**, and you won't see it until the next re-sort.

`withColumnSort` remaps rows *above* your data layer, so the row index the grid reports for an edit
is the **displayed** one while your `getCellContent` and your records array work in **original** row
order. An edit to the top visible row of a sorted grid arrives as row `0`; writing it to record `0`
updates whichever record happens to be first *unsorted* — a different person.

**The rule: any decorator that remaps the read path also remaps the write path. Pass your handler
*in* and wire the *returned* one to the grid.** Then the two spaces cannot disagree.

```ts
@cached get sorted() {
    return withColumnSort({
        columns,
        rows,
        getCellContent: this.baseGetCellContent,
        onCellsEdited: this.applyEdits,   // <- yours, expects ORIGINAL row indices
        sort: this.sort,
    });
}

@action applyEdits(edits) {
    for (const { location, value } of edits) {
        const [col, originalRow] = location;   // already translated for you
        this.store(originalRow, col, value);
    }
}
```
```hbs
<GlideDataGrid
    @getCellContent={{this.sorted.getCellContent}}
    @onCellsEdited={{this.sorted.onCellsEdited}}   {{! <- the decorator's, not yours }}
/>
```

`sorted.onCellsEdited` is `undefined` if and only if you passed no `onCellsEdited`, and is
identity-stable like `getCellContent`. Make sure the handler you pass *in* is identity-stable too
(`@action`, a class field, or a module-scope function) — it is part of the decorator's memo key.

`recordsSource` implements the same contract, so the composed form needs no wiring at all beyond the
spread: see [Letting `recordsSource` do it](#letting-recordssource-do-it).

Two things that need no adjustment: `location[0]` is already in your own column space (the grid
strips the row-marker column at the callback boundary), and `@onSelectionChanged` reports *displayed*
rows deliberately, since that's what's visually selected.

Prefer keying stored edits by a stable **record id and column id** rather than by numeric indices, so
they also survive column reorders. A worked example is in
`test-app/app/components/glide-demo.gts`.

### The escape hatch: `getOriginalIndex`

`withColumnSort` still returns `getOriginalIndex(displayedRow) → originalRow`, and with no sort
active it is the identity function. Use it when you need the mapping somewhere the built-in write
path doesn't reach — most often to correlate a row from `@onSelectionChanged` (deliberately in
displayed space) back to a record. Prefer the wired write path above for edits; translating by hand
is the shape that already corrupted data once in this project's own demo.

## Status of this recommendation

Honest note, so you can calibrate how much to trust the above. The **eager-read half** — that a
tracked mutation on an in-place model object actually repaints the canvas — is browser-verified
(`test-app/app/components/tracking-demo.gts` exists specifically to prove it, with the grid's own
editing paths disabled so nothing else could account for the repaint).

The **per-row `@cached` half** is now browser-measured too, at 1,000 rows, in
`test-app/app/components/scale-proof.gts` — a table whose projection increments a counter on every
call, so "rows re-projected since the last action" is a number on screen rather than an inference.
Observed, in Chrome, against the built addon:

| Action | Rows re-projected | `toCell` calls |
| --- | --- | --- |
| Initial build (cold) | 1000 of 1000 | 7000 |
| **Edit one field on one record** | **1 of 1000** | **7** |
| Add a nested related entity to one record | 1 of 1000 | 7 |
| Re-render touching no record | 0 of 1000 | 0 |
| Replace the `records` array | 1000 of 1000 | 7000 |

The edited row's cells visibly repainted on the canvas in each case, with no `updateCells()`, no
`@onCellsEdited` (the grid was given no write path at all) and every cell `allowOverlay: false`, so
autotracking is the only thing that could have caused the repaint. The 1-row result holds for a row
scrolled out of view (row 500) as well as a visible one, so it is not an artifact of what is painted.

The last row of that table is the concrete cost of ["the one way to break
it"](#️-the-one-way-to-break-it): the `Employee` objects were identical instances and only the array
identity changed, and that alone rebuilt all 1,000 projections.

One implementation fact this measurement also settles: `recordsSource`'s per-row caches come from
`createCache` in `@glimmer/tracking/primitives/cache`, and they **do** share a tag system with
`@tracked`. If they hadn't, a tracked mutation could not have invalidated a row cache — the count
would have read 0 and the canvas would have gone stale.

## `recordsSource`: the pattern, packaged

Everything in [The pattern](#the-pattern) — the per-row memoization, the eager read inside the
tracking frame, the O(1) `getCellContent` — is available as one call. Prefer it. The hand-written
version above stays in this document because it is exactly what the helper does internally, and
because you'll want to recognise the shape when you read it.

```ts
import { cached, tracked } from "@glimmer/tracking";
import { recordsSource, withColumnSort } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 200 },
    { id: "email", title: "Email", width: 240 },
    { id: "age", title: "Age", width: 90 },
];

// Module scope: `toCell` must be identity-stable (see the rules below).
function toCell(p: Person, col: number): GridCell {
    switch (col) {
        case 0: return { kind: GridCellKind.Text, allowOverlay: true, data: p.name, displayData: p.name };
        case 1: return { kind: GridCellKind.Text, allowOverlay: true, data: p.email, displayData: p.email };
        default: return { kind: GridCellKind.Number, allowOverlay: true, data: p.age, displayData: String(p.age) };
    }
}

export default class PeopleTable extends Component {
    @tracked people: readonly Person[] = [];

    @cached
    get source() {
        return recordsSource({
            records: this.people,
            columns: COLUMNS,
            toCell,
            onCellEdited: (person, col, value) => {
                if (col === 0 && value.kind === GridCellKind.Text) person.name = value.data;  // etc.
            },
        });
    }

    <template>
        <GlideDataGrid
            @columns={{this.source.columns}}
            @rows={{this.source.rows}}
            @getCellContent={{this.source.getCellContent}}
            @onCellsEdited={{this.source.onCellsEdited}}
        />
    </template>
}
```

### API

```ts
function recordsSource<T extends object>(p: {
    records: readonly T[];
    columns: readonly GridColumn[];
    toCell: (record: T, col: number) => GridCell;
    onCellEdited?: (record: T, col: number, value: GridCell) => void;
}): {
    columns: readonly GridColumn[];
    rows: number;
    getCellContent: (cell: Item) => GridCell;
    onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void;
};
```

`onCellsEdited` is `undefined` if and only if you passed no `onCellEdited`. Note the singular/plural:
you write the *per-cell* handler that receives the actual **record object**; the helper produces the
batched, index-based callback the grid wants.

### Letting `recordsSource` do it

The field names are the ones `withColumnSort` takes and the ones `<GlideDataGrid>` wants, so sorting
composes by spreading — and because both implement the same read/write coordinate contract (previous
section), the edit that arrives at your `onCellEdited` is already matched to the right record:

```ts
@cached
get gridArgs() {
    const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
    return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
}
```
```hbs
<GlideDataGrid
    @columns={{this.gridArgs.columns}}
    @rows={{this.gridArgs.rows}}
    @getCellContent={{this.gridArgs.getCellContent}}
    @onCellsEdited={{this.gridArgs.onCellsEdited}}
/>
```

`withColumnSort` translates each edit's row from displayed space back to original space, then
`recordsSource` looks up `records[row]`. No `getOriginalIndex` call anywhere, and no way to forget
one.

### Four rules

1. **Call it inside a tracked computation** — a `@cached` getter is the idiomatic place. This is
   load-bearing, not style: `recordsSource` projects every row *during the call*, and those reads are
   what register your records' `@tracked` fields as dependencies of the frame that repaints the grid.
   Call it in a constructor or an action and nothing will ever update.
2. **`toCell` must be identity-stable** — module scope, a class field, or an `@action`. Not an arrow
   allocated inline in the getter. The per-row caches close over it, so a new identity rebuilds all
   of them.
3. **Replace the `records` array; mutate the records** — mutating a record's `@tracked` fields in
   place is the supported way to change data, and is what makes updates incremental. Adding,
   removing or reordering rows must produce a **new array**; an in-place `push`/`splice` keeps the
   array's identity and will be missed.
4. **Put formatting and nested-data digging in `toCell`, never in `getCellContent`** — same boundary
   as [Where formatting and nested data go](#where-formatting-and-nested-data-go). `toCell` runs once
   per record and is memoized; `getCellContent` is on the paint path and is a plain array index.

`toCell` is a plain accessor function generic over your row type — deliberately not a path string.
The addon takes no dependency on any traversal library (`object-scan`, `lodash.get`, hand-written
closures are all equally fine and all live on your side of the boundary); compile any such scanner
once at module scope, not per row and definitely not per cell.

### What it does under the hood

Each record gets its own tracked cache (`createCache` from `@glimmer/tracking/primitives/cache` —
the non-decorator form of `@cached`) whose function reads only that record's fields. The set of
caches is rebuilt only when `records`/`columns`/`toCell` change identity. Every call reads all of
them eagerly; unchanged rows are cache hits returning the identical array, so a one-field edit is
N cheap hits plus one real projection. `getCellContent` then closes over the resulting array of
projections and does a single index into it, with a shared module-scope fallback cell for
out-of-range coordinates.

Repeated calls whose row projections all came back identical return the **same result object**, so
`getCellContent` keeps its identity and the renderer's scroll fast path stays engaged; when a row
really changed, a fresh identity is returned, which is what makes the grid repaint.

One consequence worth knowing: a record class with **no** `@tracked` fields produces a permanently
constant cache — it will never re-project. That is correct rather than stale, because nothing about
such a record can change without a new `records` array, which rebuilds everything. It is also why
this is *not* the `WeakMap`-keyed-on-the-record anti-pattern in
[Tuning notes](#tuning-notes) above: that warning is about caching plain **values** by record
identity, which has nothing to invalidate it when a normalized store mutates the entity in place. A
tracked cache is invalidated *by* that same mutation.
