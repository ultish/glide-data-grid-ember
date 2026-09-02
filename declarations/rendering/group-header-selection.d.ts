import { CompactSelection } from "./data-grid-types.ts";
import type { Slice } from "./data-grid-types.ts";
/** The only thing this module needs off a mapped column. */
export interface GroupedColumnLike {
    readonly group?: string;
}
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
export declare function computeGroupHeaderSpan(mappedColumns: readonly GroupedColumnLike[], col: number, rowMarkerOffset: number): Slice | undefined;
/** Exactly the `newCols`/`append` pair `setSelectedColumns` takes, so the caller is a one-liner. */
export interface GroupHeaderSelectionUpdate {
    readonly newColumns: CompactSelection | undefined;
    readonly append: Slice | undefined;
    /** The resolved group span, for callers that want to report or debug it. */
    readonly span: Slice;
}
export interface GroupHeaderSelectionInput {
    readonly mappedColumns: readonly GroupedColumnLike[];
    /** Mangled column index the group header was clicked at. */
    readonly col: number;
    readonly rowMarkerOffset: number;
    /** Currently-selected columns, mangled space. */
    readonly selectedColumns: CompactSelection;
    readonly columnSelect: "none" | "single" | "multi";
    readonly columnSelectionMode: "auto" | "multi";
    /** Cmd on macOS, Ctrl elsewhere -- resolved by the caller, as source does. */
    readonly isMultiKey: boolean;
    readonly isTouch?: boolean;
}
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
export declare function computeGroupHeaderSelection(input: GroupHeaderSelectionInput): GroupHeaderSelectionUpdate | undefined;
//# sourceMappingURL=group-header-selection.d.ts.map