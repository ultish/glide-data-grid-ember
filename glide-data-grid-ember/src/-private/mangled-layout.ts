// The row-marker column mangling + `mapColumns` step, with the identity cache that makes it safe
// to call per draw. Extracted from `GridHostController` for backlog item **9k**.
//
// WHY THIS IS A SEPARATE MODULE RATHER THAN ANOTHER IN-FILE CACHE. `GridHostController` already
// carries several hand-written identity caches (`mergedThemeCache`, `mangledCellContentCache`,
// `autoSizeCache`) and this one is written in exactly that style. It lives here for one reason:
// `grid-host-controller.ts` cannot be imported by the vitest suite (its constructor needs a real
// DOM and a real canvas), and this project has proved twice over that an identity regression is
// invisible to every other check it runs -- `tsc` passes, the build passes, the grid looks and
// behaves perfectly, and the scroll blit fast path simply stops engaging. A cache whose whole
// purpose is reference stability deserves a test that fails loudly, so it lives where a test can
// reach it. See `mangled-layout.test.ts`.
//
// WHAT IT FIXES. `computeCanBlit` (`rendering/render/data-grid-render.blit.ts`) compares
// `mappedColumns` specially: if the array reference differs it walks the columns with a per-column
// `deepEqual`, and it **gives up entirely (`return false`) above 100 columns**. Rebuilding the
// mapped array on every draw therefore cost a per-column comparison per frame at small column
// counts and the entire blit fast path at large ones. Memoizing on identity makes the common case
// (`current.mappedColumns === last.mappedColumns`) hit the cheap `===` branch instead.
import { mapColumns } from "../rendering/render/data-grid-lib.ts";
import type { MappedGridColumn } from "../rendering/render/data-grid-lib.ts";
import type { InnerGridColumn } from "../rendering/data-grid-types.ts";

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

/** Source's marker-column literal, minus the parts the caller supplies. */
const ROW_MARKER_CHECKBOX_STYLE: "square" | "circle" = "square";

interface CacheEntry {
    readonly columns: readonly InnerGridColumn[];
    // `hasMarker` is tracked separately from the three field copies below because
    // `markerChecked` is legitimately `undefined` (the indeterminate header checkbox), so
    // "every field is undefined" cannot on its own distinguish "no marker column" from
    // "marker column in its indeterminate state".
    readonly hasMarker: boolean;
    readonly markerWidth: number | undefined;
    readonly markerChecked: boolean | undefined;
    readonly markerHeaderDisabled: boolean | undefined;
    readonly freezeColumns: number;
    readonly value: MangledLayout;
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
export class MangledLayoutCache {
    private entry: CacheEntry | undefined;

    public get(
        columns: readonly InnerGridColumn[],
        marker: RowMarkerColumnSpec | undefined,
        freezeColumns: number
    ): MangledLayout {
        const cached = this.entry;
        if (
            cached !== undefined &&
            cached.columns === columns &&
            cached.freezeColumns === freezeColumns &&
            cached.hasMarker === (marker !== undefined) &&
            cached.markerWidth === marker?.width &&
            cached.markerChecked === marker?.checked &&
            cached.markerHeaderDisabled === marker?.headerDisabled
        ) {
            return cached.value;
        }

        const mangledColumns: readonly InnerGridColumn[] =
            marker === undefined
                ? columns
                : [
                      {
                          title: "",
                          width: marker.width,
                          hasMenu: false,
                          style: "normal",
                          rowMarker: ROW_MARKER_CHECKBOX_STYLE,
                          rowMarkerChecked: marker.checked,
                          headerRowMarkerDisabled: marker.headerDisabled,
                      },
                      ...columns,
                  ];

        const mangledFreeze = Math.min(mangledColumns.length, freezeColumns + (marker === undefined ? 0 : 1));
        const value: MangledLayout = {
            mangledColumns,
            mappedColumns: mapColumns(mangledColumns, mangledFreeze),
            freezeColumns: mangledFreeze,
        };
        this.entry = {
            columns,
            hasMarker: marker !== undefined,
            markerWidth: marker?.width,
            markerChecked: marker?.checked,
            markerHeaderDisabled: marker?.headerDisabled,
            freezeColumns,
            value,
        };
        return value;
    }
}
