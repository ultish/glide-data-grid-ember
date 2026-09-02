import { GridCellKind, BooleanEmpty, booleanCellIsEditable, BooleanIndeterminate } from '../data-grid-types.js';
import { getSquareWidth, getSquareXPosFromAlign, pointIsWithinBB, getSquareBB } from '../common/utils.js';
import { drawCheckbox } from '../render/draw-checkbox.js';

// Ported from `packages/core/src/cells/boolean-cell.tsx` (Phase 4a). Drawing reuses the already-
// ported `drawCheckbox` (`render/draw-checkbox.ts`) and hit-test geometry helpers
// (`getSquareWidth`/`getSquareXPosFromAlign`/`getSquareBB`/`pointIsWithinBB`, `common/utils.ts`)
// verbatim.
//
// **No `provideEditor` here, by design** -- boolean cells never open the DOM overlay editor
// (`BooleanCell.allowOverlay` is statically typed `false`). Source's own toggle-on-activation
// bypass (`reselect()`'s `if (c.kind === GridCellKind.Boolean && activation.inputType ===
// "keyboard" ...)` branch, which calls `onCellsEdited` + damage directly instead of
// `setOverlaySimple`) is ported into `GridHostController.activateCell` (Enter/double-click/
// second-click path), not here -- see PORTING-NOTES.md's Phase 4a section. The `onClick` hook
// below covers the OTHER toggle trigger: a single click landing directly on the checkbox glyph,
// wired generically via `GridHostController.dispatchCellMouseDown` calling any renderer's
// `onClick` hook (not boolean-specific plumbing -- future cell types with click affordances, e.g.
// a uri-cell's link icon, reuse the same wiring).
/** Mirrors source's `data-editor-fns.ts#toggleBoolean` exactly. */
function toggleBoolean(data) {
  return data !== true;
}
function isOverEditableRegion(e) {
  const {
    cell,
    posX: pointerX,
    posY: pointerY,
    bounds,
    theme
  } = e;
  const {
    width,
    height,
    x: cellX,
    y: cellY
  } = bounds;
  const maxWidth = cell.maxSize ?? theme.checkboxMaxSize;
  const cellCenterY = Math.floor(bounds.y + height / 2);
  const checkBoxWidth = getSquareWidth(maxWidth, height, theme.cellVerticalPadding);
  const posX = getSquareXPosFromAlign(cell.contentAlign ?? "center", cellX, width, theme.cellHorizontalPadding, checkBoxWidth);
  const bb = getSquareBB(posX, cellCenterY, checkBoxWidth);
  const checkBoxClicked = pointIsWithinBB(cellX + pointerX, cellY + pointerY, bb);
  return booleanCellIsEditable(cell) && checkBoxClicked;
}
const booleanCellRenderer = {
  getAccessibilityString: c => c.data?.toString() ?? "false",
  kind: GridCellKind.Boolean,
  needsHover: true,
  useLabel: false,
  needsHoverPosition: true,
  measure: () => 50,
  draw: a => drawBoolean(a, a.cell.data, booleanCellIsEditable(a.cell), a.cell.maxSize ?? a.theme.checkboxMaxSize, a.cell.hoverEffectIntensity ?? 0.35),
  onDelete: c => ({
    ...c,
    data: false
  }),
  onSelect: e => {
    if (isOverEditableRegion(e)) {
      e.preventDefault();
    }
  },
  onClick: e => {
    if (isOverEditableRegion(e)) {
      return {
        ...e.cell,
        data: toggleBoolean(e.cell.data)
      };
    }
    return undefined;
  },
  onPaste: (toPaste, cell) => {
    let newVal = BooleanEmpty;
    if (toPaste.toLowerCase() === "true") {
      newVal = true;
    } else if (toPaste.toLowerCase() === "false") {
      newVal = false;
    } else if (toPaste.toLowerCase() === "indeterminate") {
      newVal = BooleanIndeterminate;
    }
    return newVal === cell.data ? undefined : {
      ...cell,
      data: newVal
    };
  }
};
function drawBoolean(args, data, canEdit, maxSize, hoverEffectIntensity) {
  if (!canEdit && data === BooleanEmpty) {
    return;
  }
  const {
    ctx,
    hoverAmount,
    theme,
    rect,
    highlighted,
    hoverX,
    hoverY,
    cell: {
      contentAlign
    }
  } = args;
  const {
    x,
    y,
    width: w,
    height: h
  } = rect;

  // Don't set the global alpha unnecessarily
  let shouldRestoreAlpha = false;
  if (hoverEffectIntensity > 0) {
    let alpha = canEdit ? 1 - hoverEffectIntensity + hoverEffectIntensity * hoverAmount : 0.4;
    if (data === BooleanEmpty) {
      alpha *= hoverAmount;
    }
    if (alpha === 0) {
      return;
    }
    if (alpha < 1) {
      shouldRestoreAlpha = true;
      ctx.globalAlpha = alpha;
    }
  }
  drawCheckbox(ctx, theme, data, x, y, w, h, highlighted, hoverX, hoverY, maxSize, contentAlign);
  if (shouldRestoreAlpha) {
    ctx.globalAlpha = 1;
  }
}

export { booleanCellRenderer, toggleBoolean };
//# sourceMappingURL=boolean-cell.js.map
