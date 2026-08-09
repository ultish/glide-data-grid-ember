// Public surface of the ported canvas rendering engine (Phase 1 of the Ember port).
//
// This barrel is intentionally not exhaustive -- later phases (Ember reactivity wiring, cell
// types, selection/copy-paste, theming) will refine what's re-exported here. It currently exposes
// the pieces needed to drive `drawGrid` from outside this directory.

// Core render entry point
export { drawGrid } from "./render/data-grid-render.ts";
export type { DrawGridArg, DragAndDropState, HoverInfo, EnqueueCallback, MutableRefObject } from "./render/draw-grid-arg.ts";
export type { BlitData } from "./render/data-grid-render.blit.ts";

// Column mapping / render-lib helpers
export { mapColumns } from "./render/data-grid-lib.ts";
export type { MappedGridColumn } from "./render/data-grid-lib.ts";

// Data model types used by the render engine
export type {
    GridCell,
    GridColumn,
    GridSelection,
    Item,
    Rectangle,
    Slice,
    InnerGridCell,
    InnerGridColumn,
    CellArray,
    GetCellsThunk,
    CellList,
    EditableGridCell,
    ReadWriteGridCell,
    BaseGridCell,
    BaseGridColumn,
    SizedGridColumn,
    AutoGridColumn,
    FillHandle,
    FillHandleConfig,
    FillHandleDirection,
    DrawHeaderCallback,
    DrawCellCallback,
    HoverEffectTheme,
    CustomCell,
    TextCell,
    NumberCell,
    BooleanCell,
    UriCell,
    MarkdownCell,
    LoadingCell,
    ProtectedCell,
    RowIDCell,
    BubbleCell,
    DrilldownCell,
    DrilldownCellData,
    EditListItem,
    SelectionRange,
    ValidatedGridCell,
    ProvideEditorCallback,
    ProvideEditorCallbackResult,
    ProvideEditorComponent,
    CellEditorProps,
    CellEditorHandle,
    // Phase 9g: `@cellActivationBehavior`'s union, and the per-cell override of the same name.
    CellActivationBehavior,
} from "./data-grid-types.ts";
export {
    GridCellKind,
    GridColumnIcon,
    GridColumnMenuIcon,
    InnerGridCellKind,
    CompactSelection,
    BooleanEmpty,
    BooleanIndeterminate,
    DEFAULT_FILL_HANDLE,
    isSizedGridColumn,
    isEditableGridCell,
    isReadWriteCell,
    isRectangleEqual,
    isObjectEditorCallbackResult,
    booleanCellIsEditable,
} from "./data-grid-types.ts";

// Cell-type registry (Phase 4a) -- concrete `InternalCellRenderer` implementations for
// text/number/boolean/loading/protected/row-id, and the `getCellRenderer: GetCellRendererCallback`
// dispatcher that replaces Phase 2's `-temp-text-cell-renderer.ts` stub.
export { getCellRenderer, toggleBoolean } from "./cells/index.ts";

// "Extra cells" (Phase 5a+) -- CustomRenderer-based cells ported from source's separate
// `packages/cells` package (sparkline/star/range/spinner in 5a; more added by later sub-phases),
// plus the `createCombinedCellRenderer` helper for composing them with the built-in registry
// above. See `src/rendering/extra-cells/index.ts` for the full architecture note.
export { createCombinedCellRenderer, allExtraCells } from "./extra-cells/index.ts";

// Cell-drawing contracts consumed by the render engine
export type {
    BaseDrawArgs,
    DrawArgs,
    PrepResult,
    GetCellRendererCallback,
    CellRenderer,
    InternalCellRenderer,
    CustomRenderer,
} from "./cell-types.ts";

