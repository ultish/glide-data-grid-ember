/**
 * 4.4 — external HTML5 drag-and-drop. The two decisions the `dragstart`/`dragover` handlers make,
 * extracted so they are testable: the controller itself cannot be imported by vitest.
 *
 * This is the browser's own drag-and-drop — dragging data *out of* the grid and dropping data
 * *into* it. Nothing to do with the internal column-reorder, row-reorder and fill drags, which are
 * plain mouse gestures (`autoscroll.ts`, `drag-and-fill.ts`).
 */

/** Source's `isDraggable: boolean | "cell" | "header"` (`data-grid.tsx:193`). */

/**
 * The drag-relevant kind of a hit. This is source's `GridMouseEventArgs["kind"]`, which is **not**
 * the same set as this port's `MouseHit["kind"]`: `resolveMouseHit` folds the column header and the
 * group header band into one `"header"` kind and distinguishes them by row (-1 vs -2), where source
 * keeps `"group-header"` separate.
 *
 * That distinction is load-bearing here and nowhere else: `isDraggable: "header"` is compared
 * against the kind directly, so in source a drag from the *group* band does not match it. Folding
 * the two would silently make this port's `"header"` mean one more thing than upstream's.
 */

/** Source's `kind` for a `MouseHit`, whose header row encodes which of the two bands was hit. */
function dragKindForHit(kind, row) {
  if (kind !== "header") return kind;
  return row === -2 ? "group-header" : "header";
}

/**
 * May a drag start from this hit? Port of the two guards at the top of source's `onDragStartImpl`
 * (`data-grid.tsx:1460,1470`), which `preventDefault()` and bail rather than reporting anything.
 *
 * `true` allows a drag from anywhere, including out-of-bounds — that is source's `isDraggable !==
 * true` short-circuit, not an oversight to tidy.
 */
function canDragFrom(isDraggable, kind) {
  if (isDraggable === undefined || isDraggable === false) return false;
  if (isDraggable === true) return true;
  return kind === isDraggable;
}

/**
 * Does the scroller element carry the `draggable` attribute? Source:
 * `draggable={isDraggable === true || typeof isDraggable === "string"}`
 * (`scrolling-data-grid.tsx:260`) — i.e. any string, whether or not it is one the drag will accept.
 */
function isDraggableAttr(isDraggable) {
  return isDraggable === true || typeof isDraggable === "string";
}

/**
 * `onDragOverCell` fires only when the pointer crosses into a *different* cell, not on every
 * `dragover` event (which fire continuously while the pointer is stationary). Source keeps the last
 * target in an `activeDropTarget` ref and compares both axes (`data-grid.tsx:1631-1638`).
 */
function hasDropTargetChanged(active, next) {
  if (active === undefined) return true;
  return active[0] !== next[0] || active[1] !== next[1];
}

export { canDragFrom, dragKindForHit, hasDropTargetChanged, isDraggableAttr };
//# sourceMappingURL=external-drag.js.map
