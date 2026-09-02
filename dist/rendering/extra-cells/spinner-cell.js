import { GridCellKind } from '../data-grid-types.js';

// Ported from `packages/cells/src/cells/spinner-cell.tsx` (Phase 5a of the Ember port).
//
// Trivial draw-only loading indicator, similar in spirit to Phase 4a's `loading-cell.ts` but
// animated: an arc sweeps continuously by deriving progress from `window.performance.now()` and
// calling `args.requestAnimationFrame()` every draw to keep re-scheduling itself. That hook is
// already fully wired end to end by the ported render engine (`render/data-grid-render.cells.ts`'s
// `animRequest`, confirmed in `cell-types.ts`'s `DrawArgs.requestAnimationFrame` field) --
// no `GridHostController` changes needed for this to animate. No editor.
function isSpinnerCell(cell) {
  return cell.data.kind === "spinner-cell";
}
const spinnerCellRenderer = {
  kind: GridCellKind.Custom,
  isMatch: isSpinnerCell,
  draw: args => {
    const {
      ctx,
      theme,
      rect,
      requestAnimationFrame
    } = args;
    const progress = globalThis.performance.now() % 1000 / 1000;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.min(12, rect.height / 6), Math.PI * 2 * progress, Math.PI * 2 * progress + Math.PI * 1.5);
    ctx.strokeStyle = theme.textMedium;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    requestAnimationFrame();
  },
  onPaste: (_val, data) => data
};

export { spinnerCellRenderer };
//# sourceMappingURL=spinner-cell.js.map
