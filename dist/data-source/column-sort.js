import { GridCellKind } from '../rendering/data-grid-types.js';

// Column sort -- Phase 7a of the Ember port.
//
// Ported from source's `packages/source/src/use-column-sort.ts` (a React hook). Per PHASES.md's
// Phase 8 scope research, source's `packages/source` hooks are **composable decorators over
// `getCellContent`**, not wrapper components, so this ports as a plain function over plain objects.
// `compareSmart`/`compareRaw`/`cellToSortData`/`tryParse` and the sort-map construction are
// near-verbatim; only the React memo plumbing is replaced (see below).
//
// Intended composition (Phase 8 adds `recordsSource` alongside this):
//
//     @cached get gridArgs() {
//         const src = recordsSource({ records: this.people, columns: this.columns });
//         return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
//     }
//
// -------------------------------------------------------------------------------------------
// IDENTITY STABILITY -- read this before changing anything about how results are returned.
// -------------------------------------------------------------------------------------------
//
// `getCellContent` is one of the ~18 `DrawGridArg` fields `computeCanBlit`
// (`../rendering/render/data-grid-render.blit.ts`) compares by **object identity** (`!==`). A
// freshly-allocated closure there permanently disables the scroll blit fast path -- silently: no
// error, no warning, no visual difference. That exact bug went undetected in this port from Phase 2
// to Phase 6 (see PORTING-NOTES.md, "MAJOR pre-existing finding: `computeCanBlit` compares
// `DrawGridArg` fields by IDENTITY" and standing lesson #1). React's `useMemo`/`useCallback` is what
// makes the source hook immune; we have no such thing here.
//
// So this module **memoizes internally** rather than delegating the problem to the consumer via a
// "you must wrap this in `@cached`" doc note. The fast path is then correct by construction: calling
// `withColumnSort` repeatedly with unchanged inputs returns the *same* result object, carrying the
// *same* `getCellContent` closure.
//
// Cache shape: a module-scope `WeakMap` keyed on the incoming `getCellContent`'s identity (so
// multiple grids on one page don't fight, and entries are collected with their closures), holding a
// single entry of `{ rows, sortKey, onCellsEdited, result }`. **Every value the cached closures
// capture must appear in that key** -- that is the class of bug hand-audited in Phase 6 for
// `mangledGetCellContent`. Concretely: the returned `getCellContent` captures `sortMap` +
// `getCellContent` (keyed), and the returned `onCellsEdited` captures `sortMap` + the *incoming*
// `onCellsEdited` (hence that field in the entry -- without it, swapping the write handler while
// the read handler stayed put would silently keep calling the stale one).
// `sortKey` is a **structural** digest of the resolved
// sort (resolved column index + mode + direction), deliberately not the `sort` argument's identity:
// a consumer writing `get sort() { return { column: this.columns[0], direction: "asc" }; }` allocates
// a fresh object on every read, and keying on identity would rebuild the whole sort map every single
// call. Resolving column indices costs O(sorts x columns) per call (a few hundred `===` at worst),
// which is nothing next to the O(rows) sweep it protects.
//
// Two consequences worth knowing:
//   * When `sort` is undefined (or resolves to no live column), this returns the caller's *original*
//     `getCellContent` reference unchanged -- not a pass-through wrapper. Source does exactly this,
//     and a wrapper would be a fresh identity that breaks blit for the common no-sort case.
//   * The sort map is keyed on `getCellContent` identity, so -- exactly like source's `useMemo` --
//     mutating the data *behind* an identity-stable `getCellContent` does **not** re-sort. Consumers
//     using this port's lazy-closure + `updateCells()` pattern (see DATA.md / PORTING-NOTES.md's
//     "Autotracking -> canvas" section) must hand over a new `getCellContent` identity when the
//     underlying values change, if they want the ordering to follow.
//   * Two different grids sharing one `getCellContent` function but different `rows`/`sort` will
//     thrash the single cache entry and rebuild on each alternating call. That degrades to source's
//     own behaviour rather than breaking; it is not worth a multi-entry cache.


/** One committed edit, exactly as `<GlideDataGrid @onCellsEdited=...>` reports it. */

