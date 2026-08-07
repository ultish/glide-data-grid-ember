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
- Verify with `npx tsc --noEmit -p tsconfig.json` (from `glide-data-grid-ember/`) and the real
  build with `pnpm build` (also from `glide-data-grid-ember/`, runs `rollup --config`). Both must
  be run — tsc passing does not guarantee the rollup/babel build passes (the `.ts`-extension
  requirement above is a rollup/babel constraint tsc alone won't catch).
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
