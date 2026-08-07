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
| 7 | Demo app matching glideapps.com + browser verification | Pending |
| 8 | Async/streaming data + real-time updates demo | Pending |
| 9 | Backlog — deferred features (**not auto-scheduled**, see detail below) | Not scheduled |

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
example grid AND the 6 feature cards (Scale to millions of rows / Blazingly fast scrolling / Fully
free & open source / Real-time updates / Inline charts / Asynchronous data) in `test-app`. This is
the main acceptance-test surface — use Chrome/Playwright to actually verify: sticky header holds
under scroll, horizontal+vertical scroll both work, copy/paste works, sort menu opens on header
click, row selection/select-all works, sparklines render, scroll performance is smooth with a
large dataset. Don't claim "done" on this phase without actually driving it in a browser.

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
3. **A high-frequency `updateCells()` demo** (the original Phase 8 requirement above), which is also
   what proves the O(1)-`getCellContent` contract holds under load.

**Phase 9 — Backlog (deferred features, NOT part of the auto-continue sequence).** Unlike Phases
0–8, this is not something to pick up automatically when the prior phase finishes — it exists so
the real, accumulated list of "known gaps vs source" lives in one auditable place instead of being
scattered across code comments and `PORTING-NOTES.md`, where it's easy to silently lose track of.
Work on any of these only when explicitly asked. Audited against `PORTING-NOTES.md` on 2026-08-07
(user asked "is there a lot still not ported?" — this list is the honest answer, not a reassurance).

*Interaction/selection:*
- **Row reordering** (dragging rows via the row-marker column) — column resize/reorder landed in
  Phase 3d, row reorder did not (`onRowMoved` isn't ported at all).
- **Fill-handle drag-to-fill** — `DEFAULT_FILL_HANDLE` exists as ported static data, but the actual
  drag-to-replicate-values interaction was never built.
- **Controlled-selection mode** — `GridHostController` always owns `selection` internally; there's
  no `GridHostArgs.selection` prop for a consumer to pass in/manage it externally.
- **Span/merged-cell selection growth** (`expandSelection`) — not ported; no cell type uses
  `GridCell.span` yet so there was nothing to exercise it against.
- **`onSelect` renderer hook** — cell renderers can't intercept/suppress a click's selection
  (`onClick` is wired, `onSelect` is not).
- **Keybinding remapping** — only the hardcoded default keybindings work; source's remappable
  string-based `ConfigurableKeybinds` DSL isn't ported.
- Assorted nav variants: Tab/Shift+Tab aliasing, alt+Arrow "free move," primary+shift jump-to-edge
  selection, row/column space-bar select shortcuts.

*Rendering:*
- **Column/row grouping** — `ENABLE_GROUPS` is hardcoded `false` throughout; group headers don't
  render even though `groupHeaderHeight` is accepted as a prop.
- **Real column auto-sizing** — auto-width columns get a fixed fallback width
  (`DEFAULT_AUTO_COLUMN_WIDTH`), not source's actual text-measurement-based auto-sizing.
- **`mappedColumns` identity churn (perf)** — `computeMangledLayout` rebuilds the mapped-column
  array on every draw, so `computeCanBlit` falls into its `deepEqual`-per-column branch each frame,
  and bails out of the blit fast path entirely once a grid has **more than 100 columns**. Phase 6
  fixed the three other identity-instability sources (see PORTING-NOTES.md's Phase 6 section); this
  one is left because it's row-marker/trailing-row mangling infra, not theming. Memoize
  `computeMangledLayout` on `columns`/`freezeColumns`/marker-state identity to close it.
- **Replace the hand-rolled memo caches with `memoize-one`** — Phase 6 added three hand-written
  identity caches in `grid-host-controller.ts` (`mergedThemeCache`, `mangledCellContentCache`, and
  the module-scope `ALWAYS_VERTICAL_BORDER` constant) to restore reference stability for
  `computeCanBlit`. `memoize-one` (single-entry cache + custom comparator) is the direct
  framework-agnostic equivalent of React's `useMemo` and would express these more compactly. The
  substantive argument for it is not tidiness: passing the cache inputs as real *parameters* means
  the returned closure captures the parameters rather than a captured `args` object, which makes
  "cache key drifts from what the closure captures" structurally impossible to express rather than
  merely absent today (that class of bug had to be hand-audited during Phase 6 verification).
  Deferred because it churns freshly-verified code and adds a runtime dependency to a v2 addon.
  **Ember-native options were evaluated and rejected** — `@cached` is getter-only (can't take
  parameters, so `themeForCell` is impossible), and both `@cached` and the lower-level
  `createCache`/`getValue` primitive invalidate on *tracked* consumption, while `GridHostController`
  deliberately holds untracked state; a cache consuming no tracked state is frozen permanently
  (`isConst` exists precisely to detect this), turning a perf optimization into a stale-data
  correctness bug. `@cached` on a **component getter** in `glide-data-grid.gts` remains the right
  tool for any future *derived* arg (e.g. a combined cell renderer built from an `@extraCells` arg)
  — computing such a value inline in `buildGridHostArgs()` would reintroduce the identity churn from
  the consumer side.

*Sort* — still just `onHeaderMenuClick`'s hit-test + callback (Phase 3). No menu UI, no sort state,
no sort logic anywhere. This was in the **original explicit requirements list** and is currently the
single biggest gap between "what was asked for" and "what exists" — Phase 7 is where this is
supposed to land (building the demo's header-click menu), don't let it slip further.

*Architecture / extensibility:*
- **`renderComponent`-based cell editors** — editors are currently hand-built DOM factories
  (`CellEditorProps` → `{element, focus(), destroy()}`), not real `.gts` components, because
  `GridHostController` has zero Ember context (no `owner`) by design. `@ember/renderer`'s
  `renderComponent(Component, {into, owner, args})` (confirmed present in this project's pinned
  `ember-source@6.12.0`, synchronous, returns `{destroy()}`) is a viable alternative that would let
  per-cell editors be genuine templated components instead — worth revisiting specifically if/when
  this addon exposes a public "bring your own cell type" API, where forcing consumers to hand-write
  DOM would be a real DX regression vs. source's `provideEditor: () => <Component />` pattern. Not
  worth the `owner`-threading migration for the cells already built on the current contract.

Known-and-already-scheduled (restated here only so this list is a complete picture, not because
they're forgotten): theming consumer API (Phase 6), the actual grid.glideapps.com demo replication
+ 6 feature cards (Phase 7), async/streaming real-time-updates demo (Phase 8).

## How to resume cold (fresh session, no memory of this conversation)

1. Read this file (plan/status) and `PORTING-NOTES.md` (facts/architecture) in
   `/Users/jxhui/Developer/glide-data-grid-ember/`.
2. Check `git log --oneline` in that repo to confirm which phases actually have a commit (the
   table above should match, but git is the final authority on what's actually landed).
3. Check for any uncommitted work-in-progress (`git status`) — a phase may have been mid-flight
   when the session ended; check PORTING-NOTES.md's per-phase status notes for what a partial
   state means and whether it's safe to build on or needs re-verification first.
4. Recreate a task tracker (TaskCreate) mirroring the status table above if useful, then continue
   from the first non-done phase, following the standing execution instructions above.
