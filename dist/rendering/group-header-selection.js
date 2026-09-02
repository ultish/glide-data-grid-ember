import { CompactSelection } from './data-grid-types.js';
import { isGroupEqual } from './render/data-grid-lib.js';

// Framework-agnostic port of source's `handleGroupHeaderSelection`
// (`packages/core/src/data-editor/data-editor.tsx:2142-2189`).
//
// This lives out here rather than inside `GridHostController` for the reason recorded in
// PORTING-NOTES.md's 9g section: the controller cannot be imported by vitest, so extracting the
// pure part is the only way any of this logic gets a test. The controller half is then just
// "call this, feed the answer to `setSelectedColumns`".
//
// **Everything here is in MANGLED (hit-test) column space** -- the same space
// `computeMangledLayout().mappedColumns` and `GridSelection.columns` use inside the controller.
// `rowMarkerOffset` is the left bound of the group walk, exactly as in source.

/** The only thing this module needs off a mapped column. */

/**
 * The span of contiguous columns sharing `col`'s group, as a `Slice` (`[start, end + 1]`).
 *
 * Port of the two walk loops at `data-editor.tsx:2153-2165`. Note the asymmetry, which is
 * source's: the leftward walk stops at `rowMarkerOffset` (the marker column is never part of a
 * group), the rightward one runs to the end of `mappedColumns`.
 *
 * Returns `undefined` when `col` is the row-marker column (or otherwise out of range) -- source's
 * `if (col < rowMarkerOffset) return;` guard at `:2149`.
 */
function computeGroupHeaderSpan(mappedColumns, col, rowMarkerOffset) {
  if (col < rowMarkerOffset) return undefined;
  const needle = mappedColumns[col];
  if (needle === undefined) return undefined;
  let start = col;
  let end = col;
  for (let i = col - 1; i >= rowMarkerOffset; i--) {
    const other = mappedColumns[i];
    if (other === undefined || !isGroupEqual(needle.group, other.group)) break;
    start--;
  }
  for (let i = col + 1; i < mappedColumns.length; i++) {
    const other = mappedColumns[i];
    if (other === undefined || !isGroupEqual(needle.group, other.group)) break;
    end++;
  }
  return [start, end + 1];
}

/** Exactly the `newCols`/`append` pair `setSelectedColumns` takes, so the caller is a one-liner. */

/**
 * Port of `handleGroupHeaderSelection` (`data-editor.tsx:2142-2189`).
 *
 * Returns `undefined` when nothing should change. Two guard conditions do that, and both are
 * easy to miss reading only the prop declarations:
 *
 * 1. **`columnSelect !== "multi"` selects nothing at all** (`:2143`). A group header is inherently
 *    a multi-column selection, so `"single"` and `"none"` both no-op -- clicking a group header
 *    under `columnSelect="single"` is *not* "select the one column under the pointer".
 * 2. **The row-marker column never selects** (`:2149`), via {@link computeGroupHeaderSpan}.
 */
function computeGroupHeaderSelection(input) {
  const {
    mappedColumns,
    col,
    rowMarkerOffset,
    selectedColumns,
    columnSelect,
    columnSelectionMode
  } = input;
  if (columnSelect !== "multi") return undefined;
  const span = computeGroupHeaderSpan(mappedColumns, col, rowMarkerOffset);
  if (span === undefined) return undefined;
  const [start, endExclusive] = span;

  // `isTouch` is always false in this port (touch is 9c, deferred) but is threaded through so the
  // branch matches source line-for-line if 9c ever lands.
  if (input.isMultiKey || input.isTouch === true || columnSelectionMode === "multi") {
    if (selectedColumns.hasAll(span)) {
      // Toggle the whole span back off, one index at a time -- `CompactSelection.remove`
      // takes a single index, and source does the same loop.
      let newVal = selectedColumns;
      for (let index = start; index < endExclusive; index++) {
        newVal = newVal.remove(index);
      }
      return {
        newColumns: newVal,
        append: undefined,
        span
      };
    }
    return {
      newColumns: undefined,
      append: span,
      span
    };
  }
  return {
    newColumns: CompactSelection.fromSingleSelection(span),
    append: undefined,
    span
  };
}

export { computeGroupHeaderSelection, computeGroupHeaderSpan };
//# sourceMappingURL=group-header-selection.js.map
