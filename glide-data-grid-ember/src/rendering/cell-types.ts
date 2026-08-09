// Adapted from packages/core/src/cells/cell-types.ts for the Ember port.
//
// Phase 1 scope note: this file mixes the pure drawing-argument contracts consumed by the render
// engine (BaseDrawArgs, DrawArgs, PrepResult, DrawCallback, DrawStateTuple) with the cell renderer
// registry contract (BaseCellRenderer/InternalCellRenderer/CustomRenderer/CellRenderer/
// GetCellRendererCallback). The registry types are kept because `GetCellRendererCallback` is
// imported directly by the render engine (data-grid-render.cells.ts, draw-grid-arg.ts) -- but they
// are otherwise inert type declarations here; the concrete cell renderers themselves (text, number,
// boolean, etc.) are Phase 4.
import type { SpriteManager } from "./data-grid-sprites.ts";
import type {
    InnerGridCell,
    Rectangle,
    CustomCell,
    ProvideEditorCallback,
    BooleanEmpty,
    BooleanIndeterminate,
    Item,
    CSSCursorValue,
} from "./data-grid-types.ts";
import type { FullTheme } from "./theme.ts";
import type { ImageWindowLoader } from "./image-window-loader-interface.ts";
import type { BaseGridMouseEventArgs } from "./event-args.ts";

export interface BaseDrawArgs {
    ctx: CanvasRenderingContext2D;
    theme: FullTheme;
    col: number;
    row: number;
    rect: Rectangle;
    highlighted: boolean;
    hoverAmount: number;
    hoverX: number | undefined;
    hoverY: number | undefined;
    cellFillColor: string;
    imageLoader: ImageWindowLoader;
    spriteManager: SpriteManager;
    hyperWrapping: boolean;
    cell: InnerGridCell;
}

/** @category Drawing */

export type DrawStateTuple = [unknown, (state: unknown) => void];

export interface DrawArgs<T extends InnerGridCell> extends BaseDrawArgs {
    cell: T;
    requestAnimationFrame: (state?: unknown) => void;
    drawState: DrawStateTuple;
    frameTime: number;
    overrideCursor: ((cursor: CSSCursorValue) => void) | undefined;
}

// intentionally mutable
/** @category Drawing */
export interface PrepResult {
    font: string | undefined;
    fillStyle: string | undefined;
    renderer: object;
    deprep: ((args: Pick<BaseDrawArgs, "ctx">) => void) | undefined;
}

/** @category Renderers */
export type DrawCallback<T extends InnerGridCell> = (args: DrawArgs<T>, cell: T) => void;
type PrepCallback = (args: BaseDrawArgs, lastPrep?: PrepResult) => Partial<PrepResult>;

interface BaseCellRenderer<T extends InnerGridCell> {
    // drawing
    readonly kind: T["kind"];
    readonly draw: DrawCallback<T>;
    readonly drawPrep?: PrepCallback;
    readonly needsHover?: boolean | ((cell: T) => boolean);
    readonly needsHoverPosition?: boolean;
    readonly measure?: (ctx: CanvasRenderingContext2D, cell: T, theme: FullTheme) => number;

    // editing
    readonly provideEditor?: ProvideEditorCallback<T>;

    // event callbacks
    readonly onClick?: (
        args: {
            readonly cell: T;
            readonly posX: number;
            readonly posY: number;
            readonly bounds: Rectangle;
            readonly location: Item;
            readonly theme: FullTheme;
            readonly preventDefault: () => void;
        } & BaseGridMouseEventArgs
    ) => T | undefined;

    readonly onSelect?: (
        args: {
            readonly cell: T;
            readonly posX: number;
            readonly posY: number;
            readonly bounds: Rectangle;
            readonly theme: FullTheme;
            readonly preventDefault: () => void;
        } & BaseGridMouseEventArgs
    ) => void;
    readonly onDelete?: (cell: T) => T | undefined;
}

/** @category Renderers */
export interface InternalCellRenderer<T extends InnerGridCell> extends BaseCellRenderer<T> {
    readonly useLabel?: boolean;
    readonly getAccessibilityString: (cell: T) => string;
    readonly onPaste: (
        val: string,
        cell: T,
        details: {
            // fixme this should become the only argument
            readonly rawValue: string | string[] | number | boolean | BooleanEmpty | BooleanIndeterminate;
            readonly formatted?: string | string[];
            readonly formattedString?: string; // convenience
        }
    ) => T | undefined;
}

/** @category Renderers */
export interface CustomRenderer<T extends CustomCell = CustomCell> extends BaseCellRenderer<T> {
    readonly isMatch: (cell: CustomCell) => cell is T;
    readonly onPaste?: (val: string, cellData: T["data"]) => T["data"] | undefined;
}

/** @category Renderers */
export type CellRenderer<T extends InnerGridCell> = [T] extends [CustomCell<infer DataType>]
    ? CustomRenderer<CustomCell<DataType>>
    : InternalCellRenderer<T>;

/** @category Renderers */
export type GetCellRendererCallback = <T extends InnerGridCell>(cell: T) => CellRenderer<T> | undefined;
