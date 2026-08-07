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
// Compile once, at module scope -- not per row, and definitely not per cell.
const petNames = objectScan(["pets.name"], { useArraySelector: false, rtn: "value" });

@cached get cells() {
    return [
        // ...
        { kind: GridCellKind.Text, allowOverlay: false, data: petNames(this.person).sort().join(", ") },
    ];
}
```

The grid has no opinion about how you do this and takes no dependency on any path/traversal library
— `object-scan`, `lodash.get`, or a hand-written closure are all equally fine. Just keep it on the
`cells` side of the boundary.

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

## Planned

A `recordsSource` helper is planned (see `PHASES.md`, Phase 8) that packages exactly the pattern
above — you'd hand it `records` plus per-column accessor functions and get back `columns`/`rows`/
`getCellContent`, with the per-row `@cached` memoization handled internally. It is designed to
compose with other data-source decorators such as column sort. Until it lands, write the pattern by
hand as shown; it's the same shape, so migrating will be mechanical.
