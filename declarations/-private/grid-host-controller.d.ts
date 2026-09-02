import { type CoercePasteValueCallback } from "../rendering/paste-coercion.ts";
import { type ValidateCellCallback } from "../rendering/validate-cell.ts";
import { type PasteBehavior } from "../rendering/copy-paste.ts";
import { type ScrollToParams } from "../rendering/scroll-to.ts";
import { type SearchStatus } from "../rendering/search.ts";
import { type RowGroupingOptions } from "../rendering/row-grouping.ts";
import type { GridColumn, GridCell, GridSelection, Item, Rectangle, GetCellRendererCallback, SpriteMap, Theme, GroupDetails, CellArray, GetCellsThunk, DrawCellCallback, DrawHeaderCallback, CellList, Highlight, FillHandleDirection, FillPatternEventArgs, GridMouseEventArgs, SelectionBlending, CellClickedEventArgs, HeaderClickedEventArgs, GroupHeaderClickedEventArgs, CellActivatedEventArgs, CellActivationBehavior, GridDragEventArgs } from "../rendering/index.ts";
import { type Keybinds } from "../rendering/keybindings.ts";
import { type IsDraggable } from "../rendering/external-drag.ts";
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
     * Extra empty scrollable space past the last column / last row, in px. Lets the user scroll a
     * trailing column or row away from the edge of the viewport — useful when something floats over
     * the grid's bottom-right, and the only way to reach the last row otherwise is to have it hidden
     * underneath. Mirrors source's `overscrollX`/`overscrollY`; scaled by `@scaleToRem` like every
     * other pixel dimension.
     * @defaultValue none
     */
    readonly overscrollX?: number;
    /** {@inheritDoc GridHostArgs.overscrollX} */
    readonly overscrollY?: number;
    /**
     * The inset shadow drawn over the frozen columns' right edge once the grid is scrolled
     * horizontally, and over the header's bottom edge once it is scrolled vertically. Depth cues:
     * without them, frozen columns and a sticky header look like part of a flat surface.
     *
     * The X shadow needs `@freezeColumns` (or a row-marker column) to have something to cast from.
     * Both mirror source's `fixedShadowX`/`fixedShadowY`.
     * @defaultValue true
     */
    readonly fixedShadowX?: boolean;
    /** {@inheritDoc GridHostArgs.fixedShadowX} */
    readonly fixedShadowY?: boolean;
    /**
     * Lets a cell be drawn narrower than the 10px floor the render engine otherwise enforces.
     * Source's `experimental.disableMinimumCellWidth`, which drops the floor to 1px — needed for
     * `withCollapsingGroups`-style slivers and any other deliberately hairline column.
     * @defaultValue false
     */
    readonly disableMinimumCellWidth?: boolean;
    /**
     * How the canvas is composited. `"single-buffer"` draws straight to the visible canvas,
     * `"double-buffer"` swaps between two offscreen ones (which is what Safari needs to avoid
     * tearing), `"direct"` disables the scroll blit fast path entirely and repaints every frame.
     *
     * Source's `experimental.renderStrategy`. **Leave it alone unless you are chasing a specific
     * artefact:** the default already picks `"double-buffer"` on Safari and `"single-buffer"`
     * elsewhere, and `"direct"` is materially slower.
     */
    readonly renderStrategy?: "single-buffer" | "double-buffer" | "direct";
    /**
     * Drop the canvas resolution *while scrolling* and restore it 200ms after the last scroll —
     * blurrier in motion, sharp at rest. Only takes effect on the matching browser and only above
     * 1x device pixel ratio; source gates them the same way
     * (`experimental.enableFirefoxRescaling` / `enableSafariRescaling`).
     *
     * Firefox caps at 1x and Safari at 2x while scrolling, against the usual 5x ceiling. Worth
     * switching on for a wide grid on a hi-DPI screen, where the per-frame fill cost is the
     * bottleneck; worth leaving off otherwise.
     * @defaultValue false
     */
    readonly enableFirefoxRescaling?: boolean;
    /** {@inheritDoc GridHostArgs.enableFirefoxRescaling} */
    readonly enableSafariRescaling?: boolean;
    /**
     * The same scroll-time downscale for **Chromium** browsers (Chrome, Edge, Brave, Opera, Arc),
     * capping at 1x while scrolling exactly as Firefox does.
     *
     * **This arg does not exist upstream, and that is deliberate rather than an oversight in
     * source.** Source offers the hack for Firefox and Safari only. It is added here because the
     * reason for the cap — canvas fill cost scaling with `devicePixelRatio` — is not browser
     * specific, and on a Retina display Chromium pays exactly the 4x fill that the other two are
     * allowed to avoid. Measured on this port's own full-grid demo at dpr 2: the draws that matter
     * are the ~6ms ones where a new row of image/bubble/sparkline cells enters view, and they are
     * fill-bound.
     *
     * **1x, not 2x.** Safari's 2x is a no-op at the common `devicePixelRatio` of 2 —
     * `min(2, ceil(2))` is still 2 — so the only cap that reduces work on a typical Retina screen is
     * 1x. That is the same trade Firefox users already take: visibly softer while the scroll is in
     * flight, sharp again 200ms after it stops.
     *
     * Off by default, like the other two: this trades image quality for frame rate, and that is the
     * consumer's call.
     * @defaultValue false
     */
    readonly enableChromeRescaling?: boolean;
    /**
     * Refuse to read any cell outside the region last reported to `@onVisibleRegionChanged`, handing
     * the renderer a `Loading` cell instead. Source's `experimental.strict`.
     *
     * **A correctness harness, not an optimisation.** A paged or async source only loads what the
     * grid asked it to load; without this, a bug in that plumbing shows up as *stale or wrong data*
     * silently rendered from whatever the backing array happens to hold. With it on, the same bug
     * shows up as visible loading cells. Switch it on while building the source, off in production.
     *
     * The selected cell and any frozen columns stay readable — see `isOutsideStrictRegion`
     * (`rendering/strict-region.ts`) for the exact bounds, which are source's.
     *
     * **Narrower than source, deliberately:** it gates the draw and hit-test path only. This port's
     * copy/search/auto-size sweeps read `getCellContent` directly rather than through the mangled
     * closure the check lives in, so they are unaffected — which also means turning this on cannot
     * break a copy of an off-screen range.
     * @defaultValue false
     */
    readonly strictVisibleRegion?: boolean;
    /**
     * Where the grid attaches its **window-level** pointer listeners: the `mouseup` that ends a drag
     * outside the grid, the `mousemove` that feeds autoscroll once the pointer leaves it, and the
     * outside-click that dismisses an open overlay editor. Source's `experimental.eventTarget`.
     *
     * Needed when the grid lives somewhere those events never reach `window`: an iframe, a portal,
     * or a shadow root. Left unset, the grid resolves the target itself from the canvas's
     * `getRootNode()` — so a grid inside a shadow root already works without this arg, and setting
     * it is only for the cases that resolution cannot see.
     *
     * Read once, when listeners are attached. Changing it later has no effect.
     *
     * Clipboard listeners (`copy`/`cut`/`paste`) are **not** redirected — they stay on `window`,
     * matching source, because clipboard events are dispatched to the focused document regardless of
     * where the grid sits in the tree.
     */
    readonly eventTarget?: HTMLElement | Window | Document | ShadowRoot;
    /**
     * Host node for the `<:rightElement>` block — a panel at the far end of the horizontal scroll
     * region, past the last column. The "+ add column" button every spreadsheet grows eventually,
     * or a summary rail, or a message.
     *
     * **Set by `<GlideDataGrid>`, not by consumers.** The component owns a stable `<div>` and renders
     * the block into it with `{{in-element}}`; the controller only decides where that div lives in
     * the scroller's DOM. Passing `undefined` means no block was provided and nothing is inserted.
     */
    readonly rightElement?: HTMLElement;
    /**
     * Keep the right element pinned to the visible edge instead of requiring a scroll to the end to
     * reveal it. Source's `rightElementProps.sticky`, flattened into its own arg the same way
     * `experimental`'s keys were.
     * @defaultValue false
     */
    readonly rightElementSticky?: boolean;
    /**
     * Let the right element consume whatever horizontal space is left over once the columns are laid
     * out, rather than sitting immediately after them. Source's `rightElementProps.fill`, and its
     * warning is worth repeating: **this does not play nicely with `grow` columns**, which are
     * competing for the same slack.
     * @defaultValue false
     */
    readonly rightElementFill?: boolean;
    /**
     * Reserved empty space at the right and bottom of the *scrollable* area, in px. Source's
     * `experimental.paddingRight` / `paddingBottom`, and they belong with `rightElement`.
     *
     * `paddingRight` is a **gutter beside the panel**, applied twice as source applies it: as the
     * panel's `margin-right`, and as the inset a sticky panel holds from the scrollport's edge. So
     * the reserved strip ends up to the *right* of the panel — setting it to the panel's own width
     * parks the panel that far inland with an equally wide void beside it.
     *
     * Both are also subtracted from the width and height the visible region is measured against, so
     * a paged source stops being asked for rows that are behind the panel or below the fold.
     *
     * Without a right element these are indistinguishable from `@overscrollX`/`@overscrollY`; prefer
     * those, which is what they are for.
     */
    readonly paddingRight?: number;
    /** {@inheritDoc GridHostArgs.paddingRight} */
    readonly paddingBottom?: number;
    /**
     * Extra/override header-icon glyphs, merged **over** the built-in set (`rendering/sprites.ts`)
     * exactly as source does (`data-editor-all.tsx:14`: `{...sprites, ...p.headerIcons}`). The
     * built-ins are always present, so this is only needed to add custom glyphs or restyle one of
     * the stock ones. Read once, when the `SpriteManager` is constructed -- changing it later has
     * no effect.
     */
    readonly headerIcons?: SpriteMap;
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
    /**
     * Take ownership of the selection (4.6). Pass it and the grid stops keeping its own: every
     * gesture that would change the selection instead reports the *requested* selection through
     * {@link onSelectionChanged} and changes nothing on screen until you pass a new value back.
     * Source's `gridSelection`, paired with `onGridSelectionChange`.
     *
     * That round trip is the feature: it is what lets you reject a selection, snap it to whole rows,
     * keep it in sync with a sidebar or the URL, or drive it from elsewhere in your app.
     *
     * **Omit it and nothing changes** — the grid owns its selection as it always has, and
     * `@onSelectionChanged` stays a plain notification.
     *
     * Coordinates are the consumer's own space (no row-marker column), the same space
     * `@onSelectionChanged` reports and `getCellContent` speaks.
     *
     * **Divergence from source, and a simplification:** upstream splits this across two props —
     * `gridSelection` controls reads and `onGridSelectionChange` controls writes — so supplying only
     * the callback yields a grid whose selection can never change. Here the presence of `@selection`
     * alone decides it. Both of source's *useful* configurations are still reachable: `@selection`
     * with a handler is a controlled grid, `@selection` without one is a frozen selection, and a
     * handler without `@selection` is the uncontrolled notify-only grid this addon already had.
     */
    readonly selection?: GridSelection;
    /**
     * The user cleared the selection by clicking **outside the grid's content** — past the last row
     * or column, on no cell at all. Fires in addition to {@link onSelectionChanged}.
     *
     * Read the guard, not the name: source fires this from exactly **two** places -- its
     * out-of-bounds mouse branch (`data-editor.tsx:2051-2054`) and its `clear` keybinding, i.e.
     * Escape (`:3206-3207`) -- and *not* on the other ways a selection ends up empty (a delete, a
     * programmatic clear). Reproduced as narrowly as that.
     *
     * **Corrected in 4.6.** This comment previously said "one place... not Escape", which described
     * this port before Escape-to-clear existed, not upstream. Both call sites are now ported.
     */
    readonly onSelectionCleared?: () => void;
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
     *
     * `col` is in **your** coordinate space: the row-marker column is already subtracted, the same
     * as `onHeaderContextMenu` / `onCellsEdited`. Source does this in `onHeaderMenuClickInner`
     * (`data-editor.tsx:2569-2574`).
     */
    readonly onHeaderMenuClick?: (col: number, bounds: Rectangle) => void;
    /**
     * The same gesture, for a header's *indicator* icon -- the second glyph a column can carry
     * (`column.indicatorIcon !== undefined` only), drawn immediately after the title. Fires on a
     * genuine click precisely inside that glyph's hit region, and like `onHeaderMenuClick` it is
     * hit-test + notification only: the grid attaches no meaning to the indicator beyond drawing it.
     *
     * `col` is in your coordinate space, matching `onHeaderMenuClick`. Source:
     * `onHeaderIndicatorClickInner` (`data-editor.tsx:2576-2580`).
     *
     * A press cannot satisfy both, and the menu wins: it is tested first, mirroring source's
     * `else if` (`data-grid.tsx:1057-1065`, `:1241`). That is not academic -- the menu's rect is
     * right-aligned to the column while the indicator's follows the measured title, so on a column
     * narrow enough for the two to overlap the indicator is unreachable, upstream included.
     */
    readonly onHeaderIndicatorClick?: (col: number, bounds: Rectangle) => void;
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
    readonly onCellsEdited?: (edits: readonly {
        location: Item;
        value: GridCell;
    }[]) => void;
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
     *
     * Receives source's three arguments. `groupIndex` is the row's position inside its row group and
     * `contentIndex` its position counting content rows only; with `@rowGrouping` unset all three are
     * the same number, exactly as upstream. A callback that only declares `row` is unaffected.
     */
    readonly getRowThemeOverride?: (row: number, groupIndex: number, contentIndex: number) => Partial<Theme> | undefined;
    /**
     * Groups rows under collapsible header rows. Source's `rowGrouping` prop
     * (`data-editor/row-grouping.ts`).
     *
     * **The grid does not draw group headers.** A group header is an ordinary row; what this arg does
     * is tell the grid which rows those are, so it can give them their own height and theme, keep the
     * row-marker numbering from counting them, and optionally skip them during navigation. Deciding
     * what a header row *looks like* is the consumer's job: call `rowGroupingApi(...).mapper(row)` in
     * `@getCellContent` and return whatever cell you want for `isGroupHeader` rows. That is how
     * source works too, and it is why a group header can be any cell type at all.
     *
     * `mapper(row).originalIndex` converts a grid row back into an index in your own flat, expanded
     * row array — use it for every other row, or the grid will read the wrong record once a group is
     * collapsed.
     *
     * Collapsing is consumer-driven: handle `@onCellClicked`, and rebuild `groups` with
     * `updateRowGroupingByPath`.
     */
    readonly rowGrouping?: RowGroupingOptions;
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
     * Accept or refuse a paste **wholesale**, before any cell is written. `false` disables pasting;
     * a callback receives the paste target in your own column space and the clipboard as raw
     * strings, and must return `true` for the paste to proceed. Mirrors source's `onPaste`.
     *
     * Not a substitute for {@link GridHostArgs.coercePasteValue}, which is consulted per value once
     * a paste is already going ahead — this one is all-or-nothing.
     *
     * @defaultValue `true` (paste is split on tabs/newlines and written as a range). Source's
     * default is `undefined`, which it treats as "write the whole clipboard into the one target
     * cell"; this port has always written the range and keeps doing so.
     */
    readonly onPaste?: PasteBehavior;
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
     * The user renamed a column group. **Providing this callback is what enables renaming** -- it
     * adds a "Rename" action to every group's header (alongside any `actions` your
     * `@getGroupDetails` returns), which opens an inline text box over the group's band. Mirrors
     * source's `onGroupHeaderRenamed`.
     *
     * **Nothing is renamed for you.** The grid has no writable model of a group -- a group exists
     * only because some columns share a `group` string -- so applying the rename means updating
     * those columns yourself, exactly as source states it.
     *
     * `groupName` is the group **key**, i.e. the value on `column.group`. **Divergence from source,
     * stated:** upstream passes the group's *display* name here (`data-editor.tsx:3988` forwards
     * `result.name` from `getGroupDetails`), which is the same string only when no custom display
     * name is set -- and when one is, the consumer has no way back to the columns they must edit,
     * which is the callback's entire job. Upstream's own test cannot see the difference because it
     * sets `group: c.title` with no `getGroupDetails`, and its API docs name the parameter
     * `groupName`. The text box still *opens* showing the display name, which is what the user sees.
     *
     * Groups with an empty key are skipped, as upstream skips them: ungrouped columns render a blank
     * band that is not a group and cannot be named.
     */
    readonly onGroupHeaderRenamed?: (groupName: string, newValue: string) => void;
    /**
     * 4.4 — external HTML5 drag-and-drop. **Not** the internal column/row reorder drags, which are
     * plain mouse gestures and are always on: this is the browser's own drag-and-drop, for carrying
     * data *out of* the grid into another application or another part of your page.
     *
     * Setting it puts the `draggable` attribute on the scroll surface. `"cell"` or `"header"`
     * restricts which band a drag may start from; `true` allows any, the group-header band and the
     * area past the last row included. Mirrors source's `isDraggable`.
     *
     * **Nothing is dragged unless `@onDragStart` calls `setData`** — the callback is where the
     * payload comes from, and a drag with no payload is cancelled before it begins.
     * @defaultValue false
     */
    /**
     * Remap or disable any keyboard gesture. Each entry takes `true` (keep the default), `false`
     * (switch the gesture off entirely) or a hotkey string such as `"ctrl+shift+k"`; anything left
     * out keeps its default. Source's `keybindings`, with the same string syntax, so a map written
     * for the React grid transfers unchanged.
     *
     * ```js
     * keybindings = { selectAll: false, goDownCell: "ctrl+j", search: "primary+shift+f" };
     * ```
     *
     * See `ConfigurableKeybinds` for the full list and every default. Two notes: `search` defaults
     * to **on** here where source defaults it off, and source's `downFill`/`rightFill` and
     * `acceptOverlay*` entries are absent because this port has nothing for them to bind to — see
     * that file's header.
     */
    readonly keybindings?: Partial<Keybinds>;
    readonly isDraggable?: IsDraggable;
    /**
     * A drag is starting from the grid. Call `setData(mime, payload)` to give it something to
     * carry — **a drag with no payload is cancelled**, matching source. `preventDefault()` refuses
     * the drag outright.
     *
     * `setDragImage(element, x, y)` overrides what follows the cursor. Left alone, the grid renders
     * the cell (or header) being dragged into an offscreen canvas and uses that, as source does.
     *
     * `location` is in your own column space — a drag starting on the row-marker column is refused
     * before this fires, so index 0 is always your first column.
     */
    readonly onDragStart?: (args: GridDragEventArgs) => void;
    /**
     * Something is being dragged over `cell`. Fires **on each new cell**, not on every `dragover`
     * event, so it is a safe place to move a drop indicator. The `dataTransfer` is the live one; per
     * the HTML spec its *contents* are unreadable until drop, though `types` is available.
     *
     * Requires `@onDrop` to be set for the drop itself to be permitted — the grid only calls
     * `preventDefault()` on the drag-over (which is what marks it a valid drop zone) when there is
     * an `@onDrop` to receive it, which is source's rule.
     */
    readonly onDragOverCell?: (cell: Item, dataTransfer: DataTransfer | null) => void;
    /** A drag left the grid. Pairs with `@onDragOverCell` for clearing a drop indicator. */
    readonly onDragLeave?: () => void;
    /**
     * Something was dropped on `cell`, in your own column space. **Providing this is what makes the
     * grid a drop target** — without it the browser refuses every drop, as it does for any element
     * that does not cancel its own drag-over.
     *
     * Nothing is written for you: read the `dataTransfer` and apply the change through your own
     * data, exactly as with `@onCellEdited`.
     */
    readonly onDrop?: (cell: Item, dataTransfer: DataTransfer | null) => void;
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
export declare class GridHostController {
    private readonly root;
    private readonly getArgsFn;
    private readonly underlayEl;
    private readonly canvasEl;
    private readonly headerCanvasEl;
    private readonly scrollerEl;
    private readonly scrollInnerEl;
    private readonly stackEl;
    private readonly spacerEl;
    /** 4.5: the frozen-column and header scroll shadows. See `updateScrollShadows`. */
    private readonly shadowXEl;
    private readonly shadowYEl;
    /** Last styles written to the two shadows, so a draw that changes nothing touches no DOM. */
    private lastShadowState;
    /** 4.5: scroll-time canvas downscale. Both only ever move when a rescaling arg is on. */
    private isScrolling;
    private scrollingStopTimer;
    /**
     * The nodes a pointer event is allowed to have originated on for the grid to treat it as its
     * own. Everything else inside `root` -- an open overlay editor, `<GlideSearchBar>`, any
     * consumer chrome rendered into the yielded block -- must NOT be dispatched as a grid click.
     * See `grid-event-target.ts` for the full rationale and the source citation.
     */
    private readonly gridSurfaces;
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
    private readonly windowEventTarget;
    private addWindowListener;
    private removeWindowListener;
    private readonly bufferAEl;
    private readonly bufferBEl;
    private readonly canvasCtx;
    private readonly headerCanvasCtx;
    private readonly bufferACtx;
    private readonly bufferBCtx;
    private readonly resizeObserver;
    private readonly spriteManager;
    private readonly renderStateProvider;
    private readonly imageLoader;
    private readonly animationManager;
    private readonly animationQueue;
    private readonly lastBlitData;
    private width;
    private height;
    private cellXOffset;
    private cellYOffset;
    private translateX;
    private translateY;
    private hoverValues;
    private hoverInfo;
    private hoveredItem;
    private lastFullDrawArg;
    private cursorOverride;
    private destroyed;
    private readonly cellsForSelectionAbort;
    private isFocused;
    /**
     * The grid's own selection state, used **only** when the consumer has not taken ownership with
     * `@selection`. Read through the {@link selection} getter, never directly: in controlled mode
     * this field goes stale on purpose, because the consumer's arg is the truth.
     */
    private internalSelection;
    /**
     * The consumer's `@selection`, refreshed by `resolveArgs`. Cached in a field rather than read
     * from args on demand because {@link selection} is read on hot paths -- the mangled cell-content
     * closure asks it for every row-marker cell, every frame -- and `resolveArgs` allocates.
     */
    private controlledSelection;
    /**
     * The selection in force: the consumer's when they own it, the grid's otherwise. Every read site
     * in this file goes through here, so "who owns the selection" is decided in exactly one place.
     */
    private get selection();
    private readonly mangledSelectionCache;
    private mouseDownState;
    private pendingHeaderElementClick;
    private lastSelectedRow;
    private lastSelectedCol;
    private resizeState;
    private dragColState;
    private dragRowState;
    private fillState;
    private overFillHandle;
    private overResizeEdge;
    private readonly autoscroller;
    private lastDragHover;
    private overlayState;
    constructor(options: GridHostControllerOptions);
    private getContext2d;
    private autoSizeCache;
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
    private sizedColumns;
    private remAdjustCache;
    private remSize;
    private remAdjust;
    private rowGroupingCache;
    private resolvedRowGrouping;
    private resolveArgs;
    private enableGroupsCache;
    private enableGroups;
    private groupDetailsCache;
    private resolvedGroupDetails;
    private groupHeaderHeight;
    private totalHeaderHeight;
    private mergedThemeCache;
    private mergedTheme;
    private themeForCell;
    private lastRootStampedTheme;
    private applyThemeCssVariables;
    private effectiveRows;
    private mangledColumns;
    private rowMarkerSpec;
    private mangledCellContentCache;
    private previewRowIndex;
    private mangledGetCellContent;
    private readonly mangledLayoutCache;
    private computeMangledLayout;
    private selectionOptions;
    /**
     * `this.selection` in the render engine's / hit-testing column space.
     *
     * Memoized on `this.selection`'s identity, and that is load-bearing rather than a micro-opt:
     * `computeCanBlit` identity-compares `DrawGridArg.selection`, so shifting afresh per draw would
     * silently disable the scroll blit fast path -- the same defect class Phase 6 fixed three
     * instances of. With `rowMarkers: "none"` the shift is the identity function and returns the
     * very same object, so a marker-less grid is byte-identical to the pre-9k behaviour.
     */
    private mangledSelection;
    private applySelection;
    /** `applySelection` for a selection computed in the render engine's column space. The single
     *  conversion back out to consumer space. */
    private applyMangledSelection;
    private clearSelection;
    /** Call after any `getArgs()`-relevant input changes (columns, rows, sizes, theme, etc). */
    scheduleFullRedraw(): void;
    private lastAppliedScrollOffsetX;
    private lastAppliedScrollOffsetY;
    private applyScrollOffsets;
    /** Damage-based partial redraw for a known set of changed cells. */
    updateCells(cells: readonly {
        cell: Item;
    }[]): void;
    /** Current selection, in the **consumer's** column space (no row-marker column) -- the same
     *  space `@onSelectionChanged` reports and `@onCellsEdited` speaks. Read-only snapshot --
     *  mutate via user interaction, not directly. */
    getSelection(): GridSelection;
    destroy(): void;
    private drawWithDamage;
    private runDraw;
    private disabledRowsCache;
    private disabledRows;
    private highlightRegionsCache;
    private effectiveHighlightRegions;
    private applyCursor;
    private lastVisibleRegion;
    private updateVisibleRegion;
    private computeVisibleRegion;
    private sizeCanvases;
    /**
     * Positions and fades the two scroll shadows (4.5). Port of source's `stickyShadow` memo
     * (`data-grid.tsx:1878-1918`), which computes exactly these two opacities and inline styles.
     *
     * Both stay mounted and are hidden with `opacity: 0` rather than being added and removed,
     * because they are re-evaluated on every draw and the whole point of the memo upstream is to do
     * no work when nothing changed -- here that is the `lastShadowState` comparison, which keeps a
     * scroll frame free of DOM writes once the shadows have reached full opacity.
     */
    private updateScrollShadows;
    private rebuildScrollContent;
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
    private syncRightElement;
    /** The node `syncRightElement` last placed, so a changed one can be evicted. */
    private rightElementHost;
    private syncScrollOffsets;
    private redrawHeaderHover;
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
    private noteScrollForRescaling;
    private readonly onScroll;
    private readonly onMouseMove;
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
    private emitItemHovered;
    /**
     * Builds a `GridMouseEventArgs` for a hit target. Shared by `@onItemHovered` and 9f's
     * `getMouseArgsForPosition`, which must agree -- a consumer comparing the two is exactly the
     * kind of thing this API exists for, and two separate constructions would drift.
     *
     * `item` is MANGLED and `location` comes out in CONSUMER space, mirroring
     * `data-editor.tsx:2808`/`:4104`. A hover over the row-marker column reports `-1` rather than
     * being suppressed, as source does.
     */
    private buildMouseEventArgs;
    /**
     * A drag this grid started is in flight. Source keeps the same flag
     * (`data-editor.tsx:2682`) and uses it for one thing: suppressing rect drag-selection, which
     * would otherwise run off the `mousemove`s the browser still delivers during a drag.
     *
     * `mouseDownState` is cleared at `dragstart` as well (source's `setMouseState(undefined)`), so
     * this is belt-and-braces — but it is what stops a drag that *ends* inside the grid from
     * resuming a selection on the way out.
     */
    private isActivelyDragging;
    /** The cell `@onDragOverCell` last reported. `dragover` fires continuously over a stationary
     *  pointer, so without this the consumer hears about the same cell tens of times a second. */
    private activeDropTarget;
    private readonly onDragStartExternal;
    /**
     * Renders the dragged cell (or header) into an offscreen canvas and hands it to the browser as
     * the drag image. Port of `data-grid.tsx:1502-1590`.
     *
     * Without this the browser drags a snapshot of the whole scroll surface, which for a grid means
     * a translucent copy of the entire viewport. The canvas is attached offscreen because
     * `setDragImage` requires an element that is *in* the document, and removed on the next tick
     * because by then the browser has taken its snapshot — both of which are source's.
     */
    private setDefaultDragImage;
    private readonly onDragOverExternal;
    private readonly onDropExternal;
    private readonly onDragLeaveExternal;
    /** `dragend` fires on the *source* of a drag, whether or not it was dropped anywhere. */
    private readonly onDragEndExternal;
    /** The drop target in consumer space. Headers stay reachable (rows -1/-2), matching source,
     *  which subtracts the marker offset and does nothing else. */
    private dropTargetFor;
    /**
     * 4.6: runs the clicked cell renderer's `onSelect` hook. Returns `true` if it called
     * `preventDefault()`, in which case the caller abandons the selection change.
     *
     * `mangledLocation` is mangled (it comes from `hit.location`); the hook is handed the *cell*
     * rather than a location, matching source, so the marker column never reaches it -- the caller's
     * row-marker branch has already returned by this point.
     */
    private emitRendererSelect;
    /** The fields every click event shares with a hover event. Kept in one place so the two paths
     *  cannot drift. */
    private clickEventBase;
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
    private dispatchClick;
    /** Fires `onCellClicked`. Returns `true` if the consumer called `preventDefault()`, in which
     *  case the caller skips the renderer's `onClick` and activation -- the two things, and only the
     *  two things, source's `isPrevented` suppresses. */
    private emitCellClicked;
    /**
     * Fires `onHeaderClicked` or `onGroupHeaderClicked` depending on which band was hit (row `-1`
     * vs `-2`). The row-marker guard lives in the caller, where source has it.
     *
     * Returns `true` if the consumer called `preventDefault()`. That only *means* anything for a
     * group header, where it suppresses the group's column selection -- `onHeaderClicked` fires
     * long after an ordinary header's selection has already been applied on mousedown, exactly as
     * in source. See the block comment at the top of this section.
     */
    private emitHeaderClicked;
    /**
     * Selects the clicked group's whole column span. Port of `handleGroupHeaderSelection`
     * (`data-editor.tsx:2142-2189`); the branch logic is
     * {@link computeGroupHeaderSelection} in `rendering/group-header-selection.ts` so it is testable.
     *
     * Runs on **mouseup**, after `onGroupHeaderClicked` and only if the consumer did not prevent it.
     */
    private applyGroupHeaderSelection;
    /** Fires `onCellActivated`. `mangledLocation` is converted to consumer space here, the single
     *  place this event is emitted from. */
    private emitCellActivated;
    /** True while any pointer drag this class tracks per-cell is in flight. Resize/column-reorder are
     * deliberately excluded: both are handled and `return`ed above this point, and neither wants
     * autoscroll (a column resize past the edge would fight the scroll it caused). */
    private isDragInFlight;
    private readonly onWindowMouseMove;
    private readonly onAutoscrollTick;
    /** Applies an in-flight drag to a resolved grid location. Shared by the mousemove path and the
     * autoscroll tick, which is the point: the two must not drift apart. */
    private applyDragTo;
    private hitTestFillHandle;
    private fillPattern;
    private resolveMouseHit;
    /**
     * The same hit test, from a bare pair of *client* coordinates. 9f's `getMouseArgsForPosition`
     * needs this, and source separates them the same way (`data-grid.tsx:516`, which takes
     * `posX`/`posY` and an *optional* event -- every internal caller passes one, the ref method does
     * not).
     */
    private resolveHitAtPoint;
    private currentDragAndDropState;
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
    private hitTestHeaderElement;
    /**
     * Hit-test for a group header's action icons (4.2). Port of source's
     * `groupHeaderActionForEvent` (`data-grid.tsx:1004-1029`); the geometry and the comparison it
     * makes live in `rendering/render/group-header-actions.ts` so they are shared with the drawing
     * code and reachable from vitest.
     *
     * Returns `undefined` for anything that is not a group-header press, so callers can ask
     * unconditionally.
     */
    private hitTestGroupHeaderAction;
    private hitTestColumnResizeEdge;
    private readonly onFocus;
    private readonly onBlur;
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
    private readonly onContextMenu;
    private readonly onMouseDown;
    private readonly onMouseUp;
    private dispatchCellMouseDown;
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
    private dispatchCellMouseUp;
    private dispatchHeaderMouseDown;
    private handleDragMove;
    /** Cell-rect in the same root-relative pixel space `resolveMouseHit`/hover hit-testing use. */
    private computeCellRect;
    /** Writes an edited cell back via `onCellsEdited` + a damage-only redraw of just that cell.
     *  `mangledLocation` is in row-marker-space (what selection/hit-testing use throughout this
     *  file); converted to real column space only at the `onCellsEdited` callback boundary, same
     *  convention as every other edit path in this file (paste/cut). */
    private commitCellEdit;
    private activateCell;
    private openOverlay;
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
    private focusOverlay;
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
    private setupStayOnScreen;
    private readonly onOverlayOutsideClick;
    private groupRenameState;
    private openGroupRename;
    private commitGroupRename;
    private closeGroupRename;
    private readonly onGroupRenameOutsideClick;
    /** Closes the overlay, optionally committing `newValue` first, then moves the active cell by
     *  `movement` if non-zero. Idempotent via `state.finished` -- source's overlay can reach this
     *  point twice for one logical close (e.g. an Enter keydown finishing the editor and a
     *  subsequent synthetic/blur-driven click-outside on the same tick), see `OverlayState.finished`'s
     *  doc comment above. */
    private finishOverlay;
    private deleteSelection;
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
    private resolveDeleteTarget;
    private readonly onKeyDown;
    /**
     * 4.6: the realized keybinding map, memoized on the consumer's `@keybindings` object.
     *
     * Read once per keydown rather than per draw, so it is not one of `computeCanBlit`'s
     * identity-compared fields — but realizing 34 bindings on every keypress would still be waste,
     * and a consumer passing an inline hash gets a new object each render, so the cache is keyed on
     * identity with a rebuild when it changes.
     */
    private keybindingsCache;
    private resolvedKeybindings;
    /**
     * ctrl+space. Port of source's `keys.selectColumn` branch (`data-editor.tsx:3278-3288`), which
     * is deliberately simpler than the mouse path: no shift-range, no `lastSelectedCol` tracking —
     * it toggles the current cell's column and nothing else.
     */
    private toggleColumnSelectionFromKeyboard;
    /** shift+space. Source's `keys.selectRow` branch (`data-editor.tsx:3289-3299`). Row selection
     *  carries no column coordinate, so this one stays in consumer space, like the mouse path. */
    private toggleRowSelectionFromKeyboard;
    private moveActiveCell;
    private adjustSelection;
    private selectAll;
    private searchOpenInner;
    private searchValueInner;
    private searchResultsInner;
    private searchSelectedIndex;
    private searchStatus;
    private search;
    /** Guards the "select and scroll to the active match" side effect so it runs only when the
     *  navigated match actually changes. Source keeps the same guard (`lastSent`) because the
     *  results callback fires on every streamed chunk, not only on navigation. */
    private lastNavigatedTo;
    private searchIsOpen;
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
    private effectivePrelightCells;
    private searchQuery;
    /** The results actually in effect: a consumer's own if supplied, else the scanner's. */
    private effectiveSearchResults;
    private searchSnapshot;
    private emitSearchState;
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
    private searchChunkMangled;
    private beginSearch;
    /** Hands results to the consumer in *their* coordinate space, and -- unless they've taken over
     *  navigation by supplying `onSearchResultsChanged` -- selects and scrolls to the active match. */
    private notifySearchResults;
    /** Opens search. Idempotent. */
    openSearch(): void;
    /** Closes search, clearing results and cancelling any scan. Mirrors source's `onClose`. */
    closeSearch(): void;
    /** Sets the query and (re)starts the scan. Always emits `onSearchValueChange`, controlled or
     *  not, so a consumer can observe the query without owning it -- source's behaviour. */
    setSearchValue(value: string): void;
    /** Moves to the next match, wrapping. No-op with no results. */
    searchNext(): void;
    /** Moves to the previous match, wrapping. No-op with no results. */
    searchPrev(): void;
    private stepSearch;
    /** Current search state, for a UI that needs to read it rather than wait for a change event. */
    getSearchState(): SearchState;
    /** Focuses the grid, so keyboard navigation works without a click first. */
    focus(): void;
    /**
     * Screen-space (client) bounds of a cell, header, or -- with no arguments -- the whole scrollable
     * content. `undefined` when the target does not exist or is scrolled out of the drawn region.
     *
     * Client space rather than root-relative because the point of it is positioning something
     * outside the grid (a tooltip, a popover), which is what source uses it for too
     * (`data-grid.tsx:494-495` adds the canvas rect before returning).
     */
    getBounds(col?: number, row?: number): Rectangle | undefined;
    /**
     * Scrolls a cell into view. `col`/`row` are in consumer space.
     *
     * `params` covers source's `dir`/`paddingX`/`paddingY`/`hAlign`/`vAlign`; `behavior` is
     * `"smooth"` or `"auto"`. Source's `{amount, unit: "px"}` column/row form is **not ported** --
     * see `GlideDataGridApi.scrollTo`.
     */
    scrollTo(col: number, row: number, params?: ScrollToParams & {
        behavior?: ScrollBehavior;
    }): void;
    private scrollToSmooth;
    /**
     * Re-measures the given columns from their currently-visible cells and reports the result
     * through `onColumnResize`, exactly as a user-driven resize would. Consumer-space indices.
     *
     * **Notification only** -- like every other resize path in this port, the consumer owns the
     * columns array and nothing changes until they apply the new width. Silently does nothing
     * without an `onColumnResize`, matching source (`normalSizeColumn`, `data-editor.tsx:2195`).
     */
    remeasureColumns(cols: Iterable<number>): void;
    /**
     * The `GridMouseEventArgs` a pointer at the given *client* coordinates would produce, without
     * any pointer event having happened. Exposes the hit test hover/click already run through.
     * `undefined` only if the grid has been torn down.
     */
    getMouseArgsForPosition(clientX: number, clientY: number, ev?: MouseEvent): GridMouseEventArgs | undefined;
    /**
     * Programmatically appends a row, then focuses (and optionally opens the editor on) `col` in it.
     * Consumer-space column.
     *
     * Resolves once the focus has been placed, or once it has given up. The append itself is the
     * consumer's -- `onRowAppended` is what actually adds the row -- so this polls for `rows` to grow
     * before focusing anything, with source's backoff (`data-editor.tsx:1703-1712`). It is the only
     * shape that can work: the consumer's tracked state has not flushed when `onRowAppended` returns.
     */
    appendRow(col: number, openOverlay?: boolean, behavior?: ScrollBehavior): Promise<void>;
    /**
     * The column half of {@link appendRow}: fires `onColumnAppended`, waits for the consumer's
     * columns array to actually grow, then focuses `row` in the new column.
     */
    appendColumn(row: number, openOverlay?: boolean): Promise<void>;
    /**
     * Waits for `read()` to exceed `before`, with source's escalating backoff (`50 + backoff * 2`,
     * giving up past 500ms). Resolves with the new value, or `undefined` if it never grew.
     *
     * This exists because an append is *asynchronous by construction* in both projects: the grid
     * only notifies, the consumer owns the data, and their state update lands whenever their
     * framework gets to it. Polling is source's answer and it is the right one here too -- Ember
     * gives no "the consumer has finished reacting" hook either.
     */
    private waitForGrowth;
    /**
     * Which consumer-space column the trailing blank row should focus when activated at
     * `mangledCol`. Port of source's `getCustomNewRowTargetColumn` (`data-editor.tsx:1795-1815`):
     * the clicked column's own `trailingRowOptions.targetColumn` wins over the grid-level one, and a
     * `GridColumn` object is resolved by identity against `columns` so it survives reordering.
     *
     * Falls back to the clicked column. Note source resolves this in mangled space and this returns
     * consumer space -- `appendRow` takes consumer space, so the conversion belongs here.
     */
    private resolveNewRowTargetColumn;
    /** Shared tail of `appendRow`/`appendColumn`: scroll it into view, select it, optionally open
     *  its editor. `mangledCol` is mangled; `row` is a row index. */
    private focusAppended;
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
    emit(event: "delete"): void;
    /**
     * Scrolls the minimum distance that makes a cell fully visible, doing nothing if it already is.
     * Internal callers (keyboard nav, `appendRow`) use this; `scrollTo` below is the public 9f
     * entry point and adds padding/alignment on top.
     *
     * `col` is MANGLED (the row-marker column is index 0 when markers are on), matching every other
     * internal caller of `computeBounds`. `scrollTo` converts.
     */
    private scrollCellIntoView;
    /** Mangled (row-marker-space) column/row bounds of the current selection, or `undefined` if
     *  nothing is selected. `colEnd`/`rowEnd` are exclusive.
     *
     *  Phase 4d: `rowEnd` is always clamped to `args.rows` (real data rows only), even for the
     *  `current`-range branch, since keyboard nav can now land `selection.current.cell`/`.range` on
     *  the trailing blank row (see `moveActiveCell`'s widened clamp) -- copy/cut/delete must never
     *  hand that row's index to the caller's own `getCellContent` (it isn't real data and the
     *  caller has no cell for it). The `rows`/`columns` CompactSelection branches below already used
     *  `args.rows` and needed no change. */
    private selectedRegion;
    private cellsForSelectionSync;
    private buildCopyBuffer;
    /** 9g: `copyHeaders` prepends one `Text` cell per copied column carrying its title, exactly as
     *  source does (`data-editor.tsx:3787-3796`). Off by default, and a no-op then. */
    private withCopyHeaders;
    private pasteValueIntoCell;
    private clearedCellValue;
    private readonly onCopy;
    private readonly onCut;
    private readonly onPaste;
}
//# sourceMappingURL=grid-host-controller.d.ts.map