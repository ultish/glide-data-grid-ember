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

**State as of 2026-08-15:** everything is on **`main`**, which is pushed, green in CI, and deployed to
GitHub Pages. 954 vitest tests pass. Phases 0–11 are done; what is left is the backlog below.

**Published vs unpublished.** **v0.5.1 is on npm** (tagged 2026-08-15) — the three §4b fixes
(`indicatorIcon` auto-sizing, Escape on a read-only overlay, `tags-cell`'s dropped toggles) all ship
in it. **Nothing is currently unreleased.** §5.3 has the release procedure for next time.

**The `experimental` bag is now fully closed, and so is row grouping (§4.1, 2026-08-13).** The only
substantial parity item left is **span/merged-cell selection (§4.6)**, which is blocked on span
*rendering* existing first — no cell type in this port sets `GridCell.span`, so building it now would
add a feature no demo can switch on, which rule 5 says is unverified code by construction.

**The other outstanding work is §4b — upstream bug parity (added 2026-08-14).** All 10 open
`type:bug` issues and all 37 open PRs upstream were audited against this tree: six bugs are
inherited, three are worth doing. **Both P1 items are DONE**, shipped in v0.5.1 (#954, #910). What is
left there is **§4b.2's P2 items, none of which should be scheduled before being reproduced in a
browser** — start with P2.1 (Firefox scrollbar click-through), the only one whose consequence is a
data mutation. §4b.4 lists what was checked and dismissed, so it does not get re-audited. §4b.5 is
done (2026-08-15); it left **§4b.7** behind, a wrong column space in the two header-glyph
callbacks that was already producing a wrong-column header menu in `<DemoGrid>` at default
settings.

**Everything else below is marked DONE** and is kept for its source citations. §3.1 was decided on
2026-08-13 (smooth scrolling stays, documented).

### Commands

```bash
pnpm --filter glide-data-grid-ember test            # vitest, bare Node, ~800ms. 954 tests.
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
   made consistent on 2026-08-09 and browser-verified, **with two exceptions found on 2026-08-15**:
   `@onHeaderMenuClick` and `@onHeaderIndicatorClick` still report mangled indices (§4b.7). Take that
   as the warning it is — the sweep that made this rule true missed two callbacks, and the miss was
   producing wrong-column behaviour in `<DemoGrid>` at default settings the whole time.
   Internally, `-private/selection-space.ts`
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

- **`glide-data-grid-ember/src/-private/grid-host-controller.ts` is ~7,500 lines and nearly every
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

**Every item in this section is DONE**, as are §4b's two P1 items and §4b.5. The nearest thing to a
quick win left is **§4b.7** — the two header-glyph callbacks report the row-marker-mangled column
index instead of the consumer's. One subtraction in the addon, but a breaking change to a published
API, so read the item before starting.

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

## 4b. Upstream bug parity — prioritized (audited 2026-08-14)

All 10 open `type:bug` issues and all 37 open PRs on `glideapps/glide-data-grid` were checked against
this tree. **Six bugs are inherited; three are worth doing.** Ordered by (certainty of diagnosis ×
consequence) ÷ risk, not by upstream issue number.

Verdicts below come from **code inspection against the local source checkout, not browser repro.**
That distinction is the whole reason for the P1/P2 split: P1 items are provable from the source text
alone, P2 items have a confirmed-identical code path but an unconfirmed symptom *here*. Rule 5's
corollary applies — do not schedule a P2 fix before reproducing it, because a bug you cannot
reproduce is a fix you cannot verify.

| # | Item | Effort | Why this rank |
|---|------|--------|---------------|
| ~~**P1.1**~~ | [#954](https://github.com/glideapps/glide-data-grid/issues/954) auto-size ignores `indicatorIcon` | S | **DONE 2026-08-14** — fixed, 4 tests, browser-verified |
| ~~**P1.2**~~ | [#910](https://github.com/glideapps/glide-data-grid/issues/910) Escape cannot close a read-only overlay | M | **DONE 2026-08-14** — both halves, 4 tests, browser-verified three ways |
| **P2.1** | [#1034](https://github.com/glideapps/glide-data-grid/issues/1034) Firefox scrollbar click-through | M | Only inherited bug whose consequence is a **mutation**, not a paint artifact |
| **P2.2** | [#998](https://github.com/glideapps/glide-data-grid/issues/998) column `bgCell` misses the blank strip | M | Visual; likely cause already located |
| **P2.3** | [#989](https://github.com/glideapps/glide-data-grid/issues/989) Safari frozen-column flicker | L | Visual, Safari-only, and the fix lives in the blit path — high risk, low reward |
| **P2.4** | [#983](https://github.com/glideapps/glide-data-grid/issues/983) Safari emoji header color | S | Cosmetic, narrow trigger, upstream thinks it is a WebKit bug |
| **P3** | [PR #1193](https://github.com/glideapps/glide-data-grid/pull/1193) frozen trailing band | — | Gated: unreachable until `trailingRowOptions.sticky` exists |
| **P3** | Scroll ceiling past 33.5M px | — | Not a bug report; an untested limit. Decide, don't fix |
| **P3** | [#791](https://github.com/glideapps/glide-data-grid/issues/791) `scrollOffsetX/Y` re-apply | — | A **decision**, not a defect. Do not "fix" blind |

**No action, settled:** [#740](https://github.com/glideapps/glide-data-grid/issues/740),
[#773](https://github.com/glideapps/glide-data-grid/issues/773),
[PR #1197](https://github.com/glideapps/glide-data-grid/pull/1197),
[PR #1199](https://github.com/glideapps/glide-data-grid/pull/1199) — reasons in §4b.4.

**§4b.5 and §4b.6 aren't from the audit above** — they're what fixing P1.1/P1.2 turned up along the
way (an unported arg) and what a follow-up sweep of this port's own code for the same *shape* of
miss (a local fix whose comment names a general rule, never checked against sibling code) turned up
(a second stale-`p.value` bug). Both DONE, both shipped in v0.5.1.

### 4b.1 P1 — both DONE (2026-08-14)

**P1.1 — `#954`: auto-size ignores `indicatorIcon` — DONE (2026-08-14).**
`rendering/column-sizer.ts` measured the header as title + padding + an `icon` allowance only, a
transliteration of upstream's `use-column-sizer.ts:67`, while `computeHeaderLayout`
(`data-grid-render.header.ts:369-383`) lays the indicator out *after* the title and takes that space
back. Fixed by extracting `headerAffordanceWidth`, which now also allows
`theme.headerIconSize + theme.cellHorizontalPadding` for `indicatorIcon`.

Three decisions worth not re-litigating, all argued in that function's doc comment:

- **The `icon` allowance stays at upstream's magic `28`.** The real layout cost is
  `ceil(headerIconSize * 1.3)` = 24 at the default 18, so the constant is slack rather than a
  shortfall. Re-deriving it would silently re-size every icon-bearing column with no defect behind
  it.
- **The indicator allowance *is* derived**, because `headerIconSize` is a theme field a consumer can
  raise, and a constant would under-allow exactly for the consumers who raised it.
- **`hasMenu` adds nothing, deliberately.** The menu button overlays the title and fades it
  (`data-grid-render.header.ts:474-493`) rather than being laid out beside it. Counting it would
  widen every menu-bearing column by 30px. There is a test pinning this to `0` so a future reader
  does not "fix" it.

**Verified three ways**, because the unit tests alone would not have caught a wrong *sign* of the
problem: 4 new tests in `column-sizer.test.ts` (945 total, and the 3 behavioural ones were confirmed
to fail against the pre-fix expression); `<DemoGrid>` now sets `indicatorIcon` on columns 1, 3 and 13
via `INDICATOR_ICONS` — **nothing in this repo had ever set one**, the exact rule-5 shape; and a
before/after browser check where "Auto-size" on those columns renders the indicator **clipped to a
2px sliver at the column edge without the fix** and fully with it.

**P1.2 — `#910`: Escape cannot close a read-only overlay — DONE (2026-08-14).** A read-only
editor was built on a `disabled` textarea (`growing-entry.ts`, mirroring `text-cell.tsx:45`).
A disabled element cannot hold focus, so clicking inside one moved focus to `<body>` and the
keystroke then reached **nobody**: the overlay's `keydown` listener is on the container
(`grid-host-controller.ts:5841`) and needs focus inside it, while `onKeyDown` (`:6196`)
deliberately early-returns while an overlay is open. The user was stranded in an editor with no
keyboard way out.

**Fixed in both halves of [PR #915](https://github.com/glideapps/glide-data-grid/pull/915), because
they cover different editors** — its diff was not ported (it is built on source's React portal and a
styled-components file that do not exist here), only its two ideas:

- **(a) `readOnly` instead of `disabled`** in `GrowingEntry`, whose option is renamed `disabled` →
  `readOnly` accordingly (9 call sites). Keeps the element focusable, and as a bonus makes a
  read-only cell's text selectable and copyable — previously impossible.
- **(b) The overlay container is focusable** (`tabIndex = -1`, so it is a backstop and never a tab
  stop) and `focusOverlay` redirects focus to it when the editor could not take it. **This is the
  half that generalises**: (a) only helps editors with a native text control to put it on, while
  this covers `dropdown-cell`'s `<select disabled>`, `range-cell`'s `<input disabled>`,
  `links-cell`'s inputs, and any consumer-written editor — none of which `readOnly` can fix, since
  `readonly` is not a valid attribute on `<select>` or `<input type=range>`.

The decision itself is `rendering/overlay-focus.ts` (`shouldFocusOverlayContainer`) rather than
inline in the controller, which is the only way it could have tests — the controller cannot be
imported by vitest. It reads the active element from the container's **root node**, not `document`:
for a shadow-hosted grid `document.activeElement` is the shadow *host*, which is outside the
container, so the fallback would fire on every open and steal the caret from editors that focused
themselves correctly.

**Browser-verified three ways, which is what makes the two halves separable rather than a guess:**

| Build | Focus after clicking in a read-only editor | Escape |
|---|---|---|
| Both halves | the editor's own textarea | closes |
| **(b) only** (textarea back to `disabled`) | the overlay container itself | closes |
| **Neither** (upstream's code) | a DIV *outside* the overlay | **stuck open — #910** |

Plus a no-regression pass: an ordinary editable cell still opens, focuses its textarea, accepts
typing and cancels on Escape; and the markdown editor's `gdg-focus-decoy` still holds focus, i.e.
the new fallback correctly declines to steal it.

**Rule 5, again, and it is why this was reachable at all.** The two `readonly` cells in the demo
data (`button-cell`, `tree-view-cell`) both set `allowOverlay: false`, so **no read-only cell in this
repo had ever opened an editor** — the entire read-only editor path was dead. `<DemoGrid>` now has a
`Read-only cells` toggle (Salary + Notes; see `READONLY_COLUMNS` for why those two).

**Worth knowing: this port already had a partial, per-editor answer to #910 and nobody had connected
it.** `markdown-cell.ts:97-104` and `uri-cell.ts` add a hidden `gdg-focus-decoy` textarea in preview
mode for exactly this reason — "gives the overlay host's `handle.focus()` a real focus target so
Escape/Enter/Tab actually receives keystrokes". That is half (b), invented in Phase 4b, applied to
two editors and never generalised. `focusOverlay` is the general form; the decoys are left in place
(they also control *where* focus lands, not just that it lands).

### 4b.2 P2 — reproduce before scheduling

**P2.1 — `#1034`: Firefox clicks pass through the scrollbar.**
`grid-host-controller.ts:4585` computes `scrollbarWidth` as `offsetWidth - clientWidth`, and the
comment beside it says overlay scrollbars give 0 and have "nothing to guard against" — which is
exactly the wrong assumption in Firefox, where an overlay scrollbar expands on hover and still lets
the press reach the content. `isMaybeScrollbar` comes out `false` and the press lands on whatever is
underneath. **Ranked top of P2 because its consequence is a data mutation, not a smudge**: with the
trailing blank row on, the reporter's symptom is that grabbing the scrollbar *appends a row*. Repro
is cheap — Firefox, `<DemoGrid>`, scroll to the bottom, drag the scrollbar thumb.

**P2.2 — `#998`: column `bgCell` override does not fill the blank strip after a horizontal scroll.**
`drawBlanks` (`data-grid-render.lines.ts:11-101`) is a faithful port including the
`drawRegions.some(intersect)` skip at `:66-72`, which is the likely cause: the blank strip right of
the last column is only repainted when a draw region covers it, and the blit path does not always
produce one. Repro needs a column `themeOverride.bgCell`, fewer rows than fit, and a horizontal
scrollbar.

**P2.3 — `#989`: Safari frozen-column flicker on horizontal scroll.** `data-grid-render.blit.ts` is
a faithful 288-line port of upstream's 291, sticky carve-out at `:158-165` included; a Safari
self-`drawImage` artifact, so it should reproduce. **Rank it last of the real bugs anyway** — the
fix would live in the blit path, which rule 1 already marks as the place where changes do damage
with no visible symptom, and the payoff is a Safari-only shimmer.

**P2.4 — `#983`: Safari emoji header titles take the menu-fade gradient's color.**
`data-grid-render.header.ts:474-493` is byte-identical to upstream's `:493-512`. Needs `hasMenu` +
`width > 35` + an emoji in the title, Safari only. Upstream has no fix and the reporter believes it
is a WebKit bug — so the realistic outcome is a documented limitation, not a patch.

### 4b.3 P3 — gated, or a decision rather than a fix

**[PR #1193](https://github.com/glideapps/glide-data-grid/pull/1193) — scrolling rows bleed into the
frozen trailing band.** Real bug, real fix, **unreachable in this port today**: `freezeTrailingRows`
is hardcoded to `0` (`grid-host-controller.ts:3088`). It becomes reachable the moment 9g's deferred
`trailingRowOptions.sticky` lands, since source implements `sticky` by adding 1 to
`freezeTrailingRows` — the same coupling that made it "not the one-line passthrough it looks like"
(`:200-203`). The PR clamps `walkRowsInCol`'s scrollable loop at
`height - getFreezeTrailingHeight(...)` instead of the raw `height`, plus a straddling-row clip in
`drawCells` with a carve-out for sticky spans. Ours is still the pre-PR
`while (y < height && row < rowEnd)` (`data-grid-render.walk.ts:36`), and our `drawCells` has only
the damage-path clamp the PR describes as its counterpart (`data-grid-render.cells.ts:338-340`).
**Fold it into that work, not before it** — and re-read the PR then, because it also moves an
observable (a row-count expectation changes to
`Math.ceil((height - rowHeight - headerHeight) / rowHeight)`).

**The scroll ceiling past `BROWSER_MAX_DIV_HEIGHT`.**
[#705](https://github.com/glideapps/glide-data-grid/issues/705) does *not* apply, because the
mechanism causing it was never ported: upstream's `infinite-scroller.tsx:245-264` maps `scrollTop`
onto a virtual Y with a coarse/fine split (percentage remap for jumps > 2000px, 1:1 delta
otherwise), and its `scroll-to` math then disagrees with that mapping. This port has **no such
mapping** — `syncScrollOffsets` (`:3538-3550`) reads `scrollerEl.scrollTop` straight. But we do
clamp the padder stack to `BROWSER_MAX_DIV_HEIGHT` (`:3460`), so the failure mode here is different
and arguably worse: past ~33.5M px of content (**≈1.08M rows at 31px**) the remaining rows are
simply **unreachable by scrolling** rather than reachable-but-inaccurate. Nothing has ever tested
this port near that row count — `<AsyncDemo>` tops out at 100k rows, two orders of magnitude short.
**Decide what the contract is and document it** (the Performance rules chapter is the place) before
considering the ~250 lines of virtual-Y mapping that would lift it.

**[#791](https://github.com/glideapps/glide-data-grid/issues/791) — `scrollOffsetX/Y` do not
re-apply when the value is unchanged.** Behavioural parity with upstream by different means:
`applyScrollOffsets` (`:2939-2949`) applies once per *change* against a remembered
`lastAppliedScrollOffsetX/Y`; upstream's layout effect is keyed on the same value, so it also does
not re-run. Both are "scroll here once", not a scroll lock. Upstream never confirmed it as a bug (the
maintainer asked for a demo and never got one), and our doc comment at `:2896` states the semantic
deliberately. **This is a decision, not a defect — do not "fix" it without first deciding it is a
divergence.**

### 4b.4 Settled — no action, do not re-audit

- **[#740](https://github.com/glideapps/glide-data-grid/issues/740)** (popups leave the viewport in
  fullscreen) — upstream portals its overlay into a `#portal` node outside the fullscreened element
  and blames `react-laag`. This port appends the overlay directly into `this.root` (`:5607-5609`), so
  it goes fullscreen with the grid. Context menus are consumer-rendered here regardless.
- **[#773](https://github.com/glideapps/glide-data-grid/issues/773)** — an unreproduced consumer
  usage question about custom-cell writes; no library defect was ever identified.
- **[PR #1197](https://github.com/glideapps/glide-data-grid/pull/1197)** (`editOnType` blocked in
  frozen regions) fixes a bug **this port does not have**, because it never ported the mechanism:
  upstream's type-to-overwrite consults `visibleRegionRef` (`data-editor.tsx:3518`), which excludes
  frozen regions by design, so `vr.x > col` rejects any column with `index < freezeColumns`. Our
  equivalent (`grid-host-controller.ts:6364-6379`) has **no visible-region gate at all**.
- **[PR #1199](https://github.com/glideapps/glide-data-grid/pull/1199)** ("feat:版本1") is an
  accidental PR, not a fix: #1197's diff, plus a committed copy of `pr1197.diff` as a file, an
  8,199-line `yarn.lock`, `"private": true` in the root `package.json`, a React-19 `useRef` shim, and
  a story with `{...defaultProps}` and its edit handlers commented out.
- **[PR #1040](https://github.com/glideapps/glide-data-grid/pull/1040)** (merged 2025-06) — **already
  have it.** It fixed `measureColumn` measuring the header title in the *base* font rather than
  `headerFontFull`; `column-sizer.ts:81-86` already measures in `theme.headerFontFull` and saves and
  restores `ctx.font` around it, found independently during 9i ("measuring in whatever font the last
  draw left on the canvas"). This also **settles the open guess in #954's comments** that #1040 might
  have fixed the `indicatorIcon` problem: it did not. Separate bugs on adjacent lines; only the font
  one is fixed anywhere.

### 4b.5 Found while fixing P1.1 — `@onHeaderIndicatorClick` is not ported — DONE (2026-08-15)

Source makes the indicator icon **clickable**: `data-grid.tsx:1057-1065` hit-tests
`indicatorIconBounds` and returns `area: "indicator"`, which `:1241` turns into
`onHeaderIndicatorClick?.(col, bounds)` — the sibling of `onHeaderMenuClick`, which this port does
expose. Here, `indicatorIconBounds` is computed and **only ever drawn**; there is no hit-test and no
arg. `grid-host-controller.ts:4636` already notes the omission ("not requested for 3a"), so this is
a known gap rather than a discovery — but it is now a *reachable* one, since `<DemoGrid>` sets
`indicatorIcon` and a user will try clicking it.

Shipped as **one** hit test rather than two: `hitTestHeaderMenu` became `hitTestHeaderElement` and
returns source's own `{ area: "menu" | "indicator", bounds }`, and the two pending-click fields
mouseup would otherwise have to keep in sync became one `pendingHeaderElementClick`. See
PORTING-NOTES.md's §4b.5 section for that, for the menu/indicator bounds **overlap** on narrow
columns (verify on a wide one), and for the demo bug this turned up.

### 4b.6 Found while sweeping for more instances of the `focus-decoy` pattern — `tags-cell` drops
### earlier checkbox toggles — DONE (2026-08-14)

Not an upstream bug and not part of the §4b audit proper — the user asked for a sweep of this
port's own codebase for other one-off workarounds shaped like the `#910` decoy fix (a narrow local
patch whose comment describes a general defect that was never generalised). The sweep's other
finding was negative and worth recording as such: no other editor still has the pre-`focusOverlay`
focus-decoy pattern (`grep -rn "focus target\|autoFocus\|decoy"` across `rendering/cells/` and
`rendering/extra-cells/` turns up only the two already-known sites). This one was positive.

**The bug.** `tags-cell.ts`'s checkbox editor read `p.value.data.tags` fresh inside every `change`
handler. `p.value` is frozen for the life of the editor (`openOverlay`'s `onChange` only ever writes
`state.currentCell`, never rebuilds the editor-props object) — a fact `links-cell.ts`'s own comment
already states as a general rule ("any stateful editor that re-renders itself needs this same
working copy"). Checking two tags in one session therefore computed the second toggle against the
*original* list, not the first toggle's result: open with `["urgent"]`, check "bug", check
"feature" → commits `["urgent", "feature"]`, "bug" silently dropped. **This is the same defect
class as the `#910` decoy** (a narrow local fix whose comment named the general rule, and a second
site nobody checked against it) — not the same bug, but the same *shape* of miss.

**Confirmed as a genuine porting defect, not a repro of anything upstream has.** Source's editor is
a React component; its `value` prop is `tempValue ?? content` from a `useState` that source's own
overlay host updates via `setTempValue` on every `onChange` (`data-grid-overlay-editor.tsx:78-118`)
— so each checkbox's closure captures a fresh `tags` on every re-render. This port's one-shot
imperative DOM factory has no equivalent; `links-cell`/`date-picker-cell`/`article-cell`/
`markdown-cell`/`uri-cell` all built an explicit working copy for exactly this reason, and
`tags-cell` didn't.

**Fixed** with the same working-copy idiom (`currentTags`, mutated and read locally, never through
`p.value`), plus a second bug fixed alongside it: the checked pill's own colour/selected class was
computed once at build time and never updated after a toggle, so — even setting the data bug aside —
the pill visually lagged the checkbox by one edit. The toggle arithmetic itself
(`toggleTag(tags, tag)`) is pulled out into an exported, unit-tested pure function
(`tags-cell.test.ts`), since the DOM wiring around it can't be tested (the controller can't be
imported by vitest) — the tests chain calls the way the editor does, one per `change` event, because
a test that only checks one toggle in isolation would not have caught this.

**Browser-verified with the same three-way discipline as #954/#910**: opened row 0 (`["urgent"]`),
checked "bug" then "feature" in one session, committed with Enter, reopened the cell — pre-fix
committed `["urgent", "feature"]` (reproduced live before fixing), post-fix committed
`["urgent", "bug", "feature"]`. Rule 5 again: `<DemoGrid>`'s Labels column (`col === 12`) was already
wired in and already reachable — the bug had simply never been tried with two checks in one session,
because nothing ever drove the editor that way. No demo change was needed to reach it, unlike 4b.1/
4b.5.

### 4b.7 Found while doing 4b.5 — the two header-glyph callbacks report the wrong column space

`@onHeaderMenuClick` and `@onHeaderIndicatorClick` hand the consumer a **mangled** column index —
the one that includes the row-marker column. Source subtracts `rowMarkerOffset` from both before the
consumer sees them (`data-editor.tsx:2569-2580`). Every other consumer-facing callback here was
brought into consumer space on 2026-08-09; these two were missed, so **rule 3 above is currently a
half-truth** and PORTING-NOTES.md's Phase 8 note recording the divergence as deliberate is the only
place it is written down.

It is not theoretical. `<DemoGrid>` defaults `@rowMarkers` to `"both"`, and its header menu indexed
`this.columns[menu.col]` directly, so **"Auto-size this column" and "Hide this column" acted on the
neighbouring column** and the menu titled itself with that column's name. Shipped in 4.5b, live at
default settings, unnoticed until 4b.5 forced the space to be pinned down. The demo is fixed
(`headerGlyphColumnIndex`); the addon is not.

**Fix:** subtract `args.rowMarkerOffset` at the single fire site in `onMouseUp`, delete
`<DemoGrid>`'s `headerGlyphColumnIndex` and its four call sites, and drop `<GlideDemo>`'s manual
`ROW_MARKER_OFFSET` subtraction (PORTING-NOTES.md's Phase 7c menu note). **This is a breaking change
to a published API** (v0.5.1 exposes `@onHeaderMenuClick`), so it wants a minor bump and a line in
the release notes rather than being slipped in — which is why it was not done as part of 4b.5.

---

**Standing note.** The upstream PR queue is not a shortcut: 37 open PRs, exactly one relevant fix
(#915), unmerged for over two years. Upstream is effectively unmaintained for bug-fix purposes — do
not schedule work here on the expectation that a fix will arrive to port.

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

### 5.3 npm publish — DONE (0.1.7, 0.2.0, 0.2.1, 0.3.0, 0.4.0, 0.5.0, 0.5.1 — latest 2026-08-15)

- Current version is `0.5.1`, tagged `v0.5.1`.
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

## 7. Where the deep history lives, if you need it

- **`PHASES.md`** — phase-by-phase plan and status, the full 9a–9r backlog with original reasoning,
  and the "how to resume cold" instructions.
- **`PORTING-NOTES.md`** — architecture facts, per-phase implementation records with source
  citations, settled build-config issues, and the recurring-bug-class section at the top (worth
  reading before porting any new cell type).
- **`TBD.md`** — the 2026-08-09 Storybook audit: 111 stories from source's 89 `*.stories.tsx` files,
  88 feature-facing, each classified. Sections 4.3–4.5 above are its N3–N14 condensed; the full
  entries have more source detail.
