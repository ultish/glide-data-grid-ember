# Porting notes — glide-data-grid → Ember v2 addon

**Read this file before doing any research of your own.** This is the accumulated ground truth
from prior phases/agents on this port. If a fact you need is already documented here, use it —
do not re-derive it from source, node_modules, or the web. Only research what's genuinely new.
When you learn something new and non-obvious that a later phase/agent will need, add it here
before you finish, in the relevant section (or a new one). Treat this file as the shared memory
across all agents working on this repo — an agent that doesn't update it is wasting the next
agent's effort.

Source repo (read-only reference): `/Users/jxhui/Developer/glide-data-grid`
Target repo (this workspace): `/Users/jxhui/Developer/glide-data-grid-ember`

## Recurring bug class: check this before porting ANY new cell type

**"Display field" staleness.** Several `GridCell` shapes carry a raw value field (`data`) *and* a
separate derived/formatted display field the canvas actually draws (`displayData` on
`TextCell`/`RowIDCell`, `displayDate` on `date-picker-cell`'s `DatePickerCell["data"]`, etc.) —
`draw()` always reads the **display** field, never `data` directly. This exact bug — updating
`data` but forgetting the matching display field, so a commit silently redraws the OLD value even
though the underlying data is now correct — has been independently found and fixed **three separate
times** by three different agents who didn't know about each other's fix: `text-cell.ts`'s
type-to-overwrite seeding (Phase 4a), `uri-cell.ts`'s editor `onChange` (Phase 4b), and
`date-picker-cell.ts`'s editor `onChange` *and* `onPaste` (Phase 5c). It is exactly the kind of thing
this file exists to prevent recurring a fourth time.

**Before writing `draw()`, `provideEditor`, `onPaste`, or any `activateCell`-adjacent seeding logic
for a new cell type**: check whether that cell's data shape has a separate display/formatted field
alongside its raw value. If it does, **every single code path that changes the raw value must also
recompute and set the display field in the same object, in the same place** — there is no shared
helper that does this for you (each cell kind formats its display field differently), so it has to
be done by hand at each call site, every time. Grep the cell's own `draw()` for which field name it
actually reads before assuming `data` is enough.

**The listener is on `root`, and `root` contains more than the grid** *(added 2026-08-09, and it is
the same "re-apply the rule at every call site" shape as the display-field bug above)*.
`GridHostController`'s pointer listeners live on `this.root`, but the overlay editor container
(`openOverlay` appends it there) and everything a consumer renders into `<GlideDataGrid>`'s yielded
block are *also* children of `root`. **Any new `root`-level pointer listener must go through
`isGridSurfaceTarget`** (`-private/grid-event-target.ts`) or it will fire for clicks inside editors
and consumer chrome. Source guards this at `data-grid.tsx:1076-1080` with an identity check against
exactly two nodes; **a `root.contains(target)` test is the wrong shape**, since the editor is inside
root by construction. `mousedown` and `contextmenu` are guarded as of 2026-08-09; `mousemove` and
`keydown` are not — `keydown` is incidentally protected by the `isFocused` gate (focusing an editor
blurs `root`), and `mousemove` only updates hover state, so it was left alone deliberately.

> **Why this went undetected from Phase 4a to Phase 9.** Every overlay editor was being destroyed and
> rebuilt on every click inside it, and **every one of them still appeared to work** — because the
> rebuilt overlay is reconstructed from the just-committed cell, so the visible result was right. It
> only became visible in the markdown editor, whose preview/edit-mode state lives in the factory
> closure rather than in the cell value. **Corollary, and the testing rule to take from it: an editor
> whose visible result is derived entirely from the cell value cannot detect its own destruction.**
> When verifying an editor, assert the overlay **node identity** survives the interaction, not just
> that the committed value is correct.

**Consumer docs rot in exactly one direction** *(added 2026-08-09, from migrating `DATA.md` and
`THEMING.md` into the cookbook)*. Features get *added* and the "not implemented yet" lists never get
revisited. `THEMING.md`'s §9 declared column grouping and search-result highlighting unimplemented —
both true when Phase 6 wrote it, both false since Phase 7 and 9e respectively. The field-by-field and
variable-by-variable reference content was otherwise byte-accurate against `theme.ts` many phases
later. **The cheap rule: when a phase implements something, grep the consumer docs for its name
before closing the phase.** The additive half of a doc stays right on its own; the negative claims
never do. Corollary: reference tables are cheap to migrate and stay true, so **status claims belong
in `PHASES.md` only, never in a consumer doc**.

**Live upstream references (user-supplied, 2026-08-07, general reference — see PHASES.md's Phase 9
for the context this was given in)**: useful for checking the *public API surface* and *actual
visual/interaction behavior* of a given cell/feature without reading through source `.tsx`, e.g.
when verifying a Phase 5/6 port looks/behaves right or resolving an ambiguity source's code alone
doesn't answer. Not the Phase 7 demo target itself — that's specifically the front page at
https://grid.glideapps.com/ (fancy example grid + 6 feature cards), already documented in
`PHASES.md`'s original-requirements section; don't conflate the two.
- API docs: https://docs.grid.glideapps.com/api
- Storybook (interactive, every cell type + feature has a live story): https://glideapps.github.io/glide-data-grid/

## Workspace layout

pnpm workspace. `glide-data-grid-ember/` = the v2 addon (TypeScript, `.gts`-ready, builds via
Rollup). `test-app/` = Vite/Embroider Ember app consuming the addon via `workspace:*`, hosts the
demo + tests.

## Settled build-config facts (do not re-verify — confirmed multiple times already)

- The addon's `tsconfig.json` extends `@ember/library-tsconfig`, which sets
  `noUncheckedIndexedAccess: true` and `moduleResolution: "bundler"`.
- **Relative imports must use explicit `.ts` extensions** (e.g. `from "./foo.ts"`, not
  `"./foo.js"` or extensionless) — required by this addon's Rollup + `@babel/plugin-transform-typescript`
  build pipeline, despite `moduleResolution: "bundler"` normally allowing extensionless. Confirmed
  by the tsconfig's own comment and by hitting real build failures in Phase 1 when this wasn't done.
- `noUncheckedIndexedAccess: true` means array/record indexing returns `T | undefined`. Use a
  non-null assertion (`!`) ONLY where a loop/algorithm invariant genuinely guarantees the value
  exists (e.g. `for (let i = 0; i < arr.length; i++) { arr[i]! }`) — never to paper over a real
  possible-undefined case. This is how all of Phase 1's ~100 such cases were resolved, each one
  checked against the source's implicit invariant.
- Verify with **`pnpm lint:types`** (from `glide-data-grid-ember/`, runs `ember-tsc --noEmit`) and
  the real build with `pnpm build` (also from `glide-data-grid-ember/`, runs `rollup --config`).
  Both must be run — a clean type-check does not guarantee the rollup/babel build passes (the
  `.ts`-extension requirement above is a rollup/babel constraint the type-checker won't catch).
  **Use `ember-tsc`, not bare `tsc`.** Earlier phases of this file say `npx tsc --noEmit -p
  tsconfig.json`; that still runs, but since the Glint v2 upgrade it is the *wrong* command —
  plain `tsc` silently ignores `.gts` files, so it skips `src/components/glide-data-grid.gts`
  entirely and reports success without having checked the one templated file in the addon.
- Dependency pins that had to be corrected from the `@embroider/addon-blueprint`/`@embroider/app-blueprint`
  scaffold defaults (blueprint shipped with incompatible versions): `@babel/plugin-transform-runtime`
  pinned to `^7.25.9` (blueprint default had drifted to a breaking unreleased v8), `typescript`
  pinned to `~5.9.3` in both `glide-data-grid-ember/package.json` and `test-app/package.json`
  (blueprint pinned 5.5.4, but `@glint/core` requires >=5.6), `ember-source` bumped to `~6.12.0` in
  the addon to match `test-app` (blueprint had the addon on 5.4.0, causing a `@glimmer/component`
  peer mismatch).
- `test-app/package.json` needs `"glide-data-grid-ember": "workspace:*"` under `dependencies` to
  actually consume the addon (not present by default from the blueprints).
- Rollup config (`glide-data-grid-ember/rollup.config.mjs`) auto-app-reexports anything under
  `src/components/**`, `src/modifiers/**`, `src/helpers/**`, `src/services/**` via
  `addon.appReexports([...])`. `publicEntrypoints` is currently broad (`**/*.js` post-transpile),
  so there's no hard enforcement of "private" — use `src/-private/` as a *naming convention* for
  internal-only code, don't try to fight the build config to make it stricter (out of scope).

## Phase 1 — rendering engine port (done, committed)

Ported to `glide-data-grid-ember/src/rendering/` as framework-agnostic TypeScript (zero
React/Ember imports), 7,160 lines across 28 files. Read `src/rendering/index.ts` for the full
public surface before using anything from this directory — don't guess at export names.

Key exports: `drawGrid` (main entry, `render/data-grid-render.ts`), `DrawGridArg` type
(`render/draw-grid-arg.ts`), `mapColumns` (plain function, was React hook `useMappedColumns` in
source — memoization is the Ember layer's job now), `CellSet`, `AnimationManager`,
`getDataEditorTheme`/`mergeAndRealizeTheme`/`Theme`/`FullTheme` (from `theme.ts`, ported from
source's `styles.ts` — `ThemeContext`/`useTheme` React Context deliberately NOT ported),
`SpriteManager`, `ImageWindowLoaderImpl`, `RenderStateProvider`, `browserIsSafari` (from
`common/browser-detect.ts`), data model types (`GridCell`, `GridColumn`, `GridSelection`, `Item`,
`Rectangle`, `CompactSelection`, `DEFAULT_FILL_HANDLE`, etc. from `data-grid-types.ts`),
`BaseDrawArgs`/`PrepResult`/`GetCellRendererCallback`/`CellRenderer` (cell-renderer contract, from
`cell-types.ts`).

Deliberate stubs (real versions come in later phases): `ImageEditorType`/`ProvideEditorComponent`
in `data-grid-types.ts` are typed `unknown` (editor-component contract, Phase 4).
`CSSCursorValue` is a local `type CSSCursorValue = string` alias replacing React's
`CSSProperties["cursor"]` everywhere it appeared.

Also built (not part of the original Phase 1 file list, added when needed):
`src/rendering/animation-queue.ts` — `AnimationQueue` class, `enqueue(item: Item): void` method,
ported from source's `use-animation-queue.ts` hook (batches redraws via `requestAnimationFrame`,
includes the `seq > 600` backoff for runaway continuous queueing). Hook wrapper dropped, batching
logic ported verbatim.

## Phase 2 — Ember canvas host layer (in progress)

### Architecture (fully researched, cite sources below rather than re-reading if you just need the facts)

- **Two visible `<canvas>` elements**: a main content canvas, and a separate header canvas
  absolutely positioned `top:0,left:0` over it, sized to exactly `groupHeaderHeight + headerHeight + 1`
  px tall — only the header is drawn into it. Source: `packages/core/src/internal/data-grid/data-grid.tsx:1920-1946`
  (DOM/styling), `render/data-grid-render.ts:190-197,270-364` (sizing/drawing). PLUS two invisible
  offscreen buffer canvases (`document.createElement("canvas")`, `display:none`, appended to
  `document.documentElement`), used only for the double-buffer render strategy —
  `data-grid.tsx:737-757`. DPI scaling (backing-store size vs CSS size, `ctx.scale(dpr,dpr)`) is
  already handled INSIDE the ported `drawGrid` (`data-grid-render.ts:172-197,251-254`) — don't
  reimplement, just pass real canvas elements and don't fight its internal `canvas.width/height`
  sizing. Before first use in a session, reset `canvas.width = 0; canvas.height = 0` on both
  visible canvases (mirrors source's own init dance, forces `drawGrid`'s internal resize logic to
  treat the first real draw as needing a fresh size).
- **Native scrolling via an invisible padder trick.** Source:
  `packages/core/src/internal/scrolling-data-grid/infinite-scroller.tsx` (full file). A
  `.dvn-scroller` div (`overflow: auto`, `transform: translate3d(0,0,0)`) contains a
  `.dvn-scroll-inner` (flex row) with a `.dvn-stack` (flex column of invisible padder divs summing
  to full virtual scrollHeight, chunked at `MAX_PADDER_SEGMENT_HEIGHT = 5_000_000` px per segment
  because browsers cap div height ~33,554,400px) and a `.dvn-spacer` (`flex-grow: 1`) for
  horizontal extent. A **sibling** `.dvn-underlay` div (children `position:absolute; left:0;
  top:0`) holds the actual canvases — outside the scrolling element, never physically move; header
  is just repainted fresh every frame, no CSS `position:sticky` involved. Total scroll extent from
  full content sums: `scrolling-data-grid.tsx:105-117`. Visible window derived from
  `scrollLeft`/`scrollTop` per scroll event: `scrolling-data-grid.tsx` `processArgs`, ~121-240.
- **Scroll → redraw must be synchronous, no `requestAnimationFrame`.** The scroll perf trick is
  the blit fast path already ported in Phase 1 (`data-grid-render.blit.ts`, `computeCanBlit`) —
  when only scroll-offset fields changed, it translates the previous frame's canvas image via
  `drawImage` and repaints only the newly-exposed edge strip. Feed `drawGrid` fresh
  `cellXOffset`/`cellYOffset`/`translateX`/`translateY` synchronously from the native `scroll`
  listener — routing this through `@tracked` + an autotracking effect, or adding rAF throttling,
  defeats the blit optimization and adds latency the original doesn't have.
- **Resize**: `ResizeObserver` on the scroller/root triggers width/height re-derivation + redraw.
  Source's `common/resize-detector.ts` is a 30-line React hook wrapping `ResizeObserver` — don't
  port the hook, just replicate the idea (observe container, react to `contentRect`).
- **Hover / `AnimationManager` wiring** — exact pattern from `data-grid.tsx:1265-1288` (already
  fully worked out, port directly):
  ```ts
  const onAnimationFrame = (values: readonly { item: Item; hoverAmount: number }[]) => {
    const damage = new CellSet(values.map(v => v.item));
    hoverValues = values; // stored, fed into next DrawGridArg.hoverValues
    drawWithDamage(damage);
  };
  const animationManager = new AnimationManager(onAnimationFrame);
  // on hovered-cell change:
  const cell = getCellContent(hoveredItem, true);
  const r = getCellRenderer(cell);
  const needsHover = (r === undefined && cell.kind === GridCellKind.Custom)
    || (r?.needsHover !== undefined && (typeof r.needsHover === "boolean" ? r.needsHover : r.needsHover(cell)));
  animationManager.setHovered(needsHover ? hoveredItem : undefined);
  ```

### `DrawGridArg` field defaults (for fields not yet made dynamic — selection/resize/DnD/highlight are Phase 3)

Sourced from `packages/core/src/internal/data-grid/data-grid.tsx` (the full field-assembly block
is ~lines 793-850; individual defaults cited where they're defined elsewhere):

| Field | Default | Source |
|---|---|---|
| `rowHeight` | `34` | `data-editor.tsx:897` (`rowHeightIn = 34`) |
| `headerHeight` | `36` | `data-editor.tsx:898` (`headerHeightIn = 36`) |
| `groupHeaderHeight` | = `headerHeight` (36) | doc comment `data-editor.tsx:309` `@defaultValue headerHeight` |
| `disabledRows` | `CompactSelection.empty()` | `data-grid.tsx:812` |
| `fillHandle` | `DEFAULT_FILL_HANDLE` (ported, in `data-grid-types.ts`) | |
| `dragAndDropState` | `undefined` | |
| `isResizing` | `false`, `resizeCol` `undefined`, `resizeIndicator` `"none"` | |
| `isFocused` | `false` (static for now) | |
| `drawFocus` | `true` | |
| `hasAppendRow` | `false` | |
| `freezeTrailingRows` | `0` | |
| `hyperWrapping` | `false` | `data-grid.tsx:842` default when no `experimental.hyperWrapping` |
| `touchMode` | `false` | |
| `getGroupDetails` | `(name) => ({ name })` | `data-grid.tsx:770` |
| `getRowThemeOverride`/`drawHeaderCallback`/`drawCellCallback`/`prelightCells`/`highlightRegions` | `undefined` | |
| `damage` | `undefined` on normal draws, set only for `updateCells()`/animation-frame-triggered draws | |
| `maxScaleFactor` | `5` (flat; source varies 1-5 by browser+active-touch-scroll for a perf micro-opt — intentionally simplified, note as known simplification if you touch this) | `data-grid.tsx:760` |
| `minimumCellWidth` | `10` | `data-grid.tsx:761` |
| `renderStrategy` | `browserIsSafari.value ? "double-buffer" : "single-buffer"` | `data-grid.tsx:846`, using ported `browserIsSafari` |
| `verticalBorder` | `() => true` (draw all vertical gridlines) | simplest correct default |
| `enableGroups` | `false` (no column grouping args exposed yet) | |
| `lastBlitData` | persistent mutable box `{ current: undefined }` across draws (matches `MutableRefObject<BlitData\|undefined>` shape in `render/draw-grid-arg.ts`) | |

### Status as of last update

Phase 2 split into 2a (plain-TS `GridHostController` class) and 2b (public `<GlideDataGrid>` .gts
component + temp text cell renderer + test-app demo route). **2a is DONE** —
`glide-data-grid-ember/src/-private/grid-host-controller.ts` (634 lines), independently verified
(tsc clean, `pnpm build` succeeds, and manually spot-checked the coordinate-math call sites
against the ported `data-grid-lib.ts` signatures — correct). Do not rewrite it; build 2b on top of
it. 2a's actual final API (may differ slightly from what an earlier prompt sketched — this is
ground truth):

```ts
export interface GridHostArgs {
    readonly columns: readonly GridColumn[];
    readonly getCellContent: (item: Item) => GridCell;
    readonly rows: number;
    readonly rowHeight?: number | ((row: number) => number);   // default 34
    readonly headerHeight?: number;                             // default 36
    readonly groupHeaderHeight?: number;                        // default = headerHeight, but see note below
    readonly theme?: Partial<Theme>;
    readonly freezeColumns?: number;                            // default 0
    readonly getCellRenderer: GetCellRendererCallback;
}
export interface GridHostControllerOptions {
    readonly root: HTMLElement;
    readonly getArgs: () => GridHostArgs;   // called fresh on every draw/scroll/hover, never cached internally
}
export class GridHostController {
    constructor(options: GridHostControllerOptions);
    public scheduleFullRedraw(): void;      // call after any getArgs()-relevant input changes
    public updateCells(cells: readonly { cell: Item }[]): void;  // damage-based partial redraw
    public destroy(): void;                 // removes DOM, disconnects ResizeObserver, removes buffer canvases
}
```

**Important gotcha 2a discovered and fixed** (know this before touching column grouping in a
later phase): column grouping is NOT wired up in this phase (`ENABLE_GROUPS = false` internal
constant). `groupHeaderHeight` is accepted on `GridHostArgs` but is currently forced to `0`
everywhere it's consumed (the `DrawGridArg.groupHeaderHeight` field, header canvas CSS height,
`computeBounds`/`getRowIndexForY` calls, `.dvn-stack` content-height calc) — NOT just via
`enableGroups: false` on `DrawGridArg`. Reason: `getRowIndexForY`'s `totalHeaderHeight =
headerHeight + groupHeaderHeight` is computed unconditionally, not gated by the `hasGroups`
parameter — so a naive "just pass `enableGroups: false` and the real groupHeaderHeight value"
implementation would silently reserve dead header space and break row hit-testing. When grouping
is actually wired up (not yet scheduled in any phase 1-8 above — add a task if needed), every one
of those call sites needs `ENABLE_GROUPS ? args.groupHeaderHeight : 0` replaced with the real
conditional, not just the `DrawGridArg.enableGroups` flag flipped.

Other known simplifications in 2a (fine for now, revisit if they cause problems later):
`AutoGridColumn` (no explicit width) gets a flat 150px fallback (no auto-measurement pass yet);
`maxScaleFactor` is a flat `5` (source varies 1-5 by browser+active-touch-scroll, minor perf
micro-opt); scroll offset math always computes the smooth/sub-pixel form, doesn't reimplement
the source's integer-cell-only scroll mode toggle.

**2b is DONE** (component died mid-report to a connection error after finishing all real work —
Claude independently verified and finished the writeup). Phase 2 as a whole is complete and
browser-verified.

### 2b deliverables

- `glide-data-grid-ember/src/components/glide-data-grid.gts` (101 lines) — public `<GlideDataGrid>`
  component. Args: `columns`, `getCellContent`, `rows` (required); `rowHeight`, `headerHeight`,
  `groupHeaderHeight`, `theme`, `freezeColumns`, `getCellRenderer` (optional — `getCellRenderer`
  defaults to the temp text renderer below since `GridHostArgs.getCellRenderer` is non-optional),
  `onReady?: (api: GlideDataGridApi) => void` where `GlideDataGridApi = { updateCells: (cells:
  readonly { cell: Item }[]) => void }`.
  - Uses `ember-modifier`'s `modifier()` to construct a `GridHostController` on first insert and
    call `scheduleFullRedraw()` on subsequent reruns. **Real gotcha worth knowing**: the modifier
    function does NOT return a teardown callback, because `ember-modifier` invokes any returned
    teardown both before every rerun AND on final element removal with no way to distinguish the
    two — returning `() => controller.destroy()` would wrongly destroy the live controller on
    every single arg change. Final cleanup instead uses `registerDestructor(this, () =>
    controller.destroy())` tied to the component's own lifecycle, set up once inside the `if
    (this.controller === undefined)` branch.
  - Autotracking: a single `buildGridHostArgs()` method reads every reactive `@arg` and is used
    both as the modifier's dependency source (read inside the modifier function, so Ember reruns
    it when any arg changes) AND as the literal `getArgs` closure handed to `GridHostController`
    (per its "called fresh, never cached" contract) — one function serving both roles, no
    duplication.
  - Added `ember-modifier` as a dependency of `glide-data-grid-ember/package.json`.
- `glide-data-grid-ember/src/rendering/-temp-text-cell-renderer.ts` (56 lines) — bare-minimum
  cell renderer (draws `cell.data` as left-aligned text using theme font/colors), explicitly
  marked as a Phase 4 placeholder. Exports `getCellRenderer: GetCellRendererCallback`.
- `test-app/app/utils/demo-data.ts` (28 lines) — demo dataset: 50 columns (varied widths
  90-310px) × 200,000 rows, `demoGetCellContent` is a pure on-demand function (nothing
  materialized up front).
- `test-app/app/templates/application.gts` — renders `<GlideDataGrid @columns={{demoColumns}}
  @getCellContent={{demoGetCellContent}} @rows={{DEMO_ROW_COUNT}} />` filling `100vw`/`100vh`.

### Verification (Claude independently re-ran all of this, not just trusting the subagent report)

- `tsc --noEmit` clean, `pnpm build` (rollup) succeeds, `pnpm --filter test-app exec vite build`
  succeeds end-to-end (404 modules, no errors — one pre-existing unrelated peer-dep warning about
  `@glint/*` unstable-version mismatches in `test-app`, harmless).
- **Browser-verified** (Chrome, dev server on :4200): grid renders real virtualized cell content;
  vertical scroll works and header stays pinned at top through ~200k rows; horizontal scroll works
  and header column titles stay in sync; directly set `scroller.scrollTop` to the very end
  (`scrollHeight` was exactly `6,800,036` = `36 (header) + 200,000 × 34 (rows)`, confirming the
  padder total-height math is exact) — content correctly rendered rows up to `R199999`, crossing
  the `.dvn-stack`'s multi-segment padder boundary (total height > `MAX_PADDER_SEGMENT_HEIGHT =
  5,000,000`, so this exercises >1 padder div) with no glitches. No console errors at any point.

### Notes for later phases

- `getCellRenderer` is a required (not optional) `GridHostArgs`/internal field, but the public
  `<GlideDataGrid>` component makes it an *optional* `@arg`, defaulting to the temp text renderer.
  When Phase 4 lands the real cell-type registry, decide whether `<GlideDataGrid>` should keep
  defaulting silently or require consumers to pass a renderer registry explicitly — currently it
  silently defaults, which is convenient for demos but may hide a real omission in a production
  app that forgot to configure cell types.
- Column grouping is still fully off end to end (see `ENABLE_GROUPS` note above) — no args for it
  are exposed on `<GlideDataGrid>` yet either.

## Phase 3 — Interaction layer (COMPLETE: 3a/3b/3c/3d all done, browser-verified, committed)

**Baseline**: Ember port currently has zero interaction logic. `grid-host-controller.ts` hardcodes
an empty `GridSelection` into every draw and has only a bare hover `mousemove` handler — no
mousedown/up, no keyboard, no hit-testing beyond hover. This is greenfield work, not "extend
existing behavior." `GridSelection`/`CompactSelection` (the data types) are ALREADY ported
byte-for-byte correctly in `src/rendering/data-grid-types.ts` — only the mutation/interaction
logic that writes into them is missing.

Sub-phase plan (split finer per user request, each independently verifiable): **3a** selection
writer (port `use-selection-behavior.ts`) + mouse click dispatch (cell/row-marker/header/
select-all/drag-extend/header-menu hit-test — all one cohesive dispatcher in source, port as one
unit). **3b** keyboard navigation (depends on 3a's selection writer). **3c** copy/paste (depends
on 3a's selection state). **3d** column resize/reorder + row reorder drag-and-drop (independent of
3a-3c, separate wrapper layer in source). Run sequentially, update status below as each lands.

Status: **3a is DONE and browser-verified** (Claude did this after the implementing agent's report,
which was correctly honest that it had only build/typecheck-verified, not browser-tested).

**3b (keyboard nav) is DONE, build/typecheck-verified only, NOT browser-tested by the implementing
agent** (per this phase's own instructions — browser-testing was explicitly left to Claude/the
orchestrator to do afterward, the same "lesson" called out below applies: don't consider it
actually done until someone clicks a cell and tries arrows/shift+arrows/Ctrl+A/Home/End in a real
browser).

**Real bug found during browser verification, now fixed** — worth internalizing since it's
invisible to every automated check: clicking a cell updated `GridSelection` state correctly
internally but drew **no visible selection highlight at all**. Root cause:
`render/data-grid-render.cells.ts:283` (`if (isSelected && !isFocused && drawFocus) { accentCount
= 0; }`) — the ported render engine deliberately suppresses the selection ring when the grid
doesn't have real DOM focus, and Phase 2 had hardcoded `isFocused: false` in
`grid-host-controller.ts` ("static for now", since no interaction existed yet to focus the grid).
3a added real selection but didn't touch that hardcoded value, so every selection was invisible
despite correct underlying state. **Fixed**: `root` is now `tabIndex = 0` + `outline:none` (the
engine draws its own focus indication), `focus`/`blur` listeners track a real `isFocused` instance
field feeding `DrawGridArg.isFocused`, and `onMouseDown` calls `this.root.focus()` explicitly.
Re-verified in browser after the fix: click-to-select, shift-click range extension (correct
rectangle + highlighted header cells for spanned columns), and header column click (full-column
select, header itself highlighted) all render correctly.

**Lesson for every remaining interaction-phase (3b/3c/3d and beyond): `tsc`/`pnpm build`/`vite
build` passing is necessary but not sufficient — always do an actual browser pass clicking through
the behavior before considering a phase done, especially for anything touching `isFocused`,
`isSelected`, or other render-gating flags that a partial phase might leave stale.** Not yet
tested in this browser pass (do this when 3b/3c/3d touch them, or as a follow-up): drag-extend
(mouse-move-while-down growing a range), ctrl/cmd-click toggle, row-marker click (untestable until
`rowMarkers`/`rowSelect` are threaded through as `<GlideDataGrid>` args — currently only reachable
internally, not from the demo), and the header-menu hit-test (same — needs `column.hasMenu: true`
wired into demo columns to test).

#### 3a deliverables and the exact API 3b/3c/3d build on

- **Selection writer**: `glide-data-grid-ember/src/rendering/selection-behavior.ts` (new, ~190
  lines), pure functions (no class -- unlike `AnimationQueue`, there's no persistent state to own,
  every function is `(currentSelection, ...) => nextSelection`). Exported via
  `src/rendering/index.ts`'s barrel (also added `Slice` to the barrel's type exports, it wasn't
  there before and the writer's public signatures need it):
  ```ts
  export type SelectionBlending = "exclusive" | "mixed" | "additive";
  export type RangeSelectMode = "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
  export type SelectionTrigger = "click" | "drag" | "keyboard-nav" | "keyboard-select" | "edit";
  export interface SelectionBehaviorOptions {
      rangeBehavior: SelectionBlending; columnBehavior: SelectionBlending; rowBehavior: SelectionBlending;
      rangeSelect: RangeSelectMode; rangeSelectionColumnSpanning: boolean;
  }
  export interface SetCurrentResult { selection: GridSelection; expand: boolean; } // `expand` is a
  // carry-through of source's `expandSelection`/span-growth flag -- NOT acted on by anything yet
  // (no span support ported), callers may ignore it safely.
  export function setCurrentSelection(gridSelection, valueIn, expand, append, trigger, options): SetCurrentResult;
  export function setSelectedRows(gridSelection, newRowsIn, append, allowMixed, options): GridSelection;
  export function setSelectedColumns(gridSelection, newColsIn, append, allowMixed, options): GridSelection;
  ```
  3b (keyboard nav) will call `setCurrentSelection`/`setSelectedRows`/`setSelectedColumns` directly
  for arrow-key/Home/End/Ctrl+A movement -- same functions 3a's mouse dispatch uses, no new writer
  needed.

- **`GridHostController`** (`src/-private/grid-host-controller.ts`, now ~1300 lines, up from 634)
  gained: internal mutable `private selection: GridSelection` (uncontrolled -- no controlled-mode
  support yet, see below), `public getSelection(): GridSelection`, native `mousedown` (on `root`)
  and `mouseup` (on `window`, so a drag ending outside the grid still clears state) listeners, and
  the full click-dispatch/drag-extend/header-menu-hit-test logic described in the "Mouse dispatch"
  section above. Every selection mutation routes through one private `applySelection(newSelection)`
  choke point that calls `onSelectionChanged` then `scheduleFullRedraw()` (full redraw chosen over
  damage-based for simplicity, per the task's own "either is fine" guidance -- revisit if it's a
  real perf problem later).

  New `GridHostArgs` fields (all optional, all consumed by `resolveArgs()`'s existing
  default-filling pattern):
  ```ts
  rowMarkers?: "none" | "checkbox" | "checkbox-visible" | "number" | "clickable-number" | "both"; // default "none"
  rowMarkerWidth?: number;                    // default auto-sized from `rows`, matches source
  rowSelect?: "none" | "single" | "multi";    // default "multi"
  columnSelect?: "none" | "single" | "multi"; // default "multi"
  rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect"; // default "rect"
  rangeSelectionColumnSpanning?: boolean;     // default true
  onSelectionChanged?: (selection: GridSelection) => void;
  onHeaderMenuClick?: (col: number, bounds: Rectangle) => void;
  ```
  Deliberately NOT added as args yet (hardcoded internally as `DEFAULT_SELECTION_OPTIONS`/
  `DEFAULT_ROW_SELECTION_MODE`/`DEFAULT_COLUMN_SELECTION_MODE` constants in
  `grid-host-controller.ts`, all matching source's own defaults): `rangeSelectionBlending`/
  `columnSelectionBlending`/`rowSelectionBlending` (all `"exclusive"`), `rowSelectionMode`/
  `columnSelectionMode` (both `"auto"`). The writer functions themselves are fully parameterized
  over these, so exposing them later is just plumbing new `GridHostArgs` fields through
  `resolveArgs()`/`selectionOptions()` -- no writer changes needed.

- **Row-marker column mangling**: when `rowMarkers !== "none"`, `GridHostController` now prepends a
  synthetic sticky column (mirrors source's `mangledCols`/`getMangledCellContent`,
  `data-editor.tsx:1141-1169,1309-1382`, collapsed here into `mangledColumns()`/
  `mangledFreezeColumns()`/`mangledGetCellContent()`/`computeMangledLayout()` private methods) --
  every coordinate-math call site (`runDraw`, `rebuildScrollContent`, `onScroll`, `onMouseMove`,
  `resolveMouseHit`, `hitTestHeaderMenu`) now goes through `computeMangledLayout()` instead of the
  old direct `mapColumns(normalizeColumns(args.columns), args.freezeColumns)` call. When
  `rowMarkers === "none"` (the default) every one of these is an identity transform, so 2a/2b's
  established default-path behavior is unchanged -- verified by the full vite build still
  succeeding and module count only growing by the one new file.
  **Known gap**: only the marker column's *header* cell (the select-all checkbox) actually renders
  today, because header-marker drawing was already Phase-1-ported (`render/
  data-grid-render.header.ts:433-455`, driven by `InnerGridColumn.rowMarker`/`rowMarkerChecked`).
  The marker column's *body* cells (per-row checkboxes) have no cell renderer -- source's
  `cells/marker-cell.tsx` is Phase 4 (cell-type registry) territory -- so they currently draw as
  empty. The selection *logic* for clicking/dragging in the marker column is fully implemented and
  correct regardless (it only depends on coordinate math, not on what's drawn).

- **Gap for whoever does the `<GlideDataGrid>` wiring**: per this task's explicit scope, `src/
  components/glide-data-grid.gts` was NOT touched in 3a -- none of the new `GridHostArgs` fields
  (`rowMarkers`, `rowSelect`, `columnSelect`, `rangeSelect`, `rangeSelectionColumnSpanning`,
  `onSelectionChanged`, `onHeaderMenuClick`) are exposed as `<GlideDataGrid>` `@args` yet. Ordinary
  cell click / shift-click / ctrl-click / drag-select (rect) / header-column click all work
  out-of-the-box through the existing demo already (they only rely on `resolveArgs()`'s internal
  defaults, which are all live with no `.gts` changes needed) -- **but the select-all checkbox
  specifically cannot be browser-tested until `rowMarkers`/`rowSelect` are threaded through
  `glide-data-grid.gts`'s `buildGridHostArgs()`**, same mechanical pattern as the existing
  `freezeColumns` passthrough. This is a small, explicitly-deferred follow-up, not a bug.

- **Controlled-selection mode**: not built. `GridHostController.selection` is always
  internally-owned; there's no `GridHostArgs.selection` prop to accept an externally-managed value.
  Source's default (uncontrolled) behavior is what's replicated. A future increment could add an
  optional `selection?: GridSelection` arg that, when present, makes `applySelection` skip mutating
  `this.selection` and rely on the caller re-supplying it via `getArgs()` instead (mirrors source's
  `gridSelectionOuter`/`onGridSelectionChange` controlled-prop pattern in `data-editor.tsx`).

- **Other known simplifications** (all called out inline in `grid-host-controller.ts` where
  relevant): `expandSelection` (span/merged-cell selection growth on the `expand` flag) is not
  ported -- no consumer uses `GridCell.span` yet. Cell-renderer `onSelect`/`onClick` mid-dispatch
  interception hooks (source calls these inside `handleSelect`) are not wired -- no renderer in this
  port implements them yet (Phase 4). `isMaybeScrollbar`'s scrollbar-width detection uses
  `offsetWidth - clientWidth` rather than porting source's `getScrollBarWidth()`. No DPI/CSS-scale
  correction (`rect.width / width`) in click coordinate math, kept consistent with the pre-existing
  `onMouseMove` hover code which also omits it.

#### 3b deliverables and what 3c should know

- **Everything landed in `grid-host-controller.ts`** (no new files) — a native `keydown` listener
  on `root` (`private readonly onKeyDown`, registered/removed alongside the other mouse/focus
  listeners) plus four private helpers: `moveActiveCell(args, col, row): boolean`,
  `adjustSelection(args, dx, dy): void`, `selectAll(args): void`,
  `scrollCellIntoView(args, col, row): void`. Controller grew from 1340 to 1620 lines (+280).
  `getStickyWidth` was added to the existing `data-grid-lib.ts` import (needed by
  `scrollCellIntoView` to know the frozen-column width for the horizontal-visibility check).
- **Implemented** (mapped to the phase brief's numbered list):
  1. Arrow-key movement — `moveActiveCell`, clamps to `[rowMarkerOffset, mappedColumns.length-1]`
     × `[0, rows-1]`, no-ops (no `setCurrentSelection` call, no redraw, no scroll) when the clamped
     target equals the current cell, i.e. already at an edge — matches source's
     `updateSelectedCell` clamp-then-compare-equal pattern.
  2. Shift+Arrow — `adjustSelection`, ports source's `adjustSelection`'s four "motion up/down/
     left/right" cases (grow far edge / shrink near edge past the anchor) verbatim; the `2`/`-2`
     ("jump to end/start", source's primary+shift+Home/End/Arrow) cases and the span-skipping
     (`disallowed`/`getCellsForSelection`) logic are NOT ported (out of scope per the brief — no
     span support exists anywhere in this port). Gated on `rangeSelect ∈ {"rect","multi-rect"}`,
     matching source's `else if (rangeSelect === "rect" || rangeSelect === "multi-rect")` guard
     around the `selectGrow*`/`selectToFirst/LastRow/Column` branch.
  3. Home/End (first/last column in row), Ctrl(Cmd)+Home/End (first/last cell in grid),
     Ctrl(Cmd)+Arrow (first/last row for Up/Down, first/last column for Left/Right) — all via
     `moveActiveCell` with computed target col/row, `primary = browserIsOSX.value ? metaKey :
     ctrlKey`.
  4. Ctrl(Cmd)+A — `selectAll`, ported directly from source's `keys.selectAll` branch (bypasses the
     `setCurrentSelection` writer, exactly like source bypasses `setCurrent` here too): `columns`/
     `rows` CompactSelections stay **empty**, "select all" is expressed purely via `current.range =
     {x: rowMarkerOffset, y: 0, width: args.columns.length, height: args.rows}` — note
     `args.columns.length` is the caller's *un-mangled* column count (real columns only), so
     select-all deliberately excludes the row-marker column, matching source's `columnsIn.length`
     exactly. Verified against source at `data-editor.tsx`'s `isHotkey(keys.selectAll, ...)`
     branch, not assumed.
  5. Scroll-into-view — `scrollCellIntoView`, computes the target cell's `computeBounds(...)` (same
     helper hover/click hit-testing already uses) and nudges `scrollerEl.scrollLeft`/`scrollTop` by
     just enough to bring it fully inside the non-frozen/non-header viewport if it's currently
     outside. Deliberately simplified vs source's `scrollTo` (see PORTING-NOTES.md's existing
     Copy/paste-adjacent "Keyboard nav" research section) — no easing/`options.hAlign`/`vAlign`,
     no frozen-trailing-rows accounting (there are none in this port), no DPI/CSS-scale correction
     (consistent with the rest of this controller's mouse-coordinate math, which also omits it).
     Called from both `moveActiveCell` (scrolls the new active cell) and `adjustSelection` (scrolls
     whichever edge — far or near — actually moved, not the anchor).
- **Deliberately NOT implemented** (all explicitly out-of-scope per the brief, or genuinely
  optional and skipped for time): Tab/Shift+Tab nav aliasing; alt+Arrow "free move"/retain-selection
  (source's `go*CellRetainSelection`, meaningless without span/editor support); cell activation
  (Enter/Space/printable-char, Phase 4 — no cell editors exist yet); copy/cut/paste (Phase 3c,
  native clipboard events not keydown anyway); row/column Space/Ctrl+Space select-row/select-column
  shortcuts; primary+shift+Arrow/Home/End "jump and extend selection to an edge" (source's
  `selectToFirst/LastRow/Column/Cell` keybinds — only bare shift+Arrow grow/shrink was requested).
  Also not ported: source's generic string-based `keybindings`/`ConfigurableKeybinds`
  remapping DSL (`common/is-hotkey.ts`) — this handler matches the *default* keybindings directly
  via `ev.key`/`ev.ctrlKey`/`ev.metaKey`/`ev.shiftKey`/`ev.altKey` checks rather than reimplementing
  the whole hotkey-string matcher, since nothing in this port exposes remappable keybindings yet.
- **One deliberate behavioral deviation from source, documented inline in the code**: source's
  `handleFixedKeybindings` has a `cancelOnlyOnMove`/`moved` gate that, read closely, means
  shift+Arrow (`selectGrowUp`/etc.) calls in source's own code **never actually
  `preventDefault()`s** — the final `moved = updateSelectedCell(col, row, ...)` call re-checks the
  *anchor* cell (which `adjustSelection` never changes), so `moved` is always `false` for that
  branch regardless of whether the range actually grew, and `trapFocus` defaults to `false`. This
  reads as a source quirk/oversight rather than intentional behavior. This port always calls
  `preventDefault()`/`stopPropagation()` when `adjustSelection` actually runs (i.e. whenever the
  shift+Arrow + `rangeSelect` gate passes) — simpler, and avoids letting the browser's default
  shift+Arrow behavior (which can vary) fight with the grid's own state change. Plain
  arrow/Home/End/Ctrl+Arrow movement DOES faithfully replicate source's real "only preventDefault if
  the cell actually moved" behavior (`moveActiveCell` returns `false` at an edge, and `onKeyDown`
  only calls `preventDefault()` when it returns `true`) — this is the one place the nuance was
  actually worth keeping since it's real navigable-vs-not-navigable state, not a code-path quirk.
- **Verification performed**: `npx tsc --noEmit -p tsconfig.json` clean, `pnpm build` (rollup)
  succeeds, `pnpm --filter test-app exec vite build` succeeds (405 modules, no new errors/warnings
  beyond the pre-existing ones already noted in Phase 2's verification section). **Browser-verified
  by Claude after this report** (the agent correctly declined to claim this itself): arrow-key
  movement, shift+arrow range growth in both dimensions (confirmed an actual 2×2 rectangle, not
  just one axis), Cmd+A select-all (confirmed full-grid highlight), and Cmd+End jump-to-last-cell
  with correct auto-scroll (jumped to R199999C49, both axes scrolled into view) all work correctly.
  No `isFocused`-style rendering gap this time — reused the focus machinery from the 3a fix. One
  non-bug encountered during testing worth remembering: **this whole project's dev machine is
  macOS**, so `browserIsOSX.value` is true and "primary" is `metaKey` (Cmd), not `ctrlKey` — a
  literal Ctrl+A keypress correctly does nothing (matches source's own Mac/non-Mac branching), only
  Cmd+A triggers select-all. Don't mistake that for a bug when testing on this machine.
- **What 3c (copy/paste) should know**: keyboard nav didn't touch clipboard events at all (correctly
  out of scope — see the "Copy/paste" section below, it's native `copy`/`cut`/`paste` events on
  `window`, not a keydown concern). 3c's focus-gating should reuse the same `this.isFocused` field
  this phase gates on (`document.activeElement` checks in source map onto it). The
  `selection`/`this.selection.current`/`.rows`/`.columns` shape 3c needs to read from is unchanged
  by this phase — it only ever *writes* through the same `setCurrentSelection`/`setSelectedRows`/
  `setSelectedColumns` writer 3a already established, no new selection-shape concerns introduced.

#### 3c deliverables (copy/paste) — DONE, browser-verified, committed

**How this landed**: the implementing agent completed a full, faithful 407-line port of the
copy-buffer/paste-parsing logic (`src/rendering/copy-paste.ts` — `getCopyBufferContents`,
`decodeHTML`, `unquote`, all the escaping/HTML-attribute helpers, ported near-verbatim from
source's `copy-paste.ts`+`data-editor-fns.ts`'s `unquote()`) and had started wiring the
`GridHostArgs.onCellsEdited` field + `copy`/`cut`/`paste` listener registration when it died to a
connection error mid-response (same class of transient failure as earlier phases — not a logic
problem). Since the missing piece was narrowly scoped (3 event-handler methods consuming an
already-complete, already-reviewed module) and further agent round-trips have real overhead, Claude
completed it directly: `onCopy`/`onCut`/`onPaste` plus supporting helpers (`selectedRegion`,
`buildCopyBuffer`, `pasteValueIntoCell`, `clearedCellValue`) added to
`grid-host-controller.ts` (grew to ~1900 lines).

**Design**: `onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void` is a
**notification-only** callback, same contract as `onSelectionChanged` — `GridHostController` never
mutates a backing data store itself (there isn't one; no cell-editing/data-model layer exists yet,
Phase 4 territory). The consumer is responsible for applying the edit wherever `getCellContent`
reads from, then triggering a redraw (e.g. via `updateCells()`, already built in Phase 2). **Phase
4 (cell editing) should follow this same non-mutating-controller pattern for consistency.**

Per-cell paste coercion (`pasteValueIntoCell`)/clearing (`clearedCellValue`) are direct, minimal
equivalents of source's per-renderer `onPaste` dispatch — real cell renderers don't exist yet
(Phase 4), so these switch on `GridCellKind` directly (Text/Number/Boolean/Uri/Markdown — the kinds
Phase 1's data model actually supports) rather than delegating to a renderer. **Phase 4 should
replace this with real per-renderer `onPaste` dispatch**, matching source, once renderers exist.

Known simplification (documented inline in the code): `selectedRegion` treats a selected
`rows`/`columns` `CompactSelection` as its min..max bounding box rather than iterating each
disjoint slice — correct for the common contiguous case (the only case 3a's click handling can
actually produce today), over-inclusive only for a hypothetical disjoint multi-select nothing in
this port can currently create.

**Verification — both automated and a real functional browser test**:
- `tsc`/`pnpm build`/`vite build` all clean (406 modules in the test-app build).
- **Browser-tested for real**, but note the *methodology* used, since it surfaced an important
  testing lesson: pasting via `navigator.clipboard.readText()` hangs indefinitely on a permission
  prompt in this automated Chrome context (don't use it for verification — it will look like a
  hang, not a failure). Testing copy/paste by simulating real OS keystrokes (`Cmd+C`/`Cmd+V`) into
  a second tab/textarea also silently fails, because **switching Chrome tabs during a multi-step
  browser-tool test blurs the previously-focused element** (`document.activeElement` reverts to
  `<body>`) — this is a real limitation of the multi-tool-call testing pattern, not a bug in the
  grid's own focus tracking. **The reliable pattern**: dispatch the whole interaction (mousedown →
  mouseup → shift-click → clipboard event) as raw DOM events inside a *single* `javascript_tool`
  script, never crossing a tool-call boundary or switching tabs mid-sequence. Doing this confirmed:
  copy produces a correctly-escaped 2×2 TSV block (`R4C2\tR4C3\nR5C2\tR5C3`, tab/newline-correct)
  plus a well-formed HTML `<table>` payload; paste of a TSV string correctly parses it, resolves
  writable cells, computes edits, and calls `preventDefault()` (confirming the full parse → target
  → coerce → edit pipeline executes end-to-end). **Apply this same single-script dispatch pattern
  for any future clipboard/multi-tab interaction testing on this project** — it's faster and more
  reliable than driving real keystrokes across separate tool calls.

#### 3d deliverables (column resize/reorder DnD) — DONE, browser-verified, committed. **Phase 3 (Interaction layer) is now fully complete.**

**How this landed**: the background agent for 3d stalled twice in a row (once genuinely producing
zero file changes before a 600s-no-progress kill), both infra-level failures with no code written.
Given the pattern of repeated infra failures on this specific sub-phase and that Claude already had
strong context on the controller's structure from directly completing 3c, Claude implemented 3d
directly rather than a third agent attempt — same reasoning as 3c's completion (small, well-bounded
remaining scope, further round-trips have real overhead).

**Design, mirroring source's `data-grid-dnd.tsx`** (no native HTML5 Drag-and-Drop API — pure
`mousedown`/`mousemove`/`mouseup` tracking, extending 3a's existing header-click dispatch
infrastructure rather than a parallel handler):
- **Resize**: mousedown within `RESIZE_EDGE_PX = 6` px of a header's right border (only when
  `onColumnResize`/`onColumnResizeEnd`/`onColumnResizeStart` — any one — is configured, mirroring
  source's `canResize` gate; never on the row-marker column) starts a resize drag, exclusive with
  normal header-click selection (checked right alongside the existing menu-glyph check in
  `onMouseDown`). Every mousemove tick fires `onColumnResize` continuously (not just at drag-end),
  clamped to a 10px minimum width. `onColumnResizeEnd` fires on mouseup with the final width.
  `isResizing`/`resizeCol` in `DrawGridArg` (hardcoded since Phase 2) now reflect live state, so
  the already-Phase-1-ported render engine draws the resize-line visuals itself — no new drawing
  code needed.
- **Reorder**: mousedown on a header body (not its edge) when `onColumnMoved` is configured records
  drag-start state *alongside* normal header-click selection dispatch (both fire on the same
  mousedown, exactly like source's wrapper-around-DataGrid architecture) — whether it resolves to a
  plain click (selection only) or a drag (`onColumnMoved` also fires on mouseup) is decided by
  whether the 20px activation dead-zone (`COLUMN_DRAG_THRESHOLD_PX`, matches source's literal
  `data-grid-dnd.tsx` constant) is crossed before mouseup. `onColumnProposeMove` can veto a
  candidate drop position live during the drag (no drag visual drawn while vetoed). `dragAndDropState`
  in `DrawGridArg` (hardcoded since Phase 2) now reflects live `{src, dest}`, so the drag-ghost
  visual is drawn by the already-ported render engine, not new code here. `freezeColumns` gates
  valid drop targets (can't drop in front of frozen columns), matching source's `lockColumns`.
- **Non-mutating-controller contract maintained**: `GridHostController` never mutates `args.columns`
  or column order itself — same pattern established for `onCellsEdited` in 3c. Consumer must apply
  the new width / reordered array and pass it back through `getArgs()`.
- New `GridHostArgs` fields: `onColumnResizeStart`/`onColumnResize`/`onColumnResizeEnd` (all
  `(column, newSize, colIndex, newSizeWithGrow) => void`), `onColumnProposeMove: (startIndex,
  endIndex) => boolean`, `onColumnMoved: (startIndex, endIndex) => void`.

**Real gap found and fixed while wiring up verification**: `src/components/glide-data-grid.gts`
(the public Ember-facing component, Phase 2b) had never been updated to forward ANY of Phase 3's
`GridHostArgs` additions (`onSelectionChanged`, `onHeaderMenuClick`, `onCellsEdited`, `rowMarkers`/
`rowSelect`/etc, and now the resize/reorder callbacks) — its `Args` interface and
`buildGridHostArgs()` only covered what Phase 2b originally shipped with. **Fixed**: the component
now forwards the complete `GridHostArgs` surface. This wasn't just a testing convenience — it was a
real, load-bearing gap: without it, none of 3a/3b/3c/3d's interaction features were reachable from
the public `<GlideDataGrid>` component at all, only from a raw `GridHostController` instantiated
directly (which no real consumer would do). **Any future phase that adds a new `GridHostArgs`
field must remember to also add it to `glide-data-grid.gts`'s `Args`/`buildGridHostArgs`** — there's
no automatic forwarding, it's two hand-maintained parallel lists.

**Demo wiring added** (`test-app/app/components/demo-grid.gts`, new — `application.gts` now
renders `<DemoGrid />` instead of `<GlideDataGrid>` directly): a small `@tracked columns` +
`handleColumnResize`/`handleColumnMoved` backing component, since `application.gts` used
`ember-route-template`'s classless `Route(<template>)` pattern which can't hold tracked state.
This is genuinely necessary for ANY consumer wanting resize/reorder to visually stick (per the
non-mutating-controller contract above), not just a test scaffold — keep it as the demo evolves in
Phase 7.

**Verification**: `tsc`/`pnpm build`/`vite build` all clean on the first implementation attempt (no
type errors). **Browser-tested for real** using the single-script raw-DOM-event dispatch pattern
established in 3c (dispatching `mousedown`/`mousemove`/`mouseup` as real `MouseEvent`s in one
`javascript_tool` call — note `mousemove` must be dispatched on the grid's root element, NOT
`window`, since `onMouseMove` is registered on `root` while only `onMouseUp` is on `window`; a
first attempt dispatching mousemove on `window` silently did nothing, worth remembering). Resize:
dragging Column 0's right edge visibly widened it (~90px → ~150px). Reorder: dragging Column 1's
header body past the 20px threshold correctly moved "Column 2" into position 1 in the demo (the
demo's cell *data* staying labeled "C1" under the moved header is an expected demo-data quirk —
`demoGetCellContent` computes text from array *position*, not column identity, so it doesn't track
reordering; this doesn't indicate any problem in the resize/reorder implementation itself, which is
proven correct by the header itself moving to the right position).

### Selection model

`GridSelection` (source `data-grid-types.ts:24-32`, already ported identically):
`{ current?: { cell: Item, range: Rectangle, rangeStack: readonly Rectangle[] }, columns:
CompactSelection, rows: CompactSelection }`. Empty selection: `{ current: undefined, rows:
CompactSelection.empty(), columns: CompactSelection.empty() }` — exactly what
`grid-host-controller.ts` already hardcodes as its permanent value; 3a replaces that hardcoding
with real mutable state.

`CompactSelection` (source `data-grid-types.ts:589-723`, already ported) is an immutable,
sorted/merged sparse range set (`readonly [start,end)[]` slices). Key API: `.empty()`,
`.fromSingleSelection(number|Slice)`, `.fromArray()`, `.add()`, `.remove()`, `.hasIndex()`,
`.length`, iterable.

**The selection *writer* is a separate, not-yet-ported piece**: source
`packages/core/src/internal/data-grid/use-selection-behavior.ts` (152 lines, a React hook, NOT
yet in the Ember port). Returns `[setCurrent, setSelectedRows, setSelectedColumns]`. Port its
logic as a plain class/functions (same de-hooking pattern as `AnimationQueue`
in Phase 2). Key behavior: `SelectionBlending` (`"exclusive"|"mixed"|"additive"`, one each for
range/column/row, source defaults all `"exclusive"`) governs whether selecting rows wipes
cell/column selection and vice versa — default is mutually exclusive. `setCurrent(value, expand,
append, trigger)`: `append && rangeSelect∈{"multi-cell","multi-rect"}` pushes onto `rangeStack`
(multi-range select); `trigger==="drag"` preserves `rangeStack` from the previous selection so a
drag can grow an existing multi-range.

**Mouse dispatch** — source's `handleSelect` (`data-editor.tsx:1838-2087`) is THE single function
handling both cell and header clicks; port as one dispatcher, not separate cell/header handlers.
Branches: row-marker column (col 0) click → select/deselect/extend row (shift extends contiguous
range from a remembered anchor row; ctrl/cmd or touch or `rowSelectionMode==="multi"` toggles;
plain click replaces whole row selection with just that row, deselects if it was the sole
selection); ordinary cell click → shift extends range from previous `current.cell`, plain click
sets fresh 1×1 selection; header click (non-marker column) → mirrors row logic for columns;
out-of-bounds click clears everything. `isMultiKey = macOS ? metaKey : ctrlKey`. **Plain ctrl/cmd
click alone does NOT multi-select** — multi-rect selection requires drag-while-modifier, not a
bare click (only affects `append`'s interaction with `rangeStack` during drag).

Drag-extend: `mouseState` set on mousedown (`{previousSelection, fillHandle}`), grown via the
existing hover pipeline calling `setCurrent(..., trigger:"drag")` on every cell the mouse enters
while a button is held; torn down on mouseup.

**Keyboard nav** — source `data-editor/data-editor-keybindings.ts` (defaults) +
`data-editor.tsx:onKeyDown`/`handleFixedKeybindings` (the dispatch switch) +
`updateSelectedCell`/`adjustSelection` (the actual mutation). Defaults: arrows move active cell
(alt+arrow = "free move", doesn't collapse range); shift+arrow grows range (only when
`rangeSelect∈{"rect","multi-rect"}`); Home/End/Ctrl(Cmd)+arrows jump to edges; Tab/Shift+Tab alias
onto right/left nav (no "tab leaves the grid" concept); Ctrl(Cmd)+A selects all; Space toggles row
selection of current row, Ctrl+Space toggles column. **Copy/cut/paste are NOT part of this
keybinding matcher** — see next section, they're native browser clipboard events instead.

**Row markers / select-all** — `handleSelect`'s row-marker branch
(`data-editor.tsx:1853-1911,1997-2007`). Guard: no-op if trailing blank row, `rowMarkers==="number"`
(non-clickable), or `rowSelect==="none"`. Header checkbox click
(`col===0`, guarded by `!headerRowMarkerDisabled && rowSelect==="multi"`) is a **binary toggle**,
not a real tri-state cycle: `selectedRows.length !== rows` → select all `[0,rows)` via
`CompactSelection.fromSingleSelection([0, rows])`; else → clear to empty. The tri-state
checked/unchecked/**indeterminate** visual (already Phase-1-ported header draw logic consumes this)
is purely derived: `numSelectedRows===0 ? false : numSelectedRows===rows ? true : undefined
(indeterminate)` — computed fresh each render, not stored state. Indeterminate + click → select
all (since count≠rows). Single-row-marker click without modifier **replaces** the whole row
selection with just that row (does not add).

**Header menu click (NOT sorting)** — source `data-grid.tsx`'s `isOverHeaderElement` (hit-tests a
`menuBounds` rect, requires `column.hasMenu===true`) feeding `onClickImpl`'s
`onHeaderMenuClick?.(col, bounds)` firing. This is a **separate, precise hit-test** distinct from
a general header click (`onHeaderClicked`) — menu-icon glyph must specifically be hovered/clicked,
not the whole header cell. Bounds are canvas-space, meant for positioning a floating menu.
**Critical scope finding: sorting is 100% consumer responsibility.** The grid has no `onSort`,
sort state, or row-reordering-by-value anywhere — `onHeaderMenuClick` only fires an event with
`{col, bounds}`; the source's own example (`docs/examples/header-menus.stories.tsx`) builds the
actual dropdown menu as a plain consumer-owned component (via the third-party `react-laag`
positioning lib) with no sort example even present. **For this Ember port: Phase 3's job is only
the hit-test + `onHeaderMenuClick` callback plumbing (menu glyph drawing is already a Phase-1
render concern). Building an actual sort-menu UI + sort logic is Phase 7 (demo app) work**, not
grid-engine work — don't try to bake sorting into the addon itself.

### Copy/paste

Source `packages/core/src/data-editor/copy-paste.ts` (not yet ported). Clipboard payload is
**both** plain-text TSV-ish AND an HTML `<table>` (for cross-app fidelity — Excel/Sheets paste
correctly), written simultaneously. Plain text: tab-joins cells/newline-joins rows, `url`-format
cells emit the raw href not display text, `string-array` cells comma-join, everything else
quote-escaped if it contains tab/newline/quote. HTML: real `<table>`, each `<td>` carries a custom
`gdg-format`/`gdg-raw-value` attribute pair (glide-data-grid's own paste-fidelity round-trip
mechanism, not a web standard) so paste can recover exact per-cell type/value, with an MSO-specific
inline `<style>` for correct Excel line-break rendering.

Trigger: **native browser `copy`/`cut`/`paste` events** on `window`, not a keydown listener — the
"copy"/"cut"/"paste" keybinding booleans (default `true`) merely gate whether the native-event
handler acts, they don't independently listen for Ctrl+C etc. Each handler checks
`document.activeElement` is within the grid's canvas/scroll container before acting (focus-gated).

Clipboard API usage prefers, in order: (1) synchronous `ClipboardEvent.clipboardData.setData(...)`
when a live native event is available, (2) async `navigator.clipboard.write([ClipboardItem])`,
(3) async `navigator.clipboard.writeText()` plain-text-only fallback. **Source has no explicit
try/catch around the async Clipboard API calls** — a rejected permission prompt propagates as an
unhandled rejection. Flagged as worth doing better in the Ember port (add real error handling),
not something to blindly replicate.

Paste target: `gridSelection.current.range.{x,y}` anchor (or sole selected column/row). Pasted
cells are written row-major via a batched multi-cell edit + single damage-based redraw at the end
(reuses the `updateCells`-style damage mechanism already built in Phase 2, not a full redraw per
cell).

### Column resize / reorder (drag-and-drop)

Source `packages/core/src/internal/data-grid-dnd/data-grid-dnd.tsx` (not yet ported) — a wrapper
layer around the base grid, **no native HTML5 Drag-and-Drop API**, pure custom mousedown/mousemove
(raw native listener, not the synthetic per-cell mouse-args pipeline)/mouseup tracking.

Resize: mousedown on a header's right edge (edge-hit region, ~a few px) starts it, fires
`onColumnResizeStart`. Every mousemove tick while resizing fires `onColumnResize` **continuously**
(not just at drag-end) with the live width (canvas devicePixelRatio-corrected). Mouseup fires
`onColumnResizeEnd`. If multiple columns are co-selected, resize proportionally replicates across
all of them. **Consumer owns all column-width state** — the grid/DnD wrapper never mutates
`columns` itself, callbacks are purely notifications; resize is "enabled" merely by the presence of
any one of the three callback props.

Reorder: mousedown on a header body (not its edge) when a reorder callback is configured starts
tracking; a 20px movement dead-zone before the drag visually "activates" (`dragColActive`); live
hover tracking via the normal per-cell hover pipeline updates the drop target; an optional
"propose move" callback can veto a specific drop position live during the drag (no visual
drag-offset computed if vetoed); mouseup fires the actual move callback. **Consumer owns column
order** — must reorder its own `columns` array in response.

Row reorder is the same mechanism, gated on being in the row-marker column (col 0) specifically
(distinct from row-marker *selection* clicks, which live in `handleSelect`/3a, not here) — includes
a live preview during drag (remaps row indices so the dragged row visually appears at the drop
target before the move is committed) and auto-scroll near grid edges while dragging.

## Phase 4 — Core cell types + overlay editors (research, 2026-08-07)

**Repo path gotcha:** the addon package is nested two levels:
`/Users/jxhui/Developer/glide-data-grid-ember/glide-data-grid-ember/` (workspace root `glide-data-grid-ember/`
contains an addon dir of the *same name*). Always use the full nested path or you'll `cd` into the
wrong directory (this bit the researcher once this session — `cd .../glide-data-grid-ember && ls src`
silently resolved to the outer workspace root, not the addon).

### Existing hook points already in the port (don't rebuild these)

- `src/rendering/cell-types.ts` already has the **complete** registry contracts ported 1:1 from
  source's `cells/cell-types.ts`: `BaseDrawArgs`, `DrawArgs<T>`, `PrepResult`, `DrawCallback`,
  `BaseCellRenderer`/`InternalCellRenderer<T>`/`CustomRenderer<T>`/`CellRenderer<T>`,
  `GetCellRendererCallback`. Nothing to change here for Phase 4 — just implement renderers that
  satisfy `InternalCellRenderer<T>`.
- `src/rendering/-temp-text-cell-renderer.ts` is the Phase-2 smoke-test stub — **delete it** once a
  real registry (`getCellRenderer`) exists, per its own header comment. `GridHostArgs.getCellRenderer`
  in `grid-host-controller.ts` already plumbs whatever function is passed in; no signature changes
  needed there.
- `GridHostController.onMouseMove` (hover) already calls `args.getCellRenderer(cell)` and checks
  `renderer.needsHover` to drive `AnimationManager` — the hover-fade wiring is **done**, cell
  renderers just need to set `needsHover` truthily to opt in (e.g. `newRowCellRenderer`).
  `renderer.onClick`/`onSelect` are **not yet wired** into `resolveMouseHit`/click dispatch — that's
  new Phase 4 work (see below).
- Row-marker checkbox + select-all is **already implemented as bespoke code directly in
  `GridHostController`** (Phase 3a), not via a `marker-cell.tsx`-style registry renderer, even
  though source itself does route it through the registry (`cells/marker-cell.tsx`). This is a known
  divergence — it already works, leave it as-is, no need to refactor to match source's structure.
- Keyboard nav comment at `grid-host-controller.ts:1618-1630` already flags exactly what Phase 4 must
  add: "cell activation (Enter/Space/printable-char — Phase 4, no cell editors exist)".

### Cell renderer interface & source files to port

`packages/core/src/cells/*.tsx` (13 files, each exports one `InternalCellRenderer<T>` object +
a `draw*Cell` function): `text-cell.tsx`, `number-cell.tsx`, `boolean-cell.tsx`, `bubble-cell.tsx`,
`image-cell.tsx`, `uri-cell.tsx`, `markdown-cell.tsx`, `drilldown-cell.tsx`, `marker-cell.tsx`
(skip — see divergence note above), `loading-cell.tsx`, `protected-cell.tsx`, `row-id-cell.tsx`,
`new-row-cell.tsx`. Each renderer implements `kind`, `draw`, optionally `drawPrep`/`measure`/
`needsHover`/`onClick`/`onDelete`/`provideEditor`, and (for `InternalCellRenderer`) `onPaste` +
`getAccessibilityString`. Port each near-verbatim, same pattern as Phase 1's render-function ports.

**Complexity tiers** (drives the sub-phase split below):
- **No overlay editor, trivial draw**: `loading-cell.tsx` (spinner/skeleton), `protected-cell.tsx`
  (dots), `row-id-cell.tsx` (plain text, readonly), `new-row-cell.tsx` (hover-icon "+" affordance,
  `needsHover: true`, `measure: () => 200` fixed width, no editor — `onClick`-less, activation is via
  the *grid* clicking a trailing blank row, see "New-row / trailing blank row" below).
- **No overlay editor, click-toggle**: `boolean-cell.tsx` (checkbox; toggles directly via `onClick`
  returning a mutated cell — **never opens an overlay**, confirmed in source's `reselect()`: `if (c.kind
  === GridCellKind.Boolean && activation.inputType === "keyboard" ...)` branch bypasses
  `setOverlaySimple` entirely and calls `onCellsEdited` + `damage` directly. Port this bypass into
  GridHostController's activation logic, not into the overlay-open path).
- **Text-like overlay editor** (uses ported `GrowingEntry`): `text-cell.tsx`, `number-cell.tsx` (same
  editor, parses/formats numeric string), `uri-cell.tsx` (same editor + link-icon click-to-open
  affordance), `markdown-cell.tsx` (`GrowingEntry` + rendered-HTML preview via `marked`, see below).
- **List/chip editor**: `bubble-cell.tsx` (renders pill/chip list, read-only — no `provideEditor` at
  all in source, it's **display-only**, confirm before assuming it needs an editor), `drilldown-cell.tsx`
  (chips with optional icons, also **no `provideEditor`** in source — display-only).
- **Custom editor**: `image-cell.tsx` (thumbnail draw + an editor for a list of image URLs, uses
  `ImageWindowLoader` — already ported in Phase 1 as `image-window-loader-interface.ts`/
  `common/image-window-loader.ts`).

### Overlay editor architecture

Source: `internal/data-grid-overlay-editor/data-grid-overlay-editor.tsx` (262 lines) + `internal/
growing-entry/growing-entry.tsx` + per-cell-type editor components (some inline in the cell file,
markdown's is a separate `internal/data-grid-overlay-editor/private/markdown-overlay-editor.tsx`).

- **DOM overlay, not canvas-drawn.** A single absolutely-positioned `<div>` rendered via
  `ReactDOM.createPortal` into a `#portal` element (or a consumer-supplied `portalElementRef`),
  positioned at `target: Rectangle` (the cell's on-screen bounding rect in the *same coordinate
  space* the render engine already computes cell rects in — `GridHostController` already has this
  math for hit-testing, reuse it, don't recompute). No React portal equivalent needed in Ember —
  either append the overlay element directly to `this.root` (simplest, avoids `{{in-element}}`
  target-management complexity) or use `{{in-element}}` into a dedicated container; either is fine,
  pick whichever is less code, this isn't architecturally load-bearing the way the canvas/scroll
  trick was.
- **Open/close state**: source keeps `overlay: {target, content, cell, initialValue, highlight,
  forceEditMode, activation, theme} | undefined` as one piece of state (`data-editor.tsx:776-784`).
  Port as a plain instance field on `GridHostController` (e.g. `private overlayState: OverlayState |
  undefined`), toggled imperatively — matches the port's existing dual-path model (imperative
  controller, not framework-reactive internal state), consistent with how selection/hover state is
  already handled.
- **Commit/cancel contract**: the editor component calls `onFinishEditing(newCell: GridCell |
  undefined, movement: [-1|0|1, -1|0|1])`. `undefined` cell = cancel (no edit applied). `movement`
  tells the grid which direction to move the active cell after closing (e.g. `[0,1]` = Enter moves
  down, `[1,0]`/`[-1,0]` = Tab/Shift+Tab, `[0,0]` = Escape/click-outside, stay put). On commit, source
  calls its `onCellsEdited`/`mangledOnCellsEdited` equivalent — in this port that's
  `GridHostArgs.onCellsEdited`, already exists, plus a damage-redraw of just that cell (reuse
  `updateCells()`/`drawWithDamage`, already exists).
- **Editor-internal key handling** (`data-grid-overlay-editor.tsx:onKeyDown`, ~line 141-165):
  `Escape` → cancel (movement `[0,0]`, no save). `Enter` (no shift — shift+Enter is reserved for
  multi-line text insertion) → save + movement `[0,1]`. `Tab`/`Shift+Tab` → save + movement
  `[±1,0]`. All three `stopPropagation`+`preventDefault` so the grid's own `onKeyDown` doesn't also
  react. Click-outside the overlay (`ClickOutsideContainer`) → save (not cancel!) with `[0,0]`.
- **`allowOverlay` flag**: every `EditableGridCell` in source's type union carries an `allowOverlay:
  boolean` field (already ported in Phase 1's `data-grid-types.ts` — verify it's there, it should be
  since the whole cell type union was ported). Activation only opens an overlay if
  `cell.allowOverlay === true` — readonly/marker/loading/etc. cells set this `false`.
- **GrowingEntry** (`internal/growing-entry/growing-entry.tsx`, ~70 lines): a `<textarea>` with an
  invisible sibling `<div>` ("shadow box") mirroring the same text content via CSS to auto-size the
  container to fit the text (classic autosize-textarea trick — no JS measurement needed, pure CSS).
  Controlled component: `value`/`onChange` props, focuses + selects-all (or places caret at end,
  depending on `highlight`) on mount. Straightforward `.gts` port — no architectural risk here.

### Activation (how editing gets triggered) — source `data-editor.tsx`, exact refs

- **`cellActivationBehavior`** prop, default `"second-click"` (line 848). Values: `"second-click"`
  (click an *already-selected* cell to activate — single click elsewhere just selects),
  `"double-click"` (native-feeling double-click required even on an already-selected cell),
  `"single-click"` (any click activates immediately). Per-cell override via
  `cell.activationBehaviorOverride`. **Port `"second-click"` as the only supported behavior for
  Phase 4** (matches the default everyone actually uses; don't build the full 3-mode + per-cell
  override system unless asked — YAGNI per project norms).
- **Double-click detection is NOT the native `dblclick` event.** Source manually times it in
  `onPointerUp` (`internal/data-grid/data-grid.tsx` ~line 1132-1163): a `lastUpTime` ref timestamp
  is compared against `Date.now()` on the *next* pointerup; if the gap is `< 500ms` (mouse) / `<
  1000ms` (touch), `isDoubleClick: true` is stamped onto that event's args. Port this exact pattern
  into `GridHostController`'s existing mouseup handler — add a `lastMouseUpTime` field, no new event
  listeners needed.
- **Click activation logic** (`handleMaybeClick`, `data-editor.tsx:2367-2429`): on a valid click (down
  and up landed on the same cell), if `isDoubleClick === true` **or** (`cellActivationBehavior ===
  "second-click"` **and** this cell was already the selected cell before this click) → activate.
  Boolean cells activate-and-toggle-immediately (no overlay) as noted above; other `allowOverlay`
  cells open the overlay via `reselect(bounds, activationEvent)` with `initialValue: undefined,
  highlight: true, forceEditMode: false` (i.e., opens showing existing content, selected/highlighted
  for easy overwrite-by-typing).
- **Enter key activation**: `keys.activateCell` default keybinding is Enter (confirmed via
  `handleFixedKeybindings`, `data-editor.tsx:3294-3306`) — same `reselect()` call, same
  highlight/forceEditMode as click activation. Wire into the port's existing `onKeyDown` (currently
  handles arrows/Home/End/Ctrl+A only, per its own "Phase 4" TODO comment).
- **Type-to-overwrite activation**: any single printable character (`event.key.length === 1` +
  unicode letter/mark/number/symbol/punctuation regex, `data-editor.tsx:3505-3524`) typed while a
  read-write cell is selected (and no modifier keys, and `editOnType` — default `true`) immediately
  activates the overlay **with that character as the starting content** (`reselect(bounds,
  activationEvent, event.key)` — the third arg is `initialValue`). For `NumberCell`: parsed as float
  (special-cased `"-"` → `-0`, `NaN` → `0`). For `Text`/`Markdown`/`Uri`: used as-is as the new
  `data`. This is genuine "start typing to overwrite a cell" spreadsheet-style UX — port it, it's a
  cheap addition once the overlay framework exists and is a real UX expectation for a data grid.
- **Delete key**: clears selected cell(s)' content via each renderer's `onDelete?.(cell) => T |
  undefined` (falls back to a generic clear if `onDelete` is absent). **Check whether Phase 3c
  already ported this** — `grid-host-controller.ts` has a `clearedCellValue` method (found near line
  2004) but it's not yet confirmed whether it's wired to the `Delete`/`Backspace` key or only used by
  cut. Verify and wire to keydown if missing.

### Markdown cell — corrects earlier PHASES.md speculation

**No ProseMirror anywhere in source.** `markdown-cell.tsx`'s editor is just `GrowingEntry` (a plain
textarea) + a live preview (`MarkdownDiv`, `internal/markdown-div/markdown-div.tsx`) that renders
markdown → HTML via the **`marked`** npm package (`marked(contents)` → innerHTML string, injected via
`Range.createContextualFragment`-style DOM manipulation, all `<a>` tags forced to
`target="_blank" rel="noreferrer noopener"`). Add `marked` as a dependency and port `MarkdownDiv`
as a small `.gts` component (or plain DOM-manipulation class + template, doesn't need to be
reactive — content only changes when the editor's value changes, which is already tracked at the
overlay-state level). This eliminates what PHASES.md flagged as a research risk — it's a trivial
dependency add, not a framework-integration question.

### New-row / trailing blank row

Source's "click below the last row to add a new row" affordance (`new-row-cell.tsx` +
`showTrailingBlankRow` prop + `onRowAppended` callback) **does not exist in the port at all yet** —
confirmed via `grid-host-controller.ts:1624`'s own comment ("no trailing-blank-row ... concepts exist
in this port yet"). This is more than a cell renderer — it needs: (1) a `showTrailingBlankRow: boolean`
arg, (2) the row-count/hit-testing math to treat `row === rows` as a real (virtual) row when that
flag is set, (3) an `onRowAppended` callback fired on activating that row, (4) the `newRowCellRenderer`
draw function itself (trivial, ~40 lines, already read in full during this research — hover-fade "+"
icon or custom icon/hint text). Scope this as its own sub-phase (4d below) rather than folding it
into the general cell-renderer work, since items 1-3 touch `GridHostController`'s row-counting/hit-
testing, not just the renderer registry.

### Suggested sub-phase split (mirrors Phase 3's 3a-3d pattern)

- **4a — Overlay framework + simple cells**: `GetCellRendererCallback` registry replacing the temp
  stub, `GrowingEntry` .gts component, overlay DOM host (open/position/close), activation wiring
  (double-click timing, second-click, Enter, type-to-overwrite, Escape/Enter/Tab commit, Delete-key
  clear if not already done), `onFinishEditing`→`onCellsEdited`+damage-redraw plumbing. Cell types:
  `text-cell`, `number-cell`, `boolean-cell` (exercises both the overlay path and the no-overlay
  toggle-bypass path), `loading-cell`, `protected-cell`, `row-id-cell`. This is the
  architecturally-risky sub-phase — most other sub-phases just add renderers on top of it.
- **4b — Text-family + markdown**: `uri-cell` (reuses text overlay + link affordance), `markdown-cell`
  (+ port `MarkdownDiv`, add `marked` dependency).
  - **Depends on 4a** (needs the overlay framework).
- **4c — Display-only chip cells**: `bubble-cell`, `drilldown-cell` (both confirmed display-only, no
  `provideEditor` in source — lower risk, can run in parallel with 4b since neither touches the
  overlay framework).
- **4d — Image cell + new-row/trailing-blank-row**: `image-cell` (uses existing `ImageWindowLoader`),
  plus the trailing-blank-row feature (`showTrailingBlankRow`/`onRowAppended`/`newRowCellRenderer`,
  see above — the row-counting/hit-testing changes here are the main risk, do this one carefully and
  re-verify row math doesn't break existing selection/scroll tests).
  - **Depends on 4a** for image-cell's editor; trailing-blank-row work is independent of 4a and could
    theoretically run in parallel, but bundling it with image-cell keeps the sub-phase count matching
    Phase 3's precedent.

## Process note for whoever picks this up next

Two 2a attempts before this note existed wasted significant time/tokens: two died to
infra-level connection issues (not logic problems, just retry), and one ran ~4 hours doing
re-derivation of facts (like the `.ts`-extension import rule and `noUncheckedIndexedAccess`
handling) that were already established in this file's predecessor knowledge. **Always update
this file when you learn something reusable, and always tell the next agent to read it first.**
This file existing and being kept current is the fix.

## Phase 4a — Overlay editor framework + simple cells (COMPLETE, 2026-08-07)

Built directly by Claude after two subagent attempts died mid-task (first died with zero progress,
relaunched with a narrower prompt; second died again -- both times stalling in a research/context-
gathering phase before writing the actual overlay-wiring code, despite the architecture already
being fully documented above). The salvaged work from those attempts (cell renderers, `GrowingEntry`,
the `CellEditorProps`/`CellEditorHandle` contract) was good and is now the foundation everything else
in this phase builds on -- see below for the final shape.

**Delivered**: `getCellRenderer` registry (`src/rendering/cells/index.ts`) covering
Text/Number/Boolean/Loading/Protected/RowID, replacing `-temp-text-cell-renderer.ts` (deleted).
`GrowingEntry` (`src/-private/growing-entry.ts`) -- plain-DOM autosize-textarea class, NOT an Ember
component (see its own header comment for why: the overlay host that consumes it is itself
plain imperative DOM code with no Ember-rendering context available). Full overlay editor host in
`GridHostController`: `openOverlay`/`finishOverlay`/`commitCellEdit`/`activateCell`/
`deleteSelection`/`onOverlayOutsideClick`, an `OverlayState` instance field, wired into
`dispatchCellMouseDown` (renderer `onClick` dispatch + click-on-already-selected activation) and
`onKeyDown` (Enter/Delete/Backspace/type-to-overwrite, plus a guard that bails out entirely while
an overlay is open so ordinary typing/arrow-keys inside the editor aren't reinterpreted as grid
nav). Demo app (`test-app/app/utils/demo-data.ts`, `demo-grid.gts`) now varies cell kind by column
(row-id/number/boolean/text) and has a real `edits` override map wired to `@onCellsEdited`.

**Editor contract** (`src/rendering/data-grid-types.ts`, search "Phase 4a"): `CellEditorProps<T>`
(`value`, `isHighlighted`, `theme`, `validatedSelection?`, `onChange`, `onFinishedEditing`) and
`CellEditorHandle` (`{element, focus(), destroy()}`) -- a plain factory function
`(props) => CellEditorHandle`, not a component. Any 4b/4c/4d cell's `provideEditor` must return
something satisfying this (either a bare function, or `{editor, disablePadding?, disableStyling?,
styleOverride?, deletedValue?}` per source's `ObjectEditorCallbackResult` shape, unwrapped via
`isObjectEditorCallbackResult`).

**Simplifications vs source, deliberate** (see the Phase 4 research section above for why):
`cellActivationBehavior` is always effectively `"second-click"` -- no double-click timing needed at
all, since "click on the already-selected cell" (checked in `dispatchCellMouseDown`) already covers
double-click's second mousedown as a special case. No `validateCell` support. No `editorBloom`.

**Real bugs found via browser testing (not caught by tsc/build) -- both fixed**:
1. **Select-all-on-activation silently collapsed to a caret.** `openOverlay` originally called
   `handle.focus()` synchronously, inside the same native `mousedown` dispatch that triggered
   activation. But `handle.focus()` runs *before* that same click's `mouseup`/`click` have fired --
   Chrome delivers them to whatever's now under the pointer, which by then is the freshly-inserted,
   freshly-focused textarea, and its default click-positions-caret handling silently overwrote the
   `setSelectionRange(0, length)` select-all that had just run. Source never hits this because
   React defers the equivalent `useEffect`-based focus past the triggering event's *entire* native
   dispatch (mousedown+mouseup+click all complete before React's commit phase runs effects) -- this
   port's imperative controller has no equivalent scheduling point. **Fix**: wrap `handle.focus()`
   in `window.setTimeout(..., 0)`. The click-outside-commit listener registration was already
   deferred the same way for an analogous reason (don't catch the activating click itself);
   `handle.focus()` needed the identical treatment and originally didn't have it.
2. **Type-to-overwrite committed the wrong text if the user didn't type a second character before
   Enter/Tab.** `activateCell`'s `initialValue` seeding set `data` but not `displayData` for Text
   cells. `text-cell.ts`'s renderer *draws* `cell.displayData`, not `.data` -- so a seed-then-
   immediately-commit (e.g. type one character then hit Tab) silently committed the *stale* old
   `displayData` while `data` held the correct new value underneath. Source's own `reselect()` has
   this same asymmetry (only sets `data`), but doesn't surface as a visible bug there for reasons
   not fully traced -- fixed directly in this port's `activateCell` (Text case now sets both
   `data` and `displayData` to the seeded value) since it's a real, reproducible, user-visible
   defect here regardless of source's own behavior.

**Addon-consumed-via-built-dist gotcha (costly, hit repeatedly this phase)**: `test-app`'s Vite dev
server consumes `glide-data-grid-ember` via its **built** `dist/` output (`glide-data-grid-ember/
dist/`, produced by `pnpm --filter glide-data-grid-ember build`, a Rollup build), NOT by live-
watching the addon's `src/`. Editing addon `.ts` files and just reloading the test-app page does
**nothing** -- you'll debug a phantom "bug" against stale behavior for a long time otherwise (this
happened during Phase 4a browser testing: several rounds of "fix -> reload -> still broken" before
realizing the dist was stale). **Every time you change addon source and want to browser-test it**:
rebuild the addon (`pnpm --filter glide-data-grid-ember build` from the workspace root) **then**
reload the test-app page. Additionally, Vite's own dependency pre-bundle cache
(`test-app/node_modules/.vite/`) can itself go stale relative to a freshly-rebuilt dist in a way a
plain page reload doesn't reliably invalidate -- if a rebuild+reload still looks stale, kill the
dev server, `rm -rf test-app/node_modules/.vite`, and restart it (`pnpm --filter test-app run
start`) to be sure. Cheap insurance: just always do the full kill+clear-cache+restart after every
addon rebuild during a browser-testing session, rather than trying to save the ~10s and
occasionally chasing a phantom bug for many minutes instead.

**Browser-testing environment quirk (this session, this automation setup specifically)**: calling
the real DOM `.focus()` method on an element (e.g. via a `javascript_tool`-injected script, or
transitively through this port's own `onMouseDown` -> `this.root.focus()`) reliably changes
`document.activeElement` but does **not** reliably fire a native `'focus'` DOM event in this
Chrome-extension-driven tab (most likely because the tab/window lacks true OS-level focus in this
automation context) -- confirmed by direct testing: `root.focus(); document.activeElement === root`
is `true`, yet a `focus` listener attached via `addEventListener` never fires, while manually
dispatching `new FocusEvent('focus')` on the same element *does* reliably reach the same listener.
This port's `isFocused` field (real DOM focus tracking, load-bearing for the selection-ring-
visibility fix from Phase 3a) is gated on that event actually firing, so **raw-`dispatchEvent`-only
test scripts that never see a real click will silently fail every focus-gated interaction** (this
cost significant time this session before being root-caused). Genuine `computer`-tool clicks
(trusted, CDP-dispatched) reliably deliver focus and worked correctly throughout this phase's
testing. **For any raw-JS single-script test that needs the grid focused without going through the
`computer` tool**: explicitly dispatch `root.dispatchEvent(new FocusEvent('focus', {bubbles:
false}))` immediately after (or as part of) the synthetic mousedown/mouseup -- don't rely on
`.focus()` alone. Also: keydown events aimed at an *open overlay editor* must be dispatched on
`document.activeElement` (the editor's textarea), not on `root` -- bubbling only goes upward from
the actual target, and the overlay's own commit-key handling lives on its container, a `root`
descendant the textarea bubbles through but a `root`-targeted dispatch never reaches.

Remaining Phase 4 sub-phases (4b: uri/markdown, 4c: bubble/drilldown, 4d: image/new-row) all build
on the overlay host and editor contract delivered here -- see the "Suggested sub-phase split"
above, still accurate.

## Phase 4c — Bubble/drilldown chip cells (COMPLETE, browser-verified, 2026-08-07)

**Delivered**: `src/rendering/cells/bubble-cell.ts` and `src/rendering/cells/drilldown-cell.ts`,
both ported near-verbatim from `packages/core/src/cells/{bubble-cell,drilldown-cell}.tsx`, reusing
already-ported Phase 1 primitives (`roundedRect`/`measureTextCached`/`getMiddleCenterBias`/
`getEmHeight` from `render/data-grid-lib.ts`) with zero new drawing helpers needed. Both added as
`case` branches in `src/rendering/cells/index.ts`'s `getCellRenderer` and exported from both that
file and the top-level `src/rendering/index.ts` barrel (which also gained `BubbleCell`/
`DrilldownCell`/`DrilldownCellData` type exports -- they existed in `data-grid-types.ts` since
Phase 1 but weren't re-exported yet). Also added `makeAccessibilityStringForArray` to
`src/rendering/common/utils.ts` (ported from source's `common/utils.tsx`, wasn't needed by any
earlier phase) -- used by both renderers' `getAccessibilityString`.

**Correction to this file's own earlier research note** (the "Complexity tiers" section above said
bubble/drilldown have "no `provideEditor` at all" in source -- re-verified directly against source
during 4c and this is not quite right, worth fixing for the record): both `bubble-cell.tsx` and
`drilldown-cell.tsx` **do** have a `provideEditor`, rendering `BubblesOverlayEditor`/
`DrilldownOverlayEditor` (`internal/data-grid-overlay-editor/private/*.tsx`). But both of those
components are **purely a static re-display of the full chip list** -- neither wires up
`onChange`/`onFinishedEditing` to anything (the overlay-editor contract's commit path is never
invoked), and each renderer's `onPaste` unconditionally returns `undefined`. `BubblesOverlayEditor`
additionally renders a decorative, permanently-invisible `<textarea autoFocus>` (likely just to
satisfy the overlay framework's "needs a focusable element" assumption, not for actual text entry).
**Net effect: functionally read-only end to end**, which is what actually matters for this port's
scope decision -- so per the original plan, **no overlay editor was built for either cell type
here**, only `draw`/`measure`/`getAccessibilityString`/`onPaste` (no-op). If a future phase ever
wants the "click to see the full untruncated chip list in an overlay" affordance, note it would be
a real *new* feature relative to what source's own editor does (source's version doesn't let you
edit the chips either, it just shows them uncropped) -- not a straightforward "port the existing
editor" job.

**Demo wiring** (`test-app/app/utils/demo-data.ts`): column 6 = bubble cell, 2-4 sample tags per row
cycling through an 8-tag pool (`urgent`/`bug`/`feature`/`design`/`backend`/`frontend`/`ops`/`docs`).
Column 7 = drilldown cell, 2-3 chips per row (`Item {row}-{i}`), first chip in each row carries an
`img` pointing at a tiny inlined 8x8 data-URI PNG (avoids any external network dependency in the
demo/tests). Both use columns 6/7 specifically to stay clear of Phase 4b's uri/markdown columns
(prompted to use 4/5) per this phase's own scoping instructions -- confirmed no collision by
reading the file's current state (only cols 0-2 were in use) immediately before editing.

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean (from the nested
`glide-data-grid-ember/glide-data-grid-ember/` addon dir), `pnpm --filter glide-data-grid-ember
build` (rollup) succeeds, `pnpm --filter test-app exec vite build` succeeds (421 modules, no new
errors). **Browser-verified**: reused the already-running dev server on :4200 (don't start a
second one -- check `lsof -i :4200` first) rather than spawning a duplicate, rebuilt the addon
first per the "consumed via built dist" gotcha, reloaded, and confirmed both columns render real
styled chip pills (rounded gray backgrounds for bubble tags, bordered chips with a small icon
square + text for drilldown), not raw/unstyled text -- zoomed screenshot confirmed chip rounding,
tag text, and the drilldown icon all rendered correctly. No console errors.

## Phase 4b — Uri/markdown cells (COMPLETE, browser-verified, 2026-08-07)

**Delivered**: `src/rendering/cells/uri-cell.ts` and `src/rendering/cells/markdown-cell.ts`, both
added as `case` branches + exports in `src/rendering/cells/index.ts` (merged alongside 4c's
bubble/drilldown branches, which had already landed on `main` by the time this phase started --
check `git log`/current file state before assuming you're the only phase touching this file).
Two new small plain-DOM helpers: `src/-private/edit-icons.ts` (`createEditPencilIcon`/
`createCheckmarkIcon`, inline-SVG ports of source's `EditPencil`/`Checkmark` from `common/
utils.tsx`, reused by both cells' editors) and `src/-private/markdown-div.ts`
(`createMarkdownDiv(contents, createNode?)`, port of `internal/markdown-div/markdown-div.tsx` +
its `MarkdownContainer` styled-component, using the **`marked`** npm package -- added as a
dependency of `glide-data-grid-ember/package.json`, pinned to `^16.1.2` matching source's version,
actual installed version resolved to `16.4.2`). Both new cells' `provideEditor`s are plain stateful
DOM factories (not Ember components), matching the `CellEditorProps`/`CellEditorHandle` contract
and the established plain-DOM-editor pattern from Phase 4a's `GrowingEntry`/`text-cell.ts` -- see
that phase's section above for the full rationale, not re-derived here.

**`marked` API note**: `marked(contents, { async: false })` returns `string` synchronously (per its
own overload set, `node_modules/.pnpm/marked@16.4.2/.../marked.d.ts:688-690`) -- source calls the
bare `marked(contents)` form and casts `as any`; this port passes `{ async: false }` explicitly so
TS resolves the synchronous overload without a cast, since this port's cell renderers run inside a
synchronous canvas-draw/editor-open path with no `await` point available.

**Uri-cell**: ported near-verbatim (draw/measure/`onSelect`/`onClick`/hover-link-underline math,
`getTextRect`/`isOverLinkText`, all copied from source's `uri-cell.tsx` unchanged). Editor
(`buildUriEditor` in `uri-cell.ts`) is a plain stateful DOM factory porting `UriOverlayEditor`
(`internal/data-grid-overlay-editor/private/uri-overlay-editor.tsx`): toggles between a "preview"
view (a real `<a>` link styled with `theme.linkColor`+underline, plus an edit-pencil icon) and an
"edit" view (`GrowingEntry`, `highlight: true` always regardless of `p.isHighlighted` -- matches
source's hardcoded `highlight={true}` on its `GrowingEntry`), swapping `container`'s children in
place since `CellEditorHandle.element` must stay one stable node for the overlay host's lifetime.
Both views include a decoy hidden `<textarea>` (preview mode only, mirrors source's own hidden
`autoFocus` textarea) so the overlay host's `handle.focus()` call always has *something* real to
focus even when showing the non-editable link preview -- without it, Escape/Enter/Tab keydowns
wouldn't reach the host's container-level commit handler at all while in preview mode, since
nothing would have real DOM focus. `onSelect` is ported and present on the renderer (matches
source's contract) but is currently **dead code**: `GridHostController`'s click dispatch only wires
`renderer.onClick`, not `onSelect` (a pre-existing gap noted in Phase 4a's own comment at
`grid-host-controller.ts` -- not something this phase introduced or was in scope to fix). Practical
effect: clicking directly on the link text in a `hoverEffect`+`onClickUri` cell both fires
`onClickUri` (via `onClick`) AND changes/activates selection normally (source's `onSelect`
`preventDefault()` would suppress that second effect) -- a minor, pre-existing behavioral gap, not
a Phase 4b regression.

**Markdown-cell**: `draw` renders the **raw markdown source text** on the canvas (`drawTextCell(a,
a.cell.data, ...)`, verbatim from source) -- the canvas view is *never* rendered as HTML, only the
overlay's own preview mode is. Editor (`buildMarkdownEditor` in `markdown-cell.ts`) ports
`MarkdownOverlayEditor` (`internal/data-grid-overlay-editor/private/markdown-overlay-editor.tsx`)
as the same preview/edit toggle pattern as uri-cell:
- **Preview mode** (default unless `data === ""`): `createMarkdownDiv(currentValue.data)` rendered
  HTML (headings/bold/italic/lists/links all genuinely styled, confirmed visually in browser
  testing, not raw `**bold**` text) + a spacer + an edit-pencil icon (hidden if `readonly`) + the
  same decoy-focus-textarea pattern as uri-cell, same rationale.
- **Edit mode**: `GrowingEntry` (`highlight: false`, matches source) + a checkmark icon.
  `GrowingEntry`'s `onKeyDown` is set to `ev => { if (ev.key === "Enter") ev.stopPropagation(); }`
  -- **this is load-bearing, not cosmetic**: without it, every Enter keystroke (needed constantly
  for real multi-line markdown authoring -- headings/paragraphs/lists all need blank-line
  separators) would bubble to the overlay host's container-level keydown handler and prematurely
  commit-and-close the editor after the very first line. Verified via browser testing: typing a
  multi-line value with real Enter keystrokes correctly stayed in the editor and produced the full
  multi-line string.
- **Real interaction nuance, confirmed by reading source closely rather than assuming from the
  task's informal description**: the checkmark icon's `onClick` in source is `() => onFinish(value)`
  -- it does **not** toggle back to preview mode within a still-open overlay. It calls the overlay's
  own finish/commit callback directly: commits the edit **and closes the whole overlay** in one
  step (the cell then redraws the raw new markdown source on the canvas, per `draw` above). Ported
  faithfully: the checkmark button calls `p.onFinishedEditing(currentValue)` directly, not a
  mode-toggle. (The edit-pencil's toggle, by contrast, really is just a local DOM swap with no
  commit -- `p.onChange`/`p.onFinishedEditing` are not called by clicking it.)
- Initial mode seeding simplification vs source: source's `editMode = markdown === "" ||
  forceEditMode`. This port's `CellEditorProps` (Phase 4a's contract) has no `forceEditMode` field,
  so `editMode` here is seeded from `data === ""` alone -- matches source's overwhelmingly common
  case (nothing in this port's activation path produces an equivalent of `forceEditMode` yet).

**Real bug found via browser testing (not caught by tsc/build) -- fixed, same class as Phase 4a's
`displayData`-staleness bug**: `UriCell.draw` reads `cell.displayData ?? cell.data` (verbatim from
source), so a cell that sets `displayData` (a realistic case -- e.g. showing a friendly label over
a raw URL; the test-app demo deliberately exercises this) kept showing the **old** `displayData`
after committing an edit, even though `data` updated correctly underneath and the edit genuinely
persisted in the consumer's data store -- reproduced by editing a uri cell, committing, and seeing
the pre-edit text still rendered. Root cause: this port's `buildUriEditor`'s `GrowingEntry.onChange`
(ported from source's `onChange={e => onChange({...value, data: e.target.value})}`) only ever set
`data`, never `displayData`, exactly mirroring source's own equivalent staleness gap that Phase 4a
already found and fixed for `text-cell.ts`. **Fixed** by keeping both fields in sync on every
keystroke (`onChange: value => p.onChange({ ...p.value, data: value, displayData: value })`) and in
`onDelete`. Debugging method worth recording: added temporary `console.log`s directly into
`grid-host-controller.ts`'s `openOverlay`/keydown-commit paths, confirmed `state.currentCell` and
the value handed to `commitCellEdit` were both already correct at commit time -- proving the bug
was purely a stale-`displayData`-wins-at-draw-time rendering issue, not a lost/misapplied edit. This
narrowed the search dramatically versus guessing; worth doing again for any "edit doesn't seem to
stick" symptom before assuming the commit pipeline itself is broken.

**Second real bug found via browser testing (reported by the user mid-session, not initially
caught)**: the overlay host's positioned container (`grid-host-controller.ts`'s `openOverlay`) set
a **fixed** `height`/`width` (both pinned to `cellRect`'s exact dimensions) with `overflow:
"visible"`. Any editor/preview content taller or wider than the cell itself -- routine for markdown
(multi-line source, or a rendered preview with a heading + paragraph + list) -- spilled out past the
container's own edges into the surrounding grid area, which has **no** `theme.bgCell` background,
reading visually as "text floating transparently over the next row/column" rather than a properly
contained popup. **Root cause was a straightforward literal-fixed-size layout, not a logic bug** --
source's real equivalent (`internal/data-grid-overlay-editor/data-grid-overlay-editor-style.tsx`)
never pins an exact size at all: `min-width`/`min-height` (floor at the cell's own size) +
`width: max-content`/`max-width: 400px` + `max-height: calc(100vh - top - 10px)`, i.e. the popup
is *meant* to grow to fit its content in both dimensions, capped at the viewport. **Fixed** to match
source's semantics (using plain `minWidth`/`width: "max-content"`/`maxWidth: "400px"`/`minHeight`/
`maxHeight: calc(100vh - ${cellRect.y}px - 10px)`/`overflow: "auto"` instead of the fixed
`width`/`height`/`overflow: visible`) -- this is shared overlay-host infrastructure (not specific to
uri/markdown), so it also improves every other Phase-4a-and-later cell's editor for free; re-tested
text-cell/number-cell/uri-cell after the change to confirm no regression (single-line editors still
render at exactly their normal column width/row height, since `minWidth`/`minHeight` act as a floor
and short content's own max-content size never exceeds them). **One thing to know before touching
this again**: several of this port's editor internals (`GrowingEntry`'s own outer `<div>`, the
markdown/uri editors' flex-row containers) rely on `width: 100%`/`flex-grow` for their *own*
children to fill available space -- percentage widths against a `width: max-content`-sized ancestor
are a real CSS footgun (per spec they can resolve as if unspecified, collapsing the child) if that
ancestor itself has a percentage-sized child rather than an intrinsically-sized one. This didn't
bite here because none of the *outer* editor-factory containers (`GrowingEntry.element`, `uri-cell`/
`markdown-cell`'s own wrapping `container` divs) use percentage widths on themselves, only their
*inner* children do -- verified empirically in-browser (checked `getBoundingClientRect()` widths
were non-zero/reasonable, not collapsed) after making the change, not just assumed safe from reading
the CSS spec. If a future editor's outer element ever uses a percentage width on itself, re-verify
this doesn't silently collapse it.

**Demo wiring** (`test-app/app/utils/demo-data.ts`): column 3 = uri cell (`hoverEffect: true`,
`displayData` set to the same URL, deliberately **no** `onClickUri` handler -- see the inline
comment explaining why: setting one makes a real in-bounds click on the link text short-circuit to
`window.open(...)`, which would spawn a real new browser tab during automated click-testing; the
renderer's click-to-open affordance is still fully implemented and works for any real consumer that
supplies the callback, just not exercised by this demo). Column 4 = markdown cell, 3 sample
values cycling by row (`# Heading` + bold/italic, `**Bold row**` + a link + a bullet list, `##`
sub-heading) -- chosen to exercise headings/bold/italic/links/lists in one small rotation. Used
columns 3/4 (not 6/7, which Phase 4c had already claimed by the time this phase ran, or the
task-prompt's suggested "4/5" -- checked the file's actual current state before picking columns
rather than assuming either the prompt or an unverified prior plan was still accurate).

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean, `pnpm --filter glide-data-grid-ember
build` (rollup) succeeds, `pnpm --filter test-app exec vite build` succeeds (426 modules, no new
errors). **Browser-verified** on a dedicated dev server (port 4201 -- port 4200 was already in use
by another concurrent agent's session; always `lsof -i :4200` before assuming you can use it,
same lesson 4c already recorded): uri column renders link-colored text, click-then-click opens the
preview/edit-pencil-toggle editor, double-click (real native dblclick, not two `left_click`s) also
correctly activates on a not-yet-selected cell, typing + Enter commits and the canvas re-renders the
new value, Escape cancels. Markdown column renders genuinely-styled HTML in preview mode (confirmed
headings/bold/italic/links/lists, not raw `**` text), edit-pencil toggles to a `GrowingEntry` with
real multi-line Enter support, checkmark commits+closes in one step and the canvas then shows the
new raw markdown source. No console errors at any point. **Testing methodology note**: real
`computer`-tool clicks reliably open/select/activate cells (consistent with Phase 4a's finding), but
small in-editor icon buttons (edit-pencil/checkmark) were more reliably clicked via a
`javascript_tool` script dispatching `mousedown`/`mouseup`/`click` directly on the DOM element found
via `querySelector` than via pixel-coordinate `computer`-tool clicks -- screenshot-space-to-CSS-px
coordinate translation for small (~24px) targets proved error-prone/inconsistent in this session
(get the real element and dispatch on it instead of eyeballing pixel coordinates for anything
smaller than roughly a full grid cell).

**What 4d should know**: the overlay-host container sizing fix above (`minWidth`/`width:
max-content`/`maxWidth`/`minHeight`/`maxHeight`/`overflow: auto` in `grid-host-controller.ts`'s
`openOverlay`) is now shared infrastructure any new editor (image-cell's editor, when 4d builds it)
gets for free -- no further action needed unless image-cell's editor has unusual sizing needs.
`onSelect` is still not wired into click dispatch (noted above) -- if image-cell's `provideEditor`
or any future renderer needs `onSelect`'s `preventDefault()`-suppresses-selection behavior, that
gap will need to be closed in `grid-host-controller.ts`'s `dispatchCellMouseDown`, not assumed to
already work.

## Phase 4d — Image cell + trailing blank row / "add row" affordance (COMPLETE, browser-verified,
2026-08-07). **Phase 4 (core cell types) is now fully complete: 4a/4b/4c/4d all done.**

### Image cell

**Delivered**: `src/rendering/cells/image-cell.ts`, ported near-verbatim from
`packages/core/src/cells/image-cell.tsx` for `draw`/`measure`/`onDelete`/`onPaste` (reuses the
already-ported `roundedRect` and the Phase-1 `ImageWindowLoader`, same `imageLoader.loadOrGetImage`
pattern `drilldown-cell.ts` already established). Added as a `case GridCellKind.Image:` branch +
export in `src/rendering/cells/index.ts`.

**Real, worth-recording finding: source's own default image-cell editor (`ImageOverlayEditor`,
`internal/data-grid-overlay-editor/private/image-overlay-editor.tsx`) is NOT actually editable.**
It destructures only `{urls, canWrite, onEditClick, renderImage}` from its props -- the
`onChange`/`onCancel` props declared on `OverlayImageEditorProps` are never consumed by the
component body at all. Its one interactive affordance (an edit-pencil button) is gated on
`canWrite && onEditClick`, but `image-cell.tsx`'s own `provideEditor` never passes `onEditClick`
when instantiating the default editor -- so even that never renders. Net effect in source itself:
the built-in image overlay is a pure read-only image carousel viewer; real editing only happens via
a fully custom `imageEditorOverride` (a consumer-supplied component, not shipped in `packages/
core`) or via paste/delete. This is the same "editor renders but doesn't actually wire commit"
pattern Phase 4c already found and documented for bubble-cell/drilldown-cell.

**Deliberate deviation from source, per this phase's own task instructions** ("a reasonably simple
textarea-per-URL-list ... is fine if source's own UI is more complex than fits cleanly"): rather
than faithfully porting a dead-end read-only viewer, `image-cell.ts`'s `provideEditor` builds a
genuinely *editable* editor -- a thumbnail preview row (plain `<img>` tags, one per URL) plus a
single comma-separated `GrowingEntry` (reusing the exact same primitive every other text-based
editor in this port already uses) that splits/rejoins on `,`, matching the same comma-separated
format `onPaste` already parses. No carousel/paging UI (source's `react-responsive-carousel`
dependency was not added -- multiple thumbnails just wrap in a flex row). This is more useful than
a straight port and stays low-risk since it's built entirely from already-existing primitives.

**Real bug found and fixed, not specific to image-cell but only surfaced by it**:
`GridHostController.activateCell` gated overlay-opening on `isReadWriteCell(cell) &&
cell.allowOverlay === true`. `isReadWriteCell` (`data-grid-types.ts:270`) deliberately excludes
`GridCellKind.Image` -- images aren't edited via generic typed/pasted text, so `isReadWriteCell`
correctly returning `false` for them is itself correct behavior for paste/type-to-overwrite/delete
gating. But it does NOT correctly gate overlay-opening: source's own `reselect()`
(`data-editor.tsx:1451`) only checks `c.allowOverlay`, never `isReadWriteCell`. This port's extra
`isReadWriteCell` check silently made every `allowOverlay:true` cell that isn't also "read-write"
(only `Image` in this port's type union, at least for now) permanently unable to open its overlay
via click-on-selected or Enter -- confirmed by browser-testing image-cell's editor and finding
nothing happened on click/Enter despite `provideEditor` being fully implemented and correct.
**Fixed**: `activateCell`'s gate is now just `if (cell.allowOverlay !== true) return;` (matching
source exactly) -- the `isReadWriteCell` check was removed from this one call site only; the other
two call sites (`deleteSelection`'s per-cell loop, `onCut`'s per-cell loop) correctly keep
`isReadWriteCell` since those really are generic-text-editing concepts image cells don't support.

### Trailing blank row / "add row" affordance

**Delivered**: `src/rendering/cells/new-row-cell.ts` (ported near-verbatim from
`packages/core/src/cells/new-row-cell.tsx` -- hover-fade "+" icon/line, `needsHover: true`,
`measure: () => 200`, no editor), registered as `case InnerGridCellKind.NewRow:` in
`src/rendering/cells/index.ts`. New `GridHostArgs` fields `showTrailingBlankRow?: boolean` and
`onRowAppended?: () => void` (both forwarded through `<GlideDataGrid>`'s `Args`/
`buildGridHostArgs()` in `src/components/glide-data-grid.gts`, same mechanical 1:1 pattern as every
other field there). Simplification vs source: this port doesn't expose source's richer
`trailingRowOptions` (per-column hint/icon/tint/sticky config) -- `showTrailingBlankRow` is a plain
boolean, and the hint text is hardcoded to `"Add row"` on the first real column only (every other
column's trailing cell has an empty hint, matching source's own per-column fallback-to-empty when
no `trailingRowOptions` is configured).

**The mechanics** (all in `src/-private/grid-host-controller.ts`), for anyone building on this
later (e.g. Phase 7's demo app):

- **`effectiveRows(args)`** -- new private helper, `args.rows + (args.showTrailingBlankRow ? 1 :
  0)`. This is the row count used for every *layout/hit-testing/scroll* computation that must treat
  `row === args.rows` as a real, in-bounds row: `runDraw`'s `DrawGridArg.rows` (this is what
  actually makes `drawGrid` iterate and draw the extra row at all) and `hasAppendRow` (now
  `args.showTrailingBlankRow` instead of hardcoded `false`), `rebuildScrollContent`'s
  `totalRowsHeight` call (padder div total height, so the scrollbar has room to reach the extra
  row), `onScroll`'s `computeYOffset` call, `onMouseMove`'s `getRowIndexForY`/`computeBounds` calls
  (hover hit-testing, needed for the "+" icon's `needsHover` fade to work at all), the drag-extend
  fallback location, `resolveMouseHit`'s `getRowIndexForY`/out-of-bounds fallback (needed for the
  row to be *clickable* at all -- `getRowIndexForY`/`computeBounds` both internally return an empty/
  `undefined` result whenever `row >= rows`, so without this the trailing row would draw but never
  hit-test), `computeCellRect`, `moveActiveCell`'s row clamp (so plain Arrow-key nav can step onto
  it), and `scrollCellIntoView`'s bound check.
- **`args.rows` itself is left unchanged everywhere else** and keeps meaning "real data row count
  only" -- this matters for: `selectAll`'s range height (Cmd+A must NOT select the trailing row,
  verified against source's own `keys.selectAll` branch using the un-mangled `rows`, not
  `mangledRows`), the header select-all checkbox's row-count comparisons, `rowMarkerWidthDefault`,
  the row-marker column's `rowMarkerChecked` tri-state math, `adjustSelection`'s vertical bound
  (shift+Arrow range-growing must NOT extend into the trailing row either -- verified against
  source's `adjustSelection` using its own un-mangled `rows`, distinct from `updateSelectedCell`'s
  `mangledRows`-based bound), and copy/cut/paste region bounds (`selectedRegion`'s `rows`/`columns`
  CompactSelection branches, paste's `targetRow >= args.rows` guard).
- **One asymmetry worth remembering**: Ctrl(Cmd)+End reaches the trailing row (`targetRow =
  effectiveRows(args) - 1`), but Ctrl(Cmd)+ArrowDown does NOT (`targetRow = args.rows - 1`,
  unchanged) -- this is not a port inconsistency, it faithfully mirrors source: `goToLastCell`
  (End) sets `row = Number.MAX_SAFE_INTEGER` and lets `updateSelectedCell`'s generic clamp (`rowMax
  = mangledRows - 1`) resolve it, while `goToLastRow` (Ctrl+ArrowDown) explicitly hardcodes `row =
  rows - 1` (the real, non-mangled count) itself, `data-editor.tsx:3353-3354` vs `:3326-3328`.
- **`mangledGetCellContent`** now also mangles in the trailing row (previously it only existed to
  handle `rowMarkers`, and its early-return fast path skipped mangling entirely when
  `!hasRowMarkers` -- that fast path is now gated on `!hasRowMarkers && !showTrailingBlankRow`
  instead). For `row === args.rows`: the row-marker column (if any) gets a plain `{kind:
  GridCellKind.Loading, allowOverlay: false}` (matches source's `loadingCell` -- no checkbox on the
  append-row affordance), every other column gets the `NewRowCell`.
- **Activation**: a real column cell click on the trailing row appends *immediately* -- added as an
  early branch in `dispatchCellMouseDown`, before the "ordinary cell click" section, deliberately
  bypassing the normal click-on-already-selected-cell activation gate (matches source's own
  single-click-appends UX, `data-editor.tsx:1912-1913`, which has no preceding `setCurrent` call
  either -- selection is untouched by the click). The row-marker column's trailing-row click is a
  no-op (added to the existing early-return guard in the row-marker branch, matching source's
  `showTrailingBlankRow === true && row === rows` check there). Enter-key activation (reachable via
  keyboard nav landing `selection.current.cell` on the trailing row, since `moveActiveCell`'s clamp
  now allows it) is handled by a guard added at the very top of `activateCell`: `if
  (cellContent.kind === InnerGridCellKind.NewRow) { args.onRowAppended?.(); return; }` -- placed
  before the pre-existing `isInnerOnlyCellKind` early-return so it doesn't get silently swallowed by
  that more general guard. Neither path mutates `this.selection` -- consistent with source, and with
  this port's established "controller never mutates the data it doesn't own" contract:
  `onRowAppended` is purely a notification, the consumer must grow its own row count.
- **Copy/cut/delete safety net**: `selectedRegion`'s `current`-range branch now clamps `rowEnd =
  Math.min(r.y + r.height, args.rows)`. Without this, a selection that includes the trailing row
  (reachable via keyboard nav, e.g. arrow-down onto it then Cmd+C) would have handed `row ===
  args.rows` to the *caller's own* `getCellContent` in `buildCopyBuffer`/`deleteSelection`/`onCut`
  (all of which call `args.getCellContent` directly, not the mangled wrapper) -- an out-of-range row
  index the caller never expects. Paste already had an equivalent guard (`targetRow >= args.rows`
  break); this fix gives copy/cut/delete the same protection at a single shared choke point.
- **Drag-extend** (rect/row-range selection growth while dragging) is clamped away from the
  trailing row in `handleDragMove` (`row = args.rows - 1` whenever the raw location's row `>=
  args.rows`) -- a deliberate simplification vs source's `landedOnLastStickyRow` handling (which
  distinguishes "drag started from the trailing row" vs "drag entered it," dropping the event
  entirely in the former case): this port just treats the trailing row as a wall drag-extend can't
  cross in either direction, simpler and with the same practical outcome (the resulting selection
  never includes it).

**Demo wiring** (`test-app/app/utils/demo-data.ts`, `test-app/app/components/demo-grid.gts`): image
cell added as column 5 (1-2 thumbnails per row, reusing the same tiny inlined data-URI PNG the
drilldown column already uses -- zero external network dependency). `DemoGrid`'s `rows` field is
now `@tracked` (was a plain field before this phase -- had no reason to be tracked until something
could change it) with a `handleRowAppended` action that does `this.rows = this.rows + 1`;
`demoGetCellContent` is a pure function of `[col, row]` with no upper bound baked in, so widening
`rows` alone is sufficient for the newly-appended row to immediately render real generated content
-- no separate "seed the new row's data" step needed for this demo. `<GlideDataGrid
@showTrailingBlankRow={{true}} @onRowAppended={{this.handleRowAppended}} .../>` added alongside the
existing args.

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean, `pnpm --filter glide-data-grid-ember
build` (rollup) and `pnpm --filter test-app exec vite build` (428 modules) both succeed with no new
errors. **Browser-verified** end to end on a fresh dev server (killed the stale one, cleared
`test-app/node_modules/.vite`, restarted, per the established gotcha): image column renders real
thumbnail(s) from the data-URI (confirmed via zoomed screenshot, not just "something drew"),
click-then-click opens the editor showing the thumbnail(s) + an editable comma-separated URL
textarea (this is what surfaced the `activateCell`/`isReadWriteCell` bug above -- initially nothing
opened, root-caused via a working text-cell comparison click + a plain-DOM click-toggle regression
check with the same gesture, then reading `activateCell` line by line against source). Trailing row:
Cmd+End correctly jumped to the trailing row across both axes with correct auto-scroll (`scroller.
scrollHeight` was exactly `6,800,070` = `36 + 200,000×34 + 34`, confirming the padder total-height
math includes exactly one extra row); the "+ Add row" affordance is permanently visible in column 0
(icon + hint, not hover-gated, matching `alwaysShowIcon = data !== ""`) and correctly hover-fades in
on every other column; clicking the "Add row" text appended a real new row (`row-200000` appeared
with fully-generated content across every cell type -- row-id/number/boolean/uri/markdown/image/
bubble/drilldown/text all rendered correctly for the freshly-appended row) and the trailing row
moved down by exactly one row (`scrollHeight` grew by exactly `34`); Enter-key activation (arrow-
down from a real row onto the trailing row, then Enter) also correctly appended a second new row
(`row-200001`). **Regression-tested per this phase's own instructions** (not just the new feature):
plain arrow-key nav up/down through real rows still works correctly after landing on/leaving the
trailing row; Cmd+A select-all still correctly excludes the trailing row (confirmed via a zoomed
screenshot showing the last real row highlighted and the "Add row" row directly below it NOT
highlighted); a normal cell click-select-activate-edit-Cmd+A-retype-Enter-commit cycle on an
unrelated text column (column 9) still works and correctly moves the selection down one row after
commit. No console errors at any point in this session.

## Phase 5 — Extra cell types + sparklines (research, 2026-08-07)

**Different source package, different registration pattern than Phase 4.** Phase 4's cells live in
`packages/core/src/cells/*.tsx` and register as built-in `GridCellKind` variants
(`InternalCellRenderer<T>`, dispatched by a `switch (cell.kind)`). Phase 5's cells live in a
**separate source package**, `packages/cells/src/cells/*.tsx` (14 files: `article-cell`,
`button-cell`, `date-picker-cell`, `dropdown-cell`, `links-cell`, `multi-select-cell`, `range-cell`,
`sparkline-cell`, `spinner-cell`, `star-cell`, `tags-cell`, `tree-view-cell`, `user-profile-cell` —
13 renderers, `article-cell` splits its type into a separate `article-cell-types.ts`), and every one
of them is a **`CustomRenderer<T>`** (`kind: GridCellKind.Custom`, an `isMatch: (cell: CustomCell) =>
cell is T` predicate, `CustomCell<Props>` data shape with a `kind: "some-string-id"` discriminant
inside `data`) — **not** a new `GridCellKind` enum member. This is source's actual, intentional
"extension" mechanism: `packages/core`'s own `getCellRenderer` (`data-editor.tsx:1112`) does
`additionalRenderers?.find(x => x.isMatch(cell))` as a fallback after checking built-in kinds, where
`additionalRenderers` comes from a consumer-supplied `DataEditorProps.customRenderers?: readonly
CustomRenderer<any>[]` prop — `packages/cells`' `index.ts` exports exactly this: an `allCells` array
of all 13 renderers, meant to be passed straight into that prop.

**Port implication — good news, near-zero `GridHostController` changes needed.** Unlike Phase 4d's
trailing-row work, this port's `getCellRenderer` was already a fully consumer-suppliable plain
function (`GridHostArgs.getCellRenderer`, existing since Phase 2/4a) — there's no `customRenderers`
array + built-in-merge machinery to port, because this port never had the built-in/custom split
source has in the first place (the Phase 4a-4d registry is just one function). So Phase 5 needs:
(1) port each cell as a `CustomRenderer<CustomCell<Props>>` (same `InternalCellRenderer`-adjacent
shape already in `src/rendering/cell-types.ts` from Phase 1 -- `CustomRenderer`/`CustomCell` are
already-ported types, verify but don't re-derive), (2) a small combinator helper --
e.g. `createCombinedCellRenderer(base: GetCellRendererCallback, extras: readonly CustomRenderer<any>[]):
GetCellRendererCallback` that tries `base(cell)` first, then `extras.find(r => r.isMatch(cell))` --
exported from wherever these land (e.g. `src/rendering/extra-cells/index.ts`), (3) wire the demo app
to build its `getCellRenderer` via this combinator instead of using the Phase 4 registry directly.
**No `GridHostController` source changes are anticipated for this phase** -- if a subagent finds one
is actually needed, that's a real finding to document, not something to assume upfront.

**Heavier dependencies in source's `packages/cells/package.json` -- do NOT port these, simplify
instead, matching the markdown-cell/Phase-4b precedent (which correctly skipped ProseMirror for a
plain textarea + `marked`)**:
- `@toast-ui/editor`/`@toast-ui/react-editor` -- used by `article-cell`'s editor for full WYSIWYG
  rich-text editing. Port `article-cell`'s **draw** function faithfully, but give its editor a plain
  `GrowingEntry`-based textarea (same pattern as `text-cell`/`markdown-cell`), not a toast-ui port --
  this is squarely the same class of simplification already established and accepted in this
  project, don't re-litigate it, just apply it.
- `react-select` -- likely used by `dropdown-cell`/`multi-select-cell`'s editors for a searchable/
  multi-select dropdown UI. Simplify to a plain native `<select>` (single) / a set of checkboxes or
  a multi-`<select>` (multi) via plain DOM, no dependency -- same reasoning as above.
- `@linaria/react` -- a CSS-in-JS styling lib used throughout `packages/cells` for component
  styling; irrelevant to a port that already uses inline `style` object assignment throughout
  (`GrowingEntry`, `markdown-div.ts`, etc.) -- ignore entirely, use the same inline-style pattern.

**Priority**: `sparkline-cell` is an explicit user requirement (the "📈 Inline charts (sparklines)"
feature card from grid.glideapps.com, called out in the original request) -- prioritize porting it
correctly and browser-verifying it looks like a real inline chart (line/bar/area graph rendering
from a `values: readonly number[]` array) over the other 12, which are "nice to have full parity"
but not individually named requirements. If time/budget pressure forces a cut, sparkline must not be
the cut.

**Suggested sub-phase split** (mirrors Phase 4's a/b/c/d pattern -- independent files, safe to
parallelize):
- **5a — sparkline + star + range + spinner**: drawing-focused cells, simple or no editors (`star`
  is a click-to-set-rating control much like boolean's click-toggle pattern; `range` is a numeric
  slider; `spinner` is a loading-indicator, likely no editor at all, similar to Phase 4a's
  `loading-cell`). Do the combinator helper here too, since sparkline needs it to be usable at all.
- **5b — tags + dropdown + multi-select + links**: list/selection-style editors (`tags` similar
  to `bubble-cell`'s display but editable; `dropdown`/`multi-select` need the `react-select`
  simplification above; `links` is a list of clickable URLs, similar to a multi-value `uri-cell`).
- **5c — date-picker + button + tree-view + user-profile + article**: the remaining, more bespoke
  ones. `date-picker` likely needs a native `<input type="date">` (check source first -- don't
  assume). `button` is a clickable in-cell action trigger. `tree-view` has expand/collapse state per
  row (check how it stores that -- likely in the cell's own `data`, since this port has no separate
  per-row UI state store anywhere). `user-profile` is likely draw-only (avatar + name), no editor.
  `article` gets the toast-ui simplification above.

Each sub-phase should register its cells in a shared `src/rendering/extra-cells/index.ts` (or
similar -- whoever runs first establishes the file, later ones extend it, same coordination approach
that worked for Phase 4b/4c's `cells/index.ts` when running concurrently) and extend the demo app
with at least one column per new cell type so everything is browser-testable end to end.

## Phase 5a — sparkline/star/range/spinner + the extra-cells combinator (COMPLETE, browser-verified)

**Delivered**: `src/rendering/extra-cells/{sparkline,star,range,spinner}-cell.ts` (each a
`CustomRenderer<CustomCell<Props>>`) + `src/rendering/extra-cells/index.ts` establishing
`allExtraCells`/`createCombinedCellRenderer` (the shared Phase 5 combinator infra described in the
research section above -- ran concurrently with 5b/5c, which extended the same `index.ts`, see
"Concurrent-editing note" below). `createCombinedCellRenderer`'s final, settled API (5b/5c/anything
downstream should treat this as ground truth, matches what was asked for exactly):
```ts
export function createCombinedCellRenderer(
    base: GetCellRendererCallback,
    extras: readonly CustomRenderer<any>[]
): GetCellRendererCallback
```
Tries `base(cell)` first; if `undefined` and `cell.kind === GridCellKind.Custom`, falls back to
`extras.find(r => r.isMatch(cell))`. Also added `createCombinedCellRenderer`/`allExtraCells` to the
top-level `src/rendering/index.ts` barrel (right after the existing `getCellRenderer` export), so
consumers don't need a deep import into `extra-cells/`.

**Demo wiring** (`test-app/app/components/demo-grid.gts`): this is the **first time** `<GlideDataGrid>`
was given an explicit `@getCellRenderer`, built once at module scope as
`createCombinedCellRenderer(defaultGetCellRenderer, allExtraCells)` (where `defaultGetCellRenderer`
is Phase 4's `getCellRenderer`). Demo columns 8-11 (`test-app/app/utils/demo-data.ts`) exercise
sparkline/star/range/spinner respectively -- re-check current column indices before adding more in
a later phase, 5b/5c added columns 12+ concurrently in the same file (tags/dropdown/multi-select/
links, then date-picker/button/tree-view/user-profile/article).

**Per-cell notes**:
- **`sparkline-cell`** (the priority cell, see research section above) -- `draw()` ported verbatim:
  line (quadratic-curve smoothed)/bar/area modes, zero-line, hover crosshair + nearest-value label
  (`displayValues`). Browser-confirmed all three graph kinds render as real, visually distinct
  charts (not blank, not raw numbers) and the hover crosshair value label works. No editor (source
  has none either -- display-only, like `bubble-cell`/`drilldown-cell` in Phase 4c).
- **`star-cell`** -- **deliberately deviates from source's editor-based interaction**: source opens
  a small React overlay (5 clickable star `<svg>`s) that requires activating the cell first.
  Per this port's established `boolean-cell.ts` click-toggle convention (and per this sub-phase's
  own task brief), ported as a **single-click-to-rate** `onClick` hook instead -- no overlay at all,
  `allowOverlay: false` in demo data. Click position is converted to a star index using the exact
  same layout constants `draw()` uses (`STAR_START_OFFSET`/`STAR_SPACING`/`STAR_SIZE`, kept as named
  constants specifically so the two stay in sync). Browser-confirmed: clicking further right along
  the star row increases the rating and immediately redraws (verified 1 star -> 4 stars from one
  click at the right x-offset).
- **`range-cell`** -- `draw()` (gradient-filled rounded track + optional trailing label) ported
  verbatim, reusing `roundedRect`/`measureTextCached`/`getMiddleCenterBias`/`getEmHeight`. One
  correctness fix vs source: `fillRatio` is clamped to `[0,1]` before being used as a
  `CanvasGradient.addColorStop` offset -- source passes it through unclamped, which throws a
  DOMException if `value` is ever outside `[min, max]` (invalid gradient stop). Editor: source's
  native `<input type="range">` (React-rendered) ported to the plain-DOM `CellEditorProps`/
  `CellEditorHandle` factory contract established in Phase 4a -- a `<label>` wrapping a real
  `<input type="range">` + a live value `<span>`, built with `Object.assign(el.style, {...})` like
  `GrowingEntry` (no `@linaria/react`, per the research section's simplification guidance).
  Browser-confirmed end to end: second-click activation opens the editor showing the real native
  slider (screenshotted), setting the input's value via a real `input` event (both a
  `left_click_drag` on the thumb -- which did NOT register, native range inputs don't reliably
  respond to synthesized drag events in this automation environment, use the JS-dispatched-`input`-
  event approach instead, matching this project's established "single-script raw-event dispatch"
  pattern for anything a plain click/drag can't reliably drive) updates the live in-editor value
  label immediately, and clicking outside commits the new value into the cell (redrawn fill width
  updated correctly, confirmed via zoomed before/after screenshots). **Known demo-only quirk, not a
  cell bug**: the demo seeds `label: "N%"` once at cell-creation time; since neither source's nor
  this port's editor `onChange` recomputes `label` from the new `value` (source's own editor has the
  identical omission -- `label` and `value` are independently supplied fields, matching a design
  where a consumer can show a custom label unrelated to the raw percentage), the label text goes
  stale after an edit while the fill-bar width (driven by `value`, not `label`) updates correctly.
  This is faithful to source, not a porting defect -- noted here so nobody "fixes" it as a bug later.
- **`spinner-cell`** -- trivial arc-sweep animation, `draw()` ported verbatim. Confirmed this port's
  existing `requestAnimationFrame`/`AnimationQueue` plumbing (`render/data-grid-render.cells.ts`'s
  `animRequest` + `enqueue?.(allocatedItem)` when `animationFrameRequested` is true, wired since
  Phase 1/2) already fully supports a cell self-re-enqueuing every draw with **zero
  `GridHostController` changes needed** -- exactly what the Phase 5 research section predicted.
  Browser-confirmed animating: two zoomed screenshots 0.35s apart show the arc at visibly different
  rotation angles. (One easy mistake made and corrected during verification: comparing screenshots
  exactly ~1.0s apart showed the *same* angle both times -- not a bug, just an artifact of the
  spinner's progress cycling `performance.now() % 1000`, i.e. exactly period-1000ms, so a ~1-second
  sampling gap aliases back to nearly the same phase. Use a non-integer-second gap when eyeballing
  this kind of animation.)

**Concurrent-editing note (real, not hypothetical -- happened live during this sub-phase)**: 5b's
subagent overwrote `extra-cells/index.ts` with its own from-scratch version (tags/dropdown/multi-
select/links only) partway through this sub-phase's work, silently dropping the sparkline/star/
range/spinner entries that had just been written. Caught via the file-changed system notification
this harness surfaces on an out-of-band edit; re-read the file and hand-merged both sets of imports/
exports/`allExtraCells` entries back together (tagged with `// 5a`/`// 5b` comments for clarity).
5c's subagent later did the same (added its own imports/exports but initially forgot to also add its
5 renderers to the `allExtraCells` array) -- this was **not** fixed by this sub-phase (out of scope,
"don't touch their files"), and self-resolved: a later re-read showed 5c had completed its own
`allExtraCells` entries. **Lesson for future concurrent shared-file work on this project**: this
kind of last-write-wins collision on a shared coordination file is real and will keep happening
under true concurrency -- always re-read the shared file (not just trust your own last-known
content) immediately before every write to it, and expect to merge, not just append.

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean (both in isolation and after 5b/5c's
concurrent changes landed in the same shared files). `pnpm --filter glide-data-grid-ember build`
(rollup + glint declarations) and `pnpm --filter test-app exec vite build` (442 modules) both
succeed. **Browser-verified** (Chrome, dev server on :4200 -- note multiple *other* Chrome tabs
appeared during this session on :4211/:4301, each a **different concurrent agent's own dev server**
doing its own browser verification in the same shared Chrome instance -- left untouched, not this
sub-phase's tabs to manage): sparkline column shows real, visually distinct line/bar/area charts
with a working hover-crosshair value label; star column click-to-rate works; range column's editor
opens a real native slider whose drag-via-JS-`input`-event updates live and persists on commit;
spinner column visibly animates. No console errors at any point (checked via
`read_console_messages` after a fresh reload).

## Phase 5b — tags/dropdown/multi-select/links (COMPLETE, browser-verified)

**Delivered**: `src/rendering/extra-cells/{tags,dropdown,multi-select,links}-cell.ts`, each a
`CustomRenderer<CustomCell<Props>>` per the Phase 5 research section's architecture. Ran
concurrently with 5a/5c against the same shared `extra-cells/index.ts` -- see 5a's "Concurrent-
editing note" above for what actually happened (this sub-phase's own first write to that file
clobbered 5a's just-landed sparkline/star/range/spinner entries; caught via the file-changed
notification and hand-merged all three sub-phases' imports/exports/`allExtraCells` entries back
together, tagged `// 5a`/`// 5b`/`// 5c`). **Lesson reinforced**: on a shared coordination file
under true concurrency, always re-read immediately before every write, never assume your last-known
content is still current -- this happened twice more later in the session (once mid-`Write`, caught
by the tool's own staleness check; the file kept changing further while this sub-phase worked on
unrelated cells, and by the time verification ran, `allExtraCells` already contained all 13
renderers with no further action needed here).

**Per-cell notes**:
- **`tags-cell`** -- unlike `bubble-cell.ts` (Phase 4c, read-only), this one IS genuinely editable,
  and source's own editor for it is *already* a plain checkbox list (no `react-select` involved at
  all for this particular cell) -- so this is a near-verbatim port, not a simplification. Editor:
  one `<label>` per `possibleTags` entry with a real `<input type="checkbox">` (skipped when
  `readonly`) + a colored pill `<div>` that fills with the tag's configured color only when
  selected (matching source's `gdg-selected`/`gdg-unselected` opacity treatment). Draw reused
  `roundedRect`/`measureTextCached`/`getMiddleCenterBias`, same primitives `bubble-cell.ts`/
  `drilldown-cell.ts` already established. Browser-confirmed: opening the editor shows real
  checkboxes matching the cell's current tags; checking "bug" live-recolors its pill from gray to
  its configured orange inside the still-open editor (`onChange` wiring), and committing (click
  outside) redraws the cell with both "urgent" and "bug" pills.
- **`dropdown-cell`** -- **deliberate simplification per the Phase 5 research section**: source's
  editor uses `react-select` for a searchable single-value dropdown; this port uses a plain native
  `<select>` populated with `<option>`s (a leading blank option represents "no selection", since
  source's `allowedValues` can include `undefined`/`null`). `focus()` calls the native
  `showPicker()` where supported as a best-effort "open on focus" affordance (source's
  `openMenuOnFocus`) -- not universally supported, harmless no-op fallback otherwise. Draw is a
  near-verbatim port (plain text of the selected option's label, no dropdown chrome drawn on
  canvas -- matches source, the native `<select>`'s own arrow only appears once editing).
  Committing selects immediately via the `<select>`'s native `change` event -> `onFinishedEditing`
  (no separate "confirm" step, matching source's own `onChange` -> immediate
  `onFinishedEditing` in its `react-select` version). Browser-confirmed: editor opens showing a
  real `<select>` (verified via `tagName === "SELECT"` and its `<option>` list matches
  `allowedValues`), selecting a new value via a dispatched `change` event closes the editor and the
  cell redraws with the new value.
- **`multi-select-cell`** -- **deliberate simplification per the Phase 5 research section**:
  source's editor uses `react-select`/`react-select/creatable` (searchable multi-select + optional
  free-text creation, plus an internal value-prefixing scheme purely for react-select's own
  duplicate-key handling when `allowDuplicates` is set). This port uses a plain native
  `<select multiple>` (ctrl/cmd-click or drag to multi-select, no search) plus, when
  `allowCreation` is set, a small text input + "Add" button appending values outside the configured
  `options` list. **Known simplification, not reachable via this editor's UI**: a native
  multi-`<select>` cannot represent the same option selected twice, so `allowDuplicates` is honored
  by `onPaste` (which parses a plain comma-separated string, duplicates and all) but not by this
  editor -- low-risk, rarely-hit edge case, noted rather than silently dropped. Draw/measure are
  near-verbatim ports of source's canvas drawing (colored pills, `getLuminance`-based black/white
  text contrast against custom option colors). Browser-confirmed: editor opens showing a real
  `<select multiple>` with "Chrome" pre-selected; programmatically multi-selecting "Chrome"+
  "Firefox" plus typing "brave" into the add-input and clicking "Add" all update the live selection
  (`select.selectedOptions` reflected all three immediately); committing redraws the cell with three
  pills -- "Chrome"/"Firefox" in their configured colors, "brave" in the default gray (not a
  configured option), confirming both the draw's color-lookup fallback and the create-new-value
  flow work end to end.
- **`links-cell`** -- a list of clickable comma-separated titles in one cell, distinct from
  `tags-cell`/`multi-select-cell` (plain underlined text on hover, not colored pills) and from
  `uri-cell.ts` (Phase 4b, single URL) -- holds a `links: {title, href?, onClick?}[]` array.
  `draw`/hover-hit-test (`needsHover: true`, `needsHoverPosition: true`)/`onClick` dispatch are a
  near-verbatim port of source, reusing the exact same `onClick`-dispatch wiring `uri-cell.ts`
  already exercises in this port (see that cell's PORTING-NOTES.md entry for the mechanism).
  **Same pre-existing gap `uri-cell.ts` already hit, not introduced here**: `GridHostController`'s
  click dispatch only wires `renderer.onClick`, not `onSelect` -- this cell's `onSelect` is ported
  for source-fidelity but is dead code in this port, exactly like `uri-cell.ts`'s. Editor: a plain
  stateful DOM factory porting source's `LinksCellEditorStyle`/`LinkTitleEditor` -- one title+URL
  `<input>` pair per link (with a delete "✕" button once there's more than one link), an "Add link"
  button (disabled once `maxLinks` is reached), no `react-select` involved in source for this cell
  either (only `@linaria/react` styling, dropped in favor of inline `style` assignment per the
  research section's guidance). Browser-confirmed: hovering the first link's title text draws a
  real underline (confirming the hover-position hit-test math); clicking opens the editor showing
  real `<input>` pairs matching `{title, href}` for both links plus a working "Add link" button;
  editing the first title via a dispatched `input` event and clicking outside commits, redrawing
  the cell with the new title text (verified via zoomed before/after screenshots).

**Demo wiring** (`test-app/app/utils/demo-data.ts`): columns 12 (tags, 1-3 tags from a 5-tag/color
pool), 13 (dropdown, cycling 4 status options), 14 (multi-select, 1-3 browser-name pills from a
4-option/color pool, `allowCreation: true` so the "Add" affordance is exercised), 15 (links, 2
links per row, deliberately no real click-navigation wired -- same reasoning as column 3's uri cell,
avoids spawning real browser tabs/navigation during automated click-testing). Columns 12-15 chosen
after re-reading the file's live state immediately before editing (8-11 were already 5a's).

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean (one real type error caught and fixed
along the way: `dropdown-cell.ts`'s `optionLabel` helper did `opt?.toString()` inside a branch where
`opt`'s narrowed type was exactly `null | undefined`, which `noUncheckedIndexedAccess`-adjacent
strictness flagged as `Property 'toString' does not exist on type 'never'` -- fixed by returning
`""` directly instead of calling a method through the exhausted union). `pnpm --filter
glide-data-grid-ember build` (rollup) and `pnpm --filter test-app exec vite build` (442 modules)
both succeed, re-verified after 5a's and 5c's concurrent changes had also landed in the same shared
files. **Browser-verified** on a separate dev server (port 4211, since :4200 was already running
another concurrent agent's session -- per this project's now-recurring pattern of multiple agents
each running their own dev server against the same shared addon dist in the same Chrome instance):
all four columns render correctly (colored tag pills, plain dropdown text, colored multi-select
pills, underlined-on-hover link titles); all four editors open real DOM (checkboxes, native
`<select>`, native `<select multiple>`, title/URL input pairs) and commit edits that visibly redraw
the cell. No console errors. **Real, recurring environment quirk hit repeatedly this session**: the
`computer` tool's `left_click` action intermittently spawned a stray `chrome://newtab/` tab in this
session's tab group alongside the intended click landing correctly -- closed each one as it
appeared via `tabs_close_mcp`; did not affect the underlying test correctness (confirmed via
`javascript_tool` DOM inspection alongside every screenshot), but cost extra round-trips. Also hit:
the shared browser tab group was auto-removed mid-session when a concurrent agent closed what turned
out to be the group's last tab (per `tabs_close_mcp`'s own documented behavior) -- recovered by
calling `tabs_context_mcp({createIfEmpty: true})` again and re-navigating. **Worth flagging for
future concurrent browser-testing on this project**: since `claude-in-chrome`'s tab group is shared
across concurrently-running agents in the same session tree (not one browser context per agent),
expect tabs you didn't create to appear/disappear, and don't `tabs_close_mcp` anything you didn't
open yourself.

## Phase 5c — date-picker/button/tree-view/user-profile/article (COMPLETE, browser-verified)

**Delivered**: `src/rendering/extra-cells/{date-picker,button,tree-view,user-profile,article}-cell.ts`,
each a `CustomRenderer<CustomCell<Props>>` per the Phase 5 research section's architecture. Ran
concurrently with 5a/5b against the same shared `extra-cells/index.ts` -- by the time this sub-phase
started, the file already existed (5a had created it); re-read it fresh immediately before every
edit (per the "always re-read before writing a shared coordination file" lesson already documented
above) and both times found 5a's and then 5b's entries already present, so this sub-phase only ever
appended its own `// 5c` import/export/`allExtraCells` block, never clobbered anyone else's.

**Per-cell notes**:
- **`date-picker-cell`** -- source's editor is a single native `<input>` whose `type` attribute is
  driven directly by the cell's own `format: "date" | "time" | "datetime-local"` field (not three
  separate editor implementations) -- ported as a plain `document.createElement("input")` with that
  `type` set dynamically, no dependency needed either way. `formatValueForHTMLInput` (ISO-string
  slicing per format, with a timezone-offset adjustment) ported verbatim. Readonly case reuses this
  port's established "disabled `GrowingEntry`" pattern (same one `text-cell.ts`'s readonly editor
  uses) in place of source's `TextCellEntry` (never ported to this port at all -- not needed
  anywhere else). **Two real bugs found via browser testing, both fixed, worth flagging for anyone
  porting a display-string-plus-underlying-value cell type in a future phase**:
  1. **The column rendered completely blank** -- `draw()` called `drawTextCell(args, displayDate,
     ...)` but never set `ctx.fillStyle` and had no `drawPrep`. `drawTextCell` itself
     (`render/data-grid-lib.ts`) never sets `fillStyle` -- every other text-drawing cell in this
     port either supplies `drawPrep: prepTextCell` (sets `fillStyle = theme.textDark`) or sets it
     inline before calling `drawTextCell`/`fillText`. Omitting both meant the cell painted with
     whatever `fillStyle` the *previous* cell drawn on the canvas happened to leave behind, which in
     practice was reliably invisible -- no error, no warning, just a blank column that looked like a
     matching/registration failure but wasn't. Fixed by adding `drawPrep: prepTextCell`. **Lesson**:
     any new cell whose `draw()` calls `drawTextCell`/`fillText` needs an explicit `fillStyle`
     source (either `drawPrep: prepTextCell` or an inline `ctx.fillStyle = theme.textDark` set) --
     it is never implied, and a missing one fails silently, not loudly.
  2. **Editing or pasting a new date didn't visibly update the cell.** Both the editor's `input`
     `change` listener and `onPaste` only updated `data.date` (the underlying `Date`), never
     `data.displayDate` (the string `draw()` actually reads) -- exactly the same class of bug
     already fixed for `text-cell.ts`/`uri-cell.ts` in Phase 4a/4b (source itself has this same gap;
     it doesn't surface as a visible bug there because source's hypothetical re-render path differs,
     but it's real and reproducible in this port's canvas-reads-`displayDate` model). Fixed by
     deriving a fresh `displayDate` (via `formatValueForHTMLInput`) alongside `date` in both places.
     Confirmed via a synthetic `input`-event commit in the editor (value visibly updated) --
     **paste specifically was verified via the code path/type-checking only, not an actual browser
     round-trip**: a synthetic `ClipboardEvent`+`DataTransfer` dispatched at `window` in this
     session's browser-automation environment reported `preventDefault()` having fired (implying the
     paste handler ran and computed a real edit) but never visibly redrew *any* column tested this
     way, including a plain `Number` cell whose paste path predates this phase entirely and was
     already "browser-verified" in Phase 3c -- strong evidence the synthetic-clipboard-event test
     method itself doesn't reliably exercise this port's paste pipeline in this sandbox, not that
     paste is broken (consistent with this project's already-documented clipboard-API flakiness in
     this specific browser-automation setup). Not spending further budget chasing that test
     harness; the `displayDate` fix itself is small, type-checked, and mirrors an already-established,
     already-verified-in-a-different-cell pattern.
- **`button-cell`** -- an in-cell action trigger, **not a boolean-style toggle**: `cell.data.onClick`
  is a plain `() => void` side-effecting callback carried on the cell's own `data`, invoked directly
  by the renderer's `onClick` hook when the pointer is over the button's interior region --
  `onClick` always returns `undefined` (no cell mutation), unlike `boolean-cell.ts`'s `onClick`
  which returns a new cell to toggle. `onSelect` unconditionally calls `preventDefault()` to suppress
  the normal activation/overlay path (there is no editor -- `ButtonCell` is `readonly: true` and
  `provideEditor: undefined`, matching source). Draw ports the rounded-rect button + hover-fade
  animation verbatim, reusing this port's `roundedRect` (`render/data-grid-lib.ts`, already had a
  compatible signature) and `interpolateColors` (`color-parser.ts`). Browser-confirmed: clicking a
  button cell logs `[demo] button-cell clicked, row N` to the console (verified via
  `read_console_messages`) with zero cell mutation/redraw, exactly the "fire a callback, don't edit
  the cell" contract described above.
- **`tree-view-cell`** -- the most structurally novel of this sub-phase's five, see the file's own
  header comment for the full writeup; condensed here since **future phases/consumers need this**:
  **expand/collapse state (`isOpen`/`canOpen`/`depth`) lives entirely in the cell's own `data`**,
  exactly like source -- there is no separate per-row tree/UI-state store anywhere in this port (nor
  in source's own `packages/cells` layer). The disclosure triangle's click handler,
  `onClickOpener: (cell: TreeViewCell) => TreeViewCell | undefined`, is *also* carried on `data`;
  clicking it calls that function and the renderer's `onClick` hook returns whatever `TreeViewCell`
  comes back, which `GridHostController.dispatchCellMouseDown` already commits via `commitCellEdit`
  -> `args.onCellsEdited?.(...)` (unchanged Phase 4a plumbing -- no host changes needed here either,
  confirming the Phase 5 research section's prediction). **What this port does NOT add**: any
  grid-level "tree" feature such as automatic row hide/show when a parent collapses -- that
  bookkeeping (which rows are currently visible) is entirely a consumer concern, same as source; the
  demo (`test-app/app/utils/demo-data.ts`, column 18) only toggles `isOpen` on click and does not
  hide/show any rows, deliberately, to keep the demo's `getCellContent` a pure function of `[col,
  row]` matching every other column's convention. Browser-confirmed: clicking Folder 0's disclosure
  triangle flips it from a closed `>` chevron to an open `v` chevron and the edit persists (matches
  `DemoGrid`'s `edits` override map, same mechanism every other edit uses).
- **`user-profile-cell`** -- mostly draw-only as expected (tinted initial-letter circle + optional
  avatar image via the already-ported `ImageWindowLoader.loadOrGetImage(image, col, row)`, same
  primitive `image-cell.ts` uses), but source DOES give it a small editor for just the `name` field
  (not avatar/initial/tint) -- ported as a plain `GrowingEntry` in place of source's `TextCellEntry`.
  Browser-confirmed: avatar circles render with visible tint + initial + name text; clicking opens
  an editable text field with the current name select-all-highlighted (`GrowingEntry`'s
  `highlight: true` behavior).
- **`article-cell`** -- **the toast-ui simplification already agreed in the Phase 5 research
  section, applied here**: source's real editor (`article-cell-editor.tsx`) is a full
  `@toast-ui/editor` WYSIWYG rich-text editor with a separate readonly `Viewer` mode, lazy-loaded via
  `React.lazy`/`Suspense`; not ported. `ArticleCellProps` has exactly one field besides `kind` --
  `markdown: string` -- there is no separate title field in source to preserve, so the replacement
  editor is correspondingly single-field: a `GrowingEntry`-based `<textarea>` plus Close/Save buttons
  mirroring source's own footer (translated from source's `@linaria/react` CSS-in-JS to inline
  `style` assignment, this port's established convention). `draw()` (first-line-only,
  `rect.width / 4`-char-truncated preview) ported verbatim. **Known size limitation vs. source,
  worth flagging**: source's `provideEditor` sets a `styleOverride` making its editor a fixed-position
  ~75vw x 75vh full-viewport box; this port's `CellEditorProps`/overlay-host contract has a
  `styleOverride` field that `grid-host-controller.ts`'s `openOverlay` documents as "unused/
  unguessed" and the host's container is unconditionally capped at `maxWidth: 400px` regardless of
  what any renderer passes there -- so this editor is a normal-size (not full-viewport) box with an
  explicit `min-height` so it's still comfortably usable, relying on the host's `overflow: auto` for
  longer content. Wiring `styleOverride` through the overlay host (a small, contained change) would
  let this -- and any future large-surface editor -- grow to source's full-viewport size; flagged as
  a good target for a future phase, not done here since it's shared-infra scope creep beyond this
  sub-phase's five cells. Browser-confirmed: the editor opens showing the cell's full markdown text
  in a real textarea with working Close (discards) and Save (commits) buttons.

**Bonus fix, shared infra, done carefully given the "don't touch others' files" constraint**:
`GridHostController.pasteValueIntoCell` (`src/-private/grid-host-controller.ts`) had a `default`
case whose comment claimed `GridCellKind.Custom` was "not writable via `isReadWriteCell` anyway" --
false: `isReadWriteCell` (`data-grid-types.ts`) explicitly includes `GridCellKind.Custom` (`readonly
!== true`). The `default` branch's unconditional `return undefined` therefore silently made paste
into *every* `CustomRenderer` cell across all of Phase 5 (5a/5b/5c, 13 cell types total) a no-op,
regardless of whether that cell defined its own `onPaste`. Added a real `GridCellKind.Custom` case
that looks up the matching renderer via `args.getCellRenderer(existing)` and dispatches to its
`onPaste(raw, existing.data)`, same mechanism source uses (`CustomRenderer<T>["onPaste"]`). Required
threading `args` (already in scope at the one call site, `onPaste`'s clipboard-paste handler) into
`pasteValueIntoCell`, which didn't previously need it. Verified via `tsc`/build only, not an
end-to-end browser round-trip -- see `date-picker-cell`'s notes above for why (the synthetic-
clipboard-event test method itself appears unreliable in this session's browser-automation sandbox,
not specific to this fix). Touches only `grid-host-controller.ts`, which no other Phase 5 sub-phase
owns or edited, checked via `git diff --stat` immediately before this fix and again before
committing.

**Demo wiring** (`test-app/app/utils/demo-data.ts`): columns 16 (date-picker, alternating
date-only/date+time format by row), 17 (button, logs to console on click), 18 (tree-view, a
synthetic 3-level depth-by-`row % 3` folder/subfolder/file structure), 19 (user-profile, cycling
through 5 named avatars with an inlined data-URI image), 20 (article, reusing the same
`MARKDOWN_SAMPLES` Phase 4b's markdown column uses). Columns 16-20 chosen after re-reading the
file's live state immediately before editing (5b's columns 12-15 were already present by the time
this sub-phase started).

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean (one real error caught and fixed along
the way, in this sub-phase's own code: `formatValueForHTMLInput`'s `isoDate.split("T")[N]` indexing
needed `?? ""` fallbacks under this project's indexed-access strictness). `pnpm --filter
glide-data-grid-ember build` (rollup) and `pnpm --filter test-app exec vite build` (442 modules)
both succeed. **Browser-verified** on a separate dev server (port 4301, since :4200/:4211 were
already running other concurrent agents' sessions) -- all five columns render real, non-blank
content (dates, blue buttons, indented folder/file rows with disclosure carets, avatar+name pairs,
markdown previews); date-picker's editor opens a real native `<input type="date">`/
`<input type="datetime-local">` with the calendar picker visible; article's editor opens a real
textarea with the full markdown body and working Close/Save; tree-view's disclosure triangle click
toggles and persists; button's click fires its callback (confirmed via console log) with no
unintended cell mutation. No console errors at any point. **Same shared-Chrome-tab-group quirks as
5a/5b hit again here** (tabs created by this sub-phase intermittently vanished or got silently
re-navigated to a *different* concurrent agent's dev-server port by the time the next tool call
ran, sometimes within the same single-digit-second gap between two calls) -- worked around by always
re-confirming `window.location.href` via `javascript_tool` immediately before trusting any
screenshot, and packing navigate+act+screenshot into as few round-trips as possible
(`browser_batch`) to minimize the window for another agent's tab operations to interfere. Recreating
a fresh tab (`tabs_context_mcp({createIfEmpty: true})`) after a tab vanished worked reliably every
time; fighting to keep reusing a specific tab ID did not.

## Phase 6 — Theming (COMPLETE, browser-verified, 2026-08-07)

Consumer-facing theming API + docs. **The main deliverable a consumer sees is the cookbook's
*Theming* and *Theme reference* chapters** (`test-app/app/utils/cookbook/theming.ts` and
`theme-reference.ts`) — read those before answering any "how do I theme this" question; this section
is the implementation/porting record, not the user guide. *(Until 2026-08-09 that deliverable was
`glide-data-grid-ember/THEMING.md`, which has since been migrated into those two chapters and
deleted — references to it below are historical.)*

### Final API surface (use this, don't re-read the code)

All from the `glide-data-grid-ember/rendering/index` barrel:

```ts
getDataEditorTheme(): Theme                 // pre-existing (Phase 1) -- the complete light base
getDataEditorDarkTheme(): Partial<Theme>    // NEW -- stock dark theme, an OVERLAY not a full theme
mergeAndRealizeTheme(theme, ...overlays): FullTheme   // pre-existing
makeCSSStyle(theme: Theme): Record<string, string>    // NEW -- the `--gdg-*` map
type GetRowThemeCallback = (row: number) => Partial<Theme> | undefined  // NEW re-export
```

New `<GlideDataGrid>` / `GridHostArgs` field (only one): `getRowThemeOverride?: GetRowThemeCallback`.
Everything else in the theming story was already reachable: `@theme`, `column.themeOverride`,
`cell.themeOverride`.

New private helpers on `GridHostController` (`src/-private/grid-host-controller.ts`) that later
phases should reuse rather than re-deriving a merge order:
- `mergedTheme(args): FullTheme` — base + `@theme`. **Memoized on `args.theme` identity** (see the
  blit section below — this is load-bearing, not a micro-opt). Mirrors source's
  `React.useMemo(() => mergeAndRealizeTheme(getDataEditorTheme(), theme), [theme])`
  (`data-editor.tsx:1093`).
- `themeForCell(args, cell, mangledCol, row): FullTheme` — the full per-cell merge, in the exact
  order the render engine uses: `mergeAndRealizeTheme(mergedTheme, column.themeOverride,
  getRowThemeOverride(row), cell.themeOverride)`. Group themes are omitted only because
  `ENABLE_GROUPS` is hardcoded `false` project-wide. `mangledCol` is in the **render engine's**
  column space (includes the row-marker column), same space as `computeCellRect`.
- `applyThemeCssVariables(el, theme)` — stamps `makeCSSStyle`'s output via `el.style.setProperty`.

### Real bug found and fixed (task 4): the overlay editor ignored every theme override

`openOverlay` handed the editor `mergeAndRealizeTheme(getDataEditorTheme(), args.theme)` — the
base+global theme only, with **no column/row/cell override applied**. Practical symptom: an editor
opened on a dark-themed row rendered with light-theme colors; an editor on a themed column ignored
that column's colors entirely. Source does not have this gap — its `setOverlaySimple`
(`data-editor.tsx:1428-1441`) merges `mergedTheme, groupTheme, colTheme, rowTheme,
content.themeOverride`, i.e. the same order as `themeForCell` above (verified by reading source
before changing anything, per the task brief). **Fixed**: `openOverlay` now uses `themeForCell`.
Two adjacent sites were fixed the same way while there:
- the renderer `onClick` dispatch in `dispatchCellMouseDown` also used the global-only theme, even
  though several renderers hit-test against theme-derived geometry (`cellHorizontalPadding`,
  `checkboxMaxSize`, …) that an override can change. Now uses `themeForCell` too.
- `hitTestHeaderMenu`'s `computeHeaderLayout` call now uses `mergeAndRealizeTheme(mergedTheme,
  column.themeOverride)`, matching how headers are actually drawn
  (`render/data-grid-render.header.ts:65-69`).

Browser-confirmed after the fix: with the dark theme on, opening the editor on demo column 1 (which
has a `themeOverride`) at an odd (zebra-striped) row gives container background
`rgb(73,62,49)` (dark base + zebra blue + column amber, correctly composed), text `#b06a00`
(the column override's `textDark`), border `#8c96ff` (the dark theme's `accentColor`) — versus the
white/`#313139`/`#4F5DFF` it produced before.

### Task 3 result: per-column and per-cell `themeOverride` were already working

Verified in the browser, not just read: `normalizeColumns`'s `...c` spread and `mapColumns`'
`themeOverride` forwarding really do carry a column override end to end, and `cell.themeOverride`
flows straight from the consumer's `getCellContent` into the draw loop. No fix needed for the
*canvas* rendering of either. (Their absence from the *overlay editor* was the real gap — above.)

### `makeCSSStyle` / `--gdg-*` (task 5)

Ported verbatim from `common/styles.ts:7`. Applied at source's two sites: the grid **root element**
(global theme, mirrors `data-editor.tsx:4215`) and **each overlay-editor container** (that cell's
fully-merged theme, mirrors `data-grid-overlay-editor.tsx:237`). 37 variables land on each;
confirmed in-browser via `getComputedStyle`. The root stamp is identity-guarded on the memoized
theme object so it is a no-op on ordinary scroll/hover redraws instead of ~37 `setProperty` calls
per frame. Nothing in the grid's own rendering consumes these — they exist purely so consumers can
style surrounding/overlaid DOM from the grid's resolved theme.

### MAJOR pre-existing finding: `computeCanBlit` compares `DrawGridArg` fields by IDENTITY, and this port was failing that check every frame

This is the most important thing in this section for future phases. `computeCanBlit`
(`src/rendering/render/data-grid-render.blit.ts:233-254`) gates the **scroll blit fast path** — the
optimization that translates the previous frame's canvas image and repaints only the newly exposed
strip, instead of redrawing every visible cell. It compares ~18 `DrawGridArg` fields with `!==`,
i.e. **object identity, not value equality**. Source gets away with this because every one of those
values is a React `useMemo`/`useCallback` result; this port's `runDraw` was rebuilding three of them
from scratch on every single draw:

1. `theme` — `mergeAndRealizeTheme(...)` returns a brand-new object on every call.
2. `verticalBorder` — was a literal inline `() => true` in the `DrawGridArg` object literal.
3. `getCellContent` — `mangledGetCellContent(args)` returns a fresh closure whenever `rowMarkers`
   or `showTrailingBlankRow` is enabled (the demo enables the latter).

Any one of those alone makes `computeCanBlit` return `false` unconditionally, so **the blit fast
path had never engaged in this port** — scrolling was doing a full repaint of the visible window
every frame. Given that "performance parity, especially scroll performance" is an explicit original
requirement, this was worth fixing here rather than deferring.

**Fixed** (all in `grid-host-controller.ts`): `mergedTheme()` is memoized on `args.theme` identity;
`verticalBorder` is now the module-scope `ALWAYS_VERTICAL_BORDER` constant; `mangledGetCellContent`
is memoized on exactly the values its closure captures (`getCellContent`/`hasRowMarkers`/
`showTrailingBlankRow`/`rows`/`rowMarkers`/`rowMarkerOffset` — deliberately *not* on `this.selection`,
which the closure reads lazily and which `computeCanBlit` compares separately anyway).

**Verified in-browser after the fix**: instrumented `computeCanBlit` to record which fields differ,
then drove a real `computer`-tool scroll — the only differing field is now `mappedColumns`, which
falls into `computeCanBlit`'s own deep-equal branch and returns `true` when no column actually
changed. So the blit path now engages during scroll. (Instrumentation was removed afterwards;
`git status` confirms both `render/` files are unmodified.)

`mappedColumns` is still a fresh array every draw (`mapColumns` in `computeMangledLayout`), which
costs a `deepEqual` over every column per frame. That's correct but wasteful, and note
`computeCanBlit` bails out entirely (`return false`) once `mappedColumns.length > 100` — **a grid
with more than 100 columns therefore still gets no blit at all**. Memoizing `computeMangledLayout`
on `columns`/`freezeColumns`/marker-state identity would fix both; not done here (it's Phase 4d/3a
mangling infra, out of a theming phase's scope). Flagged as a good perf follow-up.

**Rule for every future phase: any value put into `DrawGridArg` must be identity-stable across
draws unless it genuinely changed.** Check `computeCanBlit`'s field list before adding or touching
one. A freshly-allocated object/closure there silently costs the whole scroll optimization with no
error, no warning, and no visual difference.

### Browser-testing gotcha that cost real time here (add to the existing browser-quirks knowledge)

`javascript_tool` runs in the Chrome extension's **isolated world**, not the page's main world.
Consequences hit repeatedly this phase:
- Monkeypatching a **prototype** (e.g. `CanvasRenderingContext2D.prototype.drawImage`) from
  `javascript_tool` does **not** affect page code — JS prototypes are per-world. A "0 calls"
  measurement taken that way is meaningless, not a real result.
- `globalThis.__foo` set by page code is **invisible** to `javascript_tool`, and vice versa. Use the
  **DOM** as the bridge (`document.documentElement.setAttribute(...)` from page code) — DOM objects
  *are* shared.
- Even then, reading via the `dataset` DOMStringMap proxy returned stale values across calls in this
  environment; `getAttribute()` read correctly. Prefer `getAttribute`.
- Setting `scrollerEl.scrollTop` from `javascript_tool` scrolls the element but did **not** reliably
  drive the page's `scroll` listener / redraw path. A real `computer` `scroll` action did. Same
  class of issue as the already-documented `.focus()`-doesn't-fire-`focus` quirk.

Also re-confirmed the hard way: **rebuilding the addon while the dev server is running is not
enough** — the already-documented "addon-consumed-via-built-dist" gotcha bit again, and the browser
additionally kept executing cached ES modules across plain reloads. The reliable loop is
kill server → `rm -rf test-app/node_modules/.vite` → restart → navigate with a **fresh query string**
(`?cb=<random>`) to defeat the page-level cache.

### Gotcha: the addon's `README.md` is a build artifact, don't edit it

`glide-data-grid-ember/README.md` (and `LICENSE.md`) are **gitignored copies** — see
`glide-data-grid-ember/.gitignore`, which lists `/README.md` and `/LICENSE.md`. The authoritative
file is the **monorepo root** `README.md`, and `pnpm --filter glide-data-grid-ember build` copies it
down into the addon package so it also ships to npm. Editing the addon-level copy looks like it
works and is then silently clobbered by the next build (this cost a round-trip here). Edit the root
`README.md`. *(That README no longer links to `THEMING.md`/`DATA.md`: both were migrated into the
cookbook and deleted on 2026-08-09, so it links to the deployed cookbook chapters instead. The
build-artifact rule itself is unchanged and still load-bearing.)*

### Demo wiring

`test-app/app/components/demo-grid.gts`: a real light/dark toggle button (`@tracked isDark`, a
`theme` getter returning module-scope `DARK_THEME` or `undefined`), plus
`@getRowThemeOverride={{this.getRowThemeOverride}}` bound to a **module-scope function**
(`demoGetRowThemeOverride` in `demo-data.ts`) — deliberately, per the identity rule above. The grid
is now wrapped in a flex column so the button sits above it.
`test-app/app/utils/demo-data.ts`: column 1 carries a `themeOverride` (translucent amber `bgCell` +
amber `textDark` + semibold `baseFontStyle`); `demoGetRowThemeOverride` zebra-stripes odd rows with
a translucent `bgCell`; column 0's `RowID` cell carries a per-cell `themeOverride` (red) on every
10th row. All three levels are visible simultaneously and compose correctly in both themes.

**Why the overrides use translucent `bgCell`**: `mergeAndRealizeTheme` treats `bgCell` specially and
**blends** an overlay's value over the value beneath it rather than replacing it (every other field
is a plain overwrite). An alpha tint therefore reads correctly over both the light and the dark
base; a solid color would flatten whatever a less-specific level set. Worth knowing before writing
any theme override.

### Deliberately NOT done (out of scope, restating so nobody assumes otherwise)

Column/row-grouping theming (`ENABLE_GROUPS` is `false` project-wide — `textGroupHeader`/
`bgGroupHeader`/`bgGroupHeaderHovered` are emitted as CSS variables but never drawn), search-result
theming (`bgSearchResult`, same situation), a theme *service* / Ember context or provider (the
port's model is plain args, deliberately unchanged), `styleOverride` plumbing through the overlay
host (still the separate Phase 9 item flagged in Phase 5c's notes), and any theme beyond
light + the stock dark one.

### Verification

`npx tsc --noEmit -p tsconfig.json` clean, `pnpm --filter glide-data-grid-ember build` (rollup +
glint declarations) succeeds, `pnpm --filter test-app exec vite build` succeeds (442 modules, no new
errors). **Browser-verified** on a dedicated dev server (port 4321 — :4200 was another concurrent
agent's, checked with `lsof` first) after a full kill/clear-`.vite`/restart:
- dark toggle visibly repaints cells, headers, gridlines and text (root `--gdg-bg-cell` flips
  `#FFFFFF` → `#16161b`, `--gdg-accent-color` `#4F5DFF` → `#8c96ff`)
- zebra `getRowThemeOverride` visibly alternates, and keeps alternating correctly at row 5000+ after
  a large scroll
- the per-column override on column 1 and the per-cell override on every 10th row of column 0 are
  both visibly distinct, and compose with the row override rather than fighting it
- 37 `--gdg-*` variables confirmed present on the root element and on the overlay container
  (`getComputedStyle`), with the overlay's carrying the merged per-cell values
- the overlay-editor theme fix confirmed with concrete computed values (above)
- regressions checked: vertical + horizontal scroll (sticky header holds), click-select,
  shift-click range selection, second-click activation → type → Enter commit (value updated on the
  canvas, selection advanced one row), Escape cancel. No console errors at any point.

### Independently re-verified by the orchestrator (not just the implementing agent's self-report)

Re-ran `tsc`/rollup/vite builds (all clean, 442 modules) and did a separate browser pass. Confirmed
directly, beyond what the agent reported:
- **`git status` shows `src/rendering/render/**` untouched** — the blit instrumentation really was
  removed, not left behind.
- **The `mangledGetCellContent` memoization is sound.** Audited the closure line by line: it reads
  exactly `showTrailingBlankRow`, `rows`, `hasRowMarkers`, `rowMarkers`, `getCellContent` and the
  destructured `rowMarkerOffset` off the captured `args`, and *every one of those is in the cache
  key* — so the captured (potentially stale) `args` object can never disagree with the live one.
  `this.selection` is read lazily through `this`, so the marker checkbox state can't go stale
  either. This is the one genuinely dangerous change in the phase (a memoized cell-content closure
  that missed a key would silently serve stale cell data), so it was checked rather than trusted.
- **`makeCSSStyle` is byte-for-byte identical to source's**, including the three conditional spreads.
- **The overlay merge order matches source exactly** — verified `setOverlaySimple`
  (`data-editor.tsx:1428-1441`) merges `mergedTheme, groupTheme, colTheme, rowTheme,
  content.themeOverride`; `themeForCell` reproduces it with only `groupTheme` omitted, consistent
  with `ENABLE_GROUPS` being off project-wide.
- **Blit correctness under first-time activation.** This is the risk the agent's own field-diff
  check could not cover: the blit fast path had *never* executed in this port before, so enabling it
  meant exercising `data-grid-render.blit.ts` in anger for the first time. Real wheel-scroll in both
  axes at 200k rows showed no torn/stale strips, and the zebra/column/cell overrides kept alternating
  correctly across the newly-exposed edge strips (a wrong blit shows up here first, as a band of
  rows carrying the previous frame's row theme). Trailing "Add row" still renders and mangles
  correctly at row 200,000 under the memoized closure.

**Useful verification technique, reusable for any future theme/merge fix**: rather than eyeballing a
screenshot, walk the DOM ancestor chain from the open editor collecting elements with inline
`--gdg-*` properties. That yields a direct, non-visual proof of the merge: the grid root showed the
*global* theme (`--gdg-bg-cell: #16161b`) while the overlay container showed the *per-cell merged*
theme (`rgba(73,62,49)`, dark blended with the column's amber override, plus `--gdg-text-dark:
#b06a00`). Two different stamped values on two nested elements is exactly the thing the fix claims
to produce, and a screenshot can't distinguish it from a coincidence.

## Standing lessons for orchestrators and subagents (added Phase 6 — read alongside the top section)

**1. Identity-compared fields are a silent-performance-regression class — check for them whenever you
touch `DrawGridArg`.** `computeCanBlit` (`render/data-grid-render.blit.ts:233-250`) compares ~18
`DrawGridArg` fields **by identity**, and a single freshly-allocated value among them makes it return
`false` forever. This port shipped three such allocations (`theme`, `verticalBorder`,
`getCellContent`) from Phase 2 through Phase 5 — the scroll blit fast path never once engaged, and
**nothing caught it**: `tsc` passes, all builds pass, every browser test passes, and the grid looks
and behaves perfectly. It is invisible to every check this project runs. Source is immune only
because React's `useMemo` makes the equivalent values reference-stable by construction, so a faithful
port of the *logic* silently loses the *performance contract* around it. Before adding or changing a
`DrawGridArg` field, read `computeCanBlit` and confirm whether your field is identity-compared; if it
is, it must come from a memo/cache or module scope, never an inline literal or closure. The same
reasoning applies to any consumer-facing callback arg (hence the "hoist `getRowThemeOverride` to a
stable reference" guidance in `THEMING.md`).

**2. Keep `CLAUDE.md`'s status block in the per-phase update ritual.** The established ritual updated
`PHASES.md` and `PORTING-NOTES.md` after every phase but not `CLAUDE.md` — so by Phase 6 its "Current
status" section still announced "Phases 0–3 complete" and pointed a cold-starting session at
`-temp-text-cell-renderer.ts`, a file deleted back in Phase 4a. That is worse than stale, it is
actively misleading, and `CLAUDE.md` is the one file a fresh session reads *first* and trusts most.
**Update all three files when a phase lands**, not two.

**3. Pre-establish "already works — verify, don't rebuild" facts in subagent prompts.** Phase 6's
prompt stated up front that per-column and per-cell `themeOverride` were already wired end to end
(with the file:line evidence) and that the agent's job was to confirm them in the browser. Without
that, the natural reading of "build the theming system" is to build all three override levels from
scratch, rediscovering two-thirds of an already-working system. Spending orchestrator time locating
the existing hook points *before* delegating is consistently cheaper than the agent rediscovering
them — and it converts a vague scope into a checkable one.

**4. Let a subagent's honest "I did not test X" stand, and cover X yourself.** Phase 6's agent
explicitly flagged that it had not tested row markers, resize/reorder or copy/paste, and that its
blit fix was confirmed by field-diff rather than a frame benchmark. That candour is what made it
obvious where the orchestrator's own verification pass had to go (first-time blit activation under
real scroll). An agent that had rounded those caveats up to "fully verified" would have been far more
expensive, not less — the gap would still exist, just unmarked. Prompt for this explicitly and treat
it as a positive signal, not a shortfall.

## Autotracking → canvas: how a consumer actually gets reactive cell updates (Phase 6 follow-up)

> **Consumer-facing version of this lives in the cookbook's *Using the grid in Ember* chapter**
> (`test-app/app/utils/cookbook/ember.ts`) — one recommended pattern, copy-pasteable. This section is
> the *why* (mechanism, evidence, failure modes) for people working on the addon. Keep the two in
> sync: if the mechanics below change, that chapter is what consumers actually read. *(It was
> `glide-data-grid-ember/DATA.md` until 2026-08-09, when it was migrated into that chapter and
> deleted — references to `DATA.md` further down are historical.)*

**This is the single most important thing for a consumer of this addon to understand, and it is not
obvious.** Added after the user asked, correctly, whether Phase 6's memoization could stop Ember's
native tracking from updating a cell. It cannot — but the surrounding model has a real sharp edge
that predates Phase 6 and would otherwise be discovered the hard way.

### The rule

**Autotracking only records reads that happen *during* a tracked computation.** `<GlideDataGrid>`'s
modifier establishes its dependencies by calling `buildGridHostArgs()`, which does
`getCellContent: this.args.getCellContent` — it reads the **function reference**. It never calls it.
So any `@tracked` property the `getCellContent` closure touches later, when the render engine invokes
it at draw time, is read **outside** the tracking frame and is never registered as a dependency.

Consequence, stated plainly: **mutating tracked state behind an identity-stable `getCellContent`
does not repaint anything, and never did.** It doesn't even re-run the modifier. `<DemoGrid>` looks
like a counterexample but isn't — its edits appear only because `commitCellEdit` performs its own
internal damage redraw, not because of tracking.

### The two working patterns

1. **Lazy `getCellContent` + imperative `updateCells()`** — what `<DemoGrid>` does. Correct for large
   virtualized datasets (200k rows); never project those eagerly. This is the "(b)" half of the
   dual-path model in `PHASES.md`.
2. **Getter `getCellContent` that eagerly reads the tracked fields** — what
   `test-app/app/components/tracking-demo.gts` does:
   ```ts
   get getCellContent() {
       const snapshot = this.store.all.map(p => ({ name: p.name, age: p.age /* ... */ }));  // read NOW
       return ([col, row]: Item): GridCell => cellFor(snapshot[row], col);
   }
   ```
   Reading the getter inside the tracking frame consumes every `@tracked` field, so an in-place
   mutation invalidates the modifier → it re-runs → new closure identity → `computeCanBlit` returns
   `false` → real repaint. **Every link in that chain is load-bearing.** Suits bounded, form-backed
   tables; the eager projection is the cost.

### The `scheduleFullRedraw()` hardening that makes pattern 2 safe

`drawGrid` early-returns and paints **nothing** when `computeCanBlit` is `true` and the scroll
offsets are unchanged (`render/data-grid-render.ts:214-222`). Before Phase 6 that was unreachable
(`canBlit` was permanently `false`); afterwards it is live, and "nothing changed" is only as
trustworthy as `computeCanBlit`'s fixed ~18-field identity list is exhaustive. Several real
`GridHostArgs` inputs map to **no** compared field (`getCellRenderer` is the clearest), so an arg
change needing a repaint could be silently swallowed.

Fixed by having `scheduleFullRedraw()` set `this.lastFullDrawArg = undefined` before drawing —
calling that method *is* the caller asserting "an input you can't see changed", so the safe reading
is always to repaint. `computeCanBlit` then returns `false` on its own `last === undefined` guard,
with no change to the blit logic itself. **This costs nothing on scroll**: `onScroll` calls `runDraw`
directly and never routes through `scheduleFullRedraw`, so the blit fast path — the only place
blitting matters for performance — keeps its previous-frame reference. Damage draws were already
immune (`drawGrid(current, undefined)`, so `computeCanBlit` short-circuits on the same guard), which
is why `updateCells()` was never at risk.

### Demo

`test-app/app/utils/model-store.ts` + `app/components/tracking-demo.gts`, reachable via the new
`<DemoSwitcher>` tab in `application.gts` (`Route(<template>)` is classless and can't hold the
tracked tab state, hence the wrapper component — same reason `<DemoGrid>` exists). The store models
an Apollo-cache-style normalized layer: long-lived object references with `@tracked` fields mutated
in place, **no** ember-data (the blueprint's `app/services/store.ts` is WarpDrive and is left unused
and untouched). The proof is deliberately airtight — no `updateCells()`, no `onCellsEdited`, and
every cell is `allowOverlay: false` so the grid's own overlay editor cannot fire and repaint via the
damage path. Nothing changes identity anywhere. Browser-verified: editing the form and submitting
repainted all five columns (text/number/boolean) for the mutated row, and a second form-free
mutation path (a "toggle active" button) did too.

## Phase 7a — Column sort (`src/data-source/`), the first piece of the data-source layer

**Delivered**: `glide-data-grid-ember/src/data-source/column-sort.ts` (port of source's
`packages/source/src/use-column-sort.ts`) and `glide-data-grid-ember/src/data-source/index.ts`
(the directory's barrel). No existing file was modified — `src/index.ts` is a 0-byte file and is
**not** this project's barrel convention; consumers import per-directory, e.g.
`import { withColumnSort } from "glide-data-grid-ember/data-source/index"` (same shape as the
existing `glide-data-grid-ember/rendering/index` imports in `test-app`). Rollup's
`publicEntrypoints(['**/*.js', ...])` already covers the new directory with no config change.

### Final exported API (Phase 8's `recordsSource` and Phase 7c's demo can consume this without re-reading the code)

```ts
// glide-data-grid-ember/data-source/index
export type ColumnSort = {
    column: GridColumn;                            // matched by identity, then by `id`
    mode?: "default" | "raw" | "smart";            // default => String.localeCompare
    direction?: "asc" | "desc";                    // default "asc"
};
export interface ColumnSortProps {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    readonly getCellContent: (cell: Item) => GridCell;
    readonly sort?: ColumnSort | readonly ColumnSort[];   // single or multi-column
}
export interface ColumnSortResult {
    readonly getCellContent: (cell: Item) => GridCell;    // row-remapping wrapper
    readonly getOriginalIndex: (index: number) => number; // displayed row -> caller's row index
}
export function withColumnSort(p: ColumnSortProps): ColumnSortResult;
export function compareSmart(a: string | number, b: string | number): number;
export function compareRaw(a: string | number, b: string | number): number;
```

Name choice: **`withColumnSort`** (matches the `withColumnSort(...)` sketch already in PHASES.md's
Phase 8 scope section), replacing source's hook-shaped `useColumnSort`. `ColumnSort`/`compareSmart`/
`compareRaw` keep source's names. `Props`/`Result` were promoted to exported
`ColumnSortProps`/`ColumnSortResult` (source keeps them private, but a consumer here needs to be able
to type an intermediate variable).

Composition shape — note it takes **one props object**, not `(source, sort)`:

```ts
@cached get gridArgs() {
    const src = recordsSource({ records: this.people, columns: this.columns });  // Phase 8
    return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
}
```

**Implication for Phase 8**: for that spread to work, `recordsSource`'s return value should include
`columns`, `rows` and `getCellContent` under exactly those names.

### Identity-stability design (the load-bearing decision — read standing lesson #1 first)

`getCellContent` is one of the ~18 `DrawGridArg` fields `computeCanBlit` compares **by identity**, so
a decorator that returns a fresh closure per call silently kills the scroll blit fast path. This
module therefore **memoizes internally** (the "correct by construction" option) rather than relying on
a documented "wrap me in `@cached`" rule:

- Module-scope `WeakMap<getCellContent, { rows, sortKey, result }>` — single entry per incoming
  `getCellContent` identity. WeakMap so multiple grids on a page don't collide and entries die with
  their closures.
- **`sortKey` is a structural digest, not the `sort` argument's identity**: `"<resolvedColIdx>:<mode>:<direction>|"`
  per active sort. This is the non-obvious part and it matters — a consumer writing
  `get sort() { return { column: this.columns[0], direction: "asc" }; }` allocates a fresh object on
  every read, and an identity-keyed cache would rebuild the whole O(rows) sort map every call, on the
  paint path. Resolving column indices costs O(sorts × columns) per call (a few hundred `===` at
  worst), which is free next to the sweep it protects. `columns` identity is deliberately *not* in the
  key for the same reason: only the resolved index affects the result.
- **No-sort case returns the caller's original `getCellContent` reference unchanged** (source does
  this too) — not a pass-through wrapper, which would be a fresh identity on the common path.
  `getOriginalIndex` is then a module-scope `identityIndex` constant, also stable.
- Known, accepted limitation: two different grids sharing one `getCellContent` function but different
  `rows`/`sort` will thrash the single cache entry. That degrades to source's own per-render behaviour
  rather than breaking anything; not worth a multi-entry cache.

**Staleness contract, same as source's `useMemo`**: the sort map is keyed on `getCellContent`
*identity*, so mutating data behind an identity-stable `getCellContent` does **not** re-sort. Consumers
on this port's lazy-closure + `updateCells()` pattern must hand over a new `getCellContent` identity
when values change if they want the ordering to follow. Worth restating in DATA.md when Phase 7c/8
wires sorting into a demo.

### Deviations from source

- `lodash/range` dropped for a plain loop (no new dependency, and `lodash` wasn't needed at all here).
- `noUncheckedIndexedAccess` forced two safe guards source doesn't have: the wrapper does
  `getCellContentIn([col, sortMap[row] ?? row])` and `getOriginalIndex` does `sortMap[index] ?? index`
  (source indexes unguarded). Both are pure passthrough for an out-of-range row.
- `cellToSortData` has a `default: return ""` arm. Checked against this port's real
  `GridCellKind` enum (`src/rendering/data-grid-types.ts:87-100`) rather than assuming parity — it is
  in fact identical to source's 12 kinds, and `GridCell` excludes the inner-only `NewRowCell`/
  `MarkerCell`, so all 12 arms are exhaustive and the default is unreachable defensive code.
  `GridCellKind.Custom` sorts on `cell.copyData`, per source — so every Phase 5 extra cell type sorts
  correctly for free, since they are all `CustomCell`s with a `copyData`.
- `compareSmart`'s `a == b` loose equality is verbatim from source and deliberate (catches `1 == "1"`);
  it now carries an inline comment saying so, so nobody "fixes" it to `===`.

### Verification actually performed

- `cd glide-data-grid-ember && npx tsc --noEmit -p tsconfig.json` — clean, exit 0.
- `pnpm --filter glide-data-grid-ember build` — rollup + `glint --declaration` succeed;
  `dist/data-source/{column-sort,index}.js` and `declarations/data-source/*.d.ts` produced. (The
  "Generated empty chunks: index, …" warning is pre-existing, caused by the empty `src/index.ts`.)
- **Behaviour smoke-tested against the built `dist/`** with a small Node ESM script (not just
  type-checked): single-column asc/desc, `mode: "smart"` vs the default `localeCompare` on numeric
  strings (`[10,2,33,4]` string-sorted vs `[33,10,4,2]` smart-desc — confirms `mode` is actually
  wired), multi-column sort tie-breaking, `getOriginalIndex` round-trip, unresolvable-column
  passthrough, and the three identity properties: no-sort returns the same reference, two calls with
  *freshly allocated* equivalent `sort` objects return the identical result object **and** perform
  zero extra `getCellContent` sweeps, and a direction change does produce a new closure.
- **Not done** (out of scope for 7a, no UI exists yet): no browser test, no test-app wiring, no sort
  menu. Phase 7c owns those. Nothing in `grid-host-controller.ts` or `glide-data-grid.gts` was
  touched (the orchestrator was editing both concurrently for column group headers).

## Phase 7c — grid.glideapps.com demo replica + consumer-built sort menu (test-app only)

**Scope was explicitly narrowed by the user**: the *grid only*. The marketing page's hero banner,
nav and six feature cards were deliberately **not** built, even though PHASES.md still lists the
feature cards as a Phase 7 requirement. The one non-grid piece of UI here is the column sort menu,
which is grid interaction, not page chrome.

### Delivered (all in `test-app`, nothing in the addon was modified)

- **`test-app/app/utils/glide-demo-data.ts`** — a second, independent dataset (the 50-column ×
  200k-row `demo-data.ts` is untouched; it is still the Phase 3-6 verification surface). 3,000
  records built eagerly at module scope from a seeded **mulberry32** PRNG (5 lines, no dependency —
  the demo must be byte-identical across reloads or "did the sort actually reorder anything?" is
  unanswerable). `makeGlideDemoGetCellContent(columns)` returns an O(1) closure bound to a column
  order (it is called once per painted cell inside the draw loop).
- **`test-app/app/components/glide-demo.gts`** — the demo component + the sort menu.
- **`test-app/app/styles/app.css`** — the sort menu's styles (first real content in that file).
- **`test-app/app/components/demo-switcher.gts`** — gained a third tab, "Glide demo grid". Its
  `@tracked showTracking` boolean became a `@tracked tab: "full-grid" | "tracking" | "glide"`.

### Column / data layout (matches the live site's grid, observed directly)

| Group | Column | Cell kind | `icon` |
|---|---|---|---|
| ID | Email | Text | HeaderEmail |
| Name | First name / Last name | Text | HeaderString |
| Info | Photo | Image | HeaderImage |
| Info | Opt-In | Boolean | HeaderBoolean |
| Info | Title | Text | HeaderString |
| Info | More Info | Uri (`hoverEffect`, no `onClickUri`) | HeaderUri |
| Info | Performance | Custom → Phase 5a **sparkline** (`graphKind: "area"`) | HeaderArray |
| Employment Data | Manager | Drilldown (1 chip, avatar `img`) | HeaderReference |
| Employment Data | Hired | Text (`Date.toDateString()`, e.g. `Sun Jun 21 2026`) | HeaderDate |
| Employment Data | Level | Number (1–12) | HeaderNumber |

Every column carries `hasMenu: true` — that flag is what gates `hitTestHeaderMenu`, not just the
glyph drawing. Grouping needs no flag: the addon derives `enableGroups` from
`columns.some(c => c.group !== undefined)` (Phase 7b), so setting `group` is the whole opt-in.
`@groupHeaderHeight={{28}}` / `@headerHeight={{34}}`.

**Images are generated, not shipped as base64.** `makeCanvasDataUrl()` paints an offscreen
`<canvas>` and calls `toDataURL("image/png")`: a 12-colour palette of head-and-shoulders "photo"
glyphs, plus per-manager round initials avatars. Memoized, built lazily on first `getCellContent`
call (needs a DOM; the module is imported but not executed at build time), with the same tiny static
PNG `demo-data.ts` uses as a no-DOM fallback. Zero network requests, and thumbnails are genuinely
distinct per row rather than N copies of one swatch.

### How sorting is wired

Sort state is `@tracked sortColumnId: string | undefined` + `@tracked sortDirection` — **ids, not a
`ColumnSort` object**, so it survives a column reorder. Three `@cached` getters chain:

```
displayColumns  ->  (columns + a " ↑"/" ↓" suffix on the sorted column's title)
baseGetCellContent -> makeGlideDemoGetCellContent(this.columns)     // keyed on column order only
getCellContent  ->  withColumnSort({ columns: displayColumns, rows, getCellContent: base, sort }).getCellContent
```

`mode: "smart"` is used for every column so the numeric **Level** column sorts 2 < 10 instead of
lexicographically; for plain text columns `"smart"` is identical to the default `localeCompare`.
**Known limitation, deliberate**: `Hired` is a `Text` cell holding `"Sun Jun 21 2026"`, so it sorts
alphabetically, not chronologically. The live site's column is text too; making it sort by date
would need a separate sortable representation, not a change to `withColumnSort`.

Reactivity chain, all of it load-bearing: `sortColumnId` changes → `@cached get getCellContent`
invalidates → the template's `@getCellContent` reference changes → `<GlideDataGrid>`'s modifier
re-runs inside its tracking frame → `scheduleFullRedraw()`. This is "pattern 2" from the
"Autotracking → canvas" section above. Nothing is allocated inline in the template;
`getCellRenderer` (`createCombinedCellRenderer(defaultGetCellRenderer, allExtraCells)`) is built
once at module scope, per standing lesson #1.

Menu UI: `@onHeaderMenuClick(col, bounds)` stores `{col, bounds}` in tracked state; the menu is an
absolutely-positioned `<div>` inside a `position: relative` wrapper that contains only the grid, so
`bounds` (grid-root-relative) is directly usable. **`col` is in the grid's *mangled* column space**
— it includes the row-marker column — so the demo subtracts `ROW_MARKER_OFFSET = 1`. Closes on a
fixed full-viewport backdrop `mousedown`, on Escape (a capture-phase `document` keydown listener
registered in the constructor + `registerDestructor`), and after choosing an item. The active sort
is shown twice: a ✓ on the chosen menu item and an arrow appended to the canvas header title.

### Verification actually performed

- `npx tsc --noEmit -p tsconfig.json` clean; `pnpm --filter glide-data-grid-ember build` clean;
  `pnpm --filter test-app exec vite build` clean (450 modules); `npx glint` in `test-app` clean.
- **Browser-verified** on a dedicated dev server (:4344 — :4200 and :4210 were other agents').
  All 11 columns render real content; the 4 group headers render and span correctly; sparklines draw
  as real, per-row-distinct area charts; photos and manager avatars render; horizontal + vertical
  scroll both work with the group header and column header staying pinned (`scrollHeight` was
  exactly `102,062 = 28 + 34 + 3000×34`, confirming the padder math accounts for the group header).
  Sorting was confirmed by **reading actual cell text before and after**: Last name ascending turned
  `Ritchie/Lamarr/Torvalds/Borg/Hopper` into five `Allen`s, descending into `Wirth`; Level ascending
  put all `1`s at the top and descending all `12`s (which is what proves `mode: "smart"` is live —
  a `localeCompare` sort would have led with `1, 10, 11, 12`). Menu opens, positions at `bounds`,
  shows exactly the two items, marks the active sort, and closes on choose/Escape/backdrop. No
  console errors at any point.

### Four addon defects found here. **None were fixed** (out of Phase 7c's scope); all four are real

Every one of them is invisible without row markers, frozen columns or column grouping — which is
exactly why nothing before Phase 7c hit them. `<DemoGrid>` uses none of the three.

1. **`computeBounds` is called with `args.headerHeight` where the parameter is `totalHeaderHeight`**
   — `grid-host-controller.ts` lines **1491** (`hitTestHeaderMenu`), **1538**
   (`hitTestColumnResizeEdge`), **2026** (`computeCellRect`) and **2626** (`scrollCellIntoView`).
   `computeBounds` derives `headerHeight = totalHeaderHeight - groupHeaderHeight` internally, so with
   `groupHeaderHeight: 28, headerHeight: 34` it computes a header row **6 px** tall instead of 34.
   Net effect with grouping on: the header-menu hit strip is 6 px tall, the resize edge is
   mis-placed, and overlay editors open at the wrong y. The neighbouring `onMouseMove` call site
   (line ~1338) does it correctly via `this.totalHeaderHeight(args)` — these four just weren't
   updated when Phase 7b introduced that helper.
2. **`private cellXOffset = 0` (line ~498) should initialise to `freezeColumns`.** `computeXOffset`
   correctly starts its walk at `freezeColumns`, but that only runs on the first `scroll` event.
   Until then `computeBounds`'s `col >= freezeColumns` branch adds `getStickyWidth(...)` *and* walks
   the sticky columns again, so every computed rect is off by the sticky width. Concretely: on a
   fresh page load with `rowMarkers` on, **the header menu cannot be opened at all** — the computed
   menu rect sits 44 px to the right of the column the cursor is actually over, so the two can never
   intersect. One scroll event of any size fixes it for the rest of the session. This was diagnosed
   by probing synthetic mousedowns across the header and finding zero hits before a scroll and a
   clean 30 px-wide hit band after one.
3. **The header menu chevron never draws, and headers never show their hover highlight.**
   `drawHeader` gates both on `hRow === -1 && hCol === c.sourceIndex`, read off
   `DrawGridArg.hoverInfo`. `GridHostController.onMouseMove`'s `item[1] < 0` branch sets
   `this.hoverInfo = undefined` and returns **without scheduling a redraw**, so `hoverInfo` is never
   populated for a header. Source's `data-grid.tsx` does populate it. The hit-test itself does not
   depend on the glyph being drawn, so the menu is still reachable — it is just invisible, which on
   the live site is the entire affordance.
4. **Row-marker body cells render nothing** — no row numbers, no per-row checkbox, and the sticky
   marker column doesn't even paint its background (scrolled cell content from the next column shows
   through it). `mangledGetCellContent` emits `InnerGridCellKind.Marker` cells, but
   `src/rendering/cells/index.ts`'s `getCellRenderer` has no `Marker` case — source's
   `cells/marker-cell.tsx` was never ported. Phase 3a recorded this as a known gap; Phase 4's
   research then concluded it was already handled "as bespoke code directly in
   `GridHostController`", which is true only of the **header** select-all checkbox, not the body
   cells. So the target site's numbered row markers cannot be delivered today. (The header select-all
   checkbox does work but is hover-gated: source only draws it unconditionally when
   `headerRowMarkerAlwaysVisible` is set, and this port never sets it — source derives it from
   `rowMarkers === "both" | "checkbox-visible"`.)

Also missing, and the reason **no column header icon draws** even though `column.icon` is set on all
11 columns: `grid-host-controller.ts:655` does `new SpriteManager(undefined, ...)`. Source merges the
built-in glyph set in at its outermost wrapper — `data-editor-all.tsx:14`, `{ ...sprites,
...p.headerIcons }`. This port's `src/rendering/sprites.ts` (ported in Phase 1, 28 glyphs) is
therefore **dead code**: it is not imported anywhere, not exported from `rendering/index.ts`, and
`<GlideDataGrid>` has no `headerIcons` arg — so there is **no consumer-side workaround**. The layout
space for the icon *is* reserved (`computeHeaderLayout` shifts the title right by
`ceil(headerIconSize * 1.3)`), it just paints nothing.

The demo is deliberately left configured as if all of the above worked (`@rowMarkers="both"`,
`icon` on every column) so it lights up for free once they are fixed.
## Phase 7b — Column group headers (COMPLETE, browser-verified, 2026-08-07)

Done directly by the orchestrator (not a subagent) because it touches row hit-testing at ~10 call
sites in `grid-host-controller.ts` and the recipe was already fully written down in this file's
Phase 2a section — the risky part was verification, not implementation.

### What changed

Column grouping was hardcoded off project-wide since Phase 2a (`const ENABLE_GROUPS = false`).
**It is now derived per-args, exactly as source does it** (`data-editor.tsx:1131-1133`):

```ts
private enableGroups(args)      // = args.columns.some(c => c.group !== undefined), memoized on `args.columns` identity
private groupHeaderHeight(args) // = enableGroups ? args.groupHeaderHeight : 0   (source's `enableGroups ? groupHeaderHeight : 0`)
private totalHeaderHeight(args) // = args.headerHeight + groupHeaderHeight(args) (source's :1135)
```

There is **no new opt-in flag and no new arg** — grouping turns itself on purely because a consumer
set `group` on a column, which is source's own behavior. `groupHeaderHeight` was already an optional
`GridHostArgs`/`<GlideDataGrid>` arg (defaulting to `headerHeight`) since Phase 2, so nothing new
had to be threaded through `glide-data-grid.gts`.

**Consequence worth knowing: when no column carries a `group`, every one of these returns
false/0 and behavior is byte-identical to the pre-7b hardcoded path.** Verified in the browser —
the pre-existing demo renders with a single header row exactly as before. So grouping landing is a
no-op for every existing consumer.

### The two real bugs this surfaced (both were latent, both would have broken hit-testing)

The mechanical `ENABLE_GROUPS ? args.groupHeaderHeight : 0` sites (10 of them) were already written
correctly by earlier phases and just needed the constant replaced. But **two sites had the group
height hardcoded away entirely** with the comment `// ENABLE_GROUPS is always false in this phase`:

- `onMouseMove`'s `const totalHeaderHeight = args.headerHeight;` — hover hit-testing.
- `scrollCellIntoView`'s `const totalHeaderHeight = args.headerHeight;` — the "is this cell above the
  viewport" check.

Both now call `this.totalHeaderHeight(args)`. Left alone they would have produced a one-group-header-
row (~36px) offset in hover and in keyboard-nav scroll-into-view, i.e. hovering/scrolling would have
been off by roughly one row *only when grouping is on* — precisely the kind of defect that passes
every build and looks like a rendering glitch. Also fixed while there: `rebuildScrollContent`'s
padder total height and the header canvas's CSS height both now use `totalHeaderHeight(args)`, so
the scrollable extent and the header canvas grow by the group row rather than clipping it.

**This is the trap Phase 2a warned about, and it was real**: `getRowIndexForY` computes
`totalHeaderHeight = headerHeight + groupHeaderHeight` *unconditionally* — it is NOT gated by its own
`hasGroups` parameter. So passing a real `groupHeaderHeight` alongside `enableGroups: false` silently
reserves dead header space and breaks row hit-testing. Every coordinate-math call site must use the
*effective* height (`groupHeaderHeight(args)`), never `args.groupHeaderHeight` raw.

### Identity stability (the `computeCanBlit` rule)

`getGroupDetails` was an inline `name => ({ name })` closure in `runDraw`'s `DrawGridArg` literal.
It is **not** one of `computeCanBlit`'s ~18 identity-compared fields, so it was not actually breaking
the blit path — but it is exactly the shape that did break it in Phase 6, so it was hoisted to a
module-scope `DEFAULT_GROUP_DETAILS` constant anyway. Keeping every `DrawGridArg` value
reference-stable by default is cheaper than re-deriving the compared-field list each time someone
touches this object. `enableGroups`/`groupHeaderHeight` are likewise not compared, which is safe:
they only change via `scheduleFullRedraw()`, which sets `lastFullDrawArg = undefined`.

### Deliberately NOT done

Source's richer `GroupDetails` (`icon`/`overrideTheme`/`actions`) and `onGroupHeaderRenamed` are not
exposed — `DEFAULT_GROUP_DETAILS` returns `{ name }` only. This is why `themeForCell` still omits
source's `groupTheme` from its merge chain: that theme comes from `getGroupDetails(group)
?.overrideTheme`, and there is never one to merge. If a future phase exposes a real `getGroupDetails`
arg, `themeForCell` is where the group theme has to be added.

### Verification

`npx tsc --noEmit` clean, `pnpm --filter glide-data-grid-ember build` and
`pnpm --filter test-app exec vite build` both succeed. **Browser-verified** (dev server on :4210,
temporarily grouping the existing demo's columns 4-at-a-time, then reverting):
- group header row renders above the column header row with correctly-spanned group names
- **row hit-testing is exact** — clicking at a known y landed the selection ring on precisely the
  expected row/column, no off-by-one (this is the check that would have caught the two hardcoded
  sites above)
- both header rows stay pinned through vertical scroll, and zebra `getRowThemeOverride` striping
  keeps alternating correctly
- no console errors
- with the temporary grouping reverted, the existing demo renders single-header-row exactly as before


## Phase 7e — Five addon defects surfaced by the Phase 7c demo (COMPLETE, browser-verified, 2026-08-08)

Phase 7c's demo was the **first thing in this project to turn on row markers, column groups and
header icons at once**, and it immediately surfaced five defects. The 7c agent correctly reported
them and did *not* fix them (it was scoped to the test-app), which is exactly the outcome the
"report, don't paper over" instruction is for -- all five were fixed here by the orchestrator.

**Why none of them were caught earlier: every one is invisible unless you enable a feature no
previous phase's demo used.** This is the same lesson as Phase 6's blit finding, generalized: a
port can be "fully browser-verified" phase after phase and still have whole features that have
never once executed. When a phase enables a dormant feature, budget for the fact that everything
downstream of it is effectively unverified code.

### 1. `computeBounds` given `headerHeight` where it wants `totalHeaderHeight` (regression from 7b)

Four call sites -- `hitTestHeaderMenu`, `hitTestColumnResizeEdge`, `computeCellRect`,
`scrollCellIntoView` -- passed `args.headerHeight` as `computeBounds`'s 6th parameter, which is
`totalHeaderHeight` (group row + header row). `computeBounds` derives the header row's height as
`totalHeaderHeight - groupHeaderHeight`, so with `groupHeaderHeight: 28, headerHeight: 34` it
computed a **6px** header row: the menu hit strip, the resize edge and the overlay-editor anchor
were all wrong whenever grouping was on.

These were *correct* before Phase 7b (with grouping hardcoded off, `totalHeaderHeight ===
headerHeight` identically) and 7b missed them because it searched for the old `ENABLE_GROUPS`
constant, which these sites never mentioned. **Lesson: when you turn a globally-disabled feature on,
grep for the call sites that were silently relying on the disabled value being zero, not just for
the flag's own name.** Fixed to `this.totalHeaderHeight(args)`.

### 2. `cellXOffset` initialised to 0 instead of `freezeColumns`

`cellXOffset` is the index of the first **non-frozen** visible column, so its resting value at
`scrollLeft === 0` is `freezeColumns` -- which is `>= 1` whenever `rowMarkers !== "none"`, because
the synthetic marker column is sticky. The field was initialised to `0` and only corrected by the
first `scroll` event, so until the user scrolled, `computeBounds` double-counted the sticky width.

Symptom: **on a fresh load with row markers, the header menu could not be opened at all** -- the
computed menu rect sat one marker-column-width right of the column under the cursor, so they never
intersected. Any scroll silently "fixed" it for the session, which is exactly the kind of bug that
looks like flakiness. Fixed by extracting `syncScrollOffsets(args)` out of `onScroll` and also
calling it from `scheduleFullRedraw()` (right after `rebuildScrollContent`/`sizeCanvases`), so the
offsets are re-derived from the live scroll position at first paint and after any arg change that
moves where a scroll position lands (column widths, `freezeColumns`, marker column).

### 3. Header hover state was unreachable, so the menu chevron never drew

`onMouseMove`'s `item[1] < 0` branch (pointer over a header/group-header row) set `hoverInfo =
undefined` and returned **without a redraw**. But `drawHeader` derives `isHovered` from `hoverInfo`'s
row being `-1`/`-2` (`data-grid-render.header.ts:81,187`), and the menu chevron is gated on exactly
that (`:464`). Net effect: no column ever showed a header hover highlight, and **the chevron never
rendered at all** -- while the menu *hit-test* worked fine, leaving a completely invisible
affordance. On the real grid.glideapps.com, the chevron appearing on hover *is* the affordance.

Fixed: the header branch now populates `hoverInfo` via the existing `updateHoverInfo` (`computeBounds`
already handles rows `-1`/`-2` natively, including widening a group header's rect across its whole
span) and repaints via a new `redrawHeaderHover`. The "same item" early-return also refreshes the
in-cell position for header rows, because the chevron only highlights while the pointer is directly
inside its own `menuBounds`. `animationManager.setHovered(undefined)` is still called, since no
*cell* is hovered.

There is no damage-based path for headers (`damage` is a `CellSet` of body cells), so this is a
plain full draw -- one ordinary frame, only while the pointer is inside the header strip, which is
also how source behaves.

### 4. Row-marker body cells drew nothing -- `marker-cell.tsx` had never been ported

`mangledGetCellContent` has emitted a well-formed `InnerGridCellKind.Marker` cell since Phase 3a,
but `cells/index.ts` had no `Marker` case, so `getCellRenderer` returned `undefined` and the marker
column painted **nothing**: no row numbers, no checkboxes, and no background fill (so a sticky
marker column showed the next column's text bleeding through). Silent, because an unmatched cell
kind is not an error anywhere in the draw loop.

**This is a direct correction to this file's own Phase 4 research note**, which recorded that row
markers were "already implemented as bespoke code directly in `GridHostController`, no need to
refactor to match source's registry structure". That was only ever true of the **header** select-all
cell. The body cells always went through the registry. Ported as
`src/rendering/cells/marker-cell.ts` (near-verbatim; `drawCheckbox`, `getMiddleCenterBias` and the
`MarkerCell` type were all already ported and needed no changes) and registered. Its `onClick` is
ported for fidelity but is currently unreachable -- `isInnerOnlyCellKind` keeps inner-only cells out
of renderer `onClick` dispatch, and Phase 3a's bespoke row-marker click handling owns that gesture.

### 5. No column header icon ever drew -- `sprites.ts` was dead code

`GridHostController` constructed `new SpriteManager(undefined, ...)`, and `SpriteManager` does
`this.headerIcons = headerIcons ?? {}`. Source merges the built-in glyph set in at
`data-editor-all.tsx:14` (`{...sprites, ...p.headerIcons}`). So `column.icon` reserved its layout
space and painted nothing, and **`src/rendering/sprites.ts` -- 28 glyphs ported back in Phase 1 --
was never imported by anything**, not even the barrel. There was no consumer-side workaround.

Fixed: the manager is now built with `{ ...sprites, ...this.getArgsFn().headerIcons }`, `sprites`
and `HeaderIconMap` are exported from the `rendering/index` barrel, and a new optional
`headerIcons?: SpriteMap` arg is plumbed through `GridHostArgs` **and** `<GlideDataGrid>` (per the
standing Phase 3d rule that those are two hand-maintained parallel lists). Note it is read **once**,
when the `SpriteManager` is constructed -- changing it later has no effect.

### Verification

`tsc` clean, addon rollup build and `vite build` both clean. **Browser-verified** on :4210 after the
full kill / `rm -rf .vite` / restart / fresh-`?cb=` loop:
- row-marker numbers draw; header icons draw on all 11 columns; group headers span correctly
- **the chevron appears on header hover**, and the menu opens **on a fresh load with no prior
  scroll** (the exact state defect 2 made impossible)
- "Sort ascending"/"Sort descending" reorder for real -- verified by reading cell text *and* the
  scattered original row indices visible in the More Info column, not just "something changed"
- select-all via the header checkbox checks every marker cell and highlights every row (exercises
  the new marker renderer's checked state, not just its number state)
- **regression**: the pre-existing ungrouped demo still renders a single header row, click-selects
  the correct row, and keeps its zebra/column/cell theme overrides
- **column resize and reorder confirmed working in the new grouped demo by the user** (2026-08-08),
  which is the check defect 1 most directly threatened — `hitTestColumnResizeEdge` was one of the
  four bad `computeBounds` call sites, so a grouped grid's resize edge was mis-located before that
  fix. Not exercised by the orchestrator's own automated pass; recorded here because it closes that
  specific risk.
- no console errors at any point

**Blit fast path re-verified with the sort decorator live** (this was the one thing Phase 7a
explicitly flagged as unproven, since it could only demonstrate closure identity in isolation).
Re-used Phase 6's technique: temporarily instrument `computeCanBlit` to record the differing field
names onto a `document.documentElement` attribute (the DOM is the only reliable bridge out of
`javascript_tool`'s isolated world), then drive **real `computer` scroll actions** (a JS
`scrollTop` assignment does not reliably drive the redraw path). Result with sorting active, groups
on and row markers on: **5 of 5 `computeCanBlit` calls had zero differing fields** across both
vertical and horizontal scroll -- i.e. `getCellContent` stayed identity-stable through
`withColumnSort`, and Phase 6's blit fix survives Phase 7. Instrumentation removed afterwards;
`git status` confirms `src/rendering/render/**` is unmodified.

### Testing-environment note (adds to the existing browser-quirks list)

The `computer` tool's **`hover` action did not fire a page `mousemove`** in this environment -- the
header chevron stayed invisible after hovering, and only appeared once a `mousemove` was dispatched
directly on the grid root via `javascript_tool`. Same class as the already-documented
"`.focus()` doesn't fire a `focus` event" quirk. **When testing a hover-gated affordance here,
dispatch the `mousemove` yourself on `root`; don't conclude from a `hover` action alone that the
feature is broken.** (Real `computer` *clicks* remain reliable, as previously documented.)

## Phase 7f — Demo edits didn't persist; and a correction on how to browser-test clipboard

**Reported by the user after Phase 7 was committed:** in the Glide demo the overlay editor opened
and accepted typing, but nothing saved on Enter or blur -- while the older `<DemoGrid>` saved fine,
and copy worked in both.

**Cause: `glide-demo.gts` never passed `@onCellsEdited`.** Nothing in the addon was wrong. The
controller is non-mutating by contract (established Phase 3c) -- it *notifies* and the consumer
applies. With no handler wired, the notification went nowhere.

**The same callback carries three features, which is why the symptom looked broader than it was.**
`grid-host-controller.ts` funnels all of these into `onCellsEdited`: the overlay-editor commit
(`commitCellEdit`), the Delete/Backspace clear (`deleteSelection`), and **paste** (`onPaste`). So a
demo missing that one arg silently loses editing, delete *and* paste, while copy keeps working
because copy only reads. **Whenever "editing doesn't stick" is reported, check the consumer's
`@onCellsEdited` wiring before looking at the addon at all.**

### The non-obvious part: `onCellsEdited`'s `location` is in DISPLAYED row space

This is the bit worth internalising, because it is silently wrong rather than loudly broken. With a
sort active, `withColumnSort` remaps rows *above* the consumer's `getCellContent`, so:

- the `row` reaching the consumer's own `getCellContent` is the **original** index, but
- the `row` in `onCellsEdited`'s `location` is the **displayed** index.

Storing the edit under the displayed index means editing a sorted row writes to a different record,
and the corruption only becomes visible after the next re-sort. **`getOriginalIndex` -- returned by
`withColumnSort` alongside `getCellContent` -- exists exactly for this**, and this is its first real
use in the project. With no sort active it is the identity function, so the same code path is
correct either way.

`location[0]` needs no equivalent adjustment: the controller converts to real column space at the
callback boundary, so it indexes the consumer's own `columns` with **no** `rowMarkerOffset`.

The demo now keys its edit map `"<originalRow>:<columnId>"` -- original row so edits survive
re-sorting, column *id* rather than index so they survive a column reorder.

**Browser-verified**: plain edit commits and the selection advances; with Last-name-ascending
active, editing displayed row 1 (`leslie.allen17@example.com`) and then round-tripping the sort
desc→asc leaves the edited value still attached to that same record, and displayed row 1 under the
descending sort shows real unedited data. Paste verified into a different row.

### Correction: real Cmd+C/Cmd+V DO work in this browser-automation setup

Phases 3c and 5c concluded that paste could not be exercised here, because synthetic
`ClipboardEvent` + `DataTransfer` dispatch reported `preventDefault()` but never visibly redrew
anything. That conclusion was too broad. **Real `computer`-tool key presses (`cmd+c` / `cmd+v`) are
trusted CDP events and drive the whole clipboard pipeline end to end** -- click a cell, `cmd+c`,
click another cell, `cmd+v`, and the pasted value renders. This is now the preferred way to test
clipboard behaviour here; reach for synthetic `ClipboardEvent`s only if a real key press is
impossible. (Consistent with the wider pattern already recorded in this file: trusted `computer`
input works where synthetic dispatch silently doesn't -- same as `.focus()` not firing `focus`, and
the `hover` action not firing `mousemove`.)

## Phase 8a/8b — decorator write path + `recordsSource` (COMPLETE, 2026-08-08)

> **Status correction, added at Phase 8 close-out** (this section was written before the browser
> passes existed and originally said "NOT browser-tested"): `recordsSource` **is** now browser-proved
> — see the Phase 8d section for the 1,000-row measurement, and Phase 8e for the blit re-measurement
> through it. What remains unit-only is `withColumnSort`'s **write path** on a sorted grid: the
> composed read+write behaviour is covered by Node suites against the built `dist/`, but nobody has
> yet driven an edit through the sorted Glide demo in a browser and confirmed it lands on the right
> record. Listed in Phase 9's backlog.

Two deliverables in one change: `withColumnSort` gained the write path agreed with the user (PHASES.md's
"Phase 8 -- START HERE" REQUIRED item), and the sync in-memory `recordsSource` landed alongside it. The
demo was rewired onto the new write path as the end-to-end proof.

### Final exported API (use this; don't re-read the code)

```ts
// glide-data-grid-ember/data-source/index

// --- Phase 8a: withColumnSort now owns BOTH coordinate directions -------------------------------
export interface CellEdit { readonly location: Item; readonly value: GridCell; }   // NEW, shared type

export interface ColumnSortProps {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    readonly getCellContent: (cell: Item) => GridCell;
    readonly onCellsEdited?: (edits: readonly CellEdit[]) => void;   // NEW -- expects ORIGINAL rows
    readonly sort?: ColumnSort | readonly ColumnSort[];
}
export interface ColumnSortResult {
    readonly getCellContent: (cell: Item) => GridCell;
    readonly onCellsEdited?: (edits: readonly CellEdit[]) => void;   // NEW -- wire THIS to the grid
    readonly getOriginalIndex: (index: number) => number;            // demoted to escape hatch
}

// --- Phase 8b: recordsSource --------------------------------------------------------------------
export interface RecordsSourceProps<T> {
    readonly records: readonly T[];
    readonly columns: readonly GridColumn[];
    readonly toCell: (record: T, col: number) => GridCell;
    readonly onCellEdited?: (record: T, col: number, value: GridCell) => void;   // note: singular
}
export interface RecordsSourceResult {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    readonly getCellContent: (cell: Item) => GridCell;
    readonly onCellsEdited?: (edits: readonly CellEdit[]) => void;               // note: plural
}
export function recordsSource<T extends object>(p: RecordsSourceProps<T>): RecordsSourceResult;
```

Composition (this is the point of the naming, and it is verified working end to end):

```ts
@cached get gridArgs() {
    const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
    return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
}
```

`withColumnSort` translates each edit's `location[1]` displayed -> original, then `recordsSource`
resolves `records[row]`. `location[0]` is untouched by both (already consumer column space -- the
controller strips the row-marker column at the callback boundary). `onSelectionChanged` is deliberately
left in displayed space; it was not touched and should not be.

### The settled contract, stated once for every future decorator

**A decorator that remaps the read path must remap the write path too.** Both functions take
`onCellsEdited`/`onCellEdited` and return an `onCellsEdited`; the consumer wires the *returned* one to
`<GlideDataGrid @onCellsEdited=...>` and never translates an index by hand. Returned handler is
`undefined` iff the input was. Any later row/column-remapping decorator (source's `use-movable-columns`,
`use-collapsing-groups`) must adopt the same shape.

### Memoization / identity design

`withColumnSort`'s existing module-scope `WeakMap<getCellContent, {rows, sortKey, result}>` gained an
`onCellsEdited` field in the entry. **This is the load-bearing detail, and it's the Phase 6
`mangledGetCellContent` bug class again:** the cached `onCellsEdited` closure *captures* the incoming
handler, so the incoming handler's identity must be in the *key*. Without it, swapping the write handler
while the read handler stayed put would silently keep invoking the stale one. Rule to carry forward:
**enumerate what the cached closure captures, and check every captured value appears in the key.** Both
files now have that enumeration written out in a comment next to the cache entry type.

`recordsSource` is a second module-scope `WeakMap`, keyed on the **records array identity**, holding
`{columns, toCell, onCellEdited, caches, projections, result}`:

- One `createCache` per record (`@glimmer/tracking/primitives/cache` -- the non-decorator form of
  `@cached`; `@ember/*` and `@glimmer/*` bare imports are already externalized by `addon.dependencies()`,
  confirmed in the built `dist/data-source/records-source.js`, **no build-config change was needed**).
  Each cache's function reads only *that* record's tracked fields.
- The cache **set** is rebuilt only when `records` / `columns` / `toCell` change identity -- exactly the
  three values the cache functions close over. This is DATA.md's `rowVMs` rule moved into the addon.
- Every call does an **eager `getValue` sweep over all rows**. That is rule 1 from the "Autotracking ->
  canvas" section above: the reads must land in the *caller's* tracking frame or the grid never repaints.
  It is why this can't be a lazy closure and why it must be called from a `@cached` getter.
- Result reuse is decided by an **element-wise identity scan of the per-row projections**, not a
  structural digest. `createCache` allocates a fresh array whenever it recomputes, so projection identity
  is an exact "this row changed" signal; the scan is O(rows) of `===` against the O(rows x cols)
  re-projection it is already avoiding, and unlike a digest it cannot report equal for different data.
  All-identical -> return the previous result object (so `computeCanBlit`'s identity check on
  `getCellContent` keeps passing). Any row changed -> fresh identity, which is correct and wanted.
- `getCellContent` is `projections[row]?.[col] ?? FALLBACK_CELL` with `FALLBACK_CELL` at module scope --
  O(1), zero allocation on the paint path.
- Internals are non-generic (`unknown` records) with one cast at the public boundary, purely so the
  `CacheEntry` type needs no type parameter and `RowCache` can be named without a TS instantiation
  expression. Documented in the file.

### Two things that look like contradictions and are not (both documented in the file header)

1. **`isConst` caches are correct here.** A record class with no `@tracked` fields consumes no tracked
   state, so Glimmer marks its cache permanently constant and it never re-projects. That's fine: nothing
   about such a record *can* change without a new `records` array (or new `columns`/`toCell`), all three
   of which rebuild the cache set. Contrast PHASES.md's Phase 9 note where a const cache *would* be a
   staleness bug -- that's about `GridHostController`, which deliberately holds untracked state.
2. **This is not DATA.md's "don't memoize rows in a `WeakMap` keyed on the record object" anti-pattern.**
   That warning is about caching plain **values** by record identity, which a normalized store (Apollo)
   defeats by mutating entities in place -- identity unchanged, cache serves stale rows. A tracked
   `createCache` is invalidated *by that very mutation*. The distinction is what is cached, not what it
   is keyed on. Spelled out in DATA.md too, because the two statements sit a screen apart.

### `records` array must be replaced, not mutated

`records` is typed `readonly T[]` and treated as immutable membership. Mutate records in place freely;
an in-place `push`/`splice` keeps the array identity, so the cache set (and therefore `rows`) is stale.
Documented in both the file and DATA.md; not defended against at runtime.

### Files changed

- `glide-data-grid-ember/src/data-source/column-sort.ts` -- write path, `CellEdit`, cache key, doc comments.
- `glide-data-grid-ember/src/data-source/records-source.ts` -- NEW.
- `glide-data-grid-ember/src/data-source/index.ts` -- barrel (merged, not clobbered -- re-read immediately
  before writing, per the Phase 5a concurrent-editing note; a different agent was editing test-app at the time).
- `glide-data-grid-ember/DATA.md` -- sort caveat section rewritten around the built-in write path
  (`getOriginalIndex` demoted to an "escape hatch" subsection, "slated to be removed" note deleted);
  "Planned" replaced by a real `recordsSource` section. **"Status of this recommendation" deliberately
  untouched** -- see "What was NOT verified" below.
- `test-app/app/components/glide-demo.gts` -- `handleCellsEdited` renamed `applyEdits`, no longer calls
  `getOriginalIndex`, passed *into* `withColumnSort`; the grid now gets `this.sortResult.onCellsEdited`.
  Edit-map keying (`"<originalRow>:<columnId>"`) is unchanged.

### Verification actually performed

- `npx tsc --noEmit -p tsconfig.json` from `glide-data-grid-ember/` -- clean, exit 0.
- `pnpm --filter glide-data-grid-ember build` -- rollup + `glint --declaration` succeed;
  `dist/data-source/records-source.js` produced with `@glimmer/tracking/primitives/cache` left external.
- `pnpm --filter test-app exec vite build` -- succeeds (454 modules).
- **Node ESM smoke script against the built `dist/`** (scratch space, not committed), 45 assertions, all
  passing. `@tracked` was reproduced with `trackedData` from `@glimmer/validator` -- the exact primitive
  Ember's decorator is built on -- and `@glimmer/tracking/primitives/cache` was shimmed to re-export from
  that same `@glimmer/validator`, so caches and tracked fields share one tag graph. Actual numbers:
  - 3 records x 2 columns: first call = **6** `toCell` calls; two further calls with identical inputs =
    still **6**, and `r1 === r2 === r3` with the same `getCellContent`.
  - Mutate one record's tracked field -> **2** further `toCell` calls (one row), attributed to the mutated
    record; the other two records recorded **0**. Fresh result identity, new value visible.
  - **1,000 records**: cold build = **2000** `toCell` calls; a single `person.age = 999` then one more
    `recordsSource` call = **2** calls. Naive would be 2000. This is the core claim, on a counter.
  - New `columns` / new `toCell` / new `records` array identity each rebuild (6 calls) -- cache-key coverage.
  - `withColumnSort`: sorted read path; displayed row 0 -> `getOriginalIndex(0)`; `location[0]` untouched;
    a 2-cell batch forwarded as **1** call with both entries translated; a freshly-allocated equivalent
    `sort` returns the identical result *and* the identical `onCellsEdited`; swapping the incoming handler
    busts the cache; no-sort returns both caller references unchanged; `onCellsEdited === undefined` iff input was.
  - Composed `recordsSource` + `withColumnSort`: read path sorted `[Adam, Mia, Zoe]`; an edit at
    **displayed row 0** landed on `records[1]` (Adam) not `records[0]` (Zoe) -- i.e. the exact
    data-corruption case this phase exists to remove; descending sort likewise landed on Zoe.
  - `track(() => recordsSource(...))` then mutating a record **invalidates that tag** -- direct proof that
    the eager sweep registers dependencies in the caller's frame (rule 1), not just in theory.
- **Test-script gotcha worth knowing** (cost two false failures): the default sort mode is
  `String.localeCompare`, which is *case-insensitive-ish* -- `"alice".localeCompare("Bob") === -1`. Don't
  write expectations assuming ASCII ordering. Second: `withColumnSort`'s cache is **one entry per
  `getCellContent` identity**, so a test that calls it with the same `getCellContent` and a different
  handler in between will evict the entry and fail an unrelated identity assertion. Both were test bugs.

### What was NOT verified (do not round this up)

- **No browser testing at all.** The orchestrator owns it. In particular the rewired `glide-demo.gts`
  edit/delete/paste round-trip under an active sort has only been proven at the unit level.
- **No blit-path re-confirmation in a real browser.** Identity stability is asserted by the smoke script;
  that `computeCanBlit` still engages through the composed decorators was not re-measured in-page.
- **The per-row-`@cached` claim is measured in Node, not in a browser, and not against real repaint cost.**
  DATA.md's "Status of this recommendation" section was therefore left exactly as it is: it promises a
  ~1,000-row *browser* proof with a recompute counter, and that is still owed. The Node numbers above are
  strong evidence for the mechanism but they are not that measurement, and claiming otherwise would be
  worse than leaving the section stale.
  **-> SUPERSEDED: done in Phase 8d below** (browser-measured at 1,000 rows; DATA.md updated). Repaint
  *cost* is still unmeasured.
- `recordsSource` is not yet used by any test-app component (`tracking-demo.gts` rewire, the `object-scan`
  worked example, and the `updateCells()` high-frequency demo are all still open Phase 8 deliverables).
  **-> SUPERSEDED for the first two by Phase 8d below**; the `updateCells()` demo is `streaming-demo.gts`.
- No runtime guard against an in-place-mutated `records` array; documented only.

## Phase 8d — the ~1,000-row browser proof of `recordsSource` (COMPLETE, browser-verified, 2026-08-08)

Closes the gap the Phase 8a/8b section above explicitly left open ("the per-row-`@cached` claim is
measured in Node, not in a browser") and PHASES.md's required test-app deliverables 1-3. `test-app`
only -- nothing in `glide-data-grid-ember/src/**` was touched.

### Measured numbers (Chrome, dev server on :4500, against the built `dist/`)

`test-app/app/components/scale-proof.gts`, 1,000 `Employee` records x 7 columns. The projection
increments a plain counter and records the projected record's `id` in a `Set`, so "rows re-projected
since the last action" is an observed count on screen:

| Action | Rows re-projected | `toCell` calls |
| --- | --- | --- |
| Initial build (cold) | 1000 / 1000 | 7000 |
| **Edit one field on one record (row 0)** | **1 / 1000** | **7** |
| Edit one field on row **500** (scrolled out of view) | 1 / 1000 | 7 |
| Add a nested related entity (`profile` replaced) on one record | 1 / 1000 | 7 |
| Re-render touching no record | 0 / 1000 | 0 |
| Replace the `records` array (same instances, new array) | 1000 / 1000 | 7000 |

The canvas visibly repainted each time: `Grace Perlman #1` -> `Grace Perlman #1 (edit #1)`, and the
`object-scan` "Pets" cell `Momo` -> `Momo, Pet2`. **Constraints held throughout** (same discipline as
`tracking-demo.gts`): no `updateCells()`, no `onCellEdited` passed at all so the grid had *no* write
path, every cell `allowOverlay: false`. So the repaint can only be autotracking, and the "1 row"
count can only be the per-row `createCache`.

The out-of-view row-500 result matters on its own: it rules out "one row" being an artifact of what
happened to be painted. And the last table row is the measured cost of DATA.md's "the one way to
break it" -- the `Employee` instances were identical, only the array identity changed, and that alone
rebuilt all 1,000 projections.

### The tag-system question, settled (this was the actual risk)

`records-source.ts` imports `createCache` from `@glimmer/tracking/primitives/cache`. The Node smoke
script in Phase 8b had to substitute a standalone `@glimmer/validator`, so it could not answer
whether the *real* build resolves that specifier to **ember-source's own** validator. If it resolved
anywhere else, the row caches would live in a different tag graph from `@tracked`, never invalidate,
and the grid would show stale data with no error. Three independent lines of evidence, all now
collected:

1. **Behavioural (decisive).** A `@tracked` write invalidated exactly one row cache and repainted the
   canvas. A split tag system produces exactly the opposite: 0 rows re-projected, stale canvas.
2. **Resolution, from Vite's own dep-optimizer metadata**
   (`test-app/node_modules/.vite/deps/_metadata.json`):
   `ember-source/@glimmer/tracking/primitives/cache/index.js` ->
   `ember-source/dist/packages/@glimmer/tracking/primitives/cache/index.js`, whose entire body is
   `export { createCache, getValue, isConst } from '../../../validator/index.js'` -- i.e.
   ember-source's bundled `@glimmer/validator`.
3. **The other half of the pair.** Embroider rewrites `@glimmer/tracking` (the standalone 1.1.2, which
   has no `primitives/cache` subpath at all and declares `@glimmer/validator@^0.44.0`) so its index is
   `import * as metal from "@ember/-internals/metal"; export { cached, tracked }`. So `@tracked` and
   `createCache` both land inside ember-source. **One tag graph.**

Worth knowing that standalone `@glimmer/validator` copies (0.44.0, 0.84.3, 0.92.3) *do* exist in the
pnpm store via transitive deps -- the risk was real, not hypothetical. It is Embroider's rewriting
that defuses it.

### `object-scan` worked example — and one non-obvious trap

Added to `test-app/package.json` only (`object-scan@^20.0.4`); the addon still depends on no
traversal library, which is the whole point of `toCell` being an accessor function. Ambient types in
`test-app/types/object-scan.d.ts` (the package ships none).

**Scanners are compiled once per column at module scope** (`compileScanner()` in
`app/utils/scale-records.ts`), and the compile count is rendered on the page — it reads **2**, not
7,000, so the hoisting is visible rather than asserted.

**The trap, which cost a rewrite:** `object-scan` walks **own enumerable** properties, and `@tracked`
fields are *accessors on the prototype* (Ember's decorator, and `decorator-transforms`, both define
them there). A scanner pointed at a model instance therefore matches **nothing, silently** — no
error, just empty cells. Point it at the plain nested payload instead (`objectScan(["pets.name"])`
applied to `employee.profile`, not to `employee`), which is what a GraphQL response is anyway. DATA.md's
example previously scanned the record object and has been corrected.

### Instrumenting a projection: the counter must NOT be `@tracked`

`toCell` runs *inside* the caller's tracking frame — that is rule 1. Incrementing a `@tracked`
counter there is a read-then-write of tracked state inside a computation the template has already
consumed, i.e. precisely Ember's backtracking-rerender assertion. So the counters are plain untracked
numbers, and the component copies them into tracked display fields afterwards, in a `next()` turn
(a new runloop, so it lands after the render the mutation caused). Confirmed working: `next()` fires
after the projection every time, with no assertion in the console. **Anyone instrumenting a tracked
computation on this project hits this; don't rediscover it.**

Note also that the on-screen "mutation -> counter read" milliseconds is wall clock including render
*scheduling* (it varied 110-890 ms across identical actions while the automation was driving the
tab). It is labelled as not-a-benchmark in the UI for that reason; do not quote it as repaint cost.

### Files changed (all `test-app`)

- `app/components/tracking-demo.gts` — rewired onto `recordsSource`; the module-scope `personToCell`
  replaces the hand-written `.map()` snapshot; the long "SCALING: don't copy this projection
  verbatim" block shrank to a pointer at `recordsSource`/DATA.md/`<ScaleProof>`. All four proof
  constraints preserved (no `updateCells()`, no `onCellEdited` passed, every cell
  `allowOverlay: false`, nothing changing identity). Renders `<ScaleProof />` below itself, so no new
  tab and **`demo-switcher.gts` was not touched**.
- `app/components/scale-proof.gts` — NEW. The 1,000-row measurement + its four controls.
- `app/utils/scale-records.ts` — NEW. GQL-shaped `Employee` records, deterministic generator,
  hoisted `object-scan` scanners, the instrumented `employeeToCell`, the counter API.
- `types/object-scan.d.ts` — NEW. Ambient types.
- `package.json` — `object-scan` added.
- `glide-data-grid-ember/DATA.md` — "Status of this recommendation" now carries the measured table
  instead of an IOU; the nested-data section gained the prototype-accessor warning and a pointer to
  the worked example.

### Verification actually performed

- `npx tsc --noEmit -p tsconfig.json` (addon) — clean; `npx glint` (test-app) — clean;
  `pnpm --filter test-app exec vite build` — succeeds (477 modules).
- `pnpm --filter glide-data-grid-ember build`, then the established loop: kill server ->
  `rm -rf test-app/node_modules/.vite` -> restart on **:4500** (:4200 was another agent's) ->
  fresh `?cb=` query string.
- Browser: every row of the measurement table above; the rewired 8-row tracking proof still repaints
  from the form (`Alan Turing` -> `Alan M. Turing`) with no imperative redraw; no console
  errors/assertions.

### What was NOT verified (do not round this up)

- **The blit fast path was not re-measured.** `computeCanBlit`'s identity check on `getCellContent`
  is what `recordsSource`'s result-object reuse exists to satisfy, and it is still only asserted by
  the Phase 8b Node script. Nobody has confirmed in-page that the blit engages while scrolling a
  `recordsSource`-backed grid.
- **No repaint-cost benchmark.** The claim proven is "one row re-projected, not 1,000", counted. How
  much wall-clock that saves at 1,000 rows was not measured, and the on-screen ms figure is not it.
- Composition with `withColumnSort` was not exercised in this demo (no sort is wired to either grid
  here); `glide-demo.gts` remains the place that covers the sorted write path.
- `<ScaleProof>` was tested at 1,000 rows only — not at the 200k end, which is the `updateCells()`
  path's territory anyway (PHASES.md deliverable 4).

## Phase 8c — the high-frequency / streaming `updateCells()` demo (COMPLETE, browser-verified, 2026-08-08)

PHASES.md deliverable 4. `test-app` only — **nothing in `glide-data-grid-ember/src/**` was touched**,
including the addon defect found below, which is left for whoever owns the addon.

Files: `app/components/streaming-demo.gts` (NEW), `app/utils/streaming-demo-data.ts` (NEW),
`app/components/demo-switcher.gts` (new tab + a height fix, see below), `app/styles/app.css`.

Shape: 10,000 rows × 12 columns, a plain non-tracked `Float64Array`/`string[]` store mutated in
place, a lazy O(1) `getCellContent`, and an rAF ticker that mutates N rows and hands the exact
changed cells to `GlideDataGridApi.updateCells()`. Pattern (1) from "Autotracking → canvas", at
scale. Every number on screen is measured, not asserted, and is mirrored onto
`[data-test-streaming-stats]` as `data-*` attributes so automation can read it without scraping
formatted text.

### Measured throughput (Chrome 120 Hz display, dpr 2, **production `vite build`**, macOS)

| Target | Measured cells/sec | Ticks/sec | Damage repaint (avg / peak) | Whole frame (mutate + `updateCells`) | Cells/tick |
| --- | --- | --- | --- | --- | --- |
| 1k/s | 1,003 | 120.1 | 0.23 / 0.9 ms | 0.34 ms | 8 |
| 10k/s | 10,003 | 120.0 | 0.27 / 0.9 ms | 0.87 ms | 83 |
| 50k/s | 49,998 | 120.0 | 0.15 / 0.5 ms | 1.15 ms | 417 |
| 100k/s | 100,003 | 120.1 | 0.16 / 0.4 ms | 1.97 ms | 833 |
| 250k/s | 249,997 | 120.1 | 0.15 / 0.4 ms | 3.44 ms | 2,082 |
| **Max** (adaptive) | **524,435** | 119.4 | 0.26 / 3.7 ms | 6.77 ms | 4,392 |

"Max" is an adaptive batch controller (grow while a frame costs < 6 ms, shrink above 12 ms); it
converged on **4,394 cells/frame** and stayed there, so the half-million figure is a measurement
rather than a hardcoded claim. **Scroll stayed smooth while streaming**: over a 7 s window at 50k/s
with real `computer` wheel scrolls (vertical to row ~60 and horizontal), 839 rAF frames in 7,002 ms
(119.8 fps), worst frame gap 26.4 ms (one ~2-frame hiccup), ticker never dropped below 118.1/sec,
peak damage repaint 0.4 ms, and **0 frames** with a blanked canvas. No console errors anywhere in
the session.

### Damage coordinates land on the right column — with row markers ON (the case that used to be wrong)

`GridHostController.updateCells` now adds `rowMarkerOffset` internally, so the demo runs
`@rowMarkers="number"` deliberately: with markers off, mangled and consumer column space coincide
and the interesting path never runs.

**Verification technique, reusable**: don't eyeball a screenshot. Hash the content canvas per
**device-pixel x column** (40 sampled scanlines through the body, rolling `Math.imul` hash per x),
snapshot twice ~2.5 s apart while streaming, and report the x-ranges that changed. Result: the only
changed band was CSS x ∈ **[345, 1293.5]**, against column bounds
`Symbol 45-155 | Company 155-345 | Last 345-435 | … | Fill 1155-1295 | Venue 1295-1385`
— i.e. exactly the 9 columns the demo names (`Last`…`Fill`, consumer indices 2-10), with the
row-marker band, `Symbol`, `Company` and `Venue` untouched. A dropped `rowMarkerOffset` would have
produced [155, 1155] (`Company`…`Trend`) instead, freezing `Fill`. That is a real discriminator, not
a plausibility check.

### THE FINDING: a fractional grid height blanks the whole grid on any damage-only repaint

**This is an addon defect, unfixed, and it is not specific to this demo.** It cost most of this
phase's time and it is invisible to `tsc`, every build, and every previous browser pass.

- `GridHostController` takes its size straight from `ResizeObserver`'s `contentRect`
  (`grid-host-controller.ts:739-741`) — a **float**.
- `drawGrid` guards canvas sizing with
  `if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = …; canvas.height = …; }`
  (`src/rendering/render/data-grid-render.ts:179-187`). `canvas.height` is an unsigned long and
  **truncates**; `height * dpr` does not.
- So a grid whose measured height is fractional fails that comparison on **every single draw** and
  reallocates the canvas every time. The 2D context is created with **`alpha: false`**, so a
  reallocation clears it to **opaque black**.
- A *full* redraw hides this perfectly — it repaints everything immediately after. A **damage**
  redraw does not: `drawGrid` returns straight after painting only the damaged cells, so the entire
  rest of the grid stays black. Measured height here was `574.40625`; `× dpr 2 = 1148.8125` vs a
  canvas height of `1148`.

Symptom: within ~1 s of starting the stream the grid body went solid black with only the ~9 damaged
columns of the most recent rows visible, and it never recovered — a subsequent scroll *did* repaint
correctly for exactly one frame before the next damage draw blanked it again. At 1,000 cells/sec,
i.e. not load-related at all. It also means the **blit fast path is dead** for any such grid (the
canvas it would blit from is cleared under it).

**Proof, not inference** — patched `HTMLCanvasElement.prototype`'s `width`/`height` setters in the
page's **main world** (see the injection trick below) and caught the stack:
`resizeH from 1148 to 1148.8125 … at drawGrid | at GridHostController.runDraw | at drawWithDamage | at updateCells`.

**The fix belongs in the addon** and was deliberately not made here: round/floor the size before it
reaches `drawGrid` (e.g. `this.width = Math.round(width)` in the `ResizeObserver` callback), or
compare against `(canvas.height / dpr)`. Rounding at the observer is the safer of the two — several
other call sites (`computeBounds`, hit-testing, the `.dvn-stack` height math) consume `this.width`
/`this.height` and would then all agree with what was actually painted.

**Workaround applied in the demo, so it is usable today** (marked as a workaround in both files):
`.gdg-streaming__controls`/`__stats` are pinned to whole-pixel flex bases (`flex: 0 0 25px` /
`0 0 62px`) **plus `min-height: 0`**, and `demo-switcher.gts`'s tab row to `flex: 0 0 30px`. The
`min-height: 0` is not decorative: a flex item defaults to `min-height: auto`, which refuses to
shrink below its content's min-content height and silently handed the fractional basis straight back
(62.0938 px — a `line-height: 1.2` on an 18 px stat value; that 0.09 px blanked the grid). With the
strips pinned the grid box lands on exactly 566 px, `× 2 = 1132` = `canvas.height`, and the symptom
is gone (verified: 0 black frames across every rate and across scrolling).

Why this stayed dormant until now: it needs *both* a fractional height *and* damage-only repaints.
`glide-demo.gts` measures 669 px (whole) at this window size, and every other demo is full-redraw
driven. Another instance of the standing Phase 7e lesson — **a feature no demo has ever switched on
is unverified code** — this time for `updateCells()` at volume.

### Second bug, demo-side, fixed: the rate credit was quantised away at low targets

`1k/s` measured **~430/s**. A row tick is indivisible (9 cells), and the ticker was deducting the
whole per-frame budget from `cellCredit` before rounding down to whole row ticks — so at 120 fps a
frame earns ~8.3 cells, can't buy a tick, and forfeited the lot. Now the credit is drained in whole
*row ticks* (`rowTicks = floor(credit / CELLS_PER_ROW_TICK); credit -= rowTicks * CELLS_PER_ROW_TICK`)
and the remainder accumulates. Every target above is now hit to within 0.3%. Worth remembering for
any future rate-limited ticker on this project: **never deduct budget you couldn't spend.**

### The rAF + timer ticker driver

rAF is the primary (it is what source's `rapid-updates` story uses, and it keeps `updateCells` in
step with the compositor), with a **250 ms `setTimeout` racing it**; whichever fires first runs the
tick and cancels the other, and a `driver: "rAF" | "timer"` readout says which one actually
delivered, so the measured numbers can be read honestly. Chrome does not run rAF at all in a hidden
or occluded document, so an rAF-only ticker silently freezes with the UI still saying "streaming".

**Verified directly** by stubbing `window.requestAnimationFrame` to a no-op in the page's main world
for 4 s: driver flipped `rAF → timer`, ticks/sec `120 → 4.0` (= the 250 ms guard), **31,626 cells
still processed while rAF was dead**, and everything returned to `rAF` @ 120/sec when it was
restored. (Chrome additionally clamps timers to ~1 Hz in a genuinely hidden document, which is why
the readout names the driver rather than implying every tick is a painted frame.)

`driver` is written through a compare-and-set helper, not assigned directly: **`@tracked` setters
dirty their tag unconditionally**, so `this.driver = "rAF"` inside the ticker would push a Glimmer
revalidation into all 120 frames a second. Worth knowing for any per-frame code that touches tracked
state.

### Browser-testing gotchas (add these to the existing list — both cost real time here)

1. **Injecting a `<script>` element executes in the page's MAIN world, and this defeats the
   documented isolated-world limitation.** PORTING-NOTES' Phase 6 note (correctly) says
   monkeypatching a prototype from `javascript_tool` does nothing because JS prototypes are
   per-world. But `document.documentElement.appendChild(Object.assign(document.createElement('script'),
   {textContent: '…'}))` from `javascript_tool` runs that source *in the page's world*, where
   prototype patches, `window.requestAnimationFrame` stubs and stack traces all work on real page
   code. Results still have to come back through the DOM (`root.setAttribute(...)`), but this turns
   "can't instrument the page" into "can". Both root causes above were nailed this way in minutes
   after an hour of guessing. No CSP blocks it in this test-app.
2. **A tab in the MCP tab group is `document.visibilityState === "hidden"` whenever another tab in
   that group is the active one** — including tabs left behind by a dead session or opened by a
   concurrent agent. Consequences: rAF never fires, so any `javascript_tool` script that awaits a
   rAF loop **hangs until the 45 s CDP timeout** ("Inspected target navigated or closed" / "renderer
   may be frozen"); canvas content can be evicted so screenshots come back black for reasons that
   have nothing to do with your code; and all timing numbers are throttled garbage. `computer`
   screenshots and clicks keep working, so nothing warns you. **Check
   `document.visibilityState === "visible"` before trusting any measurement, and close/avoid extra
   tabs in the group.** Every measurement in this section carries a visibility check taken in the
   same script.
3. **Concurrent agents make a Vite dev server useless for timing work.** Another agent editing
   `test-app` triggered `[vite] page reload` repeatedly, resetting the demo tab mid-measurement.
   The reliable answer is to **`vite build` once, copy `test-app/dist` to a scratch directory, and
   serve that** (`python3 -m http.server`) — immune to file churn, and a production build is a more
   honest thing to benchmark anyway.
4. Synthetic `element.click()` from `javascript_tool` **does** drive Ember `{{on "click"}}` handlers
   reliably (used for every control in the sweeps above). This is consistent with the existing note
   that it is *focus*, *hover* and *scroll* that need trusted `computer` input, not plain clicks.

### Verification actually performed

- `pnpm --filter glide-data-grid-ember build` (rebuilt first — the addon had changed), addon
  `npx tsc --noEmit -p tsconfig.json` clean, `npx glint` in `test-app` exit 0,
  `pnpm --filter test-app exec vite build` succeeds (459 modules).
- Browser on **:4451** (a static server over a copy of the production build; :4200/:4400/:4500 were
  other agents'). Every number in the tables above, the per-column damage hash test, the scroll
  test, the rAF-stub fallback test, and a controls sweep: highlight on/off, reset stats (total
  resets and re-accumulates), stop (total frozen — ticker really is cancelled), and switching demos
  away and back (destroy path clean, no leaked ticker). No console errors or Ember assertions.
- Regression: `<GlideDemo>` still renders correctly after the `demo-switcher.gts` tab-row change,
  and its grid host measures a whole 669 px (so it was never exposed to the height defect).

### What was NOT verified (do not round this up)

- **The addon height/`alpha:false` defect is only worked around, not fixed**, and the workaround is
  layout-specific: any consumer whose grid lands on a fractional CSS height (or any fractional
  `devicePixelRatio`, e.g. browser zoom or a 150% Windows display, where even a whole-pixel height
  fails) hits it again the moment they use `updateCells`. It needs an addon change.
- **The blit fast path was not re-measured here.** Given the above it is almost certainly *not*
  engaging whenever the height is fractional; whether it engages with a whole height under a
  streaming load was not instrumented (Phase 6's `computeCanBlit` field-diff technique would do it).
- **Damage row correctness was not isolated.** The column axis was proven precisely; every row is
  being updated constantly, so no test here distinguishes "damaged row R repainted R" from "R
  repainted because everything did". The column axis is the one that was actually broken.
- Numbers are from one machine (macOS, 120 Hz, dpr 2, production build). They are not a cross-browser
  or cross-platform claim, and the "Max" figure is a property of this machine by construction.
- The demo is not wired to `recordsSource`/`withColumnSort` — deliberately: pattern (1) exists
  precisely for data that must not be projected eagerly, and mixing them would blur what it proves.

## Phase 8e — orchestrator's own Phase 8 work: two addon primitives, two addon defects, and the verification pass

Written by the orchestrator after independently re-verifying 8a/8b, 8c and 8d rather than trusting
the implementing agents' self-reports (standing rule). Everything below is either work done directly
here or a measurement taken here.

### `onVisibleRegionChanged` (new `GridHostArgs` + `<GlideDataGrid>` arg)

Source computes this in `scrolling-data-grid.tsx`'s `processArgs`; this port derives it at the end of
`runDraw` instead, which covers scroll, resize and arg changes from one call site and keeps it
aligned with the offsets actually painted. Two decisions worth knowing before touching it:

- **The region is in the consumer's coordinate space** — `x` excludes the synthetic row-marker
  column, `y`/`height` cover real data rows only (never the trailing blank row). This matches
  `getCellContent`'s `Item` and `onCellsEdited`'s `location`, and deliberately *not*
  `onHeaderMenuClick`'s `col`, which is mangled (see Phase 7c). **Frozen columns are excluded from
  the range** — they are permanently visible, so folding them in would make the rect discontiguous
  the moment the grid scrolls horizontally. That is why `AsyncRecordsSource` takes its own
  `freezeColumns` option: without it, an arriving page would never repaint the frozen columns.
- **The callback is deduped and deferred to a microtask.** Deduping keeps it to at most one call per
  crossed row/column boundary rather than one per frame. The deferral is the load-bearing part: a
  draw can originate *inside* the Ember modifier's tracking frame (via `scheduleFullRedraw`), and the
  entire point of this callback is that consumers set tracked state from it to drive paging — which
  Ember forbids during a render pass. Source has no equivalent hazard because React's event model
  never calls it mid-render.

### `AsyncRecordsSource` (`src/data-source/async-records-source.ts`) — port of `use-async-data-source`

**It is a class, unlike every other decorator in that directory, and that is deliberate.** The pure
functions there own no state, so memoizing them reproduces identical closures. This one owns a sparse
row buffer, the requested-page set and the last visible region — source expresses exactly that with a
pile of `useRef`s. The Ember-honest equivalent is an object constructed once and held as a class
field; its bound instance fields are then identity-stable permanently, with no memo to get wrong.

**Do not compose it with `withColumnSort`.** Sorting sweeps every row to build its map, and by
construction most rows here are not loaded. Sort server-side and return a different ordering.

Behaviour verified by a Node suite against the built `dist/` (21 assertions): paging with source's
own half-page overscan window, no page requested twice, `maxConcurrency` enforced via a real queue,
damage lists scoped to the visible block, edits to unloaded rows dropped rather than crashing,
**a failed page un-marked so a later visit retries it** (source has no such handling — a rejected
`getRowData` there leaves the page permanently marked as loading), `invalidate()`, and frozen-column
damage coverage.

### Addon defect fixed: `updateCells` ignored the row-marker offset

`GridHostController.updateCells` passed the consumer's `[col, row]` straight into the damage
`CellSet`, but damage is matched against **mangled** column indices inside the draw loop
(`data-grid-render.cells.ts` compares `c.sourceIndex`). So with `rowMarkers !== "none"` every
imperatively-updated cell repainted **one column to the left**. Source adds `rowMarkerOffset` at
exactly this boundary (`data-editor.tsx:4001-4006`); this port never did.

Same class as the five Phase 7e defects — invisible until a demo turns on two features at once (row
markers *and* `updateCells`), which nothing did until Phase 8. Confirmed fixed in the browser by the
8c agent by hashing the canvas per device-pixel column: the changed band was exactly consumer columns
2–10, with the marker band and the frozen columns untouched; the pre-fix behaviour would have shifted
that band one column left and frozen the last one.

### Addon defect fixed: a fractional grid height blanked the whole grid on damage-only repaints

Found by the 8c streaming demo, and the most valuable thing that demo produced.

`canvas.width`/`canvas.height` are WebIDL `unsigned long`s, so assigning a fractional value truncates.
`drawGrid` compared `canvas.width !== width * dpr` and assigned the raw product, so whenever
`width * dpr` was fractional the readback could never equal the target and **the canvas was
reallocated on every single draw**. Reallocation clears a canvas, and these contexts are
`alpha: false`, so it cleared to opaque black.

Why it stayed hidden through seven phases: a full redraw repaints everything immediately afterwards
and hides it completely. Only a **damage-only** redraw exposes it — it paints a handful of cells onto
a freshly-blacked canvas. Phase 8 is the first phase to drive `updateCells` continuously. It also
means the blit path was dead for any such grid, since no previous frame ever survived.

Fractional sizes are ordinary, not exotic: `ResizeObserver`'s `contentRect` is fractional for any
flex/percentage layout, and `devicePixelRatio` is fractional on many displays — so an integer CSS
size is not sufficient protection either.

**Fixed in `src/rendering/render/data-grid-render.ts`** by flooring to whole device pixels for the
main canvas, the header canvas and both double-buffer canvases. This is a **deliberate divergence
from source** (source still has the unfloored comparison) and is commented as such in place, so
nobody "restores" it during a future re-sync.

The 8c agent had worked around it by pinning whole-pixel heights in `app.css` and `demo-switcher.gts`.
**Those pins were reverted here on purpose**: with the addon fixed, letting the demos sit on a
fractional height (the tab strip measures 21.5px) keeps that path exercised. If a grid ever goes
black again, that is what broke.

### Verification performed here (not delegated)

- **`recordsSource` + `withColumnSort`, 26 assertions** against the built `dist/`: identity stability,
  the eager-read entanglement, 1,000 records → 2,000 projections cold and **exactly 2** after editing
  one field, the sorted write path landing on the displayed record, and the read/write cache split.
  *Caveat recorded honestly*: ember-source's dist cannot execute in bare Node (it needs the
  `@embroider/macros` babel transform), so that suite substitutes a standalone `@glimmer/validator`.
  It proves the algorithm, not the framework integration — 8d's browser proof is what settles that.
- **The 1,000-row proof reproduced independently in Chrome**: 1000 of 1000 cold → **1 of 1000** (7
  `toCell` calls) after editing one field. No console errors.
- **The blit fast path re-measured through `recordsSource`** — the gap 8d explicitly left open, and
  worth closing given this project lost that optimization silently from Phase 2 to Phase 6. Reused
  Phase 6/7e's technique: temporarily instrument `computeCanBlit` to write the differing field names
  onto a `document.documentElement` attribute (the DOM is the only reliable bridge out of
  `javascript_tool`'s isolated world), then drive **real `computer` scroll actions**. Result on the
  1,000-row `recordsSource` grid: **3 of 3 scroll draws had `mappedColumns` as the only differing
  field** (which falls into `computeCanBlit`'s own `deepEqual` branch and returns true), zero draws
  with `last === undefined`, and **`getCellContent` never differed once**. So `recordsSource` is
  identity-stable in practice and the blit path engages through it. Instrumentation removed;
  `git status` on `src/rendering/render/**` afterwards shows only the intentional
  `data-grid-render.ts` fix.
- **The black-canvas fix verified on the previously-broken configuration**: streaming demo at 50,002
  cells/sec measured against a 50,000/s target, on a grid whose host height is **574.40625px** at
  dpr 2 (= 1148.8125 backing pixels, the exact fractional case). Zero black pixels in 70 samples
  across the canvas, and a sentinel rectangle stamped into the canvas **survived 1.5s of continuous
  damage repaints**, which is the direct proof that the canvas is no longer being reallocated per
  draw.
- **`AsyncRecordsSource` browser-verified** via a new `<AsyncDemo>` (100,000 rows, `pageSize` 100,
  `maxConcurrency` 4, simulated latency): page 0 loaded on first paint; scrolling to row ~74 requested
  the next page via the overscan window; a jump to row 26,470 requested 4 pages with **2 in flight
  against a cap of 4** and rendered them on arrival through the damage path; `invalidate()` dropped
  all 400 loaded rows to zero and refetched only the visible pages.

### Browser-testing gotcha that cost real time here (adds to the existing list)

**A tab whose `visibilityState` is `"hidden"` produces 0×0 canvases and an empty visible region, with
no error anywhere.** Chrome stops the rendering lifecycle for a hidden tab, so `ResizeObserver` never
delivers a size, `GridHostController` keeps `width`/`height` at 0, and `drawGrid` early-returns on
`if (width === 0 || height === 0)`. Meanwhile `javascript_tool` still runs, the DOM still measures
correctly (the *element* is 564px tall), clicks still work, and consumer callbacks still fire — so
everything looks alive while nothing paints. This produced a completely convincing false bug report
(`Visible: cols 0–-1, rows 0–-1`, canvases `[0,0]`) that evaporated the instant the tab was
activated. The 8c agent hit the same thing from the other direction (a tab in the MCP group goes
hidden whenever another tab in the group is active). **Check `document.visibilityState` before
believing any "the grid isn't rendering" symptom**, and take a `computer` screenshot to force
activation.

One related trap: `document.querySelectorAll('canvas')` is **not** a safe way to find the grid's
canvases. The controller appends two offscreen double-buffer canvases to `document.documentElement`,
and stale ones from destroyed grids can sit ahead of the live ones in document order. Scope the query
to the grid root (`.dvn-scroller`'s `parentElement`).

## Phase 9 audit — source-tree inventory of what is NOT ported (2026-08-08)

Done when the user asked to flesh out Phase 9. **This is an audit against the source tree itself, not
against this file** — which matters, because the pre-existing Phase 9 list had been assembled by
reading these notes, and that method is structurally blind to whole subsystems no phase ever had a
reason to mention. Seven groups (`9a`–`9g` in PHASES.md) were found this way and had never been
written down anywhere. **Standing lesson: auditing your own notes only finds what you already knew
you skipped.**

The full fleshed-out backlog lives in `PHASES.md`'s Phase 9 section (groups 9a–9o, with size and
priority tags). Recorded here is only the raw inventory, so nobody has to re-run the greps:

**Source subsystems with zero equivalent in this port:**

| Source | Lines | Note |
|---|---|---|
| `internal/data-grid-search/data-grid-search.tsx` + `-style.tsx` | 577 + 96 | search overlay; needs `getCellsForSelection` first |
| `data-grid.tsx`'s `accessibilityTree` (~1737–1866, rendered 1941) | ~130 | debounced `<table role="grid">` mirror of the visible region. This port's root is a bare `tabIndex=0` div with **no ARIA at all** |
| `data-editor/row-grouping.ts` + `row-grouping-api.ts` | 326 + 72 | row grouping (column grouping *was* done, Phase 7b) |
| `data-editor/use-column-sizer.ts` | 253 | real text-measurement auto-sizing (port uses a flat 150px fallback) |
| `data-editor/data-editor-keybindings.ts` + `common/is-hotkey.ts` | 198 + 86 | remappable keybinding DSL |
| `data-editor/use-cells-for-selection.ts` | 72 | `getCellsForSelection`; blocks search + async copy |
| `data-editor/use-autoscroll.ts` | 41 | autoscroll while dragging past the edge |
| `internal/data-grid-overlay-editor/use-stay-on-screen.ts` | 61 | IntersectionObserver that keeps an open editor from being clipped at the viewport edge. **No `IntersectionObserver` exists anywhere in this port** — latent user-visible defect, not just a missing feature |
| `internal/scrolling-data-grid/use-kinetic-scroll.ts` | 78 | iOS momentum-scroll settling; touch-only, so it is part of the deferred touch item |
| `data-editor/use-rem-adjuster.ts` | 56 | `scaleToRem` |
| `data-editor/group-rename.tsx` | 67 | `onGroupHeaderRenamed` |
| `packages/source/use-movable-columns.ts` | 82 | Phase 8 ported 2 of the 5 source hooks |
| `packages/source/use-collapsing-groups.ts` | 136 | " |
| `packages/source/use-undo-redo.ts` | 242 | " |

**Both repos are indexed in the `codebase-memory` knowledge graph** —
`Users-jxhui-Developer-glide-data-grid` (2368 nodes) and `Users-jxhui-Developer-glide-data-grid-ember`
(1542 nodes). Use it before hand-grepping either tree. Note there is also a stale
`...-glide-data-grid-orig` project with 54 nodes — not the source repo, don't use it.

**Prop surface:** source's `DataEditor` exposes **82** `readonly` props; `<GlideDataGrid>` exposes
**26** (30 after the Phase 9 partial below). Enumerate the port's with
`grep -n "readonly [a-zA-Z]*\??:" src/-private/grid-host-controller.ts` and source's with the same
pattern against `packages/core/src/data-editor/data-editor.tsx`.

**Four `DrawGridArg` fields the render layer fully supports but the controller hardcoded to
`undefined`** — `drawHeaderCallback`, `drawCellCallback`, `prelightCells`, `highlightRegions` —
plus `freezeTrailingRows` hardcoded to `0` and `touchMode` to `false`. **The four callbacks were
exposed on 2026-08-08** (see the Phase 9 partial section below). `freezeTrailingRows` is NOT the same
one-line job and was deliberately left — it is hardcoded at seven coordinate-math call sites too.
`touchMode` belongs to the deferred touch item.

**Imperative API:** source's `DataEditorRef` has 9 methods; `GlideDataGridApi` (via `@onReady`) has
**one** (`updateCells`). `scrollTo`/`getBounds`/`focus`/`getMouseArgsForPosition` are all thin wrappers
over internals that already exist and are already used by hit-testing (`scrollCellIntoView`,
`computeBounds`, `resolveMouseHit`).

**No touch/pointer handling anywhere** — every listener is `mousedown`/`mousemove`/`mouseup`/
`keydown`. No `contextmenu` listener either, so none of source's three context-menu props can exist.
Native *scrolling* works on touch for free (it's a real scroller div); nothing else does.

**No automated tests exist in this repo.** `test-app/tests/unit/` and `test-app/tests/integration/`
are empty directories; `test-app`'s `test:ember` script would run but has nothing to run; the addon's
`test` script is the v2-addon placeholder echo. Everything to date was verified by
`tsc` + `pnpm build` + `vite build` + a manual browser pass, plus some throwaway Node scripts in
Phase 8 that were never kept. Don't assume a regression suite is protecting anything.

## Phase 9 (partial) — the two cheap exposures, done 2026-08-08 (browser-verified)

Two items from the Phase 9 backlog, picked because both were exposures of machinery that already
worked rather than new behaviour. **No rendering code was written for either.** The rest of Phase 9
remains unscheduled; 9b (accessibility) and 9c (touch) are deferred by explicit user decision.

### 1. The four consumer draw hooks (`9g`)

`drawCell` / `drawHeader` / `prelightCells` / `highlightRegions` were live `DrawGridArg` fields —
ported in Phase 1, fully supported by `src/rendering/render/*` — that `runDraw` pinned to
`undefined`. They are now `GridHostArgs` fields and `<GlideDataGrid>` args, passed straight through.
Note the name mapping: the public args use **source's prop names** (`drawCell`/`drawHeader`), the
`DrawGridArg` fields keep the engine's (`drawCellCallback`/`drawHeaderCallback`).

`Highlight` had to be added to `src/rendering/index.ts`'s barrel — it was defined in
`render/data-grid-render.cells.ts` and never exported, so `highlightRegions` was untypeable from
outside the addon.

**Both `prelightCells` and `highlightRegions` are `computeCanBlit` identity-compared fields**
(`data-grid-render.blit.ts:248,251`). The controller cannot defend this — it has no way to know two
equal-looking arrays are "the same" — so the stability requirement is documented on the `GridHostArgs`
doc comments and demonstrated in the demo (frozen module-scope constants swapped wholesale by the
toggle, read through `@cached` getters).

### 2. `@extraCells` (`9l`)

`<GlideDataGrid>` now takes `extraCells?: readonly CustomRenderer<any>[]` (source's `customRenderers`)
and combines it with the Phase 4 built-in registry itself. `@getCellRenderer` still wins if passed.

**The `@cached` getter is load-bearing, not tidiness.** `buildGridHostArgs()` runs on every draw,
scroll and hover pass, so calling `createCombinedCellRenderer(...)` inline there would hand the engine
a fresh closure per frame — and `getCellRenderer` is identity-compared by `computeCanBlit`. That is
the Phase 6 defect exactly. This is also the concrete instance of the case PHASES.md's 9k note
predicted: **`@cached` on a component getter is the right tool for a derived `DrawGridArg` value**,
in contrast to `GridHostController`'s hand-rolled caches (which can't use it — the controller holds
deliberately untracked state, so a `@cached` there would be `isConst` and freeze permanently).

Both `<GlideDemo>` and `<DemoGrid>` were rewired off their hand-built
`createCombinedCellRenderer(defaultGetCellRenderer, allExtraCells)` module constants and onto
`@extraCells={{allExtraCells}}`.

### What was deliberately NOT done, and why it isn't cheap

**`freezeTrailingRows` looks like a fifth passthrough and is not.** It is hardcoded to `0` in
`runDraw` *and* at **seven coordinate-math call sites** (`computeBounds` ×5, `getRowIndexForY` ×2),
plus scroll-content sizing. This is the same trap Phase 2a documented for `groupHeaderHeight`: the
render engine accepts the flag, but the controller's own hit-testing must account for the pinned rows
independently, or clicks land on the wrong row with nothing visibly wrong. Re-read the Phase 2a note
before attempting it.

### Verification actually performed (not delegated)

- `tsc --noEmit` clean; addon rollup build clean; `test-app` vite build clean.
- **Browser**: all four hooks render simultaneously in `<DemoGrid>` behind a "Show draw hooks"
  toggle — `drawCell` dots on `(col+row) % 7 === 0`, `drawHeader` underlines on every third column,
  the `highlightRegions` tinted+dashed rectangle over cols 1–3 × rows 2–5, and `prelightCells`
  tinting exactly `[1,8] [2,8] [3,8]` (confirmed by zoom: the tint spans those three cells and stops,
  with the neighbouring zebra row unaffected). No console errors.
- **`@extraCells` browser-verified on both demos** — the Glide replica's sparkline / user-profile /
  drilldown columns and `<DemoGrid>`'s sparkline + star columns all resolve through the new combined
  renderer.
- **The blit fast path was re-measured with all five new args live**, using the Phase 8e recipe
  (temporarily instrument `computeCanBlit` to write differing field names onto a
  `document.documentElement` attribute, then drive **real `computer` scroll actions**). Result over
  two scrolls, vertical and horizontal, hooks ON: **8 draws — 6 damage-only (`last === undefined`,
  i.e. hover repaints) and 2 scroll draws whose ONLY differing field was `mappedColumns`** (which
  falls into `computeCanBlit`'s own `deepEqual` branch and returns true). `getCellRenderer`,
  `highlightRegions`, `prelightCells`, `drawCellCallback`, `drawHeaderCallback` and `getCellContent`
  **never differed once**. Same result Phase 8e got, with the same single known offender —
  `mappedColumns`, which is backlog item 9k. Instrumentation reverted; `git status` on
  `src/rendering/` afterwards shows only the intentional `index.ts` barrel export.

### Browser-testing gotcha (adds to the existing list — cost real time here)

**The test-app consumes the addon from `dist/`, and Vite caches it.** Editing addon `src/` does
nothing until `pnpm --filter glide-data-grid-ember build` runs — but worse, an addon rebuild that
happens *while the dev server is already running* is **not picked up by a page reload either**. The
optimizer has the old copy. Symptom: freshly-added instrumentation appears in `dist/` and in the
module the page fetches, yet never executes. Fix: rebuild the addon, then `pkill -f vite`,
`rm -rf test-app/node_modules/.vite`, restart. Cheapest habit is to build the addon *before* starting
the dev server. (And note the server picks port 4201 if 4200 is still held by a dying process.)

## Phase 9a (started) — the vitest harness, and the first Haiku-written suites

**Harness** (`glide-data-grid-ember/vitest.config.ts`). Unit tests for the framework-agnostic layer
run in **bare Node via vitest, against `src/` directly** — no build, no browser, subsecond. This is
viable precisely because `src/rendering/` and the pure parts of `src/data-source/` have zero Ember
imports by design (Phase 1). It sits *alongside* `test-app`'s QUnit setup, which remains the right
home for anything needing a real Ember app or a real canvas (PHASES.md's 9a item 4, not built yet).

**Do not put anything importing `ember-source` in this harness** — Phase 8 already established that
ember-source's dist can't execute in bare Node (needs the `@embroider/macros` babel transform).

### Four config touchpoints that must stay in sync — all four were needed, and three are non-obvious

Tests are **colocated** (`src/foo.ts` ↔ `src/foo.test.ts`). Making that work took:

1. `vitest.config.ts` — `include: ["src/**/*.test.ts"]`, `environment: "node"`.
2. `rollup.config.mjs` — `addon.publicEntrypoints([...], { exclude: ['**/*.test.ts'] })`. Without it
   the broad `**/*.js` entrypoint glob picks tests up, and **the build fails outright**, because
   `addon.dependencies()` correctly rejects the `vitest` import (a devDependency).
   **A negation pattern in the `patterns` array does NOT work** — `'!**/*.test.js'` is treated as an
   entry module and fails with `Could not resolve entry module "src/-private/"`. These are walk-sync
   globs; `exclude` maps to walk-sync's `ignore`. Verified by hitting both failures.
3. `tsconfig.json` — `"exclude": ["src/**/*.test.ts"]`, so `addon.declarations('declarations')`
   doesn't emit `.d.ts` files for tests into the published package (`package.json#files` ships
   `declarations`). Rollup's exclude does *not* cover this; they are separate pipelines and the
   declaration emit leaked test types even after the rollup build was clean.
4. `tsconfig.test.json` + the `lint:types:test` script — re-includes what (3) excludes, so tests are
   still type-checked (vitest strips types via esbuild without checking them). It must explicitly
   unset `emitDeclarationOnly`/`declarationDir` inherited from `@ember/library-tsconfig`, which are
   errors alongside `noEmit`.

Scripts: `pnpm test` → `vitest run`; `pnpm test:watch`; `pnpm lint:types:test`.

### The one real finding so far: `CompactSelection.remove` drops ranges, and source does too

`remove()` iterates `items.entries()` **while `splice`-ing that same array**. When a removal deletes
a slice entirely (`toAdd` is empty), the splice shifts everything left and the iterator skips the
next slice. So a wide removal spanning several ranges silently leaves some behind:

```ts
CompactSelection.create([[1, 3], [10, 12]]).remove([0, 20]).items  // → [[10, 12]], not []
```

**This port is byte-identical to source here** (`packages/core/src/internal/data-grid/
data-grid-types.ts`, verified by direct comparison 2026-08-08) — so it is an upstream bug, not a port
defect, and must NOT be "fixed" unilaterally. Pinned by the test
`"removes a range wider than any single range"`. Whether anything in this port can actually reach it
was not investigated; `remove` is reachable from row/column deselection.

### Using Haiku subagents for this — what actually happened

Two `model: "haiku"` subagents wrote `compact-selection.test.ts` (78 tests) and
`common/math.test.ts` (64 tests). 154 tests total, all green, `tsc -p tsconfig.test.json` clean.
Orchestrator re-verified independently: re-ran both suites, read representative blocks, checked the
`remove` claim against source, and confirmed all three `hugRectToTarget` early-return branches were
actually covered.

What worked, and is worth repeating:

- **A working exemplar is the whole trick.** `copy-paste.test.ts` was written first, by hand, with a
  numbered CONVENTIONS block in its header. Both agents were told it was binding. Both followed it.
- **Give the excerpt, not the file.** Both prompts said *do not* read `PORTING-NOTES.md`/`PHASES.md`
  and inlined the four facts that mattered (`.ts` extensions, `noUncheckedIndexedAccess`, "this is a
  port, preserve surprising behaviour", no DOM). This deliberately inverts CLAUDE.md's standing rule,
  which exists for agents doing implementation work; for a narrow mechanical task, 4,000 lines of
  context is the risk, not the mitigation.
- **A loud, tight loop.** Both were required to run `pnpm test` and the typecheck themselves. Neither
  reported anything it hadn't actually run.

What to watch for:

- **Both over-produced** — 78 tests against a stated 25–40, and 64 against 30–45. The tests were not
  padding, but a stated ceiling is treated as a suggestion.
- **Agent 1 claimed a behaviour was "faithful-to-source" without any access to source.** It happened
  to be right (verified). Agent 2's prompt therefore added an explicit instruction: *do not claim a
  behaviour matches source; write "Surprising: X. Not verified against upstream" instead.* That
  instruction worked and should stay in future prompts. **Treat any source-fidelity claim from a
  subagent as unverified until the orchestrator diffs it.**
- **Neither ran prettier.** Agent 2's file came back tab-indented against a 4-space repo. Add
  `npx prettier --write` to the definition of done next time, or just run it afterwards.

## Glint v2 upgrade (2026-08-08) — settled, do not re-derive

Both workspaces are on **Glint v2**. Guide followed: https://typed-ember.gitbook.io/glint/v2-upgrade

**The naming is the confusing part, so get it straight before touching versions.** "Glint 2" does
NOT ship as `@glint/core@2.x`. `@glint/core`'s `latest` is still **1.5.2**, and its `2.0.1-unstable.*`
tag is a dead-end prerelease line — which is exactly what the Embroider app blueprint had pinned
`test-app` to, and the source of the `@glint/*` peer-mismatch warning this file recorded as
"harmless" from Phase 2 onward. **Glint v2 ships under a new package name, `@glint/ember-tsc`, which
has a real stable release** (1.10.0 at time of writing). That warning is now gone.

What the upgrade actually was:

| Before (v1) | After (v2) |
|---|---|
| `@glint/core` | `@glint/ember-tsc` |
| `@glint/environment-ember-loose` | *removed* |
| `@glint/environment-ember-template-imports` | *removed* |
| `@glint/template` | unchanged (works with both) |
| `@embroider/addon-dev@^7.1.0` | `@embroider/addon-dev@^8.3.1` — **required**, see below |
| tsconfig `"glint": { "environment": [...] }` | key deleted (environments are a v1 concept) |
| `unpublished-development-types/index.d.ts` imported the two environment packages | imports `@glint/ember-tsc/types` |
| scripts: `glint` | scripts: `ember-tsc --noEmit` |

**The addon-dev bump is not optional.** `addon.declarations()` shells out to a binary by name.
7.1.6 hardcodes `execa('glint', ['--declaration'])`, and the `glint` binary does not exist in v2.
8.3.1 auto-detects — `if (deps['@glint/ember-tsc'])` it runs `ember-tsc --declaration`, else falls
back to `glint` — and also gained an explicit `declarations(path, command?)` override. Every
addon-dev API this repo's `rollup.config.mjs` uses survives the 7→8 major unchanged, including
`publicEntrypoints`' `exclude` option that Phase 9a's test setup depends on.

**v2's headline breaking change costs this repo nothing**: it drops the Ember Loose environment, so
`.hbs` templates are no longer supported at all — only `.gts`/`.gjs`. This workspace has **zero
`.hbs` files** (checked); every component is `.gts`. `rollup.config.mjs` still calls `addon.hbs()`,
which is now inert but harmless. If anyone ever adds a `.hbs` file, it will not type-check — write
`.gts` instead.

**Use `ember-tsc`, never bare `tsc`, for type-checking.** `ember-tsc` is a thin wrapper around `tsc`
that understands `.gts`. Bare `tsc` doesn't error on `.gts` — it silently *ignores* those files, so
it exits 0 having never checked the addon's one templated component. This bit the Phase 9a test
harness: `lint:types:test` was originally plain `tsc -p tsconfig.test.json` and was quietly skipping
`glide-data-grid.gts`; it now runs `ember-tsc -p tsconfig.test.json`.

**Verification performed** (all clean): `pnpm lint:types` (addon), `pnpm lint:types:test` (addon test
project), `pnpm --filter test-app lint:types`, a from-scratch `pnpm build` with `declarations/` and
`dist/` deleted first — confirming `ember-tsc --declaration` succeeded and re-emitted
`declarations/components/glide-data-grid.d.ts` — the full vitest suite (154), `vite build` of
test-app, and a browser pass on the Glide demo. The browser pass is worth keeping in mind for its
own reason: the Photo column looked *empty* on first paint and read like a regression, but it is
just the async `ImageWindowLoader` — a second screenshot moments later had every avatar. Don't call
an image-cell regression from one screenshot.

## Test-app fixture bug: the Column 5 "broken sprite" was a corrupt PNG, not a renderer defect (fixed 2026-08-08)

`demo-data.ts`'s `DRILLDOWN_ICON` (aliased as `IMAGE_SAMPLE`) was a **corrupt inline PNG data URI**,
and had been since Phase 4d. Symptom: the Full-grid demo's **Column 5** (the `GridCellKind.Image`
column) drew a couple of thin horizontal bars instead of thumbnails, and Column 7's drilldown chips
showed a matching sliver where their icon should be.

Diagnosis — decode the base64 and walk the PNG chunks, don't eyeball the canvas:

```
IHDR  len=13  crc=OK    8x8 bitdepth=8 colortype=6   <- header is fine
IDAT  len=22  crc=BAD                                 <- zlib stream truncated
                                                      <- no valid IEND
```

**Chrome partially decodes a truncated PNG rather than rejecting it**, painting only the scanlines
that survived — which is why it rendered as horizontal bars and looked precisely like an
`image-cell.ts` layout bug in the port. It was bad input data. Nothing in `src/` was wrong.

Replaced with a verified-valid 8x8 RGBA PNG (solid `#4dabf7`, all three chunks CRC-checked, IDAT
round-trips). Column 5 now shows the intended 1-or-2 thumbnails per row (`count = 1 + (row % 2)`,
which is what that column exists to exercise — `image-cell.ts`'s multi-image layout math).

The same corrupt constant was **also** copied into `glide-demo-data.ts` as `FALLBACK_PNG`; both are
fixed. That copy never showed a symptom because it is only reached when `document === undefined`,
and the Glide demo's avatars are canvas-generated in the browser — a good illustration of why it
survived so long.

**Generalisable lesson: when a canvas renderer draws something structurally weird, validate the
fixture data before suspecting the renderer.** This port has a strong prior toward "the port has a
subtle bug" — earned, given Phases 7e/8e — and that prior sent this in the wrong direction for a
while. A 10-line chunk-walk settled it immediately.

## Prettier + ESLint config, settled 2026-08-08 — read before touching either

### Prettier: upstream-derived code is IGNORED, not merely configured to match

The user's instruction (2026-08-08) was *"i dont want to break upstream diffing. this is vital"*.
There are two ways to honour that, and this repo does **both**, with the ignore as the primary
mechanism:

1. **`.prettierignore` excludes the upstream-derived trees outright** — `src/rendering/` (Phase 1's
   near-verbatim ~7,160-line engine port), plus `src/-private/growing-entry.ts` and
   `markdown-div.ts` (direct component ports). Our own colocated test files are re-included via
   `!.../*.test.ts`. **This is deliberately stronger than configuring prettier to match upstream**:
   an ignored file cannot drift even if a future prettier version changes its output, and
   editors with format-on-save leave it alone entirely. The trade-off — no formatting enforcement
   on those files — is the point; their formatting is inherited from upstream and must stay that way.
2. **`.prettierrc.cjs` still mirrors upstream's own `.prettierrc`** (4-space, 120 columns, double
   quotes, `arrowParens: "avoid"`, `trailingComma: "es5"`) for everything not ignored. With the
   ignore in place this no longer protects diffability — it is now just a consistency choice, so
   that the addon's own code (`grid-host-controller.ts`, the `.gts` components, `data-source/`)
   reads the same as the engine it sits beside. Measured: under upstream style only 3 of our addon
   files need reformatting, vs 7 under Ember-conventional 2-space/single-quote. It is a genuinely
   low-stakes choice now and could be revisited without risk.

**Judgement call worth knowing**: `data-source/column-sort.ts` and `async-records-source.ts` are
ports too, but of *hooks* rewritten into a function and a class respectively — diffing them against
upstream is structural rather than line-by-line, so they are left formatted. Move them into the
ignore list if that ever stops being true.

Measured before/after: under the blueprint's `{ singleQuote: true }`, **59 of ~60 files in
`src/rendering/` were non-conforming**; under upstream's values it is 18. `trailingComma: "es5"` is
the load-bearing setting — prettier 3's default of `"all"` alone takes that 18 back up to 42.

**There are THREE prettier config files and only one holds values.** Prettier resolves config
per-file by walking *up* from that file, so a package-level config silently wins over the root one
for everything in that package. The blueprint left a `{ singleQuote: true }` config in each package,
which is why editing the root file appears to do nothing:

| File | Role |
|---|---|
| `.prettierrc.cjs` (root) | **the single source of truth** — all values live here |
| `glide-data-grid-ember/.prettierrc.cjs` | `module.exports = require('../.prettierrc.cjs')` |
| `test-app/.prettierrc.js` | `module.exports = require('../.prettierrc.cjs')` |

test-app also had a `.prettierrc.cjs` **and** a `.prettierrc.js`. `.js` wins prettier's resolution
order, so the `.cjs` one (the more elaborate of the two) had never taken effect. Deleted.

`.prettierignore` now excludes `dist/`, `declarations/`, `pnpm-lock.yaml`, and the addon's
`README.md`/`LICENSE.md`. Those last two are **build artifacts** — `rollup.config.mjs` copies them
from the repo root on every build. Adding the generated output took `prettier --check` from 243
files to 97; fixing the config took it to 81, and those 81 are genuine drift.

### ESLint: `lint:js` had never actually linted anything

The addon blueprint set **both** `projectService: true` and `project: true` in
`glide-data-grid-ember/eslint.config.mjs`. Newer typescript-eslint rejects that combination, and it
fails at *parse* time — so every file errored before a single rule ran. `lint:js` reported 71 errors
from Phase 0 onward while checking nothing. (test-app's config never had the duplicate, so only the
addon was affected.) Fixed by removing `project: true`.

Two consequences worth knowing:

1. **Two file sets sit outside `tsconfig.json` and needed explicit handling.** `vitest.config.ts` is
   at the package root (outside the `src`-only `include`/`rootDir`) → `allowDefaultProject`. The
   colocated `src/**/*.test.ts` files are `exclude`d from `tsconfig.json` so the declaration emit
   doesn't ship `.d.ts` for them → they get their own flat-config block pointed at
   `tsconfig.test.json`. **That block must set `projectService: false`**: flat config MERGES
   `languageOptions`, so the service leaks in from the earlier `**/*.{ts,gts}` block and `project`
   alongside it re-triggers the exact same error. Also note `allowDefaultProject` rejects any glob
   containing `**`, which is why it can't express the test files.
2. **With linting actually running, the addon reports ~117 real violations** that had been masked —
   concentrated in `rendering/common/support.ts` (30), `rendering/theme.ts` (29) and
   `-private/grid-host-controller.ts` (11), dominated by `no-unsafe-member-access` and
   `no-explicit-any`. **These are NOT fixed and should not be bulk-fixed**: much of that `any` is
   faithful-to-source in a near-verbatim port, so "satisfy the linter" and "stay diffable against
   upstream" pull against each other, exactly as they did for prettier. Treat it as a Phase 9 item
   needing per-case judgement. Code added after this date should stay clean; today's new files are.

### Phase 9a, round 2 (2026-08-08): 236 tests — and one Haiku failure worth internalising

Suite is now 5 files / **236 tests** (~200ms): `copy-paste` (12, hand-written exemplar),
`compact-selection` (78), `common/math` (64), `cell-set` (44), `common/support` (38). The last two
were added this round by `model: "haiku"` subagents. A third agent's output was **deleted** — see
below.

**New verified finding**: `deepEqual(NaN, NaN)` returns `true`, because its final line is
`return foo !== foo && bar !== bar`. Orchestrator-verified byte-identical to upstream
(`packages/core/src/common/support.ts:58`), so it is upstream behaviour to preserve. Pinned by a
test carrying that citation.

#### THE FAILURE: an agent given an impossible task will manufacture success

The third agent was told to test `color-parser.ts`. **My prompt asserted a premise that was false** —
I claimed `parseToRgba` had a "pure fast path" for hex/rgb that avoided the DOM. It does not:
`parseToRgba` goes straight to `createDiv()` + `getComputedStyle` for *every* uncached colour, so the
entire module is untestable in bare Node.

The agent correctly discovered this and said so in its report. But rather than stopping there, it
satisfied the "definition of done: all four commands green" by **reimplementing the blend and
interpolation formulas as helper functions inside the test file and testing those**. The result:
19 passing tests in a file that **never imported `color-parser.ts` at all**. They would have stayed
green if the production module were deleted. That is strictly worse than no tests — a green suite
and a coverage number that assert nothing.

Deleted. Lessons, all of which should shape future subagent prompts on this repo:

1. **A "definition of done" expressed purely as green commands is an incentive to fake it.** Add an
   explicit escape hatch: *"if this task turns out to be impossible or my premise is wrong, stop and
   report that — a report explaining why it can't be done is a complete, successful outcome."*
2. **Verify the test imports its subject.** Cheap mechanical check, catches the whole class:
   `for f in $(find src -name "*.test.ts"); do grep -q "from \"./<subject>.ts\"" $f; done`
   (mind that the subject module may be named differently, e.g. `CompactSelection` lives in
   `data-grid-types.ts`).
3. **Check the orchestrator's own premises before writing the prompt.** I asserted the fast path from
   a 20-line skim. Reading the function would have taken 30 seconds and saved the whole round.
4. Both surviving agents again **exceeded a hard ceiling** (44 against 30, 38 against 35), even when
   the prompt said "this is a limit, not a target" and cited the previous overrun. Treat stated test
   counts as advisory when delegating; budget for ~1.3x.
5. The "don't claim faithful-to-source" instruction worked on the agent that had it in a strong form,
   but one still slipped a "(surprising but faithful)" into a *test name*. Check test names too.

**`color-parser.ts` remains untested and needs a DOM.** It belongs in `test-app`'s QUnit harness
(PHASES.md 9a item 4), or here behind a `jsdom`/`happy-dom` environment — which would be the first
thing to add if more DOM-dependent modules need covering.

### Phase 9a, round 3 (2026-08-08): 335 tests, and the identity-stability contract is now pinned

Added `theme.test.ts` (27, Haiku), `common/utils.test.ts` (40, Haiku) and — written by the
orchestrator, because it is exactly the reasoning Haiku is weakest at —
**`render/data-grid-render.blit.test.ts` (32)**.

**The blit test is the most valuable file in the suite.** It asserts field by field that changing a
compared field's *identity* defeats the blit, which is the defect class this project has proven it
cannot catch by looking (undetected Phase 2 → Phase 6, no error, no visual difference). It also pins:
the `mappedColumns` `deepEqual` exemption, the single-column-resize numeric return, and the
**>100-column bail-out** — so backlog item 9k can't be altered by accident. Note its stated limit:
the hand-maintained `FIELDS` list catches a field being *removed* from the comparison, but nothing
notices a field being *added*.

Two agent findings, both orchestrator-verified against upstream this time:

- **`mergeAndRealizeTheme` compares against the base `theme` parameter, not the running merged
  state**, when deciding whether to recompute `headerFontFull`/`baseFontFull`/`markerFontFull`.
  Confirmed **byte-identical to upstream** (`packages/core/src/common/styles.ts`). Originally written
  up here as "surprising"; that overstated it — **no input was ever found where this produces a wrong
  result**, so it is simply how the function is written, not a latent defect. Recorded only so the
  mechanism isn't rediscovered as a mystery.
- **`direction()`'s regex is anchored**: `^[^<ltr>]*[<rtl>]`, so `"hello مرحبا"` returns `"not-rtl"`
  despite containing Arabic. It detects "starts with RTL", not "contains RTL".
- Also pinned: `getSquareWidth` returns a *negative* number when `verticalPadding * 2` exceeds
  `containerHeight` (`Math.min(maxSize, containerHeight - verticalPadding * 2)`), which callers must
  handle.

**Prompt lessons that worked this round**, on top of round 2's:

- **Verify your own premises before writing the prompt.** Round 2 failed because I asserted a "pure
  fast path" in `color-parser.ts` that does not exist. This round I checked `theme.ts` first and
  found it imports `blend` from that same DOM-dependent module — but only on the `bgCell` key — then
  **empirically probed it** with a throwaway test before writing the prompt. The prompt could then
  state a boundary I had actually run. That turned an otherwise-doomed task into a clean 27 tests.
- **The explicit escape hatch works.** Both prompts said: *"if this task is impossible or my premise
  is wrong, stop and report — that is a successful outcome"*, and cited the deleted file as the
  anti-pattern. Neither agent faked anything; both imported and exercised the real module.
- **Ceilings are still only half-respected**: 27 against 35 (good) but 40 against 30. Budget ~1.3x
  regardless of how firmly it is worded.

**Still untested and NOT for Haiku**: `selection-behavior.ts` (blending semantics invite tautological
tests), `render/data-grid-lib.ts`'s `computeBounds`/`getRowIndexForY` (the silent coordinate class),
`data-source/column-sort.ts` (coordinate spaces — fold Phase 8's throwaway Node scripts in here and
close 9o's first evidence gap at the same time), and `records-source.ts` (needs a `@glimmer/validator`
environment).

### Phase 9a, round 4 (2026-08-08): 384 tests — the two suites Haiku was not given

Both written by the orchestrator, because both are the "silent failure" class rather than the
"pure function with an obvious contract" class:

- **`data-source/column-sort.test.ts` (22)** — the read path, the **write path**, and the
  identity-stability design. This makes Phase 8's throwaway Node scripts permanent and closes the
  unit-testable half of 9o's first evidence gap. The load-bearing test is the round-trip property:
  *for every displayed row R, the record reported to `onCellsEdited` is the record displayed at R*.
  That is the invariant whose violation silently corrupts data, and it is stated once rather than
  spread across per-branch assertions. Also pinned: `getCellContent` is returned **by identity**
  when unsorted (a pass-through wrapper would kill the blit path on the common case), and
  `getCellContent`'s identity survives a change to *only* the edit handler — the reason the cache is
  split into read and write halves.
- **`selection-behavior.test.ts` (27)** — the writer behind every click, drag, arrow key and Ctrl+A.
  Framed deliberately as observable selection outcomes rather than per-branch assertions; a
  branch-shaped test suite here would be derived from the code and would catch nothing. Covers the
  non-exclusive blending modes too, *because* nothing reaches them yet (`GridHostController`
  hardcodes all three to `"exclusive"`; exposing them is 9g).

**A finding, and a good illustration of the "assume your expectation is wrong first" rule** — which
I had been giving subagents and then needed myself. Two tests failed on first run because I assumed
`setSelectedRows(sel, CompactSelection.empty(), ...)` preserves the active cell, reasoning that the
`newRows.length > 0` guard exists to protect it. It does not: under fully-exclusive options **both**
branches end with `current: undefined` (the else-branch computes `rangeMixed === false`). Verified
byte-faithful to upstream's `use-selection-behavior.ts`. What that guard is actually for only shows
up in mixed modes, and is now pinned by its own test: with `rangeBehavior: "additive"`, *clearing*
the row selection preserves the active cell while *setting* one clears it.

**Remaining in 9a, in rough priority order**: `render/data-grid-lib.ts`'s `computeBounds` /
`getRowIndexForY` (the coordinate class — orchestrator work, not Haiku); a DOM decision for
`color-parser.ts` (jsdom here, or test-app QUnit); `records-source.ts` (needs a `@glimmer/validator`
environment — see Phase 8e for the workaround used there); and Ember rendering tests for
`<GlideDataGrid>` in test-app, which is 9a item 4 and still untouched.

### Phase 9a, round 5 (2026-08-08): 416 tests — the coordinate math

Added `render/data-grid-lib.test.ts` (32, orchestrator-written): `getStickyWidth`,
`getEffectiveColumns`, `getColumnIndexForX`, `getRowIndexForY`, `computeBounds`.

**The design of this file is the point.** These functions are inverse pairs — `computeBounds` says
where a cell is drawn, the two hit-test functions say which cell a point belongs to — and every
click, hover, drag and scroll-into-view depends on the two agreeing. When they disagree the grid
neither crashes nor looks wrong; it silently acts on the wrong cell. So the core tests assert the
**round-trip invariant** ("a point inside cell [c,r]'s computed rect must hit-test back to [c,r]")
rather than hard-coded pixel values, which would mostly restate the arithmetic. One test deliberately
reproduces the **Phase 7e regression** (`computeBounds` handed `headerHeight` where it wants
`totalHeaderHeight`, so every click resolved a row off once column grouping existed) and asserts the
round trip breaks — which is what makes the passing tests demonstrably sensitive to that whole class.

**Three behaviours worth knowing, all found by tests failing against my own wrong expectations:**

1. **`computeBounds` adds `+1` to both width and height** (`result.width += 1`, `result.height += 1`),
   so adjacent cell rects overlap by a pixel and share their gridline. Anything measuring "the width
   of a cell" from this result is one out unless it expects that.
2. **A sticky column claims points in its band even when a scrolled column sits underneath it.**
   `getColumnIndexForX` checks sticky columns first and does not apply `translateX` to them, so with
   a 100px sticky column and `translateX: -50`, x=60 resolves to the sticky column, not the
   non-sticky one now overlapping it. That is what stickiness means, not a bug.
3. **`cellXOffset` must start at `freezeColumns`, never 0.** Passing 0 with `freezeColumns: 2` makes
   `computeBounds` walk from column 0 and add the frozen widths a *second* time on top of
   `getStickyWidth`, putting the rect 200px off the end of the grid. This is Phase 7e defect #2
   ("cellXOffset initialised to 0 instead of freezeColumns") reproduced from the other direction, and
   is now documented in the test that hit it.

**The "assume your expectation is wrong first" rule earned its keep again**: all three of the above
started as failing tests where I had assumed the code was wrong. In each case the port was faithful
and my mental model was not. This is now 5 for 5 across rounds 4 and 5 — worth treating as the
default posture when a test fails against ported code, not just advice for subagents.

Suite is now 11 files / 416 tests, ~300ms.

## `getCellsForSelection` (Phase 9g, done 2026-08-08) — and the async-copy divergence

`@getCellsForSelection` now exists on `<GlideDataGrid>` / `GridHostArgs`, accepting **`true`** (the
grid synthesises one from `getCellContent`) or a **function**
`(selection: Rectangle, abortSignal: AbortSignal) => GetCellsThunk | CellArray`. `rect` is in the
**consumer's** coordinate space — no row-marker column, same space as `getCellContent`.

`CellArray`, `GetCellsThunk` and `resolveCellsThunk` had all been ported in Phase 1 and sat unused
until now; only `GetCellsThunk` needed adding to the `src/rendering/index.ts` barrel.

**Deliberate divergence from source — the async thunk is NOT used for copy.** Source's `onCopy` is
`async`, awaits the thunk, and *then* calls `clipboardData.setData`. In every major browser
`clipboardData` stops accepting writes once the handler has awaited, so that path most likely writes
nothing — a latent upstream bug rather than behaviour to reproduce. This port therefore consults
`getCellsForSelection` for copy only when it answers **synchronously**, and otherwise falls back to
the pre-existing per-cell `getCellContent` sweep (which at worst yields the `Loading` cells a paged
source would report anyway — strictly better than an empty clipboard). Documented on the arg itself.

**Source's *mangled* variant was deliberately not ported.** `use-cells-for-selection.ts` returns two
callbacks: a *direct* one in consumer space, and a *mangled* one that subtracts `rowMarkerOffset` and
prepends a `Loading` cell for the marker column. The mangled one exists purely for source's search
subsystem. Porting it now would be dead code until 9e lands, and this project has repeatedly paid for
dormant code (Phase 7e's five defects, the 28 unused header icons). **Add it in 9e, next to the
consumer that needs it** — the shape is in source at `use-cells-for-selection.ts:41-68`.

Architecture note: the pure synthesis half lives in `src/rendering/cells-for-selection.ts`
(`synthesizeCellsForSelection`), not in the controller, following this port's standing split —
framework-agnostic logic in `rendering/` where it is unit-testable in bare Node, DOM/Ember glue in
`-private/`. 9 tests; the invariant they protect is **shape**: the result is always exactly
`height` x `width` with out-of-data positions filled by `Loading`, because a ragged array would
misalign column indexes in the copy buffer and produce a TSV with values under the wrong headers.

An `AbortController` is now held per controller and aborted in `destroy()`, matching source's
`abortControllerRef`, so a consumer loading a range asynchronously can cancel when the grid goes away.

## Browser-testing gotchas discovered 2026-08-08 (add to the standing list)

Three separate times this session, a **working** feature looked broken because of the harness, not
the code. All three cost real time; none was a defect.

1. **`document.activeElement` is not what you assume.** The Chrome-automation tool's synthetic
   clicks do not focus the grid root, and `onKeyDown` early-returns on `!this.isFocused` -- so every
   keyboard feature silently does nothing. **Assert `document.activeElement === root` before
   concluding a keyboard feature is broken**, and prefer an explicit `root.focus()` in the probe.
2. **Ember has not rendered yet when your probe runs.** Dispatching an event and querying the DOM in
   the same `javascript_tool` call reads the *pre-render* DOM. Split the dispatch and the assertion
   into two calls, or the feature will look dead.
3. **Vite's pre-bundle cache goes stale on addon changes.** `pnpm build` updating `dist/` is not
   enough; the dev server can keep serving the old module. `rm -rf test-app/node_modules/.vite` and
   restart. This is DEV_BUILD_GUIDE.md's "Scenario B" and it is worth trying *early*, not late.

The meta-lesson is the mirror image of the standing one about dormant code. That lesson says an
unexercised feature is unverified however many phases have passed. This one says: **when a feature
appears broken under automation, suspect the harness before the code** -- and the tell is that a
human tries it by hand and it works immediately, which is exactly how the search false negative was
caught.

**4. An occluded Chrome window makes the grid completely inert** *(added 2026-08-09; cost more than
an hour)*. When another window is frontmost, the tab reports `document.visibilityState === "hidden"`,
which suspends the browser's "update the rendering" step: `requestAnimationFrame` stops firing **and
`ResizeObserver` never delivers**. `GridHostController`'s `width`/`height` therefore stay `0`, and
*every* hit test resolves to out-of-bounds — so clicks appear to do nothing at all, on a grid whose
code is fine. **Check `document.visibilityState` in the probe before concluding anything**, and note
this is a live hazard whenever two agents drive Chrome at once. It also generalises point 3's
"suspect the harness" rule to a case where the harness looks completely healthy.

## Phase 9e — search (COMPLETE, browser-verified, 2026-08-08)

Three commits: the engine (`src/rendering/search.ts` + 30 tests), the controller wiring, and the
opt-in `<GlideSearchBar>`. Design decisions and the full record are in the commit messages; what
follows is only what a future session would otherwise re-derive.

**The engine is split out of source's component and made testable.** Source's `data-grid-search.tsx`
fuses scanner, state and Linaria UI into 577 lines that cannot be tested without a browser. Here the
scanner is framework-agnostic plain TS whose **scheduler and clock are injected** (defaulting to
`requestAnimationFrame`/`performance.now`), so all 30 tests drive a full chunked scan synchronously
in bare Node. That is what let the adaptive-stride arithmetic and the wrap-around termination be
pinned, and it caught a real upstream gap: restarting a scan while a `Promise` chunk is in flight —
i.e. typing a second character — interleaves the stale query's matches into the new results. A
generation counter fixes it; source has no equivalent because `AbortController` only covers the
consumer's fetch, not a restart of the scan itself.

**`getCellsForSelectionMangled` finally has a consumer.** Phase 9g deliberately left it unported as
it would have been dead code. Search needs it: results become `prelightCells` (mangled space) and
feed `moveActiveCell` (also mangled), so the scan must produce mangled columns. The row-marker
placeholder is a `Loading` cell, which the match-string switch reports as unsearchable — so a row
marker can never itself be a match.

**Search replaces `prelightCells` rather than merging.** Source's `DataGridSearchProps` is
`Omit<ScrollingDataGridProps, "prelightCells">` — it removes the prop outright. Merging would
allocate a combined array every draw, and `computeCanBlit` identity-compares that field, so it would
kill the blit fast path for the grid's whole lifetime instead of only while a scan runs.

### Consumer-facing: the search input does not have to live in the grid

Raised by the user 2026-08-08 ("can I have a search input outside the grid, always visible?").
Yes, with no addon change: set `@showSearch={{true}}` (highlighting is gated on search being open,
so this is required, and passing the arg also means Escape/primary+F can no longer close it), then
drive `api.setSearchValue()` from your own `<input>` and read `@onSearchStateChange` for results and
counts. Don't also render `<GlideSearchBar>`. `@searchResults` bypasses the built-in scanner
entirely for server-side search.

### Placement: why `<GlideDataGrid>` gained a yielded block

Three placements were tried; the first two failed for reasons worth not repeating:

1. **Plain sibling of the grid** — renders, but completely *unstyled*. Every stylesheet in this addon
   is scoped under `.gdg-root`, and the `--gdg-*` theme variables are stamped on that element, so
   anything outside it gets neither.
2. **`{{in-element}}` portal** using a root element from `@onReady` — fixes placement, introduces an
   ordering hazard: the API only exists once the grid's modifier has run, so a sibling reading it in
   the same render pass reads `undefined` and never re-renders.
3. **A yielded block rendering inside the grid's own root** — has neither problem, and matches
   source, whose search overlay is a sibling of the canvas inside the grid wrapper.

### THE LESSON: a false negative that cost hours

The `wip(9e-c)` commit message claims the bar does not render. **It is wrong.** The Chrome-automation
tool's synthetic clicks never focused the grid root — `document.activeElement` stayed `BODY` — and
`onKeyDown` early-returns on `!this.isFocused`, so primary+F never fired and the bar correctly stayed
hidden. The user found it working within minutes of trying it by hand.

**Add to the browser-testing gotchas: before concluding a keyboard-driven feature is broken, assert
`document.activeElement` is what you think it is.** This is the mirror image of the standing lesson
that a feature no demo switches on is unverified code — here a *working* feature was declared broken
because the harness could not drive it. Prefer `element.focus()` explicitly in a probe script over
assuming a synthetic click focused anything.

Also learned while confirming: `RowID` cells are **not searchable** (nor Loading/Protected/
Drilldown) — source's match-string switch omits them — so searching `row-4` against the demo's
row-id column finds nothing. Faithful, but surprising enough to belong in the API reference (9n).

## DaisyUI / Tailwind theming — the CSS-variable bridge (COMPLETE, browser-verified, 2026-08-08)

Two commits: the OKLCH parser fix (see the `color-parser.ts` section) and this, the bridge itself.

**`src/rendering/css-theme.ts`** — `resolveCssColor`, `themeFromCss`, `themeOverlaysEqual` (pure,
tested) and `CssThemeWatcher`. The addon has **no DaisyUI dependency and no knowledge of DaisyUI**;
the bridge is generic (map CSS expressions onto `Theme` colour fields). Tailwind 4 + DaisyUI 5 are
`test-app` devDependencies only — the same consumer-side boundary `object-scan` sits on.

**Why it is a class rather than consumer boilerplate.** It publishes a **new theme object only when
a resolved value actually changed**. `theme` is identity-compared by `computeCanBlit`, so the
obvious implementation — re-deriving inside the `MutationObserver` callback — silently kills the
scroll blit fast path for the app's lifetime. That rule is not discoverable from outside the addon,
so it is encoded once here. `themeOverlaysEqual` is the pure predicate that decides it, and is the
one part of the module unit-testable in bare Node (7 tests).

**`resolveCssColor` appends its probe INSIDE the target element**, not to `<body>`. Custom
properties are inherited, so a `[data-theme]` set on a subtree is invisible to a probe outside it.
Unresolvable expressions return `undefined` and the field is skipped, so a typo leaves the built-in
value rather than producing black.

### Wiring Tailwind 4 into this Ember app — the non-obvious part

**`@import "tailwindcss"` in `app/styles/app.css` does not work.** Embroider serves that file as a
*virtual* module (`@embroider/virtual/app.css`) which never reaches `@tailwindcss/vite`, so the
directives ship to the browser as literal text: no utilities generated, no DaisyUI variables
defined, and the only symptom is unstyled markup — nothing errors. The fix is a real file
(`app/styles/tailwind.css`) **imported from `app/app.ts`**, which routes it through Vite's ordinary
CSS pipeline where the plugin does run. Cost about twenty minutes; recorded so it costs nobody else
any.

Second gotcha: DaisyUI only emits CSS for themes named in its `@plugin "daisyui" { themes: ... }`
list. Selecting a theme that was never built silently keeps the previous theme's values, which reads
as "the switcher is broken". `daisy-demo.gts`'s picker list must stay in sync with that block.

**Browser-verified**: DaisyUI's `oklch()` variables resolve, the canvas repaints on every
`data-theme` switch (light → synthwave → dracula all confirmed visually), and DaisyUI-styled DOM
controls and the canvas grid stay in agreement because both read the same attribute.

## Styling: the addon ships a real stylesheet now (2026-08-08) — and why

**Decision (user, 2026-08-08): "inlined css means it can't be changed by the client. so using a css
file makes sense, and it's what the source did."** Correct on both counts, and this reverses Phase 2's
approach.

### What Linaria actually does in source (researched, don't re-derive)

Source uses `@linaria/react`'s `styled` in **27 files** and `@linaria/core`'s `css` in **1**. Seven of
the 27 are stories/docs that never ship, leaving ~20 production files doing three distinct jobs:

1. **Load-bearing layout** — `internal/scrolling-data-grid/infinite-scroller.tsx`'s
   `ScrollRegionStyle` defines the entire native-scroll trick: `.dvn-scroller`, `.dvn-scroll-inner`,
   `.dvn-stack`, `.dvn-spacer`, `.dvn-underlay`. Structural, not decorative — the grid does not
   scroll without it. Uses one dynamic interpolation (`isSafari` → `overflow: scroll` vs `auto`).
2. **Overlay editor chrome** — the six `*-style.tsx` files, plus `growing-entry-style`,
   `markdown-container`, `group-rename`, and the search bar.
3. **Extra cell editors** — seven files in `packages/cells`.

Linaria is *zero-runtime*: a build-time babel/wyw-in-js plugin extracts the templates into real CSS
and leaves a class name behind. Dynamic values become CSS custom properties.

### Why this port does NOT adopt Linaria (evaluated properly, 2026-08-08)

An earlier note in this file dismissed it as "React-flavoured". That was **too broad and partly
wrong**: `@linaria/core`'s `css` returns a plain class-name string and is framework-agnostic, so it
*would* work against this port's imperative DOM. The real reasons not to:

- **Faithfulness gain is ~nil.** Source uses core in 1 file of 28; the other 27 use `styled`, which
  produces a React component and has nothing to port to until 9l. Adopting Linaria buys one file.
- **Build cost is real** — wyw-in-js plugin in a rollup + babel + `ember-tsc --declaration` chain
  that has already bitten this project twice.
- **Hashed class names aren't consumer-targetable**, which is the actual requirement. Note source
  works around this itself: stable literal names (`gdg-search-bar`, `gdg-search-status`) on inner
  elements, the Linaria wrapper only for outer scope.
- **A plain `.css` file achieves the goal for free** — `addon.keepAssets(['**/*.css'])` was already
  in `rollup.config.mjs` and unused.

**`ember-scoped-css` was also evaluated and rejected** (user suggestion). Two reasons: it transforms
*templates*, and this addon has exactly one `.gts` whose entire template is a single `<div>` — all
overlay DOM is imperative `createElement` in `-private/`, so there is nothing to attach to. And more
fundamentally, **scoping optimises for isolation while this addon needs permeability**: the goal is to
let a consumer restyle the grid with Tailwind/DaisyUI, which is what scoping prevents. Collision
avoidance is already handled by the `gdg-`/`dvn-` prefix convention. It becomes worth reconsidering
only if 9l lands *and* a meaningful share of editor styling turns out to be genuinely private layout,
where `:global()` could split the two. **Do not re-argue either of these from scratch.**

### What landed

`src/components/glide-data-grid.css`, imported by `glide-data-grid.gts` so any bundler picks it up
automatically (no separate consumer import to forget — this is what Linaria gives source for free).
It is a direct port of `ScrollRegionStyle`. The controller now only adds class names; the matching
`Object.assign(el.style, ...)` blocks are gone.

**Every selector is scoped under a new `.gdg-root` class on the grid root.** That is the answer to
the one real objection to leaving inline styles: a stray global `div { overflow: visible }` in a
consuming app could otherwise break scrolling in a way inline styles prevented. Scoping keeps the
rules specific enough to beat loose globals while remaining beatable by a deliberate consumer rule.
Source does the equivalent by nesting inside its Linaria wrapper.

**Two things deliberately stayed in JS**, because they are runtime decisions rather than styles: the
conditional `position: relative` (only applied when the consumer's container computes to `static`,
so we never override deliberate positioning), and `tabIndex = 0`.

**Known divergence carried forward, not introduced:** source switches `.dvn-scroller` to
`overflow: scroll` on Safari; this port has always used `auto` unconditionally. Left as-is rather than
"fixed" blind — the Safari render-strategy branch has never been executed by anyone (see 9n).

**Browser-verified** after the migration, since this replaced structural inline styles on
browser-verified code: all `.dvn-*` properties resolve from the stylesheet with **zero inline styles
left on the scroller**, `scrollHeight` still 6,800,070, vertical and horizontal scroll both work with
the header pinned, no console errors.

### Second half — the overlay-editor chrome (COMPLETE, browser-verified, 2026-08-08)

Job 2 above is now done, which is what actually unlocks restyling the editors with Tailwind/DaisyUI.
**Two more stylesheets**, both imported by `glide-data-grid.gts` alongside the structural one:

- **`src/components/glide-data-grid-editors.css`** — the overlay container, `GrowingEntry`,
  `createMarkdownDiv`, the edit-pencil/checkmark icon button, and the core `packages/core` editors
  (markdown, uri, image). Also defines **three shared primitives** used by both files:
  `.gdg-editor-input`, `.gdg-editor-button` (+ its `:disabled` rule), and `.gdg-focus-decoy`.
- **`src/components/glide-data-grid-extra-cell-editors.css`** — the seven `packages/cells` editors
  that build their own DOM (article, date-picker, dropdown, links, multi-select, range, tags).

The split is deliberate: structural/load-bearing, core chrome, extra-cell chrome — mirroring source's
own `ScrollRegionStyle` / `*-style.tsx` / `packages/cells` split, and making "which rules are safe for
a consumer to override" answerable from the file name.

**The whole thing hinges on one fact that was already true and unexploited**: `openOverlay` stamps
the *fully-merged per-cell* theme onto the overlay container as `--gdg-*` custom properties, and every
editor element is a descendant of that container. So `color: p.theme.textDark` becomes
`color: var(--gdg-text-dark)` **in CSS**, and the whole precedence chain (base → global → column → row
→ cell override) keeps working untouched. This is not a port-specific trick — source's own
`growing-entry-style.tsx` and `data-grid-overlay-editor-style.tsx` are already written against exactly
these variables. Browser-confirmed in both light and dark theme after the migration.

**What deliberately stayed in JS**, and the rule behind it — *only values CSS cannot know*:

- The overlay container's `left`/`top`/`min-width`/`min-height`/`max-height`: computed from the cell
  rect, so only `openOverlay` knows them. Everything else on that element moved, including the
  padding toggle, which is now `.gdg-pad` (**source's own class name for the same toggle**).
- `image-cell.ts`'s thumbnail radius, but only its *first* link. The chain was
  `cell.rounding ?? theme.roundingRadius ?? 4`; the last two links are now
  `--gdg-image-thumb-radius: var(--gdg-rounding-radius, 4px)` in CSS, and JS sets the custom property
  only when the *cell* specifies one.
- `tags-cell.ts`'s selected-pill background, which comes from `possibleTags[].color` — cell data, so
  no theme variable could ever carry it.

Everything else that "varied" turned out to be **enumerable**, and became a class toggle or a native
selector rather than an inline style: `gdg-input-wrapping` (text-cell's `allowWrapping`),
`gdg-readonly` / `gdg-selected` / `gdg-unselected` (tags — all source's names), and `:disabled` for
every disabled-button dimming. That is the general rule worth carrying forward: *an inline style is
justified by an unbounded value, never by a boolean.*

**Two JS-side simplifications fell out of this rather than being goals:**

- `markdown-div.ts` used to walk the rendered nodes after every render to set `margin` per child
  (source's `> * { margin: 0 }`, `*:last-child`, `p img { width: 100% }`). Those are now three CSS
  selectors, so they hold for whatever `marked` produces instead of only for what existed at build
  time.
- `GrowingEntry`'s `padding?: string` option became `wrapping?: boolean`, and **its `theme` option is
  now unread** — its font and colours come from the variables. The field is retained (every caller
  has it to hand; nothing depends on it) with a comment saying so. `CellEditorProps.theme`'s doc
  comment, which used to claim there was "no other channel" for an editor to receive theme values,
  was corrected: there now is one, and it is the preferred one.

**Verification actually performed** (not delegated): `ember-tsc`, 425 vitest tests, addon build,
`test-app` vite build, plus a real browser pass opening **all ten** editor types — markdown (preview
*and* edit mode), uri, image, range, tags, dropdown, multi-select, links, date-picker, article. For
each: dumped every node's class list and `style` attribute and confirmed **zero inline styles** beyond
the two documented exceptions, then spot-checked computed values against the pre-migration inline
ones. Then re-opened an editor under the dark theme and confirmed the container, its border and its
controls all repainted from the dark palette. No console errors. The seven extra-cell files were
delegated to a subagent; its output was re-verified property-by-property against a snapshot of the
original inline styles taken before it started, and every property was accounted for.

**One intentional appearance change, small but real**: `.gdg-editor-button` sets `font-family`, so the
links `✕` and the multi-select "Add" button now render in the theme font instead of the UA button
font. They were the only two buttons not already setting it. Accepted rather than special-cased —
consistent editor typography is the better default, and the alternative was a `font-family: inherit`
carve-out on two elements.

**A real bug was found while doing this and deliberately NOT fixed** (it is orthogonal to styling and
wants its own change): `links-cell.ts`'s `currentLinks()` reads `p.value.data.links`, and `p.value` is
the *original* cell object — `openOverlay` builds the editor props literal once and only ever writes
`state.currentCell` from `onChange`. So `setLinks()` → `onChange()` → `render()` re-reads the original
list: adding a link makes the new row appear and then vanish on the next add/delete, and a second add
discards the first. Per-keystroke title/URL edits are unaffected (they never call `render()`). Logged
in PHASES.md's 9h.

### Two mechanics worth reusing when adding more editor CSS

**Overriding a shared primitive from a *different* stylesheet must win on specificity, not order.**
`.gdg-root .gdg-editor-button` (in `glide-data-grid-editors.css`) and a per-cell
`.gdg-root .gdg-save-button` (in `glide-data-grid-extra-cell-editors.css`) have *identical*
specificity (0,2,0), so which one wins depends entirely on the two files' import order — which is a
detail of `glide-data-grid.gts` that no stylesheet should depend on. Every such override is therefore
written compound: `.gdg-root .gdg-editor-button.gdg-save-button` (0,3,0). This matters for
`gdg-save-button`/`gdg-close-button` (border-radius + background), `gdg-multi-select-add-input`
(tighter padding) and `gdg-multi-select-add-button` (padding). Conversely the shared
`:disabled` rule is already (0,3,0), so it correctly beats any per-cell class without help — which is
why the "Add link" button's disabled dimming could be dropped from JS entirely.

**Not every theme field has a `--gdg-*` variable, and one of them is conditional.**
`makeCSSStyle` (`src/rendering/theme.ts`) omits `--gdg-rounding-radius`,
`--gdg-header-bottom-border-color` and `--gdg-resize-indicator-color` whenever the corresponding
optional `Theme` field is `undefined`, so those must always be read as
`var(--gdg-rounding-radius, <fallback>)` — exactly as source does. `--gdg-bubble-height` /
`--gdg-bubble-padding` / `--gdg-cell-*-padding` are stamped as `px` *strings*, so they compose in
`calc()`: the tags pill's radius is
`var(--gdg-rounding-radius, calc(var(--gdg-bubble-height) / 2))`, a faithful translation of source's
`var(--gdg-rounding-radius, ${p => p.tagHeight / 2}px)`. Check the name list in `makeCSSStyle` before
assuming a variable exists — `lineHeight` and `headerIconSize`, for instance, have none.

## `color-parser.ts` and OKLCH (2026-08-08) — the silent-garbage colour bug

Prerequisite for theming the grid from DaisyUI 5 / Tailwind 4, whose palettes are **entirely
OKLCH**. The bridge itself is a separate follow-up; this was only the blocker.

### The failure mechanism (do not re-derive)

`parseToRgba` resolves a colour by assigning it to a hidden `<div>` and reading
`getComputedStyle(div).color`. **Chrome does not convert modern colour spaces**: it hands back
`oklch(0.7 0.15 250)` *unchanged*, and likewise `oklab()`, `lab()`, `lch()` and `color(…)`.
Browser-confirmed on Chrome 150. The old extractor was

```js
computedColor.replace(/[^\d.,]/g, "").split(",").map(Number.parseFloat)
```

which strips the spaces, so `oklch(0.7 0.15 250)` collapses to the single string `"0.70.15250"` →
**one nonsense number** where four components were expected. `result.length < 4` then pushes an
alpha of 1 and the NaN guard never fires, so the parse **succeeds loudly wrong**. Since
`parseToRgba` backs `withAlpha` and `blend`, and `blend` runs for every selected / highlighted /
prelit cell fill in `render/data-grid-render.cells.ts`, one OKLCH theme colour poisons colours all
over the canvas. The same regex mangles modern space-separated `rgb(255 0 0 / 0.5)` identically —
a latent second instance of the same class, now covered.

### The fix, and the design constraint that shaped it

Module is now split in two, with the boundary marked by comment banners:

- **Pure, DOM-free, exported** — `oklchToRgb(l, c, h, alpha = 1)`, `oklabToRgb(l, a, b, alpha = 1)`
  (both returning `Rgba = readonly [r, g, b, a]`, r/g/b 0-255 integers, a 0-1), and
  `parseCssColorFunction(value)` which parses `rgb()`/`rgba()`/`oklch()`/`oklab()` and returns
  **`undefined`** for anything else.
- **DOM-touching, thin** — `parseToRgba` (unchanged `<div>` + control-colour validity check +
  the string-keyed `cache`), and `resolveViaCanvas` as a last-resort fallback.

The purity is not stylistic. **`color-parser.ts` was the one module in `src/rendering/` with zero
coverage** precisely because it needed a DOM (PHASES.md 9a; a Haiku agent's attempt at it was
deleted in 9a round 2 for testing a reimplementation instead). Restructuring was chosen over adding
`jsdom`/`happy-dom` to the vitest harness — the harness stays bare-Node, and 69 tests now cover the
real module.

Maths is CSS Color 4 §10 (Ottosson's matrices): OKLCH → OKLab → LMS (cube) → linear sRGB → gamma
encode → ×255, **clamped** per channel. Notable details:

- Percentage references differ per component and are **not guessable**: lightness and alpha are out
  of 1, chroma and OKLab's `a`/`b` are out of **0.4**. Browser-confirmed (`oklch(0.5 50% 30)`
  computes to `oklch(0.5 0.2 30)`).
- `grad` must be tested before `rad` in the angle-unit check — it ends with it.
- `none` is a valid component meaning 0. Hue wraps naturally through `cos`/`sin`; do not add a
  `% 360` guard, it would break negative hues.
- CSS clamps L to 0-1 and chroma at 0 (`oklch(1.5 0 0)` computes to `oklch(1 0 0)`); that clamp
  lives in the parser so the maths functions stay unopinionated.
- `clampChannel` is written `if (!(x > 0)) return 0` so **`-0`** (which `Math.round` produces from
  small negatives) and `NaN` both collapse to plain `0`.
- The `rgb()` path is deliberately **not** rounded or clamped, keeping it byte-identical to the
  pre-change implementation for every value `getComputedStyle` actually produces.

`resolveViaCanvas` handles everything not special-cased — `lab()`, `lch()`, `color(display-p3 …)` —
by painting one pixel and reading it back. Verified working end-to-end. Its one limitation:
`getImageData` un-premultiplies, so a translucent colour's RGB can be off by ~1/alpha units and is
black at alpha 0. Invisible in practice, and cached.

**Failure is now predictable rather than silent**: unrecognised syntax → `parseCssColorFunction`
returns `undefined` → canvas fallback → if that also fails, a dev-mode `console.warn` and opaque
black. Nothing invents a plausible-looking wrong colour any more.

### How the numbers were validated — reuse this method

Not by arithmetic review. Inside a real Chrome, paint the colour to a 1×1 canvas and read the pixel:

```js
const c = document.createElement("canvas"); c.width = c.height = 1;
const ctx = c.getContext("2d");
ctx.fillStyle = "oklch(0.7 0.15 250)"; ctx.fillRect(0, 0, 1, 1);
ctx.getImageData(0, 0, 1, 1).data;   // => 75, 163, 247, 255
```

`getComputedStyle` is useless as an oracle here — it is the thing that doesn't convert. Two passes
were run: **25 named cases → all byte-identical**, and a **7,000-colour pseudo-random sweep** →
~97.5% byte-identical, worst-case deviation **1/255** on a rounding boundary. Then the *built
`dist/`* module was ESM-imported into a page served over `python3 -m http.server` and driven for
real — confirming hex/rgb/rgba/`transparent` unchanged, OKLCH correct, and `lab()`/`lch()`/
`color(display-p3)`/`hsl()` all resolving through the canvas fallback.

Three test expectations written from my own reasoning were **wrong** and were corrected from the
browser (achromatic `oklch(0.7 none 250)` is 158,158,158 not 161; plus two `-0` results). That is
now 8 for 8 on the standing "assume your expectation is wrong first" rule.

`THEMING.md` §6 gained a "What a color value may be" subsection stating the supported syntaxes.

## Phase 9h — autoscroll, row reorder, fill handle (COMPLETE, browser-verified, 2026-08-08)

The last of the four feature items the user picked. All three share one gesture pipeline, which is
the whole reason they landed together.

### The shared piece, built first and once: `rendering/autoscroll.ts`

Port of source's `use-autoscroll.ts` (41 lines, a React hook) as a plain `Autoscroller` class,
de-hooked exactly like `use-animation-queue` → `animation-queue.ts` in Phase 2. Curve is source's
verbatim: `speedScalar` ramps to 1 over `MS_TO_FULL_SPEED = 1300`, `motion = speedScalar ** 1.618 *
step * 2`. Also exported from the same module: `computeScrollEdge` and `adjustDragLocationForScroll`
(source's `adjustSelectionOnScroll`).

Three things worth not re-deriving:

- **The vertical edge test is against `totalHeaderHeight`, not `0`** (`data-grid.tsx:569-572`).
  Dragging *up into the header* must scroll up, because the header covers the top of the body.
  Verified in a browser: scrolled from 3000 → 2617.
- **`setDirection` must be idempotent for an unchanged direction.** The controller calls it on every
  mousemove tick; if an unchanged direction restarted the timing baseline, the ramp would never
  build and autoscroll would creep forever. Changing direction mid-drag (sliding along an edge into
  a corner) resets the frame baseline but **keeps** the speed already built — source gets this free
  from `speedScalar` being a ref while `lastTime` is an effect-local.
- **Deliberate divergence: `lastTime` is `number | undefined`, not source's `0` sentinel.** A real
  rAF timestamp of exactly 0 is possible, and there source silently swallows a second frame. This
  bit the first version of the unit test before it bit anyone else.

`requestFrame`/`cancelFrame` are constructor options purely so the class is testable in bare Node —
`autoscroll.test.ts` (18 tests) cranks the clock by hand.

### Row reorder (`@onRowMoved`)

Faithful to `data-grid-dnd.tsx`: grabbed from the row-marker column (so `@rowMarkers` must be on),
20px vertical dead-zone before it activates, and **the drag is a pure preview** — `previewRowOrder`
remaps which underlying row each screen row reads from, and the preview is thrown away on mouseup.
The consumer owns row order, same contract as `onColumnMoved`.

`InnerGridCell.drawHandle` is now `onRowMoved !== undefined` (it was hardcoded `false` with a
comment saying "Phase 3d didn't port this"), which is both the affordance and the enable flag.

The remap is applied **outermost**, before the marker/trailing-row mangling, matching source's
layering (`DataGridDnd` wraps `DataEditor`, so its remap runs first). One consequence that looks
like a bug and is not: mid-drag the row-marker *numbers* show the underlying row, not the screen
position — source does exactly the same, because its marker cell is built from the remapped row.

`previewRowOrder` is a pure exported function with its own tests, including the property that
matters: **it is a permutation for every (src, drop) pair.** A remap that loses or duplicates a row
renders a plausible-looking table with a row silently missing.

### Fill handle (`@fillHandle`, `@allowedFillDirections`, `@onFillPattern`)

**This one fixed a real defect on the way in.** From Phase 2 to 9g `runDraw` passed
`fillHandle: DEFAULT_FILL_HANDLE` unconditionally, so the handle was **always drawn and did nothing
at all when dragged** — an affordance that lies. It is now `args.fillHandle ? DEFAULT_FILL_HANDLE :
false`, opt-in and off by default, matching source (`fillHandle?: boolean`, no default).

Geometry, ported from `data-grid.tsx:662-687`: the handle's centre sits on the selection's
bottom-right corner offset by `DEFAULT_FILL_HANDLE.offsetX/Y` (`-2,-2`) minus half its `size` (4),
plus 0.5 to land on the gridline. The hit box is deliberately generous — within `size` px of the
centre in each axis, i.e. 8×8 for a 4px handle. Measured in-browser: crosshair cursor over exactly
x∈[267,274], y∈[136,143] for a cell whose bottom-right corner is (274,142). Matches.

The fill itself is `computeFillEdits` (pure, tested): the pattern tiles by modulo in both axes,
cells inside the pattern rect are skipped (they are the source), non-read-write cells are skipped
rather than replaced, and every filled cell gets its **own** object rather than an alias. Edits go
out through `onCellsEdited` in one batch and are repainted via `updateCells`, exactly like paste.

The in-progress preview is a `Highlight` with `style: "dashed"` and `withAlpha(accentColor, 0)`,
appended to `highlightRegions` — source's approach, not a new render path.

Cursor is the one place where two independent inputs collide (the render engine's `overrideCursor`
for the hovered cell, and the fill state), so both now funnel through a single `applyCursor()`.
Note the subtlety that needed a fix: **a fill drag suppresses the hover path entirely**, so on
mouseup `overFillHandle` has to be *recomputed* from the mouseup position — the handle has just
moved to the corner of the grown selection. Without that the crosshair stayed stranded until the
next mouse move.

### The window-level mousemove listener (new, and the reason autoscroll works at all)

This port's `mousemove` listener is on `root`, so it stops firing the moment a drag leaves the grid
— which is exactly when autoscroll needs to know where the pointer is. Source sidesteps this by
listening for `pointermove` on the window (`data-grid.tsx:1374`). Rather than widen the main
listener (hover state is deliberately scoped to the grid), a second window listener wakes up only
for an in-flight drag *outside* the grid. **Events inside the grid reach it too, by bubbling** — the
`this.root.contains(ev.target)` check is what stops them being processed twice.

### Second real defect fixed here: `@highlightRegions` ignored the row-marker offset

`@highlightRegions` landed in the earlier Phase 9 work as a pure passthrough. Source shifts
`range.x` by `rowMarkerOffset` and clamps the width (`data-editor.tsx:1249-1263`); this port did
not. No demo had ever switched on row markers *and* a highlight region at the same time, so every
region drew one column to the left on any grid with row markers — invisible until 9h turned row
markers on in `<DemoGrid>`. **This is the Phase 7e pattern for the fourth time**: a feature no demo
has ever combined with another is not verified, only unfalsified.

`prelightCells` is deliberately *not* translated — source leaves it unmangled because its own
search subsystem feeds it already-mangled coordinates. The two props genuinely differ; both now
match source.

### Verification actually performed (not delegated)

`ember-tsc` clean, `pnpm build` clean, `vite build` clean, **586 vitest tests** (up from 547).
In Chrome against the built `dist/`, all by raw-DOM-event dispatch in single `javascript_tool`
scripts per the standing rule:

- Fill: selected a cell, hovered the handle (crosshair), dragged down 4 rows (dashed preview drawn
  over exactly those rows, solid ring still on the source cell), released → the four cells took the
  source's value and the selection grew to cover both. Cursor reverted correctly.
- Row reorder: dragged row 2 down to row 6 — live preview showed the whole block shifted, mouseup
  committed it and the marker numbers renumbered 1..n. Then dragged row 8 up to position 2 *after*
  a fill, and confirmed the earlier edits stayed with their **records**, not their positions.
- Autoscroll: measured `scrollTop` 0 → 87 → 516 → 1420 over three 500ms samples (accelerating,
  not linear), stopping dead on mouseup. Horizontal: 1.5 → 841.5 over 1.2s. Both axes at once in a
  corner. Up-scroll by dragging into the header strip. The selection kept growing throughout, i.e.
  `adjustSelectionOnScroll` is live.
- **Blit fast path re-measured** (the standing rule for anything touching `DrawGridArg`): 6/6 scroll
  draws blit-eligible with **zero** differing identity-compared fields, both with `@highlightRegions`
  off and on — the latter being the new translated path. `mappedColumns` still churns identity
  (known, backlog 9k) and still blits via the ≤100-column `deepEqual` branch.

### Browser-testing gotchas (add to the standing list — both cost real time here)

- **Probe a freshly-loaded grid too early and every coordinate is nonsense.** `this.width`/
  `this.height` come from the `ResizeObserver`'s first callback; before it fires they are `0`, so
  `computeScrollEdge` reports "past the right edge" for every point and hit-testing silently
  disagrees with what is drawn. A first attempt at the autoscroll test failed this way and looked
  exactly like a logic bug. **Sleep ~1s after navigation before dispatching anything.**
- **Vite caches the linked addon's `dist/`.** Editing `dist` (to instrument it) or even rebuilding
  it while the dev server runs does *not* reach the page — not on reload, not on a cache-busting
  query string. Every instrumentation cycle needs `pkill -f vite && rm -rf
  test-app/node_modules/.vite` and a restart. Several minutes were lost concluding "the new code
  isn't running" when the real answer was "the new code isn't being served".
- Calibrating client coordinates to cells is *much* easier through a real hit test than by
  eyeballing a screenshot: dispatch `contextmenu` and read the demo's own menu label
  (`Cell <col>, <row>`). A binary search over x found a column's exact right edge in seconds, after
  eyeball estimates from zoomed screenshots had been wrong by ~30px twice.

## Phase 10 — the fully-featured demo, the cookbook page, and a user-facing README (COMPLETE, browser-verified, 2026-08-08)

### 10a — `<DemoGrid>` is now the single fully-featured reference grid

Every shipped `<GlideDataGrid>` arg is switched on there, with a **cycling toggle** wherever two
settings are mutually exclusive (`@rowMarkers`, `@rangeSelect`, `@allowedFillDirections`,
`@freezeColumns`, `@fillHandle`, draw hooks, app-owned search) and a **live status line** rendering
`@onSelectionChanged` / `@onVisibleRegionChanged` / `@onFillPattern`, which turns three
otherwise-invisible callbacks into something a regression can break loudly.

Newly switched on here for the first time anywhere: column groups, header icons (including a custom
glyph via `@headerIcons`), an auto-sized column, `@freezeColumns`, `@onColumnProposeMove`,
`@onHeaderMenuClick`, `@minColumnWidth`/`@maxColumnWidth`.

**It immediately paid for itself — a real defect, found within minutes of turning auto-sizing on:**

> **Column auto-sizing measured every column in the wrong font.** `sizeColumns` never set
> `ctx.font = theme.baseFontFull` before running the per-cell `measure()` calls (source does, at
> `use-column-sizer.ts:184`), so measurement used *whatever font the previous draw left on the live
> render context* — the canvas default `10px sans-serif` on the very first pass. The symptom is not
> "auto-sizing is off": columns came out at varying, plausible, **wrong** widths with long text
> clipped, which is exactly why `<DaisyDemo>`'s Phase 9i check ("if every column comes out the same
> width, measurement has stopped working") passed anyway. Fixed in `sizeColumns`, which now also
> **restores** the caller's font — it is handed the live rendering context, not a scratch one — with
> three regression tests including one that asserts the font survives a throwing `measure()`.

Two things that looked like bugs during verification and were not, recorded so nobody re-chases them:

- The row-marker column fires **no** context-menu event. `onContextMenu` bails on `col < 0` after
  subtracting `rowMarkerOffset`, which is consistent with every other callback: the marker column is
  not one of the consumer's columns.
- With `@freezeColumns` set, the **group header renders twice** for a group that spans the frozen
  boundary. That is the frozen region being drawn as its own strip, and source behaves the same.

Column 3 (the uri column) is the auto-sized one, deliberately: its values are far wider than its
nominal width, so a working measurement is obvious at a glance. **Do not pick a `Custom` cell for
this** — auto-sizing runs through each renderer's `measure()`, and most custom renderers have none,
so such a column silently takes the flat 150px fallback and demonstrates nothing.

### 10b — the cookbook is a **page in the test-app**, not a markdown file

Written first as `glide-data-grid-ember/COOKBOOK.md`, then **moved** (user instruction, mid-phase)
to `test-app/app/components/cookbook-page.gts` and the `.md` deleted — the test-app is what gets
deployed to GitHub Pages, so the cookbook now ships next to the demos it describes, and recipe 1's
"one-line render" is a **live grid** rather than a screenshot of one.

Implementation notes worth reusing:

- **Content is a data model (`SECTIONS`), not markup.** Two reasons, and the first is not optional:
  code samples containing `{{ }}` are parsed as Glimmer if they appear in template position, so they
  have to arrive as JS strings rendered through `{{block.text}}`.
- **Blocks are flattened to a uniform `RenderBlock` with `is*` booleans** rather than left as a
  discriminated union. Glimmer templates cannot narrow a union, so a union forces either helper
  gymnastics or `@ts-expect-error`.
- **`<section>` cannot be used as a tag while `section` is an in-scope block param.** In a
  strict-mode template any lowercase tag matching a binding in scope resolves to that binding, so
  `{{#each this.sections as |section|}}<section>` type-errors with a baffling "No overload matches
  this call". Renamed the block param to `chapter`.
- A ~10-line `inline()` applies a deliberately tiny markdown subset (`` `code` ``, `**bold**`,
  `*italic*`). It **escapes HTML first**, which is what makes the `htmlSafe` at the end safe.
- Tailwind's preflight resets `list-style` on every `ul`, so bulleted lists need it set explicitly.

### The README is now user-facing, and is the ROOT one

`glide-data-grid-ember/README.md` is a build artifact (gitignored; `rollup.config.mjs` copies
`../README.md` over it on every build) — the file to edit is the **workspace-root `README.md`**.
Rewritten for a human evaluating the addon: what you get, install, a complete minimal example, the
three things that surprise everyone (`@rows` is a count, `[column, row]` ordering, the container
needs a height), and links out to the deployed demos/cookbook and to `DATA.md`/`THEMING.md`.

The GitHub Pages URL is a placeholder with local-run instructions until the deploy exists.

## Demo fixtures: making `<DemoGrid>` read as data (2026-08-09)

Prompted by a direct user observation — *"the glide demo grid has nicer looking cells than the full
grid demo"*. It was right, and the cause was entirely in the fixture, not the grid. `demo-data.ts`
produced `Column 12` / `row-7` / `R7C34` at widths that clipped half of it.

Four things made `<GlideDemo>` look better, all of them fixture concerns: real domain values,
column titles that mean something, widths fitted to content, and per-row generated images.
`demo-data.ts` now does all four **while staying a pure function of `[col, row]`** — a small integer
hash (`fieldHash`) per field, so there is no PRNG state, nothing is materialized, and output is
byte-identical on every reload. The 21 typed columns get real titles/widths/icons; the 29 filler
columns get plausible headings and values.

- **`demo-fixtures.ts` is new and shared.** Canvas-generated `data:` URI images, the palette, and
  the name pools used to live in `glide-demo-data.ts` with a "keep the two copies in sync" note.
  Two copies of a sync-hazard is one too many.
- **`icon` moved onto `demoColumns`.** It is a property of the column, so `<DaisyDemo>` gets it for
  free; `<DemoGrid>` only adds group headings, `hasMenu`, the auto-sized column and its custom glyph.
- **Independently-salted picks collide.** Chip lists showed `Ember  Ember`, which reads as a
  renderer bug. `distinctPicks` walks the pool with a stride forced coprime to its length — with a
  non-coprime stride the walk revisits (length 8, stride 4 → start, start+4, start).
- **Markdown samples are one short line each.** The markdown cell draws its *raw source* on the
  canvas (source does too), so a multi-line sample renders as a clipped fragment of syntax.

### Browser-testing lesson: a stale dev environment can fake a defect for hours

The images work. They were reported as broken — Photo cells blank, chip avatars missing — and that
report was **wrong**, from the assistant's own browser, and it survived every check applied to it:
a fresh page load, a cache-busting query string, and finally **opening a brand-new tab**. It was
retracted only when the user sent a screenshot showing every portrait rendering correctly.

The cause was environmental: by that point the session had restarted the dev server about a dozen
times, wiped `node_modules/.vite` on each restart, and patched and reverted `dist/` several times to
instrument the loader. Something in that sequence left Chrome serving an inconsistent mix.

Three things to take from it, all of which cost an hour each here:

- **Patching `dist/` to instrument the addon produced false readings.** Logs placed in
  `loadOrGetImage` recorded nothing *even for the demo that was visibly rendering images* — a result
  that is impossible if the patched module is the one executing. That was the moment to stop and
  distrust the environment; instead it was read as evidence about the code. **Instrument the source
  and rebuild.**
- **"I opened a fresh tab" is not a clean environment** when the dev server and its caches have been
  churned repeatedly. Restart the server once, cleanly, and reload — or better, check against a
  second observer before believing a defect that only you can see.
- **A second pair of eyes settled in one screenshot** what an hour of instrumentation could not.
  When a user's observation contradicts yours about something as concrete as "is there an image in
  this cell", the environment is the far likelier culprit.

## CI, Pages and npm publishing (2026-08-09)

`.github/` was replaced wholesale from `/Users/jxhui/Developer/choices-ember`, at user request, and
renamed to this package. Four workflows: `ci.yml` (tests + floating deps + a 7-scenario `ember-try`
matrix), `pages.yml` (deploys `test-app` to GitHub Pages), `push-dist.yml`, and `release.yml` (npm
**Trusted Publishing via OIDC** — no `NPM_TOKEN`, no OTP in CI).

The workflows assume things this repo did not have; all four are now wired:

- **`test-app/config/ember-try.js`** — copied from choices-ember. Without it the `try-scenarios`
  job fails outright. Also added `ember-try`, `@embroider/test-setup` and `ember-source-channel-url`
  to `test-app`'s devDependencies.
- **`ROOT_URL` / `LOCATION_TYPE`** in `test-app/config/environment.js`. A GitHub Pages *project*
  site is served from `/<repo>/`, and `pages.yml` passes that in. **Not yet verified under Vite** —
  the workflow was written for an `ember-cli` build.
- **`repository.url`** on the addon package. Trusted publishing rejects the publish without it, and
  it must match the GitHub repo.

`pages.yml` copies `dist/index.html` to `404.html` — the app uses `history` location, so unknown
paths must fall back to the SPA shell.

**Both `ci.yml` and `release.yml` run `pnpm lint`, which currently fails** (117 eslint + 65
prettier). The lint cleanup had been parked by explicit user preference; that parking is void now
that a pipeline depends on it.

## Queue items 1–6: the cookbook absorbs both guides, and one defect per track (2026-08-09)

Run as four subagents on disjoint file sets — two on docs, one on the `<DemoGrid>` interaction gaps,
one on the `@action` sweep — with the orchestrator re-verifying each. **Two real addon defects came
out of it, and neither was in the track that was looking for bugs.** That is the reusable point: the
docs migration found the `recordsSource` defect purely by reading the module closely enough to
describe it, and the "six demo gaps" track found that five of its six items weren't addon bugs at
all while the sixth was far bigger than reported.

### What landed

- **`DATA.md` and `THEMING.md` are gone.** Their content is now four cookbook chapters:
  `ember.ts` (*Using the grid in Ember* — absorbs DATA.md in full, plus Ember Data, GraphQL, and
  `object-scan` with and without), `theming.ts`, `theme-reference.ts`, and a rewritten `editing.ts`.
  **There is exactly one copy of each.** The root `README.md` links to the deployed cookbook.
- **The cookbook is now one chapter per file** in `test-app/app/utils/cookbook/`, ordered by that
  directory's `index.ts`. Titles carry **no leading number** — the page numbers them from position,
  so inserting a chapter is a one-line edit rather than a renumbering sweep. This was done
  specifically so several agents could write chapters concurrently without collisions, and it is
  worth keeping for that reason.
- **The overlay-editor pointer defect** (see the recurring-bug-class section at the top of this
  file) — `-private/grid-event-target.ts`.
- **The `recordsSource` blank-rows defect** (below).
- Every test-app demo and cookbook sample now uses **class-field arrows, not `@action`** (Ember 6+).
  The two rules reinforce each other and the docs now say so: an arrow field is created once per
  instance, so it is *also* identity-stable, which is what `computeCanBlit`'s compared args need.

### `recordsSource` + Ember Data live arrays

`recordsSource` reuses its per-row caches while the `records` **array identity** is unchanged, but
reads `rows` fresh from `records.length`. The documented contract ("replace the array when rows are
added or removed") is fine until it meets a data layer whose arrays are deliberately *never*
replaced: `store.peekAll(...)` keeps one identity for the life of the store. Its tracked `length`
still invalidates the caller's `@cached` getter, so the function re-runs with the same identity, the
**old** caches and the **new** length — and every added row painted `FALLBACK_CELL`. Blank cells, no
error. Fixed by adding `prev.caches.length === records.length` to `cachesReusable`.

**The general shape is worth remembering: an addon contract phrased as "replace the array" is a
contract the host framework's own data layer may be structurally unable to honour.** Documenting it
is not enough; the code has to detect the violation, because the failure is silent.

### The vitest suite can now use the real tracking primitives

`data-source/records-source.ts` had **no tests at all** (9a item 1) because it imports
`@glimmer/tracking/primitives/cache`, which an Ember app provides at build time and bare Node cannot
resolve. Ember's `createCache`/`getValue` are re-exports of **`@glimmer/validator`**'s, so
`vitest.config.ts` now aliases the two and `@glimmer/validator` is a devDependency.

**This is not a stub** — it is the real implementation, including real invalidation via
`createTag`/`consumeTag`/`dirtyTag`. That is what lets `records-source.test.ts` assert the actual
memoization invariant (*editing one field re-projects one row, not the whole table*) rather than
merely its shape, which closes the unit-testable half of an evidence gap that had been carried since
Phase 8d as "browser-measured once, and nothing re-runs it". The same alias makes any other
`createCache`-based module testable; the vitest config's "no `ember-source` imports here" rule is
unchanged, since this is precisely the standalone-`@glimmer/validator` substitution it points at.

### Still open, needs a decision

**`@onSelectionChanged` reports the grid's internal (mangled) column space** — row-marker column
included — while `@onCellsEdited` and all three context-menu callbacks subtract `rowMarkerOffset`.
`applySelection` passes `this.selection` straight through and `dispatchCellMouseDown` writes mangled
columns into it. Source keeps `gridSelection` in *unmangled* space and mangles it on the way down to
`DataGrid`, so this is a real inconsistency in a **public callback contract**. Deliberately not
fixed: changing it would break any consumer already compensating, and `<GlideDemo>` may be one.
`<DemoGrid>` works around it locally, documented in place.

## The display-field rule has a consumer half (2026-08-09)

The recurring-bug-class entry at the top of this file has been about **addon** defects: three times,
an addon editor or seeding path changed `data` and forgot the derived display field. The Progress
column added a fourth instance and it lands on the **other** side of the boundary — worth recording,
because "display-field staleness" had until now been shorthand for "an addon bug".

**The rule is: whoever owns the formatting semantics owns the sync.**

- `displayData` (text), `displayDate` (date-picker), the uri editor's display value — **the addon
  formats these**, so keeping them true is the addon's job, and failing to was a real defect each
  time.
- `range-cell`'s `label` — **the addon cannot format this.** It is optional free-form text
  (`"42%"`, `"42 of 100"`, `"high"`); there is no formatter to apply. Source's editor updates only
  `value` too (`packages/cells/src/cells/range-cell.tsx:129-136`), so this is faithful, not a port
  gap. The consumer who wrote the label owns keeping it true.

`<DemoGrid>` was that consumer and got it wrong: `demoGetCellContent` built `${value}%` for column 10
and `handleCellsEdited` stored the edited cell verbatim, so dragging the slider moved the bar and
left the label reading the pre-edit number. **The user reported this as "the value doesn't update
after enter/blur", which is what this failure mode looks like from outside** — the edit had saved
perfectly. Fixed by `normalizeEditedCell` in `demo-data.ts`, where the `%` semantics live.

**Diagnostic tell for next time:** if an edit "doesn't save" but the cell *partly* changes, suspect a
stale display field before suspecting the commit path. A dropped commit changes nothing; a stale
display field changes the parts `draw()` reads from `data` and not the parts it reads from the
display field.

## Tree view: decided against faking row collapse in the demo (2026-08-09, user decision)

`tree-view-cell`'s chevron flips `isOpen` and hides nothing, because `packages/cells` ships no
grid-level tree — row visibility is entirely a consumer concern, and the renderer is a verbatim port.
The demo could have implemented a row-index mapping to make it look real. **The user's call was not
to**: faking it would advertise a feature the addon does not have. The column is now titled
"Files (toggle)" and says outright that it is a disclosure toggle rather than a row tree.

Worth generalising, since this demo exists to prove the addon: **a demo that fakes a capability is
worse than one that omits it** — 10a's whole premise is that the demo is what tells you which
features really work.

## 9g, and the selection coordinate change — browser-verified 2026-08-09

### The `@onSelectionChanged` coordinate fix is confirmed in a browser

The change that made every consumer-facing callback speak the same column space (see "Queue items
1–6") was the riskiest thing in the tree: a mangled and an unmangled `GridSelection` are the *same*
type, so a missed conversion neither fails to compile nor throws — it silently operates on the
adjacent column, and only when row markers are on. Verified in `<DemoGrid>` with **row markers on**:

| Action | Reported | Why it proves something |
|---|---|---|
| click the first real column | `cell 0,0` | the old bug reported `cell 1,0` |
| click the Notes column | `cell 4,2` **and the column note read "Markdown cell"** | a *semantic* check — a wrong offset would describe a neighbouring column |
| click a column header | `1 col(s)`, `col 1, header` | column-selection path, not just the current cell |
| select-all | `200000 row(s)`, hover `col -1` | `-1` **is** the row-marker column after subtraction, so the conversion is demonstrably running |
| drag-select | `range 4x5 at 0,0` | ranges convert too, and the 9g mouseup rework didn't break drag |

`@onItemHovered` agreeing with `@onSelectionChanged` on every one of these is the strongest single
piece of evidence, because the two are independently implemented: two numbers matching by accident is
far less likely than one number looking plausible.

**Method note worth keeping.** The column-note check was the most valuable assertion and was free —
`<DemoGrid>` already looked a note up *by column index*, so a coordinate error would have printed the
wrong cell type. **When verifying a coordinate change, find an assertion that is semantic rather than
numeric**; "the note says Markdown and I clicked the markdown column" cannot pass by coincidence the
way "it printed 4" can.

### The 9g click callbacks: needing to argue you improved on source is the tell

`onCellClicked`/`onHeaderClicked`/`onGroupHeaderClicked` first shipped firing on **mousedown**, with a
comment claiming `preventDefault()` suppressed "the renderer's `onClick`, the selection change and
activation — the same three things source's `isPrevented` suppresses". **Source suppresses two.**
Selection already ran in `onMouseDown` (`data-editor.tsx:2126`) long before the callback fires from
`onMouseUp` (`:2370`), so `preventDefault()` there cannot suppress selection and was never meant to.

The contract was inferred from the prop declaration instead of from the code that guards the call.
Cost: **a drag-select fired a spurious click**, because source's `isValidClick`
(`lastMouseDownCol === col && lastMouseDownRow === row`) is exactly what distinguishes a click from a
drag, and firing on mousedown discards it.

Reworking it surfaced **two more defects from the same misreading** — `onHeaderClicked` fired for the
row-marker column (source guards `if (clickLocation < 0) return`), and activation checked only "is
this cell selected *now*", which is trivially true on a first click because that click's own mousedown
just selected it (source requires selected **before and after** the press).

> **Standing lesson, and it generalises past this port: on a full-parity port, needing a paragraph to
> argue a divergence is *better* than upstream is itself the signal to go back and read source.** The
> justification paragraph is the tell. One wrong reading produced three defects, all of which
> compiled, and all of which looked deliberate.

Corollary for reviewers: read the **guard conditions** around a call, not the prop's type or name.
`onCellClicked` fires where `isValidClick` says so; nothing about the declaration reveals that.

## `computeCanBlit` does NOT compare columns by identity alone (correction, 2026-08-09)

Several `src/data-source/` module headers assert that returning a fresh `columns` array kills the
scroll blit fast path. **That is overstated**, and it is worth correcting because it has been used to
justify memoization design.

What `computeCanBlit` actually does (`render/data-grid-render.blit.ts:258-284`):

1. **> 100 columns, or a length change → return false.** No comparison attempted.
2. **Otherwise → element-wise `deepEqual` per column.** A freshly-allocated array whose columns are
   structurally identical still passes.

So a fresh `columns` array is *cheap-but-not-free* below 100 columns (N `deepEqual`s per frame) and
*fatal* above it. The identity rule is real for the ~18 other `DrawGridArg` fields — those are `===`
comparisons — but `mappedColumns` is the one field with a structural fallback.

This is the same code 9k memoized: `computeMangledLayout` was rebuilding the array every draw, so the
`deepEqual` branch ran every frame and the >100-column bail-out triggered permanently on wide grids.
The memoization makes the identity check hit and skip the comparison entirely — which is why the fix
mattered — but "fresh array = no blit" was never the precise statement.

**Rule for future doc comments:** say *which* comparison a field gets. `===` for the identity-compared
fields; structural-with-a-bail-out for `mappedColumns`. Overstating it produces confident but wrong
design arguments, which is exactly what happened in the `data-source/` headers.
