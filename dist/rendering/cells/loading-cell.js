import { withAlpha } from '../color-parser.js';
import { roundedRect } from '../render/data-grid-lib.js';
import { GridCellKind } from '../data-grid-types.js';

// Ported from `packages/core/src/cells/loading-cell.tsx` (Phase 4a), near-verbatim -- pure canvas
// drawing, no editor, not read-write.
// returns a "random" number between -1 and 1
function getRandomNumber(x, y) {
  let seed = x * 49_632 + y * 325_176;

  // Inline Xorshift algorithm
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return seed / 0xff_ff_ff_ff * 2;
}
const loadingCellRenderer = {
  getAccessibilityString: () => "",
  kind: GridCellKind.Loading,
  needsHover: false,
  useLabel: false,
  needsHoverPosition: false,
  measure: () => 120,
  draw: a => {
    const {
      cell,
      col,
      row,
      ctx,
      rect,
      theme
    } = a;
    if (cell.skeletonWidth === undefined || cell.skeletonWidth === 0) {
      return;
    }
    let width = cell.skeletonWidth;
    if (cell.skeletonWidthVariability !== undefined && cell.skeletonWidthVariability > 0) {
      width += Math.round(getRandomNumber(col, row) * cell.skeletonWidthVariability);
    }
    const hpad = theme.cellHorizontalPadding;
    if (width + hpad * 2 >= rect.width) {
      width = rect.width - hpad * 2 - 1;
    }
    const rectHeight = cell.skeletonHeight ?? Math.min(18, rect.height - 2 * theme.cellVerticalPadding);
    roundedRect(ctx, rect.x + hpad, rect.y + (rect.height - rectHeight) / 2, width, rectHeight, theme.roundingRadius ?? 3);
    ctx.fillStyle = withAlpha(theme.textDark, 0.1);
    ctx.fill();
  },
  onPaste: () => undefined
};

export { loadingCellRenderer };
//# sourceMappingURL=loading-cell.js.map
