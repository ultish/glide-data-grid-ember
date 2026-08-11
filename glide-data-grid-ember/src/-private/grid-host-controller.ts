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
    CellSet,
    AnimationManager,
    SpriteManager,
    sprites,
    ImageWindowLoaderImpl,
    RenderStateProvider,
    getDataEditorTheme,
    mergeAndRealizeTheme,
    makeCSSStyle,
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
    isObjectEditorCallbackResult,
    booleanCellIsEditable,
    toggleBoolean,
    Autoscroller,
    computeScrollEdge,
    adjustDragLocationForScroll,
    getClosestRect,
    combineRects,
    previewRowOrder,
    computeFillEdits,
} from "../rendering/index.ts";
import { synthesizeCellsForSelection } from "../rendering/cells-for-selection.ts";
import { coercePasteCell, type CoercePasteValueCallback } from "../rendering/paste-coercion.ts";
import { applyCellValidation, type ValidateCellCallback } from "../rendering/validate-cell.ts";
import { copyHeaderRow } from "../rendering/copy-paste.ts";
import { isValidClick, shouldActivateOnClick, resolvePointerActivation } from "../rendering/click-behavior.ts";
import { computeGroupHeaderSelection } from "../rendering/group-header-selection.ts";
import { remAdjustDimensions, measureRemSize, type RemAdjustableDimensions } from "../rendering/rem-adjuster.ts";
import { sizeColumns, applyColumnGrow, measureColumn } from "../rendering/column-sizer.ts";
import { computeScrollDelta, type ScrollToParams } from "../rendering/scroll-to.ts";
import { resolveNewRowTarget } from "../rendering/new-row-target.ts";
import { IncrementalSearch, type SearchStatus } from "../rendering/search.ts";
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
    SpriteMap,
    Theme,
    FullTheme,
    GetRowThemeCallback,
    GroupDetails,
    GroupDetailsCallback,
    CellArray,
    GetCellsThunk,
    DrawCellCallback,
    DrawHeaderCallback,
    CellList,
    Highlight,
    HoverInfo,
    SelectionBehaviorOptions,
    CellBuffer,
    CopyBuffer,
    CellEditorHandle,
    FillHandleDirection,
    FillPatternEventArgs,
    ScrollEdge,
    GridMouseEventArgs,
    SelectionBlending,
    CellClickedEventArgs,
    HeaderClickedEventArgs,
    GroupHeaderClickedEventArgs,
    CellActivatedEventArgs,
    CellActivationBehavior,
} from "../rendering/index.ts";
import type { BaseGridMouseEventArgs } from "../rendering/index.ts";
import {
    headerKind,
    groupHeaderKind,
    outOfBoundsKind,
    OutOfBoundsRegionAxis,
    NO_SCROLL_EDGE,
} from "../rendering/index.ts";
import {
    computeBounds,
    getColumnIndexForX,
    getEffectiveColumns,
    getRowIndexForY,
    getStickyWidth,
    itemsAreEqual,
    rectBottomRight,
    type MappedGridColumn,
} from "../rendering/render/data-grid-lib.ts";
import { computeHeaderLayout } from "../rendering/render/data-grid-render.header.ts";
import { hitTestGroupHeaderAction, type GroupHeaderAction } from "../rendering/render/group-header-actions.ts";
import { pointInRect } from "../rendering/common/math.ts";
import { withAlpha } from "../rendering/color-parser.ts";
import { AnimationQueue } from "../rendering/animation-queue.ts";
import { browserIsSafari, browserIsOSX } from "../rendering/common/browser-detect.ts";
import { isGridSurfaceTarget } from "./grid-event-target.ts";
import { MangledLayoutCache, type MangledLayout, type RowMarkerColumnSpec } from "./mangled-layout.ts";
import {
    asConsumerSelection,
    EMPTY_SELECTION,
    mangleSelection,
    MangledSelectionCache,
    unmangleSelection,
    type ConsumerSelection,
    type MangledSelection,
} from "./selection-space.ts";

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
export interface TrailingRowOptions {
    /** Tint the trailing row, marking it as not-real-data. Drawn via `DrawGridArg.disabledRows`. */
    readonly tint?: boolean;
    /**
     * Text shown in the row's first real column, e.g. `"New row"`.
     * @defaultValue "Add row" -- this port's own default, not source's (`""`). It is the string
     * shipped since Phase 4d, kept so that adding this option does not silently blank an affordance
     * every existing consumer already has. Pass `""` for source's behaviour.
     */
    readonly hint?: string;
    /** Header-icon name drawn in place of the built-in "+" glyph. Must exist in the sprite set
     *  (the built-ins, plus anything added via `headerIcons`). */
    readonly addIcon?: string;
    /**
     * Which column's editor to open in the appended row, instead of the one that was clicked.
     * Either a consumer-space column index or one of the objects from `columns` (matched by
     * identity, so it survives reordering).
     *
     * A column's own `trailingRowOptions.targetColumn` overrides this for that column, as with
     * `hint`/`addIcon`. Mirrors source's `getCustomNewRowTargetColumn` (`data-editor.tsx:1795`).
     *
     * **Only meaningful because 9f's `appendRow()` exists** -- it was deferred in 9g for exactly
     * that reason. The trailing row's click/Enter now runs through the same focus flow the API
     * method does, which is also what source does (`:1913`, `:3303`).
     */
    readonly targetColumn?: number | GridColumn;
}

/**
 * Where `onRowAppended` put the new row, for `GlideDataGridApi.appendRow` to focus. `"bottom"` and
 * `undefined` mean the same thing. Source's inline union (`data-editor.tsx:1695`).
 */
export type RowAppendedResult = "top" | "bottom" | number | undefined;

