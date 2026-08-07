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
import {
    drawGrid,
    mapColumns,
    CellSet,
    AnimationManager,
    SpriteManager,
    ImageWindowLoaderImpl,
    RenderStateProvider,
    getDataEditorTheme,
    mergeAndRealizeTheme,
    CompactSelection,
    DEFAULT_FILL_HANDLE,
    isSizedGridColumn,
    GridCellKind,
    InnerGridCellKind,
    setCurrentSelection,
    setSelectedRows as writerSetSelectedRows,
    setSelectedColumns as writerSetSelectedColumns,
    isReadWriteCell,
    getCopyBufferContents,
    decodeHTML,
    unquote,
    BooleanEmpty,
    BooleanIndeterminate,
    isObjectEditorCallbackResult,
    booleanCellIsEditable,
    toggleBoolean,
} from "../rendering/index.ts";
import type {
    DrawGridArg,
    DragAndDropState,
    MutableRefObject,
    BlitData,
    GridColumn,
    InnerGridColumn,
    InnerGridCell,
    GridCell,
    GridSelection,
    Item,
    Rectangle,
    Slice,
    GetCellRendererCallback,
    Theme,
    HoverInfo,
    SelectionBehaviorOptions,
    CellBuffer,
    CopyBuffer,
    CustomCell,
    CustomRenderer,
    BooleanCell,
    ProvideEditorCallbackResult,
    CellEditorHandle,
} from "../rendering/index.ts";
import {
    computeBounds,
    getColumnIndexForX,
    getEffectiveColumns,
    getRowIndexForY,
    getStickyWidth,
    itemsAreEqual,
    type MappedGridColumn,
} from "../rendering/render/data-grid-lib.ts";
import { computeHeaderLayout } from "../rendering/render/data-grid-render.header.ts";
import { pointInRect } from "../rendering/common/math.ts";
import { AnimationQueue } from "../rendering/animation-queue.ts";
import { browserIsSafari, browserIsOSX } from "../rendering/common/browser-detect.ts";

// Public args this controller is driven by. `getArgs()` is called fresh on every draw/scroll/hover
// pass -- the controller never caches the result across calls, per the calling convention: the
// Ember wrapper component owns memoization of whatever produces these values.
/**
 * Row-marker column kinds, mirrors source's `RowMarkerOptions["kind"]`
 * (`data-editor/data-editor.tsx:97-106`) minus the deprecated non-`kind` sibling props. `"none"`
 * (the default) means no marker column exists at all -- `col 0` is just the caller's first real
 * column, exactly like today.
 */
export type RowMarkerKind = "none" | "checkbox" | "checkbox-visible" | "number" | "clickable-number" | "both";

export interface GridHostArgs {
    readonly columns: readonly GridColumn[];
    readonly getCellContent: (item: Item) => GridCell;
    readonly rows: number;
    // Optional with defaults applied internally (see `resolveArgs`) rather than required fields,
    // since the eventual Ember component will very likely receive these as optional `@args`.
    readonly rowHeight?: number | ((row: number) => number);
    readonly headerHeight?: number;
    readonly groupHeaderHeight?: number;
    readonly theme?: Partial<Theme>;
    readonly freezeColumns?: number;
    readonly getCellRenderer: GetCellRendererCallback;

    // --- Phase 3a: selection / interaction config -----------------------------------------------
    // Mirrors a subset of `DataEditorProps`. Selection *blending* (`rangeSelectionBlending` /
    // `columnSelectionBlending` / `rowSelectionBlending`, all source default `"exclusive"`) and
    // `rowSelectionMode`/`columnSelectionMode` (source default `"auto"`) are deliberately NOT
    // exposed here yet -- `GridHostController` wires the writer with those defaults hardcoded
    // internally (see `DEFAULT_SELECTION_OPTIONS` below), but the writer functions themselves
    // (`setCurrentSelection`/`setSelectedRows`/`setSelectedColumns` in `rendering/
    // selection-behavior.ts`) are fully parameterized over blending, so a later phase can add
    // these as `GridHostArgs`/`<GlideDataGrid>` args without touching the writer.

    /** @defaultValue "none" (no row-marker column) */
    readonly rowMarkers?: RowMarkerKind;
    /** @defaultValue auto-sized from `rows`, mirrors `data-editor.tsx:952` */
    readonly rowMarkerWidth?: number;
    /** @defaultValue "multi" */
    readonly rowSelect?: "none" | "single" | "multi";
    /** @defaultValue "multi" */
    readonly columnSelect?: "none" | "single" | "multi";
    /** @defaultValue "rect" */
    readonly rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
    /** @defaultValue true */
    readonly rangeSelectionColumnSpanning?: boolean;

    /** Fired whenever the internally-owned `GridSelection` changes for any reason. */
    readonly onSelectionChanged?: (selection: GridSelection) => void;
    /**
     * Fired on a genuine click (mousedown+mouseup on the same spot) precisely inside a header
     * column's menu-glyph hit region (`column.hasMenu === true` only) -- distinct from an ordinary
     * header click, which runs column-selection logic instead. This is hit-test + notification
     * only: no menu UI or sort logic is built by the grid itself (see PORTING-NOTES.md).
     */
    readonly onHeaderMenuClick?: (col: number, bounds: Rectangle) => void;

    // --- Phase 3c: copy/cut/paste -------------------------------------------------------------
    /**
     * Fired once per paste (or cut-then-clear) gesture with the *full batch* of cell writes to
     * apply, in the same "notification only" spirit as `onSelectionChanged` -- mirrors source's
     * `mangledOnCellsEdited` batching every write from one `paste`/cut event into a single call
     * rather than firing per-cell (`data-editor.tsx:3742,3180`). `location` is in the caller's own
     * (real, un-mangled) column space, matching `getCellContent`'s `Item` space -- the row-marker
     * column, if any, is never a valid edit target and is excluded before this fires.
     *
     * **`GridHostController` does NOT mutate any backing data store itself** -- there isn't one in
     * this port (no cell-editing/data-model layer exists yet, that's Phase 4). This callback is
     * purely a notification: applying the edit to whatever `getCellContent` reads from, and
     * triggering a redraw afterwards (e.g. via the `GlideDataGridApi.updateCells` this controller
     * already exposes), are entirely the consumer's responsibility. Future phases that add real
     * cell editing (Phase 4) should follow this same non-mutating-controller contract for
     * consistency, per PORTING-NOTES.md.
     */
    readonly onCellsEdited?: (edits: readonly { location: Item; value: GridCell }[]) => void;

    // --- Phase 3d: column resize / reorder ------------------------------------------------------
    /**
     * Fired continuously (on every mousemove tick, not just at drag-end) while a column resize is
     * in progress, plus once more at the very end via `onColumnResizeEnd`. Mirrors source's
     * `onColumnResize`/`onColumnResizeEnd`/`onColumnResizeStart` (`data-grid-dnd.tsx`) exactly,
     * including firing repeatedly during the drag. `newSize` is the resized column's raw width;
     * `newSizeWithGrow` adds back the column's `growOffset` (0 for columns without `grow`).
     * **`GridHostController` never mutates `args.columns` itself** -- the consumer owns column
     * width state and must pass an updated `columns` array back through `getArgs()` for the resize
     * to visually stick (same non-mutating-controller contract as `onCellsEdited`). Resize is
     * enabled purely by the *presence* of any one of these three callbacks, matching source's
     * `canResize = (onColumnResize ?? onColumnResizeEnd ?? onColumnResizeStart) !== undefined`.
     */
    readonly onColumnResizeStart?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
    readonly onColumnResize?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
    readonly onColumnResizeEnd?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;

    /**
     * Live veto check during a column-reorder drag: return `false` to reject the current candidate
     * drop position (no drag-offset visual is computed for it, mirrors source's
     * `onColumnProposeMove`/`dragOffset` memo in `data-grid-dnd.tsx`). Optional -- if omitted every
     * drop position is allowed (except in front of frozen/`freezeColumns` columns, which is never
     * allowed regardless).
     */
    readonly onColumnProposeMove?: (startIndex: number, endIndex: number) => boolean;
    /**
     * Fired once on mouseup at the end of a column-reorder drag that both crossed the activation
     * threshold and wasn't vetoed by the final `onColumnProposeMove` check. **Consumer owns column
     * order** -- must reorder its own `columns` array for the move to visually stick. Reorder is
     * enabled purely by this callback's presence, matching source's `canDragCol = onColumnMoved !==
     * undefined`.
     */
    readonly onColumnMoved?: (startIndex: number, endIndex: number) => void;

    // --- Phase 4d: trailing blank row / "add row" affordance -------------------------------------
    /**
     * When `true`, renders one extra virtual row immediately past `rows` whose every cell is the
     * `new-row-cell` hover-fade "+" affordance (`InnerGridCellKind.NewRow`, `rendering/cells/
     * new-row-cell.ts`). This row participates fully in hit-testing/selection/keyboard-nav/scrolling
     * as a real row (see `PORTING-NOTES.md`'s Phase 4d section for the exact mechanics) -- it is
     * NOT a `GridCell` a consumer's `getCellContent` is ever asked for; `GridHostController`
     * synthesizes it internally. Mirrors source's `showTrailingBlankRow` (there derived from
     * `trailingRowOptions !== undefined`; this port exposes it directly as a boolean and doesn't
     * port the richer `trailingRowOptions` per-column hint/icon/tint/sticky config -- deliberate
     * simplification, see PORTING-NOTES.md).
     * @defaultValue false
     */
    readonly showTrailingBlankRow?: boolean;
    /**
     * Fired when the trailing blank row is activated (clicking any real-column cell in it, or
     * selecting it via keyboard nav and pressing Enter) -- mirrors source's `onRowAppended`. Like
     * every other edit-adjacent callback on this interface, **`GridHostController` does not mutate
     * `rows`/any backing data store itself** -- the consumer must increase its own row count (and
     * make `getCellContent` return real data for the new row) for a new row to actually appear.
     */
    readonly onRowAppended?: () => void;
}

export interface GridHostControllerOptions {
    readonly root: HTMLElement;
    readonly getArgs: () => GridHostArgs;
}

interface ResolvedGridHostArgs {
    readonly columns: readonly GridColumn[];
    readonly getCellContent: (item: Item) => GridCell;
    readonly rows: number;
    readonly rowHeight: number | ((row: number) => number);
    readonly headerHeight: number;
    readonly groupHeaderHeight: number;
    readonly theme: Partial<Theme> | undefined;
    readonly freezeColumns: number;
    readonly getCellRenderer: GetCellRendererCallback;

    readonly rowMarkers: RowMarkerKind;
    readonly rowMarkerWidth: number;
    readonly hasRowMarkers: boolean;
    readonly rowMarkerOffset: number;
    readonly rowSelect: "none" | "single" | "multi";
    readonly columnSelect: "none" | "single" | "multi";
    readonly rangeSelect: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
    readonly rangeSelectionColumnSpanning: boolean;
    readonly onSelectionChanged: ((selection: GridSelection) => void) | undefined;
    readonly onHeaderMenuClick: ((col: number, bounds: Rectangle) => void) | undefined;
    readonly onCellsEdited: ((edits: readonly { location: Item; value: GridCell }[]) => void) | undefined;
    readonly onColumnResizeStart:
        | ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void)
        | undefined;
    readonly onColumnResize:
        | ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void)
        | undefined;
    readonly onColumnResizeEnd:
        | ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void)
        | undefined;
    readonly onColumnProposeMove: ((startIndex: number, endIndex: number) => boolean) | undefined;
    readonly onColumnMoved: ((startIndex: number, endIndex: number) => void) | undefined;

    readonly showTrailingBlankRow: boolean;
    readonly onRowAppended: (() => void) | undefined;
}

const DEFAULT_ROW_HEIGHT = 34;
const DEFAULT_HEADER_HEIGHT = 36;

// Hardcoded selection-blending/mode defaults (see the `GridHostArgs` doc comment above for why
// these aren't args yet). Values match source's own defaults (`data-editor.tsx:836-850`).
const DEFAULT_SELECTION_OPTIONS: Pick<SelectionBehaviorOptions, "rangeBehavior" | "columnBehavior" | "rowBehavior"> = {
    rangeBehavior: "exclusive",
    columnBehavior: "exclusive",
    rowBehavior: "exclusive",
};
const DEFAULT_ROW_SELECTION_MODE: "auto" | "multi" = "auto";
const DEFAULT_COLUMN_SELECTION_MODE: "auto" | "multi" = "auto";
const DEFAULT_ROW_MARKER_CHECKBOX_STYLE: "square" | "circle" = "square";
// Row markers are always sticky when enabled, matching source's
// `mangledFreezeColumns = Math.min(mangledCols.length, freezeColumns + (hasRowMarkers ? 1 : 0))`
// (`data-editor.tsx:3994`).
function rowMarkerWidthDefault(rows: number): number {
    return rows > 10_000 ? 48 : rows > 1000 ? 44 : rows > 100 ? 36 : 32;
}

