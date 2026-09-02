import { getValue, createCache } from '@glimmer/tracking/primitives/cache';
import { GridCellKind } from '../rendering/data-grid-types.js';

// Records source -- Phase 8b of the Ember port.
//
// **This has no counterpart in source.** `packages/source` only ships the *async paged* data source
// (`pageSize`/`maxConcurrency`, a `Promise` per requested range); for the ordinary bounded case its
// consumers hand-write `getCellContent`. This module is the synchronous, in-memory equivalent, and
// it exists for a reason specific to this port: it is the one place where the two Ember-specific
// reactivity rules that consumers otherwise get wrong can be encoded **once**.
//
// It is the executable form of `DATA.md`'s "The pattern" section. If you change the behaviour here,
// `DATA.md` is the spec and must change with it.
//
// -------------------------------------------------------------------------------------------
// RULE 1 -- the projection must be read EAGERLY, inside the caller's tracking frame.
// -------------------------------------------------------------------------------------------
//
// Autotracking only records reads that happen *during* a tracked computation. `<GlideDataGrid>`'s
// modifier reads `this.args.getCellContent` -- the function *reference*. It never calls it. So any
// `@tracked` field a lazy `getCellContent` closure touches later, at paint time, is read outside the
// frame and never becomes a dependency: the grid silently never repaints. (Full write-up in
// PORTING-NOTES.md, "Autotracking -> canvas: how a consumer actually gets reactive cell updates".)
//
// `recordsSource` therefore projects **every** row during the call -- see the `getValue` loop below.
// That is why this cannot be a lazy closure, and why calling it from inside a `@cached` getter (or
// anywhere else the framework is tracking) is load-bearing rather than stylistic.
//
// -------------------------------------------------------------------------------------------
// RULE 2 -- per-row memoization, so one edit recomputes one row.
// -------------------------------------------------------------------------------------------
//
// Projecting every row on every change would make rule 1 quadratic-feeling at scale. So each record
// gets its own `createCache` (the non-decorator form of `@cached`, from
// `@glimmer/tracking/primitives/cache`), whose function reads only *that* record's tracked fields.
// Mutating one record dirties one cache; the eager loop above is then N cache hits plus one real
// recompute, i.e. an array walk rather than N projections.
//
// The set of caches is rebuilt only when `records`/`columns`/`toCell` change **identity**, because
// those are exactly the values the cache functions close over. Rebuilding them on every call would
// reset every per-row cache and put us back to full recomputation with extra machinery on top --
// that is `DATA.md`'s "the one way to break it", expressed here as a cache key.
//
// `records` is typed `readonly T[]` and treated as immutable: mutate a *record* in place all you
// like (that is the point), but replace the *array* when its membership or order changes. An
// in-place `push`/`splice` keeps the array's identity and will be missed.
//
// Corollary -- **const caches are fine, and expected.** A record with no `@tracked` fields at all
// consumes no tracked state, so Glimmer marks its cache constant (`isConst`) and it will never
// recompute for the life of that cache. That is correct here rather than a staleness bug, because
// such a record has no way to change: the only thing that could change what it projects to is a new
// `records` array (or new `columns`/`toCell`), and all three rebuild the caches from scratch.
//
// Corollary -- **this is NOT the `WeakMap` anti-pattern the tuning notes warn about.** Those notes
// say "don't memoize rows in a `WeakMap` keyed on the record object", because a store that mutates
// entities **in place** -- Ember Data, and any normalized store built the same way -- leaves the
// record's identity unchanged while its contents change, so an
// identity-keyed cache of plain *values* silently serves stale rows. The distinction is what is
// cached, not what it is keyed on. A plain value has nothing to invalidate it. A tracked
// `createCache` is invalidated **by that very in-place mutation** -- the mutation dirties the tag
// the cache consumed -- so keying on the record is safe precisely in the case that breaks the naive
// version. (This module's outer key is the records *array*, and the per-row caches are positional,
// but the same reasoning is what makes it sound.)
//
// **Apollo Client is the opposite case, and was named wrongly here until 2026-08-09.** Its
// `InMemoryCache` is *immutable*: a change produces a new object, and unchanged entities keep
// referential equality (result caching, field-level dependency tracking). So identity there is a
// reliable change signal rather than a misleading one, and the anti-pattern above does not apply.
// The practical consequence for this module runs the other way: because the containing array is new
// on every cache update, `cachesReusable` is false and **every** row re-projects, even when one
// field changed. That is a cost, not a correctness problem, and it is off the paint path. An opt-in
// record-keyed row cache would fix it; nobody has measured that it hurts yet. See the guide's
// "Ember Data, GraphQL, and Apollo" chapter, which documents the trade-off consumer-side (and
// targets Apollo Client 4 -- immutability is unchanged from v3, but v4 removed the
// `@apollo/client/core` entry point and `canonizeResults`).
//
// -------------------------------------------------------------------------------------------
// IDENTITY STABILITY -- read `column-sort.ts`'s header and PORTING-NOTES.md standing lesson #1.
// -------------------------------------------------------------------------------------------
//
// `getCellContent` is one of the ~18 `DrawGridArg` fields `computeCanBlit` compares by **identity**;
// a fresh closure per call silently disables the scroll blit fast path. So `recordsSource` returns
// the *same* result object across calls whose inputs genuinely didn't change. "Genuinely didn't
// change" is decided by an element-wise identity scan of the per-row projections: `createCache`
// returns a brand-new array whenever it recomputes, so projection identity is an exact signal for
// "this row changed". The scan is O(rows) of `===`, which is far cheaper than the O(rows x cols)
// re-projection it is already saving, and unlike a structural digest it cannot report equal for
// genuinely different data. When a row *did* change, a fresh `getCellContent` identity is correct
// and wanted -- the data really is different and the grid must repaint.


