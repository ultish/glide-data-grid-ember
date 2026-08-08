import has from "lodash/has.js";
import type { Theme, FullTheme } from "./theme.ts";
import { assertNever, proveType } from "./common/support.ts";
import type { SpriteManager } from "./data-grid-sprites.ts";
import type { BaseGridMouseEventArgs, CellActivatedEventArgs } from "./event-args.ts";
import type { ImageWindowLoader } from "./image-window-loader-interface.ts";

// Phase 1 note: the source imported `React` and `CSSProperties` from "react" for two purposes:
//  1. `cursor?: CSSProperties["cursor"]` on BaseGridCell -- narrowed to a plain string alias below.
//  2. The cell overlay editor contract (`ImageEditorType`, `ProvideEditorComponent`,
//     `portalElementRef`) -- these describe how a cell opens a DOM overlay editor, which is out of
//     scope until Phase 4. Their declarations are kept (so the rest of this file's types still
//     resolve) but redefined to `unknown` rather than invented as Ember equivalents.
/** CSS `cursor` value. Narrowed from React's `CSSProperties["cursor"]` since only the cursor
 * property itself is ever consumed by the render engine. */
export type CSSCursorValue = string;

// Thoughts:
// rows/columns are called out as selected, but when selected they must also be added
// to the range. Handling delete events may have different desired outcomes depending on
// how the range came to be selected. The rows/columns properties retain this essential
// information.
/** @category Selection */
export interface GridSelection {
    readonly current?: {
        readonly cell: Item;
        readonly range: Readonly<Rectangle>;
        readonly rangeStack: readonly Readonly<Rectangle>[]; // lowest to highest, does not include range
    };
    readonly columns: CompactSelection;
    readonly rows: CompactSelection;
}

/** @category Types */
// Phase 4: editor component contract, redefined for Ember
export type ImageEditorType = unknown;

/** @category Types */
export const BooleanEmpty = null;
/** @category Types */
export const BooleanIndeterminate = undefined;

/** @category Types */
export type BooleanEmpty = null;
/** @category Types */
export type BooleanIndeterminate = undefined;

/** @category Types */
export type DrawHeaderCallback = (
    args: {
        ctx: CanvasRenderingContext2D;
        column: GridColumn;
        columnIndex: number;
        theme: Theme;
        rect: Rectangle;
        hoverAmount: number;
        isSelected: boolean;
        isHovered: boolean;
        hasSelectedCell: boolean;
        spriteManager: SpriteManager;
        menuBounds: Rectangle;
        hoverX: number | undefined;
        hoverY: number | undefined;
    },
    drawContent: () => void
) => void;

/** @category Types */
export type DrawCellCallback = (
    args: {
        ctx: CanvasRenderingContext2D;
        cell: GridCell;
        theme: Theme;
        rect: Rectangle;
        col: number;
        row: number;
        hoverAmount: number;
        hoverX: number | undefined;
        hoverY: number | undefined;
        highlighted: boolean;
        imageLoader: ImageWindowLoader;
    },
    drawContent: () => void
) => void;

/** @category Cells */
export enum GridCellKind {
    Uri = "uri",
    Text = "text",
    Image = "image",
    RowID = "row-id",
    Number = "number",
    Bubble = "bubble",
    Boolean = "boolean",
    Loading = "loading",
    Markdown = "markdown",
    Drilldown = "drilldown",
    Protected = "protected",
    Custom = "custom",
}

/** @category Columns */
export enum GridColumnIcon {
    HeaderRowID = "headerRowID",
    HeaderCode = "headerCode",
    HeaderNumber = "headerNumber",
    HeaderString = "headerString",
    HeaderBoolean = "headerBoolean",
    HeaderAudioUri = "headerAudioUri",
    HeaderVideoUri = "headerVideoUri",
    HeaderEmoji = "headerEmoji",
    HeaderImage = "headerImage",
    HeaderUri = "headerUri",
    HeaderPhone = "headerPhone",
    HeaderMarkdown = "headerMarkdown",
    HeaderDate = "headerDate",
    HeaderTime = "headerTime",
    HeaderEmail = "headerEmail",
    HeaderReference = "headerReference",
    HeaderIfThenElse = "headerIfThenElse",
    HeaderSingleValue = "headerSingleValue",
    HeaderLookup = "headerLookup",
    HeaderTextTemplate = "headerTextTemplate",
    HeaderMath = "headerMath",
    HeaderRollup = "headerRollup",
    HeaderJoinStrings = "headerJoinStrings",
    HeaderSplitString = "headerSplitString",
    HeaderGeoDistance = "headerGeoDistance",
    HeaderArray = "headerArray",
    RowOwnerOverlay = "rowOwnerOverlay",
    ProtectedColumnOverlay = "protectedColumnOverlay",
}

