import type { Section } from "./types.ts";

export const gotchasSection: Section = {
    id: "gotchas",
    title: "Gotchas worth knowing once",
    blocks: [
        {
            kind: "list",
            items: [
                "**The grid is a canvas.** DOM-assertion testing buys almost nothing above the component boundary — there are no cell elements to query. Push assertions down into plain functions, or probe canvas pixels.",
                "**The container needs a height.** Repeated because it is the most common first problem.",
                "**`@rows` past the end of your data is your bug, not the grid's** — `@getCellContent` will be asked for those cells and must return something.",
                "**The row-marker column is not one of your columns.** Every callback that hands you a column index has already removed it.",
                "**Overlay editors clamp themselves to the window**, so one opened on a cell at the right edge nudges back into view rather than being cut off.",
                "**Not implemented in this port** (deliberate, tracked): accessibility/ARIA, touch input, row grouping, undo/redo.",
            ],
        },
    ],
};
