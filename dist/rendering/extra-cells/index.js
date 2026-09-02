import { GridCellKind } from '../data-grid-types.js';
import { sparklineCellRenderer } from './sparkline-cell.js';
import { starCellRenderer } from './star-cell.js';
import { rangeCellRenderer } from './range-cell.js';
import { spinnerCellRenderer } from './spinner-cell.js';
import { tagsCellRenderer } from './tags-cell.js';
import { dropdownCellRenderer } from './dropdown-cell.js';
import { multiSelectCellRenderer } from './multi-select-cell.js';
import { linksCellRenderer } from './links-cell.js';
import { datePickerCellRenderer } from './date-picker-cell.js';
export { formatValueForHTMLInput } from './date-picker-cell.js';
import { buttonCellRenderer } from './button-cell.js';
import { treeViewCellRenderer } from './tree-view-cell.js';
import { userProfileCellRenderer } from './user-profile-cell.js';
import { articleCellRenderer } from './article-cell.js';

// Registry for Phase 5's "extra cell types" (`packages/cells` in source) -- see PORTING-NOTES.md's
// Phase 5 research section for the full architecture rationale. Unlike Phase 4's built-in cells
// (dispatched by `cell.kind` via a `switch`, see `../cells/index.ts`), every cell here is a
// `CustomRenderer<CustomCell<Props>>`: `kind: GridCellKind.Custom`, matched via `isMatch` against
// a `kind` string discriminant inside `cell.data`. This mirrors source's actual extension
// mechanism (`DataEditorProps.customRenderers`), and this port's `GetCellRendererCallback` was
// already a plain consumer-suppliable function since Phase 2/4a -- no registry-merging machinery
// needed in `GridHostController` itself, just this combinator.
//
// Established as shared infra for all of Phase 5's sub-phases (5a: sparkline/star/range/spinner,
// 5b: tags/dropdown/multi-select/links, 5c: date-picker/button/tree-view/user-profile/article) --
// whichever sub-phase runs first creates this file, the others extend `allExtraCells` with their
// own renderers. Re-check this file's current state before editing if working concurrently with
// another sub-phase (same coordination pattern that worked for Phase 4b/4c's `cells/index.ts`).
/** Every Phase 5 `CustomRenderer`, in one array -- pass to `createCombinedCellRenderer` below
 * (or to any other `customRenderers`-style consumer) to make all of them usable at once. Extend
 * this array (and the imports/exports above it) when a new sub-phase's cells land, don't replace
 * it -- this file is a shared coordination point across concurrently-run Phase 5 sub-phases. */
const allExtraCells = [
// 5a
sparklineCellRenderer, starCellRenderer, rangeCellRenderer, spinnerCellRenderer,
// 5b
tagsCellRenderer, dropdownCellRenderer, multiSelectCellRenderer, linksCellRenderer,
// 5c
datePickerCellRenderer, buttonCellRenderer, treeViewCellRenderer, userProfileCellRenderer, articleCellRenderer];

/** Combines a Phase 4-style built-in `GetCellRendererCallback` (dispatches by `cell.kind`) with a
 * list of Phase 5 `CustomRenderer`s (dispatch by `isMatch` against `GridCellKind.Custom` cells) --
 * tries `base(cell)` first, then falls back to the first matching extra renderer. Mirrors source's
 * own built-in-then-`customRenderers`-fallback order (`data-editor.tsx`'s `getCellRenderer`). */
function createCombinedCellRenderer(base, extras) {
  return cell => {
    const baseRenderer = base(cell);
    if (baseRenderer !== undefined) return baseRenderer;
    if (cell.kind !== GridCellKind.Custom) return undefined;
    const match = extras.find(r => r.isMatch(cell));
    return match;
  };
}

export { allExtraCells, articleCellRenderer, buttonCellRenderer, createCombinedCellRenderer, datePickerCellRenderer, dropdownCellRenderer, linksCellRenderer, multiSelectCellRenderer, rangeCellRenderer, sparklineCellRenderer, spinnerCellRenderer, starCellRenderer, tagsCellRenderer, treeViewCellRenderer, userProfileCellRenderer };
//# sourceMappingURL=index.js.map
