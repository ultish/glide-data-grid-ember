import { CompactSelection } from './data-grid-types.js';

// Framework-agnostic port of `packages/core/src/internal/data-grid/use-selection-behavior.ts`
// (Phase 3a of the Ember port). Source was a React hook (`useSelectionBehavior`) returning
// `[setCurrent, setSelectedRows, setSelectedColumns]` memoized callbacks that closed over a
// `gridSelection` prop + `setGridSelection` callback. There is no persistent state of this
// module's own to manage (unlike `AnimationQueue`, which genuinely owns a queue/rAF handle) --
// every function here is a pure `(currentSelection, ...) => nextSelection` transform, so the
// "de-hooking" here is simply: drop `React.useCallback`, thread `gridSelection` through as an
// explicit first parameter instead of a closed-over prop.
//
// Callers (e.g. `GridHostController`) own the actual mutable `GridSelection` and are responsible
// for calling these functions with the current value and applying the returned value back.

/**
 * The type of selection blending to use:
 * - `exclusive`: Only one type of selection can be made at a time.
 * - `mixed`: Multiple types of selection can be made at a time, but only when a multi-key (e.g., Cmd/Ctrl) is held.
 * - `additive`: Multiple types of selection can be made at a time, and selections accumulate without a modifier.
 */

/** Mirrors source's `rangeSelect` prop union (`DataEditorProps["rangeSelect"]`). */

/** Mirrors source's inline `SelectionTrigger` type (not exported by source, redeclared here). */

/**
 * Port of `useSelectionBehavior`'s `setCurrent`. Computes the next `GridSelection` for a
 * cell/range selection change (plain click, shift-extend, or drag-extend). Pure -- does not
 * mutate `gridSelection`.
 *
 * `append && rangeSelect` being one of the multi-range modes pushes the previous range onto
 * `rangeStack` (multi-rect/multi-cell selection); `trigger === "drag"` preserves the *previous*
 * selection's `rangeStack` so an in-progress drag can keep growing a multi-range selection instead
 * of collapsing it.
 *
 * **Space-preserving**, hence the generic: every column index in the result comes either from
 * `valueIn` or from `gridSelection`, so the caller's coordinate space (consumer or mangled -- see
 * `-private/selection-space.ts`) survives the call. The single `as T` below is that invariant
 * stated once, in the one place it is actually true, rather than as a cast at each of the six call
 * sites in `GridHostController`.
 */
function setCurrentSelection(gridSelection, valueIn, expand, append, trigger, options) {
  const {
    rangeBehavior,
    columnBehavior,
    rowBehavior,
    rangeSelect,
    rangeSelectionColumnSpanning
  } = options;
  let value = valueIn;
  if ((rangeSelect === "cell" || rangeSelect === "multi-cell") && value !== undefined) {
    value = {
      ...value,
      range: {
        x: value.cell[0],
        y: value.cell[1],
        width: 1,
        height: 1
      }
    };
  }
  if (!rangeSelectionColumnSpanning && value !== undefined && value.range.width > 1) {
    value = {
      ...value,
      range: {
        ...value.range,
        width: 1,
        x: value.cell[0]
      }
    };
  }
  const rangeMixable = rangeBehavior === "mixed" && (append || trigger === "drag") || rangeBehavior === "additive";
  const allowColumnCoSelect = (columnBehavior === "mixed" || columnBehavior === "additive") && rangeMixable;
  const allowRowCoSelect = (rowBehavior === "mixed" || rowBehavior === "additive") && rangeMixable;
  let newVal = {
    current: value === undefined ? undefined : {
      ...value,
      rangeStack: trigger === "drag" ? gridSelection.current?.rangeStack ?? [] : []
    },
    columns: allowColumnCoSelect ? gridSelection.columns : CompactSelection.empty(),
    rows: allowRowCoSelect ? gridSelection.rows : CompactSelection.empty()
  };
  const addLastRange = append && (rangeSelect === "multi-rect" || rangeSelect === "multi-cell");
  if (addLastRange && newVal.current !== undefined && gridSelection.current !== undefined) {
    newVal = {
      ...newVal,
      current: {
        ...newVal.current,
        rangeStack: [...gridSelection.current.rangeStack, gridSelection.current.range]
      }
    };
  }
  return {
    selection: newVal,
    expand
  };
}

/** Port of `useSelectionBehavior`'s `setSelectedRows`. Pure -- does not mutate `gridSelection`.
 *  Space-preserving (see `setCurrentSelection`'s note): it only ever passes `current`/`columns`
 *  through untouched, and rows carry no column coordinate at all. */
function setSelectedRows(gridSelection, newRowsIn, append, allowMixed, options) {
  const {
    rangeBehavior,
    columnBehavior,
    rowBehavior
  } = options;
  let newRows = newRowsIn ?? gridSelection.rows;
  if (append !== undefined) {
    newRows = newRows.add(append);
  }
  if (rowBehavior === "exclusive" && newRows.length > 0) {
    return {
      current: undefined,
      columns: CompactSelection.empty(),
      rows: newRows
    };
  }
  const rangeMixed = allowMixed && rangeBehavior === "mixed" || rangeBehavior === "additive";
  const columnMixed = allowMixed && columnBehavior === "mixed" || columnBehavior === "additive";
  const current = !rangeMixed ? undefined : gridSelection.current;
  return {
    current,
    columns: columnMixed ? gridSelection.columns : CompactSelection.empty(),
    rows: newRows
  };
}

/** Port of `useSelectionBehavior`'s `setSelectedColumns`. Pure -- does not mutate `gridSelection`.
 *  Space-preserving: `newColsIn`/`append` are column indices in the *caller's* space and are
 *  returned in it unchanged. */
function setSelectedColumns(gridSelection, newColsIn, append, allowMixed, options) {
  const {
    rangeBehavior,
    columnBehavior,
    rowBehavior
  } = options;
  let newCols = newColsIn ?? gridSelection.columns;
  if (append !== undefined) {
    newCols = newCols.add(append);
  }
  if (columnBehavior === "exclusive" && newCols.length > 0) {
    return {
      current: undefined,
      rows: CompactSelection.empty(),
      columns: newCols
    };
  }
  const rangeMixed = allowMixed && rangeBehavior === "mixed" || rangeBehavior === "additive";
  const rowMixed = allowMixed && rowBehavior === "mixed" || rowBehavior === "additive";
  const current = !rangeMixed ? undefined : gridSelection.current;
  return {
    current,
    rows: rowMixed ? gridSelection.rows : CompactSelection.empty(),
    columns: newCols
  };
}

export { setCurrentSelection, setSelectedColumns, setSelectedRows };
//# sourceMappingURL=selection-behavior.js.map
