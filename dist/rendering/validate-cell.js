import { isEditableGridCell } from './data-grid-types.js';

// `validateCell` -- the consumer's veto/normalise hook for a live overlay edit (Phase 9g).
//
// The *type* has been sitting in `data-grid-types.ts` since Phase 1 with nothing calling it. This
// module is the rule that calls it, kept out of `grid-host-controller.ts` so it can be unit-tested:
// the controller needs a real DOM and a real canvas, so anything living there is only ever verified
// by hand in a browser.
//
// WHERE SOURCE APPLIES IT (and, just as importantly, where it does not). Source hands `validateCell`
// to its overlay editor and to nothing else (`data-editor.tsx:4321` ->
// `data-grid-overlay-editor.tsx:83,96`): it runs on the editor's *initial* value and again on every
// `onChange`, and the result gates the final commit. Paste, fill, cut and delete deliberately do NOT
// consult it. This port matches that -- widening it would be a silent behavioural divergence in the
// direction consumers cannot see.

/**
 * Consumer hook to reject or normalise an edit before it commits. Mirrors source's `validateCell`.
 *
 * - `false` marks the value invalid: the editor stays open and usable, but closing it commits
 *   nothing (source's `isValid` gate).
 * - `true` accepts the value as-is.
 * - a `ValidatedGridCell` accepts a *coerced* value -- the editor immediately swaps to it, which is
 *   how "strip non-digits as you type" is expressed.
 *
 * `cell` is in the consumer's own coordinate space (no row-marker column), matching `onCellsEdited`.
 */

/** What `applyCellValidation` decided about one proposed value. */

/**
 * Runs `validateCell` against one proposed value, resolving source's three return shapes into the
 * pair the caller actually needs.
 *
 * No callback, or a non-editable proposed value, is always valid and always passes through
 * unchanged -- source's own short-circuit, and the reason a read-only or `Custom` cell never trips
 * validation it was never offered to.
 */
function applyCellValidation(location, newValue, prevValue, validateCell) {
  if (validateCell === undefined || !isEditableGridCell(newValue)) {
    return {
      value: newValue,
      isValid: true
    };
  }
  const result = validateCell(location, newValue, prevValue);
  if (result === false) return {
    value: newValue,
    isValid: false
  };
  if (result === true) return {
    value: newValue,
    isValid: true
  };
  return {
    value: result,
    isValid: true
  };
}

export { applyCellValidation };
//# sourceMappingURL=validate-cell.js.map
