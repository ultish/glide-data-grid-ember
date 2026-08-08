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
            text: `@action
handleSelectionChanged(selection) {
  // selection.current?.cell   -> [col, row] of the focused cell
  // selection.current?.range  -> { x, y, width, height }
  // selection.rows / .columns -> CompactSelection (sparse, iterable, .hasIndex(), .length)
  this.selectedRowCount = selection.rows.length;
}`,
        },
        {
            kind: "p",
            text: "`@onSelectionChanged` reports **displayed** rows. That is deliberate — it is what is visually selected. Contrast the *write* path under sorting, where displayed-space is a trap.",
        },
        { kind: "p", text: "**Row reordering.** Setting `@onRowMoved` both enables the drag and draws the handle dots on the marker cells. It needs a marker column — that column is what you grab. The grid previews the move live and throws the preview away on drop, so you must reorder your data:" },
        {
            kind: "code",
            text: `<GlideDataGrid @rowMarkers="both" @onRowMoved={{this.handleRowMoved}} ... />

@action
handleRowMoved(from, to) {
  const next = [...this.people];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  this.people = next;
}`,
        },
        { kind: "p", text: "**Fill handle.** Off by default. When on, dragging the small square at the selection's bottom-right corner tiles the selected pattern across the dragged region and reports the writes through `@onCellsEdited` — so the handler above is all you need." },
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
        { kind: "p", text: "`@onFillPattern` fires first if you want to inspect the fill or `preventDefault()` it and do your own." },
    ],
};
