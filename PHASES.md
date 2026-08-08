# glide-data-grid → Ember port: phase plan & status

This file is the durable plan/status record for this port — written so a fresh Claude session
(context cleared, or picking this up cold) can resume without re-deriving anything. Read this file
first for "what's the plan and where are we," then read `PORTING-NOTES.md` for "what facts/gotchas
were already established." Update both as work progresses; don't let either go stale.

## Original request (verbatim intent, condensed)

Port glide-data-grid (React canvas data grid, this machine's `/Users/jxhui/Developer/glide-data-grid`)
to a **full-parity** Ember 7 v2 addon at `/Users/jxhui/Developer/glide-data-grid-ember`, using `.gts`
components and Vite, prod-quality. Explicit requirements called out by the user:

- Performance parity, especially scroll performance (native scrolling, not JS-driven)
- Sticky header — always visible, doesn't move during scroll
- Vertical AND horizontal scroll, header stays sticky through both
- Copy/paste of cells, columns, rows
- All the built-in cell types (text, number, boolean, bubble, image, uri, markdown, drilldown,
  marker, loading, protected, row-id, new-row, plus the extra ones in `packages/cells`)
- Replicate the fancy example grid + the 6 feature cards from https://grid.glideapps.com/ in the
  test-app (this is the acceptance bar for the demo, not just "some demo")
- Column sort + a menu that opens when clicking a column header (per the live example site)
- Row selection incl. select-all (confirmed: this is native grid behavior via `rowMarkers`/
  `rowSelect` props in the source, not something consumers build — see PORTING-NOTES.md research)
- Inline charts / sparklines
- Real-time / high-frequency updates (source does this via an imperative `damage`/`updateCells`
  API that bypasses React entirely — the Ember port's equivalent is `GridHostController.updateCells()`,
  already built in Phase 2)
- Theming — how consumers theme the grid (source has a `Theme` object + light/dark + per-row/col
  overrides; Ember port needs to expose an equivalent, not necessarily identical mechanism)
- User explicitly asked how Ember's `@tracked` reactivity maps to React's update model — answered
  and documented: the port uses a **dual-path model** matching the source. (a) `@tracked`/autotracked
  args changing triggers a full-viewport redraw (cheap because virtualized) — this is what
  `GridHostController.scheduleFullRedraw()` is for. (b) An explicit imperative `updateCells()` call
  (bypassing autotracking) does a damage-only partial redraw of just the named cells — this is what
  actually delivers high-frequency update performance, exactly as the source's `updateCells` ref
  method does. Do not try to make (b) happen automatically via `@tracked` on huge datasets; that's
  not how the original achieves its performance either.

## Standing execution instructions from the user

- **Don't ask permission between phases.** Once a phase is implemented, verified, and committed,
  automatically move to the next one and keep going until all phases are done or a genuine
  blocker/decision-only-the-user-can-make comes up.
- **Delegate implementation to subagents (background), Claude verifies and manages.** Claude scopes
  each subagent's task precisely, the subagent implements, Claude independently re-verifies
  (re-run `tsc`/build itself, spot-check risky adaptations against source — not just trust the
  subagent's self-report) before committing.
- **Commit after each phase**, once verified. One commit per numbered phase below (sub-splits like
  "2a"/"2b" are Claude's own internal reliability tactic, not separate user-facing phases — they
  land as one commit when the parent phase is done).
- **Never let a subagent re-derive already-known facts.** Every subagent prompt must point to
  `PORTING-NOTES.md` first and must be told to add new reusable learnings before finishing. This
  was a real, costly failure mode early in Phase 2 (a subagent burned ~4 hours re-deriving build
  config that was already known) — the notes file exists specifically to prevent recurrence.
- If a subagent run stalls or dies to infra issues (has happened twice on this project — both
  non-logic connection/stall failures), check what it actually produced before retrying (often
  partial/nothing was lost), and consider narrowing scope further rather than blindly retrying the
  same large prompt.

## Architecture decision (already made, don't re-litigate)

Framework-agnostic core + thin Ember shell — mirrors the source's own design (most of its
canvas-drawing code has zero React imports already; React is only the component shell + DOM
overlay editors). The rendering engine is ported near-verbatim as plain TS
(`glide-data-grid-ember/src/rendering/`). Ember's reactivity replaces React's prop-diffing
`useLayoutEffect` trigger for the "normal" redraw path; a separate, deliberately-imperative
`updateCells()` API (mirroring the source's `damage`/`updateCells` ref method) handles
high-frequency updates. See PORTING-NOTES.md for the full researched architecture (DOM structure,
canvas layout, scroll mechanism, DrawGridArg field defaults, etc.) — do not re-research any of it.

## Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Scaffold pnpm workspace (v2 addon + Vite test-app, TS/.gts) | **Done, committed** |
| 1 | Port framework-agnostic rendering engine | **Done, committed** |
| 2 | Ember canvas host layer | **Done, browser-verified, committed** |
| 3 | Interaction layer (selection, copy/paste, sort menu, DnD resize/reorder, hover anim) | **Done, browser-verified, committed** (3a selection+clicks, 3b keyboard nav, 3c copy/paste, 3d resize/reorder DnD) |
| 4 | Core cell types + overlay editors | **Done, browser-verified, committed** (4a text/number/boolean/loading/protected/row-id + overlay editor framework; 4b uri/markdown, `marked` dependency added; 4c bubble/drilldown, both confirmed display-only; 4d image cell + trailing blank row/"add row" affordance, including a real `activateCell` overlay-gating bugfix surfaced by image-cell) |
| 5 | Extra cell types incl. sparklines | **Done, browser-verified, committed** (5a sparkline/star/range/spinner + the `createCombinedCellRenderer` combinator; 5b tags/dropdown/multi-select/links; 5c date-picker/button/tree-view/user-profile/article, incl. a shared `pasteValueIntoCell` fix so paste dispatches to `CustomRenderer.onPaste` for all 13 extra cells — see PORTING-NOTES.md for full per-cell detail) |
| 6 | Theming system | **Done, browser-verified, committed** — `getDataEditorDarkTheme()`, `makeCSSStyle`/`--gdg-*` on the grid root + overlay containers, `@getRowThemeOverride` plumbed end to end, per-column/per-cell overrides verified, a real overlay-editor theme-merge bugfix, `glide-data-grid-ember/THEMING.md` + README section, and demo wiring (light/dark toggle + zebra rows + a themed column/cell). Also fixed a **major pre-existing perf defect found along the way**: three `DrawGridArg` fields were allocated fresh every draw, so `computeCanBlit`'s identity checks always failed and the scroll blit fast path had never engaged — see PORTING-NOTES.md's Phase 6 section, it applies to every future phase touching `DrawGridArg`. |
| 7 | Demo app matching glideapps.com + browser verification | **Done, browser-verified, committed** (7a column-sort decorator `src/data-source/withColumnSort`; 7b column group headers enabled; 7c the demo-grid replica + consumer-built sort menu; 7e five addon defects the demo surfaced — see below) |
| 8 | Async/streaming data + the data-source layer | **Done, browser-verified, committed** (8a `withColumnSort` write path + 8b `recordsSource`; 8c the streaming `updateCells()` demo; 8d the 1,000-row incremental proof + `object-scan` example; 8e `onVisibleRegionChanged` + `AsyncRecordsSource` + two real addon defects + the verification pass. **Those letters match `PORTING-NOTES.md`'s section headers** — go there for the implementation record) |
| 9 | Backlog — deferred features (**not auto-scheduled**; 15 grouped items 9a–9o, see detail below) | Not scheduled |

(This table mirrors the TaskCreate/TaskList task tracker used in-session — if that's unavailable
in a fresh session, this table is the source of truth; recreate the tracked tasks from it if
useful.)

## Phase scope detail

**Phase 0 — Scaffold.** pnpm workspace: `glide-data-grid-ember/` (v2 addon, TypeScript, `.gts`-
ready, Rollup build) + `test-app/` (Vite/Embroider Ember app, linked via `workspace:*`). Done —
see PORTING-NOTES.md for the dependency-version fixes that were needed.

**Phase 1 — Rendering engine port.** `packages/core/src/internal/data-grid/render/*.ts` and
supporting types/sprites/theme/animation-manager ported to `src/rendering/` as framework-agnostic
TS. Done — 7,160 lines, 28 files. Full export surface and adaptation notes in PORTING-NOTES.md.

**Phase 2 — Ember canvas host layer.** DOM structure (native-scroll padder trick for sticky header
+ real scrollbars), resize handling, DPI (handled inside ported `drawGrid`, no extra work needed),
the reactive-args-to-redraw wiring, imperative `updateCells`, public `<GlideDataGrid>` .gts
component. In progress — see PORTING-NOTES.md for full status/API.

**Phase 3 — Interaction layer.** Selection model (cell/row/col/range — check source's
`GridSelection`/`CompactSelection`, already partially ported in Phase 1's `data-grid-types.ts`),
mouse/keyboard handling, copy/paste (TSV clipboard format matching source's
`data-editor/copy-paste.ts`), row markers + select-all checkbox (native header-drawn checkbox +
tri-state indeterminate, per source — see PORTING-NOTES.md/prior research, this is NOT something
to leave to consumers), sort-by-column header click + menu (the live glideapps.com example has a
menu on column header click — replicate that interaction, source likely has `onHeaderMenuClick`/
similar, check `data-editor.tsx`), column resize/reorder drag-and-drop (`internal/data-grid-dnd/`),
generic hover-fade animation system (`needsHover` flag any cell renderer can opt into — the
`AnimationManager` plumbing for this already exists from Phase 2, this phase is about surfacing it
per-cell-type once real cell renderers exist in Phase 4).

**Phase 4 — Core cell types + overlay editors.** Port `packages/core/src/cells/*.tsx`: text,
number, boolean, bubble, image, uri, markdown, drilldown, marker, loading, protected, row-id,
new-row. Each has a `draw()` (port to framework-agnostic TS, same pattern as Phase 1) and often a
DOM overlay editor (React component in source — needs an Ember `.gts` equivalent, opened via
`internal/data-grid-overlay-editor/`'s pattern; markdown editor specifically uses ProseMirror in
source, check if a fresh Ember-compatible approach is warranted or if ProseMirror can be used
framework-agnostically as-is since it's not React-specific itself). This phase replaces
`src/rendering/-temp-text-cell-renderer.ts` (the Phase 2 smoke-test stub) with the real system.

**Phase 5 — Extra cell types + sparklines.** `packages/cells/` (separate source package): date-
picker, dropdown, star, tags, range, article, spinner, uri-list, and critically the sparkline/
inline-chart cell (this is the "📈 Inline charts (sparklines)" feature card from glideapps.com —
explicit requirement).

**Phase 6 — Theming.** `Theme`/`FullTheme` already ported in Phase 1 (`src/rendering/theme.ts`).
This phase is about the consumer-facing theming API/docs: how to override the default theme
(light/dark), per-column/per-row theme overrides (source supports these via
`column.themeOverride`/`getRowThemeOverride` — already plumbed through `DrawGridArg` in Phase 2),
and documenting the pattern clearly since the user explicitly asked "how do we theme it?".
**Done** — the consumer-facing answer to that question lives in `glide-data-grid-ember/THEMING.md`
(precedence chain, full `Theme` field reference, dark-theme example, per-column/row/cell examples,
the `--gdg-*` CSS custom properties, and the identity-stability rules). Implementation record,
including the overlay-editor theme bug and the `computeCanBlit` identity finding, is in
PORTING-NOTES.md's Phase 6 section.

**Phase 7 — Demo app + browser verification.** Replicate https://grid.glideapps.com/'s fancy
example grid in `test-app`. This is the main acceptance-test surface — use Chrome/Playwright to
actually verify: sticky header holds under scroll, horizontal+vertical scroll both work, copy/paste
works, sort menu opens on header click, row selection/select-all works, sparklines render, scroll
performance is smooth with a large dataset. Don't claim "done" on this phase without actually
driving it in a browser.

**SCOPE NARROWED BY THE USER (2026-08-07): the demo is the data grid and nothing else.** The
original requirement list (and this file's own "Original request" section above) called for the 6
feature cards — Scale to millions of rows / Blazingly fast scrolling / Fully free & open source /
Real-time updates / Inline charts / Asynchronous data — alongside the grid. The user explicitly
dropped them mid-phase ("i only need the datagrid in the demo, nothing else"): no feature cards, no
hero banner, no nav, no marketing chrome. **This is a deliberate decision, not an unfinished
requirement — do not "restore" the cards in a later phase.** The features those cards advertise are
still genuinely exercised, just by the grid itself rather than by marketing copy about it.

*The demo target, as observed directly in a browser on 2026-08-07 (don't re-derive):* four column
groups — `ID` (Email) / `Name` (First name, Last name) / `Info` (Photo, Opt-In, Title, More Info,
Performance sparkline) / `Employment Data` (Manager drilldown chip w/ avatar, Hired, Level) —
numbered row markers, a per-column header icon glyph, and `hasMenu` on every column. Clicking a
header selects the column and reveals a chevron; clicking the chevron opens a menu containing
**exactly two items, "Sort ascending" and "Sort descending"**, which really do re-sort the grid.
That two-item menu is the entire header-menu UI on the live site.

**Phase 8 — Async/streaming data + the data-source layer.** Port `packages/source`'s helpers (or
build an Ember-idiomatic equivalent) and build a demo exercising `GridHostController.updateCells()`
at high frequency, matching the source's "hundreds of thousands of updates per second" claim and its
`docs/04-streaming-data.stories.tsx`/`rapid-updates.stories.tsx` examples.

*Scope researched 2026-08-07 (prompted by a user question about feeding GQL query results into the
grid — do not re-derive):*

`packages/source/src/` is 5 files: `use-async-data-source.ts`, `use-column-sort.ts`,
`use-movable-columns.ts`, `use-collapsing-groups.ts`, `use-undo-redo.ts`. **`packages/core`'s
`DataEditor` has no records/rows-of-objects API at all** — it takes `columns`/`rows`/
`getCellContent`, exactly like this port's `<GlideDataGrid>`. So the port is not missing a
higher-level intake API relative to source; source puts it in this separate package.

**The architecturally important finding: these hooks are composable *decorators over
`getCellContent`*, not wrapper components.** `useAsyncDataSource` returns
`Pick<DataEditorProps, "getCellContent" | "onVisibleRegionChanged" | "onCellEdited" |
"getCellsForSelection">`; `useColumnSort` takes `{sort, rows, columns, getCellContent}` and returns
a wrapped `getCellContent`. They stack. **Port them as plain composable functions over plain
objects, NOT as a monolithic `<GridForRecords>`-style component** — column sort (needed by Phase 7)
is itself a `getCellContent` decorator, and a monolithic records component would have nowhere to
put it. Intended Ember shape:
```ts
@cached get gridArgs() {
    let a = recordsSource({ records: this.people, columns: this.columns });
    a = withColumnSort(a, this.sort);
    return a;   // spread onto <GlideDataGrid @columns= @getCellContent= ... />
}
```

**Row-accessor contract — match source exactly, and note what it deliberately does NOT do:**
```ts
type RowCallback<T> = (range: Range) => Promise<readonly T[]>;
type RowToCell<T> = (row: T, col: number) => GridCell;
type RowEditedCallback<T> = (cell: Item, newVal: EditableGridCell, rowData: T) => T | undefined;
```
`toCell` is a **plain accessor function generic over the row type** — there is no path-string
syntax (`"pets.name"`) and no object-traversal dependency anywhere in source. **Keep it that way:
do not add `object-scan`/`lodash.get`/`dot-prop` to this addon.** How a consumer digs a value out
of a nested GQL result is their concern; an accessor function covers every such library without the
addon depending on any of them. (The user's own apps use `object-scan` with
`useArraySelector: false` for this and it stays on their side of the boundary — the test-app may
demo that pattern, but the addon's `package.json` must not gain the dependency.)

**The consumer-facing contract this must satisfy is already written down**: `glide-data-grid-ember/
DATA.md` documents the single recommended pattern (per-row `@cached` view model + a getter that
reads them all, keyed on records-array identity) and states that it works unchanged at any size,
with `updateCells` reserved for data that genuinely cannot be held in memory. **`recordsSource` must
package exactly that pattern** — if the implementation diverges, DATA.md is the spec and needs
updating in the same change, not left stale.

### Phase 8 — WHAT LANDED (written at Phase 8 completion, 2026-08-08)

All four required test-app deliverables below were built, and every item in the "START HERE" block
that follows was carried out. Full implementation record in `PORTING-NOTES.md`'s Phase 8a/8b, 8c, 8d
and 8e sections; the consumer-facing result is in `DATA.md`. Summary:

- **`withColumnSort` now takes and returns `onCellsEdited`**, translating edit locations into
  original row space itself. `getOriginalIndex` remains as the escape hatch. The read/write
  coordinate asymmetry that silently corrupted data is gone, and `DATA.md`'s caveat section now
  documents the wired path instead of hand translation.
- **`recordsSource`** (`src/data-source/records-source.ts`) packages DATA.md's recommended pattern:
  one `createCache` per record, swept eagerly inside the caller's tracking frame, O(1)
  `getCellContent`, identity-stable results. **Measured in a browser at 1,000 rows: editing one field
  re-projects 1 row (7 `toCell` calls), not 1,000.** That closes the open question DATA.md's "Status
  of this recommendation" had been carrying since Phase 6.
- **`AsyncRecordsSource`** (a class, not a function — it owns page state) ports source's
  `use-async-data-source`, driven by the new **`onVisibleRegionChanged`** grid arg.
- **Two real addon defects fixed**, both invisible before this phase because both need
  `updateCells` to be driven continuously: `updateCells` ignored the row-marker column offset, and a
  **fractional grid height blanked the entire grid on every damage-only repaint** (canvas realloc +
  `alpha: false`). The second is a deliberate divergence from source, commented in place.
- The blit fast path was re-measured through `recordsSource` (3/3 scroll draws blit-eligible,
  `getCellContent` never differed) rather than assumed.

Phase 9 remains the deferred backlog and is still **not** auto-scheduled.

### Phase 8 — START HERE (written at Phase 7 completion, 2026-08-08; kept as the original brief)

What Phase 7 already built that Phase 8 must build **on top of**, not duplicate:

- **`glide-data-grid-ember/src/data-source/` already exists**, created by Phase 7a. It is the
  directory `recordsSource` belongs in. Its barrel is `data-source/index.ts`; consumers import
  `glide-data-grid-ember/data-source/index` (this project uses per-directory barrels — the root
  `src/index.ts` is an empty file and is *not* the convention). Rollup already publishes it; no
  build-config change is needed.
- **`withColumnSort` is the shape to match.** It takes a single **props object**
  `{ columns, rows, getCellContent, sort }` and returns `{ getCellContent, getOriginalIndex }`.
  **`recordsSource` must therefore return `columns` / `rows` / `getCellContent` under exactly those
  names**, so the two compose by spreading:
  ```ts
  @cached get gridArgs() {
      const src = recordsSource({ records: this.people, columns: this.columns });
      return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
  }
  ```
  Read PORTING-NOTES.md's Phase 7a section for the full API and — importantly — its
  identity-stability design, which `recordsSource` should mirror rather than reinvent.
- **Identity stability is a hard requirement, not a nicety.** `getCellContent` is one of
  `computeCanBlit`'s ~18 identity-compared fields; a `recordsSource` that returns a fresh closure
  per call silently disables the scroll blit fast path with no error and no visual difference.
  Phase 7 confirmed in-browser that the blit path *does* engage through `withColumnSort` (5/5 calls,
  zero differing fields, both axes) — don't be the phase that breaks it again. `withColumnSort`
  memoizes internally on a structural key precisely so a consumer getter allocating a fresh `sort`
  object doesn't thrash it; `recordsSource` faces the identical problem with its `records` array.
- Column grouping is live now (Phase 7b) and row markers/header icons actually render (Phase 7e), so
  a Phase 8 demo can use them freely.

**REQUIRED in Phase 8 — settle the decorator coordinate-space contract (agreed with the user
2026-08-08).** A decorator that remaps the *read* path must also remap the *write* path, or the two
end up in different coordinate spaces and every consumer has to bridge them by hand.

Today `withColumnSort` remaps rows for `getCellContent` but has no involvement in `onCellsEdited`,
whose `location` is in **displayed** row space while the caller's `getCellContent` sees **original**
row space. Applying an edit without translating through `getOriginalIndex` writes to the wrong
record — silently, and invisibly until the next re-sort. This is faithful to source (its
`useColumnSort` has the same shape) but it is a genuine data-corruption footgun, and it bit this
project for real: Phase 7c's demo shipped without the translation. Currently documented as a
caveat in `DATA.md` and on `ColumnSortResult.getOriginalIndex`; Phase 8 should make it structural:

```ts
export interface ColumnSortProps {
    columns; rows; getCellContent;
    onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void;  // NEW
    sort?: ColumnSort | readonly ColumnSort[];
}
export interface ColumnSortResult {
    getCellContent;
    onCellsEdited?: ...;   // NEW -- locations already translated to original row space
    getOriginalIndex;      // KEEP -- demoted from required step to escape hatch
}
```
so a consumer spreads both halves and cannot get it wrong. **`recordsSource` must adopt the same
contract**, and so must any later decorator that remaps rows or columns (source's
`use-movable-columns` / `use-collapsing-groups` both would) — settling it once here is much cheaper
than retrofitting it per decorator.

**Do NOT blanket-translate every callback.** `onSelectionChanged` reporting *displayed* rows is
correct — that is what is visually selected. This is specifically about the write path, where
displayed-space is a trap. Update `DATA.md`'s caveat section and
`ColumnSortResult.getOriginalIndex`'s doc comment when this lands, since both currently tell
consumers to translate by hand.

**One genuinely new piece vs source:** a *synchronous* `recordsSource` (an in-memory array of
records → `getCellContent`). Source only ships the async paged variant
(`pageSize`/`maxConcurrency`, `Promise`-per-range); its consumers hand-write `getCellContent` for
the simple bounded case. Building the sync one is worthwhile here because it is the natural place to
encode the two reactivity rules that are otherwise easy to get wrong (both now written up in
PORTING-NOTES.md's "Autotracking → canvas" section): the projection must be read **eagerly inside
the tracking frame**, and per-row projections should be memoized with a per-row `@cached` view model
whose array is rebuilt only on records-array identity change — so editing one field in a 1,000-row
table recomputes one row, not all of them, instead of the naive whole-table rescan. Keep
`getCellContent` an O(1) lookup regardless: it is called per painted cell inside the draw loop
(`render/data-grid-render.cells.ts:220`), so any real work there lands on the paint path.

**Required test-app deliverables for this phase** (not optional extras — the data-source layer is
unproven without them):
1. **An `object-scan` worked example**, demonstrating the intended consumer-side boundary: nested
   GQL-shaped records (an array of related entities per row, e.g. `person.pets.name`) flattened via
   `objectScan([path], { useArraySelector: false, rtn: "value" })` into a `toCell`/`value` accessor
   that the grid consumes. Add `object-scan` to **`test-app/package.json` only** — adding it to the
   addon is explicitly forbidden above. Hoist the compiled scanner per column (one `objectScan(...)`
   call per column, reused across rows) rather than rebuilding it per cell; that is the single
   biggest cost in the naive form. This example is what makes the "accessor function, not path
   string" contract concrete for anyone reading the addon cold.
2. **Rewire `tracking-demo.gts` onto `recordsSource`** once it exists, so the per-row `@cached`
   memoization lives in the addon layer rather than in a comment. That file currently carries a long
   "SCALING: don't copy this projection verbatim" note describing the per-row `@cached` pattern it
   deliberately does not implement — that note should shrink to a pointer once the real thing exists.
3. **The test-app must actually run DATA.md's recommended pattern, and prove it is incremental.**
   This is the point of items 1–2, stated as its own requirement so it can't be quietly skipped.
   DATA.md tells every consumer to write the per-row `@cached` view model, but **as of Phase 6 that
   half has only been reasoned about, never executed** — the Phase 6 tracking demo browser-proved
   the eager-read half (a tracked mutation repaints the canvas) and explicitly did *not* implement
   per-row memoization, because at 8 rows it would have obscured the proof. Phase 8 must close that
   gap: build a table large enough for the difference to be real (~1,000 rows), instrument the
   per-row projection with a recompute counter, and demonstrate in a browser that editing one field
   recomputes **one** row rather than all of them. Until that has been run, DATA.md's central
   recommendation is an untested claim in the addon's own consumer documentation, which is worse
   than no recommendation. Record the measured result in PORTING-NOTES.md.
4. **A high-frequency `updateCells()` demo** (the original Phase 8 requirement above), which is also
   what proves the O(1)-`getCellContent` contract holds under load.

## Phase 9 — Backlog (deferred features, NOT part of the auto-continue sequence)

Unlike Phases 0–8, this is **not** something to pick up automatically when the prior phase
finishes — it exists so the real, accumulated list of "known gaps vs source" lives in one auditable
place instead of being scattered across code comments and `PORTING-NOTES.md`, where it's easy to
silently lose track of. **Work on any of these only when explicitly asked.**

It is also **not a to-do list to be worked top to bottom.** Items are independent; pick the ones a
real need justifies. Several will never be worth doing for this port.

**Provenance.** First assembled 2026-08-07 by auditing `PORTING-NOTES.md` (user asked "is there a lot
still not ported?" — this list is the honest answer, not a reassurance). **Re-audited 2026-08-08
directly against the source tree** rather than against the notes — that pass added groups 9a–9g
below, *none* of which had ever been written down anywhere in this project. The earlier list was
accurate about what prior phases had *chosen* to defer; it was blind to whole source subsystems no
phase had ever had a reason to mention. Treat that as the standing lesson for any future audit:
auditing your own notes only finds what you already knew you skipped.

**Size tags**: `S` ≈ half a day or less; `M` ≈ 1–2 focused sessions; `L` ≈ multi-session, worth a
dedicated sub-phase and subagent. **Priority tags** are relative to "this addon gets used in a real
production Ember app", not to source parity for its own sake.

**What the 2026-08-08 comparison actually covered — and what it did not.** Both repos are indexed in
the `codebase-memory` knowledge graph (`Users-jxhui-Developer-glide-data-grid` and
`...-glide-data-grid-ember`), which is the fastest way to redo or extend any of this. What was
compared:

- **Module inventory** — all 107 non-story/non-doc source modules across `packages/core`,
  `packages/cells` and `packages/source`, against the port's 69. 51 have no same-named port module;
  each was then classified by hand as *absorbed* (the port deliberately collapses source's React
  components into `grid-host-controller.ts` — `data-editor`, `data-grid`, `scrolling-data-grid`,
  `infinite-scroller`, `data-grid-dnd`, `resize-detector`, `click-outside-container`,
  `visible-region`, all the `*-overlay-editor*` files, `styles`→`theme.ts`,
  `use-animation-queue`→`animation-queue.ts`, `use-selection-behavior`→`selection-behavior.ts`,
  `cells/draw-fns`→`data-grid-lib.ts`) or *genuinely absent* (everything itemised in this backlog).
- **Prop surface** — source's 82 `DataEditor` props vs `<GlideDataGrid>`'s 26, one by one.
- **Imperative surface** — source's 9 `DataEditorRef` methods vs the port's 1.
- **Hardcoded `DrawGridArg` fields** — which supported render features the controller pins shut.

What was **not** compared, and would need its own pass:

- **Per-cell-type behavioural fidelity.** Nobody diffed the 26 ported cell renderers' `draw()`
  implementations against source's line by line. Phase 4/5 ported them faithfully cell by cell and
  browser-verified each, and 9m records the known deliberate editor simplifications — but "the
  renderer exists and looked right in a demo" is a weaker claim than "it matches source's output".
- **The Phase 1 rendering engine vs its source.** 7,160 lines ported near-verbatim in Phase 1 and
  untouched-by-diff since. Phases 7e/8e each found real defects in it, which is evidence the
  near-verbatim claim is *mostly* true and not entirely.
- **Source's own test suite.** Not examined at all — and it is the obvious seed corpus for 9a.
- **Version drift.** The port targets the source tree as checked out on this machine
  (`0875d78`). No check of whether upstream has moved since.

**Already closed by earlier phases** (restated so this list reads as a complete picture, not because
they're forgotten): column sort (7a/7c, `withColumnSort` + the demo's header menu — multi-column and
`raw`/`smart`/custom comparators all supported), column grouping (7b), theming (6), the demo replica
(7c), the whole `src/data-source/` layer incl. async/paged data (8). What sort still lacks is only
persistence wiring and comparator-friendly date values — both consumer concerns, and true of the
live site too.

---

### 9a — Automated tests **(NEW — 2026-08-08 audit) — `L`, highest priority** — **STARTED 2026-08-08**

> **Progress.** The vitest harness exists and **416 tests** pass across 11 files:
> `copy-paste` (12, hand-written exemplar), `compact-selection` (78), `common/math` (64),
> `cell-set` (44), `common/support` (38), `theme` (27), `common/utils` (40) — those six by
> `model: "haiku"` subagents, all re-verified by the orchestrator — plus
> **`render/data-grid-render.blit.test.ts` (32), written by the orchestrator**, which pins the
> identity-stability contract (see below). One agent file (`color-parser.test.ts`) was **deleted**:
> it tested a reimplementation of the formulas rather than the module, and never imported it.
> ~~`color-parser.ts` needs a DOM and remains untested.~~ **Resolved 2026-08-08 by the OKLCH fix**:
> the module was restructured so the colour maths and the CSS component-syntax parsing are pure
> exported functions, which is what a `jsdom` dependency would otherwise have been bought to work
> around. `color-parser.test.ts` (69) now exists and imports the real module; the DOM-touching
> wrappers (`parseToRgba`, `blend`, `withAlpha`, `interpolateColors`, `getLuminance`) still belong
> to 9a item 4. Suite total: **524**.
>
> Round 4 added, orchestrator-written: **`data-source/column-sort.test.ts` (22)** and
> **`selection-behavior.test.ts` (27)**. The column-sort suite makes Phase 8's throwaway Node scripts
> permanent — including the round-trip property *"editing displayed row R targets the record shown at
> displayed row R"* — which closes the unit-testable half of 9o's first evidence gap. **The remaining
> half is still open**: nobody has typed into a sorted cell in a browser and watched where it landed.
>
> **The `computeCanBlit` regression tests are the highest-value part of this so far.** They assert,
> field by field, that changing a compared field's identity defeats the blit — the defect class that
> went undetected from Phase 2 to Phase 6 with no visible symptom. They also pin the >100-column
> bail-out, so backlog item 9k can't be changed by accident.
> Read PORTING-NOTES.md's "Phase 9a, round 2" section before delegating more of this — it has the
> prompt lessons, including the one that caused that failure. Scripts: `pnpm test`, `pnpm test:watch`, `pnpm lint:types:test`. Four config
> touchpoints must stay in sync (vitest include, rollup `publicEntrypoints` exclude, `tsconfig.json`
> exclude, `tsconfig.test.json`) — all four, and the two build failures that forced them, are written
> up in `PORTING-NOTES.md`'s "Phase 9a (started)" section, along with what did and didn't work about
> delegating to Haiku.
>
> Already found one real bug: **`CompactSelection.remove` silently drops ranges** when a wide removal
> spans several slices (it splices an array while iterating it). The port is byte-identical to
> source, so it is an upstream bug — pinned by a test, deliberately not "fixed".
>
> **Next, in order:** `selection-behavior.ts`, `data-source/column-sort.ts` (fold in Phase 8's
> throwaway Node scripts rather than re-running them by hand — see 9o), `render/data-grid-lib.ts`'s
> coordinate math, then the identity-stability regressions below.

**There were no automated tests in this repo at all** when this item was written. `test-app/tests/unit/` and
`test-app/tests/integration/` are empty directories; `test-app`'s `test:ember` script exists and
would run, but has nothing to run. The addon's own `test` script is the v2-addon placeholder
(`echo 'A v2 addon does not have tests, run tests in test-app'`). Every phase to date was verified by
`tsc` + `pnpm build` + `vite build` + a manual browser pass by the orchestrator, plus (Phase 8 only)
some throwaway Node scripts run against the built `dist/`.

That was a defensible trade while the port was greenfield and every phase was browser-verified by a
human-in-the-loop. It is the single largest gap between this port and "prod-quality", and it gets
more expensive every phase: **there is currently no way to know that Phase N didn't break Phase N-3
except by re-driving the browser by hand.** Phases 7e and 8e each found latent defects in code that
had been "verified" phases earlier, which is exactly the failure mode a regression suite exists to
catch.

Suggested shape, in the order the value lands:
1. **Pure-function unit tests** — the cheapest and highest-coverage-per-effort by far, because most
   of the port is deliberately framework-agnostic plain TS. `selection-behavior.ts`,
   `copy-paste.ts` (`getCopyBufferContents`/`decodeHTML`/`unquote` — a parser with real edge cases),
   `data-source/column-sort.ts` (incl. the read/write coordinate translation — Phase 8's Node scripts
   already prove this, they just aren't a suite), `data-source/records-source.ts` (identity stability
   + the "editing one field re-projects one row" invariant, currently proven only by a browser
   measurement that nothing re-runs), `render/data-grid-lib.ts`'s coordinate math.
2. **Identity-stability regression tests** — assert that the `DrawGridArg` fields `computeCanBlit`
   identity-compares are actually stable across draws. This is the one class of defect this project
   has proven it cannot catch by looking (see the Phase 6 finding: undetected from Phase 2 to Phase
   6, zero visible symptom). A test that fails loudly is worth more here than anywhere else.
3. **Rendering-integration tests** — drive `drawGrid` against a real or mocked 2D context and assert
   on the call sequence, or hash the canvas (Phase 8c already established the per-device-pixel-column
   hashing technique — see `PORTING-NOTES.md` Phase 8c). Damage-path row correctness (listed in 9o
   below as an evidence gap) is naturally a test, not a manual check.
4. **Ember rendering tests** for `<GlideDataGrid>` — mount/destroy, arg changes triggering redraws,
   the `registerDestructor` teardown path (which has a real subtlety documented in Phase 2b), and
   `onReady`'s API object.

Note the constraint that shapes this: the grid is a canvas, so DOM-assertion testing buys almost
nothing above the component boundary. Push assertions down into the plain-TS layer, which is most of
the code and was designed to be testable this way.

### 9b — Accessibility **(NEW — 2026-08-08 audit) — `M`** — **DEFERRED by the user, 2026-08-08**

> Deferred deliberately. Keep the write-up below intact: this is the item most likely to become
> urgent later (a single consumer with an accessibility requirement flips it from "nice" to
> "blocking"), and it cannot be added from outside the addon.

**Not ported at all, and never mentioned in any phase.** Source renders a parallel, debounced DOM
accessibility tree alongside the canvas — a real `<table role="grid">` mirroring only the visible
region, with `aria-rowcount`/`aria-colcount`/`aria-multiselectable` on the table, `aria-rowindex`/
`aria-colindex`/`aria-selected`/`aria-readonly` per cell, and focusable elements the screen reader
and keyboard focus actually land on. Source: `packages/core/src/internal/data-grid/data-grid.tsx`
`accessibilityTree` (~lines 1737–1866, rendered at 1941), sized by an `accessibilityHeight` prop.

This port's grid root is a bare `tabIndex=0` div wrapping canvases, with no ARIA whatsoever and no
DOM representation of any cell. To a screen reader it is an empty focusable box. `DataEditorRef.focus`
in source explicitly focuses "itself **or the correct accessibility element**" — the two systems are
coupled, so 9f's `focus()` should land with or after this.

This is a genuine blocker for any consumer with an accessibility requirement, and it's structural —
not something a consumer can add from outside the addon.

### 9c — Touch / mobile input **(NEW — 2026-08-08 audit) — `M`** — **DEFERRED by the user, 2026-08-08**

> Deferred: touch support is not needed for the intended consumers. Also folded in here (found by
> the same audit): source's `internal/scrolling-data-grid/use-kinetic-scroll.ts` (78 lines), which
> handles iOS momentum-scroll settling — touch-only, so it lives and dies with this item.

No touch or pointer event handling exists. `DrawGridArg.touchMode` is hardcoded `false`
(`grid-host-controller.ts:1233`); source drives it from a real `lastWasTouch` flag
(`data-grid.tsx:843`) and it feeds rendering decisions. There are no `touchstart`/`touchmove`/
`pointerdown` listeners anywhere in the port — every interaction is `mousedown`/`mousemove`/
`mouseup`/`keydown`. Native scrolling works on touch (it's a real scroller div, so that comes free),
but selection, drag-extend, column resize/reorder, and cell activation do not.

Related unported props: `isOutsideClick?: (e: MouseEvent | TouchEvent)`, and the `pointerType`
field already present on this port's `event-args.ts` but never populated.

### 9d — Context menus (right-click) **(NEW — 2026-08-08 audit) — `S`**

No `contextmenu` listener exists anywhere in the port. Source exposes three props —
`onCellContextMenu`, `onHeaderContextMenu`, `onGroupHeaderContextMenu` — each handing the consumer
the hit-tested target plus the event, exactly like `onHeaderMenuClick` already does here. The hit
tests these need are **already built and in use** (`resolveMouseHit`, `hitTestHeaderMenu`), so this is
plumbing a fourth listener through machinery that exists: genuinely small, and the most commonly
requested grid feature not currently present.

### 9e — Search **(NEW — 2026-08-08 audit) — `L` — PRIORITISED by the user 2026-08-08**

> **This is now a priority item, not backlog.** Sequencing note: it depends on
> `getCellsForSelection` (9g) — search cannot read cells outside the rendered window without it — so
> that small item must land first. Suggested order: `getCellsForSelection` → the incremental
> scanner → the result-highlight plumbing (which can reuse the `@highlightRegions` arg landed
> 2026-08-08) → the overlay UI.

`packages/core/src/internal/data-grid-search/` (`data-grid-search.tsx` 577 lines +
`data-grid-search-style.tsx` 96) is not ported, and neither are its props (`showSearch`,
`onSearchClose`, `searchResults`, `searchValue`, `onSearchValueChange`). It's a real subsystem: an
overlay input, incremental scanning across the dataset in chunks so it doesn't block, result
highlighting fed back into the render layer, and next/prev navigation with scroll-into-view.

~~**Depends on `getCellsForSelection`**~~ — **that dependency is satisfied**: `getCellsForSelection`
landed 2026-08-08 (see 9g). Search is unblocked.

**DECISION SETTLED (user, 2026-08-08): ship a separate, opt-in `<GlideSearchBar>` component** — the
recommendation below, now agreed. Consumers get something working out of the box but can ignore it and
drive the engine directly. Note what changed the calculus: 9q's second half landed, so a shipped bar is
restylable CSS rather than another inline-styled component that would need migrating later. Style it in
its own stylesheet following the established conventions (`.gdg-root`-scoped selectors, `var(--gdg-*)`
for every theme value, reuse `.gdg-editor-input`/`.gdg-editor-button` where they fit). The original
framing of the decision is kept below for context.

**~~OPEN DECISION~~ — settle this before writing code.** Does the addon ship the search *UI*, or only the
engine? Source ships the whole overlay (input, three SVG buttons, result count, progress bar). This
project's menu precedent points the other way — but that precedent is **not** a house rule, it is
simply what source does for menus: source ships no menu UI at all, only the `onHeaderMenuClick`
event. So the two cases genuinely differ and there is no established convention to follow.
Considerations: source's UI is `@linaria/react`, which this port doesn't use, so **the UI cannot be
ported faithfully either way** — only the engine can. Against that, the 2026-08-08 stylesheet work
means an addon-shipped bar *is* now restylable by the consumer (DaisyUI/Tailwind), which removes the
main objection to shipping one. **Claude's recommendation at the time: ship a separate opt-in
`<GlideSearchBar>` component** so consumers get something working out of the box but can drive the
engine directly instead. Not agreed with the user yet.

### 9f — The imperative API surface **(NEW — 2026-08-08 audit) — `M`**

`<GlideDataGrid>`'s `@onReady` hands the consumer a `GlideDataGridApi` with exactly **one** method:
`updateCells`. Source's `DataEditorRef` has nine:

| Source ref method | Ported? | Notes |
|---|---|---|
| `updateCells` | **yes** | the one that exists; damage-based repaint |
| `scrollTo` | no | `GridHostController` has a *private* `scrollCellIntoView` (Phase 3b) that is most of it — deliberately simplified (no easing, no `hAlign`/`vAlign`). Promoting + extending it is the cheapest item here. |
| `focus` | no | trivial today (`root.focus()`); becomes meaningful once 9b exists |
| `getBounds` | no | `computeBounds` already exists internally and is used by hit-testing |
| `appendRow` | no | `onRowAppended` (Phase 4d) is the callback half; the programmatic trigger isn't exposed |
| `appendColumn` | no | `onColumnAppended` isn't ported at all either (9g) |
| `remeasureColumns` | no | meaningless until 9i's real auto-sizing exists |
| `emit` | no | synthesises user interactions; mainly a testing affordance — pairs with 9a |
| `getMouseArgsForPosition` | no | exposes the existing internal hit test |

Most of these are exposing internals that already work, not new behaviour. The design question worth
settling once, before adding a second method: `onReady`-hands-you-an-object is fine for one method
but gets awkward at nine — decide whether the API object stays, or whether this becomes a documented
controller/service the consumer holds.

### 9g — `DataEditor` props with no equivalent here **(NEW — 2026-08-08 audit) — mostly `S` each**

Source's `DataEditor` exposes 82 props; `<GlideDataGrid>` exposes 26. Most of the difference is
genuinely deliberate (React-specific, or belongs to a feature listed elsewhere in this backlog), but
these are simple passthroughs of behaviour the render/interaction layer **already supports**, held up
only by nobody having needed them. Each is small on its own — the value is in the list existing.

*Data / editing:*
- ~~`getCellsForSelection`~~ — **DONE 2026-08-08.** `@getCellsForSelection` accepts `true` (the grid
  synthesises one from `getCellContent`) or a function returning a `CellArray` or a
  `GetCellsThunk`. Wired into the copy path; the pure synthesis half lives in
  `src/rendering/cells-for-selection.ts` with 9 tests. **Deliberate divergence**: the async thunk
  form is *not* used for copy, because `clipboardData.setData` stops working once a `copy` handler
  has awaited — source awaits it anyway, which reads as a latent upstream bug. Source's *mangled*
  (row-marker-offset) variant was deliberately not ported: it exists solely for search, and would be
  dead code until 9e lands. **9e is now unblocked.**
- `validateCell` — reject/normalise an edit before it commits. The *type* is ported
  (`data-grid-types.ts`) but nothing calls it.
- `coercePasteValue` — consumer override for paste coercion. The port hardcodes its coercion in
  `pasteValueIntoCell` (referenced in a comment there, never wired).
- `copyHeaders` — include column headers in the copy buffer.
- `onDelete` — intercept/override delete-key clearing (the port clears unconditionally).
- `onFinishedEditing`, `onCellClicked`, `onCellActivated`, `onHeaderClicked`, `onGroupHeaderClicked`,
  `onGroupHeaderRenamed`, `onColumnAppended` — notification callbacks the controller already has the
  internal events for.

*Presentation:*
- `trailingRowOptions` (`tint`/`hint`/`sticky`/`addIcon`/`targetColumn`) — Phase 4d built the
  trailing blank row but exposes only the boolean `showTrailingBlankRow`.
- `rowMarkerStartIndex`, `rowMarkerTheme` — 1-based/offset row numbering, and theming the marker
  column separately.
- ~~`highlightRegions`, `drawCell`, `drawHeader`, `prelightCells`~~ — **DONE 2026-08-08,
  browser-verified.** All four were live `DrawGridArg` fields hardcoded to `undefined`; they are now
  `GridHostArgs` + `<GlideDataGrid>` args (`@drawCell` / `@drawHeader` / `@prelightCells` /
  `@highlightRegions`), a pure passthrough with no new rendering code. `prelightCells` and
  `highlightRegions` are two of `computeCanBlit`'s identity-compared fields, so both carry a
  stability warning in their doc comments. Exercised by a "Show draw hooks" toggle in
  `test-app`'s `<DemoGrid>`. See `PORTING-NOTES.md`'s Phase 9 section.
- `freezeTrailingRows` — **looks like the same one-line passthrough and is NOT.** It is hardcoded to
  `0` in `runDraw` *and* at **seven hit-test/layout call sites** (`computeBounds` ×5,
  `getRowIndexForY` ×2, plus scroll-content sizing). This is precisely the trap Phase 2a documented
  for `groupHeaderHeight`: the render engine takes the flag, but the controller's own coordinate math
  must account for the pinned rows too, or hit-testing silently disagrees with what's drawn. Treat as
  `M`, not `S`, and re-read the Phase 2a note before starting.
- `scrollOffsetX`/`scrollOffsetY` — initial scroll position (source: `use-initial-scroll-offset.ts`).
- `scaleToRem` — rescale the whole grid to the root font size (source: `use-rem-adjuster.ts`,
  56 lines). Matters for consumers with user-controlled zoom.
- `width`/`height`/`className` — the port sizes purely from its container.

*Selection tuning (writer functions are already fully parameterized over all of these — this is
`resolveArgs()` plumbing only, no logic changes, explicitly noted as such back in Phase 3a):*
- `rangeSelectionBlending`, `columnSelectionBlending`, `rowSelectionBlending` (hardcoded
  `"exclusive"`), `rowSelectionMode`, `columnSelectionMode` (hardcoded `"auto"`).

*Editing behaviour:* `editOnType` (hardcoded on), `cellActivationBehavior`, `trapFocus`,
`editorBloom`, `scrollToActiveCell`, `drawFocusRing`, `imageEditorOverride`, `markdownDivCreateNode`,
`portalElementRef`.

### 9h — Interaction gaps

- **Row reordering** (dragging rows via the row-marker column) — column resize/reorder landed in
  Phase 3d, row reorder did not; `onRowMoved` isn't ported at all. `M`.
- **Autoscroll while dragging past the viewport edge** — source: `use-autoscroll.ts` (41 lines).
  Applies to drag-extend, row reorder and fill-handle drag alike, so it's worth doing once as shared
  infrastructure rather than three times. Currently a drag simply stops at the edge. `S`.
- **Fill-handle drag-to-fill** — `DEFAULT_FILL_HANDLE` exists as ported static data and the handle
  can draw, but the drag-to-replicate interaction was never built. Also unported: `onFillPattern`,
  `allowedFillDirections`. `M`.
- **Controlled-selection mode** — `GridHostController` always owns `selection` internally; there's no
  `GridHostArgs.selection` for a consumer to pass in/manage externally (source's
  `gridSelection`/`onGridSelectionChange` pair). Phase 3a already sketched the implementation: an
  optional arg that makes `applySelection` skip mutating `this.selection` and rely on the caller
  re-supplying it via `getArgs()`. Also unported: `onSelectionCleared`, `previousSelection`. `M`.
- **Span/merged-cell selection growth** (`expandSelection`, `spanRangeBehavior`) — not ported; no
  cell type uses `GridCell.span` yet, so there's nothing to exercise it against. The `expand` flag is
  already carried through `SetCurrentResult` unused, waiting for this. `L` (touches selection,
  keyboard nav, rendering and copy).
- **`onSelect` renderer hook** — cell renderers can't intercept/suppress a click's selection
  (`onClick` is wired, `onSelect` is not). `S`.
- **Keybinding remapping** — only hardcoded default keybindings work; source's remappable
  string-based `ConfigurableKeybinds` DSL isn't ported (`common/is-hotkey.ts` 86 lines +
  `data-editor-keybindings.ts` 198). `M`.
- **Assorted nav variants** — Tab/Shift+Tab aliasing, alt+Arrow "free move", primary+shift
  jump-to-edge selection, row/column space-bar select shortcuts. Each `S`, all in one place
  (`onKeyDown`).
- **`links-cell`'s editor re-reads the original link list** *(NEW — found 2026-08-08 during the 9q
  CSS migration, deliberately not fixed there since it is orthogonal to styling)*. `currentLinks()`
  reads `p.value.data.links`, but `p.value` is the *original* cell object: `openOverlay` builds the
  editor-props literal once and `onChange` only ever writes `state.currentCell`. So the
  `setLinks()` → `onChange()` → `render()` cycle re-reads the pre-edit list — adding a link makes the
  new row appear and then vanish on the next add/delete, and a second add discards the first.
  Per-keystroke title/URL edits are unaffected (they never call `render()`). The fix is for the editor
  to hold its own working copy, as the other stateful editors do. Worth checking whether any *other*
  `provideEditor` re-reads `p.value` after an `onChange` — this may not be the only one. `S`.
- **Overlay editors can be clipped at the viewport edge** *(NEW — 2026-08-08 audit; this one is a
  latent user-visible defect, not just a missing feature)*. Source has
  `internal/data-grid-overlay-editor/use-stay-on-screen.ts` (61 lines): an `IntersectionObserver` that
  detects when an open editor overflows the window and nudges it back horizontally. There is **no
  `IntersectionObserver` anywhere in this addon**, so an editor opened on a cell near the right edge
  of the window is simply cut off. Nobody has hit it because every demo opens editors mid-grid — the
  same "dormant until a demo switches it on" pattern that produced the Phase 7e batch. `S`.

### 9i — Rendering / layout gaps

- **Real column auto-sizing** — auto-width columns get a fixed fallback width
  (`DEFAULT_AUTO_COLUMN_WIDTH`, 150px), not source's text-measurement-based sizing. Source:
  `use-column-sizer.ts` (253 lines), plus the `minColumnWidth`/`maxColumnWidth`/`maxColumnAutoWidth`
  props and the `remeasureColumns` ref method (9f). The measurement itself can reuse
  `canvas-hypertxt`, already a dependency. `M`.
- **Row grouping** — not ported (column grouping was, in Phase 7b). Source:
  `data-editor/row-grouping.ts` (326 lines) + `row-grouping-api.ts` (72) + the `rowGrouping` prop,
  and it pairs with `use-collapsing-groups` in 9j. Substantial: it changes row-space mapping
  globally, which means it interacts with every decorator's coordinate contract (see the settled rule
  in Phase 8's brief above). `L`.
- **`maxScaleFactor` is a flat `5`** — source varies it 1–5 by browser and active-touch-scroll as a
  perf micro-opt. Deliberate Phase 2 simplification, noted here only for completeness. `S`.

### 9j — Remaining `packages/source` hooks

Phase 8 ported the layer and two of the five hooks (`use-column-sort` → `withColumnSort`,
`use-async-data-source` → `AsyncRecordsSource`) and added one thing source doesn't have
(`recordsSource`). The other three:

- **`use-movable-columns`** (82 lines) — a decorator remapping column order. Small, and the natural
  companion to Phase 3d's `onColumnMoved` (which currently only *reports* the move — the consumer
  has to implement reordering themselves). `S`.
- **`use-collapsing-groups`** (136 lines) — collapse/expand column groups. Pairs with 9i's row
  grouping conceptually but is independent of it. `S`.
- **`use-undo-redo`** (242 lines) — undo/redo over edits. `M`.

**All three remap rows or columns, so all three must adopt the decorator coordinate-space contract
settled in Phase 8** (a decorator that remaps the read path must also remap the write path; see the
Phase 8 brief above and `PORTING-NOTES.md`'s Phase 8a/8b section). That contract was settled
*specifically* so these three wouldn't each re-derive it — don't hand-translate, and don't blanket-
translate every callback either (`onSelectionChanged` reporting displayed rows is correct).

### 9k — Performance backlog

- **`mappedColumns` identity churn** — `computeMangledLayout` rebuilds the mapped-column array on
  every draw, so `computeCanBlit` falls into its `deepEqual`-per-column branch each frame, and bails
  out of the blit fast path entirely once a grid has **more than 100 columns**. Phase 6 fixed the
  three other identity-instability sources; this one was left because it's row-marker/trailing-row
  mangling infrastructure, not theming. Fix: memoize `computeMangledLayout` on
  `columns`/`freezeColumns`/marker-state identity. `S`, and the only *known* remaining perf cliff.
- **Replace the hand-rolled memo caches with `memoize-one`** — Phase 6 added three hand-written
  identity caches in `grid-host-controller.ts` (`mergedThemeCache`, `mangledCellContentCache`, the
  module-scope `ALWAYS_VERTICAL_BORDER` constant) to restore reference stability for
  `computeCanBlit`. The substantive argument isn't tidiness: passing cache inputs as real
  *parameters* means the returned closure captures the parameters rather than a captured `args`
  object, making "cache key drifts from what the closure captures" structurally inexpressible rather
  than merely absent today — a class of bug that had to be hand-audited during Phase 6 verification.
  Deferred because it churns freshly-verified code and adds a runtime dependency to a v2 addon.
  **Ember-native options were evaluated and rejected** — `@cached` is getter-only (can't take
  parameters, so `themeForCell` is impossible), and both `@cached` and the lower-level
  `createCache`/`getValue` primitive invalidate on *tracked* consumption, while `GridHostController`
  deliberately holds untracked state; a cache consuming no tracked state is frozen permanently
  (`isConst` exists precisely to detect this), turning a perf optimization into a stale-data
  correctness bug. (Note the contrast with `recordsSource`, where `createCache` *is* the right tool —
  it consumes genuinely tracked consumer state. See `PORTING-NOTES.md` Phase 8a/8b.) `@cached` on a
  **component getter** in `glide-data-grid.gts` remains the right tool for any future *derived* arg
  (e.g. a combined cell renderer built from an `@extraCells` arg) — computing such a value inline in
  `buildGridHostArgs()` would reintroduce identity churn from the consumer side. `M`.

### 9l — Extensibility / public custom-cell API

- ~~**No `@extraCells` arg.**~~ — **DONE 2026-08-08, browser-verified.** Consumers wanting the 13
  extra cell types no longer import `createCombinedCellRenderer` and hand-build a `getCellRenderer`
  (as every demo used to). `@extraCells` takes the array; `<GlideDataGrid>` combines it with the
  built-in registry in a **`@cached` getter** — the shape predicted in 9k, and load-bearing:
  `getCellRenderer` is identity-compared by `computeCanBlit`, so combining inline in
  `buildGridHostArgs()` (which runs per draw/scroll/hover) would have silently killed the blit path.
  `@getCellRenderer` still works and takes precedence as the full manual override. `<GlideDemo>` and
  `<DemoGrid>` are both rewired onto it.

- **A public "bring your own cell type" story is still missing**, even with `@extraCells` landed.
  The arg accepts `CustomRenderer<any>[]`, but nothing documents how to *write* one — the
  `CustomRenderer` contract, `isMatch`, `draw`, `provideEditor`, `onPaste`. That doc is the actual
  gate on third-party cell types, and it is the same audience the `renderComponent` question below
  serves. `S` for the doc; see 9n.
- **`renderComponent`-based cell editors** — editors are hand-built DOM factories
  (`CellEditorProps` → `{element, focus(), destroy()}`), not real `.gts` components, because
  `GridHostController` has zero Ember context (no `owner`) by design. `@ember/renderer`'s
  `renderComponent(Component, {into, owner, args})` (confirmed present in this project's pinned
  `ember-source@6.12.0`, synchronous, returns `{destroy()}`) would let per-cell editors be genuine
  templated components. **Worth revisiting specifically if/when this addon exposes a public "bring
  your own cell type" API**, where forcing consumers to hand-write DOM would be a real DX regression
  vs source's `provideEditor: () => <Component />`. Not worth the `owner`-threading migration for the
  cells already built on the current contract. `L`.

### 9m — Cell-editor fidelity divergences (deliberate, listed so they aren't mistaken for bugs)

Each of these ports the **draw** path faithfully and simplifies only the **editor**, following the
precedent set in Phase 4b and ratified in the Phase 5 research section. None is a defect; each is a
place a consumer might reasonably want more, and each is independently upgradeable.

- `markdown-cell` — plain textarea + `marked`, not source's ProseMirror editor.
- `article-cell` — plain `GrowingEntry` textarea, not `@toast-ui/editor` WYSIWYG.
- `dropdown-cell` / `multi-select-cell` — native `<select>` / checkbox DOM, not `react-select`
  (so: no search-as-you-type, and `multi-select`'s free-entry "create new option" path is
  unreachable through the UI).
- Styling throughout uses inline style objects rather than source's `@linaria/react` CSS-in-JS —
  intentional and not worth revisiting.

### 9p — Playwright: repeatable browser tests **(NEW — added at user request 2026-08-08)**

> **Priority: to be set by the user after 9e (search) and the DaisyUI theming work land.**

Every browser check in this project so far has been driven by hand through the Chrome MCP tool —
ephemeral, unrepeatable, and leaving nothing behind. Playwright makes that class of verification
committable. Note this is a *different layer* from 9a's vitest suite (pure functions, bare Node) and
from the untouched `test-app` QUnit harness (component mount/teardown); all three coexist.

**Two techniques, and the choice between them matters:**

- **Canvas pixel probing** via `page.evaluate()` + `getImageData()` — for anything with a definite
  right answer: damage-path column correctness, blit engagement, "is the sparkline drawn", theme
  colour applied. Deterministic, no image baselines, and the failure message names the actual
  discrepancy. Phase 8c already invented this technique (hashing the canvas per device-pixel column)
  and then discarded it; this is where it should live permanently.
- **`toHaveScreenshot()`** — for genuine visual inspection where there is no crisp assertion: does
  the Glide demo still look right, sparkline shapes, header icons, a theme switch.

**Keep it OPTIONAL, and CI-forward-compatible** (both per the user, 2026-08-08):

- *Optional*: Playwright is a devDependency with its own `test:e2e` script, deliberately **not** part
  of `pnpm test`. Nothing else depends on it; backing it out is deleting one directory and one
  script. Cost is bounded — browser binaries (~150 MB) and install time, zero runtime footprint on
  the published addon.
- *CI-forward-compatible*: **the user may want pipelines in future**, so the two techniques above
  must live in separate specs/projects from day one. Pixel-probing tests are deterministic and port
  to a Linux runner unchanged; screenshot snapshots are machine-specific (font rasterisation, GPU,
  dpr) and a future CI either skips them or regenerates baselines on the runner. Splitting them up
  front makes adding CI a config change instead of a rewrite.

*Recorded so it isn't re-derived:* **this repo has no live CI today** — `.github/workflows/ci.yml` is
inherited scaffolding, not a real pipeline for this project (user confirmed 2026-08-08; it currently
runs only `pnpm lint`, which fails). That is why screenshot baselines are viable *now* despite being
normally fragile — but see the CI note above before assuming that stays true.

**What it would close permanently**: 9o's remaining evidence gaps — the sorted-cell edit click, damage
*row* isolation, and blit-under-streaming — plus real clipboard interaction, which the Chrome MCP
tool has repeatedly made awkward (see PORTING-NOTES.md's browser-testing gotchas).

### 9q — Ship CSS for the overlay editors **(DONE 2026-08-08, browser-verified)**

> **Both halves have landed.** The addon now ships three stylesheets, all imported by
> `glide-data-grid.gts` so a consumer never has a CSS import to forget:
> `glide-data-grid.css` (structural `.dvn-*` scroll scaffolding),
> `glide-data-grid-editors.css` (overlay container, `GrowingEntry`, markdown div, edit icons, the
> core editors, plus the shared `.gdg-editor-input` / `.gdg-editor-button` / `.gdg-focus-decoy`
> primitives) and `glide-data-grid-extra-cell-editors.css` (the seven `packages/cells` editors).
> **The sequencing constraint below is therefore satisfied — a `<GlideSearchBar>` can now be added.**
>
> Everything below is kept as the original brief. The implementation record — including the one
> mechanic that made it possible (the overlay container already stamps the merged per-cell theme as
> `--gdg-*`, so theme values live in CSS, not JS), what deliberately stayed inline, and the ten-editor
> browser pass — is in PORTING-NOTES.md's styling section.



The addon shipped **zero CSS** until 2026-08-08 — everything was inline `el.style.x = ...`, which a
consuming app cannot restyle without `!important`. Source ships CSS (via Linaria) precisely so it can
be restyled. **Half of this is now done**: the structural `.dvn-*` scroll scaffolding moved to
`src/components/glide-data-grid.css`, scoped under `.gdg-root`, imported from the `.gts` so bundlers
pick it up automatically. Browser-verified.

**Remaining**: the overlay-editor chrome — `growing-entry.ts`, `markdown-div.ts`, and the per-cell
editors built in `grid-host-controller.ts` (18 `createElement` calls across the three). This is the
half that actually unlocks restyling the editors with Tailwind/DaisyUI, and it should land **before**
any new DOM component (a `<GlideSearchBar>`, say) is added rather than after. Same pattern: stable
`gdg-`-prefixed class names, all values sourced from the `--gdg-*` custom properties the grid already
stamps, selectors scoped under `.gdg-root`.

It is a refactor of working, browser-verified code, so it wants doing deliberately and with a browser
pass — not folded into a feature. See PORTING-NOTES.md's styling section for the Linaria and
ember-scoped-css evaluations, both rejected, so they aren't re-argued.

### 9n — Docs, packaging, release

- **No API reference.** `THEMING.md` (Phase 6) and `DATA.md` (Phase 8) are both excellent and current,
  but they're topic guides — there is no single document listing `<GlideDataGrid>`'s args, the
  `GridCell` kinds, or the extra-cell data shapes. Anyone integrating currently reads
  `glide-data-grid.gts`'s signature. `M`.
- **The addon's `README.md` is a build artifact — don't hand-edit it** (established in Phase 6; see
  `PORTING-NOTES.md`). Whatever documentation lands must respect that.
- **No CHANGELOG, no release process, never published.** Version is still at its scaffold default.
  If this is ever consumed outside this workspace, that's the gate. `S`.
- **Cross-browser / cross-platform verification.** Every browser check in this project ran in Chrome
  on one macOS machine (120 Hz, dpr 2). Safari specifically matters: the port already branches on
  `browserIsSafari` for its render strategy (`"double-buffer"` vs `"single-buffer"`) and that branch
  **has never been executed by anyone**. `S` to check, unknown to fix.

### 9o — Evidence gaps left by Phase 8 (not known breakage — gaps in what was proven)

Each is cheap to close if it ever matters; all four were recorded honestly at Phase 8's close-out
rather than rounded up to "verified".

- **`withColumnSort`'s write path has never been driven in a browser.** *(Half closed 2026-08-08.)*
  The parenthetical below — "those Node scripts should become part of 9a's suite" — **is now done**:
  `src/data-source/column-sort.test.ts` (22 tests) makes Phase 8's throwaway scripts permanent,
  including the round-trip property *"editing displayed row R targets the record shown at displayed
  row R"* and the identity-stability guarantees. **Still open**: nobody has typed into a sorted cell
  in a real browser and watched where the edit landed. This is the one Phase 8 API whose whole point
  is preventing silent data corruption, so it still deserves the click — the unit suite proves the
  algorithm, not the wiring through `<GlideDataGrid>`.
- **Damage *row* correctness was never isolated.** Phase 8c proved the column axis precisely (canvas
  hashed per device-pixel column), but every row was updating constantly, so nothing distinguishes
  "row R repainted because it was damaged" from "because everything was". The column axis was the one
  actually broken, so this is a completeness gap rather than a suspicion.
- **The blit path was not measured under streaming load**, only under ordinary scrolling of a
  `recordsSource` grid. Phase 6's `computeCanBlit` field-diff technique (exact recipe in
  `PORTING-NOTES.md`'s Phase 8e section) would settle it.
- **All Phase 8 numbers come from one machine** (macOS, Chrome, 120 Hz, dpr 2). Not a cross-browser or
  cross-platform claim. See 9n.

---

## THE QUEUE — start here (accurate as of 2026-08-08, end of session)

**Done this session** (branch `phase-9-partial`, 7 commits): the four draw-hook passthroughs and
`@extraCells` (9g/9l), the vitest harness + 425 tests (9a, ongoing), Glint v2, prettier/eslint config
repair, `getCellsForSelection` (9g), and **all of 9q** — the structural-CSS migration *and* the
overlay-editor chrome, so the addon's DOM is now fully restylable from a consuming app.

**Next, in agreed order:**

1. ~~**9q second half — overlay-editor CSS.**~~ **DONE 2026-08-08, browser-verified.** Its sequencing
   constraint is discharged: a `<GlideSearchBar>` can now be added without shipping an
   un-restylable component and migrating it twice.
2. **9e — search.** Unblocked, and now unblocked on the styling side too. **Settle the OPEN DECISION
   in 9e first** (does the addon ship the UI?). Result highlighting can reuse the `@highlightRegions`
   arg landed this session. If a `<GlideSearchBar>` is shipped, style it in a fourth stylesheet
   following the same conventions — `.gdg-root`-scoped, `var(--gdg-*)` for theme values, and the
   shared `.gdg-editor-input`/`.gdg-editor-button` primitives where they fit.
3. **DaisyUI/Tailwind theming.** Blocker is known and verified: Chrome returns `oklch()` unconverted
   from `getComputedStyle`, and `parseToRgba` mangles it to garbage — DaisyUI 5 is OKLCH. Must also
   handle **runtime theme switching** (user switches DaisyUI themes live), which means a
   `MutationObserver` on `data-theme` producing a *new* theme object only on real change —
   `theme` is identity-compared by `computeCanBlit`.
4. **9p — Playwright.** User will prioritise after 2 and 3.

**9e (search) — DONE 2026-08-08, browser-verified.** Three commits: `feat(9e-a)` the engine
(`src/rendering/search.ts`, 30 tests), `feat(9e-b)` the controller wiring, `wip(9e-c)` the
`<GlideSearchBar>` (whose message is wrong — see below). Confirmed working end to end: `Ctrl/Cmd+F`
opens the bar, typing streams results in, matches highlight via `prelightCells`, and next/prev
navigates *and* scrolls the grid to the match ("2 of 982 results").

> **CORRECTION, and the lesson is the point.** The `wip(9e-c)` commit message and an earlier version
> of this section both claimed the bar did not render. **That was a false negative from the test
> harness, not a defect.** The Chrome-automation tool's synthetic clicks do not focus the grid root
> — `document.activeElement` stayed `BODY` — and `onKeyDown` early-returns on `!this.isFocused`, so
> the keybinding never fired. Real clicks focus it fine; the user found this immediately by just
> using it. **Add to the browser-testing gotchas: before concluding a keyboard feature is broken,
> assert `document.activeElement` is what you think it is.** Two hours of "debugging" a working
> feature came from not checking that.
>
> Also learned while confirming: `RowID` cells are **not searchable**, so searching `row-4` in the
> demo finds nothing. That is faithful — source's match-string switch omits `RowID` (and Loading,
> Protected, Drilldown) — but it is surprising enough that it belongs in the API docs.

**Consumers can put the search input anywhere**, not just in the grid: set `@showSearch={{true}}`
(highlighting is gated on search being open) and drive `api.setSearchValue()` from your own input,
skipping `<GlideSearchBar>`. `@searchResults` replaces the built-in scanner entirely for
server-side search. This was an explicit user requirement raised on 2026-08-08 — an always-visible
external search box — and it works today with no addon change.

**Remaining on 9e:** nothing blocking. Worth doing when convenient: fold the correction above into
PORTING-NOTES.md's browser-testing gotcha list, and document the non-searchable cell kinds.

**Explicitly parked:** lint/format cleanup (user: "id prefer doing feature than fixing linting for
now") — `pnpm lint` currently fails on 117 eslint + 65 prettier. 9b (accessibility) and 9c (touch),
deferred by user decision.

**Loose end:** `getCellsForSelection` has never been exercised in a browser. Low risk — `rowEnd` is
clamped to `args.rows` at every call site, so the default path is provably identical to the previous
behaviour — but the click hasn't happened.

**9b** (accessibility) and **9c** (touch) remain deferred by explicit user decision; 9b is still the
item nothing else substitutes for if a consumer ever needs it.

## How to resume cold (fresh session, no memory of this conversation)

1. Read this file (plan/status) and `PORTING-NOTES.md` (facts/architecture) in
   `/Users/jxhui/Developer/glide-data-grid-ember/`.
2. Check `git log --oneline` in that repo to confirm which phases actually have a commit (the
   table above should match, but git is the final authority on what's actually landed).
3. Check for any uncommitted work-in-progress (`git status`) — a phase may have been mid-flight
   when the session ended; check PORTING-NOTES.md's per-phase status notes for what a partial
   state means and whether it's safe to build on or needs re-verification first.
4. Recreate a task tracker (TaskCreate) mirroring the status table above if useful, then continue
   from the first non-done phase, following the standing execution instructions above. **Phases 0–8
   are all done — so "the first non-done phase" is Phase 9, which is explicitly *not* auto-scheduled.
   Do not start working the Phase 9 backlog on your own; wait to be asked, and ask which items.**
