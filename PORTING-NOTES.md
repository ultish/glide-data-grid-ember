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

## Phase 3 — Interaction layer (research done, implementation not started)

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

## Process note for whoever picks this up next

Two 2a attempts before this note existed wasted significant time/tokens: two died to
infra-level connection issues (not logic problems, just retry), and one ran ~4 hours doing
re-derivation of facts (like the `.ts`-extension import rule and `noUncheckedIndexedAccess`
handling) that were already established in this file's predecessor knowledge. **Always update
this file when you learn something reusable, and always tell the next agent to read it first.**
This file existing and being kept current is the fix.
