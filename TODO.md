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
GitHub Pages. 941 vitest tests pass. Phases 0–11 are done; what is left is the backlog below.

**Published vs unpublished.** **v0.5.0 is on npm** (tagged 2026-08-14), and everything below marked
DONE ships in it. **Nothing is currently unreleased.** §5.3 has the release procedure for next time.

**The `experimental` bag is now fully closed, and so is row grouping (§4.1, 2026-08-13).** The only
substantial parity item left is **span/merged-cell selection (§4.6)**, which is blocked on span
*rendering* existing first — no cell type in this port sets `GridCell.span`, so building it now would
add a feature no demo can switch on, which rule 5 says is unverified code by construction.

**There is no other outstanding work in this file.** §3.1 was decided on 2026-08-13 (smooth scrolling
stays, documented). Everything else below is marked DONE and is kept for its source citations.

### Commands

```bash
pnpm --filter glide-data-grid-ember test            # vitest, bare Node, ~800ms. 941 tests.
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

### 3.1 The port always smooth-scrolls; source defaults to snap-to-cell — DECIDED (2026-08-13)

**Decision: smooth stays the default, and is now documented as a stated divergence** in the cookbook's
*Performance rules* chapter. No code change. If a consumer ever asks for snap, the branch to port is
`scrolling-data-grid.tsx:145-175` and the natural shape is `@smoothScrollX`/`@smoothScrollY` keeping
`true` as this port's default.

The original entry is kept below for the source citations.

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

## 3b. Scroll perf: there is NO regression since 0.1.7 — MEASURED AND CLOSED (2026-08-13)

Reported: the full grid demo scrolls choppily, `Scroll to row 50` is choppy, the glide demo feels
slightly slower. Investigated by instrumenting `drawGrid`, `runDraw`, `resolveArgs` and
`computeCanBlit` **identically** on a `v0.1.7` worktree and on `main`, same machine, same workload.

### The answer: the draw path did not regress

300 draws per version, same synthetic scroll, same demo:

| per-draw | v0.1.7 | main |
|---|---|---|
| median | 0.2 ms | 0.2 ms |
| p90 | 6.2 ms | 6.0 ms |
| p99 | 8.5 ms | 7.9 ms |
| mean | 1.469 ms | 1.445 ms |
| wall (300 draws) | 444.0 ms | 439.7 ms |
| blit breakers | none | none |

`main` is marginally **faster**. **Do not bisect `v0.1.7..HEAD` for a draw regression — there isn't
one.** An earlier revision of this section claimed 1.5–1.7×; that came from two-sample runs and was
noise. A third run had already contradicted it. Lesson worth keeping: at these magnitudes
(sub-millisecond, bimodal) anything under ~10 samples per version is meaningless.

### Ruled out, with numbers — do not re-investigate

- **The blit fast path is intact in both versions.** 300/300 `computeCanBlit` calls passed every one
  of its ~18 identity checks. Rule 1 is *not* what is happening, which is worth stating because it is
  the reflexive first guess on this project.
- **The demo's debug/status row is not the cause** (this was the specific thing asked). It produced
  **one** DOM mutation for an entire scroll gesture — `@onVisibleRegionChanged` defers to a microtask
  and Ember coalesces the tracked write, so it is not per-frame work.
- **Work outside `drawGrid` is negligible**: `runDraw` minus `drawGrid` was 3% of total.
  `resolveArgs` ~0.2ms/draw.
- **No long tasks** (>50ms) in either version.

### What actually costs, and it is inherent rather than new

The per-draw distribution is **bimodal**: median 0.2ms, p90 6ms. The cheap draws are pure blits; the
6ms ones are the frames where a **new row scrolls into view** and its cells are drawn for real. The
full demo's row is expensive — sparkline, image, two bubble columns, stars — and `devicePixelRatio`
is 2, so every fill is 4x the pixels.

That is the whole story of the choppiness: cross 2–3 new rows in one frame and you spend 12–18ms
drawing, which blows the 16.7ms budget. It behaves identically on 0.1.7. It also explains why the
**glide demo feels better** (plainer cells) and why `Scroll to row 50` feels choppy (a large jump
crosses many new rows at once).

**Confirmed by measurement: cost tracks the number of visible *heavy* cells, and nothing else.** Same
grid, same 300-draw benchmark, only the window width changed:

| | 11 cols visible (1712px) | 4 cols visible (604px) |
|---|---|---|
| p90 | 4.8 ms | **0.2 ms** |
| p99 | 6.7 ms | 0.8 ms |
| mean | 1.178 ms | 0.137 ms |
| wall, 300 draws | 360.6 ms | 45.5 ms |

**p90 fell 24x.** Caveat: the narrow window also cut visible rows 16 -> 4, so that is a ~16x cell
reduction, not a pure column test — but the direction and magnitude are unambiguous, and the columns
that dropped out were `Photo`, `Skills`, `Projects`, `Trend` and `Rating`, i.e. *all four expensive
cell types* (image, two bubble columns, sparkline, stars). The four that remained are text, number,
checkbox and uri, and they are essentially free.

**So the levers are cell-draw cost, not the scroll machinery:** cheaper renderers for those columns,
fewer of them on screen at once, and the row/column buffer cache that source lists but neither project
implements (see the "Future optimization opportunities" comment at the top of
`rendering/render/data-grid-render.ts`).

**On `<DemoGrid>` specifically:** it is slow because Phase 10 made it show every cell type at once,
which is its job. Rule 5 protects the *coverage of cell types*, not the number of columns on screen
simultaneously — so putting the media columns behind a toggle (or narrowing them) would cost no
coverage and is the obvious cheap fix if the demo's own feel matters. The header menu already has
per-column hide (4.5b), so this is testable interactively before changing anything.

**Chrome scroll-time DPR capping — DONE (2026-08-14), as `@enableChromeRescaling`.** Previously this
section recorded that Chromium got no scroll-time downscale at all: `<DemoGrid>` set
`@enableFirefoxRescaling` and `@enableSafariRescaling` to `true`, but `resolveArgs` `&&`s each
against `browserIsFirefox` / `browserIsSafari`, so on Chrome `rescaleWhileScrolling` stayed
`undefined` and the canvas painted at full dpr throughout every scroll.

**A deliberate divergence from upstream**, which offers the hack for those two browsers only, taken
because the reason for it — fill cost scaling with `devicePixelRatio` — is not browser specific. Caps
at **1x, not Safari's 2x**: at the common dpr of 2, `min(2, ceil(2))` is still 2, so a 2x cap would
be an arg that cannot do anything on the displays it was added for. New `browserIsChromium` predicate
matches the Chromium family (Edge, Brave, Opera, Arc), not Chrome alone.

Browser-verified on Chrome at dpr 2: canvas backing store is 3424px for 1712 CSS px at rest (2x) and
**1712 for 1712 while scrolling (1x)**.

### Harness note for whoever measures next

**You cannot measure scroll perf from the agent browser harness naively.** Chrome suspends
`requestAnimationFrame` and zeroes the canvas whenever the tab is backgrounded, and the `computer`
tool only foregrounds it for the duration of a discrete action; `setTimeout` fallbacks get throttled
to 1/s. `drawGrid` early-returns on a 0x0 canvas, so a backgrounded run silently reports zero draws
(or 300 draws of 0.00ms, which is the tell).

What works: arm a benchmark that listens for a real `scroll` event, then trigger it with one
`computer` scroll. The handler runs while the tab is foreground and drives N draws **synchronously**
by assigning `scrollTop` and dispatching synthetic `scroll` events — the controller's `onScroll` is
synchronous, so this produces real, blit-eligible draws with no rAF involved. Remove the listener
before driving, or the synthetic events re-enter it. Note the harness's scroll emits **no `wheel`
event**, only a coalesced `scroll`, so do not hook `wheel`.

## 4. Substantial parity gaps

### 4.1 Row grouping — DONE (2026-08-13)

Shipped as `<GlideDataGrid @rowGrouping={{...}}>`, with `rowGroupingApi` / `mapRowIndexToPath` /
`updateRowGroupingByPath` / `getRowGroupingForPath` as the consumer's half. Pure logic in
`src/rendering/row-grouping.ts` (38 tests); `<DemoGrid>`'s "Row groups" toggle cycles
off / normal / skip / block. Full write-up in **PORTING-NOTES.md → "4.1 — row grouping"**.

**The feared interaction did not materialise, and it is worth knowing why.** Row grouping is four
transforms applied to args the grid already had (`rows`, `rowHeight`, `getRowThemeOverride`, the
row-marker number), so it lands entirely in `resolveArgs` and nothing below it — including every
`src/data-source/` decorator — learns that grouping exists. **The grid does not draw group headers**;
the consumer does, via `mapper(row)`. That is source's design too.

Three things a future session should know:

- **One repair to source**, demonstrated by running source's own code: `flattenRowGroups` computes
  `rowIndex` across hidden groups, so collapsing a group *that has subgroups* makes every group header
  below it lose `options.height`. This port assigns it over the visible groups only. `contentIndex`
  keeps source's behaviour, which is deliberate there.
- **Known upstream quirk, reproduced on purpose:** `goToFirstRow` (Ctrl+Home) is inert under
  `navigationBehavior` `skip`, `skip-up` or `block` — the skip sees the `MIN_SAFE_INTEGER` sentinel,
  reads it as an upward move and restores the start row. Fixing it means inventing a direction rule
  upstream does not have. Revisit only if someone actually hits it.
- **A group at `headerIndex: 0` displaces original row 0** — the header occupies that slot, as
  upstream. Source's own story starts its groups at 10 for this reason.

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

### 5.3 npm publish — DONE (0.1.7, 0.2.0, 0.2.1, 0.3.0, 0.4.0, 0.5.0 — latest 2026-08-14)

- Current version is `0.5.0`, tagged `v0.5.0`.
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
