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

## Process note for whoever picks this up next

Two 2a attempts before this note existed wasted significant time/tokens: two died to
infra-level connection issues (not logic problems, just retry), and one ran ~4 hours doing
re-derivation of facts (like the `.ts`-extension import rule and `noUncheckedIndexedAccess`
handling) that were already established in this file's predecessor knowledge. **Always update
this file when you learn something reusable, and always tell the next agent to read it first.**
This file existing and being kept current is the fix.
