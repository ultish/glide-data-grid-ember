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
    EditListItem,
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
} from "./data-grid-types.ts";

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
export { getDataEditorTheme, mergeAndRealizeTheme } from "./theme.ts";

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