/** @category Columns */
export enum GridColumnMenuIcon {
    Triangle = "triangle",
    Dots = "dots",
}

/** @category Types */
export type CellArray = readonly (readonly GridCell[])[];

/**
 * This type is used to specify the coordinates of
 * a cell or header within the dataset: positive row
 * numbers identify cells.
 *
 * - `-1`: Header
 * - `-2`: Group header
 * - `0 and higher`: Row index
 *
 * @category Types
 */
export type Item = readonly [col: number, row: number];

export interface BaseGridColumn {
    readonly title: string;
    readonly group?: string;
    readonly icon?: GridColumnIcon | string;
    readonly overlayIcon?: GridColumnIcon | string;
    readonly menuIcon?: GridColumnMenuIcon | string;
    readonly indicatorIcon?: GridColumnIcon | string;
    readonly hasMenu?: boolean;
    readonly grow?: number;
    readonly style?: "normal" | "highlight";
    readonly themeOverride?: Partial<Theme>;
    readonly trailingRowOptions?: {
        readonly hint?: string;
        readonly addIcon?: string;
        readonly targetColumn?: number | GridColumn;
        readonly themeOverride?: Partial<Theme>;
        readonly disabled?: boolean;
    };
}

/** @category Columns */
export function isSizedGridColumn(c: GridColumn): c is SizedGridColumn {
    return "width" in c && typeof c.width === "number";
}

/** @category Columns */
export interface SizedGridColumn extends BaseGridColumn {
    readonly width: number;
    readonly id?: string;
}

/** @category Columns */
export interface AutoGridColumn extends BaseGridColumn {
    readonly id: string;
}

/** @category Types */
export async function resolveCellsThunk(thunk: GetCellsThunk | CellArray): Promise<CellArray> {
    if (typeof thunk === "object") return thunk;
    return await thunk();
}

/** @category Types */
export type GetCellsThunk = () => Promise<CellArray>;

/** @category Columns */
export type GridColumn = SizedGridColumn | AutoGridColumn;

export type InnerColumnExtension = {
    growOffset?: number;
    rowMarker?: "square" | "circle";
    rowMarkerChecked?: BooleanIndeterminate | boolean;
    headerRowMarkerTheme?: Partial<Theme>;
    headerRowMarkerAlwaysVisible?: boolean;
    headerRowMarkerDisabled?: boolean;
};

/** @category Columns */
export type InnerGridColumn = SizedGridColumn & InnerColumnExtension;

// export type SizedGridColumn = Omit<GridColumn, "width"> & { readonly width: number };

/** @category Cells */
export type ReadWriteGridCell = TextCell | NumberCell | MarkdownCell | UriCell | CustomCell | BooleanCell;

/** @category Cells */
export type EditableGridCell = TextCell | ImageCell | BooleanCell | MarkdownCell | UriCell | NumberCell | CustomCell;

/** @category Cells */
export type EditableGridCellKind = EditableGridCell["kind"];

// All EditableGridCells are inherently ValidatedGridCells, and this is more specific and thus more useful.
/** @category Cells */
export function isEditableGridCell(cell: GridCell): cell is ValidatedGridCell {
    if (
        cell.kind === GridCellKind.Loading ||
        cell.kind === GridCellKind.Bubble ||
        cell.kind === GridCellKind.RowID ||
        cell.kind === GridCellKind.Protected ||
        cell.kind === GridCellKind.Drilldown
    ) {
        return false;
    }

    proveType<EditableGridCell>(cell);
    return true;
}

/** @category Cells */
export function isTextEditableGridCell(cell: GridCell): cell is ReadWriteGridCell {
    if (
        cell.kind === GridCellKind.Loading ||
        cell.kind === GridCellKind.Bubble ||
        cell.kind === GridCellKind.RowID ||
        cell.kind === GridCellKind.Protected ||
        cell.kind === GridCellKind.Drilldown ||
        cell.kind === GridCellKind.Boolean ||
        cell.kind === GridCellKind.Image ||
        cell.kind === GridCellKind.Custom
    ) {
        return false;
    }

    proveType<ReadWriteGridCell>(cell);
    return true;
}

