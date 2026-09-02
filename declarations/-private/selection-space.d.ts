import type { GridSelection } from "../rendering/data-grid-types.ts";
declare const SELECTION_SPACE: unique symbol;
/** A `GridSelection` whose column indices include the row-marker offset -- renderer space. */
export type MangledSelection = GridSelection & {
    readonly [SELECTION_SPACE]: "mangled";
};
/** A `GridSelection` in the consumer's own column space -- what the public callbacks speak. */
export type ConsumerSelection = GridSelection & {
    readonly [SELECTION_SPACE]: "consumer";
};
/**
 * Declares that a freshly-built selection is already in consumer space.
 *
 * Only for selections constructed from consumer-space coordinates in the first place (the empty
 * selection, select-all). Anything *derived* from a mangled selection must go through
 * `unmangleSelection` instead -- that is the whole point of the brands.
 */
export declare function asConsumerSelection(selection: GridSelection): ConsumerSelection;
export declare const EMPTY_SELECTION: ConsumerSelection;
/**
 * Shifts every column coordinate in a selection by `offset`. Verbatim port of source's
 * `shiftSelection` (`data-editor.tsx:178-199`), including its early-out.
 *
 * Rows are untouched: the row-marker column is a *column*, so row selection is the same number in
 * both spaces. The early-out returning `input` unchanged is load-bearing for identity stability --
 * with `rowMarkers: "none"` (offset 0) the mangled selection *is* the consumer selection, so
 * `computeCanBlit`'s identity comparison of `DrawGridArg.selection` still holds.
 */
export declare function shiftSelection(input: GridSelection, offset: number): GridSelection;
/**
 * Memoized consumer-space -> mangled-space conversion.
 *
 * **The memoization is load-bearing, not a micro-optimization**, for exactly the reason
 * PORTING-NOTES.md's Phase 6 section records: `computeCanBlit` identity-compares
 * `DrawGridArg.selection`, so returning a freshly-shifted object on every draw would silently
 * disable the scroll blit fast path -- the same defect class this port carried undetected from
 * Phase 2 to Phase 6. Keyed on the consumer selection's identity plus the offset, which is
 * everything `shiftSelection` reads.
 */
export declare class MangledSelectionCache {
    private entry;
    get(selection: ConsumerSelection, rowMarkerOffset: number): MangledSelection;
}
/**
 * Consumer -> mangled, **uncached**, for a selection that did not come from `this.selection`.
 *
 * The only caller today is `onDelete` answering with a selection of its own (9g). Deliberately does
 * not go through `MangledSelectionCache`: that cache's single slot exists to keep
 * `DrawGridArg.selection` identity-stable across draws, and pushing a one-off value through it would
 * evict the entry the blit fast path depends on -- for a value that never reaches `DrawGridArg` at
 * all.
 */
export declare function mangleSelection(selection: ConsumerSelection, rowMarkerOffset: number): MangledSelection;
/** Mangled -> consumer. The inverse of `MangledSelectionCache.get`, and the only way back. */
export declare function unmangleSelection(selection: MangledSelection, rowMarkerOffset: number): ConsumerSelection;
/**
 * Mangled column index -> consumer column index. Scalar counterpart of `unmangleSelection`.
 *
 * The `GridSelection` brands above cannot catch a missed conversion on a `col: number` callback
 * (`onHeaderMenuClick` / `onHeaderIndicatorClick` shipped mangled from 2026-08-09 until §4b.7).
 * Use this at those boundaries rather than a raw subtraction, so a grep finds every scalar
 * conversion the brands do not police.
 */
export declare function unmangleColumn(mangledCol: number, rowMarkerOffset: number): number;
export {};
//# sourceMappingURL=selection-space.d.ts.map