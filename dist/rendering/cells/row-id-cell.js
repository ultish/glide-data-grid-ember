import { GridCellKind } from '../data-grid-types.js';
import { drawTextCell, prepTextCell } from '../render/data-grid-lib.js';
import { GrowingEntry } from '../../-private/growing-entry.js';

// Ported from `packages/core/src/cells/row-id-cell.tsx` (Phase 4a). Drawing reuses the already-
// ported `drawTextCell`/`prepTextCell`. The editor uses the plain-DOM `GrowingEntry`
// (`src/-private/growing-entry.ts`) instead of source's React `<GrowingEntry>` -- see that file's
// header comment for why.
//
// Note source's editor is disabled unless `cell.readonly === false` *explicitly* (`disabled={value
// .readonly !== false}` -- i.e. `readonly: undefined`, the common case, still disables it). Ported
// verbatim below. In practice a row-id column is almost always constructed with `allowOverlay:
// false` anyway (see the test-app demo), so this editor rarely opens at all -- it exists for the
// rare case a consumer explicitly wants an inspectable-but-not-typically-editable ID cell.
const rowIDCellRenderer = {
  getAccessibilityString: c => c.data?.toString() ?? "",
  kind: GridCellKind.RowID,
  needsHover: false,
  needsHoverPosition: false,
  drawPrep: (a, b) => prepTextCell(a, b, a.theme.textLight),
  draw: a => drawTextCell(a, a.cell.data, a.cell.contentAlign),
  measure: (ctx, cell, theme) => ctx.measureText(cell.data).width + theme.cellHorizontalPadding * 2,
  provideEditor: () => p => {
    const entry = new GrowingEntry({
      value: p.value.data,
      theme: p.theme,
      highlight: p.isHighlighted,
      readOnly: p.value.readonly !== false,
      validatedSelection: p.validatedSelection,
      onChange: value => p.onChange({
        ...p.value,
        data: value
      })
    });
    return {
      element: entry.element,
      focus: () => entry.focus(),
      destroy: () => entry.destroy()
    };
  },
  onPaste: () => undefined
};

export { rowIDCellRenderer };
//# sourceMappingURL=row-id-cell.js.map