/** The column equivalent of {@link RowAppendedResult}. `"right"` and `undefined` mean the same. */
export type ColumnAppendedResult = "left" | "right" | number | undefined;

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
    /** Controls which vertical gridlines are drawn. @defaultValue all columns. */
    readonly verticalBorder?: (col: number) => boolean;
    /** Controls the resize indicator presentation. @defaultValue "none" */
    readonly resizeIndicator?: "full" | "header" | "none";
    /** Enables wrapping text beyond the normal cell boundary. @defaultValue false */
    readonly hyperWrapping?: boolean;
    /**
     * Resolves a column-group name to how its header strip is drawn: a display `name` (which may
     * differ from the key on `column.group`), an optional `icon` from the header-icon sprite set, an
     * optional `overrideTheme` merged over the grid theme for that strip only, and optional
     * `actions` -- icon buttons drawn right-aligned in the strip, which appear on hover and get
     * their own hit targets. Mirrors source's `getGroupDetails`.
     *
     * Anything you leave out falls back: a result with no `name` gets the group key. Return
     * `undefined` for a group to accept every default. (Source requires `name`; this port makes it
     * optional so an icon-only or actions-only override does not have to restate the name it is not
     * changing.)
     *
     * **Keep the callback itself reference-stable** (a class-field arrow, not an inline `{{fn}}` or
     * a fresh closure per render): the controller memoizes its own wrapper on this identity, and the
     * grid's `computeCanBlit` fast path is identity-sensitive throughout -- see TODO.md rule 1.
     */
    readonly getGroupDetails?: (groupName: string) => Partial<GroupDetails> | undefined;
    /**
     * Extra/override header-icon glyphs, merged **over** the built-in set (`rendering/sprites.ts`)
     * exactly as source does (`data-editor-all.tsx:14`: `{...sprites, ...p.headerIcons}`). The
     * built-ins are always present, so this is only needed to add custom glyphs or restyle one of
     * the stock ones. Read once, when the `SpriteManager` is constructed -- changing it later has
     * no effect.
     */
    readonly headerIcons?: SpriteMap;

    // --- Phase 3a: selection / interaction config -----------------------------------------------
    // Mirrors a subset of `DataEditorProps`. Selection *blending* and the two selection *modes*
    // landed in 9g -- they were always pure `resolveArgs()` plumbing, because the writer functions
    // (`setCurrentSelection`/`setSelectedRows`/`setSelectedColumns` in
    // `rendering/selection-behavior.ts`) have been fully parameterized over them since Phase 3a.

    /** @defaultValue "none" (no row-marker column) */
    readonly rowMarkers?: RowMarkerKind;
    /** @defaultValue auto-sized from `rows`, mirrors `data-editor.tsx:952` */
    readonly rowMarkerWidth?: number;
    /**
     * The number shown against the first row, for `rowMarkers: "number"`/`"both"`/
     * `"clickable-number"`. `1` gives the usual 1-based numbering; `0` makes the markers agree with
     * `getCellContent`'s row indices. Mirrors source's `rowMarkerStartIndex`.
     * @defaultValue 1
     */
    readonly rowMarkerStartIndex?: number;
    /**
     * Theme overlay applied to the row-marker column only, layered like any other column's
     * `themeOverride`. Mirrors source's `rowMarkerTheme`.
     *
     * **Pass a stable object.** It ends up on the marker column, which feeds `mappedColumns` --
     * one of `computeCanBlit`'s compared fields -- so a fresh literal every render costs the scroll
     * blit fast path. The layout cache keys on this object's identity for exactly that reason.
     */
    readonly rowMarkerTheme?: Partial<Theme>;
    /** @defaultValue "multi" */
    readonly rowSelect?: "none" | "single" | "multi";
    /** @defaultValue "multi" */
    readonly columnSelect?: "none" | "single" | "multi";
    /** @defaultValue "rect" */
    readonly rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
    /** @defaultValue true */
    readonly rangeSelectionColumnSpanning?: boolean;

    /**
     * How a cell/range selection blends with any row/column selection already in place.
     * `"exclusive"` (source's default) clears the others; `"mixed"` keeps them while a
     * multi-key (Ctrl/Cmd) is held or during a drag; `"additive"` always keeps them.
     * Mirrors source's `rangeSelectionBlending`.
     * @defaultValue "exclusive"
     */
    readonly rangeSelectionBlending?: SelectionBlending;
    /** The same, for column selection. Mirrors source's `columnSelectionBlending`.
     *  @defaultValue "exclusive" */
    readonly columnSelectionBlending?: SelectionBlending;
    /** The same, for row selection. Mirrors source's `rowSelectionBlending`.
     *  @defaultValue "exclusive" */
    readonly rowSelectionBlending?: SelectionBlending;

    /**
     * `"multi"` makes every row-marker click behave as if the multi-key were held, so rows
     * accumulate without Ctrl/Cmd. `"auto"` (source's default) requires the modifier.
     * Only meaningful when `rowSelect === "multi"`. Mirrors source's `rowSelectionMode`.
     * @defaultValue "auto"
     */
    readonly rowSelectionMode?: "auto" | "multi";
    /** The same, for header clicks. Mirrors source's `columnSelectionMode`.
     *  @defaultValue "auto" */
    readonly columnSelectionMode?: "auto" | "multi";

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
    readonly onColumnResizeStart?: (
        column: GridColumn,
        newSize: number,
        colIndex: number,
        newSizeWithGrow: number
    ) => void;
    readonly onColumnResize?: (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void;
    readonly onColumnResizeEnd?: (
        column: GridColumn,
        newSize: number,
        colIndex: number,
        newSizeWithGrow: number
    ) => void;

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

    // --- Phase 9h: row reorder / fill handle ------------------------------------------------------
    /**
     * Fired once at the end of a row-reorder drag. Setting it **enables** row reordering by
     * dragging a row from the row-marker column, exactly as source does (`data-grid-dnd.tsx`'s
     * `onRowMoved !== undefined` gate) -- and it is also what makes the marker cells draw their
     * drag-handle dots (`InnerGridCell.drawHandle`).
     *
     * Requires a row-marker column (`rowMarkers !== "none"`): the drag is grabbed from the marker
     * cell, so with no marker column there is nothing to grab. Row-marker *selection* clicks still
     * work — a click that never crosses the drag threshold is still a selection click.
     *
     * **Consumer owns row order.** Same non-mutating contract as `onColumnMoved`/`onCellsEdited`:
     * the grid shows a live preview during the drag and then throws it away on mouseup, so the
     * consumer must reorder its own data for the move to stick.
     */
    readonly onRowMoved?: (startIndex: number, endIndex: number) => void;

    /**
     * Draws the fill handle (the small square at the bottom-right of the current selection) and
     * enables drag-to-fill from it. `false` by default, matching source (`fillHandle?: boolean`
     * with no default, so falsy).
     *
     * Note this is a behavioural change from Phase 2–9g of this port, which passed
     * `DEFAULT_FILL_HANDLE` to the render engine unconditionally: the handle was always *drawn* and
     * did nothing at all when dragged. An affordance that does nothing is worse than no affordance,
     * so it is now opt-in and functional.
     *
     * Filling reads the pattern through {@link getCellsForSelection} (synthesised from
     * `getCellContent` when that is absent or `true`) and reports the writes through
     * {@link onCellsEdited}, in one batch, exactly like paste.
     */
    readonly fillHandle?: boolean;
    /**
     * Which way the fill handle may be dragged. `"orthogonal"` (source's default) snaps the fill to
     * whichever single axis the pointer is furthest along; `"any"` allows a free rectangle.
     * @defaultValue "orthogonal"
     */
    readonly allowedFillDirections?: FillHandleDirection;
    /**
     * Fired just before a fill's edits are computed, with both rectangles in the consumer's own
     * column space. Call `preventDefault()` to take over the fill entirely -- no edits are computed
     * and {@link onCellsEdited} does not fire. Mirrors source's `onFillPattern`.
     */
    readonly onFillPattern?: (event: FillPatternEventArgs) => void;

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
     * Presentation of that trailing row -- tint, hint text, and the "+" icon. Mirrors the portable
     * subset of source's `trailingRowOptions`; see {@link TrailingRowOptions} for what is left out
     * and why. Purely cosmetic: it does not enable the row (that is `showTrailingBlankRow`) and
     * does not change what activating it does.
     */
    readonly trailingRowOptions?: TrailingRowOptions;
    /**
     * Fired when the trailing blank row is activated (clicking any real-column cell in it, or
     * selecting it via keyboard nav and pressing Enter) -- mirrors source's `onRowAppended`. Like
     * every other edit-adjacent callback on this interface, **`GridHostController` does not mutate
     * `rows`/any backing data store itself** -- the consumer must increase its own row count (and
     * make `getCellContent` return real data for the new row) for a new row to actually appear.
     *
     * **The return value only matters to 9f's `appendRow()`**, which needs to know which row to
     * focus. `"bottom"` (or returning nothing) means the new row went on the end, `"top"` means
     * index 0, and a number is an explicit index. Mirrors source's
     * `RowAppendedResult` (`data-editor.tsx:1693-1701`); the keyboard/click gesture ignores it,
     * so an existing `() => void` handler stays valid.
     */
    readonly onRowAppended?: () => RowAppendedResult | Promise<RowAppendedResult> | void;

    // --- Phase 6: theming ------------------------------------------------------------------------
    /**
     * Per-row theme overlay, mirrors source's `getRowThemeOverride` (`DataEditorProps`). Returning
     * `undefined` for a row means "no override" (the common case -- return `undefined` rather than
     * an empty object, it is a cheaper code path in the render loop). Merged *after* the column's
     * own `themeOverride` and *before* the cell's, i.e. a cell override always wins over a row
     * override, which always wins over a column override. See THEMING.md for the full precedence
     * table.
     *
     * **Hoist this to a stable function reference.** `render/data-grid-render.blit.ts:243` compares
     * `getRowThemeOverride` by identity when deciding whether the previous frame can be blitted
     * instead of fully repainted -- a fresh inline arrow function on every draw makes that check
     * fail every time and silently defeats the scroll fast path. Define it once (a module-scope
     * function, or a class field / `@action`-bound method), don't build it inside a getter.
     */
    readonly getRowThemeOverride?: GetRowThemeCallback;

    // --- Phase 8: async / streaming data ---------------------------------------------------------
    /**
     * Fired whenever the set of visible cells changes -- on scroll, on resize, and after any arg
     * change that moves what is on screen. Mirrors source's `onVisibleRegionChanged`
     * (`internal/scrolling-data-grid/scrolling-data-grid.tsx`'s `processArgs`), which is what its
     * `useAsyncDataSource` hook drives paged loading from.
     *
     * `region` is in the consumer's **own coordinate space**, the same space as `getCellContent`'s
     * `Item` and `onCellsEdited`'s `location`: `x` excludes the synthetic row-marker column, and
     * `y`/`height` cover real data rows only (never the trailing blank row). `width`/`height` are
     * counts, so `[x, x + width)` x `[y, y + height)` is the on-screen block -- its last row and
     * column may be only partially visible, exactly as in source.
     *
     * Deduplicated: fires only when the region actually differs from the last one reported. It is
     * also **deferred to a microtask**, so a consumer may safely set tracked state from it. Unlike
     * source, this callback is reachable from inside the Ember modifier's own tracking frame (via
     * `scheduleFullRedraw`), where a synchronous tracked write would trip Ember's
     * backtracking-rerender assertion.
     */
    readonly onVisibleRegionChanged?: (region: Rectangle) => void;

    /**
     * Reads a whole rectangle of cells at once, rather than one at a time through
     * {@link getCellContent}. Mirrors source's `getCellsForSelection` prop.
     *
     * Pass **`true`** for the common case: the grid then synthesises one from your
     * `getCellContent`, which is all a fully in-memory data source needs.
     *
     * Pass a **function** when a range can be fetched more cheaply in bulk than cell-by-cell (one
     * query instead of N), or when cells outside the rendered window are not in memory at all — an
     * `AsyncRecordsSource`-style paged source, say. `rect` is in **your** coordinate space (no
     * row-marker column), the same space `getCellContent` sees.
     *
     * Return either a `CellArray` directly, or a `GetCellsThunk` (`() => Promise<CellArray>`) to
     * load asynchronously.
     *
     * **The thunk form is not usable for copy, by design.** A `copy` event's `clipboardData` stops
     * accepting `setData` once the handler has awaited anything, so this port only consults
     * `getCellsForSelection` for copy when it answers synchronously, and otherwise falls back to
     * reading cell-by-cell through `getCellContent`. Source instead awaits the thunk inside its
     * copy handler and writes afterwards, which reads as a latent bug rather than something to
     * reproduce. Deliberate divergence; see PORTING-NOTES.md.
     */
    readonly getCellsForSelection?: CellsForSelectionCallback | true;

    // --- Phase 9: consumer draw hooks / overlays ---------------------------------------------------
    // All four of these are `DrawGridArg` fields the render engine has supported since Phase 1
    // (ported verbatim from source) but which the controller hardcoded to `undefined` until now.
    // Exposing them is a pure passthrough -- no new rendering code was written for any of them.

    /**
     * Draw *over* a cell after the grid has drawn it, or replace the drawing entirely. Called for
     * every painted cell; return `true` to signal you handled the cell and the built-in renderer
     * should be skipped. Mirrors source's `drawCell` prop (`DataGridProps.drawCell`).
     *
     * This runs inside the paint loop for every visible cell, so keep it cheap and hoist it to a
     * stable reference (see `prelightCells` below for why references matter here generally).
     */
    readonly drawCell?: DrawCellCallback;

    /**
     * The same hook for header cells. Mirrors source's `drawHeader` prop.
     */
    readonly drawHeader?: DrawHeaderCallback;

    /**
     * Cells to "prelight" -- drawn with a subtle highlight, used by source for things like showing
     * which cells a pending fill/paste would touch. A plain `readonly Item[]`.
     *
     * **Must be a stable reference when its contents haven't changed.** `computeCanBlit`
     * (`render/data-grid-render.blit.ts`) identity-compares this field, so returning a fresh array
     * every draw silently disables the scroll blit fast path with no visible symptom -- the exact
     * defect that went undetected from Phase 2 to Phase 6. Pass `undefined` (not `[]`) for "none",
     * and build the array in a `@cached` getter, not inline in the template.
     */
    readonly prelightCells?: CellList;

    /**
     * Rectangular regions to tint/outline, e.g. to mark a search hit or a validation error. Mirrors
     * source's `highlightRegions` prop. **Identity-compared by `computeCanBlit` exactly like
     * `prelightCells` above -- the same stability rule applies.**
     *
     * `range.x` is in **your** column space, with no row-marker column -- the same space as
     * `getCellContent`'s `Item`. The grid shifts it internally when `rowMarkers !== "none"`, and
     * drops a region that starts past the last column rather than clipping it. (Note the contrast
     * with `prelightCells` above, which source leaves unmangled because its own search subsystem
     * feeds it already-mangled coordinates; this port matches source on both.)
     */
    readonly highlightRegions?: readonly Highlight[];

    // --- Phase 9e: search --------------------------------------------------------------------
    // The grid owns the *engine*; the UI is the separate, opt-in `<GlideSearchBar>` (or the
    // consumer's own, driven through the same API). Every arg below is optional: with none of them
    // set, primary+F still opens an internal search that highlights matches, because the state
    // has an uncontrolled fallback exactly as source's does.

    /**
     * Controls whether search is open. Leave `undefined` for uncontrolled: primary+F opens it and
     * Escape closes it, and the grid tracks the flag itself. Mirrors source's `showSearch` prop.
     */
    readonly showSearch?: boolean;

    /**
     * Controls the query. Leave `undefined` for uncontrolled. Mirrors source's `searchValue`.
     */
    readonly searchValue?: string;

    /** Fired on every query change, whether or not `searchValue` is controlled -- so a consumer can
     *  observe the query without taking ownership of it. Mirrors source's `onSearchValueChange`. */
    readonly onSearchValueChange?: (newValue: string) => void;

    /** Fired when the user closes search (Escape, primary+F again, or the bar's close button). */
    readonly onSearchClose?: () => void;

    /**
     * Supply results yourself instead of using the built-in scanner -- e.g. when the real search is
     * server-side. When set, the incremental scan does not run at all. Coordinates are in the
     * consumer's own space (no row-marker column). Mirrors source's `searchResults` prop.
     *
     * **Identity-stable, same rule as `prelightCells`** -- results become `prelightCells` internally.
     */
    readonly searchResults?: CellList;

    /**
     * Fired whenever the result set or the navigation index changes. `results` are in the
     * consumer's coordinate space. Mirrors source's `onSearchResultsChanged`.
     *
     * Note what setting this *turns off*: source treats it as taking ownership of what happens on
     * navigation, and skips its own "select and scroll to the active result" behaviour. This port
     * does the same, so a consumer can drive their own navigation without fighting the grid.
     */
    readonly onSearchResultsChanged?: (results: CellList, navIndex: number) => void;

    /**
     * The single reactive channel out of the search engine: fired on every state change (opened,
     * closed, query edited, results streaming in, navigation moved). `<GlideSearchBar>` subscribes
     * to this; a consumer writing their own UI can too.
     *
     * The controller is deliberately untracked (see this file's header), so this callback is how
     * search state reaches Ember reactivity at all.
     */
    readonly onSearchStateChange?: (state: SearchState) => void;

    // --- Phase 9d: context menus ---------------------------------------------------------------
    // The grid ships no menu UI, only the events -- exactly the precedent `onHeaderMenuClick` set,
    // and what source does too. Each hands you the hit-tested target plus enough geometry to
    // position your own menu.
    //
    // **The browser's own menu is NOT suppressed unless you call `preventDefault()`**, matching
    // source. That keeps "right-click still works normally" the default and makes taking it over an
    // explicit act.

    /** Lower bound for a measured (auto-sized) column. Ignored by columns that declare a `width`.
     *  Source's `minColumnWidth`; defaults to 50 as source does. */
    readonly minColumnWidth?: number;
    /** Upper bound for a measured column, so one very long value cannot stretch it indefinitely.
     *  Source's `maxColumnWidth`; defaults to 500 as source does. */
    readonly maxColumnWidth?: number;

    /** Right-click on a data cell. `location` is in your coordinate space (no row-marker column). */
    readonly onCellContextMenu?: (location: Item, event: ContextMenuEventArgs) => void;
    /** Right-click on a column header. `col` is in your coordinate space. */
    readonly onHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;
    /** Right-click on a column *group* header (the band above the headers, when `column.group` is
     *  set). `col` is in your coordinate space. */
    readonly onGroupHeaderContextMenu?: (col: number, event: ContextMenuEventArgs) => void;

    /**
     * Fires whenever the hovered cell, header or group header changes, and when the pointer leaves
     * the grid entirely (`kind: "out-of-bounds"`). **This is what tooltips are built on** — source's
     * `Tooltips` story is exactly this callback plus a positioned DOM node.
     *
     * `location` is in **your** coordinate space: the row-marker column is already subtracted, the
     * same as `onCellsEdited` and the context-menu callbacks. Rows `-1` and `-2` mean the column
     * header and the group header above it.
     *
     * Emitted only on *change*, not per mousemove — source does the same
     * (`data-editor.tsx:2731`, an equality check against the previous args), and per-pixel emission
     * would put consumer work directly on the pointer path.
     */
    readonly onItemHovered?: (args: GridMouseEventArgs) => void;

    // --- Phase 9g: data / editing ----------------------------------------------------------------

    /**
     * Reject or normalise an edit before it commits. Mirrors source's `validateCell`, and applies
     * in exactly the same place source applies it: the **overlay editor** only, on its initial value
     * and on every change. Paste, fill, cut and delete deliberately do not consult it.
     *
     * Return `false` to mark the value invalid -- the editor stays open, but closing it commits
     * nothing. Return a `ValidatedGridCell` to coerce instead, which is how "strip non-digits as you
     * type" is expressed. `cell` is in your own coordinate space (no row-marker column).
     *
     * **Known divergence on the coercion path.** Source re-renders its editor from the coerced
     * value, so the user sees the correction as they type. This port's editors are DOM factories
     * (`CellEditorHandle`) with no channel to push a value back in, so a coerced value is what gets
     * *committed* while the editor keeps showing what was typed until it closes. Rejection
     * (`false`) behaves identically to source. Closing that gap means adding a `setValue` to
     * `CellEditorHandle` and updating all 26 renderers, which is a bigger change than 9g.
     */
    readonly validateCell?: ValidateCellCallback;

    /**
     * Take over paste coercion for a cell. Mirrors source's `coercePasteValue`; consulted **before**
     * the built-in per-kind rules and before any `CustomRenderer.onPaste`, and winning outright when
     * it returns an editable cell of the same kind. Return `undefined` to fall through to the
     * default behaviour for that cell.
     */
    readonly coercePasteValue?: CoercePasteValueCallback;

    /**
     * Prepend a row of column titles to the copy buffer. Mirrors source's `copyHeaders`, including
     * its default -- and, like source, this affects copy/cut only, never what a paste expects to
     * read back.
     * @defaultValue false
     */
    readonly copyHeaders?: boolean;

    /**
     * Intercept the Delete/Backspace (and cut) clearing of the current selection. Mirrors source's
     * `onDelete`, including its three return shapes:
     *
     * - `false` cancels the delete entirely.
     * - `true` (or no callback) clears the current selection, as before.
     * - a `GridSelection` clears **that** selection instead, which is how "delete whole columns
     *   rather than cells" is expressed.
     *
     * The selection passed in, and any selection returned, are in your own coordinate space (no
     * row-marker column) -- source shifts both ways at this boundary and so does this port.
     */
    readonly onDelete?: (selection: GridSelection) => boolean | GridSelection;

    // --- Phase 9g: click / activation notifications ----------------------------------------------
    //
    // **All three fire on mouseup, and only when the mouseup lands on the same target as the
    // mousedown** -- source's `isValidClick` rule, ported in `rendering/click-behavior.ts`. That
    // same-target check *is* the definition of a click as opposed to a drag: without it, a consumer
    // wiring "open this row" to `onCellClicked` would see it fire every time a user merely began a
    // drag-selection.
    //
    // **`preventDefault()` does not suppress the selection change**, and that is deliberate rather
    // than a gap. Selection happens on mousedown -- in source (`data-editor.tsx:2126`) exactly as
    // here -- and these callbacks fire on the mouseup after it, so the selection has already moved
    // by the time a consumer could object. Source's `isPrevented` gates precisely two things, and so
    // does this port: the cell renderer's own `onClick`, and cell activation.

    /**
     * A click on a data cell. `cell` is in your own coordinate space; a click on the row-marker
     * column reports `-1`, as source does. Mirrors source's `onCellClicked`.
     *
     * `preventDefault()` suppresses the cell renderer's `onClick` and any activation that would
     * have followed -- **not** the selection change, which already happened on mousedown. See the
     * section comment above.
     */
    readonly onCellClicked?: (cell: Item, event: CellClickedEventArgs) => void;

    /**
     * A click on a column header. Same mouseup + same-target contract as {@link onCellClicked}.
     * Not fired for the row-marker column's select-all header, matching source's
     * `if (clickLocation < 0) return`. Mirrors source's `onHeaderClicked`.
     *
     * `preventDefault()` suppresses nothing here -- source has nothing left to gate at this point
     * either, since column selection ran on mousedown.
     */
    readonly onHeaderClicked?: (colIndex: number, event: HeaderClickedEventArgs) => void;

    /**
     * A click on a column *group* header (the band above the headers, when `column.group` is set).
     * Mirrors source's `onGroupHeaderClicked`.
     *
     * **`preventDefault()` here suppresses the group's column selection** -- and this is the only
     * click callback in the grid where it can. Group-header selection is applied on *mouseup*, right
     * after this callback (`data-editor.tsx:2498-2509`); cells and ordinary headers select on
     * mousedown, long before their callback fires, so theirs cannot be suppressed. The asymmetry is
     * upstream's.
     *
     * The selection covers the clicked group's whole contiguous column span, and only when
     * `columnSelect` is `"multi"` -- source no-ops entirely otherwise
     * (`handleGroupHeaderSelection`, `:2143`).
     */
    readonly onGroupHeaderClicked?: (colIndex: number, event: GroupHeaderClickedEventArgs) => void;

    /**
     * A cell was activated -- Enter, a printable character (when `editOnType` is on), or a click
     * matching {@link cellActivationBehavior}. Fires just before the editor opens (or, for a
     * boolean cell, before it toggles), so it is the hook for "opened an editor" telemetry.
     * Mirrors source's `onCellActivated`. Never fires for the trailing blank row, which appends
     * instead.
     */
    readonly onCellActivated?: (cell: Item, event: CellActivatedEventArgs) => void;

    /**
     * Editing finished, whether or not anything changed -- committed value (or `undefined` for a
     * cancel) plus the cursor movement the editor asked for (`[0,1]` Enter, `[±1,0]` Tab, `[0,0]`
     * Escape/click-outside). Mirrors source's `onFinishedEditing`.
     */
    readonly onFinishedEditing?: (newValue: GridCell | undefined, movement: Item) => void;

    /**
     * Tab pressed in an editor on the **last** column, i.e. "make me another column". Setting it is
     * what enables that gesture at all, mirroring source's `onColumnAppended !== undefined` gate --
     * and, like `onRowAppended`, the consumer owns the columns array, so nothing appears until they
     * add one.
     *
     * **The return value only matters to 9f's `appendColumn()`**, which needs to know which column
     * to focus: `"right"` (or nothing) means the end, `"left"` means index 0, a number is an
     * explicit index. Mirrors source's `ColumnAppendedResult`. The Tab gesture ignores it, so an
     * existing `() => void` handler stays valid.
     */
    readonly onColumnAppended?: () => ColumnAppendedResult | Promise<ColumnAppendedResult> | void;

    /**
     * When a pointer click activates a cell. `"second-click"` (the default, and this port's only
     * behaviour before 9g) activates a click on the already-selected cell; `"single-click"`
     * activates any click; `"double-click"` requires a genuine double-click on the selected cell.
     * A cell's own `activationBehaviorOverride` wins over this. Mirrors source's
     * `cellActivationBehavior`.
     * @defaultValue "second-click"
     */
    readonly cellActivationBehavior?: CellActivationBehavior;

    // --- Phase 9g: editing behaviour flags -------------------------------------------------------

    /**
     * Typing a printable character over the selected cell immediately opens its editor, seeded with
     * that character. Set `false` to require an explicit activation (Enter, or a click on the
     * already-selected cell) instead. Mirrors source's `editOnType`, including its default.
     * @defaultValue true
     */
    readonly editOnType?: boolean;

    /**
     * Keeps keyboard navigation inside the grid: an arrow/Home/End press that cannot move any
     * further (already at an edge) is still swallowed rather than left to the browser, so focus
     * never escapes to the next tab stop. Mirrors source's `trapFocus`, including its default.
     * @defaultValue false
     */
    readonly trapFocus?: boolean;

    /**
     * Draws the focus ring around the active cell. `"no-editor"` draws it only while no overlay
     * editor is open -- source's own value for "don't double up the ring and the editor border"
     * (`data-editor.tsx:909`). Mirrors source's `drawFocusRing`.
     * @defaultValue true
     */
    readonly drawFocusRing?: boolean | "no-editor";

    // --- Phase 9g: scroll position + rem scaling -------------------------------------------------

    /**
     * Scroll the grid to this horizontal pixel offset. Mirrors source's `scrollOffsetX`, including
     * its semantics, which are worth stating because "initial scroll offset" undersells them:
     * source re-applies the value in a layout effect keyed on it, so **changing it scrolls the
     * grid**, and leaving it alone lets the user scroll freely. This port does the same -- it
     * applies the value once per change, never fighting the user in between.
     */
    readonly scrollOffsetX?: number;
    /** The vertical twin of {@link scrollOffsetX}. */
    readonly scrollOffsetY?: number;

    /**
     * Scale row/header heights and the theme's padding/icon sizes by the root element's font size
     * relative to 16px, so the grid grows with a user's browser zoom or an app-level `rem` change.
     * Mirrors source's `scaleToRem` and its `use-rem-adjuster.ts` scaling rules exactly.
     *
     * **Divergence:** source re-measures the root font size continuously (`useRemSize`); this port
     * measures it whenever the grid's args change (`scheduleFullRedraw`). A root font size that
     * changes with no accompanying arg change is therefore picked up on the next redraw rather than
     * immediately -- fine for the settings-driven case this exists for, and it keeps a
     * `getComputedStyle` call off the per-draw path.
     * @defaultValue false
     */
    readonly scaleToRem?: boolean;
}

