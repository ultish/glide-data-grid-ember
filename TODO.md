# TODO — remaining work on the glide-data-grid → Ember port

**This file is self-contained on purpose.** `PHASES.md` (1,354 lines) and `PORTING-NOTES.md` (4,937)
are the historical record and are too large to load routinely. Everything needed to *finish* the
remaining work is here. Read `CLAUDE.md` (158 lines) too — it is short and still current.

Consult the big files only when an item below explicitly points you at a section.

---

## 1. Orientation — read this before touching anything

**What this repo is.** A full-parity Ember v2 addon port of
[glide-data-grid](https://github.com/glideapps/glide-data-grid), a React canvas data grid. The React
source is checked out on this machine at `/Users/jxhui/Developer/glide-data-grid` — **read it
directly**; every item below cites file:line in it.

**Layout.** `glide-data-grid-ember/` is the addon; `test-app/` is the Vite/Embroider demo app, which
is also what deploys to GitHub Pages. pnpm workspace.

**State as of 2026-08-09:** `main` is pushed, GitHub Pages is deployed and working. 842 vitest tests
pass. Phases 0–11 are done; what is left is the backlog below.

### Commands

```bash
pnpm --filter glide-data-grid-ember test            # vitest, bare Node, ~600ms. 840 tests.
pnpm --filter glide-data-grid-ember lint:types      # ember-tsc --noEmit
pnpm --filter glide-data-grid-ember lint:types:test # the vitest project's own tsconfig
pnpm --filter glide-data-grid-ember build           # rollup -> dist/
pnpm --filter test-app run lint:types               # ember-tsc --noEmit
pnpm --filter test-app exec vite build              # the real end-to-end check
pnpm --filter test-app run start                    # dev server on :4200
```

**Use `ember-tsc`, never bare `tsc`.** Since the Glint v2 upgrade, plain `tsc` silently *ignores*
`.gts` files and exits 0. A green bare-`tsc` run means nothing.

**Relative imports in the addon must use explicit `.ts` extensions** (not `.js`, not extensionless) —
a rollup/babel requirement `tsc` alone will not catch.

### The five rules that cause real bugs here

1. **Identity stability.** `computeCanBlit` decides whether a scroll can blit instead of repainting.
   It compares ~18 `DrawGridArg` fields **by `===`**. A value reallocated per draw silently disables
   the fast path — *no error, no warning, no visual difference*. This went undetected from Phase 2 to
   Phase 6. Build such values in a `@cached` getter or module-scope constant, or memoize them on a
   structural key. **Exception worth knowing:** `mappedColumns` is *not* identity-only — above 100
   columns `computeCanBlit` bails outright, and below it compares columns element-wise with
   `deepEqual` (`rendering/render/data-grid-render.blit.ts:258-284`). Several `data-source/` headers
   overstate this; do not repeat the overstatement.

2. **Autotracking only records reads made *during* the tracking frame.** The grid's modifier reads
   the `getCellContent` *reference*; it never calls it during tracking. So a closure that reads
   `@tracked` state lazily at paint time never registers a dependency and the grid silently never
   repaints. This is what `recordsSource` exists to encode.

3. **Coordinate space.** When row markers are on, the grid inserts a marker column at internal index
   0. **Every consumer-facing callback reports the consumer's space** (marker subtracted) — this was
   made consistent on 2026-08-09 and browser-verified. Internally, `-private/selection-space.ts`
   brands the two spaces (`MangledSelection` vs plain `GridSelection`) so a missed conversion is a
   compile error. **Respect the brands; never cast around them.**

4. **The decorator write-path contract.** Any decorator remapping rows or columns for *reading* must
   also remap *writing* — take `onCellsEdited` in, hand a translated one back out. Otherwise reads
   and writes disagree and edits land on the wrong record, silently, until the next re-sort. This
   shipped broken once (Phase 7c). All of `src/data-source/` follows it. **`onSelectionChanged` is
   deliberately NOT translated** — it reports what is visually selected, which is displayed space.

5. **A feature no demo switches on is unverified code**, however green the tests are. This project's
   most expensive recurring lesson, re-earned five times. `GridColumn.grow` was *dead for nine
   phases* with passing tests because nothing ever set it. **Wire everything you add into
   `test-app/app/components/demo-grid.gts`.**

### Working practices that were learned the hard way

- **`glide-data-grid-ember/src/-private/grid-host-controller.ts` is ~5,200 lines and nearly every
  remaining item touches it.** Subagents cannot work it in parallel — they conflict. Serialize it.
  Safely parallel: `src/data-source/`, `test-app/app/utils/{cookbook,guide}/`, new demo files.
- **The controller cannot be imported by vitest.** Extracting logic into pure `src/rendering/`
  modules is the only way it becomes testable — that pattern produced ~60 of the current tests. Do it
  whenever you touch real logic in there.
- **Read the *guard conditions* around a call in source, not the prop declaration.** Inferring a
  contract from a prop's name and type produced three defects in one sitting.
- **On a full-parity port, needing a paragraph to argue your divergence is *better* than upstream is
  itself the signal to go re-read source.** That justification paragraph is the tell.
- **Browser testing:** build `dist/` explicitly first (`pnpm --filter glide-data-grid-ember build`)
  and run the dev server on a unique port. A watch build rebuilding underneath a test invalidated a
  whole verification pass. Also: **an occluded Chrome window makes the grid completely inert** —
  `document.visibilityState === "hidden"`, `requestAnimationFrame` suspended, `ResizeObserver` never
  delivers, canvases stay 0×0 and every hit test is out-of-bounds. Check that before believing any
  browser failure.
- **When verifying a coordinate change, find a *semantic* assertion, not a numeric one.**
  `<DemoGrid>` looks its column note up by index, so clicking the Notes column and reading back
  "Markdown cell" is a check a wrong offset cannot pass; "it printed 4" can pass by luck.

### Standing user decisions — do not propose these

- **Accessibility (9b)** — deferred. No ARIA/DOM tree at all. The item most likely to become urgent
  if a consumer ever needs it, and it cannot be added from outside the addon.
- **Touch/mobile (9c)** — deferred. Not needed for the intended consumers.
- **Playwright (9p)** — deferred.
- **The demo is the data grid and nothing else.** The 6 "feature cards" from the original brief were
  dropped deliberately. Do not restore them.
- **`object-scan` / `glimmer-apollo` / DaisyUI / Tailwind are test-app-only.** The addon depends on
  no data layer and no design system, and must not gain one.

---

## 2. Quick wins — diagnosed, small, do these first

### 2.1 `withMovableColumns` memoizes on the wrong key — DONE (2026-08-09)

`src/data-source/movable-columns.ts:237` keys its cache `WeakMap<GetCellContentFn, CacheEntry>` — on
the incoming `getCellContent`. But `recordsSource` deliberately returns a **fresh `getCellContent`
whenever data changes** (that identity change is precisely its "this row changed" signal). So the
cache misses on every data change, defeating its "hand back the caller's own array" optimisation **in
exactly the composition it exists for**.

`withCollapsingGroups` keys on `columns` and is unaffected — copy that.

**Fix:** key on `columns` + the order key; treat `getCellContent` as an input to wrap, not as cache
identity. Add a test asserting the returned `columns` array keeps its identity across a data change.

### 2.2 `UndoRedo` has no "am I replaying?" signal — DONE (2026-08-09)

`src/data-source/undo-redo.ts`. A consumer's `onCellEdited` that persists, logs or marks a record
dirty cannot distinguish an undo from a user edit — so an undo re-persists and a redo double-counts.
The "Composed hooks" demo brackets its own calls, but the **keyboard** path cannot be bracketed from
outside.

**Fix:** a public `isReplaying` flag, or a second argument on the edit callback. Matters the moment
anyone wires undo to a real backend.

### 2.3 `verticalBorder` is hardcoded — DONE (2026-08-09)

`ALWAYS_VERTICAL_BORDER` at `grid-host-controller.ts:1011` (used in the `DrawGridArg` build); its note says "this port always
draws every vertical gridline (no per-column control)". Source takes
`verticalBorder?: (col: number) => boolean`.

**Watch out:** the value is `computeCanBlit`-identity-compared, so expose it via a memoized wrapper,
never an inline arrow. (Rule 1 above.)

### 2.4 `resizeIndicator` is hardcoded — DONE (2026-08-09)

`"none"` at `grid-host-controller.ts:2304`. Source: `"full" | "header" | "none"`, and the render
engine this port already contains draws it. One arg + one passthrough.

### 2.5 `hyperWrapping` — DONE (2026-08-09)

Hardcoded `false` at `grid-host-controller.ts:2274`. The render engine **already honours it**
(`rendering/render/data-grid-lib.ts:592`). A one-literal unlock; source story is `WrappingText`.

### 2.6 `emit` — the last unported imperative method — DONE (already implemented)

`emit("delete")` is already exposed by the public API, forwarded by the controller, and exercised by
the demo. No additional work was needed.

---

## 3. Decide, then act — a stated divergence

### 3.1 The port always smooth-scrolls; source defaults to snap-to-cell — `S`

**Every grid this port renders scrolls differently from the same grid in React.**

Source's `smoothScrollX`/`smoothScrollY` both default to **`false`**
(`scrolling-data-grid.tsx:93-94`); its `SmoothScrollingGrid` story sets them true, i.e. upstream
treats smooth scroll as opt-*in*. This port's `computeXOffset`
(`grid-host-controller.ts:1079`) always returns a sub-pixel `translateX`, and the same on Y. Its
header documents this as a Phase 2 simplification — but it was never recorded as a *behavioural
divergence from source's default*.

**This is a decision, not necessarily a fix.** Smooth may well be the better default. But it should
be a stated choice, and a consumer migrating from React will notice immediately. If it stays,
document it in the cookbook's performance chapter. If not, the branch to port is
`scrolling-data-grid.tsx:145-175`.

---

## 4. Substantial parity gaps

### 4.1 Row grouping — `L` — the biggest remaining gap

Source: `data-editor/row-grouping.ts` (326 lines) + `row-grouping-api.ts` (72) + the `rowGrouping`
prop. Column grouping was done in Phase 7b; rows were not.

**Read the warning before starting:** it changes row-space mapping **globally**, so it interacts with
every decorator's coordinate contract (rule 4 above) — including the three hooks in
`src/data-source/` (`withColumnSort`, `withMovableColumns`, `withCollapsingGroups`, `UndoRedo`,
`recordsSource`, `AsyncRecordsSource`). This is the item most likely to break things quietly. Give it
its own session with a browser available; do not squeeze it in.

### 4.2 `getGroupDetails` — group header icons, themes, actions — `M`

Hardcoded to `DEFAULT_GROUP_DETAILS` (defined at `grid-host-controller.ts:1020`, wired in around
`:1804`); a comment near the theme merge notes group themes can therefore never merge. **The render engine already consumes it fully**
(`rendering/render/data-grid-render.ts:439`).

Source shape: `getGroupDetails(group) => { name, icon?, overrideTheme?, actions? }`, where `actions`
are clickable icons drawn into the group strip with their own hit targets.

**This is the prop several other things hang off**, and group-header *actions* appear in no backlog
item at all. `onGroupHeaderRenamed` (deferred during 9g) is implemented in source by injecting a
"Rename" entry into `actions` plus a second inline overlay host — so it needs this first. Do this
before or alongside further group work, not after.

### 4.3 `rightElement` / `rightElementProps` — `M`

The "+ add column" button every spreadsheet UI has. Source: `scrolling-data-grid.tsx` →
`infinite-scroller.tsx`. The port has none, though the DOM scaffolding (`.dvn-*` scroller,
`scrollInnerEl`, `stackEl`, `spacerEl`) all exists.

**This is the one gap that is *nicer* in Ember than React** — a named block rather than a prop
carrying an element. Design it that way.

### 4.4 External HTML5 drag-and-drop — `M`

`isDraggable: boolean | "header" | "cell"`, `onDragStart`, `onDrop`, `onDragOverCell`,
`onDragLeave`. Source: `data-editor.tsx:2683-2699` (`onDragStartImpl`) plus passthroughs at
`:4235-4296`.

**Not the same thing** as the internal column/row reorder drags already implemented — this is the
browser's HTML5 DnD, for dragging data *out of* and *into* the grid. Four listeners on `root`,
reusing the existing `resolveMouseHit` for the cell target.

### 4.5 Smaller N-items from the Storybook audit

| Item | Size | Where |
|---|---|---|
| **Scroll shadows** | `S` | Source `data-grid.tsx:362,454,1879` — `fixedShadowX`/`fixedShadowY`, both default **true**. The port draws none. Purely cosmetic; it *degrades* rather than breaks, which is why nobody noticed. |
| **`overscrollX`/`overscrollY`** | `S` | N pixels of empty scrollable space past the last column/row. The port computes scroll extent from content only. |
| **`preventDiagonalScrolling`** | `S` | Locks scrolling to one axis per gesture. |
| **`onPaste` prop** | `S` | `boolean \| ((target, values) => boolean)` — veto a paste wholesale. The port's paste path (search `onPaste` in the controller) is unconditional. **Not** substituted by `coercePasteValue`, which is per-value. |
| **`experimental` bag, rest** | `S` each | `paddingRight`/`paddingBottom`, `eventTarget`, `strict`, `scrollbarWidthOverride`, `disableMinimumCellWidth` (`minimumCellWidth: 10` hardcoded at `:2303`), `renderStrategy` (derived from `browserIsSafari` at `:2299`, not overridable). |
| **Shadow DOM** | `S` to check | Never tried. **Unknown, not broken.** Risks: `window`-scoped listeners (`paste` at `:1484`, the window-level `mousemove` from 9h) and the measurement canvas appended to `document.documentElement` at `:1408`. Overlay editors append to the grid root, which is the good case. |

### 4.6 Interaction gaps (formerly 9h)

- **Controlled-selection mode** — `M`. No `GridHostArgs.selection` for a consumer to own externally
  (source's `gridSelection`/`onGridSelectionChange`). Implementation already sketched: an optional
  arg that makes `applySelection` skip mutating `this.selection` and rely on the caller re-supplying
  it. Also unported: `onSelectionCleared`, `previousSelection`.
- **Span/merged-cell selection** — `L`. `expandSelection`, `spanRangeBehavior`. No cell type uses
  `GridCell.span` yet, so there is nothing to exercise it against. The `expand` flag is already
  carried unused through `SetCurrentResult`.
- **`onSelect` renderer hook** — `S`. Typed at `rendering/cell-types.ts:92`; **nothing calls it**.
  Cell renderers cannot intercept or suppress a click's selection.
- **Keybinding remapping** — `M`. Source's `common/is-hotkey.ts` (86 lines) +
  `data-editor-keybindings.ts` (198). Only hardcoded defaults work here.
- **Nav variants** — `S`, all in `onKeyDown`. Tab/Shift+Tab aliasing, alt+Arrow free move,
  primary+shift jump-to-edge, row/column space-bar select.

---

## 5. Release path

### 5.1 Make CI green — DONE (2026-08-09)

**All of `ci.yml` is green.** Two rounds:

1. **Lint** (`23b4cd8`) — the `Tests` and `Floating Dependencies` jobs run `pnpm lint`, which used to
   fail with 133 addon + 5 test-app eslint errors and 30 unformatted files. Fixed.
2. **The `try-scenarios` matrix** — with lint green, the matrix underneath it finally ran, and **5 of
   7 scenarios failed** for three unrelated reasons: ember-source 7 deleted the legacy AMD template
   compiler, ember-source 7 removed the `ember` barrel module (which `@ember/test-helpers@4` still
   imports), and `embroiderSafe()`/`embroiderOptimized()` are structurally inapplicable to a v2 app
   built by `@embroider/vite`. Full write-up, including the eslint/async-Babel knock-on and the
   `--skip-cleanup` footgun, is in **PORTING-NOTES.md → "The ember-try matrix, and why 5 of 7
   scenarios failed"**.

The matrix is now `ember-lts-6.4`, `ember-lts-6.8`, `ember-release`, `ember-beta`, `ember-canary` —
verified locally with `ember try:each` across ember-source **6.4 → 7.3-canary**, all 5 passing.

Standing caution if you touch `src/rendering/` for lint reasons: that code is ported near-verbatim
from source and sits on the paint path, so prefer a targeted disable with a comment explaining the
port-fidelity reason over a rewrite that changes allocation behaviour in a draw loop.

(An earlier revision of this file warned specifically about `unicorn/no-for-loop`. **That rule is not
configured in this repo** — `eslint-plugin-unicorn` is not a dependency and the Ember plugin does not
bring it in. The count came from misreading eslint's "Definition for rule was not found" messages as
violations.)

### 5.2 Browser-confirmed demo fixes — DONE (2026-08-09)

- Column reorder keeps the displayed values correct after refresh and edits.
- The moved column remains selected instead of leaving the highlight on the column that replaced it.
- Column resizing works for headers and sub-headers, with a visible resize cursor/indicator.
- The full-grid demo visibly exercises alternating vertical borders, wrapped text, and the Notes
  column's Markdown editor.
- Edit-on-type keeps the full typed value in the Notes column instead of stopping after the first
  character.

### 5.3 First npm publish

- Addon version is still `0.0.0` — pick a real first version.
- One-time npm Trusted Publisher setup on npmjs.com: org `ultish`, repo `glide-data-grid-ember`,
  workflow filename `release.yml`. **Full checklist is in that file's header comment.**
- Publishing uses OIDC — no `NPM_TOKEN`, no OTP in CI.

---

## 6. Docs to keep in sync

There is **exactly one** consumer guide, and it is not a markdown file. `DATA.md` and `THEMING.md`
were deleted on 2026-08-09; their content lives in the test-app as two tabs:

- **Guide** (`test-app/app/utils/guide/`) — narrative, read in order, one running example.
- **Cookbook** (`test-app/app/utils/cookbook/`) — task-indexed recipes, jumped into.

Both are **one chapter per file**, ordered by that directory's `index.ts`, rendered by
`test-app/app/components/docs-page.gts`. Chapter titles carry **no leading number** — the page numbers
them from position, so inserting a chapter is a one-line edit to `index.ts`.

Content is **plain data** (`Section`/`Block` in `cookbook/types.ts`), not markup, because code samples
containing `{{ }}` would otherwise be parsed as Glimmer.

**Rules:** exactly one copy of everything — the cookbook links *into* the guide rather than restating
it. Every code sample uses **class-field arrows, never `@action`** (Ember 6+, and an arrow field is
also identity-stable, which is what rule 1 wants). The workspace-root `README.md` is the file to edit;
the addon's copy is a build artifact rollup overwrites.

**Standing lesson: consumer docs rot in exactly one direction.** Features get added and the "not
implemented yet" lists never get revisited. Migrating `THEMING.md` found two stale claims of that
shape and no other kind of drift. **When you implement something, grep the docs for its name before
closing the item.** The same applies to backlogs — two items in this list's predecessor were found
already fixed. **Verify an item against the code before scheduling work on it.**

---

## 6b. Verified 2026-08-09 — the faked-Apollo demo

Browser-checked on a clean build, so this needs no re-verification:

- **`200 of 200` vs `1 of 200`.** The grid fed the raw Apollo result array re-projects every row on a
  one-field cache write; the grid fed reconciled tracked view models re-projects one. The guide's
  claim about `recordsSource` keying on array identity is now an observed number, not an assertion.
- **A concern about `setInterval` was raised and is unfounded.** The subscription's tracked writes
  originate outside Ember's event dispatcher, unlike every other demo here (whose writes come from
  click handlers), so there was reason to think they might land before render and need
  `schedule("afterRender", …)`. They do not. **The decisive test, worth reusing:** load the page
  fresh, confirm the counters are *absent*, then run **only** the subscription and confirm they
  appear. Reading the same numbers before and after a subscription proves nothing, because a
  per-tick counter left over from a click reads identically to one that never updated.

---

## 7. Where the deep history lives, if you need it

- **`PHASES.md`** — phase-by-phase plan and status, the full 9a–9r backlog with original reasoning,
  and the "how to resume cold" instructions.
- **`PORTING-NOTES.md`** — architecture facts, per-phase implementation records with source
  citations, settled build-config issues, and the recurring-bug-class section at the top (worth
  reading before porting any new cell type).
- **`TBD.md`** — the 2026-08-09 Storybook audit: 111 stories from source's 89 `*.stories.tsx` files,
  88 feature-facing, each classified. Sections 4.3–4.5 above are its N3–N14 condensed; the full
  entries have more source detail.