/**
 * A single column's sort instruction.
 *
 * `column` is matched against the supplied `columns` by object identity first, then by `id` -- so
 * a freshly-allocated `GridColumn` still resolves as long as it carries the same `id`.
 *
 * `mode` selects the comparator: `"raw"` = `compareRaw` (plain `>`/`===`), `"smart"` =
 * `compareSmart` (numeric-aware, falls back to `localeCompare`), anything else (the default) =
 * plain `String.localeCompare`.
 */

/** Input to {@link withColumnSort}. Mirrors source's `Props`, plus the write path (see below). */

/** Output of {@link withColumnSort}. Mirrors source's `Result`. */

function cellToSortData(c) {
  switch (c.kind) {
    case GridCellKind.Number:
      return c.data?.toString() ?? "";
    case GridCellKind.Boolean:
      return c.data?.toString() ?? "";
    case GridCellKind.Markdown:
    case GridCellKind.RowID:
    case GridCellKind.Text:
    case GridCellKind.Uri:
      return c.data ?? "";
    case GridCellKind.Bubble:
    case GridCellKind.Image:
      return c.data.join("");
    case GridCellKind.Drilldown:
      return c.data.map(x => x.text).join("");
    case GridCellKind.Protected:
    case GridCellKind.Loading:
      return "";
    case GridCellKind.Custom:
      return c.copyData;
    default:
      // Unreachable for `GridCell`; guards against a cell kind arriving from untyped JS.
      return "";
  }
}
function tryParse(val) {
  if (typeof val === "number") return val;
  if (val.length > 0) {
    const x = Number(val);
    if (!isNaN(x)) {
      val = x;
    }
  }
  return val;
}

/**
 * Numeric-aware comparator: numeric-looking strings compare as numbers, everything else via
 * `localeCompare`. Ported verbatim from source.
 */
function compareSmart(a, b) {
  a = tryParse(a);
  b = tryParse(b);
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  } else if (typeof a === "number" && typeof b === "number") {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  } else if (a == b) {
    // Loose equality is deliberate and matches source -- this branch exists to catch the
    // mixed string/number case (e.g. `1 == "1"`).
    return 0;
  }
  return a > b ? 1 : -1;
}

/** Plain relational comparator. Ported verbatim from source. */
function compareRaw(a, b) {
  if (a > b) return 1;
  if (a === b) return 0;
  return -1;
}

// The entry is deliberately split into a read half and a write half, because they have different
// keys and *wildly* different rebuild costs.
//
//   read half  -- `sortMap`/`getCellContent`/`getOriginalIndex`, keyed on {`getCellContent` (the
//                 WeakMap key), `rows`, `sortKey`}. Rebuilding it means an O(rows) sweep through the
//                 caller's `getCellContent` plus a sort, and this runs on the paint path.
//   write half -- `onCellsEdited`, additionally keyed on the *incoming* handler's identity, because
//                 the returned closure captures it (capture vs. key -- see the header comment).
//                 Rebuilding it is one closure allocation.
//
// Keeping them separate matters for a consumer whose edit handler isn't identity-stable (an inline
// arrow in a getter is the easy mistake). With one combined key, every such call would rebuild the
// sort map mid-draw; split, it costs an allocation and -- importantly -- `getCellContent` keeps its
// identity, so the blit fast path survives the consumer's mistake instead of being silently lost.

const cache = new WeakMap();
const identityIndex = index => index;
function resolveActiveSorts(sort, columns) {
  if (sort === undefined) return [];
  const sorts = Array.isArray(sort) ? sort : [sort];
  const result = [];
  for (const s of sorts) {
    const col = columns.findIndex(c => s.column === c || c.id !== undefined && s.column.id === c.id);
    if (col === -1) continue;
    result.push({
      sort: s,
      col
    });
  }
  return result;
}
function sortCacheKey(activeSorts) {
  let key = "";
  for (const {
    sort: s,
    col
  } of activeSorts) {
    key += `${col}:${s.mode ?? "default"}:${s.direction ?? "asc"}|`;
  }
  return key;
}

