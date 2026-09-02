import { GridCellKind } from '../data-grid-types.js';
import { roundedRect, getMiddleCenterBias } from '../render/data-grid-lib.js';
import { interpolateColors } from '../color-parser.js';

// Ported from `packages/cells/src/cells/button-cell.tsx` (Phase 5c of the Ember port).
//
// An in-cell clickable action button: `draw()` paints a rounded-rect button + centered label with
// a hover-fade animation (reusing this port's `AnimationManager`/`requestAnimationFrame` plumbing
// already wired generically through `DrawArgs`, same mechanism `boolean-cell.ts`'s checkbox hover
// uses); `onClick` hit-tests the pointer against the button's interior region and, if hit, fires
// `cell.data.onClick?.()` -- a plain side-effecting callback carried on the cell's own `data`, with
// **no cell mutation**. This does NOT follow `boolean-cell.ts`'s pattern of returning a new cell
// from `onClick` (boolean toggles its own `data`; button has nothing to toggle) -- `onClick` here
// always returns `undefined`, so `GridHostController.dispatchCellMouseDown`'s "if a new cell comes
// back, commit it" branch never fires; the click is still fully consumed (matches source, which
// returns `undefined` from its `onClick` too) because the hook ran at all. `onSelect` calls
// `preventDefault()` unconditionally (source does the same, not gated on hover position) to
// suppress the normal activation/overlay path entirely -- there is no editor (`provideEditor:
// undefined`, `ButtonCell` is statically `readonly: true` in source, no text to edit).
function isButtonCell(cell) {
  return cell.data.kind === "button-cell";
}
function unpackColor(color, theme, hoverAmount) {
  if (typeof color === "string") {
    const themed = theme[color];
    return typeof themed === "string" ? themed : color;
  }
  let [normal, hover] = color;
  const themedNormal = theme[normal];
  const themedHover = theme[hover];
  if (typeof themedNormal === "string") normal = themedNormal;
  if (typeof themedHover === "string") hover = themedHover;
  return interpolateColors(normal, hover, hoverAmount);
}
function getButtonInterior(bounds, theme) {
  return {
    x: Math.floor(bounds.x + theme.cellHorizontalPadding + 1),
    y: Math.floor(bounds.y + theme.cellVerticalPadding + 1),
    width: Math.ceil(bounds.width - theme.cellHorizontalPadding * 2 - 1),
    height: Math.ceil(bounds.height - theme.cellVerticalPadding * 2 - 1)
  };
}
function getIsHovered(bounds, posX, posY, theme) {
  const {
    x,
    y,
    width,
    height
  } = getButtonInterior(bounds, theme);
  return posX !== undefined && posY !== undefined && posX + bounds.x >= x && posX + bounds.x < x + width && posY + bounds.y >= y && posY + bounds.y < y + height;
}
const buttonCellRenderer = {
  kind: GridCellKind.Custom,
  isMatch: isButtonCell,
  needsHoverPosition: true,
  needsHover: true,
  onSelect: a => a.preventDefault(),
  onClick: a => {
    const {
      cell,
      theme,
      bounds,
      posX,
      posY
    } = a;
    if (getIsHovered(bounds, posX, posY, theme)) cell.data.onClick?.();
    return undefined;
  },
  drawPrep: args => {
    args.ctx.textAlign = "center";
    return {
      deprep: a => {
        a.ctx.textAlign = "start";
      }
    };
  },
  draw: (args, cell) => {
    const {
      ctx,
      theme,
      rect,
      hoverX,
      hoverY,
      frameTime,
      drawState,
      requestAnimationFrame,
      overrideCursor
    } = args;
    const {
      title,
      backgroundColor,
      color,
      borderColor,
      borderRadius
    } = cell.data;
    const {
      x,
      y,
      width,
      height
    } = getButtonInterior(rect, theme);
    if (width <= 0 || height <= 0) return;
    const isHovered = getIsHovered(rect, hoverX, hoverY, theme);

    // eslint-disable-next-line prefer-const
    let [state, setState] = drawState;
    if (isHovered) overrideCursor?.("pointer");
    state ??= {
      hovered: false,
      animationStartTime: 0
    };
    if (isHovered !== state.hovered) {
      state = {
        ...state,
        hovered: isHovered,
        animationStartTime: frameTime
      };
      setState(state);
    }
    const progress = Math.min(1, (frameTime - state.animationStartTime) / 200);
    const hoverAmount = isHovered ? progress : 1 - progress;
    if (progress < 1) requestAnimationFrame(state);
    const themeRecord = theme;
    if (backgroundColor !== undefined) {
      ctx.beginPath();
      roundedRect(ctx, x, y, width, height, borderRadius ?? theme.roundingRadius ?? 0);
      ctx.fillStyle = unpackColor(backgroundColor, themeRecord, hoverAmount);
      ctx.fill();
    }
    if (borderColor !== undefined) {
      ctx.beginPath();
      roundedRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, borderRadius ?? theme.roundingRadius ?? 0);
      ctx.strokeStyle = unpackColor(borderColor, themeRecord, hoverAmount);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = unpackColor(color ?? theme.accentColor, themeRecord, hoverAmount);
    ctx.fillText(title, x + width / 2, y + height / 2 + getMiddleCenterBias(ctx, theme.baseFontFull));
  },
  provideEditor: undefined
};

export { buttonCellRenderer };
//# sourceMappingURL=button-cell.js.map
