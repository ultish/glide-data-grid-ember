import { CompactSelection } from "./data-grid-types.ts";
import type { GridSelection, Slice } from "./data-grid-types.ts";
/**
 * The type of selection blending to use:
 * - `exclusive`: Only one type of selection can be made at a time.
 * - `mixed`: Multiple types of selection can be made at a time, but only when a multi-key (e.g., Cmd/Ctrl) is held.
 * - `additive`: Multiple types of selection can be made at a time, and selections accumulate without a modifier.
 */
export type SelectionBlending = "exclusive" | "mixed" | "additive";
/** Mirrors source's `rangeSelect` prop union (`DataEditorProps["rangeSelect"]`). */
export type RangeSelectMode = "none" | "cell" | "rect" | "multi-cell" | "multi-rect";
/** Mirrors source's inline `SelectionTrigger` type (not exported by source, redeclared here). */
export type SelectionTrigger = "click" | "drag" | "keyboard-nav" | "keyboard-select" | "edit";
export interface SelectionBehaviorOptions {
    readonly rangeBehavior: SelectionBlending;
    readonly columnBehavior: SelectionBlending;
    readonly rowBehavior: SelectionBlending;
    readonly rangeSelect: RangeSelectMode;
    readonly rangeSelectionColumnSpanning: boolean;
}
export interface SetCurrentResult<T extends GridSelection = GridSelection> {
    readonly selection: T;
    readonly expand: boolean;
}
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
export declare function setCurrentSelection<T extends GridSelection>(gridSelection: T, valueIn: Pick<NonNullable<GridSelection["current"]>, "cell" | "range"> | undefined, expand: boolean, append: boolean, trigger: SelectionTrigger, options: SelectionBehaviorOptions): SetCurrentResult<T>;
/** Port of `useSelectionBehavior`'s `setSelectedRows`. Pure -- does not mutate `gridSelection`.
 *  Space-preserving (see `setCurrentSelection`'s note): it only ever passes `current`/`columns`
 *  through untouched, and rows carry no column coordinate at all. */
export declare function setSelectedRows<T extends GridSelection>(gridSelection: T, newRowsIn: CompactSelection | undefined, append: Slice | number | undefined, allowMixed: boolean, options: Pick<SelectionBehaviorOptions, "rangeBehavior" | "columnBehavior" | "rowBehavior">): T;
/** Port of `useSelectionBehavior`'s `setSelectedColumns`. Pure -- does not mutate `gridSelection`.
 *  Space-preserving: `newColsIn`/`append` are column indices in the *caller's* space and are
 *  returned in it unchanged. */
export declare function setSelectedColumns<T extends GridSelection>(gridSelection: T, newColsIn: CompactSelection | undefined, append: number | Slice | undefined, allowMixed: boolean, options: Pick<SelectionBehaviorOptions, "rangeBehavior" | "columnBehavior" | "rowBehavior">): T;
//# sourceMappingURL=selection-behavior.d.ts.map