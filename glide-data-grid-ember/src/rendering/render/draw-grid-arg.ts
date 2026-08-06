import type { GetCellRendererCallback } from "../cell-types.ts";
import type { RenderStateProvider } from "../common/render-state-provider.ts";
import type { FullTheme } from "../theme.ts";
import type { HoverValues } from "../animation-manager.ts";
import type { MappedGridColumn } from "./data-grid-lib.ts";
import type { BlitData } from "./data-grid-render.blit.ts";
import type { SpriteManager } from "../data-grid-sprites.ts";
import type {
    CompactSelection,
    GridSelection,
    Item,
    InnerGridCell,
    DrawHeaderCallback,
    CellList,
    DrawCellCallback,
    FillHandle,
    CSSCursorValue,
} from "../data-grid-types.ts";
import type { CellSet } from "../cell-set.ts";
import type { ImageWindowLoader } from "../image-window-loader-interface.ts";
import type { GroupDetailsCallback, GetRowThemeCallback, Highlight } from "./data-grid-render.cells.ts";

export type HoverInfo = readonly [Item, readonly [number, number]];

// Phase 1 note: `EnqueueCallback` originally lived in use-animation-queue.ts alongside the
// `useAnimationQueue` React hook. The hook itself is out of scope (later phase), but this one-line,
// framework-neutral type alias is needed by the render engine's draw-loop signatures, so it is
// defined here instead of pulling in the hook file.
export type EnqueueCallback = (item: Item) => void;

// Phase 1 note: source typed this as `React.MutableRefObject<BlitData | undefined>`, a mutable box
// with a single `.current` property. That shape has nothing React-specific about it (Ember's
// reactivity wiring in a later phase can supply any object satisfying this shape), so it is
// declared locally here rather than depending on React's type.
export interface MutableRefObject<T> {
    current: T;
}

export interface DragAndDropState {
    src: number;
    dest: number;
}

export interface DrawGridArg {
    readonly canvasCtx: CanvasRenderingContext2D;
    readonly headerCanvasCtx: CanvasRenderingContext2D;
    readonly bufferACtx: CanvasRenderingContext2D;
    readonly bufferBCtx: CanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;
    readonly cellXOffset: number;
    readonly cellYOffset: number;
    readonly translateX: number;
    readonly translateY: number;
    readonly mappedColumns: readonly MappedGridColumn[];
    readonly enableGroups: boolean;
    readonly freezeColumns: number;
    readonly dragAndDropState: DragAndDropState | undefined;
    readonly theme: FullTheme;
    readonly headerHeight: number;
    readonly groupHeaderHeight: number;
    readonly disabledRows: CompactSelection;
    readonly rowHeight: number | ((index: number) => number);
    readonly verticalBorder: (col: number) => boolean;
    readonly isResizing: boolean;
    readonly resizeCol: number | undefined;
    readonly isFocused: boolean;
    readonly drawFocus: boolean;
    readonly selection: GridSelection;
    readonly fillHandle: FillHandle;
    readonly freezeTrailingRows: number;
    readonly hasAppendRow: boolean;
    readonly hyperWrapping: boolean;
    readonly rows: number;
    readonly getCellContent: (cell: Item) => InnerGridCell;
    readonly overrideCursor: (cursor: CSSCursorValue) => void;
    readonly getGroupDetails: GroupDetailsCallback;
    readonly getRowThemeOverride: GetRowThemeCallback | undefined;
    readonly drawHeaderCallback: DrawHeaderCallback | undefined;
    readonly drawCellCallback: DrawCellCallback | undefined;
    readonly prelightCells: CellList | undefined;
    readonly highlightRegions: readonly Highlight[] | undefined;
    readonly imageLoader: ImageWindowLoader;
    readonly lastBlitData: MutableRefObject<BlitData | undefined>;
    readonly damage: CellSet | undefined;
    readonly hoverValues: HoverValues;
    readonly hoverInfo: HoverInfo | undefined;
    readonly spriteManager: SpriteManager;
    readonly maxScaleFactor: number;
    readonly touchMode: boolean;
    readonly renderStrategy: "single-buffer" | "double-buffer" | "direct";
    readonly enqueue: EnqueueCallback;
    readonly renderStateProvider: RenderStateProvider;
    readonly getCellRenderer: GetCellRendererCallback;
    readonly minimumCellWidth: number;
    readonly resizeIndicator: "full" | "header" | "none";
}
