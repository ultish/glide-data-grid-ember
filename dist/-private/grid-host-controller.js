import { drawGrid } from '../rendering/render/data-grid-render.js';
import { getEffectiveColumns, getStickyWidth, getColumnIndexForX, getRowIndexForY, itemsAreEqual, rectBottomRight, computeBounds } from '../rendering/render/data-grid-lib.js';
import { isSizedGridColumn, DEFAULT_FILL_HANDLE, CompactSelection, GridCellKind, InnerGridCellKind, booleanCellIsEditable, isObjectEditorCallbackResult, isReadWriteCell, BooleanEmpty } from '../rendering/data-grid-types.js';
import '../rendering/cells/text-cell.js';
import '../rendering/cells/number-cell.js';
import { toggleBoolean } from '../rendering/cells/boolean-cell.js';
import '../rendering/cells/loading-cell.js';
import '../rendering/cells/protected-cell.js';
import '../rendering/cells/row-id-cell.js';
import '../rendering/cells/uri-cell.js';
import '../rendering/cells/markdown-cell.js';
import '../rendering/cells/bubble-cell.js';
import '../rendering/cells/drilldown-cell.js';
import '../rendering/cells/image-cell.js';
import '../rendering/cells/new-row-cell.js';
import '../rendering/cells/marker-cell.js';
import '../rendering/extra-cells/sparkline-cell.js';
import '../rendering/extra-cells/star-cell.js';
import '../rendering/extra-cells/range-cell.js';
import '../rendering/extra-cells/spinner-cell.js';
import '../rendering/extra-cells/tags-cell.js';
import '../rendering/extra-cells/dropdown-cell.js';
import '../rendering/extra-cells/multi-select-cell.js';
import '../rendering/extra-cells/links-cell.js';
import '../rendering/extra-cells/date-picker-cell.js';
import '../rendering/extra-cells/button-cell.js';
import '../rendering/extra-cells/tree-view-cell.js';
import '../rendering/extra-cells/user-profile-cell.js';
import '../rendering/extra-cells/article-cell.js';
import { mergeAndRealizeTheme, getDataEditorTheme, makeCSSStyle } from '../rendering/theme.js';
import { hitTestGroupHeaderAction, appendRenameAction } from '../rendering/render/group-header-actions.js';
import { setSelectedColumns, setSelectedRows, setCurrentSelection } from '../rendering/selection-behavior.js';
import { getCopyBufferContents, copyHeaderRow, decodeHTML, unquote, shouldAcceptPaste } from '../rendering/copy-paste.js';
import { coercePasteCell } from '../rendering/paste-coercion.js';
import { applyCellValidation } from '../rendering/validate-cell.js';
import { measureRemSize, remAdjustDimensions } from '../rendering/rem-adjuster.js';
import { isValidClick, shouldActivateOnClick, resolvePointerActivation } from '../rendering/click-behavior.js';
import { computeScrollDelta } from '../rendering/scroll-to.js';
import { resolveNewRowTarget } from '../rendering/new-row-target.js';
import { computeGroupHeaderSelection } from '../rendering/group-header-selection.js';
import { IncrementalSearch } from '../rendering/search.js';
import { Autoscroller, computeScrollEdge, NO_SCROLL_EDGE, adjustDragLocationForScroll } from '../rendering/autoscroll.js';
import { getClosestRect, pointInRect, combineRects } from '../rendering/common/math.js';
import { previewRowOrder, computeFillEdits } from '../rendering/drag-and-fill.js';
import { CellSet } from '../rendering/cell-set.js';
import { AnimationManager } from '../rendering/animation-manager.js';
import { SpriteManager } from '../rendering/data-grid-sprites.js';
import { sprites } from '../rendering/sprites.js';
import ImageWindowLoaderImpl from '../rendering/common/image-window-loader.js';
import { RenderStateProvider } from '../rendering/common/render-state-provider.js';
import { resolveKeybindings } from '../rendering/keybindings.js';
import { flattenRowGroups, makeRowThemeOverride, makeRowNumberMapper, makeRowHeight, effectiveRowCount, mapRowIndexToPath, getSelectionRowLimits, skipGroupHeaders } from '../rendering/row-grouping.js';
import { OutOfBoundsRegionAxis, outOfBoundsKind, groupHeaderKind, headerKind } from '../rendering/event-args.js';
import { synthesizeCellsForSelection } from '../rendering/cells-for-selection.js';
import { sizeColumns, applyColumnGrow, measureColumn } from '../rendering/column-sizer.js';
import { shouldFocusOverlayContainer } from '../rendering/overlay-focus.js';
import { isOutsideStrictRegion } from '../rendering/strict-region.js';
import { isHotkey } from '../rendering/is-hotkey.js';
import { isDraggableAttr, canDragFrom, dragKindForHit, hasDropTargetChanged } from '../rendering/external-drag.js';
import { drawHeader, computeHeaderLayout } from '../rendering/render/data-grid-render.header.js';
import { drawCell } from '../rendering/render/data-grid-render.cells.js';
import { withAlpha } from '../rendering/color-parser.js';
import { AnimationQueue } from '../rendering/animation-queue.js';
import { browserIsFirefox, browserIsSafari, browserIsChromium, browserIsOSX } from '../rendering/common/browser-detect.js';
import { isGridSurfaceTarget } from './grid-event-target.js';
import { MangledLayoutCache } from './mangled-layout.js';
import { EMPTY_SELECTION, MangledSelectionCache, asConsumerSelection, unmangleSelection, unmangleColumn, mangleSelection } from './selection-space.js';

// GridHostController -- the imperative engine that drives the ported canvas render engine
// (`src/rendering`) from a plain DOM element. This is Phase 2 of the Ember port: it has no
// Ember/React imports. A later phase wraps this class in a thin Ember component (a `.gts` file +
// modifier) that owns reactivity and simply calls `scheduleFullRedraw()` / `updateCells()` /
// `destroy()` at the right times.
//
// DOM structure built inside `root` mirrors `packages/core/src/internal/scrolling-data-grid/
// infinite-scroller.tsx` (class names kept identical so existing CSS knowledge / dev-tools
// intuition transfers):
//
//   root (position: relative, established if not already positioned)
//     .dvn-underlay            (absolute, fills root, non-interactive)
//       canvas                 (main content canvas, absolute 0,0)
//       canvas                 (header canvas, absolute 0,0, layered on top)
//     .dvn-scroller             (absolute, fills root, overflow: auto -- the real scroll surface)
//       .dvn-scroll-inner       (flex row, pointer-events: none)
//         .dvn-stack            (flex column: padder divs whose summed height is total content
//                                 height, chunked into <= MAX_PADDER_SEGMENT_HEIGHT segments so we
//                                 never approach the browser's ~33.5M px div-height cap)
//         .dvn-spacer           (flex-grow: 1; the classic flex trick that makes the scrollable
//                                 width equal max(content width, viewport width) for free)
//
// Two additional offscreen canvases (bufferA/bufferB, used by the double-buffer render strategy)
// are created via `document.createElement` and appended to `document.documentElement` rather than
// `root`, per the source's own approach -- `destroy()` removes them again.

// Public args this controller is driven by. `getArgs()` is called fresh on every draw/scroll/hover
// pass -- the controller never caches the result across calls, per the calling convention: the
// Ember wrapper component owns memoization of whatever produces these values.
/**
 * Row-marker column kinds, mirrors source's `RowMarkerOptions["kind"]`
 * (`data-editor/data-editor.tsx:97-106`) minus the deprecated non-`kind` sibling props. `"none"`
 * (the default) means no marker column exists at all -- `col 0` is just the caller's first real
 * column, exactly like today.
 */

/**
 * Presentation of the trailing blank "add row" row. Mirrors the subset of source's
 * `trailingRowOptions` this port can honour (Phase 9g).
 *
 * **`sticky` and `targetColumn` are deliberately absent.** `sticky` is implemented in source by
 * adding 1 to `freezeTrailingRows`, which this port hardcodes to `0` at seven hit-test/layout call
 * sites -- see PHASES.md's 9g entry, it is explicitly not the one-line passthrough it looks like.
 * `targetColumn` only means anything alongside source's `appendRow(col)` focus flow, which needs the
 * imperative ref (9f). Both would be silently inert if accepted here.
 *
 * A column's own `trailingRowOptions` (already on `GridColumn`) overrides `hint`/`addIcon` for that
 * column, and `disabled: true` blanks its trailing cell -- exactly as source layers them.
 */

/**
 * Where `onRowAppended` put the new row, for `GlideDataGridApi.appendRow` to focus. `"bottom"` and
 * `undefined` mean the same thing. Source's inline union (`data-editor.tsx:1695`).
 */

/** The column equivalent of {@link RowAppendedResult}. `"right"` and `undefined` mean the same. */

/** What a context-menu callback receives alongside the target. */

/** A snapshot of everything a search UI needs to render. Handed to `onSearchStateChange`. */

/**
 * Reads a rectangle of cells at once. `selection` is in the consumer's own coordinate space (no
 * row-marker column). Returns the cells directly, or a thunk to load them asynchronously.
 * Mirrors source's `DataGridSearchProps["getCellsForSelection"]`.
 */

/** What {@link GridHostController.resolvedRowGrouping} memoizes — source's `UseRowGroupingInnerResult`
 *  plus the flattened tree, which this port also needs for nav and selection clamping. */

const DEFAULT_ROW_HEIGHT = 34;
const DEFAULT_HEADER_HEIGHT = 36;

// Selection-blending/mode defaults, matching source's own (`data-editor.tsx:836-850`). These used
// to be the *only* possible values -- 9g turned them into `GridHostArgs` fields, so they are now
// just the `??` fallbacks in `resolveArgs`.
const DEFAULT_SELECTION_BLENDING = "exclusive";
const DEFAULT_SELECTION_MODE = "auto";
// The marker *body* cell's checkbox style. Its header-column counterpart lives in
// `mangled-layout.ts` alongside the rest of the synthetic column (Phase 9k).
const DEFAULT_ROW_MARKER_CHECKBOX_STYLE = "square";
function rowMarkerWidthDefault(rows) {
  return rows > 10_000 ? 48 : rows > 1000 ? 44 : rows > 100 ? 36 : 32;
}

// Phase 4a: marker/new-row cells are `InnerGridCell`s with no `GridCell` counterpart (mirrors
// source's `isInnerOnlyCell`, `data-grid-types.ts`) -- never routed through the overlay-editor /
// renderer-onClick machinery below, which only deals in real `GridCell`s.
function isInnerOnlyCellKind(kind) {
  return kind === InnerGridCellKind.Marker || kind === InnerGridCellKind.NewRow;
}

// Phase 4a: single printable character, no modifiers -- mirrors source's `editOnType` regex
// (`data-editor.tsx:3510`, `/[\p{L}\p{M}\p{N}\p{S}\p{P}]/u`) exactly.
const PRINTABLE_CHAR_RE = /[\p{L}\p{M}\p{N}\p{S}\p{P}]/u;

// `DrawGridArg.verticalBorder` -- this port always draws every vertical gridline (no per-column
// suppression is exposed as an arg). Hoisted to module scope on purpose: `computeCanBlit`
// (`render/data-grid-render.blit.ts:246`) compares this field by *identity* against the previous
// frame's arg, so an inline `() => true` in `runDraw` made the check fail on every frame and
// disabled the scroll blit fast path entirely. Found in Phase 6, see PORTING-NOTES.md.
const ALWAYS_VERTICAL_BORDER = () => true;

// What `@strictVisibleRegion` compares against before a region has ever been computed. Source's own
// initial `visibleRegionRef` (`data-editor.tsx:1171-1176`). It should be unreachable here --
// `runDraw` computes the real region before anything reads it -- and exists so that a future call
// path that reads cell content outside a draw degrades to "the top-left cell is available" rather
// than crashing.
const INITIAL_VISIBLE_REGION = {
  x: 0,
  y: 0,
  width: 1,
  height: 1
};

/** The shape every listener the grid puts on `windowEventTarget` has. See `addWindowListener`. */

// `DrawGridArg.getGroupDetails` -- the fallback when the consumer passes no `@getGroupDetails`:
// the group's key *is* its display name and it has no icon, theme or actions. Source's own default
// (`data-grid.tsx:830`, `getGroupDetails ?? (name => ({ name }))`).
//
// Hoisted to module scope for the same identity-stability reason as `ALWAYS_VERTICAL_BORDER` above
// -- `getGroupDetails` happens not to be one of `computeCanBlit`'s identity-compared fields today,
// but an inline closure in `runDraw` is exactly the shape that silently broke the blit path in
// Phase 6, so this port keeps every `DrawGridArg` value reference-stable by default rather than by
// case analysis. The consumer-supplied case is memoized in `resolvedGroupDetails` for the same
// reason.
const DEFAULT_GROUP_DETAILS = name => ({
  name
});

// Phase 3d: column resize/reorder. Resize-edge hit region width (px) at a header cell's right
// border; source doesn't expose an exact named constant for this in the parts of `data-grid.tsx`
// cited by PORTING-NOTES.md, so this is a reasonable small value consistent with typical
// resize-handle affordances. Reorder drag activation dead-zone matches source's own
// `data-grid-dnd.tsx` `Math.abs(event.clientX - dragStartX) > 20` exactly.
/** How long after the last scroll event the canvas returns to full resolution. Source's literal. */
const RESCALE_SETTLE_MS = 200;
const RESIZE_EDGE_PX = 6;
const COLUMN_DRAG_THRESHOLD_PX = 20;
// Phase 9h: the vertical twin of the above, for row reorder -- source uses the same literal 20 in
// the same function (`Math.abs(event.clientY - dragStartY) > 20`).
const ROW_DRAG_THRESHOLD_PX = 20;

// 9g: the cache key for `scaleToRem`. Compared field-by-field rather than by object identity
// because `resolveArgs` builds a fresh input literal on every call -- identity would never hit.
function dimensionsAreEqual(a, b) {
  return a.rowHeight === b.rowHeight && a.headerHeight === b.headerHeight && a.groupHeaderHeight === b.groupHeaderHeight && a.theme === b.theme && a.overscrollX === b.overscrollX && a.overscrollY === b.overscrollY;
}

/** Source's `clamp` (`common/utils.ts`), which this port had never needed until the scroll shadows. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function rectanglesEqual(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Browser's maximum div height limit (varies a bit by browser) and the max height of a single
// padder segment, both taken from `infinite-scroller.tsx` verbatim.
const BROWSER_MAX_DIV_HEIGHT = 33_554_400;
const MAX_PADDER_SEGMENT_HEIGHT = 5_000_000;

// How many rows an auto-sizing pass samples. Source measures whatever `getCellsForSelection`
// happens to have; this port picks a fixed sample because measuring is O(rows x auto-columns) and a
// 200k-row grid must not pay for it. 50 is enough for the outlier filter (which needs >5) to be
// meaningful while staying trivially cheap.
const AUTO_SIZE_SAMPLE_ROWS = 50;
function totalRowsHeight(rows, rowHeight) {
  if (typeof rowHeight === "number") return rows * rowHeight;
  let total = 0;
  for (let r = 0; r < rows; r++) total += rowHeight(r);
  return total;
}

// Given a scroll offset in pixels, returns the index of the first visible non-frozen column and
// the sub-pixel translation needed to position it correctly. This is a simplified, non-"smooth
// scroll opt-out" version of the branching logic in `scrolling-data-grid.tsx`'s `processArgs`
// (which also supports a non-smooth/integer-cell-only mode); always computing the smooth/sub-pixel
// form is a reasonable default for this phase since the ported `drawGrid` blit fast path is what
// actually matters for scroll perf, not this offset math. Frozen (sticky) columns are always
// rendered at a fixed screen position by the render engine regardless of scroll, so `scrollLeft` is
// walked directly against the *non-sticky* columns' cumulative widths -- this is algebraically the
// same comparison `processArgs` makes (its `cx = x - stickyColWidth` subtraction cancels out against
// the sticky columns' contribution to `x`), just without the sticky-column bookkeeping since we
// don't need `cellRight`/viewport-fit counting here.
function computeXOffset(scrollLeft, mappedColumns, freezeColumns) {
  let remaining = scrollLeft;
  let cellXOffset = freezeColumns;
  for (let i = freezeColumns; i < mappedColumns.length; i++) {
    const w = mappedColumns[i].width;
    if (remaining >= w) {
      remaining -= w;
      cellXOffset++;
    } else {
      break;
    }
  }
  return {
    cellXOffset,
    translateX: -remaining
  };
}

// Result of resolving a mousedown/mouseup/click's page coordinates against the current draw state.
// Mirrors the subset of source's `GridMouseEventArgs` (`getMouseArgsForPosition` in
// `data-grid.tsx:516-660`) actually needed for Phase 3a's click dispatch -- column-resize edge
// detection (`isEdge`) is Phase 3d, not reproduced here.

// Overlay editor open state (Phase 4a). Mirrors source's single `overlay: {...} | undefined`
// state field (`data-editor.tsx:776-784`) -- a plain instance field here rather than `@tracked`,
// matching this port's existing imperative-controller pattern (same treatment as `selection`/
// `hoverInfo`/drag state above). `realLocation`/`mangledLocation` are the same cell in the two
// coordinate spaces this controller juggles throughout (see the row-marker-mangling comments
// elsewhere in this file) -- `realLocation` is what `getCellContent`/`onCellsEdited` use,
// `mangledLocation` is what `computeBounds`/damage `CellSet`s use.
/** What a mousedown records for the subsequent mousemove (drag-extend) and mouseup (click) to read.
 *  `location` is a `hit.location` and `previousSelection` is mangled to match, so the two can be
 *  compared without a conversion. */

/** The two clickable glyphs a column header can carry, in the order source tests them
 *  (`isOverHeaderElement`, `data-grid.tsx:1036-1066`). */

function computeYOffset(scrollTop, rows, rowHeight) {
  if (rows <= 0) return {
    cellYOffset: 0,
    translateY: 0
  };
  if (typeof rowHeight === "number") {
    const cellYOffset = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight)), rows - 1);
    const translateY = -(scrollTop - cellYOffset * rowHeight);
    return {
      cellYOffset,
      translateY
    };
  }
  let y = 0;
  let cellYOffset = 0;
  for (; cellYOffset < rows; cellYOffset++) {
    const rh = rowHeight(cellYOffset);
    if (scrollTop < y + rh) break;
    y += rh;
  }
  cellYOffset = Math.min(cellYOffset, rows - 1);
  return {
    cellYOffset,
    translateY: -(scrollTop - y)
  };
}
class GridHostController {
  root;
  getArgsFn;
  underlayEl;
  canvasEl;
  headerCanvasEl;
  scrollerEl;
  scrollInnerEl;
  stackEl;
  spacerEl;
  /** 4.5: the frozen-column and header scroll shadows. See `updateScrollShadows`. */
  shadowXEl;
  shadowYEl;
  /** Last styles written to the two shadows, so a draw that changes nothing touches no DOM. */
  lastShadowState = {
    x: "",
    y: ""
  };
  /** 4.5: scroll-time canvas downscale. Both only ever move when a rescaling arg is on. */
  isScrolling = false;
  scrollingStopTimer;

  /**
   * The nodes a pointer event is allowed to have originated on for the grid to treat it as its
   * own. Everything else inside `root` -- an open overlay editor, `<GlideSearchBar>`, any
   * consumer chrome rendered into the yielded block -- must NOT be dispatched as a grid click.
   * See `grid-event-target.ts` for the full rationale and the source citation.
   */
  gridSurfaces;

  /**
   * Where the grid's **window-level** pointer listeners live (4.5, source's
   * `experimental.eventTarget` → its `windowEventTargetRef`, `data-grid.tsx:409,1442-1452`).
   *
   * Three listeners need a target wider than `root`, because each fires precisely when the pointer
   * has left the grid: the drag-ending `mouseup`, autoscroll's `mousemove`, and the overlay
   * editor's outside-click `mousedown`. `window` is the right answer for a grid in an ordinary
   * document and the wrong one inside a shadow root, where those events are retargeted at the host
   * long before they reach it.
   *
   * Resolved once, in the constructor, from the same three-way choice source makes. Clipboard
   * listeners are deliberately not included -- see the `@eventTarget` doc comment.
   */
  windowEventTarget;

  // The bare `EventTarget` interface has no per-event-name typing (that lives on `WindowEventMap`,
  // which is unreachable once the target may also be a `ShadowRoot`), so every listener it takes
  // is an `EventListener` over the base `Event`. All three of ours are mouse listeners, so the one
  // narrowing cast is here rather than at each call site.
  addWindowListener(type, handler, capture = false) {
    this.windowEventTarget.addEventListener(type, handler, capture);
  }
  removeWindowListener(type, handler, capture = false) {
    this.windowEventTarget.removeEventListener(type, handler, capture);
  }
  bufferAEl;
  bufferBEl;
  canvasCtx;
  headerCanvasCtx;
  bufferACtx;
  bufferBCtx;
  resizeObserver;

  // Engine pieces constructed once and reused across draws.
  spriteManager;
  renderStateProvider;
  imageLoader;
  animationManager;
  animationQueue;
  lastBlitData = {
    current: undefined
  };

  // Mutable draw-loop state.
  width = 0;
  height = 0;
  cellXOffset = 0;
  cellYOffset = 0;
  translateX = 0;
  translateY = 0;
  hoverValues = [];
  hoverInfo = undefined;
  hoveredItem = undefined;
  lastFullDrawArg = undefined;
  cursorOverride = undefined;
  destroyed = false;

  // Phase 9. Handed to every `getCellsForSelection` call so a consumer loading a range
  // asynchronously can cancel when the grid goes away. Aborted in `destroy()`. One per
  // controller, matching source's `abortControllerRef`.
  cellsForSelectionAbort = new AbortController();
  // Real DOM focus state (Phase 3a follow-up fix). The ported render engine deliberately
  // suppresses the selection ring when `isSelected && !isFocused && drawFocus`
  // (`render/data-grid-render.cells.ts:283`) -- mirrors source's behavior of dimming/hiding the
  // active-cell outline when the grid itself doesn't have focus. Phase 2 hardcoded
  // `isFocused: false` since no interaction existed yet to focus the grid; now that clicking
  // actually selects cells (Phase 3a), that hardcoded value made every selection invisible even
  // though the underlying `GridSelection` state was correct. `root` is made focusable and
  // explicitly focused on mousedown, matching source's click-to-focus behavior.
  isFocused = false;

  // Selection state (Phase 3a). Uncontrolled/internal only for now -- there is no
  // `GridHostArgs.selection` prop yet, so `GridHostController` is always the source of truth.
  // Matches source's default (uncontrolled) behavior when `DataEditorProps.gridSelection` /
  // `onGridSelectionChange` aren't passed. A later phase can add controlled-mode support
  // (accepting an external `GridSelection` + only calling `onSelectionChanged`, never mutating
  // `this.selection` itself) without changing anything else here.
  //
  // **Held in the CONSUMER's column space** (2026-08-09) -- column 0 is the consumer's first
  // column, never the synthetic row-marker column. That is what `@onSelectionChanged` reports,
  // consistently with `@onCellsEdited` and the three context-menu callbacks; before this it
  // reported the internal mangled space and disagreed with all four. Source draws the same line
  // (`shiftSelection(newVal, -rowMarkerOffset)` at its `onGridSelectionChange` boundary,
  // `data-editor.tsx:1009`).
  //
  // Everything that works in the render engine's column space -- hit-testing, `computeCellRect`,
  // keyboard nav, copy/cut/delete/paste, fill and drag-extend -- goes through
  // `mangledSelection(args)` / `applyMangledSelection(args, ...)` instead. Those two are the only
  // conversion points, and `-private/selection-space.ts`'s branded `MangledSelection` type is what
  // makes a missed conversion a compile error rather than a silent off-by-one column.
  /**
   * The grid's own selection state, used **only** when the consumer has not taken ownership with
   * `@selection`. Read through the {@link selection} getter, never directly: in controlled mode
   * this field goes stale on purpose, because the consumer's arg is the truth.
   */
  internalSelection = EMPTY_SELECTION;

  /**
   * The consumer's `@selection`, refreshed by `resolveArgs`. Cached in a field rather than read
   * from args on demand because {@link selection} is read on hot paths -- the mangled cell-content
   * closure asks it for every row-marker cell, every frame -- and `resolveArgs` allocates.
   */
  controlledSelection;

  /**
   * The selection in force: the consumer's when they own it, the grid's otherwise. Every read site
   * in this file goes through here, so "who owns the selection" is decided in exactly one place.
   */
  get selection() {
    return this.controlledSelection ?? this.internalSelection;
  }
  mangledSelectionCache = new MangledSelectionCache();
  // Set on mousedown (any kind except a header-menu click), cleared on mouseup. Mirrors source's
  // `mouseDownData.current` (location) + `mouseState.previousSelection`
  // (`data-editor.tsx:2091-2123`) -- both are needed by drag-extend to detect the
  // "dragging out of a freshly-selected row-marker cell" case.
  // `previousSelection` is MANGLED, matching `location` (a `hit.location`), so the two can be
  // compared without a conversion in `handleDragMove`.
  // 9g also reads both fields on mouseup: `location` is the same-cell half of `isValidClick`, and
  // `previousSelection` is the "was it already selected *before* this press" half of the
  // activation decision. Source keeps them in the same two places (`mouseDownData.current` and
  // `mouseState.previousSelection`) and reads them from `onMouseUp` for the same two reasons.
  mouseDownState = undefined;
  // Header glyph a mousedown landed on, if any -- mouseup re-checks the same column is still under
  // the same glyph before firing (mirrors source's down/up-position match in
  // `onPointerUp`/`onClickImpl`, `data-grid.tsx:1176-1244`). `col` is MANGLED, like every
  // `hit.location`. One field rather than one per glyph, matching source's single
  // `{ area, bounds }` result: a press lands on at most one glyph, so nothing can go stale.
  pendingHeaderElementClick = undefined;
  // Shift-extend anchors for row-marker / header column-selection clicks specifically (distinct
  // from `selection.current.cell`, which anchors ordinary cell shift-extend). Mirrors source's
  // `lastSelectedRowRef`/`lastSelectedColRef` (`data-editor.tsx:1885,2009`).
  lastSelectedRow = undefined;
  lastSelectedCol = undefined;

  // Column resize drag state (Phase 3d). Set on mousedown over a header's resize-edge, cleared on
  // mouseup. Mirrors source's `resizeCol`/`resizeColStartX`/`lastResizeWidthRef`
  // (`data-grid-dnd.tsx`). `col` is in MANGLED (row-marker-space) coordinates throughout, same
  // space as `this.selection`/`hitTestHeaderElement`; converted to real column space only at the
  // `GridColumn`/callback boundary.
  resizeState = undefined;
  // Column reorder drag state (Phase 3d). `active` flips true only once the mouse has moved more
  // than `COLUMN_DRAG_THRESHOLD_PX` from `startClientX`, matching source's dead-zone. `dropCol`
  // tracks the current candidate drop column (mangled space); `vetoed` records whether
  // `onColumnProposeMove` rejected the current `dropCol` (no drag-offset visual is drawn while
  // vetoed, mirrors source's `dragOffset` memo returning `undefined` in that case).
  dragColState = undefined;

  // Row reorder drag state (Phase 9h). Set on mousedown in the row-marker column when
  // `onRowMoved` is configured; `active` flips true only once the pointer has moved more than
  // `ROW_DRAG_THRESHOLD_PX` vertically, matching source's dead-zone (`data-grid-dnd.tsx`'s
  // `dragStartY`/`dragRowActive`). While active, `mangledGetCellContent` renders a live preview
  // of the move; nothing is committed until mouseup fires `onRowMoved`.
  dragRowState = undefined;

  // Fill-handle drag state (Phase 9h). Set on a mousedown that landed on the fill handle itself;
  // `highlight` is the region the pointer has dragged out so far (source's
  // `fillHighlightRegion`), drawn as a dashed highlight and turned into edits on mouseup.
  // Both fields are MANGLED: `highlight` is dragged out from `hit.location`s and is handed to the
  // renderer as a highlight region, and `previousSelection` is compared/combined with it.
  fillState = undefined;
  // Whether the pointer is currently hovering the fill handle -- cursor feedback only (source's
  // `overFill`).
  overFillHandle = false;
  // Header-edge hover state used for the source-compatible resize cursor. The actual resize
  // gesture is still gated by the callbacks in `hitTestColumnResizeEdge`.
  overResizeEdge = false;

  // Autoscroll-while-dragging (Phase 9h), shared by drag-extend, row reorder and fill drag.
  autoscroller;
  // The last drag-relevant pointer position, in the hit-test space, remembered so an autoscroll
  // tick can re-resolve what the drag is now over after the grid has slid underneath the
  // (stationary) pointer. Mirrors source's `hoveredRef` feeding `adjustSelectionOnScroll`.
  lastDragHover = undefined;

