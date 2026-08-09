// The two column coordinate spaces a `GridSelection` can be expressed in, and the single
// conversion between them.
//
// THE PROBLEM THIS EXISTS TO SOLVE. When `rowMarkers !== "none"` the grid prepends a synthetic
// marker column at internal index 0, so the consumer's first column is internally index 1. Two
// spaces therefore exist:
//
//   * **consumer space** -- what `getCellContent`, `onCellsEdited`, the context-menu callbacks and
//     `onSelectionChanged` speak. Column 0 is the consumer's first column. This is the plain
//     `GridSelection` type.
//   * **mangled space** -- what the render engine, hit-testing, `computeCellRect` and every
//     `hit.location` speak. Column 0 is the row-marker column when one exists.
//
// `GridHostController` holds its selection in **consumer space** and converts on the way out to the
// renderer, mirroring source's `shiftSelection(newVal, -rowMarkerOffset)` at the
// `onGridSelectionChange` boundary (`data-editor.tsx:1009`) and `shiftSelection(gridSelectionOuter,
// rowMarkerOffset)` on the way in (`:970`).
//
// WHY THE BRANDS. The two spaces are the same TypeScript type, `rowMarkerOffset` is `0` whenever row
// markers are off, and a one-column error in a selection is not visibly wrong -- it just selects the
// neighbour. That is exactly this project's recurring silent-failure signature (see
// PORTING-NOTES.md's Phase 7e/8e/9h entries). So each space gets a phantom brand, erased at runtime,
// and the compiler -- not a reviewer -- is what notices a missing conversion.
//
// **Both** sides are branded, not just the mangled one, because a brand is an intersection: a
// `MangledSelection` is assignable to a bare `GridSelection`, so branding only the mangled side
// would catch "consumer value used where mangled was needed" while leaving the *other* direction --
// which is precisely the defect being fixed here, a mangled selection escaping through
// `onSelectionChanged` -- silently legal. There are exactly three places that mint a branded value
// (`MangledSelectionCache.get`, `unmangleSelection`, `asConsumerSelection`); everything else in the
// controller propagates one it was given, including through `selection-behavior.ts`'s
// space-preserving writers.
//
// Both aliases are internal. They must never appear in `GridHostArgs`, in `onSelectionChanged`'s
// signature, or in anything re-exported from the addon's public entrypoints -- those all speak plain
// `GridSelection`, which is (deliberately) what consumer space widens to for free.
import { CompactSelection } from "../rendering/data-grid-types.ts";
import type { GridSelection } from "../rendering/data-grid-types.ts";

declare const SELECTION_SPACE: unique symbol;

/** A `GridSelection` whose column indices include the row-marker offset -- renderer space. */
export type MangledSelection = GridSelection & { readonly [SELECTION_SPACE]: "mangled" };

/** A `GridSelection` in the consumer's own column space -- what the public callbacks speak. */
export type ConsumerSelection = GridSelection & { readonly [SELECTION_SPACE]: "consumer" };

/**
 * Declares that a freshly-built selection is already in consumer space.
 *
 * Only for selections constructed from consumer-space coordinates in the first place (the empty
 * selection, select-all). Anything *derived* from a mangled selection must go through
 * `unmangleSelection` instead -- that is the whole point of the brands.
 */
export function asConsumerSelection(selection: GridSelection): ConsumerSelection {
    return selection as ConsumerSelection;
}

export const EMPTY_SELECTION: ConsumerSelection = asConsumerSelection({
    current: undefined,
    rows: CompactSelection.empty(),
    columns: CompactSelection.empty(),
});

/**
 * Shifts every column coordinate in a selection by `offset`. Verbatim port of source's
 * `shiftSelection` (`data-editor.tsx:178-199`), including its early-out.
 *
 * Rows are untouched: the row-marker column is a *column*, so row selection is the same number in
 * both spaces. The early-out returning `input` unchanged is load-bearing for identity stability --
 * with `rowMarkers: "none"` (offset 0) the mangled selection *is* the consumer selection, so
 * `computeCanBlit`'s identity comparison of `DrawGridArg.selection` still holds.
 */
export function shiftSelection(input: GridSelection, offset: number): GridSelection {
    if (offset === 0 || (input.columns.length === 0 && input.current === undefined)) return input;

    return {
        current:
            input.current === undefined
                ? undefined
                : {
                      cell: [input.current.cell[0] + offset, input.current.cell[1]],
                      range: { ...input.current.range, x: input.current.range.x + offset },
                      rangeStack: input.current.rangeStack.map(r => ({ ...r, x: r.x + offset })),
                  },
        rows: input.rows,
        columns: input.columns.offset(offset),
    };
}

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
export class MangledSelectionCache {
    private entry: { readonly src: GridSelection; readonly offset: number; readonly value: MangledSelection } | undefined;

    public get(selection: ConsumerSelection, rowMarkerOffset: number): MangledSelection {
        const cached = this.entry;
        if (cached !== undefined && cached.src === selection && cached.offset === rowMarkerOffset) {
            return cached.value;
        }
        // The only place in the codebase that mints a `MangledSelection`.
        const value = shiftSelection(selection, rowMarkerOffset) as MangledSelection;
        this.entry = { src: selection, offset: rowMarkerOffset, value };
        return value;
    }
}

/** Mangled -> consumer. The inverse of `MangledSelectionCache.get`, and the only way back. */
export function unmangleSelection(selection: MangledSelection, rowMarkerOffset: number): ConsumerSelection {
    return asConsumerSelection(shiftSelection(selection, -rowMarkerOffset));
}