/** @category Cells */
export function isInnerOnlyCell(cell: InnerGridCell): cell is InnerOnlyGridCell {
    return cell.kind === InnerGridCellKind.Marker || cell.kind === InnerGridCellKind.NewRow;
}

/** @category Cells */
export function isReadWriteCell(cell: GridCell): cell is ReadWriteGridCell {
    if (!isEditableGridCell(cell) || cell.kind === GridCellKind.Image) return false;

    switch (cell.kind) {
        case GridCellKind.Text:
        case GridCellKind.Number:
        case GridCellKind.Markdown:
        case GridCellKind.Uri:
        case GridCellKind.Custom:
        case GridCellKind.Boolean:
            return cell.readonly !== true;
        default:
            assertNever(cell, "A cell was passed with an invalid kind");
    }
}

/** @category Cells */
export type GridCell =
    | EditableGridCell
    | BubbleCell
    | RowIDCell
    | LoadingCell
    | ProtectedCell
    | DrilldownCell
    | CustomCell;

type InnerOnlyGridCell = NewRowCell | MarkerCell;
/** @category Cells */
export type InnerGridCell = GridCell | InnerOnlyGridCell;

/** @category Cells */
export type CellList = readonly Item[];

/** @category Types */
export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function isRectangleEqual(a: Rectangle | undefined, b: Rectangle | undefined): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export type CellActivationBehavior = "double-click" | "single-click" | "second-click";

/** @category Cells */
export interface BaseGridCell {
    readonly allowOverlay: boolean;
    readonly lastUpdated?: number;
    readonly style?: "normal" | "faded";
    readonly themeOverride?: Partial<Theme>;
    readonly span?: readonly [start: number, end: number];
    readonly contentAlign?: "left" | "right" | "center";
    readonly cursor?: CSSCursorValue;
    readonly copyData?: string;
    readonly activationBehaviorOverride?: CellActivationBehavior;
}

/** @category Cells */
export interface LoadingCell extends BaseGridCell {
    readonly kind: GridCellKind.Loading;
    readonly skeletonWidth?: number;
    readonly skeletonHeight?: number;
    readonly skeletonWidthVariability?: number;
}

/** @category Cells */
export interface ProtectedCell extends BaseGridCell {
    readonly kind: GridCellKind.Protected;
}

export interface HoverEffectTheme {
    bgColor: string;
    fullSize: boolean;
}

/** @category Cells */
export interface TextCell extends BaseGridCell {
    readonly kind: GridCellKind.Text;
    readonly displayData: string;
    readonly data: string;
    readonly readonly?: boolean;
    readonly allowWrapping?: boolean;
    readonly hoverEffect?: boolean;
    readonly hoverEffectTheme?: HoverEffectTheme;
}

/** @category Cells */
export interface NumberCell extends BaseGridCell {
    readonly kind: GridCellKind.Number;
    readonly displayData: string;
    readonly data: number | undefined;
    readonly readonly?: boolean;
    readonly fixedDecimals?: number;
    readonly allowNegative?: boolean;
    readonly thousandSeparator?: boolean | string;
    readonly decimalSeparator?: string;
    readonly hoverEffect?: boolean;
    readonly hoverEffectTheme?: HoverEffectTheme;
}

/** @category Cells */
export interface ImageCell extends BaseGridCell {
    readonly kind: GridCellKind.Image;
    readonly data: string[];
    readonly rounding?: number;
    readonly displayData?: string[]; // used for small images for faster scrolling
    readonly readonly?: boolean;
}

/** @category Cells */
export interface BubbleCell extends BaseGridCell {
    readonly kind: GridCellKind.Bubble;
    readonly data: string[];
}

/** @category Renderers */
export type SelectionRange = number | readonly [number, number];