// Phase 4a: marker/new-row cells are `InnerGridCell`s with no `GridCell` counterpart (mirrors
// source's `isInnerOnlyCell`, `data-grid-types.ts`) -- never routed through the overlay-editor /
// renderer-onClick machinery below, which only deals in real `GridCell`s.
function isInnerOnlyCellKind(kind: InnerGridCell["kind"]): boolean {
    return kind === InnerGridCellKind.Marker || kind === InnerGridCellKind.NewRow;
}

// Phase 4a: single printable character, no modifiers -- mirrors source's `editOnType` regex
// (`data-editor.tsx:3510`, `/[\p{L}\p{M}\p{N}\p{S}\p{P}]/u`) exactly.
const PRINTABLE_CHAR_RE = /[\p{L}\p{M}\p{N}\p{S}\p{P}]/u;

// Column grouping isn't wired up yet in this phase -- no group-header args are exposed on
// `GridHostArgs`. Fixed to `false` throughout, and (mirroring `data-editor.tsx`'s
// `groupHeaderHeight={enableGroups ? groupHeaderHeight : 0}`) the *effective* group header height
// fed to the render engine and all coordinate math is always 0, regardless of what a caller passes
// for `groupHeaderHeight` -- that field is retained on `GridHostArgs` purely so a later phase that
// turns grouping on doesn't need to change the args shape.
const ENABLE_GROUPS = false;

// Phase 3d: column resize/reorder. Resize-edge hit region width (px) at a header cell's right
// border; source doesn't expose an exact named constant for this in the parts of `data-grid.tsx`
// cited by PORTING-NOTES.md, so this is a reasonable small value consistent with typical
// resize-handle affordances. Reorder drag activation dead-zone matches source's own
// `data-grid-dnd.tsx` `Math.abs(event.clientX - dragStartX) > 20` exactly.
const RESIZE_EDGE_PX = 6;
const COLUMN_DRAG_THRESHOLD_PX = 20;

// Browser's maximum div height limit (varies a bit by browser) and the max height of a single
// padder segment, both taken from `infinite-scroller.tsx` verbatim.
const BROWSER_MAX_DIV_HEIGHT = 33_554_400;
const MAX_PADDER_SEGMENT_HEIGHT = 5_000_000;

// `GridColumn` (the public column type) allows `AutoGridColumn` (no `width`), but the render
// engine's `mapColumns` requires `InnerGridColumn` (`width: number` always present) -- in the real
// app auto-sized columns get a measured pixel width from `DataEditor` before reaching this layer.
// That auto-measurement pass is out of scope for this phase, so auto columns are simply given a
// fixed fallback width here. Revisit when column auto-sizing is ported.
const DEFAULT_AUTO_COLUMN_WIDTH = 150;

function normalizeColumns(columns: readonly GridColumn[]): InnerGridColumn[] {
    return columns.map(c => (isSizedGridColumn(c) ? c : { ...c, width: DEFAULT_AUTO_COLUMN_WIDTH }));
}

function totalRowsHeight(rows: number, rowHeight: number | ((row: number) => number)): number {
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
function computeXOffset(
    scrollLeft: number,
    mappedColumns: readonly MappedGridColumn[],
    freezeColumns: number
): { cellXOffset: number; translateX: number } {
    let remaining = scrollLeft;
    let cellXOffset = freezeColumns;
    for (let i = freezeColumns; i < mappedColumns.length; i++) {
        const w = mappedColumns[i]!.width;
        if (remaining >= w) {
            remaining -= w;
            cellXOffset++;
        } else {
            break;
        }
    }
    return { cellXOffset, translateX: -remaining };
}

// Result of resolving a mousedown/mouseup/click's page coordinates against the current draw state.
// Mirrors the subset of source's `GridMouseEventArgs` (`getMouseArgsForPosition` in
// `data-grid.tsx:516-660`) actually needed for Phase 3a's click dispatch -- column-resize edge
// detection (`isEdge`) is Phase 3d, not reproduced here.
interface MouseHit {
    readonly kind: "cell" | "header" | "out-of-bounds";
    // Always a valid, in-range `[col, row]` -- for "out-of-bounds" this is the same best-effort
    // clamp source computes (`data-grid.tsx:601`), used by drag-extend so a drag that leaves the
    // grid still grows the selection sensibly.
    readonly location: Item;
    readonly localX: number;
    readonly localY: number;
    readonly shiftKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    // Best-effort guard against an out-of-bounds click on the native scrollbar clearing the
    // selection (mirrors `data-grid.tsx`'s `isMaybeScrollbar`); only meaningful when `kind ===
    // "out-of-bounds"`.
    readonly isMaybeScrollbar: boolean;
}

// Overlay editor open state (Phase 4a). Mirrors source's single `overlay: {...} | undefined`
// state field (`data-editor.tsx:776-784`) -- a plain instance field here rather than `@tracked`,
// matching this port's existing imperative-controller pattern (same treatment as `selection`/
// `hoverInfo`/drag state above). `realLocation`/`mangledLocation` are the same cell in the two
// coordinate spaces this controller juggles throughout (see the row-marker-mangling comments
// elsewhere in this file) -- `realLocation` is what `getCellContent`/`onCellsEdited` use,
// `mangledLocation` is what `computeBounds`/damage `CellSet`s use.
interface OverlayState {
    readonly realLocation: Item;
    readonly mangledLocation: Item;
    readonly container: HTMLDivElement;
    // Not `readonly`: `openOverlay` constructs this object before the editor factory (which needs
    // `onFinishedEditing`/`onChange` closures referencing `state`) has run, so `handle` starts as a
    // placeholder and is assigned its real value immediately after -- see `openOverlay`.
    handle: CellEditorHandle;
    /** Live in-progress value, updated by the editor's `onChange` -- read back on commit. */
    currentCell: GridCell;
    /** Set once `finish()` has run, to make it idempotent against being called twice (e.g. both
     * the editor's own Enter keydown AND a subsequent click-outside on the same tick). */
    finished: boolean;
}

function computeYOffset(
    scrollTop: number,
    rows: number,
    rowHeight: number | ((row: number) => number)
): { cellYOffset: number; translateY: number } {
    if (rows <= 0) return { cellYOffset: 0, translateY: 0 };
    if (typeof rowHeight === "number") {
        const cellYOffset = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight)), rows - 1);
        const translateY = -(scrollTop - cellYOffset * rowHeight);
        return { cellYOffset, translateY };
    }
    let y = 0;
    let cellYOffset = 0;
    for (; cellYOffset < rows; cellYOffset++) {
        const rh = rowHeight(cellYOffset);
        if (scrollTop < y + rh) break;
        y += rh;
    }
    cellYOffset = Math.min(cellYOffset, rows - 1);
    return { cellYOffset, translateY: -(scrollTop - y) };
}

export class GridHostController {
    private readonly root: HTMLElement;
    private readonly getArgsFn: () => GridHostArgs;

    private readonly underlayEl: HTMLDivElement;
    private readonly canvasEl: HTMLCanvasElement;
    private readonly headerCanvasEl: HTMLCanvasElement;
    private readonly scrollerEl: HTMLDivElement;
    private readonly scrollInnerEl: HTMLDivElement;
    private readonly stackEl: HTMLDivElement;
    private readonly spacerEl: HTMLDivElement;

    private readonly bufferAEl: HTMLCanvasElement;
    private readonly bufferBEl: HTMLCanvasElement;

    private readonly canvasCtx: CanvasRenderingContext2D;
    private readonly headerCanvasCtx: CanvasRenderingContext2D;
    private readonly bufferACtx: CanvasRenderingContext2D;
    private readonly bufferBCtx: CanvasRenderingContext2D;

    private readonly resizeObserver: ResizeObserver;

    // Engine pieces constructed once and reused across draws.
    private readonly spriteManager: SpriteManager;
    private readonly renderStateProvider: RenderStateProvider;
    private readonly imageLoader: ImageWindowLoaderImpl;
    private readonly animationManager: AnimationManager;
    private readonly animationQueue: AnimationQueue;
    private readonly lastBlitData: MutableRefObject<BlitData | undefined> = { current: undefined };

    // Mutable draw-loop state.
    private width = 0;
    private height = 0;
    private cellXOffset = 0;
    private cellYOffset = 0;
    private translateX = 0;
    private translateY = 0;
    private hoverValues: readonly { item: Item; hoverAmount: number }[] = [];
    private hoverInfo: HoverInfo | undefined = undefined;
    private hoveredItem: Item | undefined = undefined;
    private lastFullDrawArg: DrawGridArg | undefined = undefined;
    private cursorOverride: string | undefined = undefined;
    private destroyed = false;
    // Real DOM focus state (Phase 3a follow-up fix). The ported render engine deliberately
    // suppresses the selection ring when `isSelected && !isFocused && drawFocus`
    // (`render/data-grid-render.cells.ts:283`) -- mirrors source's behavior of dimming/hiding the
    // active-cell outline when the grid itself doesn't have focus. Phase 2 hardcoded
    // `isFocused: false` since no interaction existed yet to focus the grid; now that clicking
    // actually selects cells (Phase 3a), that hardcoded value made every selection invisible even
    // though the underlying `GridSelection` state was correct. `root` is made focusable and
    // explicitly focused on mousedown, matching source's click-to-focus behavior.
    private isFocused = false;

    // Selection state (Phase 3a). Uncontrolled/internal only for now -- there is no
    // `GridHostArgs.selection` prop yet, so `GridHostController` is always the source of truth.
    // Matches source's default (uncontrolled) behavior when `DataEditorProps.gridSelection` /
    // `onGridSelectionChange` aren't passed. A later phase can add controlled-mode support
    // (accepting an external `GridSelection` + only calling `onSelectionChanged`, never mutating
    // `this.selection` itself) without changing anything else here.
    private selection: GridSelection = {
        current: undefined,
        rows: CompactSelection.empty(),
        columns: CompactSelection.empty(),
    };
    // Set on mousedown (any kind except a header-menu click), cleared on mouseup. Mirrors source's
    // `mouseDownData.current` (location) + `mouseState.previousSelection`
    // (`data-editor.tsx:2091-2123`) -- both are needed by drag-extend to detect the
    // "dragging out of a freshly-selected row-marker cell" case.
    private mouseDownState: { location: Item; previousSelection: GridSelection } | undefined = undefined;
    // Column a header-menu-glyph mousedown landed on, if any -- mouseup re-checks the same column
    // is still under the menu bounds before firing `onHeaderMenuClick` (mirrors source's
    // down/up-position match in `onPointerUp`/`onClickImpl`, `data-grid.tsx:1176-1244`).
    private pendingHeaderMenuClick: number | undefined = undefined;
    // Shift-extend anchors for row-marker / header column-selection clicks specifically (distinct
    // from `selection.current.cell`, which anchors ordinary cell shift-extend). Mirrors source's
    // `lastSelectedRowRef`/`lastSelectedColRef` (`data-editor.tsx:1885,2009`).
    private lastSelectedRow: number | undefined = undefined;
    private lastSelectedCol: number | undefined = undefined;

    // Column resize drag state (Phase 3d). Set on mousedown over a header's resize-edge, cleared on
    // mouseup. Mirrors source's `resizeCol`/`resizeColStartX`/`lastResizeWidthRef`
    // (`data-grid-dnd.tsx`). `col` is in MANGLED (row-marker-space) coordinates throughout, same
    // space as `this.selection`/`hitTestHeaderMenu`; converted to real column space only at the
    // `GridColumn`/callback boundary.
    private resizeState: { col: number; startClientX: number; startWidth: number; lastWidth: number } | undefined =
        undefined;
    // Column reorder drag state (Phase 3d). `active` flips true only once the mouse has moved more
    // than `COLUMN_DRAG_THRESHOLD_PX` from `startClientX`, matching source's dead-zone. `dropCol`
    // tracks the current candidate drop column (mangled space); `vetoed` records whether
    // `onColumnProposeMove` rejected the current `dropCol` (no drag-offset visual is drawn while
    // vetoed, mirrors source's `dragOffset` memo returning `undefined` in that case).
    private dragColState:
        | { srcCol: number; startClientX: number; active: boolean; dropCol: number; vetoed: boolean }
        | undefined = undefined;

