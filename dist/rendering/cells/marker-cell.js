import { InnerGridCellKind } from '../data-grid-types.js';
import { getMiddleCenterBias } from '../render/data-grid-lib.js';
import { drawCheckbox } from '../render/draw-checkbox.js';

// Ported near-verbatim from `packages/core/src/cells/marker-cell.tsx` (Phase 7e) -- the row-marker
// column's *body* cells: the row number, the per-row selection checkbox, or both.
//
// Why this landed so late, since it matters for reading the rest of this port's history:
// Phase 3a implemented row-marker *selection logic* (click/drag/shift-extend) and the *header*
// select-all checkbox as bespoke code directly in `GridHostController`, and PORTING-NOTES.md
// recorded that as "row markers are already handled without going through the registry, unlike
// source". That was only ever true of the header cell. The body cells were always routed through
// the registry as `InnerGridCellKind.Marker` (see `mangledGetCellContent`), and the registry had no
// `Marker` case -- so `getCellRenderer` returned `undefined` and the marker column painted
// *nothing*: no numbers, no checkboxes, and no background fill either (so a sticky marker column
// showed the next column's text bleeding through underneath it). Silent, because an unmatched cell
// kind is not an error anywhere in the draw loop. Nothing before Phase 7c's demo actually turned
// row markers on, which is why it went unnoticed from Phase 3a through Phase 6.
//
// `MarkerCell` is an `InnerOnlyGridCell` (like `NewRowCell`): `allowOverlay: false`, no
// `provideEditor`, never returned by a consumer's `getCellContent` -- `GridHostController`
// synthesizes it for the synthetic marker column only.
const markerCellRenderer = {
  getAccessibilityString: c => c.row.toString(),
  kind: InnerGridCellKind.Marker,
  needsHover: true,
  needsHoverPosition: false,
  drawPrep: prepMarkerRowCell,
  measure: () => 44,
  draw: a => drawMarkerRowCell(a, a.cell.row, a.cell.checked, a.cell.markerKind, a.cell.drawHandle, a.cell.checkboxStyle),
  // Ported for source fidelity, but currently unreachable in this port: `GridHostController`
  // handles marker-column clicks itself in `dispatchCellMouseDown`'s row-marker branch (Phase 3a),
  // and `isInnerOnlyCellKind` keeps inner-only cells out of the renderer `onClick` dispatch
  // entirely. Kept so the renderer stays a faithful, self-contained port -- if the bespoke
  // row-marker click handling is ever unified onto the registry, this is already correct.
  onClick: e => {
    const {
      bounds,
      cell,
      posX: x,
      posY: y
    } = e;
    const {
      width,
      height
    } = bounds;
    const centerX = cell.drawHandle ? 7 + (width - 7) / 2 : width / 2;
    const centerY = height / 2;
    if (Math.abs(x - centerX) <= 10 && Math.abs(y - centerY) <= 10) {
      return {
        ...cell,
        checked: !cell.checked
      };
    }
    return undefined;
  },
  onPaste: () => undefined
};
function prepMarkerRowCell(args, lastPrep) {
  const {
    ctx,
    theme
  } = args;
  const newFont = theme.markerFontFull;
  const result = lastPrep ?? {};
  if (result?.font !== newFont) {
    ctx.font = newFont;
    result.font = newFont;
  }
  result.deprep = deprepMarkerRowCell;
  ctx.textAlign = "center";
  return result;
}

// `textAlign` is set to "center" above and must be restored, or every subsequently-drawn cell in
// the same frame inherits it.
function deprepMarkerRowCell(args) {
  const {
    ctx
  } = args;
  ctx.textAlign = "start";
}
function drawMarkerRowCell(args, index, checked, markerKind, drawHandle, style) {
  const {
    ctx,
    rect,
    hoverAmount,
    theme
  } = args;
  const {
    x,
    y,
    width,
    height
  } = rect;
  const checkedboxAlpha = checked ? 1 : markerKind === "checkbox-visible" ? 0.6 + 0.4 * hoverAmount : hoverAmount;
  if (markerKind !== "number" && checkedboxAlpha > 0) {
    ctx.globalAlpha = checkedboxAlpha;
    const offsetAmount = 7 * (checked ? hoverAmount : 1);
    drawCheckbox(ctx, theme, checked, drawHandle ? x + offsetAmount : x, y, drawHandle ? width - offsetAmount : width, height, true, undefined, undefined, theme.checkboxMaxSize, "center", style);
    if (drawHandle) {
      ctx.globalAlpha = hoverAmount;
      ctx.beginPath();
      for (const xOffset of [3, 6]) {
        for (const yOffset of [-5, -1, 3]) {
          ctx.rect(x + xOffset, y + height / 2 + yOffset, 2, 2);
        }
      }
      ctx.fillStyle = theme.textLight;
      ctx.fill();
      ctx.beginPath();
    }
    ctx.globalAlpha = 1;
  }
  if (markerKind === "number" || markerKind === "both" && !checked) {
    const text = index.toString();
    const fontStyle = theme.markerFontFull;
    const start = x + width / 2;
    if (markerKind === "both" && hoverAmount !== 0) {
      ctx.globalAlpha = 1 - hoverAmount;
    }
    ctx.fillStyle = theme.textLight;
    ctx.font = fontStyle;
    ctx.fillText(text, start, y + height / 2 + getMiddleCenterBias(ctx, fontStyle));
    if (hoverAmount !== 0) {
      ctx.globalAlpha = 1;
    }
  }
}

export { markerCellRenderer };
//# sourceMappingURL=marker-cell.js.map
