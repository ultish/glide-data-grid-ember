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
export type { GetRowThemeCallback } from "./render/data-grid-render.cells.ts";

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
export { getCopyBufferContents, decodeHTML, unquote } from "./copy-paste.ts";
export type { CellBuffer, StringArrayCellBuffer, BasicCellBuffer, CopyBuffer } from "./copy-paste.ts";

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
    GridKeyEventArgs,
    CellActivatedEventArgs,
} from "./event-args.ts";
