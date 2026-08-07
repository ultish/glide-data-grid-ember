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

Phases 0–5 complete, all browser-verified and committed: workspace scaffold, framework-agnostic
rendering-engine port, Ember canvas host layer (sticky header, native scroll, virtualization), the
full interaction layer (selection, keyboard nav, copy/paste, column resize/reorder), all core cell
types + the overlay-editor framework (Phase 4), and all 13 `packages/cells` extra cell types
including sparklines (Phase 5). The Phase-2 placeholder renderer
(`src/rendering/-temp-text-cell-renderer.ts`) was deleted in Phase 4a — the real registry is
`src/rendering/cells/index.ts` (`getCellRenderer`), combined with extras via
`createCombinedCellRenderer` from `src/rendering/extra-cells/index.ts`.

Next up: Phase 6 (consumer-facing theming API), then 7 (grid.glideapps.com demo replication) and
8 (async/streaming updates). Phase 9 is a deliberately non-auto-scheduled backlog of known gaps.
