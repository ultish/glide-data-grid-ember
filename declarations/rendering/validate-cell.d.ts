import type { GridCell, EditableGridCell, ValidatedGridCell, Item } from "./data-grid-types.ts";
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
export type ValidateCellCallback = (cell: Item, newValue: EditableGridCell, prevValue: GridCell) => boolean | ValidatedGridCell;
/** What `applyCellValidation` decided about one proposed value. */
export interface CellValidationResult {
    /** The value to keep working with -- the coerced cell when the callback returned one, otherwise
     *  the proposed value unchanged. */
    readonly value: GridCell;
    /** `false` only when the callback explicitly rejected the value. Commit is suppressed then. */
    readonly isValid: boolean;
}
/**
 * Runs `validateCell` against one proposed value, resolving source's three return shapes into the
 * pair the caller actually needs.
 *
 * No callback, or a non-editable proposed value, is always valid and always passes through
 * unchanged -- source's own short-circuit, and the reason a read-only or `Custom` cell never trips
 * validation it was never offered to.
 */
export declare function applyCellValidation(location: Item, newValue: GridCell, prevValue: GridCell, validateCell: ValidateCellCallback | undefined): CellValidationResult;
//# sourceMappingURL=validate-cell.d.ts.map