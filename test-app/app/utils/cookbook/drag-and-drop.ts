// 4.4 — external HTML5 drag-and-drop.
//
// Its own chapter rather than a section of "Selection" because the two things people mean by
// "dragging" in a data grid are unrelated implementations: the row-reorder and fill drags in that
// chapter are mouse gestures the grid handles end to end, while this is the browser's own
// drag-and-drop, which crosses the application boundary and is mostly *your* code.
import type { Section } from "./types.ts";

export const dragAndDropSection: Section = {
    id: "drag-and-drop",
    title: "Dragging data in and out",
    blocks: [
        {
            kind: "p",
            text: "This is the **browser's** drag-and-drop — carrying a cell's value out to another application, or dropping a file, a URL or a chunk of text onto a cell. It is unrelated to `@onRowMoved` and the fill handle in *Selection, row markers, reordering, fill*, which never leave the grid.",
        },
        {
            kind: "p",
            text: "The two directions are independent, and each is switched on by a different arg. `@isDraggable` makes the grid a drag **source**; `@onDrop` makes it a drop **target**. Wiring one does nothing for the other.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @columns={{this.columns}}
  @rows={{this.rows}}
  @getCellContent={{this.getCellContent}}
  @isDraggable="cell"
  @onDragStart={{this.handleDragStart}}
  @onDragOverCell={{this.handleDragOverCell}}
  @onDragLeave={{this.handleDragLeave}}
  @onDrop={{this.handleDrop}}
/>`,
        },
        {
            kind: "p",
            text: "**Dragging out.** `@onDragStart` is where the drag gets its payload. Call `setData(mime, payload)` — and note the rule that catches everyone: **a drag that sets no data is cancelled**. That is deliberate, and it is what makes `@isDraggable` safe to switch on before the callback exists.",
        },
        {
            kind: "code",
            text: `handleDragStart = args => {
  if (args.kind !== "cell") { args.preventDefault(); return; }   // refuse outright
  const [col, row] = args.location;                              // your coordinate space
  args.setData("text/plain", this.people[row].name);
  // Optional — the grid otherwise renders the dragged cell itself as the drag image.
  // args.setDragImage(someElement, 8, 8);
};`,
        },
        {
            kind: "list",
            items: [
                '`@isDraggable` takes `true`, `"cell"` or `"header"`. The string form restricts which band a drag may start from; `true` allows any, including the group-header band and the space past the last row.',
                '`"header"` means the **column** header only — a drag starting on the group band above it is refused. Check `args.kind` if you want both.',
                "A drag starting on the row-marker column is refused before your callback runs, so `location[0]` is never negative here.",
                "`args.preventDefault()` refuses the drag; `args.defaultPrevented()` reads that back.",
                "The default drag image is the dragged cell or header, rendered into an offscreen canvas. `setDragImage` replaces it with any element already in the document.",
            ],
        },
        {
            kind: "p",
            text: "**Dropping in.** `@onDrop` receives the target cell in **your** coordinate space (the row-marker column already subtracted, like every other callback) and the live `DataTransfer`. Nothing is written for you — a drop is an edit you apply yourself.",
        },
        {
            kind: "code",
            text: `handleDrop = (cell, dataTransfer) => {
  const text = dataTransfer?.getData("text/plain") ?? "";
  const [col, row] = cell;
  if (text === "" || row < 0) return;              // row -1 / -2 is a header, not a cell

  this.people[row].name = text;                     // your data, your write

  // REQUIRED: nothing has told the grid to repaint. See the note below.
  this.gridApi?.updateCells([{ cell }]);
};`,
        },
        {
            kind: "note",
            text: "A drop is a write **you** initiate, so the grid has no idea it happened — and if `getCellContent` reads tracked state lazily (which it does), autotracking never saw the read either. Call `updateCells` for the cells you changed, or the callback will fire, your data will change, and the cell will go on showing its old value. This is the same rule as the tracking one in *Performance rules*; it bites here because a drop *looks* like an edit the grid made.",
        },
        {
            kind: "list",
            items: [
                "`@onDragOverCell` fires **once per cell** the pointer crosses, not once per `dragover` event — so it is a safe place to move a drop indicator without throttling.",
                "Per the HTML spec the `DataTransfer`'s *contents* are unreadable until drop; `dataTransfer.types` is available during the drag, which is enough to decide whether you will accept it.",
                "`@onDragLeave` fires when the drag leaves the grid. Pair it with `@onDragOverCell` to clear that indicator.",
                "Setting `@onDrop` is what cancels the drag-over event, which is what marks the grid a valid drop zone. A grid with only `@onDragOverCell` watches drags pass over without claiming them.",
                "A drop on a header reports row `-1` (or `-2` for the group band). Guard for it — the grid does not.",
            ],
        },
        {
            kind: "p",
            text: "The **Full grid demo**'s `Drag out:` toggle cycles `off` / `cells` / `headers`, and its status row reports every drag event. Dropping text onto a text, markdown or URI cell writes it; dropping onto a number or sparkline cell is refused there, which is a decision the consumer makes and not the grid.",
        },
    ],
};
