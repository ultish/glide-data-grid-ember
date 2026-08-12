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

**State as of 2026-08-13:** everything is on **`main`**, which is pushed, green in CI, and deployed to
GitHub Pages. 903 vitest tests pass. Phases 0–11 are done; what is left is the backlog below.

**Published vs unpublished.** **v0.2.1 is on npm** (tagged and pushed 2026-08-13) and contains
everything through 4.6's controlled selection: 4.2 (`@getGroupDetails`, `@onGroupHeaderRenamed`),
4.3 (`<:rightElement>` + the two paddings), every §4.5 row, and `@selection` /
`@onSelectionCleared`. **Unreleased since that tag:** §4.4 (external HTML5 drag-and-drop) and §4.6 (`@keybindings`, the nav
variants, the `onSelect` hook) plus §4.5b. §5.3 has the release procedure.

**The `experimental` bag is now fully closed.** With 4.3, 4.4, 4.5, 4.5b and all of 4.6 except
span selection done, the only substantial parity items left are **row grouping (§4.1)** and
**span/merged-cell selection (§4.6)** — and the latter is blocked on span *rendering* existing first.

### Commands

```bash
pnpm --filter glide-data-grid-ember test            # vitest, bare Node, ~800ms. 903 tests.
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
- **After navigating, take a screenshot before any measurement.** The tab is `visibilityState:
  "hidden"` until the `computer` tool touches it, so the canvas is 0x0 and every hit test is
  out-of-bounds — the status row reads `Visible: cols 0--1, rows 0--1`, which is the tell. This is
  the occlusion trap above, and it re-fires on **every** navigation, not just at session start.
- **`computer`-tool coordinates are screenshot pixels, not CSS pixels** (1512 vs 1712 here), and the
  demo's status row rewraps as its own text changes, moving the grid ~24px mid-test. Together they
  produced a convincing false "group-header clicks are broken" reading during 4.2. For anything
  finer than "click that button", dispatch `MouseEvent`s at canvas-relative coordinates from
  `javascript_tool`, `await` ~150ms for Ember to render, then read the DOM readout.
- **Synthetic events cannot verify an *edit*.** Dispatched `paste` and `keydown` reach the
  controller (a `@onPaste` callback fires with correct coordinates, `copy` returns the right cell),
  but no write lands — confirmed **identical on untouched `main`**, so it is a harness artifact, not
  a regression. Do not chase it mid-item; verify write paths through the UI. `navigator.clipboard`
  is not the way round it: `writeText` hangs the renderer for 45s exactly as CLAUDE.md warns.

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

### 4.2 `getGroupDetails` — group header icons, themes, actions — DONE (2026-08-12)

Shipped as `<GlideDataGrid @getGroupDetails={{fn}}>`: display name, `icon`, `overrideTheme`, and
`actions` (hover-revealed icon buttons with their own hit targets, which report themselves and
suppress both `@onGroupHeaderClicked` and the group-column selection). `withCollapsingGroups` now
returns one too, closing its "no collapsed-group header tint" gap. Browser-verified; 11 new tests.
Full write-up, including the source y-comparison quirk that is reproduced on purpose, in
**PORTING-NOTES.md → "4.2 — `@getGroupDetails`"**.

**`onGroupHeaderRenamed` landed 2026-08-12**, built on that `actions` support exactly as source is:
the callback's presence injects a "Rename" entry (appended *after* the consumer's own actions), and
that opens a small inline text box over the group's band. Browser-verified through all five paths —
open, Escape, Enter, click-outside, and toggling the callback off. **Stated divergence:** the
callback receives the group **key**, not the display name source passes; see PORTING-NOTES.md →
"4.2 — `@onGroupHeaderRenamed`". 7 new tests.

### 4.3 `rightElement` / `rightElementProps` — DONE (2026-08-12)

Shipped as the **`<:rightElement>` named block**, with `@rightElementSticky`, `@rightElementFill`,
`@paddingRight` and `@paddingBottom` — which closes source's `experimental` bag entirely. The block
renders into a detached node via `{{in-element}}` and the controller places that node in the
scroller; the reason it cannot simply be markup is that Glimmer removes a node it rendered through
the parent it recorded at insertion, so reparenting turns teardown into a `NotFoundError`. Full
write-up, including the template-comment truncation trap that cost an hour, in **PORTING-NOTES.md →
"4.3 — `<:rightElement>`"**.

### 4.4 External HTML5 drag-and-drop — DONE (2026-08-13)

Shipped as `@isDraggable` (`true | "cell" | "header"`), `@onDragStart`, `@onDragOverCell`,
`@onDragLeave` and `@onDrop`. Both of source's halves are ported — `data-grid.tsx:1457-1674`'s
listeners and default drag image, and `data-editor.tsx:2683-2705`'s row-marker refusal plus the
`isActivelyDragging` flag that stops rect-selection running underneath a drag. The two guards live
in `rendering/external-drag.ts` (11 tests), where `isDraggable: "header"` deliberately does **not**
match the group-header band, as upstream. Browser-verified in both directions; full write-up,
including the two harness traps it re-earned and the one-line `updateCells` gap it exposed in
`<DemoGrid>`, in **PORTING-NOTES.md → "4.4 — external HTML5 drag-and-drop"**. New cookbook chapter:
*Dragging data in and out*.

### 4.5 Smaller N-items from the Storybook audit

| Item | Size | Where |
|---|---|---|
| **Scroll shadows** | DONE (2026-08-12) | `@fixedShadowX` / `@fixedShadowY`, both defaulting **true** as upstream. Two `pointer-events: none` divs in `.dvn-underlay` with an inset `box-shadow`, opacity driven from `updateScrollShadows` — **not** canvas drawing, because an opacity that tracks the scroll offset would invalidate the blit fast path every frame. Source builds them as divs for the same reason. |
| **`overscrollX`/`overscrollY`** | DONE (2026-08-12) | Added to the scroll extent in `rebuildScrollContent`, and to `remAdjustDimensions` so `@scaleToRem` scales them as source does (that file had carried a "add them here when they land" note since 9g). |
| **`preventDiagonalScrolling`** | WON'T PORT | Read the guard, not the prop: source only applies the axis lock when `hasTouches` is true (`infinite-scroller.tsx:215-225`). With touch deferred (9c) `hasTouches` is permanently false here, so porting it would add an arg that can never do anything. Revisit only if 9c is ever picked up. |
| **`onPaste` prop** | DONE (2026-08-12) | Shipped as `<GlideDataGrid @onPaste>`: `false` refuses every paste, a callback gets the target in consumer space plus the clipboard as raw strings and must return `true`. The rule is `shouldAcceptPaste` in `rendering/copy-paste.ts` (5 tests); `<DemoGrid>`'s "Paste:" toggle cycles allow / single-cell / off. **Stated divergence:** source treats an absent `onPaste` as "write the whole clipboard into the one target cell"; this port keeps its long-standing range paste, i.e. `undefined` behaves as `true`. |
| **`experimental` bag, rest** | PARTLY DONE (2026-08-12) | Flattened into real args rather than an `experimental` bag, following 2.5's precedent with `hyperWrapping`. **Done:** `@disableMinimumCellWidth`, `@renderStrategy`, `@enableFirefoxRescaling` / `@enableSafariRescaling` (the scroll-time DPR cap, 200ms settle). **Won't port:** `scrollbarWidthOverride` (its only use upstream is the `idealWidth`/`idealHeight` sizing helper this port does not have — the port measures the live element for its one scrollbar hit-test), `kineticScrollPerfHack` (touch, 9c), `isSubGrid` (a className for source's click-outside library), `disableAccessibilityTree` (9b). **`strict` and `eventTarget` landed 2026-08-12** (rows below), which leaves only `paddingRight`/`paddingBottom`, deferred into 4.3. |
| **`experimental.strict`** | DONE (2026-08-12) | Shipped as `@strictVisibleRegion`. The rule is `isOutsideStrictRegion` (`rendering/strict-region.ts`, 8 tests) — source's inclusive bounds reproduced, with its two escape hatches (the selected cell, and the frozen columns the reported region deliberately excludes). The controller now tracks its visible region on **every** draw whether or not `@onVisibleRegionChanged` is wired, and does so **before** the draw rather than after: computed after, a strict grid's first frame would consult a region that did not exist yet and paint all-Loading with nothing scheduled to fix it. **Narrower than source on purpose:** the check sits in the mangled cell-content closure, and this port's copy/search/auto-size sweeps read `getCellContent` directly, so they are unaffected — turning it on cannot break a copy of an off-screen range. |
| **`experimental.eventTarget`** | DONE (2026-08-12) | Shipped as `@eventTarget`. Redirects the three **pointer** listeners that must outlive the grid's bounds: drag-end `mouseup`, 9h's window `mousemove`, and the overlay editor's outside-click `mousedown`. **Clipboard stays on `window`** — source keeps `copy`/`cut`/`paste` on `safeWindow` too (`data-editor.tsx:3767,3877,3908`), because a clipboard event is dispatched at the focused document regardless of where the grid sits; an earlier revision of this row said otherwise. Unset, the target is resolved from `root.getRootNode()` as source does, so **a grid inside a shadow root works without the arg** (which also retires most of the "Shadow DOM" row below). Read once, at setup: source re-binds on change only as a side effect of React re-running `useEventListener`, so that is not treated as contract. |
| **`experimental.paddingRight`/`paddingBottom`** | DONE (2026-08-12) | Landed with 4.3 as `@paddingRight`/`@paddingBottom`. Added to the scroller's extent and subtracted from the width **and** height the visible region is measured against. `paddingRight` is a *gutter beside* the right panel, not a stand-in for its width — source applies it twice, as the panel's `margin-right` and as a sticky panel's inset from the edge. Not `scaleToRem`-scaled, matching source, which scales the overscrolls but not these. |
| **Shadow DOM** | DONE (2026-08-13) | Checked in a browser at last, via the new **Shadow DOM** tab (`<ShadowDomDemo>`, `{{in-element}}` into an open shadow root): `getRootNode() === shadowRoot`, both canvases inside it, correct hit-testing on click, and arrow-key nav working — so pointer listeners, focus and measurement are all fine. **The one real finding is styles:** the addon's stylesheets land in the *document* head, which a shadow boundary blocks, so a grid in a shadow root renders unstyled until the consumer adopts them. That is not fixable from inside the addon. See PORTING-NOTES.md. |

### 4.5b `<DemoGrid>`'s header menu offers nothing — DONE (2026-08-13)

The menu now names its column and carries auto-size (`api.remeasureColumns`) and hide/show-hidden —
both grid concerns, so the deliberate split stands: sorting stays in `<GlideDemo>` because it is a
data-source decorator. Hiding is just removing the column from the array, since cell content is
looked up by column `id` rather than position.

### 4.6 Interaction gaps (formerly 9h)

- **Controlled-selection mode** — DONE (2026-08-12). `@selection` + `@onSelectionCleared`. The
  presence of `@selection` alone decides ownership, where source splits it across `gridSelection`
  (reads) and `onGridSelectionChange` (writes); both of source's *useful* configurations are still
  reachable. `onSelectionCleared` is deliberately as narrow as upstream's — the out-of-bounds click
  only. **`previousSelection` was already ported** (the mouse-down state, `grid-host-controller.ts`
  around `:1382`); this list was wrong about it. See PORTING-NOTES.md → "4.6 — controlled selection".
- **Keybinding remapping** — DONE (2026-08-13). `@keybindings`, built on ports of source's
  `is-hotkey.ts` and `data-editor-keybindings.ts` into `rendering/` (16 tests). Same string syntax as
  upstream, so a React `keybindings` map transfers unchanged. **`search` defaults to on here and off
  upstream** — this port has had Cmd/Ctrl+F since 9e. `downFill`/`rightFill` and `acceptOverlay*` are
  deliberately absent (nothing to bind them to); see the module header.
- **Nav variants** — DONE (2026-08-13), as map entries rather than new branches: Tab/shift+Tab,
  alt+Arrow free move, primary+shift jump-to-edge, space-bar row/column select — plus PageUp/PageDown,
  primary+Enter and **Escape to clear**, which were missing too. `adjustSelection` gained source's
  `±2` cases; `moveActiveCell` gained `freeMove`.
- **`onSelect` renderer hook** — DONE (2026-08-13). Wired at source's own spot in the mousedown
  selection path; `preventDefault()` refuses the selection change. Demoed by `<DemoGrid>`'s "Select
  hook" toggle. **Trap worth knowing:** swap a renderer by *identity*, not by `kind` — every
  `CustomRenderer` carries `kind: GridCellKind.Custom`.
- **Span/merged-cell selection** — `L`. **Still open, deliberately.** `expandSelection`,
  `spanRangeBehavior`. No cell type in this port sets `GridCell.span`, so implementing it would add a
  feature no demo can switch on — rule 5 says that is unverified code by construction. Do the span
  *rendering* first, or leave it. The `expand` flag is already carried unused through
  `SetCurrentResult`.

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

### 5.3 npm publish — DONE (0.1.7 on 2026-08-09, 0.2.0 on 2026-08-12)

- Current version is `0.2.0`, tagged `v0.2.0`. Everything from 4.2 and §4.5 ships in it.
- One-time npm Trusted Publisher setup on npmjs.com: org `ultish`, repo `glide-data-grid-ember`,
  workflow filename `release.yml`. **Full checklist is in that file's header comment.**
- Publishing uses OIDC — no `NPM_TOKEN`, no OTP in CI.
- **The release procedure** is: bump `glide-data-grid-ember/package.json`, add the CHANGELOG entry
  and its link line, commit, then `git tag vX.Y.Z && git push origin main vX.Y.Z`. Pushing the tag is
  what publishes; pushing `main` alone does not.

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
also identity-stable, which is what rule 1 wants). The workspace-root `README.md` **and
`CHANGELOG.md`** are the files to edit; the addon's copies of *both* are build artifacts —
`rollup.config.mjs:74-78` copies them in, and neither addon copy is tracked by git. Editing
`glide-data-grid-ember/CHANGELOG.md` looks like it works right up until the next `pnpm build` silently
reverts it, and `git status` will not warn you because the file is untracked.

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