// Theme
export type { Theme, FullTheme } from "./theme.ts";
export { getDataEditorTheme, getDataEditorDarkTheme, mergeAndRealizeTheme, makeCSSStyle } from "./theme.ts";
// Per-row theme override callback (Phase 6) -- `(row: number) => Partial<Theme> | undefined`.
// Defined next to the cell renderer that consumes it; re-exported here so consumers of
// `<GlideDataGrid @getRowThemeOverride={{...}}>` can type their callback without a deep import.
export type { GetRowThemeCallback, Highlight } from "./render/data-grid-render.cells.ts";

// Selection writer (Phase 3a) -- pure GridSelection transform functions, ported from source's
// `use-selection-behavior.ts` hook.
export { setCurrentSelection, setSelectedRows, setSelectedColumns } from "./selection-behavior.ts";
export type {
    SelectionBlending,
    RangeSelectMode,
    SelectionTrigger,
    SelectionBehaviorOptions,
    SetCurrentResult,
} from "./selection-behavior.ts";

// Copy/paste (Phase 3c) -- pure clipboard-buffer construction/parsing, ported from source's
// `data-editor/copy-paste.ts` (+ `unquote()` from `data-editor/data-editor-fns.ts`).
export { getCopyBufferContents, copyHeaderRow, decodeHTML, unquote } from "./copy-paste.ts";
export type { CellBuffer, StringArrayCellBuffer, BasicCellBuffer, CopyBuffer } from "./copy-paste.ts";

// Paste coercion + edit validation (Phase 9g). The rules `<GlideDataGrid>` runs internally, split
// out of `GridHostController` so they can be unit-tested; the callback *types* are the reason these
// are re-exported here, since `@coercePasteValue` / `@validateCell` are public args.
export { coercePasteCell, pasteBufferToString } from "./paste-coercion.ts";
export type { CoercePasteValueCallback } from "./paste-coercion.ts";
export { applyCellValidation } from "./validate-cell.ts";
export type { ValidateCellCallback, CellValidationResult } from "./validate-cell.ts";

// `scaleToRem` (Phase 9g). Exported for the same reason as the two above -- it is a pure rule with
// tests, and a consumer scaling their own chrome alongside the grid can reuse it.
export { remAdjustDimensions, measureRemSize, BASE_REM_SIZE } from "./rem-adjuster.ts";
export type { RemAdjustableDimensions } from "./rem-adjuster.ts";

// Click-vs-drag and click-activation rules (Phase 9g). `<GlideDataGrid>` applies these internally;
// exported because they are pure, tested, and the definition of what this addon calls a "click".
export { isValidClick, shouldActivateOnClick, resolvePointerActivation } from "./click-behavior.ts";
export type { ClickActivationArgs } from "./click-behavior.ts";
// The imperative API's pure halves (Phase 9f). `computeScrollDelta` is what
// `GlideDataGridApi.scrollTo` is built on -- `ScrollToParams` in particular is part of that public
// signature, so it has to be reachable from here.
export { computeScrollDelta } from "./scroll-to.ts";
export type { ScrollAlign, ScrollDirection, ScrollToParams, ScrollToViewport } from "./scroll-to.ts";
export { resolveNewRowTarget } from "./new-row-target.ts";
export type { NewRowTarget } from "./new-row-target.ts";

// Group-header click selection (Phase 7b/9f). The one selection in the grid a consumer can suppress
// from a click callback, because it is applied on mouseup rather than mousedown.
export { computeGroupHeaderSpan, computeGroupHeaderSelection } from "./group-header-selection.ts";
export type {
    GroupedColumnLike,
    GroupHeaderSelectionInput,
    GroupHeaderSelectionUpdate,
} from "./group-header-selection.ts";

// CSS-variable theming (Phase 9). Builds a `Theme` overlay from CSS custom properties resolved off
// a real element, and keeps it in sync as the page's theme changes -- the bridge that lets a
// DaisyUI/Tailwind app theme the grid. The addon has no DaisyUI dependency and no knowledge of it;
// see `css-theme.ts`'s header. `CssThemeWatcher` exists mainly to encode one non-obvious rule:
// publish a NEW theme object only on a real change, because `theme` is identity-compared by
// `computeCanBlit`.
export { CssThemeWatcher, themeFromCss, resolveCssColor, themeOverlaysEqual } from "./css-theme.ts";
export type { CssThemeMapping, ThemeColorKey, CssThemeWatcherOptions } from "./css-theme.ts";