/** What a context-menu callback receives alongside the target. */
export interface ContextMenuEventArgs {
    /** Bounds of the cell/header that was hit, in canvas space -- the same space
     *  `onHeaderMenuClick`'s `bounds` uses, so a menu can be positioned identically. */
    readonly bounds: Rectangle;
    /** Pointer position relative to the grid root. */
    readonly localEventX: number;
    readonly localEventY: number;
    /** Pointer position in viewport coordinates, for a `position: fixed` menu. */
    readonly clientX: number;
    readonly clientY: number;
    /** Suppresses the browser's native context menu. Not called for you. */
    readonly preventDefault: () => void;
}

/** A snapshot of everything a search UI needs to render. Handed to `onSearchStateChange`. */
export interface SearchState {
    /** Whether the search UI should be visible. */
    readonly isOpen: boolean;
    /** The current query. */
    readonly value: string;
    /** Matches so far, in the consumer's coordinate space. Streams in while a scan runs. */
    readonly results: CellList;
    /** 0-based index into `results` of the currently navigated match; `-1` for none. */
    readonly selectedIndex: number;
    /** Rows scanned so far, out of `rows` -- drives a progress indicator. */
    readonly rowsSearched: number;
    /** Total rows the scan will cover. */
    readonly rows: number;
    /** `undefined` until the first chunk reports, so a UI can show "Type to search" rather than
     *  "0 results" before anything has happened. Mirrors source's `searchStatus === undefined`. */
    readonly status: SearchStatus | undefined;
}

/**
 * Reads a rectangle of cells at once. `selection` is in the consumer's own coordinate space (no
 * row-marker column). Returns the cells directly, or a thunk to load them asynchronously.
 * Mirrors source's `DataGridSearchProps["getCellsForSelection"]`.
 */
export type CellsForSelectionCallback = (selection: Rectangle, abortSignal: AbortSignal) => GetCellsThunk | CellArray;

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
    readonly verticalBorder: (col: number) => boolean;
    readonly resizeIndicator: "full" | "header" | "none";
    readonly hyperWrapping: boolean;
    /** Always defined: {@link GridHostController.resolvedGroupDetails} fills in the defaults, so
     *  every reader (draw, hit test) sees the same total function. */
    readonly getGroupDetails: GroupDetailsCallback;

    readonly rowMarkers: RowMarkerKind;
    readonly rowMarkerWidth: number;
    readonly rowMarkerStartIndex: number;
    readonly rowMarkerTheme: Partial<Theme> | undefined;
    readonly hasRowMarkers: boolean;
    readonly rowMarkerOffset: number;
    readonly rowSelect: "none" | "single" | "multi";
    readonly columnSelect: "none" | "single" | "multi";
    readonly rangeSelect: "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
    readonly rangeSelectionColumnSpanning: boolean;
    readonly rangeSelectionBlending: SelectionBlending;
    readonly columnSelectionBlending: SelectionBlending;
    readonly rowSelectionBlending: SelectionBlending;
    readonly rowSelectionMode: "auto" | "multi";
    readonly columnSelectionMode: "auto" | "multi";
    readonly onSelectionChanged: ((selection: GridSelection) => void) | undefined;
    readonly onHeaderMenuClick: ((col: number, bounds: Rectangle) => void) | undefined;
    readonly onCellsEdited: ((edits: readonly { location: Item; value: GridCell }[]) => void) | undefined;
    readonly onColumnResizeStart:
        ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void) | undefined;
    readonly onColumnResize:
        ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void) | undefined;
    readonly onColumnResizeEnd:
        ((column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => void) | undefined;
    readonly onColumnProposeMove: ((startIndex: number, endIndex: number) => boolean) | undefined;
    readonly onColumnMoved: ((startIndex: number, endIndex: number) => void) | undefined;

    readonly onRowMoved: ((startIndex: number, endIndex: number) => void) | undefined;
    readonly fillHandle: boolean;
    readonly allowedFillDirections: FillHandleDirection;
    readonly onFillPattern: ((event: FillPatternEventArgs) => void) | undefined;

    readonly showTrailingBlankRow: boolean;
    readonly trailingRowOptions: TrailingRowOptions | undefined;
    readonly onRowAppended: (() => RowAppendedResult | Promise<RowAppendedResult> | void) | undefined;

    readonly getRowThemeOverride: GetRowThemeCallback | undefined;

    readonly onVisibleRegionChanged: ((region: Rectangle) => void) | undefined;

    readonly getCellsForSelection: CellsForSelectionCallback | true | undefined;

    readonly drawCell: DrawCellCallback | undefined;
    readonly drawHeader: DrawHeaderCallback | undefined;
    readonly prelightCells: CellList | undefined;
    readonly highlightRegions: readonly Highlight[] | undefined;

    readonly showSearch: boolean | undefined;
    readonly searchValue: string | undefined;
    readonly onSearchValueChange: ((newValue: string) => void) | undefined;
    readonly onSearchClose: (() => void) | undefined;
    readonly searchResults: CellList | undefined;
    readonly onSearchResultsChanged: ((results: CellList, navIndex: number) => void) | undefined;
    readonly onSearchStateChange: ((state: SearchState) => void) | undefined;

    readonly minColumnWidth: number;
    readonly maxColumnWidth: number;
    readonly onCellContextMenu: ((location: Item, event: ContextMenuEventArgs) => void) | undefined;
    readonly onHeaderContextMenu: ((col: number, event: ContextMenuEventArgs) => void) | undefined;
    readonly onGroupHeaderContextMenu: ((col: number, event: ContextMenuEventArgs) => void) | undefined;
    readonly onItemHovered: ((args: GridMouseEventArgs) => void) | undefined;

    readonly validateCell: ValidateCellCallback | undefined;
    readonly coercePasteValue: CoercePasteValueCallback | undefined;
    readonly copyHeaders: boolean;
    readonly onDelete: ((selection: GridSelection) => boolean | GridSelection) | undefined;

    readonly onCellClicked: ((cell: Item, event: CellClickedEventArgs) => void) | undefined;
    readonly onHeaderClicked: ((colIndex: number, event: HeaderClickedEventArgs) => void) | undefined;
    readonly onGroupHeaderClicked: ((colIndex: number, event: GroupHeaderClickedEventArgs) => void) | undefined;
    readonly onCellActivated: ((cell: Item, event: CellActivatedEventArgs) => void) | undefined;
    readonly onFinishedEditing: ((newValue: GridCell | undefined, movement: Item) => void) | undefined;
    readonly onColumnAppended: (() => ColumnAppendedResult | Promise<ColumnAppendedResult> | void) | undefined;
    readonly cellActivationBehavior: CellActivationBehavior;

    readonly editOnType: boolean;
    readonly trapFocus: boolean;
    readonly drawFocusRing: boolean | "no-editor";

    readonly scrollOffsetX: number | undefined;
    readonly scrollOffsetY: number | undefined;
}

const DEFAULT_ROW_HEIGHT = 34;
const DEFAULT_HEADER_HEIGHT = 36;

// Selection-blending/mode defaults, matching source's own (`data-editor.tsx:836-850`). These used
// to be the *only* possible values -- 9g turned them into `GridHostArgs` fields, so they are now
// just the `??` fallbacks in `resolveArgs`.
const DEFAULT_SELECTION_BLENDING: SelectionBlending = "exclusive";
const DEFAULT_SELECTION_MODE: "auto" | "multi" = "auto";
// The marker *body* cell's checkbox style. Its header-column counterpart lives in
// `mangled-layout.ts` alongside the rest of the synthetic column (Phase 9k).
const DEFAULT_ROW_MARKER_CHECKBOX_STYLE: "square" | "circle" = "square";
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

// `DrawGridArg.verticalBorder` -- this port always draws every vertical gridline (no per-column
// suppression is exposed as an arg). Hoisted to module scope on purpose: `computeCanBlit`
// (`render/data-grid-render.blit.ts:246`) compares this field by *identity* against the previous
// frame's arg, so an inline `() => true` in `runDraw` made the check fail on every frame and
// disabled the scroll blit fast path entirely. Found in Phase 6, see PORTING-NOTES.md.
const ALWAYS_VERTICAL_BORDER = (): boolean => true;

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
const DEFAULT_GROUP_DETAILS = (name: string): GroupDetails => ({ name });

// Phase 3d: column resize/reorder. Resize-edge hit region width (px) at a header cell's right
// border; source doesn't expose an exact named constant for this in the parts of `data-grid.tsx`
// cited by PORTING-NOTES.md, so this is a reasonable small value consistent with typical
// resize-handle affordances. Reorder drag activation dead-zone matches source's own
// `data-grid-dnd.tsx` `Math.abs(event.clientX - dragStartX) > 20` exactly.
const RESIZE_EDGE_PX = 6;
const COLUMN_DRAG_THRESHOLD_PX = 20;
// Phase 9h: the vertical twin of the above, for row reorder -- source uses the same literal 20 in
// the same function (`Math.abs(event.clientY - dragStartY) > 20`).
const ROW_DRAG_THRESHOLD_PX = 20;

// 9g: the cache key for `scaleToRem`. Compared field-by-field rather than by object identity
// because `resolveArgs` builds a fresh input literal on every call -- identity would never hit.
function dimensionsAreEqual(a: RemAdjustableDimensions, b: RemAdjustableDimensions): boolean {
    return (
        a.rowHeight === b.rowHeight &&
        a.headerHeight === b.headerHeight &&
        a.groupHeaderHeight === b.groupHeaderHeight &&
        a.theme === b.theme
    );
}

