import { GridCellKind } from '../data-grid-types.js';

// Ported from `packages/core/src/cells/protected-cell.tsx` (Phase 4a), verbatim -- pure canvas
// drawing (a row of little "password dots"), no editor, not read-write.
function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}
const protectedCellRenderer = {
  getAccessibilityString: () => "",
  measure: () => 108,
  kind: GridCellKind.Protected,
  needsHover: false,
  needsHoverPosition: false,
  draw: drawProtectedCell,
  onPaste: () => undefined
};
function drawProtectedCell(args) {
  const {
    ctx,
    theme,
    rect
  } = args;
  const {
    x,
    y,
    height: h
  } = rect;
  ctx.beginPath();
  const radius = 2.5;
  let xStart = x + theme.cellHorizontalPadding + radius;
  const center = y + h / 2;
  const p = Math.cos(degreesToRadians(30)) * radius;
  const q = Math.sin(degreesToRadians(30)) * radius;
  for (let i = 0; i < 12; i++) {
    ctx.moveTo(xStart, center - radius);
    ctx.lineTo(xStart, center + radius);
    ctx.moveTo(xStart + p, center - q);
    ctx.lineTo(xStart - p, center + q);
    ctx.moveTo(xStart - p, center - q);
    ctx.lineTo(xStart + p, center + q);
    xStart += 8;
  }
  ctx.lineWidth = 1.1;
  ctx.lineCap = "square";
  ctx.strokeStyle = theme.textLight;
  ctx.stroke();
}

export { protectedCellRenderer };
//# sourceMappingURL=protected-cell.js.map