/** @category Renderers */
// Phase 4a: editor component contract, redefined for Ember. Source's version described a React
// function component's props (onChange/onFinishedEditing/theme/portalElementRef/etc.) for
// rendering a DOM overlay editor over a cell, rendered via React itself. This port's overlay host
// (`GridHostController`'s `openOverlay`/activation machinery, `src/-private/grid-host-controller.ts`)
// is plain imperative DOM code, not a framework-rendered tree -- there is no Ember-component
// portal/mounting step anywhere in the overlay path -- so the natural equivalent contract is a
// plain factory function that builds and returns real DOM directly, not a declarative component.
// `CellEditorProps`/`CellEditorHandle` below are that contract. See PORTING-NOTES.md's Phase 4a
// section for the full rationale (including why `GrowingEntry`, ported from source's React
// component, is likewise a plain DOM-building class rather than a `.gts` component).
/** @category Renderers */
export interface CellEditorProps<T extends InnerGridCell> {
    /** The cell's current value while editing -- starts as the cell being edited (optionally
     * pre-seeded with a type-to-overwrite starting character), updated via `onChange`. */
    readonly value: T;
    /** `true` = select-all-on-focus (overwrite-by-typing UX); `false` = caret placed at the end. */
    readonly isHighlighted: boolean;
    /** The realized theme in effect for this cell (post `mergeAndRealizeTheme`). Not part of
     * source's editor props (source's editors read `ThemeContext` via `useTheme()` instead).
     *
     * **The CSS-custom-property channel this once said didn't exist now does** -- the overlay
     * container stamps this same merged theme as `--gdg-*` variables, and since the 9q stylesheet
     * migration the editors take their font and colours from those in CSS rather than from this
     * object. What remains genuinely useful here is theme values an editor needs in *JavaScript*:
     * measuring against `baseFontFull`, or feeding a value into a canvas draw. Prefer `var(--gdg-*)`
     * in the stylesheet over reading this field and assigning an inline style -- an inline style is
     * not restylable by the consuming app, which is the whole point of the migration. */
    readonly theme: FullTheme;
    /** Mirrors source's separate `validatedSelection` editor prop (`data-grid-overlay-editor.tsx`)
     * -- an explicit text-selection range to (re-)apply inside the editor, e.g. after a
     * `validateCell` callback adjusts the value. No Phase 4a cell renderer/overlay host code sets
     * this yet (no `validateCell` support is ported), but `GrowingEntry`-based editors already
     * consume it, so it's part of the contract now rather than bolted on later. */
    readonly validatedSelection?: SelectionRange;
    /** Called whenever the user changes the in-progress value (does not close the editor). */
    readonly onChange: (newValue: T) => void;
    /** Called to close the editor. `newValue === undefined` means cancel (discard any changes);
     * otherwise it's the value to commit. `movement` is `[dx, dy]` telling the grid which
     * direction to move the active cell afterwards (`[0,1]` = Enter, `[±1,0]` = Tab/Shift+Tab,
     * `[0,0]` = Escape/click-outside -- stay on the same cell). */
    readonly onFinishedEditing: (newValue: T | undefined, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
}

/** @category Renderers */
export interface CellEditorHandle {
    /** Root DOM node the overlay host appends into its positioned container. */
    readonly element: HTMLElement;
    /** Called once, right after `element` is attached to the DOM, to focus + (per
     * `CellEditorProps.isHighlighted`) select the editable content. */
    focus(): void;
    /** Called once when the overlay closes (commit or cancel) -- release listeners/resources. */
    destroy(): void;
}

/** @category Renderers */
export type ProvideEditorComponent<T extends InnerGridCell> = (props: CellEditorProps<T>) => CellEditorHandle;

type ObjectEditorCallbackResult<T extends InnerGridCell> = {
    editor: ProvideEditorComponent<T>;
    deletedValue?: (toDelete: T) => T;
    // Phase 4: editor style-override contract, redefined for Ember (was React's `CSSProperties`).
    // Still unused/unguessed -- no Phase 4a cell renderer sets `styleOverride`, and the overlay
    // host doesn't consume it yet (its own container styling is fixed, not per-cell-overridable).
    styleOverride?: unknown;
    disablePadding?: boolean;
    disableStyling?: boolean;
};

/** @category Renderers */
export type ProvideEditorCallbackResult<T extends InnerGridCell> =
    | (ProvideEditorComponent<T> & {
          disablePadding?: boolean;
          disableStyling?: boolean;
      })
    | ObjectEditorCallbackResult<T>
    | undefined;

/** @category Renderers */
export function isObjectEditorCallbackResult<T extends InnerGridCell>(
    obj: ProvideEditorCallbackResult<T>
): obj is ObjectEditorCallbackResult<T> {
    return has(obj, "editor");
}

/** @category Renderers */
export type ProvideEditorCallback<T extends InnerGridCell> = (
    cell: T & { location?: Item; activation?: CellActivatedEventArgs }
) => ProvideEditorCallbackResult<T>;

/** @category Cells */
export type ValidatedGridCell = EditableGridCell & {
    selectionRange?: SelectionRange;
};

/** @category Cells */
export interface CustomCell<T extends {} = {}> extends BaseGridCell {
    readonly kind: GridCellKind.Custom;
    readonly data: T;
    readonly copyData: string;
    readonly readonly?: boolean;
}

/** @category Cells */
export interface DrilldownCellData {
    readonly text: string;
    readonly img?: string;
}

/** @category Cells */
export interface DrilldownCell extends BaseGridCell {
    readonly kind: GridCellKind.Drilldown;
    readonly data: readonly DrilldownCellData[];
}

/** @category Cells */
export interface BooleanCell extends BaseGridCell {
    readonly kind: GridCellKind.Boolean;
    readonly data: boolean | BooleanEmpty | BooleanIndeterminate;
    readonly readonly?: boolean;
    readonly allowOverlay: false;
    readonly maxSize?: number;
    readonly hoverEffectIntensity?: number;
}

// Can be written more concisely, not easier to read if more concise.
/** @category Cells */
export function booleanCellIsEditable(cell: BooleanCell): boolean {
    return !(cell.readonly ?? false);
}

/** @category Cells */
export interface RowIDCell extends BaseGridCell {
    readonly kind: GridCellKind.RowID;
    readonly data: string;
    readonly readonly?: boolean;
}

/** @category Cells */
export interface MarkdownCell extends BaseGridCell {
    readonly kind: GridCellKind.Markdown;
    readonly data: string;
    readonly readonly?: boolean;
}

/** @category Cells */
export interface UriCell extends BaseGridCell {
    readonly kind: GridCellKind.Uri;
    readonly data: string;
    readonly displayData?: string;
    readonly readonly?: boolean;
    readonly onClickUri?: (args: BaseGridMouseEventArgs & { readonly preventDefault: () => void }) => void;
    readonly hoverEffect?: boolean;
}

/** @category Cells */
export enum InnerGridCellKind {
    NewRow = "new-row",
    Marker = "marker",
}

export type EditListItem = { location: Item; value: EditableGridCell };

/** @category Cells */
export interface NewRowCell extends BaseGridCell {
    readonly kind: InnerGridCellKind.NewRow;
    readonly hint: string;
    readonly allowOverlay: false;
    readonly icon?: string;
}

/** @category Cells */
export interface MarkerCell extends BaseGridCell {
    readonly kind: InnerGridCellKind.Marker;
    readonly allowOverlay: false;
    readonly row: number;
    readonly drawHandle: boolean;
    readonly checked: boolean;
    readonly checkboxStyle: "square" | "circle";
    readonly markerKind: "checkbox" | "number" | "both" | "checkbox-visible";
}

/** @category Selection */
export type Slice = [start: number, end: number];
/** @category Selection */
export type CompactSelectionRanges = readonly Slice[];

export type FillHandleDirection = "horizontal" | "vertical" | "orthogonal" | "any";

/**
 * Configuration options for the fill-handle (the little drag square in the bottom-right of a selection).
 *
 *  `shape`   – Either a square or a circle. Default is `square`.
 *  `size`    – Width/height (or diameter) in CSS pixels. Default is `4`.
 *  `offsetX` – Horizontal offset from the bottom-right corner of the cell (positive is →). Default is `-2`.
 *  `offsetY` – Vertical offset from the bottom-right corner of the cell (positive is ↓). Default is `-2`.
 *  `outline` – Width of the outline stroke in CSS pixels. Default is `0`.
 */
export type FillHandleConfig = {
    readonly shape: "square" | "circle";
    readonly size: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly outline: number;
};

export type FillHandle = boolean | Partial<FillHandleConfig>;

/**
 * Default configuration used when `fillHandle` is simply `true`.
 */
export const DEFAULT_FILL_HANDLE: Readonly<FillHandleConfig> = {
    shape: "square",
    size: 4,
    offsetX: -2,
    offsetY: -2,
    outline: 0,
} as const;

function mergeRanges(input: CompactSelectionRanges) {
    if (input.length === 0) {
        return [];
    }
    const ranges = [...input];

    const stack: [number, number][] = [];

    ranges.sort(function (a, b) {
        return a[0] - b[0];
    });

    stack.push([...ranges[0]!]);

    for (const range of ranges.slice(1)) {
        const top = stack[stack.length - 1]!;

        if (top[1] < range[0]) {
            stack.push([...range]);
        } else if (top[1] < range[1]) {
            top[1] = range[1];
        }
    }

    return stack;
}

let emptyCompactSelection: CompactSelection | undefined;

/** @category Selection */
export class CompactSelection {
    private constructor(public readonly items: CompactSelectionRanges) {}

