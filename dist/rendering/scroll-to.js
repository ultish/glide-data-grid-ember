// The arithmetic behind `GlideDataGridApi.scrollTo` (9f). Framework-agnostic port of the middle of
// source's `scrollTo` (`packages/core/src/data-editor/data-editor.tsx:1568-1651`).
//
// Extracted rather than left in `GridHostController` for the usual reason (the controller cannot be
// imported by vitest), and because this is the part that is easy to get subtly wrong: three
// alignment modes crossed with two axes, plus two independent reasons each axis can be pinned.
//
// **Coordinate space.** Everything here is *root-relative pixels* -- the same space
// `computeBounds`, `computeCellRect` and hit-testing already use, where `0,0` is the grid's top-left
// corner including its header. Source does the same algebra in client coordinates, adding
// `scrollBounds.left`/`.top` to every term; the comparison is translation-invariant, so dropping the
// constant is not a divergence, only less arithmetic.

/** `"start"` puts the target against the leading edge, `"end"` against the trailing one, `"center"`
 *  in the middle. Omitted means "scroll the minimum distance that makes it visible". */

/** Which axes may move. Source's `dir` parameter. */

/**
 * How far to scroll, in pixels, to bring `target` into the visible window. `{x: 0, y: 0}` means
 * "already where it should be" -- the caller should then not touch `scrollLeft`/`scrollTop` at all,
 * since assigning them can cancel a smooth scroll already in flight.
 *
 * Positive means scroll right/down.
 */
function computeScrollDelta(viewport, params = {}) {
  const {
    target,
    width,
    height,
    frozenWidth,
    headerHeight
  } = viewport;
  const paddingX = params.paddingX ?? 0;
  const paddingY = params.paddingY ?? 0;
  const bounds = {
    x: target.x - paddingX,
    y: target.y - paddingY,
    width: target.width + 2 * paddingX,
    height: target.height + 2 * paddingY
  };

  // The window the target has to end up inside. Its edges start at the visible, non-pinned area
  // and are then narrowed by the alignment mode -- an aligned scroll is expressed as "shrink the
  // acceptable window to exactly the target's size, at the requested edge", which is source's
  // trick and is why one delta calculation serves all four modes.
  let left = frozenWidth;
  let right = width;
  let top = headerHeight;
  let bottom = height - (viewport.trailingRowHeight ?? 0);
  const minX = target.width + paddingX * 2;
  switch (params.hAlign) {
    case "start":
      right = left + minX;
      break;
    case "end":
      left = right - minX;
      break;
    case "center":
      left = Math.floor((left + right) / 2) - minX / 2;
      right = left + minX;
      break;
  }
  const minY = target.height + paddingY * 2;
  switch (params.vAlign) {
    case "start":
      bottom = top + minY;
      break;
    case "end":
      top = bottom - minY;
      break;
    case "center":
      top = Math.floor((top + bottom) / 2) - minY / 2;
      bottom = top + minY;
      break;
  }
  let x = 0;
  if (left > bounds.x) {
    x = bounds.x - left;
  } else if (right < bounds.x + bounds.width) {
    x = bounds.x + bounds.width - right;
  }
  let y = 0;
  if (top > bounds.y) {
    y = bounds.y - top;
  } else if (bottom < bounds.y + bounds.height) {
    y = bounds.y + bounds.height - bottom;
  }
  const dir = params.dir ?? "both";
  // Note this is an `else if` in source, not two independent guards: asking to scroll a frozen
  // column *vertically* still scrolls vertically. Keeping the same shape keeps the same answer.
  if (dir === "vertical" || params.targetColumnIsFrozen === true) {
    x = 0;
  } else if (dir === "horizontal" || params.targetRowIsFrozen === true) {
    y = 0;
  }
  return {
    x,
    y
  };
}

export { computeScrollDelta };
//# sourceMappingURL=scroll-to.js.map