/** Input to {@link recordsSource}. */

/**
 * Output of {@link recordsSource}.
 *
 * The field names are deliberately exactly those `<GlideDataGrid>` and `withColumnSort` expect, so
 * the two compose by spreading:
 *
 * ```ts
 * @cached get gridArgs() {
 *     const src = recordsSource({ records: this.people, columns: this.columns, toCell });
 *     return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
 * }
 * ```
 */

/**
 * Returned for an out-of-range `[col, row]`. Module scope so it is never an allocation on the paint
 * path. `allowOverlay: false` so a stray click on a phantom cell can't open an editor over nothing.
 */
const FALLBACK_CELL = {
  kind: GridCellKind.Text,
  allowOverlay: false,
  data: "",
  displayData: ""
};

// The internals are non-generic (`unknown` records) so the cache entry below needs no type
// parameter and `RowCache` can be named without an instantiation expression. `recordsSource`'s
// single cast at the boundary is the only place the two meet; `toCell`/`onCellEdited` are never
// *called* with anything other than an element of the very array they were handed.

function createRowCaches(records, columns, toCell) {
  return records.map(record => createCache(() => {
    const cells = new Array(columns.length);
    for (let c = 0; c < columns.length; c++) {
      cells[c] = toCell(record, c);
    }
    return cells;
  }));
}
// Keyed on the records array's identity. WeakMap so several grids on a page don't collide and so
// entries die with the arrays they describe.
const cache = new WeakMap();
function sameProjections(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Turns an in-memory array of records into the `columns` / `rows` / `getCellContent` /
 * `onCellsEdited` args `<GlideDataGrid>` consumes, with per-row memoization and correct autotracking
 * handled internally.
 *
 * Call it from inside a tracked computation (a `@cached` getter is the idiomatic place) -- it reads
 * every record's tracked fields during the call, and that is what registers them as dependencies of
 * the frame that will re-run and repaint the grid. See this file's header for the full mechanism.
 *
 * ```ts
 * const toCell = (p: Person, col: number): GridCell =>
 *     col === 0
 *         ? { kind: GridCellKind.Text, allowOverlay: true, data: p.name, displayData: p.name }
 *         : { kind: GridCellKind.Number, allowOverlay: true, data: p.age, displayData: String(p.age) };
 *
 * @cached get gridArgs() {
 *     const src = recordsSource({
 *         records: this.people,
 *         columns: this.columns,
 *         toCell,
 *         onCellEdited: (person, col, value) => { ... },
 *     });
 *     return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
 * }
 * ```
 */
function recordsSource(p) {
  const {
    records,
    columns
  } = p;
  // Safe by construction: the only values ever passed to these are elements of `records` itself.
  const toCell = p.toCell;
  const onCellEdited = p.onCellEdited;
  const prev = cache.get(records);
  // The row caches close over `records[i]`, `columns` and `toCell`. Reuse them (and therefore
  // every per-row memo) unless one of those three changed identity.
  //
  // The length check is NOT redundant with the `records` identity key, and leaving it out is a
  // silent-blank-rows bug. The documented contract is "replace the array when rows are added or
  // removed", but Ember Data's live arrays (`store.peekAll(...)`, a retained `findAll` result)
  // deliberately keep ONE identity for the life of the store and mutate in place. Their tracked
  // `length` still invalidates the caller's `@cached` getter, so this function re-runs -- with
  // the *same* `records` identity, the *old* `caches`, and a *new* `records.length`. `rows` would
  // then exceed `projections.length` and every added row would paint `FALLBACK_CELL`: blank cells,
  // no error, no warning. Rebuilding on a length change costs one full re-projection on a row
  // add/remove, which is the correct price and still O(1) per painted cell afterwards.
  const cachesReusable = prev !== undefined && prev.columns === columns && prev.toCell === toCell && prev.caches.length === records.length;
  const caches = cachesReusable ? prev.caches : createRowCaches(records, columns, toCell);

  // EAGER READ (rule 1). Must happen on every call, inside the caller's tracking frame -- this is
  // what consumes each record's `@tracked` fields. Unchanged rows are cache hits and return the
  // identical array they returned last time (rule 2).
  const projections = new Array(caches.length);
  for (let i = 0; i < caches.length; i++) {
    // `getValue` is typed `T | undefined` only because `Cache` is nominally opaque; our compute
    // function always returns an array.
    projections[i] = getValue(caches[i]) ?? [];
  }
  if (cachesReusable && prev.onCellEdited === onCellEdited && sameProjections(prev.projections, projections)) {
    // Nothing a returned closure captures differs -> hand back the identical result object, so
    // `computeCanBlit`'s identity check on `getCellContent` keeps passing.
    return prev.result;
  }
  const result = {
    columns,
    rows: records.length,
    // O(1) lookup, no computation: everything was projected above.
    getCellContent: ([col, row]) => projections[row]?.[col] ?? FALLBACK_CELL,
    onCellsEdited: onCellEdited === undefined ? undefined : edits => {
      for (const {
        location,
        value
      } of edits) {
        const [col, row] = location;
        const record = records[row];
        // Out of range: the trailing "add row" affordance reports one row past the
        // end, and there is no record to write to. Dropping it matches the grid's
        // non-mutating contract -- adding rows is the consumer's own concern.
        if (record === undefined) continue;
        onCellEdited(record, col, value);
      }
    }
  };
  cache.set(records, {
    columns,
    toCell,
    onCellEdited,
    caches,
    projections,
    result
  });
  return result;
}

export { recordsSource };
//# sourceMappingURL=records-source.js.map
