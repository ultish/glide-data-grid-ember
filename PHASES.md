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
| 3 | Interaction layer (selection, copy/paste, sort menu, DnD resize/reorder, hover anim) | **In progress** — split into 3a (selection+clicks, done+committed) / 3b (keyboard nav, running) / 3c (copy/paste) / 3d (resize/reorder DnD) |
| 4 | Core cell types + overlay editors | Pending |
| 5 | Extra cell types incl. sparklines | Pending |
| 6 | Theming system | Pending |
| 7 | Demo app matching glideapps.com + browser verification | Pending |
| 8 | Async/streaming data + real-time updates demo | Pending |

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

**Phase 7 — Demo app + browser verification.** Replicate https://grid.glideapps.com/'s fancy
example grid AND the 6 feature cards (Scale to millions of rows / Blazingly fast scrolling / Fully
free & open source / Real-time updates / Inline charts / Asynchronous data) in `test-app`. This is
the main acceptance-test surface — use Chrome/Playwright to actually verify: sticky header holds
under scroll, horizontal+vertical scroll both work, copy/paste works, sort menu opens on header
click, row selection/select-all works, sparklines render, scroll performance is smooth with a
large dataset. Don't claim "done" on this phase without actually driving it in a browser.

**Phase 8 — Async/streaming data.** Port `packages/source`'s async data source helpers (or build
an Ember-idiomatic equivalent) and build a demo exercising `GridHostController.updateCells()` at
high frequency, matching the source's "hundreds of thousands of updates per second" claim and its
`docs/04-streaming-data.stories.tsx`/`rapid-updates.stories.tsx` examples.

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
