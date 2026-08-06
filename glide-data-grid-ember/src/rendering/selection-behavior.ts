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

export interface SetCurrentResult {
    readonly selection: GridSelection;
    // Mirrors the `expand` argument source's `setCurrent` forwards verbatim into its
    // `setGridSelection(newVal, expand)` callback -- when true, source runs the result through
    // `expandSelection` (data-editor/data-editor-fns.ts) to grow the selection to cover any
    // spanned/merged cells touched by it. `expandSelection` is NOT ported in 3a (no consumer of
    // this port uses `GridCell.span` yet) -- this flag is preserved on the result so a caller that
    // adds span support later doesn't need to change this module's signature, but
    // `GridHostController` currently ignores it and applies `selection` as-is.
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
 */
export function setCurrentSelection(
    gridSelection: GridSelection,
    valueIn: Pick<NonNullable<GridSelection["current"]>, "cell" | "range"> | undefined,
    expand: boolean,
    append: boolean,
    trigger: SelectionTrigger,
    options: SelectionBehaviorOptions
): SetCurrentResult {
    const { rangeBehavior, columnBehavior, rowBehavior, rangeSelect, rangeSelectionColumnSpanning } = options;
    let value = valueIn;

    if ((rangeSelect === "cell" || rangeSelect === "multi-cell") && value !== undefined) {
        value = {
            ...value,
            range: {
                x: value.cell[0],
                y: value.cell[1],
                width: 1,
                height: 1,
            },
        };
    }

    if (!rangeSelectionColumnSpanning && value !== undefined && value.range.width > 1) {
        value = {
            ...value,
            range: {
                ...value.range,
                width: 1,
                x: value.cell[0],
            },
        };
    }

    const rangeMixable = (rangeBehavior === "mixed" && (append || trigger === "drag")) || rangeBehavior === "additive";
    const allowColumnCoSelect = (columnBehavior === "mixed" || columnBehavior === "additive") && rangeMixable;
    const allowRowCoSelect = (rowBehavior === "mixed" || rowBehavior === "additive") && rangeMixable;

    let newVal: GridSelection = {
        current:
            value === undefined
                ? undefined
                : {
                      ...value,
                      rangeStack: trigger === "drag" ? (gridSelection.current?.rangeStack ?? []) : [],
                  },
        columns: allowColumnCoSelect ? gridSelection.columns : CompactSelection.empty(),
        rows: allowRowCoSelect ? gridSelection.rows : CompactSelection.empty(),
    };

    const addLastRange = append && (rangeSelect === "multi-rect" || rangeSelect === "multi-cell");
    if (addLastRange && newVal.current !== undefined && gridSelection.current !== undefined) {
        newVal = {
            ...newVal,
            current: {
                ...newVal.current,
                rangeStack: [...gridSelection.current.rangeStack, gridSelection.current.range],
            },
        };
    }

    return { selection: newVal, expand };
}

/** Port of `useSelectionBehavior`'s `setSelectedRows`. Pure -- does not mutate `gridSelection`. */
export function setSelectedRows(
    gridSelection: GridSelection,
    newRowsIn: CompactSelection | undefined,
    append: Slice | number | undefined,
    allowMixed: boolean,
    options: Pick<SelectionBehaviorOptions, "rangeBehavior" | "columnBehavior" | "rowBehavior">
): GridSelection {
    const { rangeBehavior, columnBehavior, rowBehavior } = options;
    let newRows = newRowsIn ?? gridSelection.rows;
    if (append !== undefined) {
        newRows = newRows.add(append);
    }
    if (rowBehavior === "exclusive" && newRows.length > 0) {
        return {
            current: undefined,
            columns: CompactSelection.empty(),
            rows: newRows,
        };
    }
    const rangeMixed = (allowMixed && rangeBehavior === "mixed") || rangeBehavior === "additive";
    const columnMixed = (allowMixed && columnBehavior === "mixed") || columnBehavior === "additive";
    const current = !rangeMixed ? undefined : gridSelection.current;
    return {
        current,
        columns: columnMixed ? gridSelection.columns : CompactSelection.empty(),
        rows: newRows,
    };
}

/** Port of `useSelectionBehavior`'s `setSelectedColumns`. Pure -- does not mutate `gridSelection`. */
export function setSelectedColumns(
    gridSelection: GridSelection,
    newColsIn: CompactSelection | undefined,
    append: number | Slice | undefined,
    allowMixed: boolean,
    options: Pick<SelectionBehaviorOptions, "rangeBehavior" | "columnBehavior" | "rowBehavior">
): GridSelection {
    const { rangeBehavior, columnBehavior, rowBehavior } = options;
    let newCols = newColsIn ?? gridSelection.columns;
    if (append !== undefined) {
        newCols = newCols.add(append);
    }
    if (columnBehavior === "exclusive" && newCols.length > 0) {
        return {
            current: undefined,
            rows: CompactSelection.empty(),
            columns: newCols,
        };
    }
    const rangeMixed = (allowMixed && rangeBehavior === "mixed") || rangeBehavior === "additive";
    const rowMixed = (allowMixed && rowBehavior === "mixed") || rowBehavior === "additive";
    const current = !rangeMixed ? undefined : gridSelection.current;
    return {
        current,
        rows: rowMixed ? gridSelection.rows : CompactSelection.empty(),
        columns: newCols,
    };
}
