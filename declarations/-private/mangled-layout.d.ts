import type { MappedGridColumn } from "../rendering/render/data-grid-lib.ts";
import type { InnerGridColumn } from "../rendering/data-grid-types.ts";
import type { Theme } from "../rendering/theme.ts";
/** The synthetic row-marker column's inputs, or `undefined` when `rowMarkers === "none"`.
 *
 *  Deliberately a plain value object rather than a prebuilt column: the caller derives
 *  `checked` from live selection state on every draw, so it cannot hand over an identity-stable
 *  column, and the cache compares these three primitives instead. */
export interface RowMarkerColumnSpec {
    readonly width: number;
    /** Tri-state header checkbox: `true` = all rows selected, `false` = none, `undefined` = some. */
    readonly checked: boolean | undefined;
    /** Mirrors source's `headerRowMarkerDisabled` -- set when `rowSelect !== "multi"`. */
    readonly headerDisabled: boolean;
    /** 9g: source's `rowMarkerTheme`, applied as this column's `themeOverride`. Compared **by
     *  identity** in the cache below, which is why the arg's doc comment asks for a stable object:
     *  a fresh literal per render rebuilds `mappedColumns` and costs the scroll blit fast path. */
    readonly themeOverride: Partial<Theme> | undefined;
}
export interface MangledLayout {
    /** The consumer's columns with the row-marker column prepended (when enabled). Same space as
     *  `mappedColumns`; kept on the result because `themeForCell` needs the un-mapped column. */
    readonly mangledColumns: readonly InnerGridColumn[];
    /** What `DrawGridArg.mappedColumns` is fed. **Identity-stable across draws.** */
    readonly mappedColumns: readonly MappedGridColumn[];
    /** `freezeColumns` in mangled space -- the row marker is always sticky when enabled, mirroring
     *  source's `mangledFreezeColumns` (`data-editor.tsx:3994`). */
    readonly freezeColumns: number;
}
/**
 * Builds -- and then keeps returning -- the mangled column layout for one grid.
 *
 * The cache is keyed on **exactly what the result is built from**: the (already identity-stable)
 * sized-column array, the three row-marker inputs, and the consumer's `freezeColumns`. That
 * enumeration is the load-bearing part, and it is the same discipline PORTING-NOTES.md's Phase 6
 * and Phase 8a sections record for the other caches in this port: *list what the computation reads,
 * and check every entry appears in the key*. Nothing here reads anything else -- in particular it
 * never touches `args`, so there is no captured object that could drift from a live one.
 */
export declare class MangledLayoutCache {
    private entry;
    get(columns: readonly InnerGridColumn[], marker: RowMarkerColumnSpec | undefined, freezeColumns: number): MangledLayout;
}
//# sourceMappingURL=mangled-layout.d.ts.map