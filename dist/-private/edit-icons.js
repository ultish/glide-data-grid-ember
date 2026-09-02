// Plain-DOM ports of source's `EditPencil`/`Checkmark` icon components (`packages/core/src/
// common/utils.tsx`, Phase 4b) -- used by the uri-cell and markdown-cell overlay editors' edit-
// pencil / checkmark-to-commit affordances. Built directly as inline SVG DOM nodes rather than a
// `.gts` component, same rationale as `GrowingEntry` (see its header comment): both call sites are
// plain-DOM editor factories with no Ember rendering context available. Each path keeps source's
// `stroke="currentColor"` so the icon's color is driven by the parent element's CSS `color`
// (callers set that on the button they wrap the icon in), matching source's `fgColor ?? "currentColor"`
// default exactly (no cell renderer in this port ever passes a non-default `fgColor`).
const SVG_NS = "http://www.w3.org/2000/svg";
function buildIcon(paths) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill", "none");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
  }
  return svg;
}

/** Source: `EditPencil` (`common/utils.tsx`). */
function createEditPencilIcon() {
  return buildIcon(["M12.7073 7.05029C7.87391 11.8837 10.4544 9.30322 6.03024 13.7273C5.77392 13.9836 5.58981 14.3071 5.50189 14.6587L4.52521 18.5655C4.38789 19.1148 4.88543 19.6123 5.43472 19.475L9.34146 18.4983C9.69313 18.4104 10.0143 18.2286 10.2706 17.9722L16.9499 11.2929", "M20.4854 4.92901L19.0712 3.5148C18.2901 2.73375 17.0238 2.73375 16.2428 3.5148L14.475 5.28257C15.5326 7.71912 16.4736 8.6278 18.7176 9.52521L20.4854 7.75744C21.2665 6.97639 21.2665 5.71006 20.4854 4.92901Z"]);
}

/** Source: `Checkmark` (`common/utils.tsx`). */
function createCheckmarkIcon() {
  return buildIcon(["M19 6L10.3802 17L5.34071 11.8758"]);
}

export { createCheckmarkIcon, createEditPencilIcon };
//# sourceMappingURL=edit-icons.js.map