    static create = (items: CompactSelectionRanges) => {
        return new CompactSelection(mergeRanges(items));
    };

    static empty = (): CompactSelection => {
        return emptyCompactSelection ?? (emptyCompactSelection = new CompactSelection([]));
    };

    static fromSingleSelection = (selection: number | Slice) => {
        return CompactSelection.empty().add(selection);
    };

    static fromArray = (items: readonly number[]): CompactSelection => {
        if (items.length === 0) return CompactSelection.empty();
        const slices = items.map(s => [s, s + 1] as Slice);
        const newItems = mergeRanges(slices);
        return new CompactSelection(newItems);
    };

    public offset(amount: number): CompactSelection {
        if (amount === 0) return this;
        const newItems = this.items.map(x => [x[0] + amount, x[1] + amount] as Slice);
        return new CompactSelection(newItems);
    }

    public add(selection: number | Slice): CompactSelection {
        const slice: Slice = typeof selection === "number" ? [selection, selection + 1] : selection;
        const newItems = mergeRanges([...this.items, slice]);
        return new CompactSelection(newItems);
    }

    public remove(selection: number | Slice): CompactSelection {
        const items = [...this.items];

        const selMin = typeof selection === "number" ? selection : selection[0];
        const selMax = typeof selection === "number" ? selection + 1 : selection[1];

        for (const [i, slice] of items.entries()) {
            const [start, end] = slice;
            // Remove part of slice that intersects removed selection.
            if (start <= selMax && selMin <= end) {
                const toAdd: Slice[] = [];
                if (start < selMin) {
                    toAdd.push([start, selMin]);
                }
                if (selMax < end) {
                    toAdd.push([selMax, end]);
                }
                items.splice(i, 1, ...toAdd);
            }
        }
        return new CompactSelection(items);
    }