function rectanglesEqual(a: Rectangle | undefined, b: Rectangle | undefined): boolean {
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
    // 9g: `MouseEvent.detail` counts clicks in the current sequence, so the second mousedown of a
    // double-click already reports 2 -- which is what `cellActivationBehavior: "double-click"`
    // needs, and it needs it at mousedown time (this port dispatches selection there, not on
    // mouseup like source).
    readonly isDoubleClick: boolean;
    readonly button: number;
    readonly buttons: number;
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
/** What a mousedown records for the subsequent mousemove (drag-extend) and mouseup (click) to read.
 *  `location` is a `hit.location` and `previousSelection` is mangled to match, so the two can be
 *  compared without a conversion. */
interface MouseDownState {
    readonly location: Item;
    readonly previousSelection: MangledSelection;
}

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
    /** 9g: `false` once `validateCell` has rejected the live value. The editor stays open and
     *  usable; the commit is what is suppressed, mirroring source's `isValid` gate
     *  (`data-grid-overlay-editor.tsx:83-91`). */
    isValid: boolean;
    /** 9g: what `validateCell` is given as `prevValue` -- the value *before* the change being
     *  validated, which source tracks in `lastValueRef`. */
    lastValue: GridCell;
    /** Set once `finish()` has run, to make it idempotent against being called twice (e.g. both
     * the editor's own Enter keydown AND a subsequent click-outside on the same tick). */
    finished: boolean;
    /** Tears down the stay-on-screen observer/animation frame. Assigned in `openOverlay`. */
    stopStayOnScreen?: () => void;
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

    /**
     * The nodes a pointer event is allowed to have originated on for the grid to treat it as its
     * own. Everything else inside `root` -- an open overlay editor, `<GlideSearchBar>`, any
     * consumer chrome rendered into the yielded block -- must NOT be dispatched as a grid click.
     * See `grid-event-target.ts` for the full rationale and the source citation.
     */
    private readonly gridSurfaces: readonly unknown[];

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

    // Phase 9. Handed to every `getCellsForSelection` call so a consumer loading a range
    // asynchronously can cancel when the grid goes away. Aborted in `destroy()`. One per
    // controller, matching source's `abortControllerRef`.
    private readonly cellsForSelectionAbort = new AbortController();
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
    private selection: ConsumerSelection = EMPTY_SELECTION;
    private readonly mangledSelectionCache = new MangledSelectionCache();
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
    private mouseDownState: MouseDownState | undefined = undefined;
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
        { srcCol: number; startClientX: number; active: boolean; dropCol: number; vetoed: boolean } | undefined =
        undefined;

    // Row reorder drag state (Phase 9h). Set on mousedown in the row-marker column when
    // `onRowMoved` is configured; `active` flips true only once the pointer has moved more than
    // `ROW_DRAG_THRESHOLD_PX` vertically, matching source's dead-zone (`data-grid-dnd.tsx`'s
    // `dragStartY`/`dragRowActive`). While active, `mangledGetCellContent` renders a live preview
    // of the move; nothing is committed until mouseup fires `onRowMoved`.
    private dragRowState: { srcRow: number; startClientY: number; active: boolean; dropRow: number } | undefined =
        undefined;

    // Fill-handle drag state (Phase 9h). Set on a mousedown that landed on the fill handle itself;
    // `highlight` is the region the pointer has dragged out so far (source's
    // `fillHighlightRegion`), drawn as a dashed highlight and turned into edits on mouseup.
    // Both fields are MANGLED: `highlight` is dragged out from `hit.location`s and is handed to the
    // renderer as a highlight region, and `previousSelection` is compared/combined with it.
    private fillState: { previousSelection: MangledSelection; highlight: Rectangle | undefined } | undefined =
        undefined;
    // Whether the pointer is currently hovering the fill handle -- cursor feedback only (source's
    // `overFill`).
    private overFillHandle = false;
    // Header-edge hover state used for the source-compatible resize cursor. The actual resize
    // gesture is still gated by the callbacks in `hitTestColumnResizeEdge`.
    private overResizeEdge = false;

    // Autoscroll-while-dragging (Phase 9h), shared by drag-extend, row reorder and fill drag.
    private readonly autoscroller: Autoscroller;
    // The last drag-relevant pointer position, in the hit-test space, remembered so an autoscroll
    // tick can re-resolve what the drag is now over after the grid has slid underneath the
    // (stationary) pointer. Mirrors source's `hoveredRef` feeding `adjustSelectionOnScroll`.
    private lastDragHover: { location: Item; edge: ScrollEdge } | undefined = undefined;

    // Overlay editor state (Phase 4a) -- see `OverlayState` above. `undefined` = no editor open.
    private overlayState: OverlayState | undefined = undefined;

    constructor(options: GridHostControllerOptions) {
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
        this.underlayEl.append(this.canvasEl, this.headerCanvasEl);

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
        this.gridSurfaces = [
            this.root,
            this.underlayEl,
            this.canvasEl,
            this.headerCanvasEl,
            this.scrollerEl,
            this.scrollInnerEl,
            this.stackEl,
            this.spacerEl,
        ];

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
        this.spriteManager = new SpriteManager({ ...sprites, ...this.getArgsFn().headerIcons }, () =>
            this.scheduleFullRedraw()
        );
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

        // Phase 9h. One shared autoscroller for every drag that can run past the viewport edge.
        // `scrollBy` on the real scroller fires the ordinary `scroll` event, so the redraw path is
        // the existing one -- `onAutoscrollTick` only has to re-resolve what the (stationary)
        // pointer is now over.
        this.autoscroller = new Autoscroller({
            scrollBy: (dx, dy) => this.scrollerEl.scrollBy(dx, dy),
            onTick: this.onAutoscrollTick,
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
        // Mouseup listens on `window`, not `root` -- a drag-extend can end with the pointer outside
        // the grid (mirrors source's `onPointerUp` listening on `windowEventTarget`,
        // `data-grid.tsx:1198`), and we still need to clear `mouseDownState`/`pendingHeaderMenuClick`
        // in that case.
        window.addEventListener("mouseup", this.onMouseUp);
        // Phase 9h. The main `mousemove` listener is on `root`, so it stops firing the moment a drag
        // leaves the grid -- which is exactly when autoscroll needs to know where the pointer is.
        // Source sidesteps this by listening for `pointermove` on the window (`data-grid.tsx:1374`);
        // this port keeps its narrower root listener (hover state is scoped to the grid) and adds a
        // window listener that only wakes up for an in-flight drag *outside* the grid. Events inside
        // the grid reach this one too, by bubbling -- the `contains` check is what stops them being
        // processed twice.
        window.addEventListener("mousemove", this.onWindowMouseMove);
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

    // --- Phase 9i: column auto-sizing ------------------------------------------------------------
    // Cache for `sizedColumns`. Keyed on identity of everything a measurement depends on: measuring
    // per draw would be absurd (it reads `AUTO_SIZE_SAMPLE_ROWS` cells per auto column), and
    // `computeMangledLayout` runs on every draw, scroll and hover pass.
    private autoSizeCache:
        | {
              readonly columns: readonly GridColumn[];
              readonly theme: FullTheme;
              readonly getCellRenderer: GetCellRendererCallback;
              readonly rows: number;
              readonly minColumnWidth: number;
              readonly maxColumnWidth: number;
              /** Container width, keyed because `grow` distributes the leftover against it. */
              readonly width: number;
              readonly result: InnerGridColumn[];
          }
        | undefined;

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
    private sizedColumns(args: ResolvedGridHostArgs): InnerGridColumn[] {
        const cached = this.autoSizeCache;
        if (
            cached !== undefined &&
            cached.columns === args.columns &&
            cached.theme === this.mergedTheme(args) &&
            cached.getCellRenderer === args.getCellRenderer &&
            cached.rows === args.rows &&
            cached.minColumnWidth === args.minColumnWidth &&
            cached.maxColumnWidth === args.maxColumnWidth &&
            // `grow` distributes the container's leftover width, so the result depends on the
            // container width and must be re-derived when the grid is resized.
            cached.width === this.width
        ) {
            return cached.result;
        }

        const theme = this.mergedTheme(args);
        const hasAuto = args.columns.some(c => !isSizedGridColumn(c));

        let result: InnerGridColumn[];
        if (!hasAuto) {
            // Nothing to measure -- a grid that never uses auto columns pays nothing at all.
            result = args.columns as InnerGridColumn[];
        } else {
            const sampleRows = Math.min(AUTO_SIZE_SAMPLE_ROWS, args.rows);
            // Sampled in the consumer's coordinate space; `sizeColumns` indexes by the same column
            // index it is iterating, so the two must agree -- hence sampling `args.columns`, not the
            // mangled set.
            const sample =
                sampleRows > 0
                    ? this.cellsForSelectionSync(args, { x: 0, y: 0, width: args.columns.length, height: sampleRows })
                    : [];
            result = sizeColumns(
                args.columns,
                this.canvasEl.getContext("2d") ?? undefined,
                theme,
                sample ?? [],
                args.getCellRenderer,
                {
                    minColumnWidth: args.minColumnWidth,
                    maxColumnWidth: args.maxColumnWidth,
                    removeOutliers: true,
                }
            );
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
            result,
        };
        return result;
    }

    // 9g: the `scaleToRem` result, memoized on everything it is computed from. **Load-bearing**:
    // the scaled `theme` object is identity-compared by `mergedThemeCache` and, beyond it, by
    // `computeCanBlit` -- and `resolveArgs` runs several times per draw, so an unmemoized scale
    // would hand out a fresh theme object every call and silently kill the scroll blit fast path.
    // With `scaleToRem` off, `remAdjustDimensions` returns its input by identity and this cache
    // never even gets consulted.
    private remAdjustCache:
        | { readonly src: RemAdjustableDimensions; readonly remSize: number; readonly value: RemAdjustableDimensions }
        | undefined;

    // Measured lazily and refreshed on `scheduleFullRedraw` -- see `GridHostArgs.scaleToRem` for
    // why this port does not observe the root font size continuously the way source does.
    private remSize: number | undefined;

    private remAdjust(dimensions: RemAdjustableDimensions, scaleToRem: boolean): RemAdjustableDimensions {
        if (!scaleToRem) return dimensions;
        const remSize = (this.remSize ??= measureRemSize());
        const cached = this.remAdjustCache;
        if (cached !== undefined && cached.remSize === remSize && dimensionsAreEqual(cached.src, dimensions)) {
            return cached.value;
        }
        const value = remAdjustDimensions(dimensions, true, remSize);
        this.remAdjustCache = { src: dimensions, remSize, value };
        return value;
    }

    private resolveArgs(): ResolvedGridHostArgs {
        const args = this.getArgsFn();
        const baseHeaderHeight = args.headerHeight ?? DEFAULT_HEADER_HEIGHT;
        const { rowHeight, headerHeight, groupHeaderHeight, theme } = this.remAdjust(
            {
                rowHeight: args.rowHeight ?? DEFAULT_ROW_HEIGHT,
                headerHeight: baseHeaderHeight,
                groupHeaderHeight: args.groupHeaderHeight ?? baseHeaderHeight,
                theme: args.theme,
            },
            args.scaleToRem === true
        );
        const rowMarkers = args.rowMarkers ?? "none";
        const hasRowMarkers = rowMarkers !== "none";
        return {
            columns: args.columns,
            getCellContent: args.getCellContent,
            rows: args.rows,
            rowHeight,
            headerHeight,
            groupHeaderHeight,
            theme,
            freezeColumns: args.freezeColumns ?? 0,
            getCellRenderer: args.getCellRenderer,
            verticalBorder: args.verticalBorder ?? ALWAYS_VERTICAL_BORDER,
            resizeIndicator: args.resizeIndicator ?? "none",
            hyperWrapping: args.hyperWrapping ?? false,
            getGroupDetails: this.resolvedGroupDetails(args.getGroupDetails),

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
            onSelectionChanged: args.onSelectionChanged,
            onHeaderMenuClick: args.onHeaderMenuClick,
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

            getRowThemeOverride: args.getRowThemeOverride,

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
            copyHeaders: args.copyHeaders === true,
            onDelete: args.onDelete,

            onCellClicked: args.onCellClicked,
            onHeaderClicked: args.onHeaderClicked,
            onGroupHeaderClicked: args.onGroupHeaderClicked,
            onCellActivated: args.onCellActivated,
            onFinishedEditing: args.onFinishedEditing,
            onColumnAppended: args.onColumnAppended,
            cellActivationBehavior: args.cellActivationBehavior ?? "second-click",

            editOnType: args.editOnType ?? true,
            trapFocus: args.trapFocus === true,
            drawFocusRing: args.drawFocusRing ?? true,

            scrollOffsetX: args.scrollOffsetX,
            scrollOffsetY: args.scrollOffsetY,
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
    private enableGroupsCache: { readonly columns: readonly GridColumn[]; readonly value: boolean } | undefined;

    private enableGroups(args: ResolvedGridHostArgs): boolean {
        const cached = this.enableGroupsCache;
        if (cached !== undefined && cached.columns === args.columns) return cached.value;
        const value = args.columns.some(c => c.group !== undefined);
        this.enableGroupsCache = { columns: args.columns, value };
        return value;
    }

    // 4.2: the consumer's `@getGroupDetails`, wrapped so every reader gets a *total* function --
    // source's `mangledGetGroupDetails` (`data-editor.tsx:1401-1425`), which likewise fills in
    // `{ name: group }` for a group the consumer says nothing about. (Source's other job there,
    // injecting a "Rename" action for `onGroupHeaderRenamed`, has no counterpart here yet: group
    // renaming needs a second inline overlay host and is still deferred -- see TODO.md 4.2.)
    //
    // Memoized on the consumer callback's identity for the reason spelled out on
    // `DEFAULT_GROUP_DETAILS`: this value ends up in `DrawGridArg`, and this port keeps every field
    // of that reference-stable rather than reasoning case-by-case about which ones `computeCanBlit`
    // compares today. A consumer who passes a fresh arrow per render defeats the cache but breaks
    // nothing -- the `GridHostArgs` doc comment asks for a stable one.
    private groupDetailsCache:
        | {
              readonly src: (groupName: string) => Partial<GroupDetails> | undefined;
              readonly value: GroupDetailsCallback;
          }
        | undefined;

    private resolvedGroupDetails(
        src: ((groupName: string) => Partial<GroupDetails> | undefined) | undefined
    ): GroupDetailsCallback {
        if (src === undefined) return DEFAULT_GROUP_DETAILS;
        const cached = this.groupDetailsCache;
        if (cached !== undefined && cached.src === src) return cached.value;
        const value: GroupDetailsCallback = groupName => {
            const result = src(groupName);
            // `name` is the only field the render path dereferences unconditionally
            // (`data-grid-render.header.ts:187`), so it is the only one worth defaulting. The
            // spread costs one small object per group per frame, the same order as
            // `DEFAULT_GROUP_DETAILS` already allocated.
            if (result === undefined) return { name: groupName };
            return { ...result, name: result.name ?? groupName };
        };
        this.groupDetailsCache = { src, value };
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
    private groupHeaderHeight(args: ResolvedGridHostArgs): number {
        return this.enableGroups(args) ? args.groupHeaderHeight : 0;
    }

    // Total header height (group header row + column header row). Source keeps the same derived
    // value (`data-editor.tsx:1135`).
    private totalHeaderHeight(args: ResolvedGridHostArgs): number {
        return args.headerHeight + this.groupHeaderHeight(args);
    }

    private mergedThemeCache: { readonly src: Partial<Theme> | undefined; readonly value: FullTheme } | undefined;

    private mergedTheme(args: ResolvedGridHostArgs): FullTheme {
        const cached = this.mergedThemeCache;
        if (cached !== undefined && cached.src === args.theme) return cached.value;
        const value = mergeAndRealizeTheme(getDataEditorTheme(), args.theme);
        this.mergedThemeCache = { src: args.theme, value };
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
    private themeForCell(args: ResolvedGridHostArgs, cell: GridCell, mangledCol: number, row: number): FullTheme {
        const column = this.mangledColumns(args)[mangledCol];
        return mergeAndRealizeTheme(
            this.mergedTheme(args),
            column?.themeOverride,
            args.getRowThemeOverride?.(row),
            cell.themeOverride
        );
    }

    // Last theme object stamped onto `root` as `--gdg-*` variables. Guards the ~37 `setProperty`
    // calls behind an identity check so they don't run on every scroll frame -- `mergedTheme` is
    // memoized above, so this is stable until the consumer's `@theme` actually changes.
    private lastRootStampedTheme: FullTheme | undefined;

    // Stamps `makeCSSStyle(theme)`'s `--gdg-*` custom properties onto an element. Both of source's
    // application sites go through this (the grid root, and each overlay-editor container).
    private applyThemeCssVariables(el: HTMLElement, theme: Theme): void {
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
    private mangledColumns(args: ResolvedGridHostArgs): readonly InnerGridColumn[] {
        return this.computeMangledLayout(args).mangledColumns;
    }

    // Phase 9k: the marker column's inputs, as three primitives the layout cache can compare.
    // Rebuilt per call (it is cheap) precisely so the cache -- not this method -- owns identity.
    private rowMarkerSpec(args: ResolvedGridHostArgs): RowMarkerColumnSpec | undefined {
        if (!args.hasRowMarkers) return undefined;
        const numSelectedRows = this.selection.rows.length;
        return {
            width: args.rowMarkerWidth,
            checked: numSelectedRows === 0 ? false : numSelectedRows === args.rows ? true : undefined,
            headerDisabled: args.rowSelect !== "multi",
            themeOverride: args.rowMarkerTheme,
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
    private mangledCellContentCache:
        | {
              readonly getCellContent: (item: Item) => GridCell;
              readonly hasRowMarkers: boolean;
              readonly showTrailingBlankRow: boolean;
              readonly rows: number;
              readonly rowMarkers: RowMarkerKind;
              readonly rowMarkerOffset: number;
              readonly canReorderRows: boolean;
              // 9g additions to the key. `columns` is here because the closure now reads each
              // column's own `trailingRowOptions`; `trailingRowOptions` and `rowMarkerStartIndex`
              // because it reads those too. The rule this cache lives by is stated above: enumerate
              // everything the closure captures, and check every entry appears here.
              readonly columns: readonly GridColumn[];
              readonly trailingRowOptions: TrailingRowOptions | undefined;
              readonly rowMarkerStartIndex: number;
              readonly value: (item: Item) => InnerGridCell;
          }
        | undefined;

    // Row-reorder live preview (Phase 9h). While a row drag is active, the grid shows the rows as
    // they *would* be after the drop by remapping which source row each screen row reads from --
    // nothing is committed until mouseup. Port of `data-grid-dnd.tsx`'s `getMangledCellContent`.
    //
    // Read lazily inside the cell-content closure rather than baked into it, so the closure's
    // identity stays stable across the drag (`getCellContent` is identity-compared by
    // `computeCanBlit`).
    private previewRowIndex(screenRow: number): number {
        const ds = this.dragRowState;
        if (ds === undefined || !ds.active) return screenRow;
        return previewRowOrder(screenRow, ds.srcRow, ds.dropRow);
    }

    private mangledGetCellContent(args: ResolvedGridHostArgs): (item: Item) => InnerGridCell {
        if (!args.hasRowMarkers && !args.showTrailingBlankRow) {
            return args.getCellContent;
        }
        const canReorderRows = args.onRowMoved !== undefined;
        const cached = this.mangledCellContentCache;
        if (
            cached !== undefined &&
            cached.getCellContent === args.getCellContent &&
            cached.hasRowMarkers === args.hasRowMarkers &&
            cached.showTrailingBlankRow === args.showTrailingBlankRow &&
            cached.rows === args.rows &&
            cached.rowMarkers === args.rowMarkers &&
            cached.rowMarkerOffset === args.rowMarkerOffset &&
            cached.canReorderRows === canReorderRows &&
            cached.columns === args.columns &&
            cached.trailingRowOptions === args.trailingRowOptions &&
            cached.rowMarkerStartIndex === args.rowMarkerStartIndex
        ) {
            return cached.value;
        }
        const { rowMarkerOffset } = args;
        const value = ([col, screenRow]: Item): InnerGridCell => {
            // Phase 9h: row-reorder preview, applied before everything else so the marker number,
            // the trailing-row check and the consumer read all agree on which row this is. Matches
            // source's layering (`DataGridDnd` wraps `DataEditor`'s mangled content, so its remap is
            // the outermost one).
            const row = this.previewRowIndex(screenRow);
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
                    // 9g: `rowMarkerStartIndex` (default 1) instead of the hardcoded `+ 1`.
                    row: args.rowMarkerStartIndex + row,
                    // Phase 9h: the marker cell's drag-handle dots, which are both the affordance
                    // for row reorder and its enable flag -- source sets exactly
                    // `drawHandle: onRowMoved !== undefined` (`data-editor.tsx:1338`).
                    drawHandle: canReorderRows,
                    cursor: args.rowMarkers === "clickable-number" ? "pointer" : undefined,
                };
            }
            if (isTrailing) {
                const columnOptions = args.columns[col - rowMarkerOffset]?.trailingRowOptions;
                if (columnOptions?.disabled === true) {
                    return { kind: GridCellKind.Loading, allowOverlay: false };
                }
                // Divergence, deliberate: source's default hint is `""`, this port's is `"Add row"`
                // -- the string it has shown since Phase 4d, kept so that adding `trailingRowOptions`
                // support does not silently blank an affordance every existing consumer already has.
                // Pass `hint: ""` for source's behaviour.
                const gridHint = col === rowMarkerOffset ? (args.trailingRowOptions?.hint ?? "Add row") : "";
                return {
                    kind: InnerGridCellKind.NewRow,
                    hint: columnOptions?.hint ?? gridHint,
                    icon: columnOptions?.addIcon ?? args.trailingRowOptions?.addIcon,
                    allowOverlay: false,
                };
            }
            return args.getCellContent([col - rowMarkerOffset, row]);
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
            value,
        };
        return value;
    }

    // Phase 9k. Was: rebuild the marker column, the mangled array and `mapColumns`' output on
    // **every** call -- and this runs on every draw, scroll, hover, hit-test and scroll-into-view.
    // `computeCanBlit` compares `mappedColumns` by reference first and only falls back to a
    // per-column `deepEqual` when the reference differs; above 100 columns it gives up and refuses
    // to blit at all. See `mangled-layout.ts` for the cache and its key, and
    // `mangled-layout.test.ts` for the identity contract, which is the part no other check catches.
    private readonly mangledLayoutCache = new MangledLayoutCache();

    private computeMangledLayout(args: ResolvedGridHostArgs): MangledLayout {
        return this.mangledLayoutCache.get(this.sizedColumns(args), this.rowMarkerSpec(args), args.freezeColumns);
    }

    // The full option bag the `selection-behavior.ts` writers take. Rebuilt per call rather than
    // memoized on purpose: this value never reaches `DrawGridArg`, so it is not one of
    // `computeCanBlit`'s identity-compared fields, and the writers read it and discard it.
    private selectionOptions(args: ResolvedGridHostArgs): SelectionBehaviorOptions {
        return {
            rangeBehavior: args.rangeSelectionBlending,
            columnBehavior: args.columnSelectionBlending,
            rowBehavior: args.rowSelectionBlending,
            rangeSelect: args.rangeSelect,
            rangeSelectionColumnSpanning: args.rangeSelectionColumnSpanning,
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
    private mangledSelection(args: ResolvedGridHostArgs): MangledSelection {
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
    private applySelection(newSelection: ConsumerSelection): void {
        this.selection = newSelection;
        const args = this.resolveArgs();
        args.onSelectionChanged?.(newSelection);
        this.scheduleFullRedraw();
    }

    /** `applySelection` for a selection computed in the render engine's column space. The single
     *  conversion back out to consumer space. */
    private applyMangledSelection(args: ResolvedGridHostArgs, newSelection: MangledSelection): void {
        this.applySelection(unmangleSelection(newSelection, args.rowMarkerOffset));
    }

    private clearSelection(): void {
        this.applySelection(EMPTY_SELECTION);
        this.lastSelectedRow = undefined;
        this.lastSelectedCol = undefined;
    }

    // --- public API ------------------------------------------------------------------------------

    /** Call after any `getArgs()`-relevant input changes (columns, rows, sizes, theme, etc). */
    public scheduleFullRedraw(): void {
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
    private lastAppliedScrollOffsetX: number | undefined;
    private lastAppliedScrollOffsetY: number | undefined;

    private applyScrollOffsets(args: ResolvedGridHostArgs): void {
        const { scrollOffsetX, scrollOffsetY } = args;
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
    public updateCells(cells: readonly { cell: Item }[]): void {
        if (this.destroyed) return;
        // `cell` arrives in the consumer's own column space (the same space as `getCellContent`'s
        // `Item`), but the damage set is matched against *mangled* column indices inside the draw
        // loop, so the synthetic row-marker column has to be added back here. Source does exactly
        // this at its own public `updateCells` boundary (`data-editor.tsx:4001-4006`). Without it,
        // every damaged cell lands one column to the left whenever `rowMarkers !== "none"` --
        // silently, since an unmatched damage entry just repaints the wrong cell.
        const { rowMarkerOffset } = this.resolveArgs();
        this.drawWithDamage(new CellSet(cells.map(c => [c.cell[0] + rowMarkerOffset, c.cell[1]] as Item)));
    }

    /** Current selection, in the **consumer's** column space (no row-marker column) -- the same
     *  space `@onSelectionChanged` reports and `@onCellsEdited` speaks. Read-only snapshot --
     *  mutate via user interaction, not directly. */
    public getSelection(): GridSelection {
        return this.selection;
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        // Signals any in-flight `getCellsForSelection` thunk that its result is no longer wanted.
        this.cellsForSelectionAbort.abort();
        // A running scan holds a scheduled callback that would otherwise fire against a torn-down
        // grid. Source cancels in an unmount effect for the same reason.
        this.search?.cancel();
        this.search = undefined;

        if (this.overlayState !== undefined) {
            window.removeEventListener("mousedown", this.onOverlayOutsideClick, true);
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
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("mousemove", this.onWindowMouseMove);
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
        const theme = this.mergedTheme(args);
        // Mirrors source's root-element `style={makeCSSStyle(mergedTheme)}` (`data-editor.tsx:4215`).
        // Done here rather than once at construction so a changed `@theme` restamps the variables;
        // identity-guarded so it's a no-op on ordinary scroll/hover redraws.
        if (this.lastRootStampedTheme !== theme) {
            this.applyThemeCssVariables(this.root, theme);
            this.lastRootStampedTheme = theme;
        }

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
            maxScaleFactor: 5,
            touchMode: false,
            renderStrategy: browserIsSafari.value ? "double-buffer" : "single-buffer",
            enqueue: this.animationQueue.enqueue,
            renderStateProvider: this.renderStateProvider,
            getCellRenderer: args.getCellRenderer,
            minimumCellWidth: 10,
            resizeIndicator: args.resizeIndicator,
        };

        if (damage === undefined) {
            const last = this.lastFullDrawArg;
            this.lastFullDrawArg = current;
            drawGrid(current, last);
        } else {
            drawGrid(current, undefined);
        }

        this.maybeEmitVisibleRegion(args, mappedColumns, freezeColumns);
    }

    // 9g: the tinted trailing row, memoized on the one row index it can contain.
    // `CompactSelection.empty()` is already a singleton, so only the tinted case needs a cache --
    // and it needs one because `fromSingleSelection` allocates, and this runs per draw.
    private disabledRowsCache: { readonly row: number; readonly value: CompactSelection } | undefined;

    private disabledRows(args: ResolvedGridHostArgs): CompactSelection {
        if (!args.showTrailingBlankRow || args.trailingRowOptions?.tint !== true) return CompactSelection.empty();
        const row = this.effectiveRows(args) - 1;
        const cached = this.disabledRowsCache;
        if (cached !== undefined && cached.row === row) return cached.value;
        const value = CompactSelection.fromSingleSelection(row);
        this.disabledRowsCache = { row, value };
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
    private highlightRegionsCache:
        | {
              readonly base: readonly Highlight[] | undefined;
              readonly fill: Rectangle | undefined;
              readonly rowMarkerOffset: number;
              readonly columnCount: number;
              readonly theme: FullTheme;
              readonly value: readonly Highlight[] | undefined;
          }
        | undefined;

    private effectiveHighlightRegions(args: ResolvedGridHostArgs, theme: FullTheme): readonly Highlight[] | undefined {
        const fill = this.fillState?.highlight;
        const base = args.highlightRegions;
        // Nothing to translate and nothing to add: hand back the caller's own reference.
        if (fill === undefined && (base === undefined || base.length === 0 || args.rowMarkerOffset === 0)) {
            return base;
        }

        const columnCount = args.columns.length + args.rowMarkerOffset;
        const cached = this.highlightRegionsCache;
        if (
            cached !== undefined &&
            cached.base === base &&
            cached.theme === theme &&
            cached.rowMarkerOffset === args.rowMarkerOffset &&
            cached.columnCount === columnCount &&
            rectanglesEqual(cached.fill, fill)
        ) {
            return cached.value;
        }

        const regions: Highlight[] = [];
        for (const region of base ?? []) {
            const maxWidth = columnCount - region.range.x - args.rowMarkerOffset;
            if (maxWidth <= 0) continue;
            regions.push({
                color: region.color,
                range: {
                    ...region.range,
                    x: region.range.x + args.rowMarkerOffset,
                    width: Math.min(maxWidth, region.range.width),
                },
                style: region.style,
            });
        }
        if (fill !== undefined) {
            // Transparent fill + dashed outline, exactly as source styles the fill preview. Already
            // in mangled space -- it comes from the selection, not from the consumer.
            regions.push({ color: withAlpha(theme.accentColor, 0), range: fill, style: "dashed" });
        }

        const value = regions.length > 0 ? regions : undefined;
        this.highlightRegionsCache = {
            base,
            fill,
            rowMarkerOffset: args.rowMarkerOffset,
            columnCount,
            theme,
            value,
        };
        return value;
    }

    // Cursor is decided by two independent inputs: whatever the render engine's `overrideCursor`
    // last reported for the hovered cell, and the fill-handle state. Source computes the same
    // precedence inline in `data-grid.tsx:972-982`; here the two arrive at different times, so both
    // funnel through this one writer.
    private applyCursor(): void {
        const crosshair = this.fillState !== undefined || this.overFillHandle;
        const resizing = this.resizeState !== undefined || this.overResizeEdge;
        this.scrollerEl.style.cursor = crosshair ? "crosshair" : resizing ? "col-resize" : (this.cursorOverride ?? "");
    }

    // --- Phase 8: visible-region reporting ---------------------------------------------------------
    //
    // Source computes this in `scrolling-data-grid.tsx`'s `processArgs` (its own scroll handler);
    // this port derives it at the end of every draw instead, which covers scroll, resize and arg
    // changes with one call site and keeps it aligned with the offsets that were actually painted.
    // The dedupe below is what keeps that cheap: the callback fires only when the visible block
    // genuinely changes, i.e. at most once per crossed row/column boundary, not once per frame.

    private lastVisibleRegion: Rectangle | undefined = undefined;

    private maybeEmitVisibleRegion(
        args: ResolvedGridHostArgs,
        mappedColumns: readonly MappedGridColumn[],
        freezeColumns: number
    ): void {
        const onVisibleRegionChanged = args.onVisibleRegionChanged;
        if (onVisibleRegionChanged === undefined) return;

        const region = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
        const last = this.lastVisibleRegion;
        if (
            last !== undefined &&
            last.x === region.x &&
            last.y === region.y &&
            last.width === region.width &&
            last.height === region.height
        ) {
            return;
        }
        this.lastVisibleRegion = region;

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
    private computeVisibleRegion(
        args: ResolvedGridHostArgs,
        mappedColumns: readonly MappedGridColumn[],
        freezeColumns: number
    ): Rectangle {
        const effectiveColumns = getEffectiveColumns(
            mappedColumns,
            this.cellXOffset,
            this.width,
            undefined,
            this.translateX
        );
        // `getEffectiveColumns` returns every sticky column first, then the visible non-sticky ones
        // starting at `cellXOffset` -- so the sticky prefix is exactly `freezeColumns` long.
        const x = Math.max(0, this.cellXOffset - args.rowMarkerOffset);
        const width = Math.max(0, Math.min(effectiveColumns.length - freezeColumns, args.columns.length - x));

        const rows = args.rows;
        if (rows <= 0) return { x, y: 0, width, height: 0 };

        const y = Math.min(Math.max(0, this.cellYOffset), rows - 1);
        // `translateY` is <= 0: how much of the first visible row is scrolled off the top, so
        // subtracting it adds that sliver back onto the height still to be covered.
        const available = Math.max(0, this.height - this.totalHeaderHeight(args)) - this.translateY;

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

        return { x, y, width, height: Math.max(0, Math.min(height, rows - y)) };
    }

    // --- DOM sizing --------------------------------------------------------------------------------

    private sizeCanvases(args: ResolvedGridHostArgs): void {
        this.canvasEl.style.width = `${this.width}px`;
        this.canvasEl.style.height = `${this.height}px`;

        const headerCanvasHeight = this.totalHeaderHeight(args) + 1;
        this.headerCanvasEl.style.width = "100%";
        this.headerCanvasEl.style.height = `${headerCanvasHeight}px`;
    }

    private rebuildScrollContent(args: ResolvedGridHostArgs): void {
        const { mappedColumns } = this.computeMangledLayout(args);
        const totalWidth = mappedColumns.reduce((sum, c) => sum + c.width, 0);
        const totalHeight = this.totalHeaderHeight(args) + totalRowsHeight(this.effectiveRows(args), args.rowHeight);

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
    private syncScrollOffsets(args: ResolvedGridHostArgs): void {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const { cellXOffset, translateX } = computeXOffset(this.scrollerEl.scrollLeft, mappedColumns, freezeColumns);
        const { cellYOffset, translateY } = computeYOffset(
            this.scrollerEl.scrollTop,
            this.effectiveRows(args),
            args.rowHeight
        );
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
    private redrawHeaderHover(args: ResolvedGridHostArgs): void {
        this.runDraw(args, undefined);
    }

    private readonly onScroll = (): void => {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        this.syncScrollOffsets(args);

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
        const effectiveColumns = getEffectiveColumns(
            mappedColumns,
            this.cellXOffset,
            this.width,
            undefined,
            this.translateX
        );
        const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
        const row = getRowIndexForY(
            y,
            this.height,
            this.enableGroups(args),
            args.headerHeight,
            this.groupHeaderHeight(args),
            this.effectiveRows(args),
            args.rowHeight,
            this.cellYOffset,
            this.translateY,
            0
        );

        const resizeHoverColumn =
            this.resizeState === undefined && row !== undefined && row <= -1
                ? this.hitTestColumnResizeEdge(args, col, row, x)
                : undefined;
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
                ds.vetoed =
                    args.onColumnProposeMove?.(
                        ds.srcCol - args.rowMarkerOffset,
                        proposedDest - args.rowMarkerOffset
                    ) === false;
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
            const dragLocation: Item = [
                col !== -1 ? col : x < 0 ? 0 : mappedColumns.length - 1,
                row ?? this.effectiveRows(args) - 1,
            ];
            const edge = computeScrollEdge(x, y, this.width, this.height, totalHeaderHeight);
            this.lastDragHover = { location: dragLocation, edge };

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

        const item: Item | undefined = col === -1 || row === undefined ? undefined : [col, row];

        // Fill-handle hover: cursor feedback only (source's `overFill`). Must be evaluated even when
        // the hovered *cell* hasn't changed, since the handle is a few px inside one cell's corner.
        const overFill = item !== undefined && item[1] >= 0 && this.hitTestFillHandle(args, x, y);
        if (overFill !== this.overFillHandle) {
            this.overFillHandle = overFill;
            this.applyCursor();
        }

        const updateHoverInfo = (target: Item) => {
            const cellRect = computeBounds(
                target[0],
                target[1],
                this.width,
                this.height,
                this.groupHeaderHeight(args),
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
        const cellNeedsHover =
            (renderer === undefined && cell.kind === GridCellKind.Custom) ||
            (renderer?.needsHover !== undefined &&
                (typeof renderer.needsHover === "boolean" ? renderer.needsHover : renderer.needsHover(cell)));

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
    private emitItemHovered(
        args: ResolvedGridHostArgs,
        item: Item | undefined,
        ev: MouseEvent,
        x: number,
        y: number
    ): void {
        const onItemHovered = args.onItemHovered;
        if (onItemHovered === undefined) return;

        onItemHovered(
            this.buildMouseEventArgs(args, item, {
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
                localY: y,
            })
        );
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
    private buildMouseEventArgs(
        args: ResolvedGridHostArgs,
        item: Item | undefined,
        base: Omit<BaseGridMouseEventArgs, "isLongTouch"> & { readonly localX: number; readonly localY: number }
    ): GridMouseEventArgs {
        const { localX, localY, ...common } = base;

        if (item === undefined) {
            return {
                ...common,
                kind: outOfBoundsKind,
                location: [0, 0],
                isMaybeScrollbar: false,
                region: [OutOfBoundsRegionAxis.Center, OutOfBoundsRegionAxis.Center],
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
            return row === -2
                ? { ...common, kind: groupHeaderKind, location: [col, -2], bounds, group, localEventX, localEventY }
                : { ...common, kind: headerKind, location: [col, -1], bounds, group, localEventX, localEventY };
        }

        return {
            ...common,
            kind: "cell",
            location: [col, row],
            bounds,
            isFillHandle: this.overFillHandle,
            localEventX,
            localEventY,
        };
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
    private clickEventBase(hit: MouseHit): Omit<BaseGridMouseEventArgs, "isLongTouch"> {
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
            scrollEdge: NO_SCROLL_EDGE,
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
    private dispatchClick(ev: MouseEvent, downState: MouseDownState): void {
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
    private emitCellClicked(args: ResolvedGridHostArgs, hit: MouseHit): boolean {
        const callback = args.onCellClicked;
        if (callback === undefined) return false;
        const [mangledCol, row] = hit.location;
        const location: Item = [mangledCol - args.rowMarkerOffset, row];
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
            },
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
    private emitHeaderClicked(args: ResolvedGridHostArgs, hit: MouseHit): boolean {
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
            },
        };
        if (isGroup) {
            args.onGroupHeaderClicked?.(col, { ...common, kind: groupHeaderKind, location: [col, -2] });
        } else {
            args.onHeaderClicked?.(col, { ...common, kind: headerKind, location: [col, -1] });
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
    private applyGroupHeaderSelection(args: ResolvedGridHostArgs, hit: MouseHit): void {
        const mangledSelection = this.mangledSelection(args);
        const { mappedColumns } = this.computeMangledLayout(args);
        const isMultiKey = browserIsOSX.value ? hit.metaKey : hit.ctrlKey;
        const update = computeGroupHeaderSelection({
            mappedColumns,
            col: hit.location[0],
            rowMarkerOffset: args.rowMarkerOffset,
            selectedColumns: mangledSelection.columns,
            columnSelect: args.columnSelect,
            columnSelectionMode: args.columnSelectionMode,
            isMultiKey,
        });
        if (update === undefined) return;
        this.applyMangledSelection(
            args,
            writerSetSelectedColumns(
                mangledSelection,
                update.newColumns,
                update.append,
                isMultiKey,
                this.selectionOptions(args)
            )
        );
        // Source touches neither `lastSelectedColRef` nor `lastSelectedRowRef` here (contrast the
        // single-column header path, which sets both). Matched deliberately: a shift-click after a
        // group-header click extends from the last *header* click, not from the group.
    }

    /** Fires `onCellActivated`. `mangledLocation` is converted to consumer space here, the single
     *  place this event is emitted from. */
    private emitCellActivated(
        args: ResolvedGridHostArgs,
        mangledLocation: Item,
        activation: CellActivatedEventArgs
    ): void {
        args.onCellActivated?.([mangledLocation[0] - args.rowMarkerOffset, mangledLocation[1]], activation);
    }

    // --- Phase 9h: shared drag plumbing (drag-extend / row reorder / fill) -------------------------

    /** True while any pointer drag this class tracks per-cell is in flight. Resize/column-reorder are
     * deliberately excluded: both are handled and `return`ed above this point, and neither wants
     * autoscroll (a column resize past the edge would fight the scroll it caused). */
    private isDragInFlight(): boolean {
        return this.fillState !== undefined || this.dragRowState !== undefined || this.mouseDownState !== undefined;
    }

    // See the constructor: this exists only so a drag that has left the grid keeps being tracked.
    private readonly onWindowMouseMove = (ev: MouseEvent): void => {
        if (this.destroyed) return;
        if (ev.buttons === 0 || !this.isDragInFlight()) return;
        if (ev.target instanceof Node && this.root.contains(ev.target)) return;
        this.onMouseMove(ev);
    };

    // One frame of autoscroll has just scrolled the grid under a stationary pointer. Port of
    // source's `adjustSelectionOnScroll` (`data-editor.tsx:2826-2848`): the pointer's own hit test
    // is meaningless (it is outside the grid), so the drag follows the leading edge of whatever is
    // now in view instead.
    private readonly onAutoscrollTick = (): void => {
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
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const visible = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
        const target = adjustDragLocationForScroll(
            hover.location,
            hover.edge,
            visible,
            // `computeVisibleRegion` reports columns in the consumer's space; the drag works in
            // mangled space, where the first non-frozen visible column is exactly `cellXOffset`.
            this.cellXOffset,
            mappedColumns.length - 1,
            this.effectiveRows(args) - 1
        );
        this.applyDragTo(args, target);
    };

    /** Applies an in-flight drag to a resolved grid location. Shared by the mousemove path and the
     * autoscroll tick, which is the point: the two must not drift apart. */
    private applyDragTo(args: ResolvedGridHostArgs, location: Item): void {
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

        if (this.mouseDownState !== undefined) {
            this.handleDragMove(args, this.mouseDownState, location);
        }
    }

    // Is `localX`/`localY` (root-relative pixels) inside the fill handle drawn at the bottom-right
    // corner of the current selection? Port of source's `isFillHandle` computation
    // (`data-grid.tsx:662-687`), including its deliberately generous hit box: the handle is
    // `size` px across but accepts anything within `size` px of its centre in each axis.
    private hitTestFillHandle(args: ResolvedGridHostArgs, localX: number, localY: number): boolean {
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
    private fillPattern(args: ResolvedGridHostArgs, patternRange: Rectangle, destRange: Rectangle): void {
        const offset = args.rowMarkerOffset;
        const source: Rectangle = { ...patternRange, x: patternRange.x - offset };
        const destination: Rectangle = { ...destRange, x: destRange.x - offset };
        if (source.width <= 0 || source.height <= 0) return;

        if (args.onFillPattern !== undefined) {
            let canceled = false;
            args.onFillPattern({
                patternSource: source,
                fillDestination: destination,
                preventDefault: () => {
                    canceled = true;
                },
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
            rowCount: args.rows,
        });
        if (edits.length === 0) return;
        args.onCellsEdited?.(edits);
        this.updateCells(edits.map(e => ({ cell: e.location })));
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
    private resolveMouseHit(args: ResolvedGridHostArgs, ev: MouseEvent): MouseHit {
        return this.resolveHitAtPoint(args, ev.clientX, ev.clientY, ev);
    }

    /**
     * The same hit test, from a bare pair of *client* coordinates. 9f's `getMouseArgsForPosition`
     * needs this, and source separates them the same way (`data-grid.tsx:516`, which takes
     * `posX`/`posY` and an *optional* event -- every internal caller passes one, the ref method does
     * not).
     */
    private resolveHitAtPoint(args: ResolvedGridHostArgs, clientX: number, clientY: number, ev?: MouseEvent): MouseHit {
        const { mappedColumns } = this.computeMangledLayout(args);
        const rect = this.root.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const effectiveColumns = getEffectiveColumns(
            mappedColumns,
            this.cellXOffset,
            this.width,
            undefined,
            this.translateX
        );
        const col = getColumnIndexForX(x, effectiveColumns, this.translateX);
        const row = getRowIndexForY(
            y,
            this.height,
            this.enableGroups(args),
            args.headerHeight,
            this.groupHeaderHeight(args),
            this.effectiveRows(args),
            args.rowHeight,
            this.cellYOffset,
            this.translateY,
            0
        );

        const shiftKey = ev?.shiftKey ?? false;
        const ctrlKey = ev?.ctrlKey ?? false;
        const metaKey = ev?.metaKey ?? false;
        const isDoubleClick = (ev?.detail ?? 0) >= 2;
        const button = ev?.button ?? 0;
        const buttons = ev?.buttons ?? 0;

        if (col === -1 || row === undefined || x < 0 || y < 0 || x > this.width || y > this.height) {
            const location: Item = [
                col !== -1 ? col : x < 0 ? 0 : mappedColumns.length - 1,
                row ?? this.effectiveRows(args) - 1,
            ];
            // `offsetWidth - clientWidth` is 0 for overlay scrollbars (nothing to guard against
            // there) and approximates the classic scrollbar width otherwise -- good enough for this
            // best-effort guard, source's own `getScrollBarWidth()` isn't ported.
            const scrollbarWidth = this.scrollerEl.offsetWidth - this.scrollerEl.clientWidth;
            const isMaybeScrollbar =
                (x > this.width && x < this.width + scrollbarWidth) ||
                (y > this.height && y < this.height + scrollbarWidth);
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
                isMaybeScrollbar,
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
            isDoubleClick,
            button,
            buttons,
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
            this.groupHeaderHeight(args),
            this.totalHeaderHeight(args),
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
        // Phase 6: header cells are drawn with `mergeAndRealizeTheme(outerTheme, groupTheme,
        // c.themeOverride)` (`render/data-grid-render.header.ts:65-69`), so the hit-test uses the
        // same column-merged theme -- `computeHeaderLayout` reads `cellHorizontalPadding`/
        // `headerIconSize` off it, both of which a column override may legitimately change.
        const theme = mergeAndRealizeTheme(this.mergedTheme(args), column.themeOverride);
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

    /**
     * Hit-test for a group header's action icons (4.2). Port of source's
     * `groupHeaderActionForEvent` (`data-grid.tsx:1004-1029`); the geometry and the comparison it
     * makes live in `rendering/render/group-header-actions.ts` so they are shared with the drawing
     * code and reachable from vitest.
     *
     * Returns `undefined` for anything that is not a group-header press, so callers can ask
     * unconditionally.
     */
    private hitTestGroupHeaderAction(args: ResolvedGridHostArgs, hit: MouseHit): GroupHeaderAction | undefined {
        if (hit.kind !== "header" || hit.location[1] !== -2 || !this.enableGroups(args)) return undefined;
        const mangledCol = hit.location[0];
        const groupName = args.columns[mangledCol - args.rowMarkerOffset]?.group ?? "";
        // `computeCellRect` grows a group header's rect across its whole span (row `-2` is handled
        // natively by `computeBounds`), which is the rect the actions were drawn right-aligned in.
        const bounds = this.computeCellRect(args, mangledCol, -2);
        return hitTestGroupHeaderAction(
            args.getGroupDetails(groupName),
            bounds,
            hit.localX - bounds.x,
            hit.localY - bounds.y
        );
    }

    // Hit-test for a header column's resize-edge region (Phase 3d) -- a narrow strip at the
    // column's right border, `RESIZE_EDGE_PX` wide. `localX` is root-relative, same coordinate
    // space `computeBounds` returns. Resize is only reachable when at least one of the three
    // resize callbacks is configured (mirrors source's `canResize` gate) and never on the
    // row-marker column (mirrors source excluding `col === 0` marker-column resize).
    private hitTestColumnResizeEdge(
        args: ResolvedGridHostArgs,
        col: number,
        row: number,
        localX: number
    ): number | undefined {
        if ((args.onColumnResize ?? args.onColumnResizeEnd ?? args.onColumnResizeStart) === undefined) return undefined;
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const boundsFor = (columnIndex: number): Rectangle =>
            computeBounds(
                columnIndex,
                row,
                this.width,
                this.height,
                this.groupHeaderHeight(args),
                this.totalHeaderHeight(args),
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
    private readonly onContextMenu = (ev: MouseEvent): void => {
        if (this.destroyed) return;
        // Same guard as `onMouseDown` below, for the same reason: a right-click inside an open
        // editor or on consumer chrome is not a right-click on a cell.
        if (!isGridSurfaceTarget(ev.target, this.gridSurfaces)) return;
        const args = this.resolveArgs();
        if (
            args.onCellContextMenu === undefined &&
            args.onHeaderContextMenu === undefined &&
            args.onGroupHeaderContextMenu === undefined
        ) {
            return;
        }

        const hit = this.resolveMouseHit(args, ev);
        if (hit.kind === "out-of-bounds") return;

        const [mangledCol, row] = hit.location;
        const col = mangledCol - args.rowMarkerOffset;
        if (col < 0) return;

        const eventArgs: ContextMenuEventArgs = {
            bounds: this.computeCellRect(args, mangledCol, row),
            localEventX: hit.localX,
            localEventY: hit.localY,
            clientX: ev.clientX,
            clientY: ev.clientY,
            // Not called for us -- the browser menu stays unless the consumer suppresses it.
            preventDefault: () => ev.preventDefault(),
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

    private readonly onMouseDown = (ev: MouseEvent): void => {
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

        // Header resize and menu clicks are exclusive with ordinary header-click selection
        // dispatch. Resize gets first priority, matching source's DND wrapper; otherwise a menu
        // glyph at the same right edge would consume the resize gesture.
        if (hit.kind === "header") {
            // 4.2: a press on one of a group header's action icons is not a grid interaction at all
            // -- it must not select the group's columns, not start a column drag, and not record a
            // press location. Source returns from `onPointerDown` before calling any of that
            // (`data-grid.tsx:1104-1110`); the action fires on the matching pointerup.
            if (this.hitTestGroupHeaderAction(args, hit) !== undefined) {
                this.pendingHeaderMenuClick = undefined;
                return;
            }

            // Column resize (Phase 3d): mousedown on a header's resize-edge starts a resize drag
            // and is exclusive with normal header-click selection/reorder, exactly like the
            // menu-glyph check above -- mirrors source's `onMouseDownImpl`
            // (`data-grid-dnd.tsx`), which returns immediately after recording resize state.
            const resizeCol = this.hitTestColumnResizeEdge(args, hit.location[0], hit.location[1], hit.localX);
            if (resizeCol !== undefined) {
                const { mappedColumns } = this.computeMangledLayout(args);
                const column = mappedColumns[resizeCol];
                if (column !== undefined) {
                    const realCol = resizeCol - args.rowMarkerOffset;
                    this.resizeState = {
                        col: resizeCol,
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

            const menuBounds = this.hitTestHeaderMenu(args, hit.location[0], hit.localX, hit.localY);
            if (menuBounds !== undefined) {
                this.pendingHeaderMenuClick = hit.location[0];
                return;
            }
        }
        this.pendingHeaderMenuClick = undefined;

        // Mirrors source's `setMouseState({previousSelection: gridSelection, fillHandle: fh})`
        // (`data-editor.tsx:2120-2123`) -- recorded for every kind (cell/header/out-of-bounds), not
        // just cell clicks, since drag-extend needs to know where the drag started regardless.
        this.mouseDownState = { location: hit.location, previousSelection: this.mangledSelection(args) };

        if (hit.kind === "cell") {
            // Phase 9h: a mousedown on the fill handle starts a fill drag and is exclusive with
            // ordinary selection dispatch -- source's `if (!isTouch && button === 0 && !fh)
            // handleSelect(args)` (`data-editor.tsx:2126`). The selection must stay put: it is the
            // fill's pattern source.
            if (this.hitTestFillHandle(args, hit.localX, hit.localY)) {
                this.fillState = { previousSelection: this.mangledSelection(args), highlight: undefined };
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
                        dropRow: row,
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
            if (args.onColumnMoved !== undefined && hit.location[0] >= args.rowMarkerOffset) {
                this.dragColState = {
                    srcCol: hit.location[0],
                    startClientX: ev.clientX,
                    active: false,
                    dropCol: hit.location[0],
                    vetoed: false,
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
        }
    };

    private readonly onMouseUp = (ev: MouseEvent): void => {
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
                    current: { ...previous, range: combined },
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
                        localY: hit.localY,
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
        const dragHappened =
            this.dragRowState?.active === true || this.dragColState?.active === true || this.resizeState !== undefined;
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
                // Moving a column changes which column occupies each displayed index. Keep the
                // moved column selected, matching source's `setSelectedColumns(endIndex, ... )`
                // after it forwards `onColumnMoved`; otherwise the highlight stays at the old
                // index and appears to jump onto the column that replaced it.
                if (args.columnSelect !== "none") {
                    this.applyMangledSelection(
                        args,
                        writerSetSelectedColumns(
                            this.mangledSelection(args),
                            CompactSelection.fromSingleSelection(ds.dropCol),
                            undefined,
                            true,
                            this.selectionOptions(args)
                        )
                    );
                }
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
            if (
                (args.showTrailingBlankRow && row === args.rows) ||
                args.rowMarkers === "number" ||
                args.rowSelect === "none"
            )
                return;

            // Row selection carries no column coordinate, so this whole branch stays in consumer
            // space: it reads `this.selection`, and `setSelectedRows` passes `current`/`columns`
            // through untouched, so `applySelection` receives consumer space as it requires.
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
                if (isMultiRow || args.rowSelectionMode === "multi") {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, undefined, newSlice, true, this.selectionOptions(args))
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            CompactSelection.fromSingleSelection(newSlice),
                            undefined,
                            isMultiRow,
                            this.selectionOptions(args)
                        )
                    );
                }
            } else if (args.rowSelect === "multi" && (isMultiRow || args.rowSelectionMode === "multi")) {
                if (isSelected) {
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            selectedRows.remove(row),
                            undefined,
                            true,
                            this.selectionOptions(args)
                        )
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(this.selection, undefined, row, true, this.selectionOptions(args))
                    );
                    this.lastSelectedRow = row;
                }
            } else if (isSelected && selectedRows.length === 1) {
                this.applySelection(
                    writerSetSelectedRows(
                        this.selection,
                        CompactSelection.empty(),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
                    )
                );
            } else {
                this.applySelection(
                    writerSetSelectedRows(
                        this.selection,
                        CompactSelection.fromSingleSelection(row),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
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

        if (hit.shiftKey && cellCol !== undefined && cellRow !== undefined && current !== undefined) {
            const left = Math.min(col, cellCol);
            const right = Math.max(col, cellCol);
            const top = Math.min(row, cellRow);
            const bottom = Math.max(row, cellRow);
            const result = setCurrentSelection(
                mangledSelection,
                { ...current, range: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } },
                true,
                isMultiKey,
                "click",
                this.selectionOptions(args)
            );
            this.applyMangledSelection(args, result.selection);
        } else {
            const result = setCurrentSelection(
                mangledSelection,
                { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 } },
                true,
                isMultiKey,
                "click",
                this.selectionOptions(args)
            );
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
    private dispatchCellMouseUp(args: ResolvedGridHostArgs, hit: MouseHit, downState: MouseDownState): void {
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
            const theme = this.themeForCell(args, cellContent as GridCell, col, row);
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
                scrollEdge: NO_SCROLL_EDGE,
            });
            if (newVal !== undefined) {
                this.commitCellEdit(args, hit.location, newVal as GridCell);
                return;
            }
        }
        if (prevented) return;

        // 9g: all three of source's activation behaviours, where Phase 4a only had `"second-click"`.
        // A cell's own `activationBehaviorOverride` wins over the grid-wide setting, as in source.
        const behavior = (cellContent as GridCell).activationBehaviorOverride ?? args.cellActivationBehavior;
        if (
            !shouldActivateOnClick({
                behavior,
                isDoubleClick: hit.isDoubleClick,
                location: hit.location,
                // "Selected now" is post-mousedown; "selected before" is what `mouseDownState`
                // captured. Both are required -- see `shouldActivateOnClick`.
                currentCell: this.mangledSelection(args).current?.cell,
                previousCell: downState.previousSelection.current?.cell,
            })
        ) {
            return;
        }

        this.activateCell(args, hit.location, cellContent, {
            highlight: true,
            activation: {
                inputType: "pointer",
                pointerActivation: resolvePointerActivation(behavior, hit.isDoubleClick),
                pointerType: "mouse",
            },
        });
    }

    // Port of `handleSelect`'s `args.kind === "header"` branch (`data-editor.tsx:1994-2047`).
    private dispatchHeaderMouseDown(args: ResolvedGridHostArgs, hit: MouseHit, isMultiKey: boolean): void {
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
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            CompactSelection.fromSingleSelection([0, args.rows]),
                            undefined,
                            isMultiKey,
                            this.selectionOptions(args)
                        )
                    );
                } else {
                    this.applySelection(
                        writerSetSelectedRows(
                            this.selection,
                            CompactSelection.empty(),
                            undefined,
                            isMultiKey,
                            this.selectionOptions(args)
                        )
                    );
                }
            }
            return;
        }

        const lastCol = this.lastSelectedCol;
        if (
            args.columnSelect === "multi" &&
            hit.shiftKey &&
            lastCol !== undefined &&
            selectedColumns.hasIndex(lastCol)
        ) {
            const newSlice: Slice = [Math.min(lastCol, col), Math.max(lastCol, col) + 1];
            if (isMultiKey || args.columnSelectionMode === "multi") {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(
                        mangledSelection,
                        undefined,
                        newSlice,
                        isMultiKey,
                        this.selectionOptions(args)
                    )
                );
            } else {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(
                        mangledSelection,
                        CompactSelection.fromSingleSelection(newSlice),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
                    )
                );
            }
        } else if (args.columnSelect === "multi" && (isMultiKey || args.columnSelectionMode === "multi")) {
            if (selectedColumns.hasIndex(col)) {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(
                        mangledSelection,
                        selectedColumns.remove(col),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
                    )
                );
            } else {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(mangledSelection, undefined, col, isMultiKey, this.selectionOptions(args))
                );
            }
            this.lastSelectedCol = col;
        } else if (args.columnSelect !== "none") {
            if (selectedColumns.hasIndex(col)) {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(
                        mangledSelection,
                        selectedColumns.remove(col),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
                    )
                );
            } else {
                this.applyMangledSelection(
                    args,
                    writerSetSelectedColumns(
                        mangledSelection,
                        CompactSelection.fromSingleSelection(col),
                        undefined,
                        isMultiKey,
                        this.selectionOptions(args)
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
        mouseDownState: { location: Item; previousSelection: MangledSelection },
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
                    this.selectionOptions(args)
                )
            );
            return;
        }

        // Mangled from here down: `col` is a hit-test column and the clamp is against
        // `args.rowMarkerOffset`.
        const mangledSelection = this.mangledSelection(args);
        if (
            mangledSelection.current !== undefined &&
            (args.rangeSelect === "rect" || args.rangeSelect === "multi-rect")
        ) {
            const [selectedCol, selectedRow] = mangledSelection.current.cell;
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
                mangledSelection,
                { ...mangledSelection.current, range: newRange },
                true,
                false,
                "drag",
                this.selectionOptions(args)
            );
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
    private computeCellRect(args: ResolvedGridHostArgs, mangledCol: number, row: number): Rectangle {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        return computeBounds(
            mangledCol,
            row,
            this.width,
            this.height,
            this.groupHeaderHeight(args),
            this.totalHeaderHeight(args),
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
        opts: {
            readonly highlight: boolean;
            readonly initialValue?: string;
            /** 9g: what to report through `onCellActivated`. Every activation trigger describes
             *  itself, so the event is built where the trigger is known rather than inferred here. */
            readonly activation: CellActivatedEventArgs;
        }
    ): void {
        if (cellContent.kind === InnerGridCellKind.NewRow) {
            // Same flow as the click path above, mirroring source's own two call sites
            // (`data-editor.tsx:1913` and `:3303`, both `appendRow(customTargetColumn ?? col)`).
            void this.appendRow(this.resolveNewRowTargetColumn(args, mangledLocation[0]));
            return;
        }
        if (isInnerOnlyCellKind(cellContent.kind)) return;
        const cell = cellContent as GridCell;

        // 9g. Fired for a real activation only -- never for the trailing blank row (which appends
        // instead, handled above) and never for a marker cell. Mirrors source, which emits it right
        // before `reselect()`, i.e. before the boolean toggle *and* before the overlay opens.
        this.emitCellActivated(args, mangledLocation, opts.activation);

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
                    content = { ...content, data: opts.initialValue };
                    break;
                default:
                    break;
            }
        }

        this.openOverlay(args, mangledLocation, content, opts.highlight, opts.activation.inputType === "keyboard");
    }

    private openOverlay(
        args: ResolvedGridHostArgs,
        mangledLocation: Item,
        cell: GridCell,
        highlight: boolean,
        focusImmediately = false
    ): void {
        if (this.overlayState !== undefined) {
            this.finishOverlay(args, this.overlayState.currentCell, [0, 0]);
        }

        const renderer = args.getCellRenderer(cell);
        const editorResult = renderer?.provideEditor?.({ ...cell, location: mangledLocation });
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
            maxHeight: `calc(100vh - ${cellRect.y}px - 10px)`,
        } satisfies Partial<CSSStyleDeclaration>);
        // Phase 6: source's second `makeCSSStyle` application site
        // (`data-grid-overlay-editor.tsx:237`) -- the overlay container carries this *cell's*
        // fully-merged theme as `--gdg-*` variables, so editor DOM (and any consumer CSS targeting
        // it) can style itself from the same values the canvas drew that cell with.
        this.applyThemeCssVariables(container, theme);

        const realLocation: Item = [mCol - args.rowMarkerOffset, mRow];
        const state: OverlayState = {
            realLocation,
            mangledLocation,
            container,
            // `handle` is assigned immediately below -- `editorFn` is called synchronously and
            // never reads `state.handle` itself, only `onFinishedEditing`/`onChange` do, and those
            // can't fire before `editorFn` returns. Cast avoids a chicken-and-egg `undefined` slot.
            handle: undefined as unknown as CellEditorHandle,
            currentCell: cell,
            // 9g: source validates the *initial* value too, so an editor opened over an
            // already-invalid cell starts out unable to commit (`data-grid-overlay-editor.tsx:82`).
            isValid: applyCellValidation(realLocation, cell, cell, args.validateCell).isValid,
            lastValue: cell,
            finished: false,
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
                const validation = applyCellValidation(
                    state.realLocation,
                    newValue,
                    state.lastValue,
                    args.validateCell
                );
                state.isValid = validation.isValid;
                state.currentCell = validation.value;
                state.lastValue = validation.value;
            },
            onFinishedEditing: (newValue, movement) => {
                this.finishOverlay(args, newValue, movement ?? [0, 0]);
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
        // Must run after insertion -- an unattached element has no meaningful bounding rect and
        // `IntersectionObserver` would never fire for it.
        state.stopStayOnScreen = this.setupStayOnScreen(container);

        // Keyboard activation has no remaining pointer gesture that can steal the caret, so focus
        // immediately. This is important for edit-on-type: the initial key seeds the editor, and
        // the next typed character must already reach its textarea. Pointer activation remains
        // deferred because the activating mouseup can otherwise collapse the editor's select-all.
        if (focusImmediately) {
            handle.focus();
        } else {
            window.setTimeout(() => {
                if (this.overlayState === state) handle.focus();
            }, 0);
        }

        // Click-outside commits (mirrors source's `ClickOutsideContainer` -> `onClickOutside` ->
        // save, not cancel). Registered on the next tick rather than synchronously: this method is
        // always called from within a native event dispatch (a mouseup that activated a cell, or a
        // keydown), and adding a capture-phase `window` listener mid-dispatch must not risk catching
        // that same gesture.
        window.setTimeout(() => {
            if (this.overlayState === state) {
                window.addEventListener("mousedown", this.onOverlayOutsideClick, true);
            }
        }, 0);
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
    private setupStayOnScreen(container: HTMLDivElement): () => void {
        if (typeof IntersectionObserver === "undefined") return () => undefined;

        let offset = 0;
        let rafHandle: number | undefined;

        const step = (): void => {
            rafHandle = undefined;
            const { right } = container.getBoundingClientRect();
            // Never push the editor *right* past its anchor cell: source clamps at 0 too, so a
            // narrow editor already on screen is left exactly where the cell rect put it.
            const next = Math.min(offset + window.innerWidth - right - 10, 0);
            if (Math.abs(next - offset) < 0.5) return;
            offset = next;
            container.style.transform = `translateX(${offset}px)`;
            rafHandle = requestAnimationFrame(step);
        };

        const observer = new IntersectionObserver(
            entries => {
                const entry = entries[entries.length - 1];
                if (entry === undefined || entry.isIntersecting) return;
                if (rafHandle === undefined) rafHandle = requestAnimationFrame(step);
            },
            { threshold: 1 }
        );
        observer.observe(container);

        return () => {
            observer.disconnect();
            if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
        };
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
            const { mappedColumns } = this.computeMangledLayout(args);
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
    private deleteSelection(args: ResolvedGridHostArgs): void {
        const target = this.resolveDeleteTarget(args);
        if (target === undefined) return;
        const region = this.selectedRegion(args, target);
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
                const cleared = renderer?.onDelete?.(cell) ?? this.clearedCellValue(cell);
                if (cleared !== undefined) {
                    edits.push({ location: [realCol, row], value: cleared });
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
    private resolveDeleteTarget(args: ResolvedGridHostArgs): MangledSelection | undefined {
        const onDelete = args.onDelete;
        if (onDelete === undefined) return this.mangledSelection(args);
        const result = onDelete(this.selection);
        if (result === false) return undefined;
        if (result === true) return this.mangledSelection(args);
        return mangleSelection(asConsumerSelection(result), args.rowMarkerOffset);
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

        // Ctrl(Cmd)+F: toggle search (Phase 9e). Mirrors source's `keys.search` binding, which
        // opens but does not close; closing on a second press is this port's own small addition,
        // since without a bar on screen there would otherwise be no way back out via the keyboard.
        // Placed with select-all, above the "no current cell" guard, for the same reason: search
        // must work on a grid nothing has been clicked in yet.
        if (primary && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "f") {
            if (this.searchIsOpen(this.resolveArgs())) {
                this.closeSearch();
            } else {
                this.openSearch();
            }
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }

        // Escape closes search when it is open and no overlay editor has claimed the key (the
        // early-out above already returned in that case).
        if (ev.key === "Escape" && this.searchIsOpen(this.resolveArgs())) {
            this.closeSearch();
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }

        // Cell activation (Phase 4a) -- Enter, Delete/Backspace, and type-to-overwrite. All three
        // are no-ops with nothing selected, mirroring source's early-outs for the same keys.
        const activationArgs = this.resolveArgs();
        // `activateCell`/`mangledGetCellContent` both work in the render engine's column space.
        const activationCurrent = this.mangledSelection(activationArgs).current;
        if (activationCurrent !== undefined) {
            const mangledLocation = activationCurrent.cell;

            if (ev.key === "Enter" && !primary && !ev.altKey) {
                const cellContent = this.mangledGetCellContent(activationArgs)(mangledLocation);
                this.activateCell(activationArgs, mangledLocation, cellContent, {
                    highlight: true,
                    activation: { inputType: "keyboard", key: ev.key },
                });
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
                activationArgs.editOnType &&
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
                        activation: { inputType: "keyboard", key: ev.key },
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
        const args = this.resolveArgs();
        // Mangled: every `targetCol` below is clamped against `args.rowMarkerOffset` /
        // `mappedColumns.length` and handed to `moveActiveCell`, all of which are mangled space.
        const navCurrent = this.mangledSelection(args).current;
        if (navCurrent === undefined) return;
        const [col, row] = navCurrent.cell;

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
        // Mirrors source's `moved || !cancelOnlyOnMove || trapFocus` gate -- an already-at-the-edge
        // nav key is left alone (not prevented) rather than swallowed, so focus can tab out of the
        // grid, unless `trapFocus` says otherwise.
        if (moved || args.trapFocus) {
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

        // `colIn` is mangled (callers: keyboard nav, overlay-editor movement, search navigation),
        // so the whole method is.
        const mangledSelection = this.mangledSelection(args);
        const current = mangledSelection.current;
        if (current !== undefined && current.cell[0] === col && current.cell[1] === row) return false;

        const result = setCurrentSelection(
            mangledSelection,
            { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 } },
            true,
            false,
            "keyboard-nav",
            this.selectionOptions(args)
        );
        this.applyMangledSelection(args, result.selection);
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
            mangledSelection,
            { cell: current.cell, range: { x: left, y: top, width: right - left, height: bottom - top } },
            true,
            false,
            "keyboard-select",
            this.selectionOptions(args)
        );
        this.applyMangledSelection(args, result.selection);

        // Scroll the edge that actually moved into view (mirrors source's per-branch `scrollTo`
        // calls in `adjustSelection`), not the anchor cell.
        const edgeCol = dx === 1 ? right - 1 : dx === -1 ? left : col;
        const edgeRow = dy === 1 ? bottom - 1 : dy === -1 ? top : row;
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
    private selectAll(args: ResolvedGridHostArgs): void {
        const current = this.selection.current;
        this.applySelection(
            asConsumerSelection({
                columns: CompactSelection.empty(),
                rows: CompactSelection.empty(),
                current: {
                    cell: current?.cell ?? [0, 0],
                    range: { x: 0, y: 0, width: args.columns.length, height: args.rows },
                    rangeStack: [],
                },
            })
        );
    }

    // --- search (Phase 9e) -------------------------------------------------------------------
    // Port of source's `DataGridSearch`, minus the UI. Source fuses scanner, state and overlay into
    // one React component; here the scanner is `rendering/search.ts` (pure, unit-tested), this
    // section is the state and wiring, and the UI is the opt-in `<GlideSearchBar>`.
    //
    // Every piece of state below has a controlled arg and an uncontrolled fallback, mirroring
    // source's `showSearchIn ?? showSearchInner` pattern -- so search works out of the box with no
    // args set at all, and a consumer can take over any individual piece without taking over all.

    private searchOpenInner = false;
    private searchValueInner = "";
    private searchResultsInner: CellList = [];
    private searchSelectedIndex = -1;
    private searchStatus: SearchStatus | undefined;
    private search: IncrementalSearch | undefined;
    /** Guards the "select and scroll to the active match" side effect so it runs only when the
     *  navigated match actually changes. Source keeps the same guard (`lastSent`) because the
     *  results callback fires on every streamed chunk, not only on navigation. */
    private lastNavigatedTo: Item | undefined;

    private searchIsOpen(args: ResolvedGridHostArgs): boolean {
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
    private effectivePrelightCells(args: ResolvedGridHostArgs): CellList | undefined {
        if (!this.searchIsOpen(args)) return args.prelightCells;
        const results = this.effectiveSearchResults(args);
        return results.length > 0 ? results : args.prelightCells;
    }

    private searchQuery(args: ResolvedGridHostArgs): string {
        return args.searchValue ?? this.searchValueInner;
    }

    /** The results actually in effect: a consumer's own if supplied, else the scanner's. */
    private effectiveSearchResults(args: ResolvedGridHostArgs): CellList {
        return args.searchResults ?? this.searchResultsInner;
    }

    private searchSnapshot(args: ResolvedGridHostArgs): SearchState {
        return {
            isOpen: this.searchIsOpen(args),
            value: this.searchQuery(args),
            results: this.effectiveSearchResults(args),
            selectedIndex: this.searchSelectedIndex,
            rowsSearched: this.searchStatus?.rowsSearched ?? 0,
            rows: args.rows,
            status: this.searchStatus,
        };
    }

    private emitSearchState(args: ResolvedGridHostArgs): void {
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
    private searchChunkMangled(args: ResolvedGridHostArgs, startRow: number, height: number): CellArray | undefined {
        const offset = args.rowMarkerOffset;
        const cells = this.cellsForSelectionSync(args, {
            x: 0,
            y: startRow,
            width: args.columns.length,
            height,
        });
        if (cells === undefined) return undefined;
        if (offset === 0) return cells;
        const marker: GridCell = { kind: GridCellKind.Loading, allowOverlay: false };
        return cells.map(row => [marker, ...row]);
    }

    private beginSearch(args: ResolvedGridHostArgs, query: string): void {
        this.search?.cancel();
        this.searchSelectedIndex = -1;
        this.lastNavigatedTo = undefined;

        // A consumer supplying `searchResults` owns matching entirely -- do not also scan.
        if (args.searchResults !== undefined) {
            this.searchStatus = { rowsSearched: args.rows, results: args.searchResults.length };
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
            },
        });
        this.searchStatus = undefined;
        this.searchResultsInner = [];
        this.search.start(query);
        this.emitSearchState(args);
    }

    /** Hands results to the consumer in *their* coordinate space, and -- unless they've taken over
     *  navigation by supplying `onSearchResultsChanged` -- selects and scrolls to the active match. */
    private notifySearchResults(args: ResolvedGridHostArgs): void {
        const results = this.effectiveSearchResults(args);
        const index = this.searchSelectedIndex;

        if (args.onSearchResultsChanged !== undefined) {
            const offset = args.rowMarkerOffset;
            args.onSearchResultsChanged(
                offset === 0 ? results : results.map(([col, row]) => [col - offset, row] as Item),
                index
            );
            return;
        }

        if (index < 0 || index >= results.length) return;
        const [col, row] = results[index]!;
        if (this.lastNavigatedTo?.[0] === col && this.lastNavigatedTo[1] === row) return;
        this.lastNavigatedTo = [col, row];
        this.moveActiveCell(args, col, row);
    }

    /** Opens search. Idempotent. */
    public openSearch(): void {
        const args = this.resolveArgs();
        if (this.searchIsOpen(args)) return;
        this.searchOpenInner = true;
        this.emitSearchState(args);
    }

    /** Closes search, clearing results and cancelling any scan. Mirrors source's `onClose`. */
    public closeSearch(): void {
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
    public setSearchValue(value: string): void {
        const args = this.resolveArgs();
        this.searchValueInner = value;
        args.onSearchValueChange?.(value);
        this.beginSearch(args, value);
    }

    /** Moves to the next match, wrapping. No-op with no results. */
    public searchNext(): void {
        this.stepSearch(1);
    }

    /** Moves to the previous match, wrapping. No-op with no results. */
    public searchPrev(): void {
        this.stepSearch(-1);
    }

    private stepSearch(delta: number): void {
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
    public getSearchState(): SearchState {
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
    public focus(): void {
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
    public getBounds(col?: number, row?: number): Rectangle | undefined {
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
                height: this.scrollerEl.scrollHeight,
            };
        }

        const args = this.resolveArgs();
        const { mappedColumns } = this.computeMangledLayout(args);
        const mangledCol = (col ?? 0) + args.rowMarkerOffset;
        // Source defaults the row to `-1`, the column header -- `getBounds(col)` with one argument
        // means "where is that column's header", which is what a header popover needs.
        const targetRow = row ?? -1;
        if (mangledCol < 0 || mangledCol >= mappedColumns.length) return undefined;
        if (targetRow < -2 || targetRow >= this.effectiveRows(args)) return undefined;

        const rect = this.computeCellRect(args, mangledCol, targetRow);
        if (rect.width === 0 || rect.height === 0) return undefined;
        return { x: rect.x + rootRect.x, y: rect.y + rootRect.y, width: rect.width, height: rect.height };
    }

    /**
     * Scrolls a cell into view. `col`/`row` are in consumer space.
     *
     * `params` covers source's `dir`/`paddingX`/`paddingY`/`hAlign`/`vAlign`; `behavior` is
     * `"smooth"` or `"auto"`. Source's `{amount, unit: "px"}` column/row form is **not ported** --
     * see `GlideDataGridApi.scrollTo`.
     */
    public scrollTo(col: number, row: number, params?: ScrollToParams & { behavior?: ScrollBehavior }): void {
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

    private scrollToSmooth(args: ResolvedGridHostArgs, mangledCol: number, row: number, params: ScrollToParams): void {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        if (mangledCol < 0 || mangledCol >= mappedColumns.length || row < 0 || row >= this.effectiveRows(args)) return;
        const target = this.computeCellRect(args, mangledCol, row);
        if (target.width === 0 || target.height === 0) return;
        const delta = computeScrollDelta(
            {
                target,
                width: this.width,
                height: this.height,
                frozenWidth: getStickyWidth(mappedColumns),
                headerHeight: this.totalHeaderHeight(args),
            },
            { ...params, targetColumnIsFrozen: mangledCol < freezeColumns }
        );
        if (delta.x === 0 && delta.y === 0) return;
        this.scrollerEl.scrollTo({
            left: this.scrollerEl.scrollLeft + delta.x,
            top: this.scrollerEl.scrollTop + delta.y,
            behavior: "smooth",
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
    public remeasureColumns(cols: Iterable<number>): void {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        const onColumnResize = args.onColumnResize;
        if (onColumnResize === undefined) return;

        const ctx = this.canvasEl.getContext("2d");
        if (ctx === null) return;

        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        const visible = this.computeVisibleRegion(args, mappedColumns, freezeColumns);
        const theme = this.mergedTheme(args);
        // Source samples the visible rows only (`visibleRegionRef`), not the whole grid -- measuring
        // a million rows on demand is not something an API call may do.
        const height = Math.min(visible.height, args.rows - visible.y);

        for (const col of cols) {
            const column = args.columns[col];
            if (column === undefined) continue;
            const sample =
                height > 0 ? this.cellsForSelectionSync(args, { x: col, y: visible.y, width: 1, height }) : [];
            if (sample === undefined) continue; // consumer answered asynchronously; nothing to measure
            // `measureColumn` indexes each sampled row by column index, and the sample above is one
            // column wide, so the index within it is always 0 -- not `col`.
            const previousFont = ctx.font;
            ctx.font = theme.baseFontFull;
            const width = measureColumn(ctx, theme, column, 0, sample, args.getCellRenderer, {
                minColumnWidth: args.minColumnWidth,
                maxColumnWidth: args.maxColumnWidth,
                removeOutliers: false,
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
    public getMouseArgsForPosition(clientX: number, clientY: number, ev?: MouseEvent): GridMouseEventArgs | undefined {
        if (this.destroyed) return undefined;
        const args = this.resolveArgs();
        const hit = this.resolveHitAtPoint(args, clientX, clientY, ev);
        const item: Item | undefined = hit.kind === "out-of-bounds" ? undefined : hit.location;
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
            localY: hit.localY,
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
    public async appendRow(col: number, openOverlay = true, behavior?: ScrollBehavior): Promise<void> {
        if (this.destroyed) return;
        const args = this.resolveArgs();
        const mangledCol = col + args.rowMarkerOffset;
        // A column that opts out of the trailing row opts out of being appended into, same guard
        // source applies first (`:1690`).
        const { mappedColumns } = this.computeMangledLayout(args);
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
    public async appendColumn(row: number, openOverlay = true): Promise<void> {
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
    private waitForGrowth(read: () => number, before: number): Promise<number | undefined> {
        return new Promise(resolve => {
            let backoff = 0;
            const check = (): void => {
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
    private resolveNewRowTargetColumn(args: ResolvedGridHostArgs, mangledCol: number): number {
        return resolveNewRowTarget(
            args.columns,
            args.trailingRowOptions?.targetColumn,
            mangledCol - args.rowMarkerOffset
        );
    }

    /** Shared tail of `appendRow`/`appendColumn`: scroll it into view, select it, optionally open
     *  its editor. `mangledCol` is mangled; `row` is a row index. */
    private focusAppended(mangledCol: number, row: number, openOverlay: boolean, behavior?: ScrollBehavior): void {
        const args = this.resolveArgs();
        this.scrollTo(mangledCol - args.rowMarkerOffset, row, behavior === undefined ? undefined : { behavior });
        this.applyMangledSelection(
            args,
            setCurrentSelection(
                this.mangledSelection(args),
                { cell: [mangledCol, row], range: { x: mangledCol, y: row, width: 1, height: 1 } },
                false,
                false,
                "edit",
                this.selectionOptions(args)
            ).selection
        );
        if (!openOverlay) return;
        const cellContent = this.mangledGetCellContent(args)([mangledCol, row]);
        if (isInnerOnlyCellKind(cellContent.kind)) return;
        const cell = cellContent as GridCell;
        if (!cell.allowOverlay || !isReadWriteCell(cell) || cell.readonly === true) return;
        // Source defers a frame so the scroll it just requested has a chance to land before the
        // overlay measures the cell it is positioning itself over (`data-editor.tsx:1733-1735`).
        window.setTimeout(() => {
            if (this.destroyed) return;
            const liveArgs = this.resolveArgs();
            this.activateCell(liveArgs, [mangledCol, row], this.mangledGetCellContent(liveArgs)([mangledCol, row]), {
                highlight: true,
                activation: { inputType: "keyboard", key: "Enter" },
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
    public emit(event: "delete"): void {
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
    private scrollCellIntoView(args: ResolvedGridHostArgs, col: number, row: number, params?: ScrollToParams): void {
        const { mappedColumns, freezeColumns } = this.computeMangledLayout(args);
        if (col < 0 || col >= mappedColumns.length || row < 0 || row >= this.effectiveRows(args)) return;

        const target = this.computeCellRect(args, col, row);
        // A cell that is scrolled entirely out of the drawn region gets a zero-size rect back;
        // scrolling to it would land on the origin, so source bails (`data-editor.tsx:1547`).
        if (target.width === 0 || target.height === 0) return;

        const delta = computeScrollDelta(
            {
                target,
                width: this.width,
                height: this.height,
                frozenWidth: getStickyWidth(mappedColumns),
                headerHeight: this.totalHeaderHeight(args),
            },
            { ...params, targetColumnIsFrozen: col < freezeColumns }
        );

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
    private selectedRegion(
        args: ResolvedGridHostArgs,
        // 9g: `onDelete` may answer with a *different* selection to clear, so the region has to be
        // computable from something other than the live one. Defaults to the live selection.
        selection?: MangledSelection
    ): { colStart: number; colEnd: number; rowStart: number; rowEnd: number } | undefined {
        const sel = selection ?? this.mangledSelection(args);
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
    private cellsForSelectionSync(args: ResolvedGridHostArgs, rect: Rectangle): CellArray | undefined {
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

    private buildCopyBuffer(args: ResolvedGridHostArgs): { textPlain: string; textHtml: string } | undefined {
        const region = this.selectedRegion(args);
        if (region === undefined) return undefined;
        // Row-marker column (if any) is never a real data column -- exclude it from the copied
        // region entirely rather than emitting a placeholder cell for it.
        const colStart = Math.max(region.colStart, args.rowMarkerOffset);
        if (colStart >= region.colEnd || region.rowStart >= region.rowEnd) return undefined;

        const columnIndexes: number[] = [];
        for (let col = colStart; col < region.colEnd; col++) columnIndexes.push(col - args.rowMarkerOffset);

        // Consumer coordinate space: strip the row-marker offset before asking.
        const cells = this.cellsForSelectionSync(args, {
            x: colStart - args.rowMarkerOffset,
            y: region.rowStart,
            width: region.colEnd - colStart,
            height: region.rowEnd - region.rowStart,
        });

        if (cells === undefined) {
            // The consumer's `getCellsForSelection` answered with a thunk. We cannot await it: this
            // runs inside a `copy` event, and `clipboardData.setData` stops working once the handler
            // has awaited. Fall back to the synchronous per-cell sweep, which at worst yields the
            // Loading cells a paged source would report for unloaded rows -- strictly better than
            // silently writing nothing to the clipboard. Documented on `GridHostArgs`.
            const fallback: GridCell[][] = [];
            for (let row = region.rowStart; row < region.rowEnd; row++) {
                const rowCells: GridCell[] = [];
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
    private withCopyHeaders(args: ResolvedGridHostArgs, cells: CellArray, columnIndexes: readonly number[]): CellArray {
        if (!args.copyHeaders) return cells;
        return [copyHeaderRow(args.columns, columnIndexes), ...cells];
    }

    // Coerces a parsed paste buffer entry into a replacement `GridCell` matching `existing`'s kind.
    // The rules themselves moved to `rendering/paste-coercion.ts` in Phase 9g so they could be unit
    // tested (this class can't be imported from vitest); this wrapper is just the two args the
    // coercion needs plucked off `ResolvedGridHostArgs`.
    private pasteValueIntoCell(args: ResolvedGridHostArgs, existing: GridCell, buf: CellBuffer): GridCell | undefined {
        return coercePasteCell(existing, buf, args.getCellRenderer, args.coercePasteValue);
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
        // 9g: cut is copy + delete, so it runs through the same `onDelete` gate source puts on it
        // (`data-editor.tsx:3898`) -- a consumer that vetoes deletion vetoes the clearing half of a
        // cut too, and the copy half still happened.
        const target = this.resolveDeleteTarget(args);
        if (target === undefined) return;
        const region = this.selectedRegion(args, target);
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
        // Mangled, so the `- args.rowMarkerOffset` in the loop below (and the marker-column
        // fallbacks here) stay exactly as they were.
        const sel = this.mangledSelection(args);
        let anchorCol: number;
        let anchorRow: number;
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
