import type { Section } from "./types.ts";

export const contextMenusSection: Section = {
    id: "context-menus",
    title: "Context menus",
    blocks: [
        {
            kind: "code",
            text: `<GlideDataGrid
  @onCellContextMenu={{this.cellMenu}}
  @onHeaderContextMenu={{this.headerMenu}}
  @onGroupHeaderContextMenu={{this.groupMenu}}
  ...
/>

cellMenu = (location, event) => {
  event.preventDefault();       // the browser menu is NOT suppressed unless you say so
  this.menu = { x: event.clientX, y: event.clientY, location };
};`,
        },
        {
            kind: "p",
            text: "The event carries `clientX`/`clientY` (viewport, for `position: fixed` chrome), `localEventX`/`localEventY` (grid-relative) and `bounds` (the target cell's rect). The row-marker column never fires these — it is not one of your columns.",
        },
    ],
};