// Search (Phase 9e) -- the engine only. `<GlideDataGrid>` drives all of this internally when a
// consumer sets `@showSearch`; these exports exist so a consumer can build their own search UI
// instead of using the opt-in `<GlideSearchBar>`, or reuse the matching rules elsewhere.
export {
    IncrementalSearch,
    getSearchTestString,
    makeSearchRegex,
    searchCellChunk,
    nextSearchStride,
    formatSearchStatus,
    TARGET_SEARCH_TIME_MS,
    MAX_SEARCH_RESULTS,
    INITIAL_SEARCH_STRIDE,
} from "./search.ts";
export type { SearchStatus, IncrementalSearchOptions } from "./search.ts";

// Autoscroll-while-dragging (Phase 9h) -- shared by drag-extend, row reorder and fill-handle drag.
// Ported from source's `use-autoscroll.ts`; exported so it can be unit-tested and reused, not
// because consumers are expected to drive it (`<GlideDataGrid>` wires it internally).
export { Autoscroller, computeScrollEdge, adjustDragLocationForScroll, scrollEdgesAreEqual, NO_SCROLL_EDGE } from "./autoscroll.ts";
export type { ScrollEdge, AutoscrollerOptions } from "./autoscroll.ts";

// Fill-handle drag-to-fill geometry (Phase 9h). `getClosestRect` turns "the pointer is here, the
// pattern source is there" into the region to fill; `combineRects` is what grows the selection to
// cover both once the drag commits.
export { getClosestRect, combineRects } from "./common/math.ts";
export { previewRowOrder, computeFillEdits } from "./drag-and-fill.ts";
export type { FillEditsArgs } from "./drag-and-fill.ts";

// Supporting engine pieces
export { CellSet } from "./cell-set.ts";
export { AnimationManager } from "./animation-manager.ts";
export type { HoverValues } from "./animation-manager.ts";
export { SpriteManager } from "./data-grid-sprites.ts";
// The built-in header-icon glyph set. `GridHostController` merges this into its `SpriteManager` by
// default, so a consumer only needs this to build a custom `headerIcons` map on top of it.
export { sprites } from "./sprites.ts";
export type { HeaderIconMap } from "./sprites.ts";
export type { HeaderIcon, Sprite, SpriteMap, SpriteVariant } from "./data-grid-sprites.ts";
export type { ImageWindowLoader } from "./image-window-loader-interface.ts";
export { default as ImageWindowLoaderImpl } from "./common/image-window-loader.ts";
export { RenderStateProvider } from "./common/render-state-provider.ts";
export type {
    BaseGridMouseEventArgs,
    GridMouseEventArgs,
    GridMouseCellEventArgs,
    GridMouseHeaderEventArgs,
    GridMouseGroupHeaderEventArgs,
    GridMouseOutOfBoundsEventArgs,
    GridKeyEventArgs,
    CellActivatedEventArgs,
    KeyboardCellActivatedEvent,
    PointerCellActivatedEvent,
    FillPatternEventArgs,
    // Phase 9g: the three click callbacks' event types. `PreventableEvent` is what distinguishes
    // them from the plain `GridMouse*EventArgs` above -- they carry a working `preventDefault()`.
    PreventableEvent,
    CellClickedEventArgs,
    HeaderClickedEventArgs,
    GroupHeaderClickedEventArgs,
} from "./event-args.ts";
// Value exports, not types: these are the discriminants of the `GridMouseEventArgs` union, so a
// consumer narrowing an `@onItemHovered` event needs them at runtime. Unexported until N2 landed,
// because until then nothing in this addon ever constructed that union.
export { headerKind, groupHeaderKind, outOfBoundsKind, OutOfBoundsRegionAxis } from "./event-args.ts";
