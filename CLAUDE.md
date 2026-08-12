# glide-data-grid → Ember port

This repo is a full-parity Ember v2 addon port of [glide-data-grid](https://github.com/glideapps/glide-data-grid)
(a React canvas data grid), source at `/Users/jxhui/Developer/glide-data-grid` on this machine.
`.gts` components, Vite-based test-app, pnpm workspace.

**If you are here to work on remaining tasks, read `TODO.md` instead — it is self-contained.**
`TODO.md` (337 lines) carries every outstanding item with its source citations, the five rules that
cause real bugs here, and the working practices, specifically so the two large files below do not
need loading. The files below are the historical record; go to them only when `TODO.md` points you
at a section.

**For deep history or to resume a phase cold, read these two files in full:**

1. **`PHASES.md`** — the durable plan: original requirements, phase-by-phase scope, current status,
   standing execution rules, and explicit instructions for resuming cold.
2. **`PORTING-NOTES.md`** — accumulated architecture facts, gotchas, settled build-config issues,
   and per-phase implementation notes with source citations. This is the project's shared memory:
   **read it before researching anything yourself, and add to it before you finish any work** —
   don't let a future session or subagent re-derive what's already known here.

Both files are kept current after every phase. If anything below conflicts with them, they win.

## Standing rules (condensed — full detail in PHASES.md)

- Proceed through phases without asking permission once a plan is set; stop and ask only for
  genuine decisions or when explicitly told to stop.
- Delegate implementation to background subagents with precisely-scoped prompts that point to
  `PORTING-NOTES.md` first. **Independently re-verify their work yourself** (rerun `tsc`/build,
  spot-check against source) — don't just trust a subagent's self-report.
- Check in on any subagent still running past ~30 minutes rather than passively waiting.
- Background subagents on this project stall/die to transient connection errors fairly often. If
  it happens with little/no file output, just relaunch. If it happens after substantial progress,
  check `git status`/`git diff` first — usually most of the work is salvageable, and finishing a
  small remainder directly is often faster than another full agent round-trip.
- Commit after each completed phase (or sub-phase), with a clear commit message. Update
  `PHASES.md`'s status table and `PORTING-NOTES.md`'s relevant section as part of that.
- For browser-testing focus-sensitive or clipboard interactions: dispatch the whole interaction as
  raw DOM events (`MouseEvent`/`ClipboardEvent` + a manual `DataTransfer`) inside a single
  `javascript_tool` script, staying in one browser tab. Switching tabs mid-test silently blurs the
  page; `navigator.clipboard.readText()`/`.write()` can hang indefinitely on a permission prompt.

## Quick reference

- Addon package: `glide-data-grid-ember/`. Test app: `test-app/`.
- Type-check: `pnpm --filter glide-data-grid-ember lint:types` (runs `ember-tsc --noEmit`).
  **Use `ember-tsc`, not bare `tsc`** — since the Glint v2 upgrade, plain `tsc` silently *ignores*
  `.gts` files and exits 0 without checking `glide-data-grid.gts`. Older notes in PORTING-NOTES.md
  say `npx tsc --noEmit -p tsconfig.json`; that is now the wrong command.
- Unit tests (Phase 9a): `pnpm --filter glide-data-grid-ember test` (vitest, bare Node, ~190ms).
  Test-project type-check: `pnpm --filter glide-data-grid-ember lint:types:test`.
- Addon build: `pnpm --filter glide-data-grid-ember build` (rollup)
- Test-app build (the real end-to-end check): `pnpm --filter test-app exec vite build`
- Test-app dev server: `pnpm --filter test-app run start` (serves at `localhost:4200`)
- Relative imports in the addon **must** use explicit `.ts` extensions (not `.js`) — a rollup/babel
  requirement `tsc` alone won't catch. See `PORTING-NOTES.md`'s "Settled build-config facts".

## Current status (see PHASES.md for the authoritative table)

Phases 0–8 complete, all browser-verified and committed: workspace scaffold, framework-agnostic
rendering-engine port, Ember canvas host layer (sticky header, native scroll, virtualization), the
full interaction layer (selection, keyboard nav, copy/paste, column resize/reorder), all core cell
types + the overlay-editor framework (Phase 4), all 13 `packages/cells` extra cell types including
sparklines (Phase 5), the theming system (Phase 6), the grid.glideapps.com demo replica with
**column sort** and **column group headers** (Phase 7), and the data-source layer + async/streaming
data (Phase 8). The Phase-2 placeholder renderer
(`src/rendering/-temp-text-cell-renderer.ts`) was deleted in Phase 4a — the real registry is
`src/rendering/cells/index.ts` (`getCellRenderer`), combined with extras via
`createCombinedCellRenderer` from `src/rendering/extra-cells/index.ts`.

Phase 7 landed: `withColumnSort` (`src/data-source/`, the first piece of Phase 8's decorator layer),
column grouping (auto-enabled by `column.group`, as source does it), the demo replica in
`test-app/app/components/glide-demo.gts` with its consumer-built "Sort ascending / Sort descending"
menu, and fixes for **five addon defects the demo surfaced** — see PORTING-NOTES.md's Phase 7e
section. **Per explicit user instruction the demo is the data grid and nothing else** — the 6
feature cards from the original requirements were dropped deliberately; don't "restore" them.

Phase 8 landed the whole `src/data-source/` layer: `recordsSource` (in-memory records → grid args,
one `createCache` per record so editing one field re-projects one row — **browser-measured at 1,000
rows**), `AsyncRecordsSource` (paged/async, a class because it owns page state), the new
`onVisibleRegionChanged` grid arg that drives it, and `withColumnSort`'s write path
(`onCellsEdited` in and out, so the read and write coordinate spaces can no longer disagree —
`getOriginalIndex` is now just the escape hatch). Demos: `<StreamingDemo>` (`updateCells()` measured
at ~524k cells/sec peak), `<AsyncDemo>` (100k rows, paged), `<ScaleProof>` (the 1,000-row
measurement + the `object-scan` example), and `<TrackingDemo>` rewired onto `recordsSource`.
**Two real addon defects were fixed along the way** — `updateCells` ignored the row-marker column
offset, and a *fractional grid height* blanked the entire grid on every damage-only repaint (canvas
realloc + `alpha: false`). Both were invisible until something drove `updateCells` continuously; see
PORTING-NOTES.md's Phase 8e section.

**Next up: nothing is auto-scheduled.** Phase 9 is a deliberately non-auto-scheduled backlog of
known gaps vs source (PHASES.md) — work it only when asked, and ask *which* items.

Phase 9 was fleshed out on 2026-08-08 into 15 grouped items (9a–9o) by auditing the **source tree**,
not this project's own notes — which added seven groups that had never been recorded anywhere,
including that **the repo has no automated tests at all** (9a), **no accessibility DOM/ARIA
whatsoever** (9b), and no touch, search, or context-menu support. The raw inventory (source file
line counts, the hardcoded-`undefined` `DrawGridArg` fields, the 82-vs-26 prop gap) is in
PORTING-NOTES.md's "Phase 9 audit" section — don't re-derive it. Standing lesson recorded there:
auditing your own notes only finds what you already knew you skipped. **Both repos are indexed in the
`codebase-memory` knowledge graph** (`Users-jxhui-Developer-glide-data-grid` and
`...-glide-data-grid-ember`) — use it before hand-grepping either tree.

**Several Phase 9 items and all of Phase 10 have landed** on branch `phase-9-partial`, all
browser-verified — see PORTING-NOTES.md for each: the four consumer draw hooks + `@extraCells`
("Phase 9 (partial)"), 9q (the addon ships real stylesheets), 9e (search + opt-in
`<GlideSearchBar>`), 9d (context menus), 9i (column auto-sizing), **9h (autoscroll + row reorder +
fill handle)**, and **Phase 10** (see below). Vitest suite: **589**.
**9b (accessibility) and 9c (touch) are deferred by explicit user decision** — don't propose them as
next steps.

**Queue items 1–6 landed 2026-08-09** (see PHASES.md's "THE QUEUE" and PORTING-NOTES.md's "Queue
items 1–6"): the two `.md` guides migrated into the cookbook and deleted, the new Ember chapter, the
`@action` → class-field-arrow sweep, and the six `<DemoGrid>` interaction gaps — of which **only one
was an addon defect**. Two real defects were fixed: pointer events inside an overlay editor were
dispatched as grid clicks (tearing the editor down and rebuilding it, in *every* editor since Phase
4a), and `recordsSource` painted blank rows for records appended to a live Ember Data array. Vitest:
**614**.

**Both follow-ups from that queue are since closed, and so is the decision it was waiting on** — this
paragraph is kept as the record of the queue, not as a plan. CI is green across the whole `ember-try`
matrix (TODO.md §5.1), the addon is published (v0.1.7, then v0.2.0 — §5.3), and
`@onSelectionChanged`'s coordinate space was made consistent with every other callback on
2026-08-09 and browser-verified; `-private/selection-space.ts` now makes a missed conversion a
compile error. Only 9p (Playwright) is still deferred. **For what is actually next, read `TODO.md`.**

**Phase 10 changed two things a cold session will otherwise get wrong.** (1) `<DemoGrid>` is now the
single fully-featured reference grid — every shipped arg switched on, with toggles for the
mutually-exclusive ones; it found a real auto-sizing defect within minutes of existing (measuring in
whatever font the last draw left on the canvas). Keep new args wired into it. (2) **The cookbook is
a live page in the test-app** (`app/components/cookbook-page.gts`, the "Cookbook" tab), *not* a
markdown file — there is deliberately no `COOKBOOK.md`, because the test-app is what gets deployed.
The **workspace-root `README.md`** is now user-facing and is the file to edit; the addon's copy is a
build artifact rollup overwrites.

Phase 9h is worth reading before touching drag/mouse code: `Autoscroller`
(`src/rendering/autoscroll.ts`) is shared by drag-extend, row reorder and fill-drag, and there is
now a **second, window-level `mousemove` listener** that wakes only for an in-flight drag outside
the grid (the main one is on `root`, so it stops firing exactly when autoscroll needs it). It found
two more latent defects of the usual kind: the fill handle had been *drawn* unconditionally since
Phase 2 while doing nothing when dragged, and `@highlightRegions` ignored the row-marker column
offset because no demo had ever switched on both at once.

**There is exactly ONE consumer-facing guide, and it is not a markdown file.** As of 2026-08-09
`glide-data-grid-ember/THEMING.md` and `DATA.md` are **deleted** — their content lives in the
cookbook, which is a live page in the test-app. The cookbook is **one chapter per file** in
`test-app/app/utils/cookbook/`, ordered by that directory's `index.ts`; chapter titles carry **no
leading number** (the page numbers them from position), so adding a chapter is a one-line edit to
`index.ts` and several agents can write chapters concurrently. 18 chapters, including *Using the grid
in Ember* (the old `DATA.md` plus Ember Data/GraphQL/`object-scan`), *Theming*, *Theme reference* and
*Performance rules*. These docs are the spec for future work — keep them in sync rather than letting
them go stale, and note the standing lesson in PORTING-NOTES.md: **consumer docs rot in one direction
only**, so when a phase implements something, grep the docs for its name before closing it.

Three things a cold session should know, all written up in full in `PORTING-NOTES.md`:
`computeCanBlit` identity-compares ~18 `DrawGridArg` fields, so a freshly allocated value silently
disables the scroll blit fast path with **no** visible symptom (this went undetected from Phase 2 to
Phase 6); autotracking only records reads made *during* the tracking frame, so a `getCellContent`
closure that reads tracked state lazily never registers a dependency; and — the Phase 7e lesson —
**a feature no demo has ever switched on is effectively unverified code, however many phases have
been "browser-verified"**. Turning on row markers, column groups and header icons for the first time
in Phase 7 surfaced five latent defects at once, including 28 header-icon glyphs ported in Phase 1
that nothing had ever imported. When a phase enables something dormant, budget for that.

Phase 8 proved that lesson twice more, and it is worth stating as its own rule: **`updateCells`'s
damage path had never been driven hard, and both defects it hid were invisible to full redraws** —
one blanked the entire canvas whenever the grid's height was fractional, the other repainted the
wrong column whenever row markers were on. A full redraw papers over damage bugs by construction, so
"the grid looks right" says nothing about the damage path until something exercises it continuously.