    // Overlay editor state (Phase 4a) -- see `OverlayState` above. `undefined` = no editor open.
    private overlayState: OverlayState | undefined = undefined;

    constructor(options: GridHostControllerOptions) {
        this.root = options.root;
        this.getArgsFn = options.getArgs;

        if (getComputedStyle(this.root).position === "static") {
            this.root.style.position = "relative";
        }
        this.root.style.overflow = "hidden";
        // Focusable so the grid can receive real DOM focus on click (see `isFocused` field comment
        // above). `tabIndex = 0` puts it in the natural tab order, matching source's grid being a
        // normal focusable/tabbable element. The engine draws its own focus indication (the
        // selection ring), so the browser's default focus outline is suppressed here.
        this.root.tabIndex = 0;
        this.root.style.outline = "none";

        // --- .dvn-underlay + canvases -------------------------------------------------------
        this.underlayEl = document.createElement("div");
        this.underlayEl.className = "dvn-underlay";
        Object.assign(this.underlayEl.style, {
            position: "absolute",
            left: "0",
            top: "0",
            right: "0",
            bottom: "0",
            pointerEvents: "none",
        } satisfies Partial<CSSStyleDeclaration>);

        this.canvasEl = document.createElement("canvas");
        this.headerCanvasEl = document.createElement("canvas");
        for (const canvas of [this.canvasEl, this.headerCanvasEl]) {
            canvas.style.position = "absolute";
            canvas.style.left = "0";
            canvas.style.top = "0";
            canvas.style.outline = "none";
        }
        this.underlayEl.append(this.canvasEl, this.headerCanvasEl);

        // --- .dvn-scroller / .dvn-scroll-inner / .dvn-stack / .dvn-spacer -------------------
        this.scrollerEl = document.createElement("div");
        this.scrollerEl.className = "dvn-scroller";
        Object.assign(this.scrollerEl.style, {
            position: "absolute",
            left: "0",
            top: "0",
            right: "0",
            bottom: "0",
            overflow: "auto",
            transform: "translate3d(0,0,0)",
        } satisfies Partial<CSSStyleDeclaration>);

        this.scrollInnerEl = document.createElement("div");
        this.scrollInnerEl.className = "dvn-scroll-inner";
        Object.assign(this.scrollInnerEl.style, {
            display: "flex",
            pointerEvents: "none",
        } satisfies Partial<CSSStyleDeclaration>);

        this.stackEl = document.createElement("div");
        this.stackEl.className = "dvn-stack";
        Object.assign(this.stackEl.style, {
            display: "flex",
            flexDirection: "column",
            flexShrink: "0",
        } satisfies Partial<CSSStyleDeclaration>);

        this.spacerEl = document.createElement("div");
        this.spacerEl.className = "dvn-spacer";
        this.spacerEl.style.flexGrow = "1";

        this.scrollInnerEl.append(this.stackEl, this.spacerEl);
        this.scrollerEl.append(this.scrollInnerEl);

        this.root.append(this.underlayEl, this.scrollerEl);

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
        this.spriteManager = new SpriteManager(undefined, () => this.scheduleFullRedraw());
        this.renderStateProvider = new RenderStateProvider();
        this.imageLoader = new ImageWindowLoaderImpl();
        this.imageLoader.setCallback(locations => this.drawWithDamage(locations));

        const onAnimationFrame = (values: readonly { item: Item; hoverAmount: number }[]) => {
            const damage = new CellSet(values.map(v => v.item));
            this.hoverValues = values;
            this.drawWithDamage(damage);
        };
        this.animationManager = new AnimationManager(onAnimationFrame);
        this.animationQueue = new AnimationQueue(items => this.drawWithDamage(items));

        // --- listeners ---------------------------------------------------------------------------
        this.scrollerEl.addEventListener("scroll", this.onScroll);
        this.root.addEventListener("mousemove", this.onMouseMove);
        this.root.addEventListener("mousedown", this.onMouseDown);
        this.root.addEventListener("focus", this.onFocus);
        this.root.addEventListener("blur", this.onBlur);
        // Keyboard nav (Phase 3b) lives on `root`, consistent with the mouse listeners above.
        // Gated on `this.isFocused` inside the handler itself (real DOM focus already limits which
        // element keydown targets, but this is a belt-and-suspenders guard matching the brief and
        // makes the gating explicit rather than implicit in DOM focus semantics alone).
        this.root.addEventListener("keydown", this.onKeyDown);
        // Mouseup listens on `window`, not `root` -- a drag-extend can end with the pointer outside
        // the grid (mirrors source's `onPointerUp` listening on `windowEventTarget`,
        // `data-grid.tsx:1198`), and we still need to clear `mouseDownState`/`pendingHeaderMenuClick`
        // in that case.
        window.addEventListener("mouseup", this.onMouseUp);
        // Copy/cut/paste (Phase 3c): native clipboard events, attached at `window` level (not a
        // specific DOM node) and gated on `this.isFocused` inside each handler -- mirrors source's
        // own `useEventListener("copy"/"cut"/"paste", ..., safeWindow, ...)` plus its
        // `document.activeElement` focus check (`data-editor.tsx:3642-3644,3775-3778,3882-3884`),
        // reusing the same `isFocused` field the 3a/3b focus-gating fix already established rather
        // than re-deriving `document.activeElement` containment here.
        window.addEventListener("copy", this.onCopy);
        window.addEventListener("cut", this.onCut);
        window.addEventListener("paste", this.onPaste);

        this.resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry === undefined) return;
            const { width, height } = entry.contentRect;
            this.width = width;
            this.height = height;
            this.scheduleFullRedraw();
        });
        this.resizeObserver.observe(this.root);

        this.scheduleFullRedraw();
    }

    private getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
        canvas.width = 0;
        canvas.height = 0;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx === null) {
            throw new Error("GridHostController: failed to acquire a 2D canvas rendering context");
        }
        return ctx;
    }

    private resolveArgs(): ResolvedGridHostArgs {
        const args = this.getArgsFn();
        const headerHeight = args.headerHeight ?? DEFAULT_HEADER_HEIGHT;
        const rowMarkers = args.rowMarkers ?? "none";
        const hasRowMarkers = rowMarkers !== "none";
        return {
            columns: args.columns,
            getCellContent: args.getCellContent,
            rows: args.rows,
            rowHeight: args.rowHeight ?? DEFAULT_ROW_HEIGHT,
            headerHeight,
            groupHeaderHeight: args.groupHeaderHeight ?? headerHeight,
            theme: args.theme,
            freezeColumns: args.freezeColumns ?? 0,
            getCellRenderer: args.getCellRenderer,

            rowMarkers,
            rowMarkerWidth: args.rowMarkerWidth ?? rowMarkerWidthDefault(args.rows),
            hasRowMarkers,
            rowMarkerOffset: hasRowMarkers ? 1 : 0,
            rowSelect: args.rowSelect ?? "multi",
            columnSelect: args.columnSelect ?? "multi",
            rangeSelect: args.rangeSelect ?? "rect",
            rangeSelectionColumnSpanning: args.rangeSelectionColumnSpanning ?? true,
            onSelectionChanged: args.onSelectionChanged,
            onHeaderMenuClick: args.onHeaderMenuClick,
            onCellsEdited: args.onCellsEdited,
            onColumnResizeStart: args.onColumnResizeStart,
            onColumnResize: args.onColumnResize,
            onColumnResizeEnd: args.onColumnResizeEnd,
            onColumnProposeMove: args.onColumnProposeMove,
            onColumnMoved: args.onColumnMoved,

            showTrailingBlankRow: args.showTrailingBlankRow === true,
            onRowAppended: args.onRowAppended,
        };
    }

    // Phase 4d: total row count including the synthetic trailing blank row, when enabled. Used for
    // every layout/hit-testing/scroll computation that must treat `row === args.rows` as a real,
    // in-bounds row -- `args.rows` itself keeps meaning "real data row count" everywhere else
    // (select-all, the header select-all toggle, row-marker sizing, copy/cut/paste region clamping)
    // since the trailing row is never real data and must never be included in those.
    private effectiveRows(args: ResolvedGridHostArgs): number {
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
    private mangledColumns(args: ResolvedGridHostArgs): InnerGridColumn[] {
        const inner = normalizeColumns(args.columns);
        if (!args.hasRowMarkers) return inner;
        const numSelectedRows = this.selection.rows.length;
        const rowMarkerChecked = numSelectedRows === 0 ? false : numSelectedRows === args.rows ? true : undefined;
        const markerColumn: InnerGridColumn = {
            title: "",
            width: args.rowMarkerWidth,
            hasMenu: false,
            style: "normal",
            rowMarker: DEFAULT_ROW_MARKER_CHECKBOX_STYLE,
            rowMarkerChecked,
            headerRowMarkerDisabled: args.rowSelect !== "multi",
        };
        return [markerColumn, ...inner];
    }

    private mangledFreezeColumns(args: ResolvedGridHostArgs, mangledColumnCount: number): number {
        // Row markers are always sticky when enabled, matching source's `mangledFreezeColumns`
        // (`data-editor.tsx:3994`).
        return Math.min(mangledColumnCount, args.freezeColumns + (args.hasRowMarkers ? 1 : 0));
    }

    // Phase 4d: also mangles in the synthetic trailing blank row (`showTrailingBlankRow`) when
    // enabled -- mirrors source's `getMangledCellContent`'s `isTrailing` branches
    // (`data-editor.tsx:1309-1382`, cited in full in PORTING-NOTES.md's Phase 4 research section).
    // The row-marker column's trailing-row cell is a plain `loadingCell` (kind `Loading`,
    // `allowOverlay: false`) in source -- no checkbox on the append-row affordance -- and every
    // other column's trailing-row cell is the `new-row-cell` renderer's `NewRowCell`. Only the first
    // real (non-marker) column gets a hint string; source derives this per-column from
    // `trailingRowOptions`, not ported here (see the `GridHostArgs.showTrailingBlankRow` doc
    // comment) -- a fixed "Add row" hint on the first column is this port's simplification.
    private mangledGetCellContent(args: ResolvedGridHostArgs): (item: Item) => InnerGridCell {
        if (!args.hasRowMarkers && !args.showTrailingBlankRow) {
            return args.getCellContent as (item: Item) => InnerGridCell;
        }
        const { rowMarkerOffset } = args;
        return ([col, row]: Item): InnerGridCell => {
            const isTrailing = args.showTrailingBlankRow && row === args.rows;
            if (args.hasRowMarkers && col === 0) {
                if (isTrailing) {
                    return { kind: GridCellKind.Loading, allowOverlay: false };
                }
                const markerKind: "checkbox" | "number" | "both" | "checkbox-visible" =
                    args.rowMarkers === "clickable-number"
                        ? "number"
                        : args.rowMarkers === "none"
                          ? "checkbox" // unreachable (hasRowMarkers guards this), satisfies the type
                          : args.rowMarkers;
                return {
                    kind: InnerGridCellKind.Marker,
                    allowOverlay: false,
                    checkboxStyle: DEFAULT_ROW_MARKER_CHECKBOX_STYLE,
                    checked: this.selection.rows.hasIndex(row),
                    markerKind,
                    row: row + 1,
                    // Row reordering (`onRowMoved`) isn't ported (Phase 3d) -- source only sets
                    // `drawHandle: onRowMoved !== undefined`, which is always `false` here.
                    drawHandle: false,
                    cursor: args.rowMarkers === "clickable-number" ? "pointer" : undefined,
                };
            }
            if (isTrailing) {
                return {
                    kind: InnerGridCellKind.NewRow,
                    hint: col === rowMarkerOffset ? "Add row" : "",
                    allowOverlay: false,
                };
            }
            return args.getCellContent([col - rowMarkerOffset, row]);
        };
    }

    private computeMangledLayout(args: ResolvedGridHostArgs): {
        mappedColumns: readonly MappedGridColumn[];
        freezeColumns: number;
    } {
        const mangledCols = this.mangledColumns(args);
        const freezeColumns = this.mangledFreezeColumns(args, mangledCols.length);
        const mappedColumns = mapColumns(mangledCols, freezeColumns);
        return { mappedColumns, freezeColumns };
    }

    private selectionOptions(args: ResolvedGridHostArgs): SelectionBehaviorOptions {
        return {
            ...DEFAULT_SELECTION_OPTIONS,
            rangeSelect: args.rangeSelect,
            rangeSelectionColumnSpanning: args.rangeSelectionColumnSpanning,
        };
    }

    // Central selection-mutation entry point -- every writer call above routes its result through
    // here. Notifies `onSelectionChanged` and redraws. Uses a full redraw rather than a
    // damage-restricted one for simplicity (selection changes can touch an unbounded set of cells --
    // e.g. select-all -- so computing a precise damage set isn't obviously cheaper); revisit if
    // selection-change redraw cost becomes a real perf problem.
    private applySelection(newSelection: GridSelection): void {
        this.selection = newSelection;
        const args = this.resolveArgs();
        args.onSelectionChanged?.(newSelection);
        this.scheduleFullRedraw();
    }

    private clearSelection(): void {
        this.applySelection({ current: undefined, rows: CompactSelection.empty(), columns: CompactSelection.empty() });
        this.lastSelectedRow = undefined;
        this.lastSelectedCol = undefined;
    }

    // --- public API ------------------------------------------------------------------------------

    /** Call after any `getArgs()`-relevant input changes (columns, rows, sizes, theme, etc). */
    public scheduleFullRedraw(): void {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        this.rebuildScrollContent(args);
        this.sizeCanvases(args);
        this.runDraw(args, undefined);
    }

    /** Damage-based partial redraw for a known set of changed cells. */
    public updateCells(cells: readonly { cell: Item }[]): void {
        if (this.destroyed) return;
        this.drawWithDamage(new CellSet(cells.map(c => c.cell)));
    }

    /** Current selection. Read-only snapshot -- mutate via user interaction, not directly. */
    public getSelection(): GridSelection {
        return this.selection;
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;

        if (this.overlayState !== undefined) {
            window.removeEventListener("mousedown", this.onOverlayOutsideClick, true);
            this.overlayState.handle.destroy();
            this.overlayState.container.remove();
            this.overlayState = undefined;
        }

        this.scrollerEl.removeEventListener("scroll", this.onScroll);
        this.root.removeEventListener("mousemove", this.onMouseMove);
        this.root.removeEventListener("mousedown", this.onMouseDown);
        this.root.removeEventListener("focus", this.onFocus);
        this.root.removeEventListener("blur", this.onBlur);
        this.root.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("copy", this.onCopy);
        window.removeEventListener("cut", this.onCut);
        window.removeEventListener("paste", this.onPaste);
        this.resizeObserver.disconnect();

        this.root.replaceChildren();
        this.bufferAEl.remove();
        this.bufferBEl.remove();
    }

    // --- internal draw plumbing --------------------------------------------------------------------

    private drawWithDamage(damage: CellSet): void {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        this.runDraw(args, damage);
    }

    // Mirrors `data-grid.tsx`'s `draw()`: on a normal (non-damage) pass, the previous full-draw arg
    // is handed to `drawGrid` as `lastArg` (this is what enables the blit fast path when only scroll
    // offsets changed) and then replaced by the current one. Damage-driven passes are always drawn
    // against `undefined` as `lastArg` so the damage restriction is honored rather than the "nothing
    // changed" blit shortcut, and they do NOT update `lastFullDrawArg`.
    private runDraw(args: ResolvedGridHostArgs, damage: CellSet | undefined): void {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const theme = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);

        const current: DrawGridArg = {
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
            enableGroups: ENABLE_GROUPS,
            freezeColumns,
            dragAndDropState: this.currentDragAndDropState(),
            theme,
            headerHeight: args.headerHeight,
            groupHeaderHeight: ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            disabledRows: CompactSelection.empty(),
            rowHeight: args.rowHeight,
            verticalBorder: () => true,
            isResizing: this.resizeState !== undefined,
            resizeCol: this.resizeState?.col,
            isFocused: this.isFocused,
            drawFocus: true,
            selection: this.selection,
            fillHandle: DEFAULT_FILL_HANDLE,
            freezeTrailingRows: 0,
            hasAppendRow: args.showTrailingBlankRow,
            hyperWrapping: false,
            rows: this.effectiveRows(args),
            getCellContent: this.mangledGetCellContent(args),
            overrideCursor: cursor => {
                this.cursorOverride = cursor;
                this.scrollerEl.style.cursor = cursor ?? "";
            },
            getGroupDetails: name => ({ name }),
            getRowThemeOverride: undefined,
            drawHeaderCallback: undefined,
            drawCellCallback: undefined,
            prelightCells: undefined,
            highlightRegions: undefined,
            imageLoader: this.imageLoader,
            lastBlitData: this.lastBlitData,
            damage,
            hoverValues: this.hoverValues,
            hoverInfo: this.hoverInfo,
            spriteManager: this.spriteManager,
            maxScaleFactor: 5,
            touchMode: false,
            renderStrategy: browserIsSafari.value ? "double-buffer" : "single-buffer",
            enqueue: this.animationQueue.enqueue,
            renderStateProvider: this.renderStateProvider,
            getCellRenderer: args.getCellRenderer,
            minimumCellWidth: 10,
            resizeIndicator: "none",
        };

        if (damage === undefined) {
            const last = this.lastFullDrawArg;
            this.lastFullDrawArg = current;
            drawGrid(current, last);
        } else {
            drawGrid(current, undefined);
        }
    }

    // --- DOM sizing --------------------------------------------------------------------------------

    private sizeCanvases(args: ResolvedGridHostArgs): void {
        this.canvasEl.style.width = `${this.width}px`;
        this.canvasEl.style.height = `${this.height}px`;

        const headerCanvasHeight = (ENABLE_GROUPS ? args.groupHeaderHeight : 0) + args.headerHeight + 1;
        this.headerCanvasEl.style.width = "100%";
        this.headerCanvasEl.style.height = `${headerCanvasHeight}px`;
    }

    private rebuildScrollContent(args: ResolvedGridHostArgs): void {
        const { mappedColumns } = this.computeMangledLayout(args);
        const totalWidth = mappedColumns.reduce((sum, c) => sum + c.width, 0);
        const totalHeaderHeight = args.headerHeight + (ENABLE_GROUPS ? args.groupHeaderHeight : 0);
        const totalHeight = totalHeaderHeight + totalRowsHeight(this.effectiveRows(args), args.rowHeight);

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

    // --- scroll handling ---------------------------------------------------------------------------

    private readonly onScroll = (): void => {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);

        const { cellXOffset, translateX } = computeXOffset(this.scrollerEl.scrollLeft, mappedColumns, freezeColumns);
        const { cellYOffset, translateY } = computeYOffset(this.scrollerEl.scrollTop, this.effectiveRows(args), args.rowHeight);

        this.cellXOffset = cellXOffset;
        this.translateX = translateX;
        this.cellYOffset = cellYOffset;
        this.translateY = translateY;

        // Synchronous, no rAF/debounce -- this is intentional. The ported `drawGrid`'s blit fast
        // path (in `render/data-grid-render.blit.ts`) detects "only scroll offsets changed" and
        // translates the previous frame instead of doing a full repaint, which is the actual
        // scroll-perf mechanism. This handler's only job is to feed it fresh offsets every frame.
        this.runDraw(args, undefined);
    };

    // --- hover handling ------------------------------------------------------------------------------

    private readonly onMouseMove = (ev: MouseEvent): void => {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        const rect = this.root.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;

        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const effectiveColumns = getEffectiveColumns(mappedColumns, this.cellXOffset, this.width, undefined, this.translateX);
        const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
        const row = getRowIndexForY(
            y,
            this.height,
            ENABLE_GROUPS,
            args.headerHeight,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            this.effectiveRows(args),
            args.rowHeight,
            this.cellYOffset,
            this.translateY,
            0
        );

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

        // Drag-extend (Phase 3a): while a button is held from a mousedown that started inside the
        // grid, growing the selection on every cell the mouse enters. Mirrors source's
        // `onItemHoveredImpl` (`data-editor.tsx:2728-2809`), minus fill-handle/row-grouping
        // clamping (out of scope -- no fill handle or row grouping ported yet).
        if (this.mouseDownState !== undefined && ev.buttons !== 0) {
            const dragLocation: Item = [
                col !== -1 ? col : (x < 0 ? 0 : mappedColumns.length - 1),
                row ?? this.effectiveRows(args) - 1,
            ];
            this.handleDragMove(args, this.mouseDownState, dragLocation);
        }

        const item: Item | undefined = col === -1 || row === undefined ? undefined : [col, row];
        const totalHeaderHeight = args.headerHeight; // ENABLE_GROUPS is always false in this phase

        const updateHoverInfo = (target: Item) => {
            const cellRect = computeBounds(
                target[0],
                target[1],
                this.width,
                this.height,
                ENABLE_GROUPS ? args.groupHeaderHeight : 0,
                totalHeaderHeight,
                this.cellXOffset,
                this.cellYOffset,
                this.translateX,
                this.translateY,
                this.effectiveRows(args),
                freezeColumns,
                0,
                mappedColumns,
                args.rowHeight
            );
            this.hoverInfo = [target, [x - cellRect.x, y - cellRect.y]];
        };

        if (itemsAreEqual(this.hoveredItem, item)) {
            // Same cell: still refresh the sub-cell hover position (needed by renderers that draw
            // hover effects relative to the cursor, e.g. link/button hover) and repaint just that
            // cell -- no need to touch the AnimationManager since the hovered item hasn't changed.
            if (item !== undefined && item[1] >= 0) {
                updateHoverInfo(item);
                this.drawWithDamage(new CellSet([item]));
            }
            return;
        }

        this.hoveredItem = item;

        if (item === undefined || item[1] < 0) {
            // Off-grid or over a header/group-header row: no per-cell `needsHover` renderer check
            // applies (mirrors `data-grid.tsx`'s `hoveredItem[1] < 0` early-out), but the animation
            // manager still needs to know the hover left so its leave-animation can play.
            this.hoverInfo = undefined;
            this.animationManager.setHovered(item);
            return;
        }

        updateHoverInfo(item);

        const cell = this.mangledGetCellContent(args)(item);
        const renderer = args.getCellRenderer(cell);
        const cellNeedsHover =
            (renderer === undefined && cell.kind === GridCellKind.Custom) ||
            (renderer?.needsHover !== undefined &&
                (typeof renderer.needsHover === "boolean" ? renderer.needsHover : renderer.needsHover(cell)));

        this.animationManager.setHovered(cellNeedsHover ? item : undefined);
    };

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
    private resolveMouseHit(args: ResolvedGridHostArgs, ev: MouseEvent): MouseHit {
        const { mappedColumns } = this.computeMangledLayout(args);
        const rect = this.root.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;

        const effectiveColumns = getEffectiveColumns(mappedColumns, this.cellXOffset, this.width, undefined, this.translateX);
        const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
        const row = getRowIndexForY(
            y,
            this.height,
            ENABLE_GROUPS,
            args.headerHeight,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            this.effectiveRows(args),
            args.rowHeight,
            this.cellYOffset,
            this.translateY,
            0
        );

        const shiftKey = ev.shiftKey;
        const ctrlKey = ev.ctrlKey;
        const metaKey = ev.metaKey;

        if (col === -1 || row === undefined || x < 0 || y < 0 || x > this.width || y > this.height) {
            const location: Item = [col !== -1 ? col : (x < 0 ? 0 : mappedColumns.length - 1), row ?? this.effectiveRows(args) - 1];
            // `offsetWidth - clientWidth` is 0 for overlay scrollbars (nothing to guard against
            // there) and approximates the classic scrollbar width otherwise -- good enough for this
            // best-effort guard, source's own `getScrollBarWidth()` isn't ported.
            const scrollbarWidth = this.scrollerEl.offsetWidth - this.scrollerEl.clientWidth;
            const isMaybeScrollbar =
                (x > this.width && x < this.width + scrollbarWidth) ||
                (y > this.height && y < this.height + scrollbarWidth);
            return { kind: "out-of-bounds", location, localX: x, localY: y, shiftKey, ctrlKey, metaKey, isMaybeScrollbar };
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
                isMaybeScrollbar: false,
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
            isMaybeScrollbar: false,
        };
    }

    // Precise hit-test for a header column's menu glyph specifically (`column.hasMenu === true`
    // only) -- distinct from a general header click. Mirrors source's `isOverHeaderElement`'s
    // "menu" branch (`data-grid.tsx:1021-1069`), minus the "indicator" icon branch (no
    // `onHeaderIndicatorClick` equivalent exposed yet -- not requested for 3a) and the
    // `isDragging`/`isResizing`/`hoveredOnEdge` guards (column resize/reorder is Phase 3d, so those
    // states never exist here). Returns the menu's bounds (canvas-space, for positioning a floating
    // menu) when `localX`/`localY` land inside them, else `undefined`.
    // `DrawGridArg.dragAndDropState` for the ported render engine's drag-visual drawing. `undefined`
    // both when no reorder drag is active AND when the current drop candidate was vetoed by
    // `onColumnProposeMove` -- mirrors source's `dragOffset` memo (`data-grid-dnd.tsx`) returning
    // `undefined` in the vetoed case, so no ghost/ring is drawn for a rejected drop position.
    private currentDragAndDropState(): DragAndDropState | undefined {
        const s = this.dragColState;
        if (s === undefined || !s.active || s.vetoed) return undefined;
        return { src: s.srcCol, dest: s.dropCol };
    }

    private hitTestHeaderMenu(
        args: ResolvedGridHostArgs,
        col: number,
        localX: number,
        localY: number
    ): Rectangle | undefined {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const column = mappedColumns[col];
        if (column === undefined || column.hasMenu !== true) return undefined;

        const bounds = computeBounds(
            col,
            -1,
            this.width,
            this.height,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            args.headerHeight,
            this.cellXOffset,
            this.cellYOffset,
            this.translateX,
            this.translateY,
            this.effectiveRows(args),
            freezeColumns,
            0,
            mappedColumns,
            args.rowHeight
        );
        const theme = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);
        const layout = computeHeaderLayout(
            this.headerCanvasCtx,
            column,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            theme,
            false
        );
        if (layout.menuBounds === undefined || !pointInRect(layout.menuBounds, localX, localY)) return undefined;
        return layout.menuBounds;
    }

    // Hit-test for a header column's resize-edge region (Phase 3d) -- a narrow strip at the
    // column's right border, `RESIZE_EDGE_PX` wide. `localX` is root-relative, same coordinate
    // space `computeBounds` returns. Resize is only reachable when at least one of the three
    // resize callbacks is configured (mirrors source's `canResize` gate) and never on the
    // row-marker column (mirrors source excluding `col === 0` marker-column resize).
    private hitTestColumnResizeEdge(args: ResolvedGridHostArgs, col: number, localX: number): boolean {
        if ((args.onColumnResize ?? args.onColumnResizeEnd ?? args.onColumnResizeStart) === undefined) return false;
        if (args.hasRowMarkers && col === 0) return false;
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const column = mappedColumns[col];
        if (column === undefined) return false;
        const bounds = computeBounds(
            col,
            -1,
            this.width,
            this.height,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            args.headerHeight,
            this.cellXOffset,
            this.cellYOffset,
            this.translateX,
            this.translateY,
            this.effectiveRows(args),
            freezeColumns,
            0,
            mappedColumns,
            args.rowHeight
        );
        return localX >= bounds.x + bounds.width - RESIZE_EDGE_PX && localX <= bounds.x + bounds.width;
    }

    private readonly onFocus = (): void => {
        if (this.isFocused) return;
        this.isFocused = true;
        this.scheduleFullRedraw();
    };

    private readonly onBlur = (): void => {
        if (!this.isFocused) return;
        this.isFocused = false;
        this.scheduleFullRedraw();
    };

    private readonly onMouseDown = (ev: MouseEvent): void => {
        if (this.destroyed || ev.button !== 0) return;
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

        // Header-menu-glyph click is exclusive with ordinary header-click selection dispatch --
        // mirrors source's `onPointerDown` short-circuit when `isOverHeaderElement(...) !==
        // undefined` (`data-grid.tsx:1101-1105`): the actual `onHeaderMenuClick` firing happens on
        // mouseup/click instead (`onMouseUp` below), this just remembers the candidate column and
        // skips everything else.
        if (hit.kind === "header") {
            const menuBounds = this.hitTestHeaderMenu(args, hit.location[0], hit.localX, hit.localY);
            if (menuBounds !== undefined) {
                this.pendingHeaderMenuClick = hit.location[0];
                return;
            }

            // Column resize (Phase 3d): mousedown on a header's resize-edge starts a resize drag
            // and is exclusive with normal header-click selection/reorder, exactly like the
            // menu-glyph check above -- mirrors source's `onMouseDownImpl`
            // (`data-grid-dnd.tsx`), which returns immediately after recording resize state.
            if (this.hitTestColumnResizeEdge(args, hit.location[0], hit.localX)) {
                const { mappedColumns } = this.computeMangledLayout(args);
                const column = mappedColumns[hit.location[0]];
                if (column !== undefined) {
                    const realCol = hit.location[0] - args.rowMarkerOffset;
                    this.resizeState = {
                        col: hit.location[0],
                        startClientX: ev.clientX,
                        startWidth: column.width,
                        lastWidth: column.width,
                    };
                    const realColumn = args.columns[realCol];
                    if (realColumn !== undefined) {
                        args.onColumnResizeStart?.(
                            realColumn,
                            column.width,
                            realCol,
                            column.width + (column.growOffset ?? 0)
                        );
                    }
                    this.scheduleFullRedraw();
                }
                return;
            }
        }
        this.pendingHeaderMenuClick = undefined;

        // Mirrors source's `setMouseState({previousSelection: gridSelection, fillHandle: fh})`
        // (`data-editor.tsx:2120-2123`) -- recorded for every kind (cell/header/out-of-bounds), not
        // just cell clicks, since drag-extend needs to know where the drag started regardless.
        this.mouseDownState = { location: hit.location, previousSelection: this.selection };

        if (hit.kind === "cell") {
            this.dispatchCellMouseDown(args, hit, isMultiKey);
        } else if (hit.kind === "header") {
            // Column reorder (Phase 3d): a header-body (non-edge) mousedown when `onColumnMoved` is
            // configured records drag-start state alongside the normal header-click selection
            // dispatch below -- source's `DataGridDnd` wraps `DataGrid` rather than replacing its
            // mousedown handling, so both happen on the same mousedown; whether it resolves to a
            // "click" (selection only, already applied below) or a "drag" (also fires
            // `onColumnMoved` on mouseup once the threshold is crossed) is decided by mousemove/up.
            if (args.onColumnMoved !== undefined && hit.location[0] >= args.rowMarkerOffset) {
                this.dragColState = {
                    srcCol: hit.location[0],
                    startClientX: ev.clientX,
                    active: false,
                    dropCol: hit.location[0],
                    vetoed: false,
                };
            }
            this.dispatchHeaderMouseDown(args, hit, isMultiKey);
        } else if (!hit.isMaybeScrollbar) {
            this.clearSelection();
        }
    };

    private readonly onMouseUp = (ev: MouseEvent): void => {
        if (this.destroyed) return;
        this.mouseDownState = undefined;

        if (this.resizeState !== undefined) {
            const rs = this.resizeState;
            this.resizeState = undefined;
            const args = this.resolveArgs();
            const realCol = rs.col - args.rowMarkerOffset;
            const realColumn = args.columns[realCol];
            const { mappedColumns } = this.computeMangledLayout(args);
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
            }
            this.scheduleFullRedraw();
            return;
        }

        if (this.pendingHeaderMenuClick === undefined) return;
        const args = this.resolveArgs();
        const col = this.pendingHeaderMenuClick;
        this.pendingHeaderMenuClick = undefined;

        const hit = this.resolveMouseHit(args, ev);
        if (hit.kind !== "header" || hit.location[0] !== col) return;
        const bounds = this.hitTestHeaderMenu(args, col, hit.localX, hit.localY);
        if (bounds === undefined) return;
        args.onHeaderMenuClick?.(col, bounds);
    };

    // Port of `handleSelect`'s `args.kind === "cell"` branch (`data-editor.tsx:1848-1993`).
    private dispatchCellMouseDown(args: ResolvedGridHostArgs, hit: MouseHit, isMultiKey: boolean): void {
        const [col, row] = hit.location;
        this.lastSelectedCol = undefined;

        if (args.hasRowMarkers && col === 0) {
            // Row-marker column click (`data-editor.tsx:1853-1911`). Phase 4d: no-op on the
            // trailing blank row -- there's no marker cell there (`mangledGetCellContent` returns a
            // plain loading cell for it), mirrors source's `showTrailingBlankRow === true && row ===
            // rows` guard in the same branch.
            if ((args.showTrailingBlankRow && row === args.rows) || args.rowMarkers === "number" || args.rowSelect === "none")
                return;

            const selectedRows = this.selection.rows;
            const isSelected = selectedRows.hasIndex(row);
            const lastHighlighted = this.lastSelectedRow;
            const isMultiRow = isMultiKey && args.rowSelect === "multi";

            if (
                args.rowSelect === "multi" &&
                hit.shiftKey &&
                lastHighlighted !== undefined &&
                selectedRows.hasIndex(lastHighlighted)
            ) {
                const newSlice: Slice = [Math.min(lastHighlighted, row), Math.max(lastHighlighted, row) + 1];
                if (isMultiRow || DEFAULT_ROW_SELECTION_MODE === "multi") {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, undefined, newSlice, true, DEFAULT_SELECTION_OPTIONS)
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            CompactSelection.fromSingleSelection(newSlice),
                            undefined,
                            isMultiRow,
                            DEFAULT_SELECTION_OPTIONS
                        )
                    );
                }
            } else if (args.rowSelect === "multi" && (isMultiRow || DEFAULT_ROW_SELECTION_MODE === "multi")) {
                if (isSelected) {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, selectedRows.remove(row), undefined, true, DEFAULT_SELECTION_OPTIONS)
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, undefined, row, true, DEFAULT_SELECTION_OPTIONS)
                    );
                    this.lastSelectedRow = row;
                }
            } else if (isSelected && selectedRows.length === 1) {
                this.applySelection(
                    writerSetSelectedRows(this.selection, CompactSelection.empty(), undefined, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                );
            } else {
                this.applySelection(
                    writerSetSelectedRows(
                        this.selection,
                        CompactSelection.fromSingleSelection(row),
                        undefined,
                        isMultiKey,
                        DEFAULT_SELECTION_OPTIONS
                    )
                );
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
        if (args.showTrailingBlankRow && row === args.rows) {
            args.onRowAppended?.();
            return;
        }

        // Ordinary cell click (`data-editor.tsx:1915-1993`).
        const current = this.selection.current;
        const cellCol = current?.cell[0];
        const cellRow = current?.cell[1];

        // Renderer-level click hook (Phase 4a) -- e.g. boolean-cell's checkbox-glyph hit-test.
        // Fires on every valid click on the cell regardless of prior selection state, mirrors
        // source's `handleMaybeClick` calling `r.onClick` before its activation-behavior switch
        // (`data-editor.tsx:2377-2394`). If it returns a new cell, that's a direct edit+redraw and
        // this click is fully consumed -- it neither re-selects nor activates the overlay editor
        // (matches boolean-cell's own `onSelect` calling `preventDefault()` over the same region,
        // which source uses to suppress the normal activation path for the exact same click).
        const cellContent = this.mangledGetCellContent(args)(hit.location);
        const renderer = args.getCellRenderer(cellContent);
        if (renderer?.onClick !== undefined && !isInnerOnlyCellKind(cellContent.kind)) {
            const cellRect = this.computeCellRect(args, col, row);
            const theme = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);
            const clickArgs = {
                cell: cellContent as never,
                posX: hit.localX - cellRect.x,
                posY: hit.localY - cellRect.y,
                bounds: cellRect,
                location: hit.location,
                theme,
                preventDefault: () => {},
                shiftKey: hit.shiftKey,
                ctrlKey: hit.ctrlKey,
                metaKey: hit.metaKey,
                isTouch: false,
                isEdge: false,
                button: 0,
                buttons: 1,
                scrollEdge: [0, 0] as const,
            };
            const newVal = renderer.onClick(clickArgs);
            if (newVal !== undefined) {
                this.commitCellEdit(args, hit.location, newVal as GridCell);
                return;
            }
        }

        if (cellCol === col && cellRow === row) {
            // Click landed on the already-selected cell -- activate it (Phase 4a). This port only
            // supports source's `cellActivationBehavior: "second-click"` (the default, see
            // PORTING-NOTES.md's Phase 4a section for why the other two modes aren't ported): ANY
            // click on an already-selected cell activates, no double-click timing needed -- a
            // double-click's second mousedown already satisfies "click on the already-selected
            // cell" on its own, so it's covered by this same branch without extra bookkeeping.
            this.activateCell(args, hit.location, cellContent, { highlight: true });
            return;
        }

        if (hit.shiftKey && cellCol !== undefined && cellRow !== undefined && current !== undefined) {
            const left = Math.min(col, cellCol);
            const right = Math.max(col, cellCol);
            const top = Math.min(row, cellRow);
            const bottom = Math.max(row, cellRow);
            const result = setCurrentSelection(
                this.selection,
                { ...current, range: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } },
                true,
                isMultiKey,
                "click",
                this.selectionOptions(args)
            );
            this.applySelection(result.selection);
        } else {
            const result = setCurrentSelection(
                this.selection,
                { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 } },
                true,
                isMultiKey,
                "click",
                this.selectionOptions(args)
            );
            this.applySelection(result.selection);
        }
        this.lastSelectedRow = undefined;
    }

    // Port of `handleSelect`'s `args.kind === "header"` branch (`data-editor.tsx:1994-2047`).
    private dispatchHeaderMouseDown(args: ResolvedGridHostArgs, hit: MouseHit, isMultiKey: boolean): void {
        const [col] = hit.location;
        const selectedColumns = this.selection.columns;
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
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            CompactSelection.fromSingleSelection([0, args.rows]),
                            undefined,
                            isMultiKey,
                            DEFAULT_SELECTION_OPTIONS
                        )
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, CompactSelection.empty(), undefined, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                    );
                }
            }
            return;
        }

        const lastCol = this.lastSelectedCol;
        if (args.columnSelect === "multi" && hit.shiftKey && lastCol !== undefined && selectedColumns.hasIndex(lastCol)) {
            const newSlice: Slice = [Math.min(lastCol, col), Math.max(lastCol, col) + 1];
            if (isMultiKey || DEFAULT_COLUMN_SELECTION_MODE === "multi") {
                this.applySelection(
                    writerSetSelectedColumns(this.selection, undefined, newSlice, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                );
            } else {
                this.applySelection(
                    writerSetSelectedColumns(
                        this.selection,
                        CompactSelection.fromSingleSelection(newSlice),
                        undefined,
                        isMultiKey,
                        DEFAULT_SELECTION_OPTIONS
                    )
                );
            }
        } else if (args.columnSelect === "multi" && (isMultiKey || DEFAULT_COLUMN_SELECTION_MODE === "multi")) {
            if (selectedColumns.hasIndex(col)) {
                this.applySelection(
                    writerSetSelectedColumns(this.selection, selectedColumns.remove(col), undefined, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                );
            } else {
                this.applySelection(
                    writerSetSelectedColumns(this.selection, undefined, col, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                );
            }
            this.lastSelectedCol = col;
        } else if (args.columnSelect !== "none") {
            if (selectedColumns.hasIndex(col)) {
                this.applySelection(
                    writerSetSelectedColumns(this.selection, selectedColumns.remove(col), undefined, isMultiKey, DEFAULT_SELECTION_OPTIONS)
                );
            } else {
                this.applySelection(
                    writerSetSelectedColumns(
                        this.selection,
                        CompactSelection.fromSingleSelection(col),
                        undefined,
                        isMultiKey,
                        DEFAULT_SELECTION_OPTIONS
                    )
                );
            }
            this.lastSelectedCol = col;
        }
        this.lastSelectedRow = undefined;
    }

    // Drag-extend, invoked from `onMouseMove` while a button is held. Port of source's
    // `onItemHoveredImpl`'s two selection-growing branches (`data-editor.tsx:2734-2806`), minus
    // fill-handle (`mouseState.fillHandle`) and row-grouping (`getSelectionRowLimits`) clamping --
    // neither concept exists in this port yet.
    private handleDragMove(
        args: ResolvedGridHostArgs,
        mouseDownState: { location: Item; previousSelection: GridSelection },
        location: Item
    ): void {
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
        const isRowMarkerDrag =
            mouseDownState.location[0] === 0 &&
            args.rowMarkerOffset === 1 &&
            args.rowSelect === "multi" &&
            !mouseDownState.previousSelection.rows.hasIndex(mouseDownState.location[1]) &&
            this.selection.rows.hasIndex(mouseDownState.location[1]);

        if (isRowMarkerDrag) {
            const start = Math.min(mouseDownState.location[1], row);
            const end = Math.max(mouseDownState.location[1], row) + 1;
            this.applySelection(
                writerSetSelectedRows(
                    this.selection,
                    CompactSelection.fromSingleSelection([start, end]),
                    undefined,
                    false,
                    DEFAULT_SELECTION_OPTIONS
                )
            );
            return;
        }

        if (this.selection.current !== undefined && (args.rangeSelect === "rect" || args.rangeSelect === "multi-rect")) {
            const [selectedCol, selectedRow] = this.selection.current.cell;
            const targetRow = row < 0 ? this.cellYOffset : row;
            const targetCol = Math.max(col, args.rowMarkerOffset);

            const deltaX = targetCol - selectedCol;
            const deltaY = targetRow - selectedRow;
            const newRange: Rectangle = {
                x: deltaX >= 0 ? selectedCol : targetCol,
                y: deltaY >= 0 ? selectedRow : targetRow,
                width: Math.abs(deltaX) + 1,
                height: Math.abs(deltaY) + 1,
            };

            const result = setCurrentSelection(
                this.selection,
                { ...this.selection.current, range: newRange },
                true,
                false,
                "drag",
                this.selectionOptions(args)
            );
            this.applySelection(result.selection);
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
    private computeCellRect(args: ResolvedGridHostArgs, mangledCol: number, row: number): Rectangle {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        return computeBounds(
            mangledCol,
            row,
            this.width,
            this.height,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            args.headerHeight,
            this.cellXOffset,
            this.cellYOffset,
            this.translateX,
            this.translateY,
            this.effectiveRows(args),
            freezeColumns,
            0,
            mappedColumns,
            args.rowHeight
        );
    }

    /** Writes an edited cell back via `onCellsEdited` + a damage-only redraw of just that cell.
     *  `mangledLocation` is in row-marker-space (what selection/hit-testing use throughout this
     *  file); converted to real column space only at the `onCellsEdited` callback boundary, same
     *  convention as every other edit path in this file (paste/cut). */
    private commitCellEdit(args: ResolvedGridHostArgs, mangledLocation: Item, newValue: GridCell): void {
        const [mCol, mRow] = mangledLocation;
        const realCol = mCol - args.rowMarkerOffset;
        args.onCellsEdited?.([{ location: [realCol, mRow], value: newValue }]);
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
    private activateCell(
        args: ResolvedGridHostArgs,
        mangledLocation: Item,
        cellContent: InnerGridCell,
        opts: { readonly highlight: boolean; readonly initialValue?: string }
    ): void {
        if (cellContent.kind === InnerGridCellKind.NewRow) {
            args.onRowAppended?.();
            return;
        }
        if (isInnerOnlyCellKind(cellContent.kind)) return;
        const cell = cellContent as GridCell;

        // Boolean cells never open the overlay -- toggled directly, matches source's `reselect()`
        // `c.kind === GridCellKind.Boolean` branch exactly (bypasses `setOverlaySimple` entirely).
        if (cell.kind === GridCellKind.Boolean) {
            if (!booleanCellIsEditable(cell)) return;
            this.commitCellEdit(args, mangledLocation, { ...cell, data: toggleBoolean(cell.data) });
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

        let content: GridCell = cell;
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
                case GridCellKind.Number: {
                    const parsed = opts.initialValue === "-" ? -0 : Number.parseFloat(opts.initialValue);
                    const n = Number.isNaN(parsed) ? 0 : parsed;
                    content = { ...content, data: n, displayData: opts.initialValue };
                    break;
                }
                case GridCellKind.Text:
                    content = { ...content, data: opts.initialValue, displayData: opts.initialValue };
                    break;
                case GridCellKind.Markdown:
                case GridCellKind.Uri:
                    content = { ...content, data: opts.initialValue } as GridCell;
                    break;
                default:
                    break;
            }
        }

        this.openOverlay(args, mangledLocation, content, opts.highlight);
    }

    private openOverlay(args: ResolvedGridHostArgs, mangledLocation: Item, cell: GridCell, highlight: boolean): void {
        if (this.overlayState !== undefined) {
            this.finishOverlay(args, this.overlayState.currentCell, [0, 0]);
        }

        const renderer = args.getCellRenderer(cell);
        const editorResult = renderer?.provideEditor?.({ ...cell, location: mangledLocation } as never);
        if (editorResult === undefined) return;
        const isObj = isObjectEditorCallbackResult(editorResult);
        const editorFn = isObj ? editorResult.editor : editorResult;
        const disablePadding = editorResult.disablePadding === true;

        const [mCol, mRow] = mangledLocation;
        const cellRect = this.computeCellRect(args, mCol, mRow);
        const theme = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);

        const container = document.createElement("div");
        Object.assign(container.style, {
            position: "absolute",
            left: `${cellRect.x}px`,
            top: `${cellRect.y}px`,
            minWidth: `${cellRect.width}px`,
            width: "max-content",
            maxWidth: "400px",
            // Deliberately `minHeight`, not a fixed `height` (a real bug found via browser testing
            // of Phase 4b's markdown editor, whose content is routinely taller than one row): a
            // fixed height + `overflow: visible` let multi-line editor/preview content spill out
            // past this container's own bottom edge, into the area below where there is no `theme
            // .bgCell` background -- the overflow visually reads as "text floating transparently
            // over the next row" rather than a properly-sized editor box. `minHeight` lets the
            // container grow to fit its content (mirrors source's `min-height`/`max-height`
            // approach, `internal/data-grid-overlay-editor/data-grid-overlay-editor-style.tsx`);
            // `maxHeight` + `overflow: auto` caps growth at the visible viewport instead of letting
            // a very long value push the box off-screen, scrolling internally past that point.
            minHeight: `${cellRect.height}px`,
            maxHeight: `calc(100vh - ${cellRect.y}px - 10px)`,
            boxSizing: "border-box",
            background: theme.bgCell,
            border: `2px solid ${theme.accentColor}`,
            zIndex: "20",
            overflow: "auto",
            padding: disablePadding ? "0" : `${theme.cellVerticalPadding}px ${theme.cellHorizontalPadding}px`,
        } satisfies Partial<CSSStyleDeclaration>);

        const state: OverlayState = {
            realLocation: [mCol - args.rowMarkerOffset, mRow],
            mangledLocation,
            container,
            // `handle` is assigned immediately below -- `editorFn` is called synchronously and
            // never reads `state.handle` itself, only `onFinishedEditing`/`onChange` do, and those
            // can't fire before `editorFn` returns. Cast avoids a chicken-and-egg `undefined` slot.
            handle: undefined as unknown as CellEditorHandle,
            currentCell: cell,
            finished: false,
        };

        const handle = editorFn({
            value: cell as never,
            isHighlighted: highlight,
            theme,
            validatedSelection: undefined,
            onChange: newValue => {
                state.currentCell = newValue as GridCell;
            },
            onFinishedEditing: (newValue, movement) => {
                this.finishOverlay(args, newValue as GridCell | undefined, movement ?? [0, 0]);
            },
        });
        state.handle = handle;
        this.overlayState = state;

        container.addEventListener("keydown", (ev: KeyboardEvent) => {
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

        // Deferred, not called synchronously here (Phase 4a bug found via browser testing): this
        // whole method runs inside a native `mousedown` handler, and the activating click's
        // `mouseup`/`click` haven't been dispatched yet -- Chrome delivers them to whatever element
        // now sits under the pointer, which after `appendChild` above is this editor's freshly-
        // focused textarea, and its default caret-placement-from-click-point handling on that
        // `mouseup` was observed to silently collapse the `setSelectionRange(0, length)`
        // select-all this call performs, right after it ran. Source doesn't hit this: React defers
        // the equivalent `useEffect`-based focus/selection past the triggering event's full native
        // dispatch (mousedown+mouseup+click all complete before React's commit phase runs its
        // effects), which this imperative port has no equivalent scheduling point for -- deferring
        // via `setTimeout` reproduces the same "after this gesture's native events are done" timing.
        window.setTimeout(() => {
            if (this.overlayState === state) handle.focus();
        }, 0);

        // Click-outside commits (mirrors source's `ClickOutsideContainer` -> `onClickOutside` ->
        // save, not cancel). Registered on the next tick rather than synchronously: this method is
        // itself always called from within a `mousedown` dispatch (an activation click or a
        // type-to-overwrite keydown that started life as a click's Enter-equivalent), and adding a
        // capture-phase `window` listener mid-dispatch must not risk catching that same event.
        window.setTimeout(() => {
            if (this.overlayState === state) {
                window.addEventListener("mousedown", this.onOverlayOutsideClick, true);
            }
        }, 0);
    }

    private readonly onOverlayOutsideClick = (ev: MouseEvent): void => {
        const state = this.overlayState;
        if (state === undefined) return;
        if (ev.target instanceof Node && state.container.contains(ev.target)) return;
        this.finishOverlay(this.resolveArgs(), state.currentCell, [0, 0]);
    };

    /** Closes the overlay, optionally committing `newValue` first, then moves the active cell by
     *  `movement` if non-zero. Idempotent via `state.finished` -- source's overlay can reach this
     *  point twice for one logical close (e.g. an Enter keydown finishing the editor and a
     *  subsequent synthetic/blur-driven click-outside on the same tick), see `OverlayState.finished`'s
     *  doc comment above. */
    private finishOverlay(
        args: ResolvedGridHostArgs,
        newValue: GridCell | undefined,
        movement: readonly [-1 | 0 | 1, -1 | 0 | 1]
    ): void {
        const state = this.overlayState;
        if (state === undefined || state.finished) return;
        state.finished = true;
        this.overlayState = undefined;

        window.removeEventListener("mousedown", this.onOverlayOutsideClick, true);
        state.handle.destroy();
        state.container.remove();

        if (newValue !== undefined) {
            this.commitCellEdit(args, state.mangledLocation, newValue);
        } else {
            this.scheduleFullRedraw();
        }

        this.root.focus();
        if (movement[0] !== 0 || movement[1] !== 0) {
            const [mCol, mRow] = state.mangledLocation;
            this.moveActiveCell(args, mCol + movement[0], mRow + movement[1]);
        }
    }

    // Delete/Backspace: clears every read-write cell in the current selection. Prefers each cell's
    // own renderer `onDelete` (richer/kind-specific, e.g. boolean-cell's `onDelete` sets `data:
    // false` rather than `BooleanEmpty`) over the generic `clearedCellValue` fallback used by
    // `onCut` -- mirrors source routing deletion through the renderer registry
    // (`data-editor-fns.ts`), which `onCut`'s simpler port (Phase 3c, predates real cell renderers
    // existing) couldn't do yet.
    private deleteSelection(args: ResolvedGridHostArgs): void {
        const region = this.selectedRegion(args);
        if (region === undefined) return;
        const colStart = Math.max(region.colStart, args.rowMarkerOffset);
        if (colStart >= region.colEnd || region.rowStart >= region.rowEnd) return;

        const edits: { location: Item; value: GridCell }[] = [];
        const damaged: Item[] = [];
        for (let row = region.rowStart; row < region.rowEnd; row++) {
            for (let col = colStart; col < region.colEnd; col++) {
                const realCol = col - args.rowMarkerOffset;
                const cell = args.getCellContent([realCol, row]);
                if (!isReadWriteCell(cell)) continue;
                const renderer = args.getCellRenderer(cell);
                const cleared = renderer?.onDelete?.(cell as never) ?? this.clearedCellValue(cell);
                if (cleared !== undefined) {
                    edits.push({ location: [realCol, row], value: cleared as GridCell });
                    damaged.push([col, row]);
                }
            }
        }
        if (edits.length > 0) {
            args.onCellsEdited?.(edits);
            this.drawWithDamage(new CellSet(damaged));
        }
    }

    // --- keyboard nav (Phase 3b) -----------------------------------------------------------------
    // Port of the relevant subset of source's `handleFixedKeybindings`/`updateSelectedCell`/
    // `adjustSelection` (`data-editor.tsx`, see PORTING-NOTES.md for exact line references). Not
    // ported: source's generic `keybindings` DSL (`is-hotkey.ts`)/`ConfigurableKeybinds` -- this
    // handler matches the *default* keybindings directly rather than reimplementing the whole
    // string-based hotkey matcher, since no consumer of this port has a need to remap keys yet.
    // Also not ported: Tab/Shift+Tab nav aliasing, alt+arrow "free move" (retains a multi-cell
    // selection while moving the anchor -- meaningless without span/editor support), cell
    // activation (Enter/Space/printable-char -- Phase 4, no cell editors exist), copy/cut/paste
    // (Phase 3c, native clipboard events not keydown), row/column space/ctrl+space select
    // shortcuts, primary+shift+Arrow/Home/End "jump and extend" (source's own
    // `selectToFirst/LastRow/Column/Cell` keybinds) -- only bare shift+Arrow grow/shrink (item 2 of
    // the phase brief) is ported.
    private readonly onKeyDown = (ev: KeyboardEvent): void => {
        if (this.destroyed || !this.isFocused) return;
        // While the overlay editor is open, its own container-level `keydown` listener (registered
        // in `openOverlay`) handles Escape/Enter/Tab and `stopPropagation()`s them -- everything
        // else (ordinary typing, arrow keys for caret movement inside the editor's textarea) must
        // bubble through untouched, not be reinterpreted as grid navigation/select-all/etc below.
        if (this.overlayState !== undefined) return;

        const primary = browserIsOSX.value ? ev.metaKey : ev.ctrlKey;

        // Ctrl(Cmd)+A: select all. Works even with no `selection.current` yet (mirrors source,
        // which computes `gridSelection.current?.cell ?? [rowMarkerOffset, 0]`), so this check runs
        // before the "no current cell -> no-op" guard below that gates every other key.
        if (primary && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "a") {
            this.selectAll(this.resolveArgs());
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }

        // Cell activation (Phase 4a) -- Enter, Delete/Backspace, and type-to-overwrite. All three
        // are no-ops with nothing selected, mirroring source's early-outs for the same keys.
        if (this.selection.current !== undefined) {
            const activationArgs = this.resolveArgs();
            const mangledLocation = this.selection.current.cell;

            if (ev.key === "Enter" && !primary && !ev.altKey) {
                const cellContent = this.mangledGetCellContent(activationArgs)(mangledLocation);
                this.activateCell(activationArgs, mangledLocation, cellContent, { highlight: true });
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }

            if (ev.key === "Delete" || ev.key === "Backspace") {
                this.deleteSelection(activationArgs);
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }

            // Type-to-overwrite: mirrors source's `editOnType` (`data-editor.tsx:3505-3524`) --
            // any single printable character, no modifiers, immediately opens the overlay seeded
            // with that character instead of the cell's existing content.
            if (
                !primary &&
                !ev.metaKey &&
                ev.key.length === 1 &&
                PRINTABLE_CHAR_RE.test(ev.key) &&
                mangledLocation[1] >= 0
            ) {
                const cellContent = this.mangledGetCellContent(activationArgs)(mangledLocation);
                if (!isInnerOnlyCellKind(cellContent.kind) && isReadWriteCell(cellContent as GridCell)) {
                    this.activateCell(activationArgs, mangledLocation, cellContent, {
                        highlight: false,
                        initialValue: ev.key,
                    });
                    ev.preventDefault();
                    ev.stopPropagation();
                    return;
                }
            }
        }

        const isArrow =
            ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight";
        const isHome = ev.key === "Home";
        const isEnd = ev.key === "End";
        if (!isArrow && !isHome && !isEnd) return;
        // alt+Arrow ("retain selection" free move, source's `go*CellRetainSelection`) is not
        // ported -- meaningless without span/editor support in this port yet -- so let the browser
        // default run rather than half-implement it.
        if (ev.altKey) return;
        // Mirrors source's `if (gridSelection.current === undefined) return false;` early-out --
        // every nav key below is a no-op with nothing selected yet.
        if (this.selection.current === undefined) return;

        const args = this.resolveArgs();
        const [col, row] = this.selection.current.cell;

        if (primary && ev.shiftKey) {
            // primary+shift+Arrow/Home/End ("jump and extend selection to an edge") not ported --
            // out of scope per the phase brief, which only asks for bare shift+Arrow grow/shrink.
            return;
        }

        if (ev.shiftKey) {
            if (!isArrow) return; // shift+Home/End "extend to edge" not ported
            if (args.rangeSelect !== "rect" && args.rangeSelect !== "multi-rect") return;
            const dx: -1 | 0 | 1 = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
            const dy: -1 | 0 | 1 = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
            this.adjustSelection(args, dx, dy);
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }

        let targetCol = col;
        let targetRow = row;
        if (primary) {
            // Ctrl(Cmd)+Home/End: jump to first/last cell in the whole grid. Ctrl(Cmd)+Arrow: jump
            // to first/last row (up/down) or column (left/right) only.
            if (isHome) {
                targetCol = args.rowMarkerOffset;
                targetRow = 0;
            } else if (isEnd) {
                targetCol = Number.MAX_SAFE_INTEGER;
                // Ctrl(Cmd)+End reaches the trailing blank row when shown (source's
                // `updateSelectedCell` clamps to `mangledRows - 1`, `data-editor.tsx:3026` -- Ctrl+
                // ArrowDown below deliberately does NOT, see its own comment).
                targetRow = this.effectiveRows(args) - 1;
            } else if (ev.key === "ArrowUp") {
                targetRow = 0;
            } else if (ev.key === "ArrowDown") {
                // Ctrl(Cmd)+ArrowDown ("go to last row") deliberately excludes the trailing blank
                // row -- mirrors source's `goToLastRow` setting `row = rows - 1` (the real, non-
                // mangled row count; `data-editor.tsx:3353-3354`), distinct from Ctrl+End above.
                targetRow = args.rows - 1;
            } else if (ev.key === "ArrowLeft") {
                targetCol = args.rowMarkerOffset;
            } else if (ev.key === "ArrowRight") {
                targetCol = Number.MAX_SAFE_INTEGER;
            }
        } else if (isHome) {
            targetCol = args.rowMarkerOffset;
        } else if (isEnd) {
            targetCol = Number.MAX_SAFE_INTEGER;
        } else if (ev.key === "ArrowUp") {
            targetRow = row - 1;
        } else if (ev.key === "ArrowDown") {
            targetRow = row + 1;
        } else if (ev.key === "ArrowLeft") {
            targetCol = col - 1;
        } else if (ev.key === "ArrowRight") {
            targetCol = col + 1;
        }

        const moved = this.moveActiveCell(args, targetCol, targetRow);
        // Mirrors source's `moved || !cancelOnlyOnMove || trapFocus` gate (`trapFocus` defaults to
        // `false` and isn't exposed by this port yet) -- an already-at-the-edge nav key is left
        // alone (not prevented) rather than swallowed, matching source exactly.
        if (moved) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    };

    // Port of `updateSelectedCell`'s core (clamp + no-op-if-unchanged + `setCurrent(..., "keyboard-nav")`
    // + scroll-into-view), minus the `freeMove`/`lastSent` concerns that don't apply to this port
    // yet. Returns whether the active cell actually moved (false when the clamped target equals the
    // current cell -- i.e. the move was into a wall). Phase 4d: the row clamp's upper bound is
    // `effectiveRows(args) - 1`, not `args.rows - 1`, so plain Arrow-key nav (and Ctrl+End, via its
    // own `targetRow` above) can reach the trailing blank row -- mirrors source's
    // `updateSelectedCell`'s `rowMax = mangledRows - (fromEditingTrailingRow ? 0 : 1)`
    // (`data-editor.tsx:3026`, the common non-`fromEditingTrailingRow` case).
    private moveActiveCell(args: ResolvedGridHostArgs, colIn: number, rowIn: number): boolean {
        const { mappedColumns } = this.computeMangledLayout(args);
        const minCol = args.rowMarkerOffset;
        const maxCol = mappedColumns.length - 1;
        const col = Math.min(Math.max(colIn, minCol), maxCol);
        const row = Math.min(Math.max(rowIn, 0), this.effectiveRows(args) - 1);

        const current = this.selection.current;
        if (current !== undefined && current.cell[0] === col && current.cell[1] === row) return false;

        const result = setCurrentSelection(
            this.selection,
            { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 } },
            true,
            false,
            "keyboard-nav",
            this.selectionOptions(args)
        );
        this.applySelection(result.selection);
        this.scrollCellIntoView(args, col, row);
        return true;
    }

    // Port of `adjustSelection`'s core motion logic (the `y !== 0`/`x !== 0` "motion up/down/left/right"
    // cases only -- case `2`/`-2`, "jump to end/start", is source's primary+shift+Home/End/Arrow,
    // deliberately not ported, see `onKeyDown` above) and the span-skipping (`disallowed`/
    // `getCellsForSelection`) logic, which has no meaning without span support (not ported anywhere
    // in this port yet). Grows/shrinks the range on the edge opposite the anchor cell
    // (`selection.current.cell`); shrinks back in on the near edge once the far edge has retreated
    // past the anchor. Exactly one of `dx`/`dy` is non-zero per call (a single arrow keypress).
    private adjustSelection(args: ResolvedGridHostArgs, dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
        const current = this.selection.current;
        if (current === undefined) return;
        const [col, row] = current.cell;
        const old = current.range;
        let left = old.x;
        let right = old.x + old.width;
        let top = old.y;
        let bottom = old.y + old.height;

        const { mappedColumns } = this.computeMangledLayout(args);
        const minCol = args.rowMarkerOffset;
        const maxColExclusive = mappedColumns.length;
        const maxRowExclusive = args.rows;

        if (dy === 1) {
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

        if (dx === 1) {
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

        const result = setCurrentSelection(
            this.selection,
            { cell: current.cell, range: { x: left, y: top, width: right - left, height: bottom - top } },
            true,
            false,
            "keyboard-select",
            this.selectionOptions(args)
        );
        this.applySelection(result.selection);

        // Scroll the edge that actually moved into view (mirrors source's per-branch `scrollTo`
        // calls in `adjustSelection`), not the anchor cell.
        const edgeCol = dx === 1 ? right - 1 : dx === -1 ? left : col;
        const edgeRow = dy === 1 ? bottom - 1 : dy === -1 ? top : row;
        this.scrollCellIntoView(args, edgeCol, edgeRow);
    }

    // Port of `handleFixedKeybindings`'s `selectAll` branch (`data-editor.tsx`). Note this
    // deliberately does NOT go through the `setCurrentSelection` writer (source calls
    // `setGridSelection` directly here too) -- and the range's `width` is `args.columns.length`,
    // the caller's *un-mangled* column count, not `mappedColumns.length` -- select-all spans every
    // real column starting right after the row-marker column (if any), never the marker column
    // itself. `rows`/`columns` CompactSelections stay empty; "select all" is expressed purely via
    // `current.range` covering the whole grid, matching source exactly (verified against
    // `data-editor.tsx`'s `keys.selectAll` branch).
    private selectAll(args: ResolvedGridHostArgs): void {
        const current = this.selection.current;
        const newSelection: GridSelection = {
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: {
                cell: current?.cell ?? [args.rowMarkerOffset, 0],
                range: { x: args.rowMarkerOffset, y: 0, width: args.columns.length, height: args.rows },
                rangeStack: [],
            },
        };
        this.applySelection(newSelection);
    }

    // Simplified stand-in for source's `scrollTo` (see PORTING-NOTES.md -- easing/behavior options,
    // frozen-trailing-rows, and DPI/CSS-scale correction are all not ported). Scrolls just enough
    // that the given cell's bounds (computed the same way hover/click hit-testing does) become
    // fully visible within the non-frozen/non-header viewport, doing nothing if it already is.
    private scrollCellIntoView(args: ResolvedGridHostArgs, col: number, row: number): void {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        if (col < 0 || col >= mappedColumns.length || row < 0 || row >= this.effectiveRows(args)) return;

        const bounds = computeBounds(
            col,
            row,
            this.width,
            this.height,
            ENABLE_GROUPS ? args.groupHeaderHeight : 0,
            args.headerHeight,
            this.cellXOffset,
            this.cellYOffset,
            this.translateX,
            this.translateY,
            this.effectiveRows(args),
            freezeColumns,
            0,
            mappedColumns,
            args.rowHeight
        );

        let deltaX = 0;
        if (col >= freezeColumns) {
            const frozenWidth = getStickyWidth(mappedColumns);
            if (bounds.x < frozenWidth) {
                deltaX = bounds.x - frozenWidth;
            } else if (bounds.x + bounds.width > this.width) {
                deltaX = bounds.x + bounds.width - this.width;
            }
        }

        let deltaY = 0;
        const totalHeaderHeight = args.headerHeight; // ENABLE_GROUPS is always false in this phase
        if (bounds.y < totalHeaderHeight) {
            deltaY = bounds.y - totalHeaderHeight;
        } else if (bounds.y + bounds.height > this.height) {
            deltaY = bounds.y + bounds.height - this.height;
        }

        if (deltaX !== 0) this.scrollerEl.scrollLeft += deltaX;
        if (deltaY !== 0) this.scrollerEl.scrollTop += deltaY;
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
    private selectedRegion(
        args: ResolvedGridHostArgs
    ): { colStart: number; colEnd: number; rowStart: number; rowEnd: number } | undefined {
        const sel = this.selection;
        const { mappedColumns } = this.computeMangledLayout(args);
        if (sel.current !== undefined) {
            const r = sel.current.range;
            return { colStart: r.x, colEnd: r.x + r.width, rowStart: r.y, rowEnd: Math.min(r.y + r.height, args.rows) };
        }
        if (sel.rows.length > 0) {
            const rows = [...sel.rows];
            return {
                colStart: args.rowMarkerOffset,
                colEnd: mappedColumns.length,
                rowStart: Math.min(...rows),
                rowEnd: Math.max(...rows) + 1,
            };
        }
        if (sel.columns.length > 0) {
            const cols = [...sel.columns];
            return {
                colStart: Math.min(...cols),
                colEnd: Math.max(...cols) + 1,
                rowStart: 0,
                rowEnd: args.rows,
            };
        }
        return undefined;
    }

    private buildCopyBuffer(args: ResolvedGridHostArgs): { textPlain: string; textHtml: string } | undefined {
        const region = this.selectedRegion(args);
        if (region === undefined) return undefined;
        // Row-marker column (if any) is never a real data column -- exclude it from the copied
        // region entirely rather than emitting a placeholder cell for it.
        const colStart = Math.max(region.colStart, args.rowMarkerOffset);
        if (colStart >= region.colEnd || region.rowStart >= region.rowEnd) return undefined;

        const columnIndexes: number[] = [];
        for (let col = colStart; col < region.colEnd; col++) columnIndexes.push(col - args.rowMarkerOffset);

        const cells: GridCell[][] = [];
        for (let row = region.rowStart; row < region.rowEnd; row++) {
            const rowCells: GridCell[] = [];
            for (let col = colStart; col < region.colEnd; col++) {
                rowCells.push(args.getCellContent([col - args.rowMarkerOffset, row]));
            }
            cells.push(rowCells);
        }
        return getCopyBufferContents(cells, columnIndexes);
    }

    // Coerces a parsed paste buffer entry into a replacement `GridCell` matching `existing`'s kind.
    // Source dispatches this to each cell renderer's own `onPaste` (or a `coercePasteValue` prop).
    // This port now does the same for `GridCellKind.Custom` (added Phase 5c -- see below); the
    // built-in kinds below remain a direct, minimal equivalent covering the data kinds Phase 1's
    // data model supports, inverse of `copy-paste.ts`'s `convertCellToBuffer` for the same kinds.
    private pasteValueIntoCell(args: ResolvedGridHostArgs, existing: GridCell, buf: CellBuffer): GridCell | undefined {
        const raw = Array.isArray(buf.rawValue)
            ? buf.rawValue.join(", ")
            : (buf.rawValue?.toString() ?? buf.formatted.toString());
        switch (existing.kind) {
            case GridCellKind.Text:
                return { ...existing, data: raw, displayData: raw };
            case GridCellKind.Number: {
                const trimmed = raw.trim();
                if (trimmed === "") return { ...existing, data: undefined, displayData: "" };
                const n = Number(trimmed);
                if (Number.isNaN(n)) return undefined;
                return { ...existing, data: n, displayData: raw };
            }
            case GridCellKind.Boolean: {
                const upper = raw.trim().toUpperCase();
                const data =
                    upper === "TRUE"
                        ? true
                        : upper === "FALSE"
                          ? false
                          : upper === "INDETERMINATE"
                            ? BooleanIndeterminate
                            : BooleanEmpty;
                return { ...existing, data };
            }
            case GridCellKind.Uri:
                return { ...existing, data: raw };
            case GridCellKind.Markdown:
                return { ...existing, data: raw };
            case GridCellKind.Custom: {
                // Phase 5c fix: `isReadWriteCell` (checked by this method's only caller, `onPaste`
                // below) DOES include `GridCellKind.Custom` (`readonly !== true`) -- the old comment
                // here claiming Custom was "not writable via isReadWriteCell anyway" was stale/wrong
                // for this kind specifically, and this `default` branch's unconditional `undefined`
                // silently made paste into every `CustomRenderer` cell (Phase 5a/5b/5c's extra
                // cells) a no-op. Dispatches to the matching `CustomRenderer.onPaste` (source's own
                // mechanism, `CustomRenderer<T>["onPaste"]`, `cell-types.ts`), same as every other
                // kind above dispatches to its own paste-coercion rule.
                const renderer = args.getCellRenderer(existing) as CustomRenderer<CustomCell> | undefined;
                if (renderer?.onPaste === undefined) return undefined;
                const newData = renderer.onPaste(raw, existing.data);
                if (newData === undefined) return undefined;
                return { ...existing, data: newData };
            }
            default:
                // Image/Bubble/Drilldown/RowID/Loading/Protected: not writable via `isReadWriteCell`
                // anyway (this method is only called for cells that already passed that check), so
                // `default` is unreachable for those kinds in practice -- returned as a safe no-op
                // rather than asserted, since new GridCell kinds could be added upstream without
                // this switch being updated in lockstep.
                return undefined;
        }
    }

    // Inverse of `pasteValueIntoCell` for the "cut" gesture -- resets a cell to its kind-appropriate
    // empty value. Mirrors source's `onCut` = `onCopy` + delete-range, using the same per-kind
    // emptiness convention `data-editor-fns.ts`'s delete-keybind clearing logic uses.
    private clearedCellValue(existing: GridCell): GridCell | undefined {
        switch (existing.kind) {
            case GridCellKind.Text:
                return { ...existing, data: "", displayData: "" };
            case GridCellKind.Number:
                return { ...existing, data: undefined, displayData: "" };
            case GridCellKind.Boolean:
                return { ...existing, data: BooleanEmpty };
            case GridCellKind.Uri:
                return { ...existing, data: "" };
            case GridCellKind.Markdown:
                return { ...existing, data: "" };
            default:
                return undefined;
        }
    }

    private readonly onCopy = (ev: ClipboardEvent): void => {
        if (this.destroyed || !this.isFocused) return;
        const args = this.resolveArgs();
        const buffer = this.buildCopyBuffer(args);
        if (buffer === undefined || ev.clipboardData === null) return;
        ev.clipboardData.setData("text/plain", buffer.textPlain);
        ev.clipboardData.setData("text/html", buffer.textHtml);
        ev.preventDefault();
    };

    private readonly onCut = (ev: ClipboardEvent): void => {
        if (this.destroyed || !this.isFocused) return;
        this.onCopy(ev);
        const args = this.resolveArgs();
        const region = this.selectedRegion(args);
        if (region === undefined) return;
        const colStart = Math.max(region.colStart, args.rowMarkerOffset);
        const edits: { location: Item; value: GridCell }[] = [];
        for (let row = region.rowStart; row < region.rowEnd; row++) {
            for (let col = colStart; col < region.colEnd; col++) {
                const realCol = col - args.rowMarkerOffset;
                const cell = args.getCellContent([realCol, row]);
                if (!isReadWriteCell(cell)) continue;
                const cleared = this.clearedCellValue(cell);
                if (cleared !== undefined) edits.push({ location: [realCol, row], value: cleared });
            }
        }
        if (edits.length > 0) args.onCellsEdited?.(edits);
    };

    private readonly onPaste = (ev: ClipboardEvent): void => {
        if (this.destroyed || !this.isFocused) return;
        const args = this.resolveArgs();
        if (ev.clipboardData === null) return;

        const html = ev.clipboardData.getData("text/html");
        const plain = ev.clipboardData.getData("text/plain");
        let buffer: CopyBuffer | undefined;
        if (html.length > 0) buffer = decodeHTML(html);
        if (buffer === undefined && plain.length > 0) buffer = unquote(plain);
        if (buffer === undefined || buffer.length === 0) return;

        // Paste-target anchor: current range's top-left, else sole selected column (row 0) or
        // sole selected row (first real column), else no-op. Mirrors source's paste-target
        // resolution (PORTING-NOTES.md, `data-editor.tsx:3646-3654`).
        let anchorCol: number;
        let anchorRow: number;
        if (this.selection.current !== undefined) {
            anchorCol = this.selection.current.range.x;
            anchorRow = this.selection.current.range.y;
        } else if (this.selection.columns.length > 0) {
            anchorCol = this.selection.columns.first() ?? args.rowMarkerOffset;
            anchorRow = 0;
        } else if (this.selection.rows.length > 0) {
            anchorCol = args.rowMarkerOffset;
            anchorRow = this.selection.rows.first() ?? 0;
        } else {
            return;
        }

        const edits: { location: Item; value: GridCell }[] = [];
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
                if (value !== undefined) edits.push({ location: [targetCol, targetRow], value });
            }
        }
        if (edits.length > 0) {
            args.onCellsEdited?.(edits);
            ev.preventDefault();
        }
    };
}
