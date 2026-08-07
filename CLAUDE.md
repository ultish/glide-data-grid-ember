# glide-data-grid → Ember port

This repo is a full-parity Ember v2 addon port of [glide-data-grid](https://github.com/glideapps/glide-data-grid)
(a React canvas data grid), source at `/Users/jxhui/Developer/glide-data-grid` on this machine.
`.gts` components, Vite-based test-app, pnpm workspace.

**Before doing anything else, read these two files in full:**

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
- Type-check: `cd glide-data-grid-ember && npx tsc --noEmit -p tsconfig.json`
- Addon build: `pnpm --filter glide-data-grid-ember build` (rollup)
- Test-app build (the real end-to-end check): `pnpm --filter test-app exec vite build`
- Test-app dev server: `pnpm --filter test-app run start` (serves at `localhost:4200`)
- Relative imports in the addon **must** use explicit `.ts` extensions (not `.js`) — a rollup/babel
  requirement `tsc` alone won't catch. See `PORTING-NOTES.md`'s "Settled build-config facts".

## Current status (see PHASES.md for the authoritative table)

Phases 0–7 complete, all browser-verified and committed: workspace scaffold, framework-agnostic
rendering-engine port, Ember canvas host layer (sticky header, native scroll, virtualization), the
full interaction layer (selection, keyboard nav, copy/paste, column resize/reorder), all core cell
types + the overlay-editor framework (Phase 4), all 13 `packages/cells` extra cell types including
sparklines (Phase 5), the theming system (Phase 6), and the grid.glideapps.com demo replica with
**column sort** and **column group headers** (Phase 7). The Phase-2 placeholder renderer
(`src/rendering/-temp-text-cell-renderer.ts`) was deleted in Phase 4a — the real registry is
`src/rendering/cells/index.ts` (`getCellRenderer`), combined with extras via
`createCombinedCellRenderer` from `src/rendering/extra-cells/index.ts`.

Phase 7 landed: `withColumnSort` (`src/data-source/`, the first piece of Phase 8's decorator layer),
column grouping (auto-enabled by `column.group`, as source does it), the demo replica in
`test-app/app/components/glide-demo.gts` with its consumer-built "Sort ascending / Sort descending"
menu, and fixes for **five addon defects the demo surfaced** — see PORTING-NOTES.md's Phase 7e
section. **Per explicit user instruction the demo is the data grid and nothing else** — the 6
feature cards from the original requirements were dropped deliberately; don't "restore" them.

**Next up: Phase 8** (async/streaming + the `recordsSource` data-source layer — note `withColumnSort`
already established the composable-decorator shape and the `src/data-source/` directory it belongs
in; `recordsSource` should return `columns`/`rows`/`getCellContent` under exactly those names so the
two compose). Phase 8 also carries a **required API fix agreed with the user**: a decorator that
remaps the read path must remap the write path too, so `withColumnSort` should take and return
`onCellsEdited` rather than making every consumer translate `location` through `getOriginalIndex` by
hand — today's asymmetry silently writes edits to the wrong record on a sorted grid. Full rationale
and API sketch in PHASES.md's "Phase 8 — START HERE" block; read it before designing `recordsSource`,
which must adopt the same contract. Phase 9 is a deliberately non-auto-scheduled backlog.

Consumer-facing docs now exist and are the spec for future work — keep them in sync rather than
letting them go stale: `glide-data-grid-ember/THEMING.md` (Phase 6) and
`glide-data-grid-ember/DATA.md` (how consumers wire data in; **Phase 8's `recordsSource` must
implement DATA.md's documented pattern**, and DATA.md's "Status of this recommendation" section
records which half is measured vs merely reasoned).

Three things a cold session should know, all written up in full in `PORTING-NOTES.md`:
`computeCanBlit` identity-compares ~18 `DrawGridArg` fields, so a freshly allocated value silently
disables the scroll blit fast path with **no** visible symptom (this went undetected from Phase 2 to
Phase 6); autotracking only records reads made *during* the tracking frame, so a `getCellContent`
closure that reads tracked state lazily never registers a dependency; and — the Phase 7e lesson —
**a feature no demo has ever switched on is effectively unverified code, however many phases have
been "browser-verified"**. Turning on row markers, column groups and header icons for the first time
in Phase 7 surfaced five latent defects at once, including 28 header-icon glyphs ported in Phase 1
that nothing had ever imported. When a phase enables something dormant, budget for that.
