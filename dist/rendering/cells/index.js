import { InnerGridCellKind, GridCellKind } from '../data-grid-types.js';
import { textCellRenderer } from './text-cell.js';
import { numberCellRenderer } from './number-cell.js';
import { booleanCellRenderer } from './boolean-cell.js';
export { toggleBoolean } from './boolean-cell.js';
import { loadingCellRenderer } from './loading-cell.js';
import { protectedCellRenderer } from './protected-cell.js';
import { rowIDCellRenderer } from './row-id-cell.js';
import { uriCellRenderer } from './uri-cell.js';
import { markdownCellRenderer } from './markdown-cell.js';
import { bubbleCellRenderer } from './bubble-cell.js';
import { drilldownCellRenderer } from './drilldown-cell.js';
import { imageCellRenderer } from './image-cell.js';
import { newRowCellRenderer } from './new-row-cell.js';
import { markerCellRenderer } from './marker-cell.js';

// Cell-type registry (Phase 4a) -- replaces `src/rendering/-temp-text-cell-renderer.ts`'s
// smoke-test stub with a real `GetCellRendererCallback` dispatching by `cell.kind`, same overall
// shape as the stub it replaces (single `switch`, one cast per branch -- `GetCellRendererCallback`
// is generic over the specific cell type per call, so a cast is unavoidable inside a dispatcher
// that switches at runtime).
//
// Scope: text/number/boolean/loading/protected/row-id (Phase 4a), uri/markdown (Phase 4b), plus
// bubble/drilldown (Phase 4c), image + new-row/trailing-blank-row (Phase 4d), and the
// row-marker body cell (Phase 7e -- see `marker-cell.ts` for why it was missing until then). Every other
// `GridCellKind` (custom) returns `undefined` here, same as an unregistered kind always has -- the
// render engine already handles that gracefully (draws an empty cell), and
// `GridHostController`'s edit/paste/delete paths already have a non-renderer-backed fallback for
// exactly this reason.
const getCellRenderer = cell => {
  switch (cell.kind) {
    case GridCellKind.Text:
      return textCellRenderer;
    case GridCellKind.Number:
      return numberCellRenderer;
    case GridCellKind.Boolean:
      return booleanCellRenderer;
    case GridCellKind.Loading:
      return loadingCellRenderer;
    case GridCellKind.Protected:
      return protectedCellRenderer;
    case GridCellKind.RowID:
      return rowIDCellRenderer;
    case GridCellKind.Uri:
      return uriCellRenderer;
    case GridCellKind.Markdown:
      return markdownCellRenderer;
    case GridCellKind.Bubble:
      return bubbleCellRenderer;
    case GridCellKind.Drilldown:
      return drilldownCellRenderer;
    case GridCellKind.Image:
      return imageCellRenderer;
    case InnerGridCellKind.NewRow:
      return newRowCellRenderer;
    case InnerGridCellKind.Marker:
      return markerCellRenderer;
    default:
      return undefined;
  }
};

export { booleanCellRenderer, bubbleCellRenderer, drilldownCellRenderer, getCellRenderer, imageCellRenderer, loadingCellRenderer, markdownCellRenderer, markerCellRenderer, newRowCellRenderer, numberCellRenderer, protectedCellRenderer, rowIDCellRenderer, textCellRenderer, uriCellRenderer };
//# sourceMappingURL=index.js.map
