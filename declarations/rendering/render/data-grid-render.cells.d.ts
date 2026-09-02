import { type GridSelection, type InnerGridCell, type Rectangle, CompactSelection, GridColumnIcon, type Item, type CellList, type DrawCellCallback, type CSSCursorValue } from "../data-grid-types.ts";
import { CellSet } from "../cell-set.ts";
import type { HoverValues } from "../animation-manager.ts";
import { type MappedGridColumn } from "./data-grid-lib.ts";
import type { SpriteManager } from "../data-grid-sprites.ts";
import { type FullTheme, type Theme } from "../theme.ts";
import type { GetCellRendererCallback, PrepResult } from "../cell-types.ts";
import type { HoverInfo, EnqueueCallback } from "./draw-grid-arg.ts";
import type { RenderStateProvider } from "../common/render-state-provider.ts";
import type { ImageWindowLoader } from "../image-window-loader-interface.ts";
import type { GridMouseGroupHeaderEventArgs } from "../event-args.ts";
export interface GroupDetails {
    readonly name: string;
    readonly icon?: string;
    readonly overrideTheme?: Partial<Theme>;
    readonly actions?: readonly {
        readonly title: string;
        readonly onClick: (e: GridMouseGroupHeaderEventArgs) => void;
        readonly icon: GridColumnIcon | string;
    }[];
}
export type GroupDetailsCallback = (groupName: string) => GroupDetails;
export type GetRowThemeCallback = (row: number) => Partial<Theme> | undefined;
export interface Highlight {
    readonly color: string;
    readonly range: Rectangle;
    readonly style?: "dashed" | "solid" | "no-outline" | "solid-outline";
}
export declare function drawCells(ctx: CanvasRenderingContext2D, effectiveColumns: readonly MappedGridColumn[], allColumns: readonly MappedGridColumn[], height: number, totalHeaderHeight: number, translateX: number, translateY: number, cellYOffset: number, rows: number, getRowHeight: (row: number) => number, getCellContent: (cell: Item) => InnerGridCell, getGroupDetails: GroupDetailsCallback, getRowThemeOverride: GetRowThemeCallback | undefined, disabledRows: CompactSelection, isFocused: boolean, drawFocus: boolean, freezeTrailingRows: number, hasAppendRow: boolean, drawRegions: readonly Rectangle[], damage: CellSet | undefined, selection: GridSelection, prelightCells: CellList | undefined, highlightRegions: readonly Highlight[] | undefined, imageLoader: ImageWindowLoader, spriteManager: SpriteManager, hoverValues: HoverValues, hoverInfo: HoverInfo | undefined, drawCellCallback: DrawCellCallback | undefined, hyperWrapping: boolean, outerTheme: FullTheme, enqueue: EnqueueCallback, renderStateProvider: RenderStateProvider, getCellRenderer: GetCellRendererCallback, overrideCursor: (cursor: CSSCursorValue) => void, minimumCellWidth: number): Rectangle[] | undefined;
export declare function drawCell(ctx: CanvasRenderingContext2D, cell: InnerGridCell, col: number, row: number, isLastCol: boolean, isLastRow: boolean, x: number, y: number, w: number, h: number, highlighted: boolean, theme: FullTheme, finalCellFillColor: string, imageLoader: ImageWindowLoader, spriteManager: SpriteManager, hoverAmount: number, hoverInfo: HoverInfo | undefined, hyperWrapping: boolean, frameTime: number, drawCellCallback: DrawCellCallback | undefined, lastPrep: PrepResult | undefined, enqueue: EnqueueCallback | undefined, renderStateProvider: RenderStateProvider, getCellRenderer: GetCellRendererCallback, overrideCursor: (cursor: CSSCursorValue) => void): PrepResult | undefined;
//# sourceMappingURL=data-grid-render.cells.d.ts.map