    public first(): number | undefined {
        if (this.items.length === 0) return undefined;
        return this.items[0]![0];
    }

    public last(): number | undefined {
        if (this.items.length === 0) return undefined;
        return this.items.slice(-1)[0]![1] - 1;
    }

    public hasIndex(index: number): boolean {
        for (let i = 0; i < this.items.length; i++) {
            const [start, end] = this.items[i]!;
            if (index >= start && index < end) return true;
        }
        return false;
    }

    public hasAll(index: Slice): boolean {
        for (let x = index[0]; x < index[1]; x++) {
            if (!this.hasIndex(x)) return false;
        }
        return true;
    }

    public some(predicate: (index: number) => boolean): boolean {
        for (const i of this) {
            if (predicate(i)) return true;
        }
        return false;
    }

    public equals(other: CompactSelection): boolean {
        if (other === this) return true;

        if (other.items.length !== this.items.length) return false;

        for (let i = 0; i < this.items.length; i++) {
            const left = other.items[i]!;
            const right = this.items[i]!;

            if (left[0] !== right[0] || left[1] !== right[1]) return false;
        }

        return true;
    }

    // Really old JS wont have access to the iterator and babel will stop people using it
    // when trying to support browsers so old we don't support them anyway. What goes on
    // between an engineer and their bundler in the privacy of their CI server is none of
    // my business anyway.
    public toArray(): number[] {
        const result: number[] = [];
        for (const [start, end] of this.items) {
            for (let x = start; x < end; x++) {
                result.push(x);
            }
        }
        return result;
    }

    get length(): number {
        let len = 0;
        for (const [start, end] of this.items) {
            len += end - start;
        }

        return len;
    }

    *[Symbol.iterator]() {
        for (const [start, end] of this.items) {
            for (let x = start; x < end; x++) {
                yield x;
            }
        }
    }
}