  // Overlay editor state (Phase 4a) -- see `OverlayState` above. `undefined` = no editor open.
  overlayState = undefined;
  constructor(options) {
    this.root = options.root;
    this.getArgsFn = options.getArgs;

    // Everything structural now lives in `components/glide-data-grid.css`, scoped under
    // `.gdg-root`, so a consuming app can restyle the grid's DOM with ordinary CSS (Tailwind,
    // DaisyUI) instead of fighting inline styles with `!important`. Source ships the equivalent
    // as a Linaria block; see that file's header for the full rationale.
    this.root.classList.add("gdg-root");

    // Stays in JS deliberately: this is a runtime *decision*, not a style. Forcing
    // `position: relative` from the stylesheet would override a consumer who has deliberately
    // positioned the container themselves; we only need to guarantee a positioning context
    // exists for the absolutely-positioned children.
    if (getComputedStyle(this.root).position === "static") {
      this.root.style.position = "relative";
    }
    // Focusable so the grid can receive real DOM focus on click (see `isFocused` field comment
    // above). `tabIndex = 0` puts it in the natural tab order, matching source's grid being a
    // normal focusable/tabbable element. Behaviour, not style -- the matching `outline: none`
    // is in the stylesheet.
    this.root.tabIndex = 0;

    // --- .dvn-underlay + canvases -------------------------------------------------------
    this.underlayEl = document.createElement("div");
    this.underlayEl.className = "dvn-underlay";
    this.canvasEl = document.createElement("canvas");
    this.headerCanvasEl = document.createElement("canvas");

    // 4.5: the two scroll shadows. Source builds them as plain absolutely-positioned divs with
    // an inset `box-shadow` (`data-grid.tsx:1884-1918`) rather than drawing them on the canvas,
    // and this port keeps that: the canvas has a blit fast path that assumes what it painted
    // last frame is still valid, and a shadow whose opacity tracks the scroll offset would
    // invalidate it on every frame. They live in the underlay next to the canvases, are
    // `pointer-events: none` (so they are deliberately NOT in `gridSurfaces`), and their
    // opacity is driven from `updateScrollShadows` on each draw.
    this.shadowXEl = document.createElement("div");
    this.shadowXEl.className = "dvn-shadow-x";
    this.shadowYEl = document.createElement("div");
    this.shadowYEl.className = "dvn-shadow-y";
    this.underlayEl.append(this.canvasEl, this.headerCanvasEl, this.shadowXEl, this.shadowYEl);

    // --- .dvn-scroller / .dvn-scroll-inner / .dvn-stack / .dvn-spacer -------------------
    this.scrollerEl = document.createElement("div");
    this.scrollerEl.className = "dvn-scroller";
    this.scrollInnerEl = document.createElement("div");
    this.scrollInnerEl.className = "dvn-scroll-inner";
    this.stackEl = document.createElement("div");
    this.stackEl.className = "dvn-stack";
    this.spacerEl = document.createElement("div");
    this.spacerEl.className = "dvn-spacer";
    this.scrollInnerEl.append(this.stackEl, this.spacerEl);
    this.scrollerEl.append(this.scrollInnerEl);
    this.root.append(this.underlayEl, this.scrollerEl);

    // Built once, right after the scaffolding exists: none of these nodes is ever replaced for
    // the controller's lifetime. `root` itself is included because a click can land on it
    // directly (e.g. the gap past the last column when the scroller does not cover it).
    this.gridSurfaces = [this.root, this.underlayEl, this.canvasEl, this.headerCanvasEl, this.scrollerEl, this.scrollInnerEl, this.stackEl, this.spacerEl];

    // 4.5: the window-level listeners' target. Source's own resolution order
    // (`data-grid.tsx:1442-1452`): an explicit `eventTarget` wins, otherwise the canvas's root
    // node -- which is `document` for an ordinary grid and the `ShadowRoot` for one inside a web
    // component, so shadow DOM works without the consumer passing anything. `window` rather than
    // `document` in the ordinary case only because that is the object the port has always used.
    //
    // (Source's version of this branch is missing an `else` and therefore always takes the
    // root-node path. Not reproduced: the two are equivalent for a document root, so the bug is
    // invisible upstream and copying it would only mean copying an accident.)
    this.windowEventTarget = this.getArgsFn().eventTarget ?? (this.root.getRootNode() === document ? window : this.root.getRootNode());

    // --- offscreen double-buffer canvases -------------------------------------------------
    this.bufferAEl = document.createElement("canvas");
    this.bufferBEl = document.createElement("canvas");
    for (const canvas of [this.bufferAEl, this.bufferBEl]) {
      canvas.style.display = "none";
      document.documentElement.append(canvas);
    }

    // --- 2D contexts -----------------------------------------------------------------------
    // Zeroing width/height forces the ported `drawGrid`'s internal sizing logic to treat each
    // canvas as needing a fresh size on its first real draw, mirroring `data-grid.tsx`'s own
    // `canvas.width = 0; canvas.height = 0` initialization dance.
    this.canvasCtx = this.getContext2d(this.canvasEl);
    this.headerCanvasCtx = this.getContext2d(this.headerCanvasEl);
    this.bufferACtx = this.getContext2d(this.bufferAEl);
    this.bufferBCtx = this.getContext2d(this.bufferBEl);

    // --- engine pieces -----------------------------------------------------------------------
    // The built-in header-icon glyph set (`rendering/sprites.ts`, ported in Phase 1) must be
    // merged in here, exactly as source does at `data-editor-all.tsx:14`
    // (`{...sprites, ...p.headerIcons}`). Passing `undefined` leaves `SpriteManager` with an
    // empty icon map, so `column.icon` reserves its layout space and then paints nothing --
    // silently, with no error. That was the state from Phase 1 until Phase 7c: `sprites.ts` was
    // never imported anywhere, i.e. 28 ported glyphs were dead code.
    this.spriteManager = new SpriteManager({
      ...sprites,
      ...this.getArgsFn().headerIcons
    }, () => this.scheduleFullRedraw());
    this.renderStateProvider = new RenderStateProvider();
    this.imageLoader = new ImageWindowLoaderImpl();
    this.imageLoader.setCallback(locations => this.drawWithDamage(locations));
    const onAnimationFrame = values => {
      const damage = new CellSet(values.map(v => v.item));
      this.hoverValues = values;
      this.drawWithDamage(damage);
    };
    this.animationManager = new AnimationManager(onAnimationFrame);
    this.animationQueue = new AnimationQueue(items => this.drawWithDamage(items));

    // Phase 9h. One shared autoscroller for every drag that can run past the viewport edge.
    // `scrollBy` on the real scroller fires the ordinary `scroll` event, so the redraw path is
    // the existing one -- `onAutoscrollTick` only has to re-resolve what the (stationary)
    // pointer is now over.
    this.autoscroller = new Autoscroller({
      scrollBy: (dx, dy) => this.scrollerEl.scrollBy(dx, dy),
      onTick: this.onAutoscrollTick
    });

    // --- listeners ---------------------------------------------------------------------------
    this.scrollerEl.addEventListener("scroll", this.onScroll);
    this.root.addEventListener("mousemove", this.onMouseMove);
    this.root.addEventListener("mousedown", this.onMouseDown);
    this.root.addEventListener("contextmenu", this.onContextMenu);
    this.root.addEventListener("focus", this.onFocus);
    this.root.addEventListener("blur", this.onBlur);
    // Keyboard nav (Phase 3b) lives on `root`, consistent with the mouse listeners above.
    // Gated on `this.isFocused` inside the handler itself (real DOM focus already limits which
    // element keydown targets, but this is a belt-and-suspenders guard matching the brief and
    // makes the gating explicit rather than implicit in DOM focus semantics alone).
    this.root.addEventListener("keydown", this.onKeyDown);
    // 4.4: external HTML5 drag-and-drop. All four sit on `root`, where source puts them
    // (`data-grid.tsx:1613,1641,1669,1674`, via its `eventTargetRef`) -- these are drag events
    // dispatched at the element under the pointer, not window-level ones, so the grid's own
    // subtree is the right scope and `@eventTarget` does not apply. `dragend` fires on the drag
    // *source*, so it belongs here too.
    this.root.addEventListener("dragstart", this.onDragStartExternal);
    this.root.addEventListener("dragover", this.onDragOverExternal);
    this.root.addEventListener("dragend", this.onDragEndExternal);
    this.root.addEventListener("drop", this.onDropExternal);
    this.root.addEventListener("dragleave", this.onDragLeaveExternal);
    // Mouseup listens on `windowEventTarget`, not `root` -- a drag-extend can end with the
    // pointer outside the grid (mirrors source's `onPointerUp` listening on `windowEventTarget`,
    // `data-grid.tsx:1198`), and we still need to clear `mouseDownState`/`pendingHeaderElementClick`
    // in that case. `windowEventTarget` is `window` unless `@eventTarget` or a shadow root says
    // otherwise; see its field comment.
    this.addWindowListener("mouseup", this.onMouseUp);
    // Phase 9h. The main `mousemove` listener is on `root`, so it stops firing the moment a drag
    // leaves the grid -- which is exactly when autoscroll needs to know where the pointer is.
    // Source sidesteps this by listening for `pointermove` on the window (`data-grid.tsx:1374`);
    // this port keeps its narrower root listener (hover state is scoped to the grid) and adds a
    // window listener that only wakes up for an in-flight drag *outside* the grid. Events inside
    // the grid reach this one too, by bubbling -- the `contains` check is what stops them being
    // processed twice.
    this.addWindowListener("mousemove", this.onWindowMouseMove);
    // Copy/cut/paste (Phase 3c): native clipboard events, attached at `window` level (not a
    // specific DOM node) and gated on `this.isFocused` inside each handler -- mirrors source's
    // own `useEventListener("copy"/"cut"/"paste", ..., safeWindow, ...)` plus its
    // `document.activeElement` focus check (`data-editor.tsx:3642-3644,3775-3778,3882-3884`),
    // reusing the same `isFocused` field the 3a/3b focus-gating fix already established rather
    // than re-deriving `document.activeElement` containment here.
    //
    // 4.5: these three stay on `window` even when `@eventTarget` redirects the pointer listeners
    // above, because source keeps them on `safeWindow` too (`data-editor.tsx:3767,3877,3908`) --
    // a clipboard event is dispatched at the focused document, so the target that matters for it
    // is the window the grid is running in, which is already this one.
    window.addEventListener("copy", this.onCopy);
    window.addEventListener("cut", this.onCut);
    window.addEventListener("paste", this.onPaste);
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry === undefined) return;
      const {
        width,
        height
      } = entry.contentRect;
      this.width = width;
      this.height = height;
      this.scheduleFullRedraw();
    });
    this.resizeObserver.observe(this.root);
    this.scheduleFullRedraw();
  }
  getContext2d(canvas) {
    canvas.width = 0;
    canvas.height = 0;
    const ctx = canvas.getContext("2d", {
      alpha: false
    });
    if (ctx === null) {
      throw new Error("GridHostController: failed to acquire a 2D canvas rendering context");
    }
    return ctx;
  }

  // --- Phase 9i: column auto-sizing ------------------------------------------------------------
  // Cache for `sizedColumns`. Keyed on identity of everything a measurement depends on: measuring
  // per draw would be absurd (it reads `AUTO_SIZE_SAMPLE_ROWS` cells per auto column), and
  // `computeMangledLayout` runs on every draw, scroll and hover pass.
  autoSizeCache;

  /**
   * Gives every column a concrete width, measuring the ones that declare none.
   *
   * Replaces the flat 150px fallback this port used from Phase 2 until 9i. Columns that carry a
   * `width` are untouched -- auto-sizing is opt-in per column by omitting it.
   *
   * The result is **memoized on identity**, and that is not just a speed concern: `mappedColumns`
   * feeds `computeCanBlit`, so returning freshly-built column objects every draw would make the
   * blit path's per-column comparison fail continuously. (It already rebuilds the mapped array
   * each draw -- backlog item 9k -- but there is no reason to add a second source of churn.)
   */
  sizedColumns(args) {
    const cached = this.autoSizeCache;
    if (cached !== undefined && cached.columns === args.columns && cached.theme === this.mergedTheme(args) && cached.getCellRenderer === args.getCellRenderer && cached.rows === args.rows && cached.minColumnWidth === args.minColumnWidth && cached.maxColumnWidth === args.maxColumnWidth &&
    // `grow` distributes the container's leftover width, so the result depends on the
    // container width and must be re-derived when the grid is resized.
    cached.width === this.width) {
      return cached.result;
    }
    const theme = this.mergedTheme(args);
    const hasAuto = args.columns.some(c => !isSizedGridColumn(c));
    let result;
    if (!hasAuto) {
      // Nothing to measure -- a grid that never uses auto columns pays nothing at all.
      result = args.columns;
    } else {
      const sampleRows = Math.min(AUTO_SIZE_SAMPLE_ROWS, args.rows);
      // Sampled in the consumer's coordinate space; `sizeColumns` indexes by the same column
      // index it is iterating, so the two must agree -- hence sampling `args.columns`, not the
      // mangled set.
      const sample = sampleRows > 0 ? this.cellsForSelectionSync(args, {
        x: 0,
        y: 0,
        width: args.columns.length,
        height: sampleRows
      }) : [];
      result = sizeColumns(args.columns, this.canvasEl.getContext("2d") ?? undefined, theme, sample ?? [], args.getCellRenderer, {
        minColumnWidth: args.minColumnWidth,
        maxColumnWidth: args.maxColumnWidth,
        removeOutliers: true
      });
    }

    // N1: distribute leftover width to columns declaring `grow`. Runs for fixed-width columns
    // too -- `grow` and `width` are orthogonal -- which is why it sits outside the `hasAuto`
    // branch above. Returns `result` by identity when no column grows, so the blit path's
    // per-column identity comparison is unaffected for the overwhelmingly common case.
    result = applyColumnGrow(result, this.width);
    this.autoSizeCache = {
      columns: args.columns,
      theme,
      getCellRenderer: args.getCellRenderer,
      rows: args.rows,
      minColumnWidth: args.minColumnWidth,
      maxColumnWidth: args.maxColumnWidth,
      width: this.width,
      result
    };
    return result;
  }

  // 9g: the `scaleToRem` result, memoized on everything it is computed from. **Load-bearing**:
  // the scaled `theme` object is identity-compared by `mergedThemeCache` and, beyond it, by
  // `computeCanBlit` -- and `resolveArgs` runs several times per draw, so an unmemoized scale
  // would hand out a fresh theme object every call and silently kill the scroll blit fast path.
  // With `scaleToRem` off, `remAdjustDimensions` returns its input by identity and this cache
  // never even gets consulted.
  remAdjustCache;

  // Measured lazily and refreshed on `scheduleFullRedraw` -- see `GridHostArgs.scaleToRem` for
  // why this port does not observe the root font size continuously the way source does.
  remSize;
  remAdjust(dimensions, scaleToRem) {
    if (!scaleToRem) return dimensions;
    const remSize = this.remSize ??= measureRemSize();
    const cached = this.remAdjustCache;
    if (cached !== undefined && cached.remSize === remSize && dimensionsAreEqual(cached.src, dimensions)) {
      return cached.value;
    }
    const value = remAdjustDimensions(dimensions, true, remSize);
    this.remAdjustCache = {
      src: dimensions,
      remSize,
      value
    };
    return value;
  }

  // 4.1: the row-grouping transform, memoized on everything it is computed from.
  //
  // **Load-bearing, for the usual reason.** Both `rowHeight` and `getRowThemeOverride` are
  // identity-compared by `computeCanBlit` (`data-grid-render.blit.ts:241` and
  // `dimensionsAreEqual`), and `resolveArgs` runs several times per draw. Rebuilding these
  // wrappers per call would hand out fresh closures every time and silently disable the scroll
  // blit fast path -- no error, no visual difference. It would also defeat `remAdjustCache`, which
  // keys on `rowHeight` by identity.
  //
  // Flattening the group tree is itself worth memoizing: it is O(groups) and every lookup below
  // walks the result.
  rowGroupingCache;
  resolvedRowGrouping(rowGrouping, rows, rowHeightIn, getRowThemeOverrideIn) {
    const cached = this.rowGroupingCache;
    if (cached !== undefined && cached.rowGrouping === rowGrouping && cached.rows === rows && cached.rowHeightIn === rowHeightIn && cached.getRowThemeOverrideIn === getRowThemeOverrideIn) {
      return cached.value;
    }
    let value;
    if (rowGrouping === undefined) {
      value = {
        flattened: undefined,
        rows,
        rowHeight: rowHeightIn,
        rowNumberMapper: undefined,
        // Source calls an ungrouped `getRowThemeOverride` as `(row, row, row)`
        // (`row-grouping.ts:302`), so the two extra arguments are the row index rather than
        // `undefined`. Wrapping costs one call frame per themed row per draw and is memoized
        // here, which is what keeps its identity stable.
        getRowThemeOverride: getRowThemeOverrideIn === undefined ? undefined : row => getRowThemeOverrideIn(row, row, row)
      };
    } else {
      const flattened = flattenRowGroups(rowGrouping, rows);
      value = {
        flattened,
        rows: effectiveRowCount(flattened, rows),
        rowHeight: makeRowHeight(flattened, rowGrouping, rowHeightIn),
        rowNumberMapper: makeRowNumberMapper(flattened),
        getRowThemeOverride: makeRowThemeOverride(flattened, rowGrouping, getRowThemeOverrideIn)
      };
    }
    this.rowGroupingCache = {
      rowGrouping,
      rows,
      rowHeightIn,
      getRowThemeOverrideIn,
      value
    };
    return value;
  }
  resolveArgs() {
    const args = this.getArgsFn();
    const baseHeaderHeight = args.headerHeight ?? DEFAULT_HEADER_HEIGHT;
    // Row grouping runs *before* the rem adjuster, as source orders them
    // (`data-editor.tsx:930-947`): the adjuster scales whatever `rowHeight` function it is
    // handed, so `rowGrouping.height` gets `scaleToRem` applied through the wrapper rather than
    // needing its own case.
    const grouping = this.resolvedRowGrouping(args.rowGrouping, args.rows, args.rowHeight ?? DEFAULT_ROW_HEIGHT, args.getRowThemeOverride);
    const {
      rowHeight,
      headerHeight,
      groupHeaderHeight,
      theme,
      overscrollX,
      overscrollY
    } = this.remAdjust({
      rowHeight: grouping.rowHeight,
      headerHeight: baseHeaderHeight,
      groupHeaderHeight: args.groupHeaderHeight ?? baseHeaderHeight,
      theme: args.theme,
      overscrollX: args.overscrollX,
      overscrollY: args.overscrollY
    }, args.scaleToRem === true);
    const rowMarkers = args.rowMarkers ?? "none";
    const hasRowMarkers = rowMarkers !== "none";
    // 4.6: refreshed on every resolve, which is what makes `this.selection` see a controlled
    // value the moment the consumer hands one back. Cached on the instance because the getter
    // that reads it is on hot paths and this method allocates.
    const controlledSelection = args.selection === undefined ? undefined : asConsumerSelection(args.selection);
    this.controlledSelection = controlledSelection;
    return {
      columns: args.columns,
      getCellContent: args.getCellContent,
      // Post-grouping, as source does it (`data-editor.tsx:931`): from here down, `rows` means
      // "rows the grid lays out", so selection, hit testing and scrolling all agree with what
      // is on screen. With `@rowGrouping` unset this is `args.rows` unchanged.
      //
      // Note `rowMarkerWidth` below deliberately still sizes off the raw `args.rows` — it is a
      // width bucket for the widest number the marker column will ever show, and that number
      // comes from the ungrouped content space.
      rows: grouping.rows,
      rowHeight,
      headerHeight,
      groupHeaderHeight,
      theme,
      freezeColumns: args.freezeColumns ?? 0,
      getCellRenderer: args.getCellRenderer,
      verticalBorder: args.verticalBorder ?? ALWAYS_VERTICAL_BORDER,
      resizeIndicator: args.resizeIndicator ?? "none",
      hyperWrapping: args.hyperWrapping ?? false,
      getGroupDetails: this.resolvedGroupDetails(args.getGroupDetails, args.onGroupHeaderRenamed),
      overscrollX,
      overscrollY,
      // Source defaults both to `true` (`data-grid.tsx:362-363`), so the shadows are opt-*out*.
      fixedShadowX: args.fixedShadowX !== false,
      fixedShadowY: args.fixedShadowY !== false,
      // Source's `experimental?.disableMinimumCellWidth === true ? 1 : 10`
      // (`data-grid.tsx:762`), which had been the hardcoded `10` in the `DrawGridArg` build.
      minimumCellWidth: args.disableMinimumCellWidth === true ? 1 : 10,
      // The derived value stays the default; the arg only overrides it. `browserIsSafari` is
      // lazy, so this still costs one userAgent read for the process, not one per draw.
      renderStrategy: args.renderStrategy ?? (browserIsSafari.value ? "double-buffer" : "single-buffer"),
      // Each flag is `&&`-ed with its own browser, exactly as source does
      // (`data-grid.tsx:437-438`) -- switching on Firefox rescaling in Chrome must do nothing.
      //
      // `chromium` is this port's addition (see `enableChromeRescaling`); it is last so the
      // two upstream flags keep their exact precedence. The browser predicates are mutually
      // exclusive anyway -- `browserIsChromium` excludes Firefox, and `browserIsSafari`
      // excludes Chrome -- so the order only matters if a consumer sets several flags at once.
      rescaleWhileScrolling: args.enableFirefoxRescaling === true && browserIsFirefox.value ? "firefox" : args.enableSafariRescaling === true && browserIsSafari.value ? "safari" : args.enableChromeRescaling === true && browserIsChromium.value ? "chromium" : undefined,
      strictVisibleRegion: args.strictVisibleRegion === true,
      rightElement: args.rightElement,
      rightElementSticky: args.rightElementSticky === true,
      rightElementFill: args.rightElementFill === true,
      paddingRight: args.paddingRight ?? 0,
      paddingBottom: args.paddingBottom ?? 0,
      rowMarkers,
      rowMarkerWidth: args.rowMarkerWidth ?? rowMarkerWidthDefault(args.rows),
      rowMarkerStartIndex: args.rowMarkerStartIndex ?? 1,
      rowMarkerTheme: args.rowMarkerTheme,
      hasRowMarkers,
      rowMarkerOffset: hasRowMarkers ? 1 : 0,
      rowSelect: args.rowSelect ?? "multi",
      columnSelect: args.columnSelect ?? "multi",
      rangeSelect: args.rangeSelect ?? "rect",
      rangeSelectionColumnSpanning: args.rangeSelectionColumnSpanning ?? true,
      rangeSelectionBlending: args.rangeSelectionBlending ?? DEFAULT_SELECTION_BLENDING,
      columnSelectionBlending: args.columnSelectionBlending ?? DEFAULT_SELECTION_BLENDING,
      rowSelectionBlending: args.rowSelectionBlending ?? DEFAULT_SELECTION_BLENDING,
      rowSelectionMode: args.rowSelectionMode ?? DEFAULT_SELECTION_MODE,
      columnSelectionMode: args.columnSelectionMode ?? DEFAULT_SELECTION_MODE,
      // 4.6. Branded here, at the boundary, because this is one of the three places a
      // consumer-space selection is minted -- see `-private/selection-space.ts`.
      selection: controlledSelection,
      onSelectionCleared: args.onSelectionCleared,
      onSelectionChanged: args.onSelectionChanged,
      onHeaderMenuClick: args.onHeaderMenuClick,
      onHeaderIndicatorClick: args.onHeaderIndicatorClick,
      onCellsEdited: args.onCellsEdited,
      onColumnResizeStart: args.onColumnResizeStart,
      onColumnResize: args.onColumnResize,
      onColumnResizeEnd: args.onColumnResizeEnd,
      onColumnProposeMove: args.onColumnProposeMove,
      onColumnMoved: args.onColumnMoved,
      onRowMoved: args.onRowMoved,
      fillHandle: args.fillHandle === true,
      allowedFillDirections: args.allowedFillDirections ?? "orthogonal",
      onFillPattern: args.onFillPattern,
      showTrailingBlankRow: args.showTrailingBlankRow === true,
      trailingRowOptions: args.trailingRowOptions,
      onRowAppended: args.onRowAppended,
      getRowThemeOverride: grouping.getRowThemeOverride,
      rowGrouping: args.rowGrouping,
      flattenedRowGroups: grouping.flattened,
      rowNumberMapper: grouping.rowNumberMapper,
      onVisibleRegionChanged: args.onVisibleRegionChanged,
      getCellsForSelection: args.getCellsForSelection,
      drawCell: args.drawCell,
      drawHeader: args.drawHeader,
      prelightCells: args.prelightCells,
      highlightRegions: args.highlightRegions,
      showSearch: args.showSearch,
      searchValue: args.searchValue,
      onSearchValueChange: args.onSearchValueChange,
      onSearchClose: args.onSearchClose,
      searchResults: args.searchResults,
      onSearchResultsChanged: args.onSearchResultsChanged,
      onSearchStateChange: args.onSearchStateChange,
      minColumnWidth: args.minColumnWidth ?? 50,
      maxColumnWidth: args.maxColumnWidth ?? 500,
      onCellContextMenu: args.onCellContextMenu,
      onHeaderContextMenu: args.onHeaderContextMenu,
      onGroupHeaderContextMenu: args.onGroupHeaderContextMenu,
      onItemHovered: args.onItemHovered,
      validateCell: args.validateCell,
      coercePasteValue: args.coercePasteValue,
      onPaste: args.onPaste,
      copyHeaders: args.copyHeaders === true,
      onDelete: args.onDelete,
      onCellClicked: args.onCellClicked,
      onHeaderClicked: args.onHeaderClicked,
      onGroupHeaderClicked: args.onGroupHeaderClicked,
      onGroupHeaderRenamed: args.onGroupHeaderRenamed,
      keybindings: args.keybindings,
      isDraggable: args.isDraggable,
      onDragStart: args.onDragStart,
      onDragOverCell: args.onDragOverCell,
      onDragLeave: args.onDragLeave,
      onDrop: args.onDrop,
      onCellActivated: args.onCellActivated,
      onFinishedEditing: args.onFinishedEditing,
      onColumnAppended: args.onColumnAppended,
      cellActivationBehavior: args.cellActivationBehavior ?? "second-click",
      editOnType: args.editOnType ?? true,
      trapFocus: args.trapFocus === true,
      drawFocusRing: args.drawFocusRing ?? true,
      scrollOffsetX: args.scrollOffsetX,
      scrollOffsetY: args.scrollOffsetY
    };
  }

  // --- Phase 6: theming ------------------------------------------------------------------------
  // The global theme: base theme + the consumer's `@theme` overlay. This is what the render
  // engine gets as `DrawGridArg.theme` (it applies column/row/cell overrides itself, per cell,
  // in `render/data-grid-render.cells.ts`) and what `makeCSSStyle` is stamped from on the root
  // element -- mirrors source's `mergedTheme` (`data-editor.tsx:1093`) and its use at `:4215`.
  //
  // **The memoization here is load-bearing, not a micro-optimization.** `mergeAndRealizeTheme`
  // returns a brand-new object on every call, and `computeCanBlit`
  // (`render/data-grid-render.blit.ts:238`) compares `current.theme !== last.theme` by *identity*
  // -- so recomputing it per draw made that check fail every single frame and silently disabled
  // the scroll blit fast path entirely. Source avoids this because its `mergedTheme` is a
  // `React.useMemo(..., [theme])`; this cache is the direct equivalent, keyed on the consumer's
  // `@theme` object identity exactly like source's dependency array.
  // Phase 7b: column grouping. Derived exactly as source does it -- `enableGroups =
  // columns.some(c => c.group !== undefined)` (`data-editor.tsx:1131-1133`), i.e. grouping turns
  // itself on purely by a consumer setting `group` on any column; there is no separate opt-in
  // flag in source and this port doesn't invent one. Memoized on `args.columns` identity to
  // mirror source's `React.useMemo([columns])`, since this is consulted from ~10 call sites per
  // frame (draw, scroll, hover, hit-test, scroll-into-view).
  //
  // Consequence worth knowing: when NO column carries a `group`, this returns `false` and the
  // effective group header height is 0 everywhere -- byte-identical to the pre-Phase-7b hardcoded
  // behavior, so every existing consumer/demo is unaffected by grouping landing.
  enableGroupsCache;
  enableGroups(args) {
    const cached = this.enableGroupsCache;
    if (cached !== undefined && cached.columns === args.columns) return cached.value;
    const value = args.columns.some(c => c.group !== undefined);
    this.enableGroupsCache = {
      columns: args.columns,
      value
    };
    return value;
  }

  // 4.2: the consumer's `@getGroupDetails`, wrapped so every reader gets a *total* function --
  // source's `mangledGetGroupDetails` (`data-editor.tsx:1401-1425`), which likewise fills in
  // `{ name: group }` for a group the consumer says nothing about and appends the "Rename" action
  // when `@onGroupHeaderRenamed` is set.
  //
  // Memoized on the consumer callback's identity for the reason spelled out on
  // `DEFAULT_GROUP_DETAILS`: this value ends up in `DrawGridArg`, and this port keeps every field
  // of that reference-stable rather than reasoning case-by-case about which ones `computeCanBlit`
  // compares today. A consumer who passes a fresh arrow per render defeats the cache but breaks
  // nothing -- the `GridHostArgs` doc comment asks for a stable one.
  groupDetailsCache;
  resolvedGroupDetails(src, onGroupHeaderRenamed) {
    const canRename = onGroupHeaderRenamed !== undefined;
    // The fast path now needs *both* halves absent: with renaming on, even a grid that passes no
    // `@getGroupDetails` has an action to inject.
    if (src === undefined && !canRename) return DEFAULT_GROUP_DETAILS;
    const cached = this.groupDetailsCache;
    if (cached !== undefined && cached.src === src && cached.canRename === canRename) return cached.value;
    // Read through `this` rather than captured, so toggling the callback at runtime does not
    // strand a stale reference in a memoized closure.
    const onRename = canRename ? (groupKey, displayName, bounds) => this.openGroupRename(groupKey, displayName, bounds) : undefined;
    const value = groupName => {
      const result = src?.(groupName);
      // `name` is the only field the render path dereferences unconditionally
      // (`data-grid-render.header.ts:187`), so it is the only one worth defaulting. The
      // spread costs one small object per group per frame, the same order as
      // `DEFAULT_GROUP_DETAILS` already allocated.
      const details = result === undefined ? {
        name: groupName
      } : {
        ...result,
        name: result.name ?? groupName
      };
      return appendRenameAction(details, groupName, onRename);
    };
    this.groupDetailsCache = {
      src,
      canRename,
      value
    };
    return value;
  }

  // The *effective* group header height, mirroring source's
  // `groupHeaderHeight={enableGroups ? groupHeaderHeight : 0}` (`data-editor.tsx:4276`).
  //
  // This must be used at EVERY coordinate-math call site, not just `DrawGridArg`. The reason is a
  // real trap documented since Phase 2a: `getRowIndexForY` computes `totalHeaderHeight =
  // headerHeight + groupHeaderHeight` unconditionally -- it is NOT gated by the `hasGroups`
  // parameter -- so passing a real `groupHeaderHeight` alongside `enableGroups: false` would
  // silently reserve dead header space and break row hit-testing.
  groupHeaderHeight(args) {
    return this.enableGroups(args) ? args.groupHeaderHeight : 0;
  }

  // Total header height (group header row + column header row). Source keeps the same derived
  // value (`data-editor.tsx:1135`).
  totalHeaderHeight(args) {
    return args.headerHeight + this.groupHeaderHeight(args);
  }
  mergedThemeCache;
  mergedTheme(args) {
    const cached = this.mergedThemeCache;
    if (cached !== undefined && cached.src === args.theme) return cached.value;
    const value = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);
    this.mergedThemeCache = {
      src: args.theme,
      value
    };
    return value;
  }

  // The fully-merged theme for one specific cell, in the exact order the render engine uses
  // (`render/data-grid-render.cells.ts:160-163,264-272`): global -> column -> row -> cell.
  // Source does the same for its overlay editor (`data-editor.tsx`'s `setOverlaySimple`, which
  // merges `mergedTheme, groupTheme, colTheme, rowTheme, content.themeOverride`) and for
  // `themeForCell` (`:1821-1830`). Group themes stay omitted even now that column grouping is
  // live (Phase 7b): source's `groupTheme` comes from `getGroupDetails(group)?.overrideTheme`,
  // and this port's `DEFAULT_GROUP_DETAILS` returns `{ name }` with no `overrideTheme`, so there
  // is never a group theme to merge. If a future phase exposes a real `getGroupDetails` arg with
  // theme overrides, this merge chain is where it has to be added.
  //
  // `mangledCol` is in the render engine's column space (i.e. includes the row-marker column when
  // one exists), matching `computeCellRect`/`computeMangledLayout`.
  themeForCell(args, cell, mangledCol, row) {
    const column = this.mangledColumns(args)[mangledCol];
    return mergeAndRealizeTheme(this.mergedTheme(args), column?.themeOverride, args.getRowThemeOverride?.(row), cell.themeOverride);
  }

  // Last theme object stamped onto `root` as `--gdg-*` variables. Guards the ~37 `setProperty`
  // calls behind an identity check so they don't run on every scroll frame -- `mergedTheme` is
  // memoized above, so this is stable until the consumer's `@theme` actually changes.
  lastRootStampedTheme;

  // Stamps `makeCSSStyle(theme)`'s `--gdg-*` custom properties onto an element. Both of source's
  // application sites go through this (the grid root, and each overlay-editor container).
  applyThemeCssVariables(el, theme) {
    const vars = makeCSSStyle(theme);
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }
  }

  // Phase 4d: total row count including the synthetic trailing blank row, when enabled. Used for
  // every layout/hit-testing/scroll computation that must treat `row === args.rows` as a real,
  // in-bounds row -- `args.rows` itself keeps meaning "real data row count" everywhere else
  // (select-all, the header select-all toggle, row-marker sizing, copy/cut/paste region clamping)
  // since the trailing row is never real data and must never be included in those.
  effectiveRows(args) {
    return args.rows + (args.showTrailingBlankRow ? 1 : 0);
  }

  // --- row-marker column mangling (Phase 3a) ----------------------------------------------------
  // When `rowMarkers !== "none"`, a synthetic column is prepended ahead of the caller's own
  // columns, and every real column index seen by the render engine / coordinate math is offset by
  // `rowMarkerOffset` (0 or 1). Mirrors source's `mangledCols`/`getMangledCellContent`
  // (`data-editor.tsx:1141-1169,1309-1382`) collapsed into this controller (source spreads it
  // across `DataEditor`).
  //
  // Known simplification: the marker column's *body* cells (the actual per-row checkbox) have no
  // cell renderer wired up -- `cells/marker-cell.tsx` is Phase 4 (cell-type registry) territory,
  // not this phase, so marker cells draw as empty until then. The header checkbox (select-all)
  // DOES render correctly today because header-marker drawing is already Phase-1-ported render
  // logic (`render/data-grid-render.header.ts:433-455`), driven purely by
  // `InnerGridColumn.rowMarker`/`rowMarkerChecked` -- only the body cells are a known gap.
  mangledColumns(args) {
    return this.computeMangledLayout(args).mangledColumns;
  }

  // Phase 9k: the marker column's inputs, as three primitives the layout cache can compare.
  // Rebuilt per call (it is cheap) precisely so the cache -- not this method -- owns identity.
  rowMarkerSpec(args) {
    if (!args.hasRowMarkers) return undefined;
    const numSelectedRows = this.selection.rows.length;
    return {
      width: args.rowMarkerWidth,
      checked: numSelectedRows === 0 ? false : numSelectedRows === args.rows ? true : undefined,
      headerDisabled: args.rowSelect !== "multi",
      themeOverride: args.rowMarkerTheme
    };
  }

  // Phase 4d: also mangles in the synthetic trailing blank row (`showTrailingBlankRow`) when
  // enabled -- mirrors source's `getMangledCellContent`'s `isTrailing` branches
  // (`data-editor.tsx:1309-1382`, cited in full in PORTING-NOTES.md's Phase 4 research section).
  // The row-marker column's trailing-row cell is a plain `loadingCell` (kind `Loading`,
  // `allowOverlay: false`) in source -- no checkbox on the append-row affordance -- and every
  // other column's trailing-row cell is the `new-row-cell` renderer's `NewRowCell`. 9g layers
  // `trailingRowOptions` on exactly as source does: the grid-wide `hint` applies to the first real
  // (non-marker) column only, a column's own `trailingRowOptions` overrides `hint`/`addIcon` for
  // itself, and `disabled: true` blanks that column's trailing cell entirely.
  //
  // Phase 6: **the returned closure must be identity-stable across draws.** `computeCanBlit`
  // (`render/data-grid-render.blit.ts:247`) compares `getCellContent` by identity, so rebuilding
  // this wrapper every frame silently disabled the scroll blit fast path whenever row markers or
  // the trailing blank row were enabled. Cached on exactly the values the closure captures; the
  // things it reads *lazily* (`this.selection`, for the marker checkbox state) are deliberately
  // not part of the key -- `computeCanBlit` already compares `selection` separately.
  mangledCellContentCache;

  // Row-reorder live preview (Phase 9h). While a row drag is active, the grid shows the rows as
  // they *would* be after the drop by remapping which source row each screen row reads from --
  // nothing is committed until mouseup. Port of `data-grid-dnd.tsx`'s `getMangledCellContent`.
  //
  // Read lazily inside the cell-content closure rather than baked into it, so the closure's
  // identity stays stable across the drag (`getCellContent` is identity-compared by
  // `computeCanBlit`).
  previewRowIndex(screenRow) {
    const ds = this.dragRowState;
    if (ds === undefined || !ds.active) return screenRow;
    return previewRowOrder(screenRow, ds.srcRow, ds.dropRow);
  }
  mangledGetCellContent(args) {
    // `strictVisibleRegion` joins the two conditions that make a wrapper necessary at all: with
    // it on there is a check to run even when the consumer's own space and the grid's coincide.
    if (!args.hasRowMarkers && !args.showTrailingBlankRow && !args.strictVisibleRegion) {
      return args.getCellContent;
    }
    const canReorderRows = args.onRowMoved !== undefined;
    const cached = this.mangledCellContentCache;
    if (cached !== undefined && cached.getCellContent === args.getCellContent && cached.hasRowMarkers === args.hasRowMarkers && cached.showTrailingBlankRow === args.showTrailingBlankRow && cached.rows === args.rows && cached.rowMarkers === args.rowMarkers && cached.rowMarkerOffset === args.rowMarkerOffset && cached.canReorderRows === canReorderRows && cached.columns === args.columns && cached.trailingRowOptions === args.trailingRowOptions && cached.rowMarkerStartIndex === args.rowMarkerStartIndex && cached.strictVisibleRegion === args.strictVisibleRegion &&
    // 4.1: identity is enough because `resolvedRowGrouping` memoizes the mapper, so a new
    // one appears exactly when the groups or the row count actually changed. Without this a
    // collapse would keep serving marker numbers from the pre-collapse layout.
    cached.rowNumberMapper === args.rowNumberMapper && cached.freezeColumns === args.freezeColumns) {
      return cached.value;
    }
    const {
      rowMarkerOffset
    } = args;
    const value = ([col, screenRow]) => {
      // Phase 9h: row-reorder preview, applied before everything else so the marker number,
      // the trailing-row check and the consumer read all agree on which row this is. Matches
      // source's layering (`DataGridDnd` wraps `DataEditor`'s mangled content, so its remap is
      // the outermost one).
      const row = this.previewRowIndex(screenRow);
      const isTrailing = args.showTrailingBlankRow && row === args.rows;
      if (args.hasRowMarkers && col === 0) {
        if (isTrailing) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false
          };
        }
        // 4.1: with row grouping on, a group-header row has no marker at all -- source
        // returns a `Loading` cell for it (`data-editor.tsx:1317-1319`), which draws as
        // empty. This is also what keeps the visible numbering running 1, 2, 3 straight
        // through a header instead of burning a number on each one.
        const markerRow = args.rowNumberMapper === undefined ? row : args.rowNumberMapper(row);
        if (markerRow === undefined) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false
          };
        }
        const markerKind = args.rowMarkers === "clickable-number" ? "number" : args.rowMarkers === "none" ? "checkbox" // unreachable (hasRowMarkers guards this), satisfies the type
        : args.rowMarkers;
        return {
          kind: InnerGridCellKind.Marker,
          allowOverlay: false,
          checkboxStyle: DEFAULT_ROW_MARKER_CHECKBOX_STYLE,
          // Deliberately the raw grid row, not `markerRow`: selection is tracked in grid
          // row space everywhere else, so the checkbox must ask in the same space.
          checked: this.selection.rows.hasIndex(row),
          markerKind,
          // 9g: `rowMarkerStartIndex` (default 1) instead of the hardcoded `+ 1`.
          row: args.rowMarkerStartIndex + markerRow,
          // Phase 9h: the marker cell's drag-handle dots, which are both the affordance
          // for row reorder and its enable flag -- source sets exactly
          // `drawHandle: onRowMoved !== undefined` (`data-editor.tsx:1338`).
          drawHandle: canReorderRows,
          cursor: args.rowMarkers === "clickable-number" ? "pointer" : undefined
        };
      }
      if (isTrailing) {
        const columnOptions = args.columns[col - rowMarkerOffset]?.trailingRowOptions;
        if (columnOptions?.disabled === true) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false
          };
        }
        // Divergence, deliberate: source's default hint is `""`, this port's is `"Add row"`
        // -- the string it has shown since Phase 4d, kept so that adding `trailingRowOptions`
        // support does not silently blank an affordance every existing consumer already has.
        // Pass `hint: ""` for source's behaviour.
        const gridHint = col === rowMarkerOffset ? args.trailingRowOptions?.hint ?? "Add row" : "";
        return {
          kind: InnerGridCellKind.NewRow,
          hint: columnOptions?.hint ?? gridHint,
          icon: columnOptions?.addIcon ?? args.trailingRowOptions?.addIcon,
          allowOverlay: false
        };
      }
      const outerCol = col - rowMarkerOffset;
      // 4.5: `experimental.strict`, in source's position -- the last thing checked before the
      // consumer's callback is reached, so the marker and trailing-row cells above are never
      // affected by it.
      if (args.strictVisibleRegion) {
        const region = this.lastVisibleRegion ?? INITIAL_VISIBLE_REGION;
        const selected = this.selection.current?.cell;
        if (isOutsideStrictRegion(outerCol, row, region, args.rows, selected, args.freezeColumns)) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false
          };
        }
      }
      return args.getCellContent([outerCol, row]);
    };
    this.mangledCellContentCache = {
      getCellContent: args.getCellContent,
      hasRowMarkers: args.hasRowMarkers,
      showTrailingBlankRow: args.showTrailingBlankRow,
      rows: args.rows,
      rowMarkers: args.rowMarkers,
      rowMarkerOffset: args.rowMarkerOffset,
      canReorderRows,
      columns: args.columns,
      trailingRowOptions: args.trailingRowOptions,
      rowMarkerStartIndex: args.rowMarkerStartIndex,
      strictVisibleRegion: args.strictVisibleRegion,
      rowNumberMapper: args.rowNumberMapper,
      freezeColumns: args.freezeColumns,
      value
    };
    return value;
  }

  // Phase 9k. Was: rebuild the marker column, the mangled array and `mapColumns`' output on
  // **every** call -- and this runs on every draw, scroll, hover, hit-test and scroll-into-view.
  // `computeCanBlit` compares `mappedColumns` by reference first and only falls back to a
  // per-column `deepEqual` when the reference differs; above 100 columns it gives up and refuses
  // to blit at all. See `mangled-layout.ts` for the cache and its key, and
  // `mangled-layout.test.ts` for the identity contract, which is the part no other check catches.
  mangledLayoutCache = new MangledLayoutCache();
  computeMangledLayout(args) {
    return this.mangledLayoutCache.get(this.sizedColumns(args), this.rowMarkerSpec(args), args.freezeColumns);
  }

  // The full option bag the `selection-behavior.ts` writers take. Rebuilt per call rather than
  // memoized on purpose: this value never reaches `DrawGridArg`, so it is not one of
  // `computeCanBlit`'s identity-compared fields, and the writers read it and discard it.
  selectionOptions(args) {
    return {
      rangeBehavior: args.rangeSelectionBlending,
      columnBehavior: args.columnSelectionBlending,
      rowBehavior: args.rowSelectionBlending,
      rangeSelect: args.rangeSelect,
      rangeSelectionColumnSpanning: args.rangeSelectionColumnSpanning
    };
  }

  /**
   * `this.selection` in the render engine's / hit-testing column space.
   *
   * Memoized on `this.selection`'s identity, and that is load-bearing rather than a micro-opt:
   * `computeCanBlit` identity-compares `DrawGridArg.selection`, so shifting afresh per draw would
   * silently disable the scroll blit fast path -- the same defect class Phase 6 fixed three
   * instances of. With `rowMarkers: "none"` the shift is the identity function and returns the
   * very same object, so a marker-less grid is byte-identical to the pre-9k behaviour.
   */
  mangledSelection(args) {
    return this.mangledSelectionCache.get(this.selection, args.rowMarkerOffset);
  }

  // Central selection-mutation entry point -- every writer call above routes its result through
  // here. Notifies `onSelectionChanged` and redraws. Uses a full redraw rather than a
  // damage-restricted one for simplicity (selection changes can touch an unbounded set of cells --
  // e.g. select-all -- so computing a precise damage set isn't obviously cheaper); revisit if
  // selection-change redraw cost becomes a real perf problem.
  //
  // `newSelection` is in the CONSUMER's column space, which is also exactly what
  // `onSelectionChanged` receives -- see the `selection` field's comment. Callers holding a
  // mangled selection use `applyMangledSelection` below.
  //
  // Note which direction the brand protects: `MangledSelection` is an intersection, so it *is*
  // assignable here. What the compiler rejects is the opposite and far more likely mistake --
  // handing a consumer-space selection to something that needs mangled columns (`DrawGridArg`,
  // `computeCellRect`, `selectedRegion`, the fill/drag state). Every mangled value in this file
  // originates from `mangledSelection()` and stays branded through the space-preserving writers
  // in `selection-behavior.ts`, so those sites cannot be fed an unconverted value.
  applySelection(newSelection) {
    const args = this.resolveArgs();
    // Controlled mode (4.6): the consumer owns the state, so this is a *request*, not a write.
    // Nothing changes on screen until they hand a new `@selection` back — which is the whole
    // point, since it is what lets them veto or adjust a selection. Source draws the same line
    // (`data-editor.tsx:1006-1013`): with a change handler it calls out and skips `setState`.
    if (args.selection === undefined) {
      this.internalSelection = newSelection;
    }
    args.onSelectionChanged?.(newSelection);
    this.scheduleFullRedraw();
  }

  /** `applySelection` for a selection computed in the render engine's column space. The single
   *  conversion back out to consumer space. */
  applyMangledSelection(args, newSelection) {
    this.applySelection(unmangleSelection(newSelection, args.rowMarkerOffset));
  }
  clearSelection() {
    this.applySelection(EMPTY_SELECTION);
    this.lastSelectedRow = undefined;
    this.lastSelectedCol = undefined;
  }

  // --- public API ------------------------------------------------------------------------------

  /** Call after any `getArgs()`-relevant input changes (columns, rows, sizes, theme, etc). */
  scheduleFullRedraw() {
    if (this.destroyed) return;
    // 9g: the root font size is re-read here rather than observed continuously -- see
    // `GridHostArgs.scaleToRem`. Dropping the cached value is enough; `resolveArgs` re-measures
    // lazily on the next scaled call and skips the work entirely when `scaleToRem` is off.
    this.remSize = undefined;
    const args = this.resolveArgs();
    this.rebuildScrollContent(args);
    // 9g: `scrollOffsetX`/`scrollOffsetY`. Applied once per *change* of the value, exactly like
    // source's layout effect keyed on it -- which is what makes them a "scroll here" instruction
    // rather than a scroll lock. Must come after `rebuildScrollContent`, since scrolling to an
    // offset the content is not yet tall/wide enough for is silently clamped to 0.
    this.applyScrollOffsets(args);
    this.sizeCanvases(args);
    // Keep the scroll offsets consistent with the layout that was just rebuilt. Load-bearing on
    // the very first draw (see `syncScrollOffsets` -- `cellXOffset` rests at `freezeColumns`,
    // not 0) and after any arg change that alters column widths, `freezeColumns` or the
    // row-marker column, all of which move where a given scroll position lands.
    this.syncScrollOffsets(args);
    // Force a real repaint rather than allowing the blit fast path to short-circuit it.
    //
    // `drawGrid` early-returns and paints *nothing* when `computeCanBlit(current, last)` is
    // `true` and the scroll offsets are unchanged (`render/data-grid-render.ts:214-222`).
    // `computeCanBlit` decides that by identity-comparing a fixed list of ~18 `DrawGridArg`
    // fields -- which means "nothing changed" is only as trustworthy as that list is
    // exhaustive. Several real `GridHostArgs` inputs map to no compared field at all
    // (`getCellRenderer` is the clearest), so an arg change that genuinely needs a repaint
    // could otherwise be silently swallowed here.
    //
    // Calling this method *is* the caller asserting "an input you can't see changed", so the
    // safe reading is always to repaint. Dropping `lastFullDrawArg` makes `computeCanBlit`
    // return `false` on its own `last === undefined` guard, without touching the blit logic.
    //
    // **This does not cost the scroll blit optimization** -- `onScroll` calls `runDraw`
    // directly and never routes through here, so scrolling (the only path where blitting
    // actually matters for performance) keeps its previous-frame reference intact. Arg-change
    // redraws are comparatively rare and semantically want a full repaint anyway.
    //
    // Phase 6; see PORTING-NOTES.md's Phase 6 section for how the blit path came to be live in
    // the first place (it had never engaged before that phase, which is why this hazard could
    // not previously arise).
    this.lastFullDrawArg = undefined;
    this.runDraw(args, undefined);
  }

  // 9g. `undefined` means "never applied yet", which is distinct from `0` -- an initial
  // `scrollOffsetY: 0` must still be applied once, and the user must be free to scroll away from
  // it afterwards.
  lastAppliedScrollOffsetX;
  lastAppliedScrollOffsetY;
  applyScrollOffsets(args) {
    const {
      scrollOffsetX,
      scrollOffsetY
    } = args;
    if (scrollOffsetX !== undefined && scrollOffsetX !== this.lastAppliedScrollOffsetX) {
      this.lastAppliedScrollOffsetX = scrollOffsetX;
      this.scrollerEl.scrollLeft = scrollOffsetX;
    }
    if (scrollOffsetY !== undefined && scrollOffsetY !== this.lastAppliedScrollOffsetY) {
      this.lastAppliedScrollOffsetY = scrollOffsetY;
      this.scrollerEl.scrollTop = scrollOffsetY;
    }
  }

  /** Damage-based partial redraw for a known set of changed cells. */
  updateCells(cells) {
    if (this.destroyed) return;
    // `cell` arrives in the consumer's own column space (the same space as `getCellContent`'s
    // `Item`), but the damage set is matched against *mangled* column indices inside the draw
    // loop, so the synthetic row-marker column has to be added back here. Source does exactly
    // this at its own public `updateCells` boundary (`data-editor.tsx:4001-4006`). Without it,
    // every damaged cell lands one column to the left whenever `rowMarkers !== "none"` --
    // silently, since an unmatched damage entry just repaints the wrong cell.
    const {
      rowMarkerOffset
    } = this.resolveArgs();
    this.drawWithDamage(new CellSet(cells.map(c => [c.cell[0] + rowMarkerOffset, c.cell[1]])));
  }

  /** Current selection, in the **consumer's** column space (no row-marker column) -- the same
   *  space `@onSelectionChanged` reports and `@onCellsEdited` speaks. Read-only snapshot --
   *  mutate via user interaction, not directly. */
  getSelection() {
    return this.selection;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Signals any in-flight `getCellsForSelection` thunk that its result is no longer wanted.
    this.cellsForSelectionAbort.abort();
    // A running scan holds a scheduled callback that would otherwise fire against a torn-down
    // grid. Source cancels in an unmount effect for the same reason.
    this.search?.cancel();
    this.search = undefined;
    // 4.5: would otherwise fire a redraw against a torn-down grid ~200ms later.
    window.clearTimeout(this.scrollingStopTimer);
    this.scrollingStopTimer = undefined;

    // Removes its own window listener and its DOM node; a no-op when no rename is open.
    this.closeGroupRename();
    if (this.overlayState !== undefined) {
      this.removeWindowListener("mousedown", this.onOverlayOutsideClick, true);
      this.overlayState.stopStayOnScreen?.();
      this.overlayState.handle.destroy();
      this.overlayState.container.remove();
      this.overlayState = undefined;
    }
    this.scrollerEl.removeEventListener("scroll", this.onScroll);
    this.root.removeEventListener("mousemove", this.onMouseMove);
    this.root.removeEventListener("mousedown", this.onMouseDown);
    this.root.removeEventListener("contextmenu", this.onContextMenu);
    this.root.removeEventListener("focus", this.onFocus);
    this.root.removeEventListener("blur", this.onBlur);
    this.root.removeEventListener("keydown", this.onKeyDown);
    this.root.removeEventListener("dragstart", this.onDragStartExternal);
    this.root.removeEventListener("dragover", this.onDragOverExternal);
    this.root.removeEventListener("dragend", this.onDragEndExternal);
    this.root.removeEventListener("drop", this.onDropExternal);
    this.root.removeEventListener("dragleave", this.onDragLeaveExternal);
    this.removeWindowListener("mouseup", this.onMouseUp);
    this.removeWindowListener("mousemove", this.onWindowMouseMove);
    this.autoscroller.stop();
    window.removeEventListener("copy", this.onCopy);
    window.removeEventListener("cut", this.onCut);
    window.removeEventListener("paste", this.onPaste);
    this.resizeObserver.disconnect();
    this.root.replaceChildren();
    this.bufferAEl.remove();
    this.bufferBEl.remove();
  }

  // --- internal draw plumbing --------------------------------------------------------------------

  drawWithDamage(damage) {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    this.runDraw(args, damage);
  }

  // Mirrors `data-grid.tsx`'s `draw()`: on a normal (non-damage) pass, the previous full-draw arg
  // is handed to `drawGrid` as `lastArg` (this is what enables the blit fast path when only scroll
  // offsets changed) and then replaced by the current one. Damage-driven passes are always drawn
  // against `undefined` as `lastArg` so the damage restriction is honored rather than the "nothing
  // changed" blit shortcut, and they do NOT update `lastFullDrawArg`.
  runDraw(args, damage) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    // Before the `DrawGridArg` is built, because `mangledGetCellContent` consults the stored
    // region when `@strictVisibleRegion` is on. See `updateVisibleRegion`.
    this.updateVisibleRegion(args, mappedColumns, freezeColumns);
    const theme = this.mergedTheme(args);
    // Mirrors source's root-element `style={makeCSSStyle(mergedTheme)}` (`data-editor.tsx:4215`).
    // Done here rather than once at construction so a changed `@theme` restamps the variables;
    // identity-guarded so it's a no-op on ordinary scroll/hover redraws.
    if (this.lastRootStampedTheme !== theme) {
      this.applyThemeCssVariables(this.root, theme);
      this.lastRootStampedTheme = theme;
    }
    this.updateScrollShadows(args, mappedColumns, freezeColumns);
    const current = {
      canvasCtx: this.canvasCtx,
      headerCanvasCtx: this.headerCanvasCtx,
      bufferACtx: this.bufferACtx,
      bufferBCtx: this.bufferBCtx,
      width: this.width,
      height: this.height,
      cellXOffset: this.cellXOffset,
      cellYOffset: this.cellYOffset,
      translateX: Math.round(this.translateX),
      translateY: Math.round(this.translateY),
      mappedColumns,
      enableGroups: this.enableGroups(args),
      freezeColumns,
      dragAndDropState: this.currentDragAndDropState(),
      theme,
      headerHeight: args.headerHeight,
      groupHeaderHeight: this.groupHeaderHeight(args),
      // 9g: `trailingRowOptions.tint`. Source's `disabledRows` memo is exactly this -- the
      // trailing row alone, or nothing (`data-editor.tsx:3960-3966`).
      disabledRows: this.disabledRows(args),
      rowHeight: args.rowHeight,
      // `computeCanBlit` compares this callback by identity. The default is module-scoped;
      // consumers should likewise pass a stable callback when customizing it.
      verticalBorder: args.verticalBorder,
      isResizing: this.resizeState !== undefined,
      resizeCol: this.resizeState?.col,
      isFocused: this.isFocused,
      // 9g. `"no-editor"` suppresses the ring only while an overlay editor is open, exactly
      // as source resolves the same prop (`data-editor.tsx:909`). Not one of
      // `computeCanBlit`'s identity-compared fields, so a per-draw boolean is fine here.
      drawFocus: args.drawFocusRing === "no-editor" ? this.overlayState === undefined : args.drawFocusRing,
      // Mangled, and memoized so its identity is stable across draws (`computeCanBlit`
      // compares this field by reference).
      selection: this.mangledSelection(args),
      // Phase 9h: opt-in, matching source (`fillHandle?: boolean`, no default). Before 9h this
      // was hardcoded to `DEFAULT_FILL_HANDLE`, so the handle was always drawn and dragging it
      // did nothing whatsoever.
      fillHandle: args.fillHandle ? DEFAULT_FILL_HANDLE : false,
      freezeTrailingRows: 0,
      hasAppendRow: args.showTrailingBlankRow,
      hyperWrapping: args.hyperWrapping,
      rows: this.effectiveRows(args),
      getCellContent: this.mangledGetCellContent(args),
      overrideCursor: cursor => {
        this.cursorOverride = cursor;
        this.applyCursor();
      },
      // 4.2: memoized on the consumer callback's identity in `resolvedGroupDetails`, and the
      // module-scoped default when there is none.
      getGroupDetails: args.getGroupDetails,
      getRowThemeOverride: args.getRowThemeOverride,
      // Phase 9: consumer draw hooks. Passed straight through -- `prelightCells` and
      // `highlightRegions` are identity-compared by `computeCanBlit`, so the stability
      // requirement is documented on the `GridHostArgs` fields rather than defended here
      // (the controller has no way to know whether two equal-looking arrays are "the same").
      drawHeaderCallback: args.drawHeader,
      drawCellCallback: args.drawCell,
      prelightCells: this.effectivePrelightCells(args),
      highlightRegions: this.effectiveHighlightRegions(args, theme),
      imageLoader: this.imageLoader,
      lastBlitData: this.lastBlitData,
      damage,
      hoverValues: this.hoverValues,
      hoverInfo: this.hoverInfo,
      spriteManager: this.spriteManager,
      // 4.5: source's `maxDPR` (`data-grid.tsx:761`) -- 1x on Firefox or 2x on Safari *while
      // scrolling*, 5x otherwise. `isScrolling` is only ever true when a rescaling flag is on,
      // so a grid that has not opted in keeps the flat 5x it always had.
      //
      // `chromium` joins Firefox at 1x rather than Safari at 2x, and that is the whole point:
      // at the common `devicePixelRatio` of 2 a 2x cap is a no-op (`min(2, ceil(2))` is 2), so
      // 2x would add an arg that cannot do anything on the displays it was added for.
      maxScaleFactor: this.isScrolling ? args.rescaleWhileScrolling === "firefox" || args.rescaleWhileScrolling === "chromium" ? 1 : 2 : 5,
      touchMode: false,
      renderStrategy: args.renderStrategy,
      enqueue: this.animationQueue.enqueue,
      renderStateProvider: this.renderStateProvider,
      getCellRenderer: args.getCellRenderer,
      minimumCellWidth: args.minimumCellWidth,
      resizeIndicator: args.resizeIndicator
    };
    if (damage === undefined) {
      const last = this.lastFullDrawArg;
      this.lastFullDrawArg = current;
      drawGrid(current, last);
    } else {
      drawGrid(current, undefined);
    }
  }

  // 9g: the tinted trailing row, memoized on the one row index it can contain.
  // `CompactSelection.empty()` is already a singleton, so only the tinted case needs a cache --
  // and it needs one because `fromSingleSelection` allocates, and this runs per draw.
  disabledRowsCache;
  disabledRows(args) {
    if (!args.showTrailingBlankRow || args.trailingRowOptions?.tint !== true) return CompactSelection.empty();
    const row = this.effectiveRows(args) - 1;
    const cached = this.disabledRowsCache;
    if (cached !== undefined && cached.row === row) return cached.value;
    const value = CompactSelection.fromSingleSelection(row);
    this.disabledRowsCache = {
      row,
      value
    };
    return value;
  }

  // --- Phase 9h: fill-handle presentation --------------------------------------------------------

  // The consumer's `highlightRegions` -- translated out of consumer column space into the mangled
  // space the render engine draws in -- plus the in-progress fill region when the fill handle is
  // being dragged. Mirrors source's `highlightRegions` memo (`data-editor.tsx:1240-1300`), minus
  // the selection-range/focus-ring entries source also folds in there: this port draws both of
  // those from `selection` in the ring pass instead.
  //
  // **The row-marker translation was missing until Phase 9h.** `@highlightRegions` landed as a
  // pure passthrough, and no demo had ever switched on row markers *and* a highlight region at the
  // same time, so every region drew one column to the left on any grid with row markers. Source
  // shifts by `rowMarkerOffset` and clamps the width at the same time (a region running off the
  // right edge is dropped, not clipped to zero width); both are ported here now.
  //
  // `highlightRegions` is one of `computeCanBlit`'s identity-compared fields, so both the
  // no-fill/no-marker case (returns the caller's own array unchanged) and the translated case
  // (cached) must be reference-stable. While a fill drag is actually in flight the array does
  // churn per frame, which is fine: the region genuinely changes every frame, and a drag is not a
  // scroll, so the blit path is not what is being protected there.
  highlightRegionsCache;
  effectiveHighlightRegions(args, theme) {
    const fill = this.fillState?.highlight;
    const base = args.highlightRegions;
    // Nothing to translate and nothing to add: hand back the caller's own reference.
    if (fill === undefined && (base === undefined || base.length === 0 || args.rowMarkerOffset === 0)) {
      return base;
    }
    const columnCount = args.columns.length + args.rowMarkerOffset;
    const cached = this.highlightRegionsCache;
    if (cached !== undefined && cached.base === base && cached.theme === theme && cached.rowMarkerOffset === args.rowMarkerOffset && cached.columnCount === columnCount && rectanglesEqual(cached.fill, fill)) {
      return cached.value;
    }
    const regions = [];
    for (const region of base ?? []) {
      const maxWidth = columnCount - region.range.x - args.rowMarkerOffset;
      if (maxWidth <= 0) continue;
      regions.push({
        color: region.color,
        range: {
          ...region.range,
          x: region.range.x + args.rowMarkerOffset,
          width: Math.min(maxWidth, region.range.width)
        },
        style: region.style
      });
    }
    if (fill !== undefined) {
      // Transparent fill + dashed outline, exactly as source styles the fill preview. Already
      // in mangled space -- it comes from the selection, not from the consumer.
      regions.push({
        color: withAlpha(theme.accentColor, 0),
        range: fill,
        style: "dashed"
      });
    }
    const value = regions.length > 0 ? regions : undefined;
    this.highlightRegionsCache = {
      base,
      fill,
      rowMarkerOffset: args.rowMarkerOffset,
      columnCount,
      theme,
      value
    };
    return value;
  }

  // Cursor is decided by two independent inputs: whatever the render engine's `overrideCursor`
  // last reported for the hovered cell, and the fill-handle state. Source computes the same
  // precedence inline in `data-grid.tsx:972-982`; here the two arrive at different times, so both
  // funnel through this one writer.
  applyCursor() {
    const crosshair = this.fillState !== undefined || this.overFillHandle;
    const resizing = this.resizeState !== undefined || this.overResizeEdge;
    this.scrollerEl.style.cursor = crosshair ? "crosshair" : resizing ? "col-resize" : this.cursorOverride ?? "";
  }

  // --- Phase 8: visible-region reporting ---------------------------------------------------------
  //
  // Source computes this in `scrolling-data-grid.tsx`'s `processArgs` (its own scroll handler);
  // this port derives it from the draw's own offsets instead, which covers scroll, resize and arg
  // changes with one call site. The dedupe below is what keeps that cheap: the callback fires only
  // when the visible block genuinely changes, i.e. at most once per crossed row/column boundary,
  // not once per frame.
  //
  // 4.5: this runs **before** the draw, not after, and stores the region whether or not anyone is
  // listening. Both because of `@strictVisibleRegion`, which reads `lastVisibleRegion` from inside
  // the cell-content closure: computed afterwards, the first frame of a strict grid would consult
  // a region that did not exist yet and paint an all-Loading grid with nothing scheduled to
  // correct it. Running first also matches source, where `visibleRegionRef` is updated by the
  // scroll handler and is therefore already current by the time React redraws.

  lastVisibleRegion = undefined;
  updateVisibleRegion(args, mappedColumns, freezeColumns) {
    const region = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
    const last = this.lastVisibleRegion;
    if (last !== undefined && last.x === region.x && last.y === region.y && last.width === region.width && last.height === region.height) {
      return;
    }
    this.lastVisibleRegion = region;
    const onVisibleRegionChanged = args.onVisibleRegionChanged;
    if (onVisibleRegionChanged === undefined) return;

    // Deferred deliberately -- see the doc comment on `GridHostArgs.onVisibleRegionChanged`.
    // A draw can be triggered from inside the Ember modifier's tracking frame, and consumers
    // of this callback overwhelmingly want to *set tracked state* from it (that is how paged
    // loading is driven), which Ember forbids during a render pass.
    queueMicrotask(() => {
      if (this.destroyed) return;
      onVisibleRegionChanged(region);
    });
  }

  // The visible block, in the consumer's own coordinate space (row-marker column excluded, real
  // data rows only). `width`/`height` are counts; the last row/column in the range may be only
  // partially visible, matching source's own `cellRight`/`cellBottom` semantics.
  //
  // Frozen columns are deliberately NOT part of the reported range: they are permanently visible
  // and always occupy `[0, freezeColumns)` in the consumer's space, so folding them into `x`
  // would make the rect discontiguous the moment the grid is scrolled horizontally.
  computeVisibleRegion(args, mappedColumns, freezeColumns) {
    // 4.3: `paddingRight` narrows the width the region is computed against, matching source
    // (`infinite-scroller.tsx:280`, `width: cWidth - paddingRight`). Without it a sticky right
    // element sits *over* the last column or two and the grid still reports them as visible --
    // which for a paged source means fetching rows the user cannot see, and for
    // `@strictVisibleRegion` means the opposite mistake, a region wider than what is on screen.
    const usableWidth = Math.max(0, this.width - args.paddingRight);
    const effectiveColumns = getEffectiveColumns(mappedColumns, this.cellXOffset, usableWidth, undefined, this.translateX);
    // `getEffectiveColumns` returns every sticky column first, then the visible non-sticky ones
    // starting at `cellXOffset` -- so the sticky prefix is exactly `freezeColumns` long.
    const x = Math.max(0, this.cellXOffset - args.rowMarkerOffset);
    const width = Math.max(0, Math.min(effectiveColumns.length - freezeColumns, args.columns.length - x));
    const rows = args.rows;
    if (rows <= 0) return {
      x,
      y: 0,
      width,
      height: 0
    };
    const y = Math.min(Math.max(0, this.cellYOffset), rows - 1);
    // `translateY` is <= 0: how much of the first visible row is scrolled off the top, so
    // subtracting it adds that sliver back onto the height still to be covered.
    // `paddingBottom` narrows this the same way `paddingRight` narrows the width above
    // (`infinite-scroller.tsx:281`, `height: cHeight - paddingBottom`).
    const available = Math.max(0, this.height - this.totalHeaderHeight(args) - args.paddingBottom) - this.translateY;
    let height = 0;
    const rowHeight = args.rowHeight;
    if (typeof rowHeight === "number") {
      height = rowHeight > 0 ? Math.ceil(available / rowHeight) : 0;
    } else {
      let acc = 0;
      for (let r = y; r < rows && acc < available; r++) {
        acc += rowHeight(r);
        height++;
      }
    }
    return {
      x,
      y,
      width,
      height: Math.max(0, Math.min(height, rows - y))
    };
  }

  // --- DOM sizing --------------------------------------------------------------------------------

  sizeCanvases(args) {
    this.canvasEl.style.width = `${this.width}px`;
    this.canvasEl.style.height = `${this.height}px`;
    const headerCanvasHeight = this.totalHeaderHeight(args) + 1;
    this.headerCanvasEl.style.width = "100%";
    this.headerCanvasEl.style.height = `${headerCanvasHeight}px`;
  }

  /**
   * Positions and fades the two scroll shadows (4.5). Port of source's `stickyShadow` memo
   * (`data-grid.tsx:1878-1918`), which computes exactly these two opacities and inline styles.
   *
   * Both stay mounted and are hidden with `opacity: 0` rather than being added and removed,
   * because they are re-evaluated on every draw and the whole point of the memo upstream is to do
   * no work when nothing changed -- here that is the `lastShadowState` comparison, which keeps a
   * scroll frame free of DOM writes once the shadows have reached full opacity.
   */
  updateScrollShadows(args, mappedColumns, freezeColumns) {
    // Source's exact expressions. `freezeColumns` is the mangled count, so a row-marker column
    // casts a shadow on its own -- as it does upstream, where the marker is likewise folded into
    // the frozen count before this runs.
    const opacityX = freezeColumns === 0 || !args.fixedShadowX ? 0 : this.cellXOffset > freezeColumns ? 1 : clamp(-this.translateX / 100, 0, 1);
    // The `32` is source's, and it is a hardcoded assumed row height rather than `args.rowHeight`
    // (`data-grid.tsx:1881`). Kept: it only scales how fast the shadow fades in over the first
    // ~3 rows of scrolling, and diverging would change the feel for no stated gain.
    const absoluteOffsetY = -this.cellYOffset * 32 + this.translateY;
    const opacityY = args.fixedShadowY ? clamp(-absoluteOffsetY / 100, 0, 1) : 0;
    const stickyX = args.fixedShadowX ? getStickyWidth(mappedColumns, this.currentDragAndDropState()) : 0;
    const totalHeaderHeight = this.totalHeaderHeight(args);

    // Serialized rather than compared field-by-field: five numbers each, all of which change
    // together during a scroll, so one string compare is both cheaper and harder to get wrong.
    const x = opacityX === 0 ? "" : `${stickyX}|${this.width - stickyX}|${this.height}|${opacityX}`;
    const y = opacityY === 0 ? "" : `${totalHeaderHeight}|${this.width}|${this.height}|${opacityY}`;
    if (x === this.lastShadowState.x && y === this.lastShadowState.y) return;
    this.lastShadowState = {
      x,
      y
    };
    const shadowX = this.shadowXEl.style;
    shadowX.opacity = `${opacityX}`;
    if (opacityX > 0) {
      shadowX.left = `${stickyX}px`;
      shadowX.width = `${Math.max(0, this.width - stickyX)}px`;
      shadowX.height = `${this.height}px`;
    }
    const shadowY = this.shadowYEl.style;
    shadowY.opacity = `${opacityY}`;
    if (opacityY > 0) {
      shadowY.top = `${totalHeaderHeight}px`;
      shadowY.width = `${this.width}px`;
      shadowY.height = `${this.height}px`;
    }
  }
  rebuildScrollContent(args) {
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    // 4.5: `overscrollX`/`overscrollY` are pure scroll *extent* -- empty space past the content,
    // nothing drawn into it. Source adds them in exactly this spot
    // (`scrolling-data-grid.tsx:105,115`), and clamps X at zero while letting Y through
    // unclamped; matched rather than tidied.
    //
    // 4.3: `paddingRight`/`paddingBottom` are added on top, in the same place source adds them
    // (`scrolling-data-grid.tsx:261-262`, `scrollWidth={width + (paddingRight ?? 0)}`). They read
    // like a second spelling of the overscrolls here and are one, in isolation -- what makes them
    // their own args is that `paddingRight` is *also* subtracted from the visible-region width
    // below, so a sticky right element does not cause cells beneath it to be reported as visible.
    const totalWidth = mappedColumns.reduce((sum, c) => sum + c.width, 0) + Math.max(0, args.overscrollX ?? 0) + args.paddingRight;
    const totalHeight = this.totalHeaderHeight(args) + totalRowsHeight(this.effectiveRows(args), args.rowHeight) + (args.overscrollY ?? 0) + args.paddingBottom;
    this.syncRightElement(args);

    // 4.4: the scroller is the element the browser starts an HTML5 drag from, so `isDraggable`
    // is an attribute on it rather than anything the canvas knows about
    // (`scrolling-data-grid.tsx:260`). Source's "any string counts" test is
    // `isDraggableAttr` -- an unrecognised string still makes the surface draggable, and
    // `onDragStartExternal` is what refuses the drag.
    this.scrollerEl.draggable = isDraggableAttr(args.isDraggable);
    this.stackEl.replaceChildren();
    const widthDiv = document.createElement("div");
    widthDiv.style.width = `${totalWidth}px`;
    widthDiv.style.height = "0px";
    this.stackEl.append(widthDiv);
    const effectiveHeight = Math.min(totalHeight, BROWSER_MAX_DIV_HEIGHT);
    let h = 0;
    while (h < effectiveHeight) {
      const toAdd = Math.min(MAX_PADDER_SEGMENT_HEIGHT, effectiveHeight - h);
      const div = document.createElement("div");
      div.style.width = "0px";
      div.style.height = `${toAdd}px`;
      this.stackEl.append(div);
      h += toAdd;
    }
  }

  /**
   * Places (or removes) the `<:rightElement>` host inside the scroller, and applies the geometry
   * that cannot live in CSS. Port of `infinite-scroller.tsx:351-372`.
   *
   * The **contents** of that host are Ember's -- `<GlideDataGrid>` renders the block into it with
   * `{{in-element}}` and owns its lifecycle. This method only ever moves the host itself and sets
   * styles on it, which is why the host is created by the component rather than here: a node
   * Glimmer rendered must not be reparented, but a node Glimmer merely renders *into* can live
   * wherever the controller puts it.
   *
   * Source's `.dvn-hidden` on the inner wrapper is reproduced: with no right element the whole
   * scroll-inner is `visibility: hidden`, since its only job then is to give the scroller its
   * extent, and a visible empty flex row would sit over the canvas swallowing nothing.
   */
  syncRightElement(args) {
    const el = args.rightElement;
    this.scrollInnerEl.classList.toggle("dvn-hidden", el === undefined);
    // Source renders its spacer only alongside a non-filling right element. Here the spacer is a
    // permanent node (it predates this item and carries the scroller's horizontal extent), so it
    // is hidden rather than removed when `fill` would otherwise fight it for the same slack.
    this.spacerEl.style.display = el !== undefined && args.rightElementFill ? "none" : "";
    if (el === undefined) {
      this.rightElementHost?.remove();
      this.rightElementHost = undefined;
      return;
    }
    if (this.rightElementHost !== el) {
      this.rightElementHost?.remove();
      this.rightElementHost = el;
      el.classList.add("dvn-right-element");
    }
    // Always last in the flex row, after the stack and the spacer.
    this.scrollInnerEl.append(el);

    // Source's inline block, verbatim. `maxHeight` uses the *scroller's* client height so the
    // panel never outgrows the visible area even though the scroll content is far taller; the
    // `dpr % 1` term is source's guard against a fractional device pixel ratio rounding the
    // panel one pixel past the bottom edge and inventing a scrollbar.
    const dpr = window.devicePixelRatio;
    Object.assign(el.style, {
      height: `${this.height}px`,
      maxHeight: `${this.scrollerEl.clientHeight - Math.ceil(dpr % 1)}px`,
      marginRight: `${args.paddingRight}px`,
      flexGrow: args.rightElementFill ? "1" : "",
      right: args.rightElementSticky ? `${args.paddingRight}px` : ""
    });
  }

  /** The node `syncRightElement` last placed, so a changed one can be evicted. */
  rightElementHost;

  // --- scroll handling ---------------------------------------------------------------------------

  // Re-derives the four scroll-offset fields from the scroller's live scroll position.
  //
  // **`cellXOffset`'s resting value is `freezeColumns`, not 0** -- it is the index of the first
  // *non-frozen* visible column, so with any sticky column (which includes the synthetic
  // row-marker column whenever `rowMarkers !== "none"`) it starts at 1 even at `scrollLeft === 0`.
  // The fields therefore cannot simply be initialised to 0 and left until the first scroll event:
  // `computeBounds` would double-count the sticky width for every hit-test until the user
  // happened to scroll. The concrete symptom that surfaced this (Phase 7c): on a freshly loaded
  // grid with row markers, the header menu could not be opened at all, because the computed menu
  // rect sat one marker-column-width to the right of the column actually under the cursor, so
  // they could never intersect -- and any scroll silently "fixed" it for the rest of the session.
  syncScrollOffsets(args) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const {
      cellXOffset,
      translateX
    } = computeXOffset(this.scrollerEl.scrollLeft, mappedColumns, freezeColumns);
    const {
      cellYOffset,
      translateY
    } = computeYOffset(this.scrollerEl.scrollTop, this.effectiveRows(args), args.rowHeight);
    this.cellXOffset = cellXOffset;
    this.translateX = translateX;
    this.cellYOffset = cellYOffset;
    this.translateY = translateY;
  }

  // Repaint after a header-hover change. There is no damage-based path for headers -- `damage` is
  // a `CellSet` of body cells and `drawGrid` repaints the whole header canvas on any real draw --
  // so this is a plain full draw. That is the same cost as one ordinary frame and only happens
  // while the pointer is inside the header strip, which is also how source behaves (its hover
  // state change re-renders).
  redrawHeaderHover(args) {
    this.runDraw(args, undefined);
  }

  /**
   * 4.5: the scroll-time canvas downscale (`@enableFirefoxRescaling` / `@enableSafariRescaling`).
   * Port of source's layout effect at `data-grid.tsx:438-449`.
   *
   * **Source's first-event quirk is deliberate and is reproduced**: `setScrolling(true)` is guarded
   * on a timer already being pending, so a single isolated scroll event never enters scroll mode —
   * only the second event within 200ms does. Its comment says why ("we don't want to go into
   * scroll mode for a single repaint"): a one-off scroll would otherwise repaint twice, once
   * blurry and once sharp, which is more visible than the blur it avoids.
   */
  noteScrollForRescaling(args) {
    if (args.rescaleWhileScrolling === undefined || window.devicePixelRatio === 1) return;
    if (this.scrollingStopTimer !== undefined) this.isScrolling = true;
    window.clearTimeout(this.scrollingStopTimer);
    this.scrollingStopTimer = window.setTimeout(() => {
      this.scrollingStopTimer = undefined;
      if (this.destroyed || !this.isScrolling) return;
      this.isScrolling = false;
      // The canvas is still at the reduced resolution, and nothing else will redraw it.
      this.scheduleFullRedraw();
    }, RESCALE_SETTLE_MS);
  }
  onScroll = () => {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    this.syncScrollOffsets(args);
    this.noteScrollForRescaling(args);

    // Synchronous, no rAF/debounce -- this is intentional. The ported `drawGrid`'s blit fast
    // path (in `render/data-grid-render.blit.ts`) detects "only scroll offsets changed" and
    // translates the previous frame instead of doing a full repaint, which is the actual
    // scroll-perf mechanism. This handler's only job is to feed it fresh offsets every frame.
    this.runDraw(args, undefined);
  };

  // --- hover handling ------------------------------------------------------------------------------

  onMouseMove = ev => {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    const rect = this.root.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const effectiveColumns = getEffectiveColumns(mappedColumns, this.cellXOffset, this.width, undefined, this.translateX);
    const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
    const row = getRowIndexForY(y, this.height, this.enableGroups(args), args.headerHeight, this.groupHeaderHeight(args), this.effectiveRows(args), args.rowHeight, this.cellYOffset, this.translateY, 0);
    const resizeHoverColumn = this.resizeState === undefined && row !== undefined && row <= -1 ? this.hitTestColumnResizeEdge(args, col, row, x) : undefined;
    const nextOverResizeEdge = resizeHoverColumn !== undefined;
    if (nextOverResizeEdge !== this.overResizeEdge) {
      this.overResizeEdge = nextOverResizeEdge;
      this.applyCursor();
    }

    // Column resize (Phase 3d): live width computation on every tick, matching source's
    // continuous `onColumnResize` firing (not just at drag-end) -- see `data-grid-dnd.tsx`.
    // Takes over the whole mousemove (no hover/drag-extend concurrently), mirroring source
    // routing this through a dedicated raw listener separate from the synthetic hover pipeline.
    if (this.resizeState !== undefined) {
      const rs = this.resizeState;
      const newWidth = Math.max(10, Math.round(rs.startWidth + (ev.clientX - rs.startClientX)));
      rs.lastWidth = newWidth;
      const realCol = rs.col - args.rowMarkerOffset;
      const realColumn = args.columns[realCol];
      const growOffset = mappedColumns[rs.col]?.growOffset ?? 0;
      if (realColumn !== undefined) {
        args.onColumnResize?.(realColumn, newWidth, realCol, newWidth + growOffset);
      }
      this.scheduleFullRedraw();
      return;
    }

    // Column reorder (Phase 3d): 20px dead-zone before the drag visually activates, then track
    // the current drop-target column as the mouse moves over headers. `freezeColumns` gates
    // valid drop targets the same way source's `lockColumns` does -- can't drop in front of
    // frozen columns.
    if (this.dragColState !== undefined) {
      const ds = this.dragColState;
      if (!ds.active) {
        if (Math.abs(ev.clientX - ds.startClientX) > COLUMN_DRAG_THRESHOLD_PX) {
          ds.active = true;
        } else {
          return;
        }
      }
      if (col !== -1 && col >= freezeColumns && col !== ds.dropCol) {
        const proposedDest = col;
        ds.vetoed = args.onColumnProposeMove?.(ds.srcCol - args.rowMarkerOffset, proposedDest - args.rowMarkerOffset) === false;
        ds.dropCol = proposedDest;
      }
      this.scheduleFullRedraw();
      return;
    }
    const totalHeaderHeight = this.totalHeaderHeight(args);

    // Phase 9h: drag-extend, row reorder and fill-handle drag all share this block -- they are
    // three readings of the same gesture ("a button is held and the pointer has moved"), and all
    // three want the same off-the-edge autoscroll. Source reaches the same place via
    // `onItemHoveredImpl`, which every drag routes through.
    if (ev.buttons !== 0 && this.isDragInFlight()) {
      const dragLocation = [col !== -1 ? col : x < 0 ? 0 : mappedColumns.length - 1, row ?? this.effectiveRows(args) - 1];
      const edge = computeScrollEdge(x, y, this.width, this.height, totalHeaderHeight);
      this.lastDragHover = {
        location: dragLocation,
        edge
      };

      // Row reorder's dead-zone is measured against the raw pointer, not the resolved cell, so
      // it has to be crossed here rather than inside `applyDragTo` (which autoscroll also
      // calls, with no `MouseEvent` to measure against).
      const rowDrag = this.dragRowState;
      if (rowDrag !== undefined && !rowDrag.active) {
        if (Math.abs(ev.clientY - rowDrag.startClientY) > ROW_DRAG_THRESHOLD_PX) rowDrag.active = true;
      }
      this.autoscroller.setDirection(edge);
      this.applyDragTo(args, dragLocation);

      // A fill or row-reorder drag owns the pointer completely -- no hover/animation updates
      // while it runs, mirroring source's `onItemHoveredImpl` not falling through to
      // `onItemHovered` while `dragRowActive`. Drag-extend deliberately *does* fall through:
      // its hover highlight is part of the interaction.
      if (this.fillState !== undefined || rowDrag?.active === true) return;
    } else if (this.lastDragHover !== undefined) {
      this.autoscroller.setDirection(undefined);
      this.lastDragHover = undefined;
    }
    const item = col === -1 || row === undefined ? undefined : [col, row];

    // Fill-handle hover: cursor feedback only (source's `overFill`). Must be evaluated even when
    // the hovered *cell* hasn't changed, since the handle is a few px inside one cell's corner.
    const overFill = item !== undefined && item[1] >= 0 && this.hitTestFillHandle(args, x, y);
    if (overFill !== this.overFillHandle) {
      this.overFillHandle = overFill;
      this.applyCursor();
    }
    const updateHoverInfo = target => {
      const cellRect = computeBounds(target[0], target[1], this.width, this.height, this.groupHeaderHeight(args), totalHeaderHeight, this.cellXOffset, this.cellYOffset, this.translateX, this.translateY, this.effectiveRows(args), freezeColumns, 0, mappedColumns, args.rowHeight);
      this.hoverInfo = [target, [x - cellRect.x, y - cellRect.y]];
    };
    if (itemsAreEqual(this.hoveredItem, item)) {
      // Same cell: still refresh the sub-cell hover position (needed by renderers that draw
      // hover effects relative to the cursor, e.g. link/button hover) and repaint just that
      // cell -- no need to touch the AnimationManager since the hovered item hasn't changed.
      if (item !== undefined && item[1] >= 0) {
        updateHoverInfo(item);
        this.drawWithDamage(new CellSet([item]));
      } else if (item !== undefined) {
        // Still inside the same header cell. The position within it must keep updating,
        // because the menu chevron highlights only while the pointer is directly over its
        // own `menuBounds` (`data-grid-render.header.ts:561`, which tests
        // `pointInRect(menuBounds, posX + x, posY + y)`).
        updateHoverInfo(item);
        this.redrawHeaderHover(args);
      }
      return;
    }
    this.hoveredItem = item;

    // N2 (TBD.md): the hover was fully tracked here since Phase 2 and handed out nowhere, which
    // made tooltips impossible to build. Emitted here, after the `itemsAreEqual` early-return
    // above, so this fires on *change* only -- source does the same and for the same reason
    // (`data-editor.tsx:2731`): a per-mousemove emit would put consumer work on the pointer path.
    this.emitItemHovered(args, item, ev, x, y);
    if (item === undefined) {
      // Off-grid entirely: clear hover and let the animation manager play its leave animation.
      this.hoverInfo = undefined;
      this.animationManager.setHovered(item);
      return;
    }
    if (item[1] < 0) {
      // Over a header (`-1`) or group-header (`-2`) row. No per-cell `needsHover` renderer
      // check applies (mirrors `data-grid.tsx`'s `hoveredItem[1] < 0` early-out) and the
      // animation manager must be told the *cell* hover left -- but `hoverInfo` itself must
      // still be populated and the header repainted.
      //
      // This used to `hoverInfo = undefined; return;` instead, which meant the header
      // renderer's hover state was permanently unreachable: `drawHeader` derives
      // `isHovered` from `hoverInfo`'s row being `-1`/`-2`
      // (`data-grid-render.header.ts:81,187`), and the menu chevron is gated on exactly that
      // (`:464`, `hasMenu === true && (isHovered || ...)`). So **no column ever showed a
      // hover highlight and the menu chevron never drew at all** -- while the menu's
      // *hit-test* worked fine, leaving an invisible affordance. On the real
      // grid.glideapps.com the chevron appearing on hover *is* the affordance.
      //
      // `computeBounds` handles rows `-1`/`-2` natively (`data-grid-lib.ts:800-813`,
      // including growing a group header's rect across its whole span), so `updateHoverInfo`
      // needs no special-casing here.
      updateHoverInfo(item);
      this.animationManager.setHovered(undefined);
      this.redrawHeaderHover(args);
      return;
    }
    updateHoverInfo(item);
    const cell = this.mangledGetCellContent(args)(item);
    const renderer = args.getCellRenderer(cell);
    const cellNeedsHover = renderer === undefined && cell.kind === GridCellKind.Custom || renderer?.needsHover !== undefined && (typeof renderer.needsHover === "boolean" ? renderer.needsHover : renderer.needsHover(cell));
    this.animationManager.setHovered(cellNeedsHover ? item : undefined);
  };

  /**
   * Build and dispatch `onItemHovered` for a newly-hovered target (N2 in `TBD.md`).
   *
   * Populates the **already-ported** `GridMouseEventArgs` union from `rendering/event-args.ts`
   * rather than inventing a narrower hover-specific type: the union was ported in Phase 1 and had
   * never been constructed anywhere, so this is the first thing to actually use it, and matching
   * source's shape here is what lets a consumer port a `Tooltips`-style recipe unchanged.
   *
   * `location` is converted to the consumer's coordinate space, mirroring
   * `data-editor.tsx:2808` (`location[0] - rowMarkerOffset`). A hover over the row-marker column
   * itself therefore reports `-1`, exactly as source does — it does not suppress the event.
   */
  emitItemHovered(args, item, ev, x, y) {
    const onItemHovered = args.onItemHovered;
    if (onItemHovered === undefined) return;
    onItemHovered(this.buildMouseEventArgs(args, item, {
      shiftKey: ev.shiftKey,
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      // Touch is 9c, deferred — see PHASES.md. `touchMode` is hardcoded `false` throughout
      // this controller, so reporting `false` here is consistent rather than a guess.
      isTouch: false,
      isEdge: false,
      button: ev.button,
      buttons: ev.buttons,
      scrollEdge: NO_SCROLL_EDGE,
      localX: x,
      localY: y
    }));
  }

  /**
   * Builds a `GridMouseEventArgs` for a hit target. Shared by `@onItemHovered` and 9f's
   * `getMouseArgsForPosition`, which must agree -- a consumer comparing the two is exactly the
   * kind of thing this API exists for, and two separate constructions would drift.
   *
   * `item` is MANGLED and `location` comes out in CONSUMER space, mirroring
   * `data-editor.tsx:2808`/`:4104`. A hover over the row-marker column reports `-1` rather than
   * being suppressed, as source does.
   */
  buildMouseEventArgs(args, item, base) {
    const {
      localX,
      localY,
      ...common
    } = base;
    if (item === undefined) {
      return {
        ...common,
        kind: outOfBoundsKind,
        location: [0, 0],
        isMaybeScrollbar: false,
        region: [OutOfBoundsRegionAxis.Center, OutOfBoundsRegionAxis.Center]
      };
    }
    const [mangledCol, row] = item;
    const bounds = this.computeCellRect(args, mangledCol, row);
    const col = mangledCol - args.rowMarkerOffset;
    const localEventX = localX - bounds.x;
    const localEventY = localY - bounds.y;
    if (row === -1 || row === -2) {
      // `resolveMouseHit` encodes the column header as row -1 and the group header as -2.
      const group = args.columns[col]?.group ?? "";
      return row === -2 ? {
        ...common,
        kind: groupHeaderKind,
        location: [col, -2],
        bounds,
        group,
        localEventX,
        localEventY
      } : {
        ...common,
        kind: headerKind,
        location: [col, -1],
        bounds,
        group,
        localEventX,
        localEventY
      };
    }
    return {
      ...common,
      kind: "cell",
      location: [col, row],
      bounds,
      isFillHandle: this.overFillHandle,
      localEventX,
      localEventY
    };
  }

  // --- 4.4: external HTML5 drag-and-drop --------------------------------------------------------
  //
  // The browser's own drag-and-drop, for carrying data out of the grid and dropping data into it.
  // Distinct from every other drag in this controller (column reorder, row reorder, fill,
  // drag-extend), which are plain mouse gestures that never leave the page.
  //
  // Source splits this across two files: `data-grid.tsx:1457-1674` has the four listeners, and
  // `data-editor.tsx:2683-2705` wraps `onDragStart` to apply the row-marker offset and to suppress
  // rect-selection for the duration. Both halves are here.

  /**
   * A drag this grid started is in flight. Source keeps the same flag
   * (`data-editor.tsx:2682`) and uses it for one thing: suppressing rect drag-selection, which
   * would otherwise run off the `mousemove`s the browser still delivers during a drag.
   *
   * `mouseDownState` is cleared at `dragstart` as well (source's `setMouseState(undefined)`), so
   * this is belt-and-braces — but it is what stops a drag that *ends* inside the grid from
   * resuming a selection on the way out.
   */
  isActivelyDragging = false;

  /** The cell `@onDragOverCell` last reported. `dragover` fires continuously over a stationary
   *  pointer, so without this the consumer hears about the same cell tens of times a second. */
  activeDropTarget = undefined;
  onDragStartExternal = ev => {
    if (this.destroyed) return;
    const args = this.resolveArgs();

    // Source's `canvas === null || isDraggable === false || isResizing` (`data-grid.tsx:1460`).
    // A column resize is a mouse drag on the same surface; letting the browser lift it into an
    // HTML5 drag would abandon the resize half-finished.
    if (this.resizeState !== undefined) {
      ev.preventDefault();
      return;
    }
    const hit = this.resolveMouseHit(args, ev);
    if (!canDragFrom(args.isDraggable, dragKindForHit(hit.kind, hit.location[1]))) {
      ev.preventDefault();
      return;
    }

    // `data-editor.tsx:2685-2688`: a drag off the row-marker column is refused outright rather
    // than reported with a negative index. Same test as everywhere else in this file -- the
    // marker occupies mangled column 0 when it is on.
    const [mangledCol, row] = hit.location;
    if (mangledCol - args.rowMarkerOffset < 0) {
      ev.preventDefault();
      return;
    }
    let dragMime;
    let dragData;
    let dragImage;
    let dragImageX;
    let dragImageY;
    let prevented = false;

    // An out-of-bounds hit reports itself as such, with no location -- the convention
    // `buildMouseEventArgs` already established for `@onItemHovered`. Reachable only with
    // `isDraggable: true`, whose guard short-circuits before the kind is consulted (source's
    // does too).
    const item = hit.kind === "out-of-bounds" ? undefined : hit.location;
    const dragArgs = {
      ...this.buildMouseEventArgs(args, item, {
        ...this.clickEventBase(hit),
        localX: hit.localX,
        localY: hit.localY
      }),
      setData: (mime, payload) => {
        dragMime = mime;
        dragData = payload;
      },
      setDragImage: (image, x, y) => {
        dragImage = image;
        dragImageX = x;
        dragImageY = y;
      },
      preventDefault: () => {
        prevented = true;
      },
      defaultPrevented: () => prevented
    };
    args.onDragStart?.(dragArgs);

    // **No payload means no drag.** Source cancels here (`data-grid.tsx:1497,1592`), and it is
    // the behaviour that makes `isDraggable` safe to switch on before the callback is written:
    // the grid becomes draggable, and dragging it does nothing.
    if (prevented || dragMime === undefined || dragData === undefined || ev.dataTransfer === null) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData(dragMime, dragData);
    ev.dataTransfer.effectAllowed = "copyLink";
    if (dragImage !== undefined && dragImageX !== undefined && dragImageY !== undefined) {
      ev.dataTransfer.setDragImage(dragImage, dragImageX, dragImageY);
    } else if (item !== undefined) {
      this.setDefaultDragImage(args, ev.dataTransfer, mangledCol, row);
    }

    // `data-editor.tsx:2697-2698`. Both lines matter: the flag suppresses rect-selection for the
    // duration, and dropping `mouseDownState` ends the drag-extend gesture this mousedown had
    // already started -- otherwise the selection grows behind the drag.
    this.isActivelyDragging = true;
    this.mouseDownState = undefined;
  };

  /**
   * Renders the dragged cell (or header) into an offscreen canvas and hands it to the browser as
   * the drag image. Port of `data-grid.tsx:1502-1590`.
   *
   * Without this the browser drags a snapshot of the whole scroll surface, which for a grid means
   * a translucent copy of the entire viewport. The canvas is attached offscreen because
   * `setDragImage` requires an element that is *in* the document, and removed on the next tick
   * because by then the browser has taken its snapshot — both of which are source's.
   */
  setDefaultDragImage(args, dataTransfer, mangledCol, row) {
    const bounds = this.computeCellRect(args, mangledCol, row);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const offscreen = document.createElement("canvas");
    const dpr = Math.ceil(window.devicePixelRatio ?? 1);
    offscreen.width = bounds.width * dpr;
    offscreen.height = bounds.height * dpr;
    const ctx = offscreen.getContext("2d");
    if (ctx === null) return;
    const theme = this.mergedTheme(args);
    ctx.scale(dpr, dpr);
    ctx.textBaseline = "middle";
    if (row === -1 || row === -2) {
      const {
        mappedColumns
      } = this.computeMangledLayout(args);
      const column = mappedColumns[mangledCol];
      if (column === undefined) return;
      ctx.font = theme.headerFontFull;
      ctx.fillStyle = theme.bgHeader;
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      drawHeader(ctx, 0, 0, bounds.width, bounds.height, column, false, theme, false, undefined, undefined, false, 0, this.spriteManager, args.drawHeader, false);
    } else {
      ctx.font = theme.baseFontFull;
      ctx.fillStyle = theme.bgCell;
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      drawCell(ctx, this.mangledGetCellContent(args)([mangledCol, row]), 0, row, false, false, 0, 0, bounds.width, bounds.height, false, theme, theme.bgCell, this.imageLoader, this.spriteManager, 0, undefined, false, 0, args.drawCell, undefined, undefined, this.renderStateProvider, args.getCellRenderer, () => undefined);
    }
    offscreen.style.left = "-100%";
    offscreen.style.position = "absolute";
    offscreen.style.width = `${bounds.width}px`;
    offscreen.style.height = `${bounds.height}px`;
    document.body.append(offscreen);
    dataTransfer.setDragImage(offscreen, bounds.width / 2, bounds.height / 2);
    window.setTimeout(() => {
      offscreen.remove();
    }, 0);
  }
  onDragOverExternal = ev => {
    if (this.destroyed) return;
    const args = this.resolveArgs();

    // Cancelling the drag-over is what marks an element a valid drop target; without it the
    // browser refuses the drop and shows the "no entry" cursor. Source ties it to `onDrop`
    // being set (`data-grid.tsx:1620-1623`), so a grid with only `@onDragOverCell` observes
    // drags passing over it without claiming them.
    if (args.onDrop !== undefined) ev.preventDefault();
    if (args.onDragOverCell === undefined) return;
    const target = this.dropTargetFor(args, ev);
    if (!hasDropTargetChanged(this.activeDropTarget, target)) return;
    this.activeDropTarget = target;
    args.onDragOverCell(target, ev.dataTransfer);
  };
  onDropExternal = ev => {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    if (args.onDrop === undefined) return;

    // Source: "Default can mess up sometimes" (`data-grid.tsx:1659`) -- a dropped file or URL
    // otherwise navigates the page out from under the grid.
    ev.preventDefault();
    args.onDrop(this.dropTargetFor(args, ev), ev.dataTransfer);
  };
  onDragLeaveExternal = () => {
    if (this.destroyed) return;
    this.resolveArgs().onDragLeave?.();
  };

  /** `dragend` fires on the *source* of a drag, whether or not it was dropped anywhere. */
  onDragEndExternal = () => {
    this.activeDropTarget = undefined;
    this.isActivelyDragging = false;
  };

  /** The drop target in consumer space. Headers stay reachable (rows -1/-2), matching source,
   *  which subtracts the marker offset and does nothing else. */
  dropTargetFor(args, ev) {
    const hit = this.resolveMouseHit(args, ev);
    return [hit.location[0] - args.rowMarkerOffset, hit.location[1]];
  }

  /**
   * 4.6: runs the clicked cell renderer's `onSelect` hook. Returns `true` if it called
   * `preventDefault()`, in which case the caller abandons the selection change.
   *
   * `mangledLocation` is mangled (it comes from `hit.location`); the hook is handed the *cell*
   * rather than a location, matching source, so the marker column never reaches it -- the caller's
   * row-marker branch has already returned by this point.
   */
  emitRendererSelect(args, hit, mangledLocation) {
    const cell = this.mangledGetCellContent(args)(mangledLocation);
    const renderer = args.getCellRenderer(cell);
    if (renderer?.onSelect === undefined) return false;
    const bounds = this.computeCellRect(args, mangledLocation[0], mangledLocation[1]);
    let prevented = false;
    renderer.onSelect({
      ...this.clickEventBase(hit),
      cell,
      posX: hit.localX - bounds.x,
      posY: hit.localY - bounds.y,
      bounds,
      theme: this.themeForCell(args, cell, mangledLocation[0], mangledLocation[1]),
      preventDefault: () => {
        prevented = true;
      }
    });
    return prevented;
  }

  // --- Phase 9g: click notifications ------------------------------------------------------------
  //
  // All three fire from `onMouseUp`, gated on the mouseup landing on the same target as the
  // mousedown -- source's `isValidClick`/`lastMouseSelectLocation` pair, ported to
  // `rendering/click-behavior.ts` so the drag-is-not-a-click rule has a test.
  //
  // For **cells and ordinary headers**, `preventDefault()` deliberately cannot suppress the
  // selection change, and that is worth stating because it looks like a gap. Selection happens on
  // mousedown, in source (`data-editor.tsx:2126`, `handleSelect`) exactly as here, and these
  // callbacks fire on the subsequent mouseup -- so by the time a consumer could call
  // `preventDefault()`, the selection has already moved. Source's `isPrevented` gates only the
  // renderer's `onClick` and cell activation there. Making it stronger here would give a consumer
  // behaviour their React version does not have, silently.
  //
  // **Group headers are the one exception, and it is real** (`data-editor.tsx:2498-2509`): source's
  // mousedown does nothing for a group header but record its location (`:2048-2049`), and
  // `handleGroupHeaderSelection` runs from *mouseup*, after `onGroupHeaderClicked`, gated on
  // `!isPrevented`. So `preventDefault()` there genuinely does suppress selection. That asymmetry
  // is upstream's, not this port's -- see `dispatchClick`.

  /** The fields every click event shares with a hover event. Kept in one place so the two paths
   *  cannot drift. */
  clickEventBase(hit) {
    return {
      shiftKey: hit.shiftKey,
      ctrlKey: hit.ctrlKey,
      metaKey: hit.metaKey,
      // Touch is 9c, deferred -- `touchMode` is hardcoded `false` throughout this controller.
      isTouch: false,
      isDoubleClick: hit.isDoubleClick,
      isEdge: false,
      button: hit.button,
      buttons: hit.buttons,
      scrollEdge: NO_SCROLL_EDGE
    };
  }

  /**
   * Mouseup click dispatch (9g). Port of the tail of source's `onMouseUp`
   * (`data-editor.tsx:2482-2513`): headers and group headers report a click and nothing else,
   * cells go through the fuller `handleMaybeClick` sequence.
   *
   * Both header branches require the mouseup to land on the same header as the mousedown, which
   * is source's `col === lastMouseDownCol && row === lastMouseDownRow`. For cells the equivalent
   * check lives inside `dispatchCellMouseUp`, because source runs part of that path even for an
   * invalid click.
   */
  dispatchClick(ev, downState) {
    // Source's `if (args.kind === "cell" && (args.button === 0 || args.button === 1))`, hoisted:
    // the header branches carry the same `button === 0` guard, and a right-click is a context
    // menu, handled by its own listener.
    if (ev.button !== 0 && ev.button !== 1) return;
    const args = this.resolveArgs();
    const hit = this.resolveMouseHit(args, ev);
    if (hit.kind === "header") {
      if (!isValidClick(downState.location, hit.location)) return;
      // Source guards *both* header branches with `if (clickLocation < 0) return;`
      // (`data-editor.tsx:2483,2498`), ahead of the callback and of the selection -- the
      // select-all checkbox header is neither a header click nor a group-header selection.
      if (hit.location[0] - args.rowMarkerOffset < 0) return;
      const prevented = this.emitHeaderClicked(args, hit);
      // The one suppressible selection in the whole grid: see the block comment above.
      if (hit.location[1] === -2 && !prevented) {
        this.applyGroupHeaderSelection(args, hit);
      }
      return;
    }
    if (hit.kind !== "cell") return;
    this.dispatchCellMouseUp(args, hit, downState);
  }

  /** Fires `onCellClicked`. Returns `true` if the consumer called `preventDefault()`, in which
   *  case the caller skips the renderer's `onClick` and activation -- the two things, and only the
   *  two things, source's `isPrevented` suppresses. */
  emitCellClicked(args, hit) {
    const callback = args.onCellClicked;
    if (callback === undefined) return false;
    const [mangledCol, row] = hit.location;
    const location = [mangledCol - args.rowMarkerOffset, row];
    const bounds = this.computeCellRect(args, mangledCol, row);
    let prevented = false;
    callback(location, {
      ...this.clickEventBase(hit),
      kind: "cell",
      // Consumer space, matching the first argument. Source leaves `event.location` *mangled*
      // here while unmangling the `cell` argument beside it -- an inconsistency this port
      // deliberately does not reproduce, since every other coordinate it hands out is
      // consumer space.
      location,
      bounds,
      isFillHandle: this.overFillHandle,
      localEventX: hit.localX - bounds.x,
      localEventY: hit.localY - bounds.y,
      preventDefault: () => {
        prevented = true;
      }
    });
    return prevented;
  }

  /**
   * Fires `onHeaderClicked` or `onGroupHeaderClicked` depending on which band was hit (row `-1`
   * vs `-2`). The row-marker guard lives in the caller, where source has it.
   *
   * Returns `true` if the consumer called `preventDefault()`. That only *means* anything for a
   * group header, where it suppresses the group's column selection -- `onHeaderClicked` fires
   * long after an ordinary header's selection has already been applied on mousedown, exactly as
   * in source. See the block comment at the top of this section.
   */
  emitHeaderClicked(args, hit) {
    const isGroup = hit.location[1] === -2;
    const callback = isGroup ? args.onGroupHeaderClicked : args.onHeaderClicked;
    if (callback === undefined) return false;
    const [mangledCol] = hit.location;
    const col = mangledCol - args.rowMarkerOffset;
    const bounds = this.computeCellRect(args, mangledCol, hit.location[1]);
    let prevented = false;
    const common = {
      ...this.clickEventBase(hit),
      bounds,
      group: args.columns[col]?.group ?? "",
      localEventX: hit.localX - bounds.x,
      localEventY: hit.localY - bounds.y,
      preventDefault: () => {
        prevented = true;
      }
    };
    if (isGroup) {
      args.onGroupHeaderClicked?.(col, {
        ...common,
        kind: groupHeaderKind,
        location: [col, -2]
      });
    } else {
      args.onHeaderClicked?.(col, {
        ...common,
        kind: headerKind,
        location: [col, -1]
      });
    }
    return prevented;
  }

  /**
   * Selects the clicked group's whole column span. Port of `handleGroupHeaderSelection`
   * (`data-editor.tsx:2142-2189`); the branch logic is
   * {@link computeGroupHeaderSelection} in `rendering/group-header-selection.ts` so it is testable.
   *
   * Runs on **mouseup**, after `onGroupHeaderClicked` and only if the consumer did not prevent it.
   */
  applyGroupHeaderSelection(args, hit) {
    const mangledSelection = this.mangledSelection(args);
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    const isMultiKey = browserIsOSX.value ? hit.metaKey : hit.ctrlKey;
    const update = computeGroupHeaderSelection({
      mappedColumns,
      col: hit.location[0],
      rowMarkerOffset: args.rowMarkerOffset,
      selectedColumns: mangledSelection.columns,
      columnSelect: args.columnSelect,
      columnSelectionMode: args.columnSelectionMode,
      isMultiKey
    });
    if (update === undefined) return;
    this.applyMangledSelection(args, setSelectedColumns(mangledSelection, update.newColumns, update.append, isMultiKey, this.selectionOptions(args)));
    // Source touches neither `lastSelectedColRef` nor `lastSelectedRowRef` here (contrast the
    // single-column header path, which sets both). Matched deliberately: a shift-click after a
    // group-header click extends from the last *header* click, not from the group.
  }

  /** Fires `onCellActivated`. `mangledLocation` is converted to consumer space here, the single
   *  place this event is emitted from. */
  emitCellActivated(args, mangledLocation, activation) {
    args.onCellActivated?.([mangledLocation[0] - args.rowMarkerOffset, mangledLocation[1]], activation);
  }

  // --- Phase 9h: shared drag plumbing (drag-extend / row reorder / fill) -------------------------

  /** True while any pointer drag this class tracks per-cell is in flight. Resize/column-reorder are
   * deliberately excluded: both are handled and `return`ed above this point, and neither wants
   * autoscroll (a column resize past the edge would fight the scroll it caused). */
  isDragInFlight() {
    return this.fillState !== undefined || this.dragRowState !== undefined || this.mouseDownState !== undefined;
  }

  // See the constructor: this exists only so a drag that has left the grid keeps being tracked.
  onWindowMouseMove = ev => {
    if (this.destroyed) return;
    if (ev.buttons === 0 || !this.isDragInFlight()) return;
    if (ev.target instanceof Node && this.root.contains(ev.target)) return;
    this.onMouseMove(ev);
  };

  // One frame of autoscroll has just scrolled the grid under a stationary pointer. Port of
  // source's `adjustSelectionOnScroll` (`data-editor.tsx:2826-2848`): the pointer's own hit test
  // is meaningless (it is outside the grid), so the drag follows the leading edge of whatever is
  // now in view instead.
  onAutoscrollTick = () => {
    if (this.destroyed) return;
    const hover = this.lastDragHover;
    if (hover === undefined || !this.isDragInFlight()) {
      this.autoscroller.stop();
      return;
    }
    const args = this.resolveArgs();
    // `scrollBy` will fire a `scroll` event, but not necessarily before this callback runs --
    // re-derive the offsets now so the region below is the one that was actually just scrolled to.
    this.syncScrollOffsets(args);
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const visible = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
    const target = adjustDragLocationForScroll(hover.location, hover.edge, visible,
    // `computeVisibleRegion` reports columns in the consumer's space; the drag works in
    // mangled space, where the first non-frozen visible column is exactly `cellXOffset`.
    this.cellXOffset, mappedColumns.length - 1, this.effectiveRows(args) - 1);
    this.applyDragTo(args, target);
  };

  /** Applies an in-flight drag to a resolved grid location. Shared by the mousemove path and the
   * autoscroll tick, which is the point: the two must not drift apart. */
  applyDragTo(args, location) {
    const fill = this.fillState;
    if (fill !== undefined) {
      const prev = fill.previousSelection.current;
      if (prev === undefined) return;
      // Never fill into the trailing blank row, and never into the row-marker column.
      const row = Math.max(0, Math.min(location[1], args.rows - 1));
      const col = Math.max(location[0], args.rowMarkerOffset);
      const next = getClosestRect(prev.range, col, row, args.allowedFillDirections);
      if (!rectanglesEqual(fill.highlight, next)) {
        fill.highlight = next;
        this.scheduleFullRedraw();
      }
      return;
    }
    const rowDrag = this.dragRowState;
    if (rowDrag !== undefined) {
      if (!rowDrag.active) return;
      const next = Math.max(0, Math.min(location[1], args.rows - 1));
      if (next !== rowDrag.dropRow) {
        rowDrag.dropRow = next;
        this.scheduleFullRedraw();
      }
      return;
    }

    // 4.4: `!isActivelyDragging` is source's own guard on this branch
    // (`data-editor.tsx:2753`). An HTML5 drag started from inside the grid keeps delivering
    // `mousemove`s, and without this they would extend the selection under the drag.
    if (this.mouseDownState !== undefined && !this.isActivelyDragging) {
      this.handleDragMove(args, this.mouseDownState, location);
    }
  }

  // Is `localX`/`localY` (root-relative pixels) inside the fill handle drawn at the bottom-right
  // corner of the current selection? Port of source's `isFillHandle` computation
  // (`data-grid.tsx:662-687`), including its deliberately generous hit box: the handle is
  // `size` px across but accepts anything within `size` px of its centre in each axis.
  hitTestFillHandle(args, localX, localY) {
    if (!args.fillHandle) return false;
    // Mangled: `current.range` is fed straight to `computeCellRect`.
    const current = this.mangledSelection(args).current;
    if (current === undefined) return false;
    const [handleCol, handleRow] = rectBottomRight(current.range);
    if (handleRow >= this.effectiveRows(args)) return false;
    const bounds = this.computeCellRect(args, handleCol, handleRow);
    const size = DEFAULT_FILL_HANDLE.size;
    const half = size / 2;
    const centerX = bounds.x + bounds.width + DEFAULT_FILL_HANDLE.offsetX - half + 0.5;
    const centerY = bounds.y + bounds.height + DEFAULT_FILL_HANDLE.offsetY - half + 0.5;
    return Math.abs(centerX - localX) < size && Math.abs(centerY - localY) < size;
  }

  // Commits a finished fill drag. Port of source's `fillPattern`
  // (`data-editor.tsx:2245-2295`), minus the `await`-a-thunk path -- see `cellsForSelectionSync`
  // and the `getCellsForSelection` doc comment for why this port stays synchronous.
  // Both rectangles arrive in MANGLED column space and are converted here, once.
  fillPattern(args, patternRange, destRange) {
    const offset = args.rowMarkerOffset;
    const source = {
      ...patternRange,
      x: patternRange.x - offset
    };
    const destination = {
      ...destRange,
      x: destRange.x - offset
    };
    if (source.width <= 0 || source.height <= 0) return;
    if (args.onFillPattern !== undefined) {
      let canceled = false;
      args.onFillPattern({
        patternSource: source,
        fillDestination: destination,
        preventDefault: () => {
          canceled = true;
        }
      });
      if (canceled) return;
    }
    const pattern = this.cellsForSelectionSync(args, source);
    // `undefined` means the consumer answered asynchronously with a thunk. Source awaits it;
    // this port does not (same divergence as the copy path), so the fill is simply skipped
    // rather than applied against cells nobody has read yet.
    if (pattern === undefined) return;
    const edits = computeFillEdits({
      pattern,
      source,
      destination,
      columnCount: args.columns.length,
      rowCount: args.rows
    });
    if (edits.length === 0) return;
    args.onCellsEdited?.(edits);
    this.updateCells(edits.map(e => ({
      cell: e.location
    })));
  }

  // --- click dispatch (Phase 3a) ------------------------------------------------------------------
  // Port of source's `handleSelect` (`data-editor.tsx:1838-2087`), which is the single function
  // handling both cell and header clicks (deliberately not split into separate handlers here
  // either, per PORTING-NOTES.md). Known simplifications vs source, all noted where relevant:
  // no trailing-blank-row / row-grouping / row-reordering / fill-handle / column-resize-edge
  // concepts exist in this port yet, so every branch of `handleSelect` that exists solely to
  // guard against those is dropped; renderer-level `onSelect`/`onClick` interception hooks are
  // not wired since no renderer in this port implements them yet (Phase 4).

  // Resolves a mousedown/mouseup/click event's page coordinates into a `MouseHit` against the
  // *current* draw/scroll state. Mirrors source's `getMouseArgsForPosition`
  // (`data-grid.tsx:516-660`), minus the `rect.width/width` DPI-scale correction that the
  // existing `onMouseMove` hover code also doesn't apply (kept consistent with it).
  resolveMouseHit(args, ev) {
    return this.resolveHitAtPoint(args, ev.clientX, ev.clientY, ev);
  }

  /**
   * The same hit test, from a bare pair of *client* coordinates. 9f's `getMouseArgsForPosition`
   * needs this, and source separates them the same way (`data-grid.tsx:516`, which takes
   * `posX`/`posY` and an *optional* event -- every internal caller passes one, the ref method does
   * not).
   */
  resolveHitAtPoint(args, clientX, clientY, ev) {
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    const rect = this.root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const effectiveColumns = getEffectiveColumns(mappedColumns, this.cellXOffset, this.width, undefined, this.translateX);
    const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
    const row = getRowIndexForY(y, this.height, this.enableGroups(args), args.headerHeight, this.groupHeaderHeight(args), this.effectiveRows(args), args.rowHeight, this.cellYOffset, this.translateY, 0);
    const shiftKey = ev?.shiftKey ?? false;
    const ctrlKey = ev?.ctrlKey ?? false;
    const metaKey = ev?.metaKey ?? false;
    const isDoubleClick = (ev?.detail ?? 0) >= 2;
    const button = ev?.button ?? 0;
    const buttons = ev?.buttons ?? 0;
    if (col === -1 || row === undefined || x < 0 || y < 0 || x > this.width || y > this.height) {
      const location = [col !== -1 ? col : x < 0 ? 0 : mappedColumns.length - 1, row ?? this.effectiveRows(args) - 1];
      // `offsetWidth - clientWidth` is 0 for overlay scrollbars (nothing to guard against
      // there) and approximates the classic scrollbar width otherwise -- good enough for this
      // best-effort guard, source's own `getScrollBarWidth()` isn't ported.
      const scrollbarWidth = this.scrollerEl.offsetWidth - this.scrollerEl.clientWidth;
      const isMaybeScrollbar = x > this.width && x < this.width + scrollbarWidth || y > this.height && y < this.height + scrollbarWidth;
      return {
        kind: "out-of-bounds",
        location,
        localX: x,
        localY: y,
        shiftKey,
        ctrlKey,
        metaKey,
        isDoubleClick,
        button,
        buttons,
        isMaybeScrollbar
      };
    }
    if (row <= -1) {
      return {
        kind: "header",
        location: [col, row],
        localX: x,
        localY: y,
        shiftKey,
        ctrlKey,
        metaKey,
        isDoubleClick,
        button,
        buttons,
        isMaybeScrollbar: false
      };
    }
    return {
      kind: "cell",
      location: [col, row],
      localX: x,
      localY: y,
      shiftKey,
      ctrlKey,
      metaKey,
      isDoubleClick,
      button,
      buttons,
      isMaybeScrollbar: false
    };
  }

  // `DrawGridArg.dragAndDropState` for the ported render engine's drag-visual drawing. `undefined`
  // both when no reorder drag is active AND when the current drop candidate was vetoed by
  // `onColumnProposeMove` -- mirrors source's `dragOffset` memo (`data-grid-dnd.tsx`) returning
  // `undefined` in the vetoed case, so no ghost/ring is drawn for a rejected drop position.
  currentDragAndDropState() {
    const s = this.dragColState;
    if (s === undefined || !s.active || s.vetoed) return undefined;
    return {
      src: s.srcCol,
      dest: s.dropCol
    };
  }

  /**
   * Precise hit-test for the two clickable glyphs a column header can carry -- the menu chevron
   * (`column.hasMenu === true`) and the indicator icon (`column.indicatorIcon !== undefined`) --
   * distinct from a general header click. Port of source's `isOverHeaderElement`
   * (`data-grid.tsx:1036-1070`), minus its `isDragging`/`isResizing`/`hoveredOnEdge` guards: this
   * controller tests the resize edge and the reorder drag before ever reaching here.
   *
   * Menu first, indicator second, as source's `else if` has it. The order matters: `menuBounds` is
   * right-aligned to the column and `indicatorIconBounds` follows the measured title, so the two
   * genuinely overlap once a column is narrow enough, and the indicator is then unreachable.
   *
   * Returns the glyph's bounds in canvas space (what a consumer positions a floating menu with)
   * when `localX`/`localY` land inside them, else `undefined`.
   */
  hitTestHeaderElement(args, col, localX, localY) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const column = mappedColumns[col];
    if (column === undefined) return undefined;
    if (column.hasMenu !== true && column.indicatorIcon === undefined) return undefined;
    const bounds = computeBounds(col, -1, this.width, this.height, this.groupHeaderHeight(args), this.totalHeaderHeight(args), this.cellXOffset, this.cellYOffset, this.translateX, this.translateY, this.effectiveRows(args), freezeColumns, 0, mappedColumns, args.rowHeight);
    // Phase 6: header cells are drawn with `mergeAndRealizeTheme(outerTheme, groupTheme,
    // c.themeOverride)` (`render/data-grid-render.header.ts:65-69`), so the hit-test uses the
    // same column-merged theme -- `computeHeaderLayout` reads `cellHorizontalPadding`/
    // `headerIconSize` off it, both of which a column override may legitimately change.
    const theme = mergeAndRealizeTheme(this.mergedTheme(args), column.themeOverride);
    const layout = computeHeaderLayout(this.headerCanvasCtx, column, bounds.x, bounds.y, bounds.width, bounds.height, theme, false);
    if (column.hasMenu === true && layout.menuBounds !== undefined && pointInRect(layout.menuBounds, localX, localY)) return {
      area: "menu",
      bounds: layout.menuBounds
    };
    if (column.indicatorIcon !== undefined && layout.indicatorIconBounds !== undefined && pointInRect(layout.indicatorIconBounds, localX, localY)) return {
      area: "indicator",
      bounds: layout.indicatorIconBounds
    };
    return undefined;
  }

  /**
   * Hit-test for a group header's action icons (4.2). Port of source's
   * `groupHeaderActionForEvent` (`data-grid.tsx:1004-1029`); the geometry and the comparison it
   * makes live in `rendering/render/group-header-actions.ts` so they are shared with the drawing
   * code and reachable from vitest.
   *
   * Returns `undefined` for anything that is not a group-header press, so callers can ask
   * unconditionally.
   */
  hitTestGroupHeaderAction(args, hit) {
    if (hit.kind !== "header" || hit.location[1] !== -2 || !this.enableGroups(args)) return undefined;
    const mangledCol = hit.location[0];
    const groupName = args.columns[mangledCol - args.rowMarkerOffset]?.group ?? "";
    // `computeCellRect` grows a group header's rect across its whole span (row `-2` is handled
    // natively by `computeBounds`), which is the rect the actions were drawn right-aligned in.
    const bounds = this.computeCellRect(args, mangledCol, -2);
    return hitTestGroupHeaderAction(args.getGroupDetails(groupName), bounds, hit.localX - bounds.x, hit.localY - bounds.y);
  }

  // Hit-test for a header column's resize-edge region (Phase 3d) -- a narrow strip at the
  // column's right border, `RESIZE_EDGE_PX` wide. `localX` is root-relative, same coordinate
  // space `computeBounds` returns. Resize is only reachable when at least one of the three
  // resize callbacks is configured (mirrors source's `canResize` gate) and never on the
  // row-marker column (mirrors source excluding `col === 0` marker-column resize).
  hitTestColumnResizeEdge(args, col, row, localX) {
    if ((args.onColumnResize ?? args.onColumnResizeEnd ?? args.onColumnResizeStart) === undefined) return undefined;
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const boundsFor = columnIndex => computeBounds(columnIndex, row, this.width, this.height, this.groupHeaderHeight(args), this.totalHeaderHeight(args), this.cellXOffset, this.cellYOffset, this.translateX, this.translateY, this.effectiveRows(args), freezeColumns, 0, mappedColumns, args.rowHeight);
    const column = mappedColumns[col];
    if (column !== undefined && !(args.hasRowMarkers && col === 0)) {
      const bounds = boundsFor(col);
      if (localX >= bounds.x + bounds.width - RESIZE_EDGE_PX && localX <= bounds.x + bounds.width) return col;

      // `getColumnIndexForX` resolves a boundary to the column on its right. The source
      // checks the left edge too and reports the preceding column as the resize target.
      const previousCol = col - 1;
      if (previousCol >= 0 && !(args.hasRowMarkers && previousCol === 0)) {
        const previousBounds = boundsFor(previousCol);
        if (localX >= previousBounds.x && localX <= previousBounds.x + RESIZE_EDGE_PX) return previousCol;
      }
    }
    return undefined;
  }
  onFocus = () => {
    if (this.isFocused) return;
    this.isFocused = true;
    this.scheduleFullRedraw();
  };
  onBlur = () => {
    if (!this.isFocused) return;
    this.isFocused = false;
    this.scheduleFullRedraw();
  };

  /**
   * Right-click dispatch (Phase 9d). Ports source's `onContextMenuImpl` (`data-grid.tsx:1251`)
   * plus `data-editor.tsx`'s routing of it to the three per-target props.
   *
   * This is deliberately thin: the hit test (`resolveMouseHit`) and the bounds computation
   * (`computeCellRect`) already existed and are used unchanged by click handling, so the whole
   * feature is one more listener over machinery that works. That is why 9d was sized `S`.
   *
   * Coordinate space: `location`/`col` are handed out in the **consumer's** space, with the
   * row-marker column subtracted, exactly as source does (`args.location[0] - rowMarkerOffset`).
   * A right-click on the row-marker column itself yields a negative column and is dropped rather
   * than reported as column -1, since no consumer callback could do anything sensible with it.
   */
  onContextMenu = ev => {
    if (this.destroyed) return;
    // Same guard as `onMouseDown` below, for the same reason: a right-click inside an open
    // editor or on consumer chrome is not a right-click on a cell.
    if (!isGridSurfaceTarget(ev.target, this.gridSurfaces)) return;
    const args = this.resolveArgs();
    if (args.onCellContextMenu === undefined && args.onHeaderContextMenu === undefined && args.onGroupHeaderContextMenu === undefined) {
      return;
    }
    const hit = this.resolveMouseHit(args, ev);
    if (hit.kind === "out-of-bounds") return;
    const [mangledCol, row] = hit.location;
    const col = mangledCol - args.rowMarkerOffset;
    if (col < 0) return;
    const eventArgs = {
      bounds: this.computeCellRect(args, mangledCol, row),
      localEventX: hit.localX,
      localEventY: hit.localY,
      clientX: ev.clientX,
      clientY: ev.clientY,
      // Not called for us -- the browser menu stays unless the consumer suppresses it.
      preventDefault: () => ev.preventDefault()
    };
    if (hit.kind === "cell") {
      args.onCellContextMenu?.([col, row], eventArgs);
      return;
    }

    // `resolveMouseHit` reports both header rows as `kind: "header"`, distinguished by the row
    // index: -1 is the column header, -2 the group header above it (see `onItemHovered`'s note
    // on the same encoding).
    if (row === -2) {
      args.onGroupHeaderContextMenu?.(col, eventArgs);
    } else {
      args.onHeaderContextMenu?.(col, eventArgs);
    }
  };
  onMouseDown = ev => {
    if (this.destroyed || ev.button !== 0) return;
    // The listener is on `root`, which also contains the open overlay editor and anything the
    // consumer rendered into the yielded block -- so a mousedown that did not originate on the
    // grid's own surface is not a grid click and must be left entirely alone. Mirrors source's
    // `onPointerDown` identity guard (`data-grid.tsx:1076-1080`); see `grid-event-target.ts`
    // for why a `root.contains(...)` test is exactly the wrong shape here.
    if (!isGridSurfaceTarget(ev.target, this.gridSurfaces)) return;
    // Click-to-focus, matching source's grid being a normal focusable element that gains focus
    // on interaction. Most browsers already do this automatically for a `tabIndex`-bearing
    // element on mousedown, but this makes it explicit/deterministic rather than relying on
    // that default. `onFocus` (registered above) is what actually flips `this.isFocused` and
    // redraws -- calling `.focus()` here is a no-op if focus doesn't change (e.g. already
    // focused), consistent with the `if (this.isFocused) return;` guard there.
    this.root.focus();
    const args = this.resolveArgs();
    const hit = this.resolveMouseHit(args, ev);
    const isMultiKey = browserIsOSX.value ? ev.metaKey : ev.ctrlKey;

    // Header resize and header-glyph clicks are exclusive with ordinary header-click selection
    // dispatch. Resize gets first priority, matching source's DND wrapper; otherwise a menu
    // glyph at the same right edge would consume the resize gesture.
    if (hit.kind === "header") {
      // 4.2: a press on one of a group header's action icons is not a grid interaction at all
      // -- it must not select the group's columns, not start a column drag, and not record a
      // press location. Source returns from `onPointerDown` before calling any of that
      // (`data-grid.tsx:1104-1110`); the action fires on the matching pointerup.
      if (this.hitTestGroupHeaderAction(args, hit) !== undefined) {
        this.pendingHeaderElementClick = undefined;
        return;
      }

      // Column resize (Phase 3d): mousedown on a header's resize-edge starts a resize drag
      // and is exclusive with normal header-click selection/reorder, exactly like the
      // menu-glyph check above -- mirrors source's `onMouseDownImpl`
      // (`data-grid-dnd.tsx`), which returns immediately after recording resize state.
      const resizeCol = this.hitTestColumnResizeEdge(args, hit.location[0], hit.location[1], hit.localX);
      if (resizeCol !== undefined) {
        const {
          mappedColumns
        } = this.computeMangledLayout(args);
        const column = mappedColumns[resizeCol];
        if (column !== undefined) {
          const realCol = resizeCol - args.rowMarkerOffset;
          this.resizeState = {
            col: resizeCol,
            startClientX: ev.clientX,
            startWidth: column.width,
            lastWidth: column.width
          };
          const realColumn = args.columns[realCol];
          if (realColumn !== undefined) {
            args.onColumnResizeStart?.(realColumn, column.width, realCol, column.width + (column.growOffset ?? 0));
          }
          this.scheduleFullRedraw();
        }
        return;
      }
      const element = this.hitTestHeaderElement(args, hit.location[0], hit.localX, hit.localY);
      if (element !== undefined) {
        this.pendingHeaderElementClick = {
          col: hit.location[0],
          area: element.area
        };
        return;
      }
    }
    this.pendingHeaderElementClick = undefined;

    // Mirrors source's `setMouseState({previousSelection: gridSelection, fillHandle: fh})`
    // (`data-editor.tsx:2120-2123`) -- recorded for every kind (cell/header/out-of-bounds), not
    // just cell clicks, since drag-extend needs to know where the drag started regardless.
    this.mouseDownState = {
      location: hit.location,
      previousSelection: this.mangledSelection(args)
    };
    if (hit.kind === "cell") {
      // Phase 9h: a mousedown on the fill handle starts a fill drag and is exclusive with
      // ordinary selection dispatch -- source's `if (!isTouch && button === 0 && !fh)
      // handleSelect(args)` (`data-editor.tsx:2126`). The selection must stay put: it is the
      // fill's pattern source.
      if (this.hitTestFillHandle(args, hit.localX, hit.localY)) {
        this.fillState = {
          previousSelection: this.mangledSelection(args),
          highlight: undefined
        };
        this.applyCursor();
        return;
      }

      // Phase 9h: row reorder. Grabbed from the row-marker column, and configured *alongside*
      // the normal marker-click selection dispatch below rather than instead of it -- source
      // wraps rather than replaces here too (`data-grid-dnd.tsx`'s `onMouseDownImpl` records
      // drag state and then still calls `onMouseDown`). A press that never crosses the 20px
      // dead-zone therefore remains an ordinary row-select click.
      if (args.onRowMoved !== undefined && args.hasRowMarkers && hit.location[0] === 0) {
        const row = hit.location[1];
        if (row >= 0 && row < args.rows) {
          this.dragRowState = {
            srcRow: row,
            startClientY: ev.clientY,
            active: false,
            dropRow: row
          };
        }
      }
      this.dispatchCellMouseDown(args, hit, isMultiKey);
    } else if (hit.kind === "header") {
      // Column reorder (Phase 3d): a header-body (non-edge) mousedown when `onColumnMoved` is
      // configured records drag-start state alongside the normal header-click selection
      // dispatch below -- source's `DataGridDnd` wraps `DataGrid` rather than replacing its
      // mousedown handling, so both happen on the same mousedown; whether it resolves to a
      // "click" (selection only, already applied below) or a "drag" (also fires
      // `onColumnMoved` on mouseup once the threshold is crossed) is decided by mousemove/up.
      // Row `-1` only. `resolveMouseHit` folds both header bands into `kind: "header"`, but
      // source's DnD wrapper matches `args.kind === "header"` against its *own* kind constant
      // (`data-grid-dnd.tsx:158`), which a group header never satisfies -- it is
      // `"group-header"` there. Without this the group strip is a second, undocumented grab
      // handle for reordering whichever column happens to sit under the pointer.
      if (args.onColumnMoved !== undefined && hit.location[1] !== -2 && hit.location[0] >= args.rowMarkerOffset) {
        this.dragColState = {
          srcCol: hit.location[0],
          startClientX: ev.clientX,
          active: false,
          dropCol: hit.location[0],
          vetoed: false
        };
      }
      // `resolveMouseHit` folds both header bands into `kind: "header"`, but source keeps
      // them apart and they behave differently: `handleSelect`'s `groupHeaderKind` branch
      // (`data-editor.tsx:2048-2049`) does nothing but record the press location. Group-header
      // *selection* runs from mouseup instead, so `@onGroupHeaderClicked`'s `preventDefault()`
      // can suppress it -- see `dispatchClick`/`applyGroupHeaderSelection`.
      if (hit.location[1] !== -2) {
        this.dispatchHeaderMouseDown(args, hit, isMultiKey);
      }
    } else if (!hit.isMaybeScrollbar) {
      this.clearSelection();
      // 4.6. Source fires `onSelectionCleared` from exactly here and nowhere else
      // (`data-editor.tsx:2051-2054`) -- not from Escape, a delete, or any other route to an
      // empty selection. Narrow on purpose: it means "the user clicked away", which is a
      // different intent from "the selection happens to be empty now".
      args.onSelectionCleared?.();
    }
  };
  onMouseUp = ev => {
    if (this.destroyed) return;
    // 9g: captured before it is cleared -- the click callbacks below need the press location.
    const downState = this.mouseDownState;
    this.mouseDownState = undefined;
    // Phase 9h: every drag ends here, however it ends -- including a mouseup outside the grid.
    this.autoscroller.stop();
    this.lastDragHover = undefined;

    // Phase 9h: fill-handle drag. Mirrors source's `onMouseUp` fill branch
    // (`data-editor.tsx:2342-2359`): the selection grows to cover pattern + fill, and the
    // pattern is replicated across the new part only.
    if (this.fillState !== undefined) {
      const fill = this.fillState;
      this.fillState = undefined;
      const args = this.resolveArgs();
      const previous = fill.previousSelection.current;
      if (fill.highlight !== undefined && previous !== undefined) {
        const combined = combineRects(previous.range, fill.highlight);
        this.fillPattern(args, previous.range, combined);
        // Everything here is mangled (`previous` came from `fillState`, `combined` from a
        // drag in hit-test space), so the grown selection is converted on the way in.
        this.applyMangledSelection(args, {
          ...this.mangledSelection(args),
          current: {
            ...previous,
            range: combined
          }
        });
      } else {
        this.scheduleFullRedraw();
      }
      // The handle has just moved to the corner of the *grown* selection, so whether the
      // pointer is still over it has to be re-decided here -- a fill drag suppresses the hover
      // path entirely while it runs, and leaving `overFillHandle` as it was would strand the
      // crosshair cursor until the next mouse move.
      const hit = this.resolveMouseHit(args, ev);
      this.overFillHandle = hit.kind === "cell" && this.hitTestFillHandle(args, hit.localX, hit.localY);
      this.applyCursor();
      return;
    }

    // 4.2: group-header actions. Checked ahead of every other mouseup path because source does
    // exactly that (`data-grid.tsx:1183-1194`, before its `onMouseUp` runs at all): an action
    // click reports itself and nothing else -- no `@onGroupHeaderClicked`, no group selection.
    // The matching mousedown returned early, so there is no drag or press state to unwind here.
    {
      const args = this.resolveArgs();
      const hit = this.resolveMouseHit(args, ev);
      const action = this.hitTestGroupHeaderAction(args, hit);
      if (action !== undefined) {
        // Source swallows the mouseup for any button but only *fires* on the primary one.
        if (ev.button === 0) {
          const eventArgs = this.buildMouseEventArgs(args, hit.location, {
            ...this.clickEventBase(hit),
            localX: hit.localX,
            localY: hit.localY
          });
          if (eventArgs.kind === groupHeaderKind) action.onClick(eventArgs);
        }
        return;
      }
    }

    // 9g: the click notifications, placed here on purpose -- ahead of the drag branches below,
    // several of which `return` unconditionally on a press that never became a drag (a plain
    // header click leaves `dragColState` set but inactive, for instance). A press that DID
    // become a drag is not a click and is skipped; so is a resize, whose mousedown returns
    // before recording `mouseDownState` at all, exactly as source's does.
    const dragHappened = this.dragRowState?.active === true || this.dragColState?.active === true || this.resizeState !== undefined;
    if (!dragHappened && downState !== undefined) {
      this.dispatchClick(ev, downState);
    }

    // Phase 9h: row reorder. Only a drag that crossed the dead-zone and actually landed
    // somewhere else counts -- everything below the threshold was a selection click.
    if (this.dragRowState !== undefined) {
      const ds = this.dragRowState;
      this.dragRowState = undefined;
      if (ds.active && ds.dropRow !== ds.srcRow) {
        this.resolveArgs().onRowMoved?.(ds.srcRow, ds.dropRow);
      }
      if (ds.active) {
        // Drop the preview remap unconditionally: the consumer may or may not have applied
        // the move, and either way what is on screen now is the preview, not the truth.
        this.scheduleFullRedraw();
        return;
      }
    }
    if (this.resizeState !== undefined) {
      const rs = this.resizeState;
      this.resizeState = undefined;
      const args = this.resolveArgs();
      const realCol = rs.col - args.rowMarkerOffset;
      const realColumn = args.columns[realCol];
      const {
        mappedColumns
      } = this.computeMangledLayout(args);
      const growOffset = mappedColumns[rs.col]?.growOffset ?? 0;
      if (realColumn !== undefined) {
        args.onColumnResizeEnd?.(realColumn, rs.lastWidth, realCol, rs.lastWidth + growOffset);
      }
      this.scheduleFullRedraw();
      return;
    }
    if (this.dragColState !== undefined) {
      const ds = this.dragColState;
      this.dragColState = undefined;
      const args = this.resolveArgs();
      if (ds.active && !ds.vetoed && ds.dropCol !== ds.srcCol) {
        args.onColumnMoved?.(ds.srcCol - args.rowMarkerOffset, ds.dropCol - args.rowMarkerOffset);
        // Moving a column changes which column occupies each displayed index. Keep the
        // moved column selected, matching source's `setSelectedColumns(endIndex, ... )`
        // after it forwards `onColumnMoved`; otherwise the highlight stays at the old
        // index and appears to jump onto the column that replaced it.
        if (args.columnSelect !== "none") {
          this.applyMangledSelection(args, setSelectedColumns(this.mangledSelection(args), CompactSelection.fromSingleSelection(ds.dropCol), undefined, true, this.selectionOptions(args)));
        }
      }
      this.scheduleFullRedraw();
      return;
    }
    const pending = this.pendingHeaderElementClick;
    if (pending === undefined) return;
    const args = this.resolveArgs();
    const {
      col,
      area
    } = pending;
    this.pendingHeaderElementClick = undefined;
    const hit = this.resolveMouseHit(args, ev);
    if (hit.kind !== "header" || hit.location[0] !== col) return;
    // Re-testing, rather than reusing the mousedown's bounds, is what makes this a click on the
    // *same* glyph: a scroll or resize between down and up moves the rect out from under the
    // pointer. `area` must match too, or a press on the chevron that lifts over the indicator
    // would fire the wrong callback.
    const element = this.hitTestHeaderElement(args, col, hit.localX, hit.localY);
    if (element === undefined || element.area !== area) return;
    // Consumer space, matching every other callback. Source subtracts `rowMarkerOffset` in
    // `onHeaderMenuClickInner` / `onHeaderIndicatorClickInner` (`data-editor.tsx:2569-2580`).
    // These two were missed when the rest were converted on 2026-08-09 (TODO.md §4b.7).
    const realCol = unmangleColumn(col, args.rowMarkerOffset);
    if (area === "menu") args.onHeaderMenuClick?.(realCol, element.bounds);else args.onHeaderIndicatorClick?.(realCol, element.bounds);
  };

  // Port of `handleSelect`'s `args.kind === "cell"` branch (`data-editor.tsx:1848-1993`).
  dispatchCellMouseDown(args, hit, isMultiKey) {
    const [col, row] = hit.location;
    this.lastSelectedCol = undefined;
    if (args.hasRowMarkers && col === 0) {
      // Row-marker column click (`data-editor.tsx:1853-1911`). Phase 4d: no-op on the
      // trailing blank row -- there's no marker cell there (`mangledGetCellContent` returns a
      // plain loading cell for it), mirrors source's `showTrailingBlankRow === true && row ===
      // rows` guard in the same branch.
      if (args.showTrailingBlankRow && row === args.rows || args.rowMarkers === "number" || args.rowSelect === "none") return;

      // Row selection carries no column coordinate, so this whole branch stays in consumer
      // space: it reads `this.selection`, and `setSelectedRows` passes `current`/`columns`
      // through untouched, so `applySelection` receives consumer space as it requires.
      const selectedRows = this.selection.rows;
      const isSelected = selectedRows.hasIndex(row);
      const lastHighlighted = this.lastSelectedRow;
      const isMultiRow = isMultiKey && args.rowSelect === "multi";
      if (args.rowSelect === "multi" && hit.shiftKey && lastHighlighted !== undefined && selectedRows.hasIndex(lastHighlighted)) {
        const newSlice = [Math.min(lastHighlighted, row), Math.max(lastHighlighted, row) + 1];
        if (isMultiRow || args.rowSelectionMode === "multi") {
          this.applySelection(setSelectedRows(this.selection, undefined, newSlice, true, this.selectionOptions(args)));
        } else {
          this.applySelection(setSelectedRows(this.selection, CompactSelection.fromSingleSelection(newSlice), undefined, isMultiRow, this.selectionOptions(args)));
        }
      } else if (args.rowSelect === "multi" && (isMultiRow || args.rowSelectionMode === "multi")) {
        if (isSelected) {
          this.applySelection(setSelectedRows(this.selection, selectedRows.remove(row), undefined, true, this.selectionOptions(args)));
        } else {
          this.applySelection(setSelectedRows(this.selection, undefined, row, true, this.selectionOptions(args)));
          this.lastSelectedRow = row;
        }
      } else if (isSelected && selectedRows.length === 1) {
        this.applySelection(setSelectedRows(this.selection, CompactSelection.empty(), undefined, isMultiKey, this.selectionOptions(args)));
      } else {
        this.applySelection(setSelectedRows(this.selection, CompactSelection.fromSingleSelection(row), undefined, isMultiKey, this.selectionOptions(args)));
        this.lastSelectedRow = row;
      }
      return;
    }

    // Phase 4d: a click on any real (non-marker) column's cell in the trailing blank row
    // appends immediately -- no selection is set first, mirrors source exactly (`col >=
    // rowMarkerOffset && showTrailingBlankRow && row === rows` branch, `data-editor.tsx:1912-
    // 1913`, "void appendRow(...)" with no preceding `setCurrent`). Deliberately does NOT go
    // through `activateCell`'s second-click-to-activate gating -- this is a real behavioral
    // difference from every other cell kind, matching source's own single-click-appends UX.
    //
    // 9f: goes through `appendRow` rather than firing `onRowAppended` bare, which is what source
    // does and what makes `trailingRowOptions.targetColumn` mean anything. The visible change is
    // that the new row's editor now opens, as it always has upstream.
    if (args.showTrailingBlankRow && row === args.rows) {
      void this.appendRow(this.resolveNewRowTargetColumn(args, col));
      return;
    }

    // Ordinary cell click (`data-editor.tsx:1915-1993`). Everything from here down works in
    // MANGLED space, because `col`/`row` came from `hit.location`.
    //
    // **Selection only.** The renderer's `onClick` and cell activation used to live here too;
    // 9g moved them to `dispatchCellMouseUp`, where source has always had them. See that
    // method's doc comment for why that ordering is load-bearing rather than cosmetic.
    const mangledSelection = this.mangledSelection(args);
    const current = mangledSelection.current;
    const cellCol = current?.cell[0];
    const cellRow = current?.cell[1];
    if (cellCol === col && cellRow === row) {
      // Already exactly this cell: nothing to select. Source still runs its `setCurrent` here,
      // but with an identical value, so skipping is equivalent and avoids a redraw.
      return;
    }

    // 4.6: the renderer's `onSelect` hook. Typed since Phase 4 and called by nothing until now,
    // which meant a custom cell could not refuse or intercept its own selection.
    //
    // **Read the guards, not the name** (`data-editor.tsx:1917-1934`): it fires only when the
    // click lands on a *different* cell than the current one -- hence its position after the
    // early-out above, which is source's -- and only from the mousedown selection path. It is
    // not a click notification (`onClick` is, and runs on mouseup); its one power is that
    // `preventDefault()` aborts the selection change entirely, which no consumer-facing callback
    // in this grid can do.
    if (this.emitRendererSelect(args, hit, [col, row])) return;

    // 4.1: `navigationBehavior: "block"` is the one variant that also refuses *clicks* on a group
    // header, not just keyboard moves onto one (`data-editor.tsx:1936-1938`). Source's placement,
    // right after the `onSelect` hook. Note the row-marker branch has already returned above, so
    // this only ever sees real cells -- and `@onCellClicked` still fires on mouseup, which is
    // what makes click-to-collapse work on a blocked header.
    if (args.rowGrouping?.navigationBehavior === "block" && mapRowIndexToPath(row, args.flattenedRowGroups).isGroupHeader) {
      return;
    }
    if (hit.shiftKey && cellCol !== undefined && cellRow !== undefined && current !== undefined) {
      const left = Math.min(col, cellCol);
      const right = Math.max(col, cellCol);
      const top = Math.min(row, cellRow);
      const bottom = Math.max(row, cellRow);
      const result = setCurrentSelection(mangledSelection, {
        ...current,
        range: {
          x: left,
          y: top,
          width: right - left + 1,
          height: bottom - top + 1
        }
      }, true, isMultiKey, "click", this.selectionOptions(args));
      this.applyMangledSelection(args, result.selection);
    } else {
      const result = setCurrentSelection(mangledSelection, {
        cell: [col, row],
        range: {
          x: col,
          y: row,
          width: 1,
          height: 1
        }
      }, true, isMultiKey, "click", this.selectionOptions(args));
      this.applyMangledSelection(args, result.selection);
    }
    this.lastSelectedRow = undefined;
  }

  /**
   * The mouseup half of a cell click: `onCellClicked`, the renderer's `onClick`, and activation.
   *
   * Port of source's `handleMaybeClick` (`data-editor.tsx:2367-2432`), and the ordering here is
   * source's, not this port's convenience:
   *
   *   1. `onCellClicked` fires **only for a valid click** -- a mouseup on the same cell as the
   *      mousedown. A press on one cell released over another is a drag, and a drag is not a
   *      click. This is the check that keeps a consumer's row-open handler from firing every time
   *      the user *begins* a drag-selection.
   *   2. `preventDefault()` then suppresses steps 3 and 4, and **nothing else**. In particular it
   *      cannot suppress the selection change -- that already happened, back on mousedown, in
   *      both source and this port. That is not an oversight to be "fixed" later: source's
   *      `isPrevented` gates exactly these two things (`data-editor.tsx:2375-2431`) and a
   *      consumer porting a recipe would be surprised by anything stronger.
   *   3. The renderer's own `onClick` (boolean-cell's checkbox hit-test, and friends). Also gated
   *      on a valid click. Returning a cell commits it and consumes the gesture entirely.
   *   4. Activation -- `onCellActivated` plus opening the editor.
   */
  dispatchCellMouseUp(args, hit, downState) {
    const [col, row] = hit.location;
    const validClick = isValidClick(downState.location, hit.location);
    let prevented = false;
    if (validClick) {
      prevented = this.emitCellClicked(args, hit);
    }
    if (prevented) return;
    const cellContent = this.mangledGetCellContent(args)(hit.location);

    // Renderer-level click hook (Phase 4a) -- e.g. boolean-cell's checkbox-glyph hit-test.
    // If it returns a new cell, that's a direct edit+redraw and this click is fully consumed:
    // it does not go on to activate the overlay editor (matches boolean-cell's own `onSelect`
    // calling `preventDefault()` over the same region, which source uses for the same click).
    const renderer = args.getCellRenderer(cellContent);
    if (validClick && renderer?.onClick !== undefined && !isInnerOnlyCellKind(cellContent.kind)) {
      const cellRect = this.computeCellRect(args, col, row);
      // Phase 6: the renderer's `onClick` gets the same fully-merged per-cell theme its
      // `draw()` was given (column -> row -> cell overrides applied), not just the global
      // theme -- several renderers hit-test against theme-derived geometry
      // (`cellHorizontalPadding`, `checkboxMaxSize`, ...) which an override can change.
      const theme = this.themeForCell(args, cellContent, col, row);
      const newVal = renderer.onClick({
        cell: cellContent,
        posX: hit.localX - cellRect.x,
        posY: hit.localY - cellRect.y,
        bounds: cellRect,
        location: hit.location,
        theme,
        // Source shares one `isPrevented` ref across the whole mouseup, so a renderer
        // preventing here also suppresses activation below.
        preventDefault: () => {
          prevented = true;
        },
        shiftKey: hit.shiftKey,
        ctrlKey: hit.ctrlKey,
        metaKey: hit.metaKey,
        isTouch: false,
        isEdge: false,
        button: hit.button,
        buttons: hit.buttons,
        scrollEdge: NO_SCROLL_EDGE
      });
      if (newVal !== undefined) {
        this.commitCellEdit(args, hit.location, newVal);
        return;
      }
    }
    if (prevented) return;

    // 9g: all three of source's activation behaviours, where Phase 4a only had `"second-click"`.
    // A cell's own `activationBehaviorOverride` wins over the grid-wide setting, as in source.
    const behavior = cellContent.activationBehaviorOverride ?? args.cellActivationBehavior;
    if (!shouldActivateOnClick({
      behavior,
      isDoubleClick: hit.isDoubleClick,
      location: hit.location,
      // "Selected now" is post-mousedown; "selected before" is what `mouseDownState`
      // captured. Both are required -- see `shouldActivateOnClick`.
      currentCell: this.mangledSelection(args).current?.cell,
      previousCell: downState.previousSelection.current?.cell
    })) {
      return;
    }
    this.activateCell(args, hit.location, cellContent, {
      highlight: true,
      activation: {
        inputType: "pointer",
        pointerActivation: resolvePointerActivation(behavior, hit.isDoubleClick),
        pointerType: "mouse"
      }
    });
  }

  // Port of `handleSelect`'s `args.kind === "header"` branch (`data-editor.tsx:1994-2047`).
  dispatchHeaderMouseDown(args, hit, isMultiKey) {
    // `col` is a `hit.location` column, so the column half of this method works in MANGLED
    // space. The row half (the select-all checkbox below) does not -- rows carry no column
    // coordinate -- and deliberately stays on `this.selection`/`applySelection`.
    const [col] = hit.location;
    const mangledSelection = this.mangledSelection(args);
    const selectedColumns = mangledSelection.columns;
    const selectedRows = this.selection.rows;
    if (args.hasRowMarkers && col === 0) {
      // Header select-all checkbox (`data-editor.tsx:1997-2007`) -- a binary toggle, not a
      // real tri-state cycle: any count other than "all rows selected" selects all; "all rows
      // selected" clears to empty. The tri-state checked/unchecked/indeterminate visual is
      // derived fresh every draw from `rowMarkerChecked` in `mangledColumns` above, not stored
      // here.
      this.lastSelectedRow = undefined;
      this.lastSelectedCol = undefined;
      if (args.rowSelect === "multi") {
        if (selectedRows.length !== args.rows) {
          this.applySelection(setSelectedRows(this.selection, CompactSelection.fromSingleSelection([0, args.rows]), undefined, isMultiKey, this.selectionOptions(args)));
        } else {
          this.applySelection(setSelectedRows(this.selection, CompactSelection.empty(), undefined, isMultiKey, this.selectionOptions(args)));
        }
      }
      return;
    }
    const lastCol = this.lastSelectedCol;
    if (args.columnSelect === "multi" && hit.shiftKey && lastCol !== undefined && selectedColumns.hasIndex(lastCol)) {
      const newSlice = [Math.min(lastCol, col), Math.max(lastCol, col) + 1];
      if (isMultiKey || args.columnSelectionMode === "multi") {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, undefined, newSlice, isMultiKey, this.selectionOptions(args)));
      } else {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, CompactSelection.fromSingleSelection(newSlice), undefined, isMultiKey, this.selectionOptions(args)));
      }
    } else if (args.columnSelect === "multi" && (isMultiKey || args.columnSelectionMode === "multi")) {
      if (selectedColumns.hasIndex(col)) {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, selectedColumns.remove(col), undefined, isMultiKey, this.selectionOptions(args)));
      } else {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, undefined, col, isMultiKey, this.selectionOptions(args)));
      }
      this.lastSelectedCol = col;
    } else if (args.columnSelect !== "none") {
      if (selectedColumns.hasIndex(col)) {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, selectedColumns.remove(col), undefined, isMultiKey, this.selectionOptions(args)));
      } else {
        this.applyMangledSelection(args, setSelectedColumns(mangledSelection, CompactSelection.fromSingleSelection(col), undefined, isMultiKey, this.selectionOptions(args)));
      }
      this.lastSelectedCol = col;
    }
    this.lastSelectedRow = undefined;
  }

  // Drag-extend, invoked from `onMouseMove` while a button is held. Port of source's
  // `onItemHoveredImpl`'s two selection-growing branches (`data-editor.tsx:2734-2806`), minus
  // fill-handle (`mouseState.fillHandle`) and row-grouping (`getSelectionRowLimits`) clamping --
  // neither concept exists in this port yet.
  handleDragMove(args, mouseDownState, location) {
    const [col] = location;
    // Phase 4d: drag-extend (rect/row-range selection) never grows into the trailing blank row
    // -- mirrors source's `landedOnLastStickyRow` guard (`data-editor.tsx:2771-2775`, cited in
    // PORTING-NOTES.md). Clamping here (rather than special-casing every branch below) is a
    // deliberate simplification vs source's "drop the event entirely if dragging FROM the
    // trailing row" behavior -- this port just treats the trailing row as a wall drag-extend
    // can't cross, which is simpler and has the same practical effect (the selection never ends
    // up including it).
    const row = args.showTrailingBlankRow && location[1] >= args.rows ? args.rows - 1 : location[1];

    // Dragging out of a row-marker cell that was *just* selected by this same mousedown extends
    // a contiguous row range, taking priority over rect-selection (`data-editor.tsx:2734-2747`).
    const isRowMarkerDrag = mouseDownState.location[0] === 0 && args.rowMarkerOffset === 1 && args.rowSelect === "multi" && !mouseDownState.previousSelection.rows.hasIndex(mouseDownState.location[1]) && this.selection.rows.hasIndex(mouseDownState.location[1]);
    if (isRowMarkerDrag) {
      const start = Math.min(mouseDownState.location[1], row);
      const end = Math.max(mouseDownState.location[1], row) + 1;
      this.applySelection(setSelectedRows(this.selection, CompactSelection.fromSingleSelection([start, end]), undefined, false, this.selectionOptions(args)));
      return;
    }

    // Mangled from here down: `col` is a hit-test column and the clamp is against
    // `args.rowMarkerOffset`.
    const mangledSelection = this.mangledSelection(args);
    if (mangledSelection.current !== undefined && (args.rangeSelect === "rect" || args.rangeSelect === "multi-rect")) {
      const [selectedCol, selectedRow] = mangledSelection.current.cell;
      const targetCol = Math.max(col, args.rowMarkerOffset);

      // 4.1: `selectionBehavior: "block-spanning"` stops a drag-selection crossing a group
      // boundary (`data-editor.tsx:2706-2724, 2786`). The limits come from the *anchor* row,
      // not the row under the pointer, so the range is confined to the group the drag started
      // in -- dragging past the boundary pins to it rather than jumping to the next group.
      const limits = getSelectionRowLimits(selectedRow, args.flattenedRowGroups, args.rowGrouping?.selectionBehavior);
      const unclampedRow = row < 0 ? this.cellYOffset : row;
      const targetRow = limits === undefined ? unclampedRow : Math.min(Math.max(unclampedRow, limits[0]), limits[1]);
      const deltaX = targetCol - selectedCol;
      const deltaY = targetRow - selectedRow;
      const newRange = {
        x: deltaX >= 0 ? selectedCol : targetCol,
        y: deltaY >= 0 ? selectedRow : targetRow,
        width: Math.abs(deltaX) + 1,
        height: Math.abs(deltaY) + 1
      };
      const result = setCurrentSelection(mangledSelection, {
        ...mangledSelection.current,
        range: newRange
      }, true, false, "drag", this.selectionOptions(args));
      this.applyMangledSelection(args, result.selection);
    }
  }

  // --- overlay editor (Phase 4a) ------------------------------------------------------------------
  // Port of source's `data-grid-overlay-editor.tsx` + the activation-trigger logic spread across
  // `data-editor.tsx`'s `reselect`/`handleMaybeClick`/`handleFixedKeybindings`/`onKeyDown` (exact
  // line references + full architecture research in PORTING-NOTES.md's Phase 4 section). Unlike
  // source (a React portal into a `#portal` DOM node), this overlay is a plain absolutely-
  // positioned `<div>` appended directly into `this.root` -- no portal/mounting step exists
  // anywhere else in this imperative controller, so there's nothing to reuse for one.

  /** Cell-rect in the same root-relative pixel space `resolveMouseHit`/hover hit-testing use. */
  computeCellRect(args, mangledCol, row) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    return computeBounds(mangledCol, row, this.width, this.height, this.groupHeaderHeight(args), this.totalHeaderHeight(args), this.cellXOffset, this.cellYOffset, this.translateX, this.translateY, this.effectiveRows(args), freezeColumns, 0, mappedColumns, args.rowHeight);
  }

  /** Writes an edited cell back via `onCellsEdited` + a damage-only redraw of just that cell.
   *  `mangledLocation` is in row-marker-space (what selection/hit-testing use throughout this
   *  file); converted to real column space only at the `onCellsEdited` callback boundary, same
   *  convention as every other edit path in this file (paste/cut). */
  commitCellEdit(args, mangledLocation, newValue) {
    const [mCol, mRow] = mangledLocation;
    const realCol = mCol - args.rowMarkerOffset;
    args.onCellsEdited?.([{
      location: [realCol, mRow],
      value: newValue
    }]);
    this.drawWithDamage(new CellSet([mangledLocation]));
  }

  // Port of source's `reselect()` (`data-editor.tsx:1444-1493`) -- the single entry point every
  // activation trigger (click-on-selected, Enter, type-to-overwrite) below funnels through.
  // `cellContent` is mangled-space `InnerGridCell` (as returned by `mangledGetCellContent`);
  // marker cells are filtered out by callers before reaching here (never reachable via a real
  // column click/selection). New-row cells (Phase 4d) ARE reachable here -- keyboard nav can
  // select the trailing blank row (see `moveActiveCell`'s widened clamp) and then activate it via
  // Enter, which must append rather than silently no-op like every other inner-only kind. Mirrors
  // source's own explicit `row === rows && showTrailingBlankRow` check right at its
  // `keys.activateCell` handler (`data-editor.tsx:3300-3306`), consolidated here since this port
  // funnels both click-activation and Enter-activation through one `activateCell` method (source
  // has two separate call sites that each need the same check).
  activateCell(args, mangledLocation, cellContent, opts) {
    if (cellContent.kind === InnerGridCellKind.NewRow) {
      // Same flow as the click path above, mirroring source's own two call sites
      // (`data-editor.tsx:1913` and `:3303`, both `appendRow(customTargetColumn ?? col)`).
      void this.appendRow(this.resolveNewRowTargetColumn(args, mangledLocation[0]));
      return;
    }
    if (isInnerOnlyCellKind(cellContent.kind)) return;
    const cell = cellContent;

    // 9g. Fired for a real activation only -- never for the trailing blank row (which appends
    // instead, handled above) and never for a marker cell. Mirrors source, which emits it right
    // before `reselect()`, i.e. before the boolean toggle *and* before the overlay opens.
    this.emitCellActivated(args, mangledLocation, opts.activation);

    // Boolean cells never open the overlay -- toggled directly, matches source's `reselect()`
    // `c.kind === GridCellKind.Boolean` branch exactly (bypasses `setOverlaySimple` entirely).
    if (cell.kind === GridCellKind.Boolean) {
      if (!booleanCellIsEditable(cell)) return;
      this.commitCellEdit(args, mangledLocation, {
        ...cell,
        data: toggleBoolean(cell.data)
      });
      return;
    }

    // Phase 4d bugfix: this used to also gate on `isReadWriteCell(cell)`, but source's own
    // `reselect()` (`data-editor.tsx:1451`) only checks `c.allowOverlay` here -- `isReadWriteCell`
    // deliberately excludes `GridCellKind.Image` (`data-grid-types.ts:270`, images aren't edited
    // via generic typed/pasted text), so the old gate silently made image cells' overlay
    // unreachable via click/Enter activation even though `imageCellRenderer.provideEditor` is
    // fully implemented. `isReadWriteCell` remains the right gate for type-to-overwrite/paste/
    // delete (those really are text-editing concepts Image doesn't support) -- just not here.
    if (cell.allowOverlay !== true) return;
    let content = cell;
    if (opts.initialValue !== undefined) {
      // Per-kind type-to-overwrite seeding, mirrors source's `reselect()` initialValue switch
      // (`data-editor.tsx:1450-1467`): Number parses as float (`"-"` -> `-0`, NaN -> `0`),
      // Text/Markdown/Uri use the raw character as the new `data` verbatim. **Deviation from
      // source**: also sets `displayData` (Text) here, not just `data` -- source's own
      // `reselect()` leaves `displayData` stale too, but this port's `text-cell.ts` draws
      // `cell.displayData` (not `.data`), so committing without ever typing a second
      // character (e.g. type-to-overwrite immediately followed by Tab/Enter) would silently
      // commit the OLD displayed text while `data` held the new value -- a real, reproducible
      // bug found via browser testing, not something to blindly replicate from source.
      switch (content.kind) {
        case GridCellKind.Number:
          {
            const parsed = opts.initialValue === "-" ? -0 : Number.parseFloat(opts.initialValue);
            const n = Number.isNaN(parsed) ? 0 : parsed;
            content = {
              ...content,
              data: n,
              displayData: opts.initialValue
            };
            break;
          }
        case GridCellKind.Text:
          content = {
            ...content,
            data: opts.initialValue,
            displayData: opts.initialValue
          };
          break;
        case GridCellKind.Markdown:
        case GridCellKind.Uri:
          content = {
            ...content,
            data: opts.initialValue
          };
          break;
      }
    }
    this.openOverlay(args, mangledLocation, content, opts.highlight, opts.activation.inputType === "keyboard");
  }
  openOverlay(args, mangledLocation, cell, highlight, focusImmediately = false) {
    if (this.overlayState !== undefined) {
      this.finishOverlay(args, this.overlayState.currentCell, [0, 0]);
    }
    const renderer = args.getCellRenderer(cell);
    const editorResult = renderer?.provideEditor?.({
      ...cell,
      location: mangledLocation
    });
    if (editorResult === undefined) return;
    const isObj = isObjectEditorCallbackResult(editorResult);
    const editorFn = isObj ? editorResult.editor : editorResult;
    const disablePadding = editorResult.disablePadding === true;
    const [mCol, mRow] = mangledLocation;
    const cellRect = this.computeCellRect(args, mCol, mRow);
    // Phase 6 fix: this used to be the base+global theme only, with no column/row/cell override
    // applied -- so an editor opened over e.g. a dark-themed row rendered with light-theme
    // colors. Source hands its overlay the fully-merged per-cell theme (`data-editor.tsx`'s
    // `setOverlaySimple`: `mergeAndRealizeTheme(mergedTheme, groupTheme, colTheme, rowTheme,
    // content.themeOverride)`), which is exactly what `themeForCell` reproduces.
    const theme = this.themeForCell(args, cell, mCol, mRow);
    const container = document.createElement("div");
    // Appearance lives in `components/glide-data-grid-editors.css` under `.gdg-overlay-editor`
    // (and `.gdg-pad`, source's own name for the same padding toggle). Only the geometry stays
    // here, because only this method knows the cell's rect.
    container.className = disablePadding ? "gdg-overlay-editor" : "gdg-overlay-editor gdg-pad";
    // Focusable, but out of the tab order (`-1`, not `0`): this is a backstop for editors that
    // cannot take focus themselves, never a tab stop of its own. See `focusOverlay` below and
    // `rendering/overlay-focus.ts` for the whole rule (upstream #910).
    container.tabIndex = -1;
    Object.assign(container.style, {
      left: `${cellRect.x}px`,
      top: `${cellRect.y}px`,
      minWidth: `${cellRect.width}px`,
      // Deliberately `minHeight`, not a fixed `height` (a real bug found via browser testing
      // of Phase 4b's markdown editor, whose content is routinely taller than one row): a
      // fixed height + `overflow: visible` let multi-line editor/preview content spill out
      // past this container's own bottom edge, into the area below where there is no `theme
      // .bgCell` background -- the overflow visually reads as "text floating transparently
      // over the next row" rather than a properly-sized editor box. `minHeight` lets the
      // container grow to fit its content (mirrors source's `min-height`/`max-height`
      // approach, `internal/data-grid-overlay-editor/data-grid-overlay-editor-style.tsx`);
      // the stylesheet's `overflow: auto` plus this `maxHeight` caps growth at the visible
      // viewport instead of letting a very long value push the box off-screen.
      minHeight: `${cellRect.height}px`,
      maxHeight: `calc(100vh - ${cellRect.y}px - 10px)`
    });
    // Phase 6: source's second `makeCSSStyle` application site
    // (`data-grid-overlay-editor.tsx:237`) -- the overlay container carries this *cell's*
    // fully-merged theme as `--gdg-*` variables, so editor DOM (and any consumer CSS targeting
    // it) can style itself from the same values the canvas drew that cell with.
    this.applyThemeCssVariables(container, theme);
    const realLocation = [mCol - args.rowMarkerOffset, mRow];
    const state = {
      realLocation,
      mangledLocation,
      container,
      // `handle` is assigned immediately below -- `editorFn` is called synchronously and
      // never reads `state.handle` itself, only `onFinishedEditing`/`onChange` do, and those
      // can't fire before `editorFn` returns. Cast avoids a chicken-and-egg `undefined` slot.
      handle: undefined,
      currentCell: cell,
      // 9g: source validates the *initial* value too, so an editor opened over an
      // already-invalid cell starts out unable to commit (`data-grid-overlay-editor.tsx:82`).
      isValid: applyCellValidation(realLocation, cell, cell, args.validateCell).isValid,
      lastValue: cell,
      finished: false
    };
    const handle = editorFn({
      value: cell,
      isHighlighted: highlight,
      forceEditMode: focusImmediately,
      theme,
      validatedSelection: undefined,
      onChange: newValue => {
        // 9g: `validateCell` runs on every change, exactly where source runs it (its
        // `setTempValue`). A `false` result leaves the value in the editor but blocks the
        // commit; a returned cell replaces the value outright, which is how a consumer
        // normalises as the user types.
        const validation = applyCellValidation(state.realLocation, newValue, state.lastValue, args.validateCell);
        state.isValid = validation.isValid;
        state.currentCell = validation.value;
        state.lastValue = validation.value;
      },
      onFinishedEditing: (newValue, movement) => {
        this.finishOverlay(args, newValue, movement ?? [0, 0]);
      }
    });
    state.handle = handle;
    this.overlayState = state;
    container.addEventListener("keydown", ev => {
      // Mirrors source's overlay-internal `onKeyDown` (`data-grid-overlay-editor.tsx:141-165`):
      // Escape cancels, Enter (no shift -- shift+Enter is reserved for multi-line text
      // insertion by `GrowingEntry`'s `altNewline`) commits + moves down, Tab/Shift+Tab commits
      // + moves right/left. Every other key (ordinary typing, arrow keys for caret movement
      // inside the editor) is left alone to bubble normally within the editor.
      if (ev.key === "Escape") {
        ev.stopPropagation();
        ev.preventDefault();
        this.finishOverlay(args, undefined, [0, 0]);
      } else if (ev.key === "Enter" && !ev.shiftKey) {
        ev.stopPropagation();
        ev.preventDefault();
        this.finishOverlay(args, state.currentCell, [0, 1]);
      } else if (ev.key === "Tab") {
        ev.stopPropagation();
        ev.preventDefault();
        this.finishOverlay(args, state.currentCell, [ev.shiftKey ? -1 : 1, 0]);
      }
    });
    container.appendChild(handle.element);
    this.root.appendChild(container);
    // Must run after insertion -- an unattached element has no meaningful bounding rect and
    // `IntersectionObserver` would never fire for it.
    state.stopStayOnScreen = this.setupStayOnScreen(container);

    // Keyboard activation has no remaining pointer gesture that can steal the caret, so focus
    // immediately. This is important for edit-on-type: the initial key seeds the editor, and
    // the next typed character must already reach its textarea. Pointer activation remains
    // deferred because the activating mouseup can otherwise collapse the editor's select-all.
    if (focusImmediately) {
      this.focusOverlay(state);
    } else {
      window.setTimeout(() => {
        if (this.overlayState === state) this.focusOverlay(state);
      }, 0);
    }

    // Click-outside commits (mirrors source's `ClickOutsideContainer` -> `onClickOutside` ->
    // save, not cancel). Registered on the next tick rather than synchronously: this method is
    // always called from within a native event dispatch (a mouseup that activated a cell, or a
    // keydown), and adding a capture-phase `window` listener mid-dispatch must not risk catching
    // that same gesture.
    //
    // 4.5: on `windowEventTarget`, matching source -- this is the one *non*-pointer-move listener
    // it redirects, via `customEventTarget={experimental?.eventTarget}` on its
    // `ClickOutsideContainer` (`data-editor.tsx:4332`).
    window.setTimeout(() => {
      if (this.overlayState === state) {
        this.addWindowListener("mousedown", this.onOverlayOutsideClick, true);
      }
    }, 0);
  }

  /**
   * Hands the editor its focus, and catches the case where it cannot take it.
   *
   * `handle.focus()` is the editor's own contract and is always called first -- the fallback only
   * runs when focus is left somewhere outside the overlay afterwards. That happens for any editor
   * whose only control is `disabled` (`<select disabled>` in `dropdown-cell`, `<input disabled>`
   * in `range-cell`, `links-cell`'s inputs) and for any editor with nothing focusable at all,
   * including consumer-written ones. Without it, Escape/Enter/Tab reach nobody: the container's
   * `keydown` listener needs focus inside the container, and the grid's own `onKeyDown`
   * deliberately early-returns while an overlay is open. Upstream #910; the decision itself is
   * `rendering/overlay-focus.ts`, which is where its tests are.
   *
   * The active element is read from the container's **root node**, not from `document`: for a grid
   * inside a shadow root `document.activeElement` is the shadow *host*, which is outside the
   * container, so the fallback would fire on every open and steal the caret from editors that
   * focused themselves perfectly well. `getRootNode()` is the same call `resolveEventTarget`
   * (`:1951`) already uses to make the grid shadow-DOM-safe.
   */
  focusOverlay(state) {
    state.handle?.focus();
    const root = state.container.getRootNode();
    const activeElement = root.activeElement ?? null;
    if (shouldFocusOverlayContainer(state.container, activeElement)) {
      state.container.focus();
    }
  }

  /**
   * Keeps an open overlay editor from being clipped by the right edge of the window, by nudging
   * it left with a `translateX`.
   *
   * Port of source's `internal/data-grid-overlay-editor/use-stay-on-screen.ts`. Before this,
   * opening an editor on a cell near the right edge simply cut it off -- a latent, user-visible
   * defect that nothing had hit because every demo opens editors mid-grid. There was no
   * `IntersectionObserver` anywhere in this addon.
   *
   * The observer (threshold 1, i.e. "fully visible or not") is what starts the correction; the
   * rAF loop is what performs it, and re-runs because the editor can *grow* while open --
   * `GrowingEntry` gets taller and wider as you type, and a one-shot measurement would go stale.
   *
   * **Deliberate divergence from source**: source's loop never stops -- it re-queues a frame for
   * as long as the editor is open, even once the offset has converged. Here it stops as soon as
   * the correction is under half a pixel, and the observer restarts it if the editor is clipped
   * again. Same result, without burning a frame per tick for the lifetime of every editor.
   */
  setupStayOnScreen(container) {
    if (typeof IntersectionObserver === "undefined") return () => undefined;
    let offset = 0;
    let rafHandle;
    const step = () => {
      rafHandle = undefined;
      const {
        right
      } = container.getBoundingClientRect();
      // Never push the editor *right* past its anchor cell: source clamps at 0 too, so a
      // narrow editor already on screen is left exactly where the cell rect put it.
      const next = Math.min(offset + window.innerWidth - right - 10, 0);
      if (Math.abs(next - offset) < 0.5) return;
      offset = next;
      container.style.transform = `translateX(${offset}px)`;
      rafHandle = requestAnimationFrame(step);
    };
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry === undefined || entry.isIntersecting) return;
      if (rafHandle === undefined) rafHandle = requestAnimationFrame(step);
    }, {
      threshold: 1
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
    };
  }
  onOverlayOutsideClick = ev => {
    const state = this.overlayState;
    if (state === undefined) return;
    if (ev.target instanceof Node && state.container.contains(ev.target)) return;
    this.finishOverlay(this.resolveArgs(), state.currentCell, [0, 0]);
  };

  // --- Group rename (`@onGroupHeaderRenamed`) ----------------------------------------------------
  //
  // A second, much smaller inline overlay: one text box laid over a group's header band, opened by
  // the "Rename" action `resolvedGroupDetails` injects. Source builds it as its own component
  // (`data-editor/group-rename.tsx`) rather than reusing the cell overlay editor, and this keeps
  // that separation -- it shares none of the cell editor's machinery (no `provideEditor`, no
  // validation, no cursor movement on commit), and folding it in would mean threading "is this a
  // cell?" through all of it.
  //
  // Appearance is in `components/glide-data-grid-editors.css` under `.gdg-group-rename`; only the
  // geometry is set here, because only this method has the group's rect.

  groupRenameState;
  openGroupRename(groupKey, displayName, bounds) {
    // Reopening on a different group while one is already open: close the old box first rather
    // than stranding it in the DOM with its listener still attached.
    this.closeGroupRename();
    const container = document.createElement("div");
    container.className = "gdg-group-rename";
    Object.assign(container.style, {
      // Source's exact insets (`group-rename.tsx`): 1px in from the left and 2px narrower, so
      // the box sits inside the group's vertical separator lines instead of covering them.
      left: `${bounds.x + 1}px`,
      top: `${bounds.y}px`,
      width: `${bounds.width - 2}px`,
      height: `${bounds.height}px`
    });
    const input = document.createElement("input");
    input.className = "gdg-group-rename__input";
    input.type = "text";
    // The *display* name, which is what the user sees on the band. Only the callback speaks keys.
    input.value = displayName;
    input.setAttribute("data-testid", "group-rename-input");
    // Source sizes its input off the band height the same way (`min-height: max(16, h - 10)`).
    input.style.minHeight = `${Math.max(16, bounds.height - 10)}px`;
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.commitGroupRename();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this.closeGroupRename();
        // Escape should hand the keyboard back to the grid, not to the document body --
        // otherwise the next arrow key scrolls the page instead of moving the selection.
        this.root.focus();
      }
      // Every other key stays in the input. Without this the grid's own `keydown` listener on
      // `root` would also see it (the event bubbles), so typing "c" in the box would start an
      // edit-on-type on the selected cell behind it.
      ev.stopPropagation();
    });
    input.addEventListener("blur", () => this.closeGroupRename());
    container.append(input);
    this.root.append(container);
    this.groupRenameState = {
      container,
      input,
      groupKey
    };
    input.focus();
    input.setSelectionRange(0, input.value.length);

    // Deferred for the same reason as the cell editor's outside-click listener: this runs inside
    // a native mouseup dispatch, and a capture-phase listener added mid-dispatch must not catch
    // the tail of the very gesture that opened the box.
    window.setTimeout(() => {
      if (this.groupRenameState?.container === container) {
        this.addWindowListener("mousedown", this.onGroupRenameOutsideClick, true);
      }
    }, 0);
  }
  commitGroupRename() {
    const state = this.groupRenameState;
    if (state === undefined) return;
    const newValue = state.input.value;
    const groupKey = state.groupKey;
    // Close first: the callback almost always rewrites `column.group`, which re-renders the
    // grid, and the box is anchored to a band that is about to be relabelled.
    this.closeGroupRename();
    this.root.focus();
    this.resolveArgs().onGroupHeaderRenamed?.(groupKey, newValue);
  }
  closeGroupRename() {
    const state = this.groupRenameState;
    if (state === undefined) return;
    this.groupRenameState = undefined;
    this.removeWindowListener("mousedown", this.onGroupRenameOutsideClick, true);
    state.container.remove();
  }
  onGroupRenameOutsideClick = ev => {
    const state = this.groupRenameState;
    if (state === undefined) return;
    if (ev.target instanceof Node && state.container.contains(ev.target)) return;
    this.closeGroupRename();
  };

  /** Closes the overlay, optionally committing `newValue` first, then moves the active cell by
   *  `movement` if non-zero. Idempotent via `state.finished` -- source's overlay can reach this
   *  point twice for one logical close (e.g. an Enter keydown finishing the editor and a
   *  subsequent synthetic/blur-driven click-outside on the same tick), see `OverlayState.finished`'s
   *  doc comment above. */
  finishOverlay(args, newValue, movement) {
    const state = this.overlayState;
    if (state === undefined || state.finished) return;
    state.finished = true;
    this.overlayState = undefined;
    this.removeWindowListener("mousedown", this.onOverlayOutsideClick, true);
    state.stopStayOnScreen?.();
    state.handle.destroy();
    state.container.remove();

    // 9g: `validateCell` returning `false` for the live value blocks the commit but not the
    // close or the subsequent cursor movement -- source's `onFinishEditing(isValid ? newCell :
    // undefined, movement)` (`data-grid-overlay-editor.tsx:87-91`) exactly.
    const committed = state.isValid ? newValue : undefined;
    if (committed !== undefined) {
      this.commitCellEdit(args, state.mangledLocation, committed);
    } else {
      this.scheduleFullRedraw();
    }
    this.root.focus();
    if (movement[0] !== 0 || movement[1] !== 0) {
      const [mCol, mRow] = state.mangledLocation;
      // 9g: Tab off the *last* column with `onColumnAppended` configured means "make me
      // another column" rather than "move right into a wall" -- source's `isEditingLastCol &&
      // movX === 1 && onColumnAppended !== undefined` branch (`data-editor.tsx:3111`). The
      // consumer owns the columns array, so nothing moves until they add one; source resolves
      // that by polling for the new column, which needs the imperative ref (9f) this port
      // does not have yet, so the port stops at the notification.
      const {
        mappedColumns
      } = this.computeMangledLayout(args);
      const isEditingLastCol = mCol === mappedColumns.length - 1 && committed !== undefined;
      if (isEditingLastCol && movement[0] === 1 && args.onColumnAppended !== undefined) {
        void args.onColumnAppended();
      } else {
        this.moveActiveCell(args, mCol + movement[0], mRow + movement[1]);
      }
    }

    // 9g. Fires whether or not anything was committed, and after the cursor has moved -- source
    // puts it at the very end of `onFinishEditing` for the same reason (`data-editor.tsx:3125`).
    // `newValue` is the *committed* value, so a `validateCell` rejection reports `undefined`.
    args.onFinishedEditing?.(committed, [movement[0], movement[1]]);
  }

  // Delete/Backspace: clears every read-write cell in the current selection. Prefers each cell's
  // own renderer `onDelete` (richer/kind-specific, e.g. boolean-cell's `onDelete` sets `data:
  // false` rather than `BooleanEmpty`) over the generic `clearedCellValue` fallback used by
  // `onCut` -- mirrors source routing deletion through the renderer registry
  // (`data-editor-fns.ts`), which `onCut`'s simpler port (Phase 3c, predates real cell renderers
  // existing) couldn't do yet.
  deleteSelection(args) {
    const target = this.resolveDeleteTarget(args);
    if (target === undefined) return;
    const region = this.selectedRegion(args, target);
    if (region === undefined) return;
    const colStart = Math.max(region.colStart, args.rowMarkerOffset);
    if (colStart >= region.colEnd || region.rowStart >= region.rowEnd) return;
    const edits = [];
    const damaged = [];
    for (let row = region.rowStart; row < region.rowEnd; row++) {
      for (let col = colStart; col < region.colEnd; col++) {
        const realCol = col - args.rowMarkerOffset;
        const cell = args.getCellContent([realCol, row]);
        if (!isReadWriteCell(cell)) continue;
        const renderer = args.getCellRenderer(cell);
        const cleared = renderer?.onDelete?.(cell) ?? this.clearedCellValue(cell);
        if (cleared !== undefined) {
          edits.push({
            location: [realCol, row],
            value: cleared
          });
          damaged.push([col, row]);
        }
      }
    }
    if (edits.length > 0) {
      args.onCellsEdited?.(edits);
      this.drawWithDamage(new CellSet(damaged));
    }
  }

  /**
   * 9g: runs the consumer's `onDelete` and resolves what (if anything) should actually be cleared.
   *
   * Returns `undefined` when the consumer cancelled. Otherwise returns the selection to clear, in
   * mangled space -- either the live one, or the consumer's replacement shifted back in. Mirrors
   * source's `onDelete` wrapper (`data-editor.tsx:1068-1080`), which does the same shift both ways
   * so the callback only ever sees the consumer's own column indices.
   *
   * Shared by Delete/Backspace and cut, exactly as source shares it.
   */
  resolveDeleteTarget(args) {
    const onDelete = args.onDelete;
    if (onDelete === undefined) return this.mangledSelection(args);
    const result = onDelete(this.selection);
    if (result === false) return undefined;
    if (result === true) return this.mangledSelection(args);
    return mangleSelection(asConsumerSelection(result), args.rowMarkerOffset);
  }

  // --- keyboard nav + the configurable keybinding map (Phase 3b; 4.6) ---------------------------
  //
  // Port of source's `handleFixedKeybindings` (`data-editor.tsx:3188-3452`) and the tail of its
  // `onKeyDown`. Every gesture below is looked up through `rendering/keybindings.ts` and matched
  // by `rendering/is-hotkey.ts`, so all of them are remappable through `@keybindings` — which is
  // what 4.6 added. Before that this handler matched the default keys inline, and Tab, alt+Arrow,
  // primary+shift+edge and the space-bar row/column selects were simply absent.
  //
  // **The if/else chain's order is load-bearing and is source's**, not tidied. Two examples that
  // look arbitrary and are not: `selectColumn`/`selectRow` (ctrl+space / shift+space) are tested
  // before `activateCell` (whose default includes a bare space), and `goToFirstColumn` ("Home")
  // is tested after the four `go*Cell` moves so a rebinding cannot shadow plain arrow nav.
  //
  // Still not ported, and each for a reason source's own map makes visible:
  //   - `downFill`/`rightFill` — no keyboard fill command exists here (the fill handle is a mouse
  //     gesture, 9h), and they default to *off* upstream, so nothing is missing by default.
  //   - `acceptOverlay*`/`closeOverlay` — the overlay editor owns its own `keydown` listener and
  //     never reaches this handler (see the early-out below).
  //   - Row-grouping nav (`rowGroupingNavBehavior`) — §4.1, not ported at all yet.
  onKeyDown = ev => {
    if (this.destroyed || !this.isFocused) return;
    // While the overlay editor is open, its own container-level `keydown` listener (registered
    // in `openOverlay`) handles Escape/Enter/Tab and `stopPropagation()`s them -- everything
    // else (ordinary typing, arrow keys for caret movement inside the editor's textarea) must
    // bubble through untouched, not be reinterpreted as grid navigation/select-all/etc below.
    if (this.overlayState !== undefined) return;
    const args = this.resolveArgs();
    const keys = this.resolvedKeybindings(args);
    // Source threads one `details` object through every `isHotkey` call in a keydown and reads
    // `didMatch` at the end to decide whether to cancel the event. The flag latches on the
    // first match, so the reads below are "did anything at all handle this key".
    const details = {
      didMatch: false
    };
    const hk = binding => isHotkey(binding, ev, details);
    const cancel = () => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    // --- bindings that work with nothing selected ---------------------------------------------
    // Source runs this block before its `gridSelection.current === undefined` early-out, so
    // select-all and search work on a grid that has never been clicked in.
    if (hk(keys.clear)) {
      // 4.6: Escape clears the selection, and fires `@onSelectionCleared` — source does both
      // in this branch (`data-editor.tsx:3206-3209`). This port had no Escape-to-clear at all
      // before 4.6, which is why an earlier note in TODO.md described `@onSelectionCleared` as
      // "the out-of-bounds click only": that was true of this port, not of upstream.
      this.clearSelection();
      args.onSelectionCleared?.();
    } else if (hk(keys.selectAll)) {
      this.selectAll(args);
    } else if (hk(keys.search)) {
      // Toggling (rather than only opening, as source does) is this port's own 9e addition:
      // with no search bar of source's on screen there would otherwise be no keyboard way out.
      if (this.searchIsOpen(args)) {
        this.closeSearch();
      } else {
        this.openSearch();
      }
    } else if (hk(keys.delete)) {
      this.deleteSelection(args);
    }
    if (details.didMatch) {
      cancel();
      return;
    }

    // Escape with the search bar open closes it. Deliberately *after* `keys.clear` (which is
    // `any+Escape` by default and therefore claims the key first): a consumer who rebinds or
    // disables `clear` gets this back, and with the default binding the selection clear above
    // already returned.
    if (ev.key === "Escape" && this.searchIsOpen(args)) {
      this.closeSearch();
      cancel();
      return;
    }

    // --- everything below needs a current cell ------------------------------------------------
    // Mangled space throughout: `moveActiveCell`, `adjustSelection` and the selection writers
    // all work in the render engine's column space.
    const navCurrent = this.mangledSelection(args).current;
    if (navCurrent === undefined) return;
    let [col, row] = navCurrent.cell;
    // `freeMove` keeps the existing range instead of collapsing it, pushing it onto the range
    // stack — source's alt+Arrow (`updateSelectedCell(..., freeMove)`, `data-editor.tsx:3034`).
    let freeMove = false;
    if (hk(keys.scrollToSelectedCell)) {
      this.scrollCellIntoView(args, col, row);
    } else if (args.columnSelect !== "none" && hk(keys.selectColumn)) {
      this.toggleColumnSelectionFromKeyboard(args, col);
    } else if (args.rowSelect !== "none" && hk(keys.selectRow)) {
      this.toggleRowSelectionFromKeyboard(args, row);
    } else if (hk(keys.activateCell)) {
      const cellContent = this.mangledGetCellContent(args)([col, row]);
      this.activateCell(args, [col, row], cellContent, {
        highlight: true,
        activation: {
          inputType: "keyboard",
          key: ev.key
        }
      });
    } else if (hk(keys.goToNextPage)) {
      // "partial cell accounting" is source's own comment on the -4 (`data-editor.tsx:3319`).
      row += Math.max(1, (this.lastVisibleRegion?.height ?? 1) - 4);
    } else if (hk(keys.goToPreviousPage)) {
      row -= Math.max(1, (this.lastVisibleRegion?.height ?? 1) - 4);
    } else if (hk(keys.goToFirstCell)) {
      row = 0;
      col = 0;
    } else if (hk(keys.goToLastCell)) {
      row = Number.MAX_SAFE_INTEGER;
      col = Number.MAX_SAFE_INTEGER;
    } else if (hk(keys.selectToFirstCell)) {
      this.adjustSelection(args, -2, -2);
    } else if (hk(keys.selectToLastCell)) {
      this.adjustSelection(args, 2, 2);
    } else if (hk(keys.goDownCell)) {
      row += 1;
    } else if (hk(keys.goUpCell)) {
      row -= 1;
    } else if (hk(keys.goRightCell)) {
      col += 1;
    } else if (hk(keys.goLeftCell)) {
      col -= 1;
    } else if (hk(keys.goDownCellRetainSelection)) {
      row += 1;
      freeMove = true;
    } else if (hk(keys.goUpCellRetainSelection)) {
      row -= 1;
      freeMove = true;
    } else if (hk(keys.goRightCellRetainSelection)) {
      col += 1;
      freeMove = true;
    } else if (hk(keys.goLeftCellRetainSelection)) {
      col -= 1;
      freeMove = true;
    } else if (hk(keys.goToLastRow)) {
      // Deliberately excludes the trailing blank row -- source sets `row = rows - 1` with the
      // real row count (`data-editor.tsx:3357`), where `goToLastCell` above clamps against the
      // mangled count and therefore *can* land on it.
      row = args.rows - 1;
    } else if (hk(keys.goToFirstRow)) {
      row = Number.MIN_SAFE_INTEGER;
    } else if (hk(keys.goToLastColumn)) {
      col = Number.MAX_SAFE_INTEGER;
    } else if (hk(keys.goToFirstColumn)) {
      col = Number.MIN_SAFE_INTEGER;
    } else if (args.rangeSelect === "rect" || args.rangeSelect === "multi-rect") {
      if (hk(keys.selectGrowDown)) {
        this.adjustSelection(args, 0, 1);
      } else if (hk(keys.selectGrowUp)) {
        this.adjustSelection(args, 0, -1);
      } else if (hk(keys.selectGrowRight)) {
        this.adjustSelection(args, 1, 0);
      } else if (hk(keys.selectGrowLeft)) {
        this.adjustSelection(args, -1, 0);
      } else if (hk(keys.selectToLastRow)) {
        this.adjustSelection(args, 0, 2);
      } else if (hk(keys.selectToFirstRow)) {
        this.adjustSelection(args, 0, -2);
      } else if (hk(keys.selectToLastColumn)) {
        this.adjustSelection(args, 2, 0);
      } else if (hk(keys.selectToFirstColumn)) {
        this.adjustSelection(args, -2, 0);
      }
    }
    if (details.didMatch) {
      // 4.1: `navigationBehavior` steps the target row off any group header it landed on.
      // Source's placement exactly (`data-editor.tsx:3412-3440`) -- immediately before the
      // move, on the *unclamped* row.
      //
      // That placement carries an upstream quirk this port reproduces rather than papers over:
      // `goToFirstRow` sets `row` to `MIN_SAFE_INTEGER` as a "clamp me to the top" sentinel,
      // and the skip sees the sentinel, reads it as an upward move, runs off the top of the
      // grid and restores the starting row. So under `skip`, `skip-up` or `block`, Ctrl+Home
      // does nothing. Fixing it would mean inventing a direction rule upstream does not have
      // (the sentinel has no direction of travel), so it is left matching source.
      row = skipGroupHeaders(row, navCurrent.cell[1], args.rows, args.flattenedRowGroups, args.rowGrouping?.navigationBehavior);

      // Source's `cancelOnlyOnMove`, which exists so a nav key that hits a wall is left
      // *unprevented* and focus can Tab out of the grid. It is true exactly when a movement
      // binding matched, which here is "the target cell expression changed" -- a move into a
      // wall still counts, and `moved` is what decides afterwards.
      const wantsMove = col !== navCurrent.cell[0] || row !== navCurrent.cell[1];
      const moved = wantsMove && this.moveActiveCell(args, col, row, freeMove);
      if (moved || !wantsMove || args.trapFocus) {
        cancel();
      }
      return;
    }

    // --- type-to-overwrite --------------------------------------------------------------------
    // Not a keybinding: any printable character opens the editor seeded with it. Source keeps it
    // outside the map too, in `onKeyDown` after `handleFixedKeybindings` returns false
    // (`data-editor.tsx:3505-3524`). It runs last precisely so a bound key wins over it.
    const primary = browserIsOSX.value ? ev.metaKey : ev.ctrlKey;
    if (args.editOnType && !primary && !ev.metaKey && ev.key.length === 1 && PRINTABLE_CHAR_RE.test(ev.key) && row >= 0) {
      const cellContent = this.mangledGetCellContent(args)([col, row]);
      if (!isInnerOnlyCellKind(cellContent.kind) && isReadWriteCell(cellContent)) {
        this.activateCell(args, [col, row], cellContent, {
          highlight: false,
          initialValue: ev.key,
          activation: {
            inputType: "keyboard",
            key: ev.key
          }
        });
        cancel();
      }
    }
  };

  /**
   * 4.6: the realized keybinding map, memoized on the consumer's `@keybindings` object.
   *
   * Read once per keydown rather than per draw, so it is not one of `computeCanBlit`'s
   * identity-compared fields — but realizing 34 bindings on every keypress would still be waste,
   * and a consumer passing an inline hash gets a new object each render, so the cache is keyed on
   * identity with a rebuild when it changes.
   */
  keybindingsCache;
  resolvedKeybindings(args) {
    const cached = this.keybindingsCache;
    if (cached !== undefined && cached.src === args.keybindings) return cached.value;
    const value = resolveKeybindings(args.keybindings);
    this.keybindingsCache = {
      src: args.keybindings,
      value
    };
    return value;
  }

  /**
   * ctrl+space. Port of source's `keys.selectColumn` branch (`data-editor.tsx:3278-3288`), which
   * is deliberately simpler than the mouse path: no shift-range, no `lastSelectedCol` tracking —
   * it toggles the current cell's column and nothing else.
   */
  toggleColumnSelectionFromKeyboard(args, mangledCol) {
    const selected = this.mangledSelection(args).columns;
    if (selected.hasIndex(mangledCol)) {
      this.applyMangledSelection(args, setSelectedColumns(this.mangledSelection(args), selected.remove(mangledCol), undefined, true, this.selectionOptions(args)));
    } else if (args.columnSelect === "single") {
      this.applyMangledSelection(args, setSelectedColumns(this.mangledSelection(args), CompactSelection.fromSingleSelection(mangledCol), undefined, true, this.selectionOptions(args)));
    } else {
      this.applyMangledSelection(args, setSelectedColumns(this.mangledSelection(args), undefined, mangledCol, true, this.selectionOptions(args)));
    }
  }

  /** shift+space. Source's `keys.selectRow` branch (`data-editor.tsx:3289-3299`). Row selection
   *  carries no column coordinate, so this one stays in consumer space, like the mouse path. */
  toggleRowSelectionFromKeyboard(args, row) {
    const selected = this.selection.rows;
    if (selected.hasIndex(row)) {
      this.applySelection(setSelectedRows(this.selection, selected.remove(row), undefined, true, this.selectionOptions(args)));
    } else if (args.rowSelect === "single") {
      this.applySelection(setSelectedRows(this.selection, CompactSelection.fromSingleSelection(row), undefined, true, this.selectionOptions(args)));
    } else {
      this.applySelection(setSelectedRows(this.selection, undefined, row, true, this.selectionOptions(args)));
    }
    this.lastSelectedRow = row;
  }

  // Port of `updateSelectedCell`'s core (clamp + no-op-if-unchanged + `setCurrent(..., "keyboard-nav")`
  // + scroll-into-view), minus the `freeMove`/`lastSent` concerns that don't apply to this port
  // yet. Returns whether the active cell actually moved (false when the clamped target equals the
  // current cell -- i.e. the move was into a wall). Phase 4d: the row clamp's upper bound is
  // `effectiveRows(args) - 1`, not `args.rows - 1`, so plain Arrow-key nav (and Ctrl+End, via its
  // own `targetRow` above) can reach the trailing blank row -- mirrors source's
  // `updateSelectedCell`'s `rowMax = mangledRows - (fromEditingTrailingRow ? 0 : 1)`
  // (`data-editor.tsx:3026`, the common non-`fromEditingTrailingRow` case).
  moveActiveCell(args, colIn, rowIn,
  /** 4.6: alt+Arrow. Keep whatever is selected and start a new 1x1 range at the moved cursor,
   *  pushing the old range onto the range stack -- source's `freeMove`
   *  (`data-editor.tsx:3034-3049`). Requires a multi-cell range to have anything to keep. */
  freeMove = false) {
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    const minCol = args.rowMarkerOffset;
    const maxCol = mappedColumns.length - 1;
    const col = Math.min(Math.max(colIn, minCol), maxCol);
    const row = Math.min(Math.max(rowIn, 0), this.effectiveRows(args) - 1);

    // `colIn` is mangled (callers: keyboard nav, overlay-editor movement, search navigation),
    // so the whole method is.
    const mangledSelection = this.mangledSelection(args);
    const current = mangledSelection.current;
    if (current !== undefined && current.cell[0] === col && current.cell[1] === row) return false;
    if (freeMove && current !== undefined) {
      // Deliberately bypasses `setCurrentSelection`, exactly as source bypasses `setCurrent`
      // here: the whole point is to *not* apply the collapse-and-replace behaviour that writer
      // encodes. Only a range worth keeping is stacked -- a 1x1 range would just accumulate.
      const rangeStack = current.range.width > 1 || current.range.height > 1 ? [...current.rangeStack, current.range] : [...current.rangeStack];
      this.applyMangledSelection(args, {
        ...mangledSelection,
        current: {
          cell: [col, row],
          range: {
            x: col,
            y: row,
            width: 1,
            height: 1
          },
          rangeStack
        }
      });
      this.scrollCellIntoView(args, col, row);
      return true;
    }
    const result = setCurrentSelection(mangledSelection, {
      cell: [col, row],
      range: {
        x: col,
        y: row,
        width: 1,
        height: 1
      }
    }, true, false, "keyboard-nav", this.selectionOptions(args));
    this.applyMangledSelection(args, result.selection);
    this.scrollCellIntoView(args, col, row);
    return true;
  }

  // Port of `adjustSelection`'s motion logic. `+/-1` is "motion up/down/left/right" (shift+Arrow)
  // and `+/-2` is "jump to the edge" (primary+shift+Arrow/Home/End), added in 4.6 -- both are
  // source's, with its case numbering kept so the two files read side by side. Not ported: the
  // span-skipping (`disallowed`/`getSpanStops`), which has no meaning without span support.
  // Grows/shrinks the range on the edge opposite the anchor cell
  // (`selection.current.cell`); shrinks back in on the near edge once the far edge has retreated
  // past the anchor. Exactly one of `dx`/`dy` is non-zero per call (a single arrow keypress).
  adjustSelection(args, dx, dy) {
    // Mangled: the column clamps below are `args.rowMarkerOffset` and `mappedColumns.length`,
    // and `scrollCellIntoView` takes a mangled column.
    const mangledSelection = this.mangledSelection(args);
    const current = mangledSelection.current;
    if (current === undefined) return;
    const [col, row] = current.cell;
    const old = current.range;
    let left = old.x;
    let right = old.x + old.width;
    let top = old.y;
    let bottom = old.y + old.height;
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    const minCol = args.rowMarkerOffset;
    const maxColExclusive = mappedColumns.length;
    const maxRowExclusive = args.rows;
    if (dy === 2) {
      // jump to the last row: the range becomes anchor..end
      bottom = maxRowExclusive;
      top = row;
    } else if (dy === -2) {
      // jump to the first row: start..anchor, inclusive of the anchor
      top = 0;
      bottom = row + 1;
    } else if (dy === 1) {
      // motion down
      if (top < row) {
        top++;
      } else {
        bottom = Math.min(maxRowExclusive, bottom + 1);
      }
    } else if (dy === -1) {
      // motion up
      if (bottom > row + 1) {
        bottom--;
      } else {
        top = Math.max(0, top - 1);
      }
    }
    if (dx === 2) {
      // jump to the last column
      right = maxColExclusive;
      left = col;
    } else if (dx === -2) {
      // jump to the first real column -- `minCol`, not 0, so the row-marker column can never
      // end up inside a selection (source uses `rowMarkerOffset` here for the same reason).
      left = minCol;
      right = col + 1;
    } else if (dx === 1) {
      // motion right
      if (left < col) {
        left++;
      } else {
        right = Math.min(maxColExclusive, right + 1);
      }
    } else if (dx === -1) {
      // motion left
      if (right > col + 1) {
        right--;
      } else {
        left = Math.max(minCol, left - 1);
      }
    }
    const result = setCurrentSelection(mangledSelection, {
      cell: current.cell,
      range: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      }
    }, true, false, "keyboard-select", this.selectionOptions(args));
    this.applyMangledSelection(args, result.selection);

    // Scroll the edge that actually moved into view (mirrors source's per-branch `scrollTo`
    // calls in `adjustSelection`), not the anchor cell.
    const edgeCol = dx > 0 ? right - 1 : dx < 0 ? left : col;
    const edgeRow = dy > 0 ? bottom - 1 : dy < 0 ? top : row;
    this.scrollCellIntoView(args, edgeCol, edgeRow);
  }

  // Port of `handleFixedKeybindings`'s `selectAll` branch (`data-editor.tsx`). Note this
  // deliberately does NOT go through the `setCurrentSelection` writer (source calls
  // `setGridSelection` directly here too). `rows`/`columns` CompactSelections stay empty;
  // "select all" is expressed purely via `current.range` covering the whole grid, matching source
  // exactly (verified against `data-editor.tsx`'s `keys.selectAll` branch).
  //
  // Built directly in CONSUMER space, which is what makes it read as plainly as it does: the
  // range is columns `0 .. columns.length` of rows `0 .. rows`. Source writes the same thing
  // shifted (`x: rowMarkerOffset`, width `columns.length`) because its internal selection is
  // mangled; `mangledSelection()` reproduces exactly that on the way to the renderer, so the
  // marker column still never ends up inside the selection.
  selectAll(args) {
    const current = this.selection.current;
    this.applySelection(asConsumerSelection({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: {
        cell: current?.cell ?? [0, 0],
        range: {
          x: 0,
          y: 0,
          width: args.columns.length,
          height: args.rows
        },
        rangeStack: []
      }
    }));
  }

  // --- search (Phase 9e) -------------------------------------------------------------------
  // Port of source's `DataGridSearch`, minus the UI. Source fuses scanner, state and overlay into
  // one React component; here the scanner is `rendering/search.ts` (pure, unit-tested), this
  // section is the state and wiring, and the UI is the opt-in `<GlideSearchBar>`.
  //
  // Every piece of state below has a controlled arg and an uncontrolled fallback, mirroring
  // source's `showSearchIn ?? showSearchInner` pattern -- so search works out of the box with no
  // args set at all, and a consumer can take over any individual piece without taking over all.

  searchOpenInner = false;
  searchValueInner = "";
  searchResultsInner = [];
  searchSelectedIndex = -1;
  searchStatus;
  search;
  /** Guards the "select and scroll to the active match" side effect so it runs only when the
   *  navigated match actually changes. Source keeps the same guard (`lastSent`) because the
   *  results callback fires on every streamed chunk, not only on navigation. */
  lastNavigatedTo;
  searchIsOpen(args) {
    return args.showSearch ?? this.searchOpenInner;
  }

  /**
   * What the renderer actually gets as `prelightCells`: search matches while a search is open
   * with results, the consumer's own `prelightCells` otherwise.
   *
   * **Search wins rather than merging, and that is source's design, not a shortcut.** Source's
   * `DataGridSearchProps` is `Omit<ScrollingDataGridProps, "prelightCells">` -- it removes the
   * prop outright, so a consumer literally cannot pass one alongside search, and search sets
   * `prelightCells={searchResults}` unconditionally. Merging the two would be an invention, and
   * a costly one: it allocates a combined array every draw, which `computeCanBlit`
   * identity-compares, so it would silently disable the scroll blit fast path for the whole
   * lifetime of the grid rather than just while a scan runs.
   *
   * When search is closed the consumer's array is passed through by reference, unchanged, so the
   * blit path is exactly as it was before search existed.
   */
  effectivePrelightCells(args) {
    if (!this.searchIsOpen(args)) return args.prelightCells;
    const results = this.effectiveSearchResults(args);
    return results.length > 0 ? results : args.prelightCells;
  }
  searchQuery(args) {
    return args.searchValue ?? this.searchValueInner;
  }

  /** The results actually in effect: a consumer's own if supplied, else the scanner's. */
  effectiveSearchResults(args) {
    return args.searchResults ?? this.searchResultsInner;
  }
  searchSnapshot(args) {
    return {
      isOpen: this.searchIsOpen(args),
      value: this.searchQuery(args),
      results: this.effectiveSearchResults(args),
      selectedIndex: this.searchSelectedIndex,
      rowsSearched: this.searchStatus?.rowsSearched ?? 0,
      rows: args.rows,
      status: this.searchStatus
    };
  }
  emitSearchState(args) {
    args.onSearchStateChange?.(this.searchSnapshot(args));
  }

  /**
   * Reads a chunk of cells for the scanner, in **mangled** (row-marker-inclusive) column space.
   *
   * This is source's `getCellsForSelectionMangled`, which Phase 9g deliberately left unported
   * because search was its only consumer and it would have been dead code. It has one now.
   *
   * The shift matters: search results are used as `prelightCells`, which the renderer reads in
   * mangled space, and are fed to `moveActiveCell`, which is also mangled. So the scan must
   * produce mangled columns -- and a placeholder cell stands in for the row-marker column so the
   * indices line up. That placeholder is `Loading`, which `getSearchTestString` reports as
   * unsearchable, so a row marker can never itself be a match.
   */
  searchChunkMangled(args, startRow, height) {
    const offset = args.rowMarkerOffset;
    const cells = this.cellsForSelectionSync(args, {
      x: 0,
      y: startRow,
      width: args.columns.length,
      height
    });
    if (cells === undefined) return undefined;
    if (offset === 0) return cells;
    const marker = {
      kind: GridCellKind.Loading,
      allowOverlay: false
    };
    return cells.map(row => [marker, ...row]);
  }
  beginSearch(args, query) {
    this.search?.cancel();
    this.searchSelectedIndex = -1;
    this.lastNavigatedTo = undefined;

    // A consumer supplying `searchResults` owns matching entirely -- do not also scan.
    if (args.searchResults !== undefined) {
      this.searchStatus = {
        rowsSearched: args.rows,
        results: args.searchResults.length
      };
      this.emitSearchState(args);
      return;
    }
    if (query === "") {
      this.searchResultsInner = [];
      this.searchStatus = undefined;
      this.emitSearchState(args);
      return;
    }
    this.search = new IncrementalSearch({
      rows: args.rows,
      // Start at the first visible row, so matches already on screen surface first. Source
      // does the same (`cellYOffsetRef.current`).
      startRow: this.cellYOffset,
      fetchChunk: (startRow, height) => this.searchChunkMangled(this.resolveArgs(), startRow, height),
      onProgress: (results, status) => {
        const liveArgs = this.resolveArgs();
        this.searchResultsInner = results;
        this.searchStatus = status;
        // `prelightCells` is identity-compared by `computeCanBlit`, and this genuinely is a
        // new array each chunk, so the blit is legitimately defeated while a scan runs --
        // the highlight really did change. It re-engages as soon as the scan settles.
        this.scheduleFullRedraw();
        this.notifySearchResults(liveArgs);
        this.emitSearchState(liveArgs);
      }
    });
    this.searchStatus = undefined;
    this.searchResultsInner = [];
    this.search.start(query);
    this.emitSearchState(args);
  }

  /** Hands results to the consumer in *their* coordinate space, and -- unless they've taken over
   *  navigation by supplying `onSearchResultsChanged` -- selects and scrolls to the active match. */
  notifySearchResults(args) {
    const results = this.effectiveSearchResults(args);
    const index = this.searchSelectedIndex;
    if (args.onSearchResultsChanged !== undefined) {
      const offset = args.rowMarkerOffset;
      args.onSearchResultsChanged(offset === 0 ? results : results.map(([col, row]) => [col - offset, row]), index);
      return;
    }
    if (index < 0 || index >= results.length) return;
    const [col, row] = results[index];
    if (this.lastNavigatedTo?.[0] === col && this.lastNavigatedTo[1] === row) return;
    this.lastNavigatedTo = [col, row];
    this.moveActiveCell(args, col, row);
  }

  /** Opens search. Idempotent. */
  openSearch() {
    const args = this.resolveArgs();
    if (this.searchIsOpen(args)) return;
    this.searchOpenInner = true;
    this.emitSearchState(args);
  }

  /** Closes search, clearing results and cancelling any scan. Mirrors source's `onClose`. */
  closeSearch() {
    const args = this.resolveArgs();
    this.search?.cancel();
    this.searchOpenInner = false;
    this.searchValueInner = "";
    this.searchResultsInner = [];
    this.searchStatus = undefined;
    this.searchSelectedIndex = -1;
    this.lastNavigatedTo = undefined;
    args.onSearchClose?.();
    args.onSearchValueChange?.("");
    args.onSearchResultsChanged?.([], -1);
    this.scheduleFullRedraw();
    this.emitSearchState(args);
    this.root.focus();
  }

  /** Sets the query and (re)starts the scan. Always emits `onSearchValueChange`, controlled or
   *  not, so a consumer can observe the query without owning it -- source's behaviour. */
  setSearchValue(value) {
    const args = this.resolveArgs();
    this.searchValueInner = value;
    args.onSearchValueChange?.(value);
    this.beginSearch(args, value);
  }

  /** Moves to the next match, wrapping. No-op with no results. */
  searchNext() {
    this.stepSearch(1);
  }

  /** Moves to the previous match, wrapping. No-op with no results. */
  searchPrev() {
    this.stepSearch(-1);
  }
  stepSearch(delta) {
    const args = this.resolveArgs();
    const results = this.effectiveSearchResults(args);
    if (results.length === 0) return;
    // `+ results.length` before the modulo: JS `%` keeps the sign of the dividend, so -1 % n is
    // -1, not n-1. Source handles the same case with an explicit `if (newIndex < 0)`.
    this.searchSelectedIndex = (this.searchSelectedIndex + delta + results.length) % results.length;
    this.notifySearchResults(args);
    this.emitSearchState(args);
  }

  /** Current search state, for a UI that needs to read it rather than wait for a change event. */
  getSearchState() {
    return this.searchSnapshot(this.resolveArgs());
  }

  // --- Phase 9f: the imperative API surface -----------------------------------------------------
  //
  // Port of source's `DataEditorRef` (`data-editor.tsx:715-760`, implemented at `:3996-4118`).
  // `<GlideDataGrid>` re-exports each of these on the `GlideDataGridApi` object it hands to
  // `@onReady` and yields; see that interface for the consumer-facing docs.
  //
  // **Every column index crossing this boundary is in CONSUMER space** -- these methods add
  // `rowMarkerOffset` on the way in and subtract it on the way out, exactly as source does at the
  // same boundary (`:3999`, `:4023`, `:4088`, `:4104`). That is the whole reason they live here
  // rather than being called through from the component: the conversion has to happen once, in the
  // place that knows the offset.

  /** Focuses the grid, so keyboard navigation works without a click first. */
  focus() {
    if (this.destroyed) return;
    this.root.focus();
  }

  /**
   * Screen-space (client) bounds of a cell, header, or -- with no arguments -- the whole scrollable
   * content. `undefined` when the target does not exist or is scrolled out of the drawn region.
   *
   * Client space rather than root-relative because the point of it is positioning something
   * outside the grid (a tooltip, a popover), which is what source uses it for too
   * (`data-grid.tsx:494-495` adds the canvas rect before returning).
   */
  getBounds(col, row) {
    if (this.destroyed) return undefined;
    const rootRect = this.root.getBoundingClientRect();
    if (col === undefined && row === undefined) {
      // The whole scroll surface, including the parts scrolled out of view -- so a negative
      // origin is expected and correct. Source computes the same thing from its scroller
      // (`data-editor.tsx:4014-4021`).
      return {
        x: rootRect.x - this.scrollerEl.scrollLeft,
        y: rootRect.y - this.scrollerEl.scrollTop,
        width: this.scrollerEl.scrollWidth,
        height: this.scrollerEl.scrollHeight
      };
    }
    const args = this.resolveArgs();
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    const mangledCol = (col ?? 0) + args.rowMarkerOffset;
    // Source defaults the row to `-1`, the column header -- `getBounds(col)` with one argument
    // means "where is that column's header", which is what a header popover needs.
    const targetRow = row ?? -1;
    if (mangledCol < 0 || mangledCol >= mappedColumns.length) return undefined;
    if (targetRow < -2 || targetRow >= this.effectiveRows(args)) return undefined;
    const rect = this.computeCellRect(args, mangledCol, targetRow);
    if (rect.width === 0 || rect.height === 0) return undefined;
    return {
      x: rect.x + rootRect.x,
      y: rect.y + rootRect.y,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * Scrolls a cell into view. `col`/`row` are in consumer space.
   *
   * `params` covers source's `dir`/`paddingX`/`paddingY`/`hAlign`/`vAlign`; `behavior` is
   * `"smooth"` or `"auto"`. Source's `{amount, unit: "px"}` column/row form is **not ported** --
   * see `GlideDataGridApi.scrollTo`.
   */
  scrollTo(col, row, params) {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    if (params?.behavior === "smooth") {
      // `scrollCellIntoView` accumulates onto `scrollLeft`/`scrollTop`, which is an instant
      // jump. Smooth needs the one-shot `scrollTo({behavior})` call instead, so the delta is
      // computed the same way and then applied differently.
      this.scrollToSmooth(args, col + args.rowMarkerOffset, row, params);
      return;
    }
    this.scrollCellIntoView(args, col + args.rowMarkerOffset, row, params);
  }
  scrollToSmooth(args, mangledCol, row, params) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    if (mangledCol < 0 || mangledCol >= mappedColumns.length || row < 0 || row >= this.effectiveRows(args)) return;
    const target = this.computeCellRect(args, mangledCol, row);
    if (target.width === 0 || target.height === 0) return;
    const delta = computeScrollDelta({
      target,
      width: this.width,
      height: this.height,
      frozenWidth: getStickyWidth(mappedColumns),
      headerHeight: this.totalHeaderHeight(args)
    }, {
      ...params,
      targetColumnIsFrozen: mangledCol < freezeColumns
    });
    if (delta.x === 0 && delta.y === 0) return;
    this.scrollerEl.scrollTo({
      left: this.scrollerEl.scrollLeft + delta.x,
      top: this.scrollerEl.scrollTop + delta.y,
      behavior: "smooth"
    });
  }

  /**
   * Re-measures the given columns from their currently-visible cells and reports the result
   * through `onColumnResize`, exactly as a user-driven resize would. Consumer-space indices.
   *
   * **Notification only** -- like every other resize path in this port, the consumer owns the
   * columns array and nothing changes until they apply the new width. Silently does nothing
   * without an `onColumnResize`, matching source (`normalSizeColumn`, `data-editor.tsx:2195`).
   */
  remeasureColumns(cols) {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    const onColumnResize = args.onColumnResize;
    if (onColumnResize === undefined) return;
    const ctx = this.canvasEl.getContext("2d");
    if (ctx === null) return;
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    const visible = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
    const theme = this.mergedTheme(args);
    // Source samples the visible rows only (`visibleRegionRef`), not the whole grid -- measuring
    // a million rows on demand is not something an API call may do.
    const height = Math.min(visible.height, args.rows - visible.y);
    for (const col of cols) {
      const column = args.columns[col];
      if (column === undefined) continue;
      const sample = height > 0 ? this.cellsForSelectionSync(args, {
        x: col,
        y: visible.y,
        width: 1,
        height
      }) : [];
      if (sample === undefined) continue; // consumer answered asynchronously; nothing to measure
      // `measureColumn` indexes each sampled row by column index, and the sample above is one
      // column wide, so the index within it is always 0 -- not `col`.
      const previousFont = ctx.font;
      ctx.font = theme.baseFontFull;
      const width = measureColumn(ctx, theme, column, 0, sample, args.getCellRenderer, {
        minColumnWidth: args.minColumnWidth,
        maxColumnWidth: args.maxColumnWidth,
        removeOutliers: false
      });
      ctx.font = previousFont;
      onColumnResize(column, width, col, width);
    }
  }

  /**
   * The `GridMouseEventArgs` a pointer at the given *client* coordinates would produce, without
   * any pointer event having happened. Exposes the hit test hover/click already run through.
   * `undefined` only if the grid has been torn down.
   */
  getMouseArgsForPosition(clientX, clientY, ev) {
    if (this.destroyed) return undefined;
    const args = this.resolveArgs();
    const hit = this.resolveHitAtPoint(args, clientX, clientY, ev);
    const item = hit.kind === "out-of-bounds" ? undefined : hit.location;
    return this.buildMouseEventArgs(args, item, {
      shiftKey: hit.shiftKey,
      ctrlKey: hit.ctrlKey,
      metaKey: hit.metaKey,
      isTouch: false,
      isEdge: false,
      button: hit.button,
      buttons: hit.buttons,
      scrollEdge: NO_SCROLL_EDGE,
      localX: hit.localX,
      localY: hit.localY
    });
  }

  /**
   * Programmatically appends a row, then focuses (and optionally opens the editor on) `col` in it.
   * Consumer-space column.
   *
   * Resolves once the focus has been placed, or once it has given up. The append itself is the
   * consumer's -- `onRowAppended` is what actually adds the row -- so this polls for `rows` to grow
   * before focusing anything, with source's backoff (`data-editor.tsx:1703-1712`). It is the only
   * shape that can work: the consumer's tracked state has not flushed when `onRowAppended` returns.
   */
  async appendRow(col, openOverlay = true, behavior) {
    if (this.destroyed) return;
    const args = this.resolveArgs();
    const mangledCol = col + args.rowMarkerOffset;
    // A column that opts out of the trailing row opts out of being appended into, same guard
    // source applies first (`:1690`).
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    if (mappedColumns[mangledCol]?.trailingRowOptions?.disabled === true) return;
    const rowsBefore = args.rows;
    const placement = await args.onRowAppended?.();
    const landedAt = await this.waitForGrowth(() => this.resolveArgs().rows, rowsBefore);
    if (landedAt === undefined) return;
    const row = typeof placement === "number" ? placement : placement === "top" ? 0 : rowsBefore;
    this.focusAppended(mangledCol, row, openOverlay, behavior);
  }

  /**
   * The column half of {@link appendRow}: fires `onColumnAppended`, waits for the consumer's
   * columns array to actually grow, then focuses `row` in the new column.
   */
  async appendColumn(row, openOverlay = true) {
    if (this.destroyed) return;
    const colsBefore = this.resolveArgs().columns.length;
    const placement = await this.resolveArgs().onColumnAppended?.();
    const landedAt = await this.waitForGrowth(() => this.resolveArgs().columns.length, colsBefore);
    if (landedAt === undefined) return;
    const args = this.resolveArgs();
    const col = typeof placement === "number" ? placement : placement === "left" ? 0 : colsBefore;
    this.focusAppended(col + args.rowMarkerOffset, row, openOverlay, undefined);
  }

  /**
   * Waits for `read()` to exceed `before`, with source's escalating backoff (`50 + backoff * 2`,
   * giving up past 500ms). Resolves with the new value, or `undefined` if it never grew.
   *
   * This exists because an append is *asynchronous by construction* in both projects: the grid
   * only notifies, the consumer owns the data, and their state update lands whenever their
   * framework gets to it. Polling is source's answer and it is the right one here too -- Ember
   * gives no "the consumer has finished reacting" hook either.
   */
  waitForGrowth(read, before) {
    return new Promise(resolve => {
      let backoff = 0;
      const check = () => {
        if (this.destroyed) {
          resolve(undefined);
          return;
        }
        const now = read();
        if (now > before) {
          resolve(now);
          return;
        }
        if (backoff >= 500) {
          resolve(undefined);
          return;
        }
        backoff = 50 + backoff * 2;
        window.setTimeout(check, backoff);
      };
      check();
    });
  }

  /**
   * Which consumer-space column the trailing blank row should focus when activated at
   * `mangledCol`. Port of source's `getCustomNewRowTargetColumn` (`data-editor.tsx:1795-1815`):
   * the clicked column's own `trailingRowOptions.targetColumn` wins over the grid-level one, and a
   * `GridColumn` object is resolved by identity against `columns` so it survives reordering.
   *
   * Falls back to the clicked column. Note source resolves this in mangled space and this returns
   * consumer space -- `appendRow` takes consumer space, so the conversion belongs here.
   */
  resolveNewRowTargetColumn(args, mangledCol) {
    return resolveNewRowTarget(args.columns, args.trailingRowOptions?.targetColumn, mangledCol - args.rowMarkerOffset);
  }

  /** Shared tail of `appendRow`/`appendColumn`: scroll it into view, select it, optionally open
   *  its editor. `mangledCol` is mangled; `row` is a row index. */
  focusAppended(mangledCol, row, openOverlay, behavior) {
    const args = this.resolveArgs();
    this.scrollTo(mangledCol - args.rowMarkerOffset, row, behavior === undefined ? undefined : {
      behavior
    });
    this.applyMangledSelection(args, setCurrentSelection(this.mangledSelection(args), {
      cell: [mangledCol, row],
      range: {
        x: mangledCol,
        y: row,
        width: 1,
        height: 1
      }
    }, false, false, "edit", this.selectionOptions(args)).selection);
    if (!openOverlay) return;
    const cellContent = this.mangledGetCellContent(args)([mangledCol, row]);
    if (isInnerOnlyCellKind(cellContent.kind)) return;
    const cell = cellContent;
    if (!cell.allowOverlay || !isReadWriteCell(cell) || cell.readonly === true) return;
    // Source defers a frame so the scroll it just requested has a chance to land before the
    // overlay measures the cell it is positioning itself over (`data-editor.tsx:1733-1735`).
    window.setTimeout(() => {
      if (this.destroyed) return;
      const liveArgs = this.resolveArgs();
      this.activateCell(liveArgs, [mangledCol, row], this.mangledGetCellContent(liveArgs)([mangledCol, row]), {
        highlight: true,
        activation: {
          inputType: "keyboard",
          key: "Enter"
        }
      });
    }, 0);
  }

  /**
   * Synthesises a user interaction. Source's `emit` takes five event names; this port implements
   * **`"delete"`** only, and the union is narrow on purpose so adding the rest later is not a
   * breaking change. The other four are not simple exposures:
   *
   * - `"copy"`/`"paste"` -- this port's clipboard handlers require a live `ClipboardEvent`, because
   *   `clipboardData.setData` stops working once a `copy` handler has awaited (the deliberate
   *   divergence recorded in 9g). Source's eventless path goes through the async Clipboard API,
   *   which this port does not use anywhere.
   * - `"fill-right"`/`"fill-down"` -- source synthesises Ctrl+R/Ctrl+D keydowns, and **this port
   *   has no such keybindings** (9h's keybinding backlog). Adding them here would be implementing
   *   the feature under an API method's name, not exposing it.
   */
  emit(event) {
    if (this.destroyed) return;
    if (event === "delete") {
      this.deleteSelection(this.resolveArgs());
    }
  }

  /**
   * Scrolls the minimum distance that makes a cell fully visible, doing nothing if it already is.
   * Internal callers (keyboard nav, `appendRow`) use this; `scrollTo` below is the public 9f
   * entry point and adds padding/alignment on top.
   *
   * `col` is MANGLED (the row-marker column is index 0 when markers are on), matching every other
   * internal caller of `computeBounds`. `scrollTo` converts.
   */
  scrollCellIntoView(args, col, row, params) {
    const {
      mappedColumns,
      freezeColumns
    } = this.computeMangledLayout(args);
    if (col < 0 || col >= mappedColumns.length || row < 0 || row >= this.effectiveRows(args)) return;
    const target = this.computeCellRect(args, col, row);
    // A cell that is scrolled entirely out of the drawn region gets a zero-size rect back;
    // scrolling to it would land on the origin, so source bails (`data-editor.tsx:1547`).
    if (target.width === 0 || target.height === 0) return;
    const delta = computeScrollDelta({
      target,
      width: this.width,
      height: this.height,
      frozenWidth: getStickyWidth(mappedColumns),
      headerHeight: this.totalHeaderHeight(args)
    }, {
      ...params,
      targetColumnIsFrozen: col < freezeColumns
    });

    // Assign only a moving axis: writing `scrollLeft`/`scrollTop` at all cancels a smooth scroll
    // already in flight, so a no-op write is not actually a no-op.
    if (delta.x !== 0) this.scrollerEl.scrollLeft += delta.x;
    if (delta.y !== 0) this.scrollerEl.scrollTop += delta.y;
  }

  // --- copy/cut/paste (Phase 3c) -----------------------------------------------------------------
  // Ported from `data-editor.tsx`'s `onCopy`/`onCut`/`onPasteInternal` + `copy-paste.ts` (see
  // `src/rendering/copy-paste.ts` and PORTING-NOTES.md's Phase 3 section for the full research).
  // Simplification vs source, documented in PORTING-NOTES.md: `selectedRegion` treats a selected
  // `rows`/`columns` CompactSelection as its min..max bounding box rather than iterating each
  // disjoint slice individually -- correct for the common contiguous case (a single shift-click
  // range, which is how selection is actually produced today), over-inclusive only for a
  // hypothetical disjoint multi-row/column selection, which nothing in this port can currently
  // produce (3a's row/column click handling always replaces-or-extends a single contiguous run).

  /** Mangled (row-marker-space) column/row bounds of the current selection, or `undefined` if
   *  nothing is selected. `colEnd`/`rowEnd` are exclusive.
   *
   *  Phase 4d: `rowEnd` is always clamped to `args.rows` (real data rows only), even for the
   *  `current`-range branch, since keyboard nav can now land `selection.current.cell`/`.range` on
   *  the trailing blank row (see `moveActiveCell`'s widened clamp) -- copy/cut/delete must never
   *  hand that row's index to the caller's own `getCellContent` (it isn't real data and the
   *  caller has no cell for it). The `rows`/`columns` CompactSelection branches below already used
   *  `args.rows` and needed no change. */
  selectedRegion(args,
  // 9g: `onDelete` may answer with a *different* selection to clear, so the region has to be
  // computable from something other than the live one. Defaults to the live selection.
  selection) {
    const sel = selection ?? this.mangledSelection(args);
    const {
      mappedColumns
    } = this.computeMangledLayout(args);
    if (sel.current !== undefined) {
      const r = sel.current.range;
      return {
        colStart: r.x,
        colEnd: r.x + r.width,
        rowStart: r.y,
        rowEnd: Math.min(r.y + r.height, args.rows)
      };
    }
    if (sel.rows.length > 0) {
      const rows = [...sel.rows];
      return {
        colStart: args.rowMarkerOffset,
        colEnd: mappedColumns.length,
        rowStart: Math.min(...rows),
        rowEnd: Math.max(...rows) + 1
      };
    }
    if (sel.columns.length > 0) {
      const cols = [...sel.columns];
      return {
        colStart: Math.min(...cols),
        colEnd: Math.max(...cols) + 1,
        rowStart: 0,
        rowEnd: args.rows
      };
    }
    return undefined;
  }

  // Phase 9. Reads a rectangle of cells in the CONSUMER's coordinate space (no row-marker column),
  // using `getCellsForSelection` when one is available and falling back to a per-cell
  // `getCellContent` sweep otherwise. Returns `undefined` when the consumer's callback answered
  // with a thunk, i.e. asynchronously -- see the caller for why that can't be used for copy.
  //
  // Mirrors source's `useCellsForSelection`'s *direct* (unmangled) half. Source also builds a
  // *mangled* variant that shifts by `rowMarkerOffset` and prepends a Loading cell for the marker
  // column; that one exists purely for its search subsystem, so it is deliberately NOT ported yet
  // -- it would be dead code until search lands (PHASES.md 9e), and this project has learned what
  // dormant code costs. Add it there, next to the consumer that needs it.
  cellsForSelectionSync(args, rect) {
    const provider = args.getCellsForSelection;
    if (provider !== undefined && provider !== true) {
      const result = provider(rect, this.cellsForSelectionAbort.signal);
      // A thunk means "loading asynchronously" -- unusable here, the caller decides what to do.
      if (typeof result === "function") return undefined;
      return result;
    }

    // `true`, or absent: synthesise from `getCellContent`. Identical either way -- the flag only
    // exists in source to let a consumer opt into the feature without writing the callback, and
    // the synthesised sweep is exactly what the copy path did before this existed.
    return synthesizeCellsForSelection(rect, args.rows, args.getCellContent);
  }
  buildCopyBuffer(args) {
    const region = this.selectedRegion(args);
    if (region === undefined) return undefined;
    // Row-marker column (if any) is never a real data column -- exclude it from the copied
    // region entirely rather than emitting a placeholder cell for it.
    const colStart = Math.max(region.colStart, args.rowMarkerOffset);
    if (colStart >= region.colEnd || region.rowStart >= region.rowEnd) return undefined;
    const columnIndexes = [];
    for (let col = colStart; col < region.colEnd; col++) columnIndexes.push(col - args.rowMarkerOffset);

    // Consumer coordinate space: strip the row-marker offset before asking.
    const cells = this.cellsForSelectionSync(args, {
      x: colStart - args.rowMarkerOffset,
      y: region.rowStart,
      width: region.colEnd - colStart,
      height: region.rowEnd - region.rowStart
    });
    if (cells === undefined) {
      // The consumer's `getCellsForSelection` answered with a thunk. We cannot await it: this
      // runs inside a `copy` event, and `clipboardData.setData` stops working once the handler
      // has awaited. Fall back to the synchronous per-cell sweep, which at worst yields the
      // Loading cells a paged source would report for unloaded rows -- strictly better than
      // silently writing nothing to the clipboard. Documented on `GridHostArgs`.
      const fallback = [];
      for (let row = region.rowStart; row < region.rowEnd; row++) {
        const rowCells = [];
        for (let col = colStart; col < region.colEnd; col++) {
          rowCells.push(args.getCellContent([col - args.rowMarkerOffset, row]));
        }
        fallback.push(rowCells);
      }
      return getCopyBufferContents(this.withCopyHeaders(args, fallback, columnIndexes), columnIndexes);
    }
    return getCopyBufferContents(this.withCopyHeaders(args, cells, columnIndexes), columnIndexes);
  }

  /** 9g: `copyHeaders` prepends one `Text` cell per copied column carrying its title, exactly as
   *  source does (`data-editor.tsx:3787-3796`). Off by default, and a no-op then. */
  withCopyHeaders(args, cells, columnIndexes) {
    if (!args.copyHeaders) return cells;
    return [copyHeaderRow(args.columns, columnIndexes), ...cells];
  }

  // Coerces a parsed paste buffer entry into a replacement `GridCell` matching `existing`'s kind.
  // The rules themselves moved to `rendering/paste-coercion.ts` in Phase 9g so they could be unit
  // tested (this class can't be imported from vitest); this wrapper is just the two args the
  // coercion needs plucked off `ResolvedGridHostArgs`.
  pasteValueIntoCell(args, existing, buf) {
    return coercePasteCell(existing, buf, args.getCellRenderer, args.coercePasteValue);
  }

  // Inverse of `pasteValueIntoCell` for the "cut" gesture -- resets a cell to its kind-appropriate
  // empty value. Mirrors source's `onCut` = `onCopy` + delete-range, using the same per-kind
  // emptiness convention `data-editor-fns.ts`'s delete-keybind clearing logic uses.
  clearedCellValue(existing) {
    switch (existing.kind) {
      case GridCellKind.Text:
        return {
          ...existing,
          data: "",
          displayData: ""
        };
      case GridCellKind.Number:
        return {
          ...existing,
          data: undefined,
          displayData: ""
        };
      case GridCellKind.Boolean:
        return {
          ...existing,
          data: BooleanEmpty
        };
      case GridCellKind.Uri:
        return {
          ...existing,
          data: ""
        };
      case GridCellKind.Markdown:
        return {
          ...existing,
          data: ""
        };
      default:
        return undefined;
    }
  }
  onCopy = ev => {
    if (this.destroyed || !this.isFocused) return;
    const args = this.resolveArgs();
    const buffer = this.buildCopyBuffer(args);
    if (buffer === undefined || ev.clipboardData === null) return;
    ev.clipboardData.setData("text/plain", buffer.textPlain);
    ev.clipboardData.setData("text/html", buffer.textHtml);
    ev.preventDefault();
  };
  onCut = ev => {
    if (this.destroyed || !this.isFocused) return;
    this.onCopy(ev);
    const args = this.resolveArgs();
    // 9g: cut is copy + delete, so it runs through the same `onDelete` gate source puts on it
    // (`data-editor.tsx:3898`) -- a consumer that vetoes deletion vetoes the clearing half of a
    // cut too, and the copy half still happened.
    const target = this.resolveDeleteTarget(args);
    if (target === undefined) return;
    const region = this.selectedRegion(args, target);
    if (region === undefined) return;
    const colStart = Math.max(region.colStart, args.rowMarkerOffset);
    const edits = [];
    for (let row = region.rowStart; row < region.rowEnd; row++) {
      for (let col = colStart; col < region.colEnd; col++) {
        const realCol = col - args.rowMarkerOffset;
        const cell = args.getCellContent([realCol, row]);
        if (!isReadWriteCell(cell)) continue;
        const cleared = this.clearedCellValue(cell);
        if (cleared !== undefined) edits.push({
          location: [realCol, row],
          value: cleared
        });
      }
    }
    if (edits.length > 0) args.onCellsEdited?.(edits);
  };
  onPaste = ev => {
    if (this.destroyed || !this.isFocused) return;
    const args = this.resolveArgs();
    if (ev.clipboardData === null) return;
    const html = ev.clipboardData.getData("text/html");
    const plain = ev.clipboardData.getData("text/plain");
    let buffer;
    if (html.length > 0) buffer = decodeHTML(html);
    if (buffer === undefined && plain.length > 0) buffer = unquote(plain);
    if (buffer === undefined || buffer.length === 0) return;

    // Paste-target anchor: current range's top-left, else sole selected column (row 0) or
    // sole selected row (first real column), else no-op. Mirrors source's paste-target
    // resolution (PORTING-NOTES.md, `data-editor.tsx:3646-3654`).
    // Mangled, so the `- args.rowMarkerOffset` in the loop below (and the marker-column
    // fallbacks here) stay exactly as they were.
    const sel = this.mangledSelection(args);
    let anchorCol;
    let anchorRow;
    if (sel.current !== undefined) {
      anchorCol = sel.current.range.x;
      anchorRow = sel.current.range.y;
    } else if (sel.columns.length > 0) {
      anchorCol = sel.columns.first() ?? args.rowMarkerOffset;
      anchorRow = 0;
    } else if (sel.rows.length > 0) {
      anchorCol = args.rowMarkerOffset;
      anchorRow = sel.rows.first() ?? 0;
    } else {
      return;
    }

    // 4.5: `@onPaste`'s veto, checked once the target is known and before a single cell is
    // written -- the same place source checks it (`data-editor.tsx:3714-3722`). The target is
    // handed over in the consumer's column space, like every other callback here. No
    // `preventDefault()` on a refusal: source returns without touching the event either.
    if (!shouldAcceptPaste(args.onPaste, [anchorCol - args.rowMarkerOffset, anchorRow], buffer)) return;
    const edits = [];
    for (let rowOffset = 0; rowOffset < buffer.length; rowOffset++) {
      const targetRow = anchorRow + rowOffset;
      if (targetRow >= args.rows) break;
      const bufRow = buffer[rowOffset];
      if (bufRow === undefined) continue;
      for (let colOffset = 0; colOffset < bufRow.length; colOffset++) {
        const targetCol = anchorCol + colOffset - args.rowMarkerOffset;
        if (targetCol < 0 || targetCol >= args.columns.length) continue;
        const cellBuf = bufRow[colOffset];
        if (cellBuf === undefined) continue;
        const existing = args.getCellContent([targetCol, targetRow]);
        if (!isReadWriteCell(existing)) continue;
        const value = this.pasteValueIntoCell(args, existing, cellBuf);
        if (value !== undefined) edits.push({
          location: [targetCol, targetRow],
          value
        });
      }
    }
    if (edits.length > 0) {
      args.onCellsEdited?.(edits);
      ev.preventDefault();
    }
  };
}

export { GridHostController };
//# sourceMappingURL=grid-host-controller.js.map
