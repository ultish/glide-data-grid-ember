import type { Section } from "./types.ts";

export const selectionSection: Section = {
    id: "selection",
    title: "Selection, row markers, reordering, fill",
    blocks: [
        {
            kind: "code",
            text: `<GlideDataGrid
  @rowMarkers="both"          {{! none | checkbox | number | both | clickable-number }}
  @rowSelect="multi"
  @columnSelect="multi"
  @rangeSelect="rect"         {{! none | cell | rect | multi-cell | multi-rect }}
  @onSelectionChanged={{this.handleSelectionChanged}}
  ...
/>`,
        },
        {
            kind: "p",
            text: "Row markers are a **native grid feature**, not something you build: the checkbox column, the tri-state select-all in the header, shift-to-extend and drag-to-extend all come with it.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @rowMarkers="number"
  @rowMarkerStartIndex={{0}}                  {{! default 1 — 0 makes the numbers match row indices }}
  @rowMarkerWidth={{48}}
  @rowMarkerTheme={{this.markerTheme}}        {{! stable object, not an inline hash }}
  ...
/>`,
        },
        {
            kind: "list",
            items: [
                "`@rowMarkerStartIndex` numbers the first row. It defaults to `1` because that is what a spreadsheet does; set it to `0` and the markers agree with the `row` your `@getCellContent` is asked for, which is worth doing while debugging.",
                "`@rowMarkerTheme` is a theme overlay for the marker column alone — tint it away from the data without touching `@theme`. Build it once (module constant or `@cached` getter): it lands on a column, so a fresh object every render is churn on a grid arg.",
            ],
        },
        {
            kind: "code",
            text: `handleSelectionChanged = selection => {
  // selection.current?.cell   -> [col, row] of the focused cell
  // selection.current?.range  -> { x, y, width, height }
  // selection.rows / .columns -> CompactSelection (sparse, iterable, .hasIndex(), .length)
  this.selectedRowCount = selection.rows.length;
};`,
        },
        {
            kind: "p",
            text: "`@onSelectionChanged` reports **displayed** rows. That is deliberate — it is what is visually selected. Contrast the *write* path under sorting, where displayed-space is a trap.",
        },
        {
            kind: "p",
            text: "**Row reordering.** Setting `@onRowMoved` both enables the drag and draws the handle dots on the marker cells. It needs a marker column — that column is what you grab. The grid previews the move live and throws the preview away on drop, so you must reorder your data:",
        },
        {
            kind: "code",
            text: `<GlideDataGrid @rowMarkers="both" @onRowMoved={{this.handleRowMoved}} ... />

handleRowMoved = (from, to) => {
  const next = [...this.people];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  this.people = next;
};`,
        },
        {
            kind: "p",
            text: "**Owning the selection.** By default the grid keeps its own selection and `@onSelectionChanged` is a notification. Pass `@selection` and that flips: the grid keeps none, every gesture reports the *requested* selection, and nothing moves until you hand a new value back. That round trip is the point \u2014 it is what lets you refuse a selection, snap it to whole rows, or keep it in step with a sidebar or the URL.",
        },
        {
            kind: "code",
            text: `@tracked selection = { current: undefined, rows: CompactSelection.empty(), columns: CompactSelection.empty() };

// The grid changed nothing. This handler is the only thing that can move the selection.
handleSelectionChanged = (requested) => {
  if (requested.columns.hasIndex(0)) return;   // refuse: selection simply does not move
  this.selection = requested;
};`,
        },
        {
            kind: "list",
            items: [
                "Coordinates are your own space \u2014 no row-marker column \u2014 the same space `getCellContent` speaks.",
                "**Summarise what you stored, not what you were handed.** In controlled mode the callback's argument is a request; treating it as the current selection makes a refused one look like it landed.",
                "Passing `@selection` without a handler is a frozen selection: gestures are reported and nothing ever changes.",
                "**Porting from React:** source splits this across `gridSelection` (reads) and `onGridSelectionChange` (writes), so supplying only the callback yields a grid whose selection can never change. Here `@selection` alone decides it.",
            ],
        },
        {
            kind: "p",
            text: '**`@onSelectionCleared`** fires when the user clicks *outside the grid\'s content* \u2014 past the last row or column. It is deliberately narrow, matching source: it does not fire for Escape, a delete, or any other route to an empty selection, so it means "the user clicked away" rather than "the selection is empty now".',
        },
        {
            kind: "p",
            text: "**Fill handle.** Off by default. When on, dragging the small square at the selection's bottom-right corner tiles the selected pattern across the dragged region and reports the writes through `@onCellsEdited` — so the handler above is all you need.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @fillHandle={{true}}
  @allowedFillDirections="orthogonal"   {{! orthogonal | vertical | horizontal | any }}
  @getCellsForSelection={{true}}
  @onCellsEdited={{this.handleCellsEdited}}
  ...
/>`,
        },
        {
            kind: "p",
            text: "`@onFillPattern` fires first if you want to inspect the fill or `preventDefault()` it and do your own.",
        },
    ],
};