// This scales to about 100k rows. Beyond that things take a pretty noticeable amount of time.
// The performance "issue" from here on out seems to be the lookup to get the value -- we need the
// indirection to produce the final sort map. (Source's own note, still accurate here; the one thing
// this port adds is that the sweep below happens at most once per {getCellContent, rows, sort}
// combination rather than on every call, so it never lands on the paint path.)
function buildSortMap(activeSorts, rows, getCellContentIn) {
  const values = [];
  for (const {
    col
  } of activeSorts) {
    const colValues = new Array(rows);
    const index = [col, 0];
    for (let i = 0; i < rows; i++) {
      index[1] = i;
      colValues[i] = cellToSortData(getCellContentIn(index));
    }
    values.push(colValues);
  }
  const sortMap = new Array(rows);
  for (let i = 0; i < rows; i++) sortMap[i] = i;
  return sortMap.sort((a, b) => {
    for (let sIndex = 0; sIndex < activeSorts.length; sIndex++) {
      // Loop bound guarantees both of these exist.
      const colSort = activeSorts[sIndex].sort;
      const colValues = values[sIndex];
      const va = colValues[a];
      const vb = colValues[b];
      let cmp;
      if (colSort.mode === "raw") {
        cmp = compareRaw(va, vb);
      } else if (colSort.mode === "smart") {
        cmp = compareSmart(va, vb);
      } else {
        cmp = va.localeCompare(vb);
      }
      if (cmp !== 0) {
        if ((colSort.direction ?? "asc") === "desc") cmp = -cmp;
        return cmp;
      }
    }
    return 0;
  });
}

/**
 * Wraps a `getCellContent` so that rows are served in sorted order.
 *
 * Port of source's `useColumnSort` hook. The result is memoized on the *structure* of the inputs,
 * so repeated calls with unchanged inputs return the identical object and the identical
 * `getCellContent` closure -- required for the render engine's scroll blit fast path (see this
 * file's header comment).
 *
 * When `sort` is undefined, or names no column present in `columns`, the caller's own
 * `getCellContent` and `onCellsEdited` references are returned unchanged and `getOriginalIndex` is
 * the identity function.
 */
function withColumnSort(p) {
  const {
    columns,
    rows,
    getCellContent: getCellContentIn,
    onCellsEdited: onCellsEditedIn,
    sort
  } = p;
  const activeSorts = resolveActiveSorts(sort, columns);
  const sortKey = sortCacheKey(activeSorts);
  const cached = cache.get(getCellContentIn);
  // The read half is valid whenever the sort itself is unchanged -- independent of the write
  // handler. See `CacheEntry`'s comment for why those two are keyed separately.
  const readReusable = cached !== undefined && cached.rows === rows && cached.sortKey === sortKey;
  if (readReusable && cached.onCellsEditedIn === onCellsEditedIn) {
    return cached.result;
  }
  let sortMap;
  let getCellContent;
  let getOriginalIndex;
  if (readReusable) {
    // Only the edit handler changed: reuse the sort map and, critically, the *same*
    // `getCellContent` identity, so the blit fast path is unaffected.
    ({
      sortMap,
      getCellContent,
      getOriginalIndex
    } = cached);
  } else if (activeSorts.length === 0) {
    // No sort: hand back the caller's own function. A pass-through wrapper here would be a
    // fresh identity every call and would kill the blit fast path for the common case.
    sortMap = undefined;
    getCellContent = getCellContentIn;
    getOriginalIndex = identityIndex;
  } else {
    const map = buildSortMap(activeSorts, rows, getCellContentIn);
    sortMap = map;
    getCellContent = ([col, row]) => getCellContentIn([col, map[row] ?? row]);
    getOriginalIndex = index => map[index] ?? index;
  }
  const map = sortMap;
  const result = {
    getCellContent,
    // With no sort active, displayed order *is* original order, so the caller's own handler is
    // returned unchanged rather than wrapped -- one less identity to churn on the common path.
    onCellsEdited: map === undefined || onCellsEditedIn === undefined ? onCellsEditedIn : edits => {
      // Translate displayed -> original row, then forward the batch in one call so
      // a paste (which arrives as a single multi-cell batch) stays one notification.
      // `location[0]` is left alone: already in the consumer's own column space.
      onCellsEditedIn(edits.map(({
        location,
        value
      }) => {
        const [col, row] = location;
        const item = [col, map[row] ?? row];
        return {
          location: item,
          value
        };
      }));
    },
    getOriginalIndex
  };
  cache.set(getCellContentIn, {
    rows,
    sortKey,
    getCellContent,
    getOriginalIndex,
    sortMap,
    onCellsEditedIn,
    result
  });
  return result;
}

export { compareRaw, compareSmart, withColumnSort };
//# sourceMappingURL=column-sort.js.map
