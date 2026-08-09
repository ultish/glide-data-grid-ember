// Phase 9k. The identity contract of `MangledLayoutCache`.
//
// WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS -- the same reason as
// `rendering/render/data-grid-render.blit.test.ts`, which it is the other half of. That file pins
// "changing a compared field's identity must defeat the blit". This one pins the producer side:
// `mappedColumns` must KEEP its identity across draws when nothing changed. Losing it costs a
// per-column `deepEqual` per frame at small column counts and, above 100 columns, the entire scroll
// blit fast path -- with no error, no warning and no visual difference. This port carried exactly
// that class of defect undetected from Phase 2 to Phase 6.
//
// The last `describe` block closes the loop by feeding real cache output into the real
// `computeCanBlit`, which is the property anyone actually cares about.
import { describe, expect, it } from "vitest";
import { MangledLayoutCache, type RowMarkerColumnSpec } from "./mangled-layout.ts";
import { computeCanBlit } from "../rendering/render/data-grid-render.blit.ts";
import type { InnerGridColumn } from "../rendering/data-grid-types.ts";
import type { DrawGridArg } from "../rendering/render/draw-grid-arg.ts";

function cols(n: number): readonly InnerGridColumn[] {
    return Array.from({ length: n }, (_, i) => ({ title: `C${i}`, width: 100 }));
}

const MARKER: RowMarkerColumnSpec = { width: 32, checked: false, headerDisabled: false, themeOverride: undefined };

describe("MangledLayoutCache: identity across draws", () => {
    it("returns the very same object when nothing changed", () => {
        const cache = new MangledLayoutCache();
        const columns = cols(3);
        const a = cache.get(columns, undefined, 0);
        const b = cache.get(columns, undefined, 0);
        expect(b).toBe(a);
        expect(b.mappedColumns).toBe(a.mappedColumns);
    });

    it("keeps identity when the row-marker spec is rebuilt with equal values", () => {
        // The controller rebuilds `RowMarkerColumnSpec` on every call (its `checked` field is
        // derived from live selection state), so the cache must compare its fields, not its
        // identity. If it compared identity this would allocate a new layout every draw -- which is
        // precisely the bug being fixed.
        const cache = new MangledLayoutCache();
        const columns = cols(3);
        const a = cache.get(columns, { width: 32, checked: false, headerDisabled: false, themeOverride: undefined }, 0);
        const b = cache.get(columns, { width: 32, checked: false, headerDisabled: false, themeOverride: undefined }, 0);
        expect(b.mappedColumns).toBe(a.mappedColumns);
    });
});

describe("MangledLayoutCache: invalidation", () => {
    const columns = cols(3);

    it.each<[string, () => readonly [readonly InnerGridColumn[], RowMarkerColumnSpec | undefined, number]]>([
        ["a new columns array (even if deep-equal)", () => [cols(3), undefined, 0]],
        ["a different column count", () => [cols(4), undefined, 0]],
        ["freezeColumns", () => [columns, undefined, 1]],
        ["row markers turning on", () => [columns, MARKER, 0]],
    ])("invalidates on %s", (_label, next) => {
        const cache = new MangledLayoutCache();
        const first = cache.get(columns, undefined, 0);
        const second = cache.get(...next());
        expect(second.mappedColumns).not.toBe(first.mappedColumns);
    });

    it.each<[string, RowMarkerColumnSpec]>([
        ["width", { ...MARKER, width: 48 }],
        ["checked true", { ...MARKER, checked: true }],
        ["checked indeterminate", { ...MARKER, checked: undefined }],
        ["headerDisabled", { ...MARKER, headerDisabled: true }],
        // 9g's `rowMarkerTheme`. Compared by identity, which is why its arg asks for a stable
        // object -- a fresh literal per render would land here and rebuild the layout every draw.
        ["themeOverride", { ...MARKER, themeOverride: { accentColor: "#f00" } }],
    ])("invalidates when the marker spec's %s changes", (_label, changed) => {
        const cache = new MangledLayoutCache();
        const first = cache.get(columns, MARKER, 0);
        expect(cache.get(columns, changed, 0).mappedColumns).not.toBe(first.mappedColumns);
    });

    it("distinguishes 'no marker' from 'marker in the indeterminate state'", () => {
        // Both leave every copied marker field `undefined` except `width`/`headerDisabled`, so the
        // cache carries an explicit `hasMarker` flag. Without it, toggling row markers off while
        // the header checkbox happened to be indeterminate would keep serving the stale layout.
        const cache = new MangledLayoutCache();
        const indeterminate = cache.get(columns, { ...MARKER, checked: undefined }, 0);
        const none = cache.get(columns, undefined, 0);
        expect(none.mappedColumns).not.toBe(indeterminate.mappedColumns);
        expect(none.mappedColumns).toHaveLength(3);
        expect(indeterminate.mappedColumns).toHaveLength(4);
    });
});

describe("MangledLayoutCache: what it actually builds", () => {
    it("prepends the row-marker column and makes it sticky", () => {
        const cache = new MangledLayoutCache();
        const { mappedColumns, freezeColumns } = cache.get(cols(3), MARKER, 0);
        expect(mappedColumns).toHaveLength(4);
        expect(mappedColumns[0]?.rowMarker).toBe("square");
        expect(mappedColumns[0]?.width).toBe(32);
        // Source's `mangledFreezeColumns`: the marker column is always frozen when enabled.
        expect(freezeColumns).toBe(1);
        expect(mappedColumns[0]?.sticky).toBe(true);
        expect(mappedColumns[1]?.sticky).toBe(false);
        expect(mappedColumns[1]?.title).toBe("C0");
    });

    it("adds the marker column to the consumer's freezeColumns", () => {
        const cache = new MangledLayoutCache();
        expect(cache.get(cols(3), MARKER, 2).freezeColumns).toBe(3);
        expect(cache.get(cols(3), undefined, 2).freezeColumns).toBe(2);
    });

    it("never freezes more columns than exist", () => {
        const cache = new MangledLayoutCache();
        expect(cache.get(cols(2), MARKER, 99).freezeColumns).toBe(3);
    });

    it("passes the columns straight through when there is no marker", () => {
        const cache = new MangledLayoutCache();
        const columns = cols(2);
        expect(cache.get(columns, undefined, 0).mangledColumns).toBe(columns);
    });
});

describe("MangledLayoutCache: the blit property it exists for", () => {
    // Minimal `DrawGridArg` stand-in -- same technique and rationale as
    // `data-grid-render.blit.test.ts`, which this mirrors deliberately.
    const THEME = { accentColor: "#4F5DFF" };
    const VERTICAL_BORDER = (): boolean => true;
    const GET_CELL_CONTENT = (): unknown => ({ kind: "text", data: "", displayData: "", allowOverlay: false });
    const SELECTION = { current: undefined, rows: [], columns: [] };

    function argWith(mappedColumns: unknown): DrawGridArg {
        return {
            width: 800,
            height: 600,
            theme: THEME,
            headerHeight: 36,
            rowHeight: 34,
            rows: 1000,
            freezeColumns: 0,
            getRowThemeOverride: undefined,
            isFocused: true,
            isResizing: false,
            verticalBorder: VERTICAL_BORDER,
            getCellContent: GET_CELL_CONTENT,
            highlightRegions: undefined,
            selection: SELECTION,
            dragAndDropState: undefined,
            prelightCells: undefined,
            touchMode: false,
            maxScaleFactor: 5,
            mappedColumns,
        } as unknown as DrawGridArg;
    }

    it("a 200-column grid can blit across draws once the layout is memoized", () => {
        // THE POINT OF ITEM 9k. `computeCanBlit` bails out unconditionally (`return false`) when
        // the `mappedColumns` reference differs and there are more than 100 columns -- so before
        // this cache existed, a wide grid never blitted at all, however little had changed.
        // `data-grid-render.blit.test.ts` pins that >100 bail-out; this pins that the cache is what
        // keeps us out of it.
        const cache = new MangledLayoutCache();
        const columns = cols(200);
        const frame1 = cache.get(columns, undefined, 0);
        const frame2 = cache.get(columns, undefined, 0);
        expect(computeCanBlit(argWith(frame2.mappedColumns), argWith(frame1.mappedColumns))).toBe(true);

        // Rebuilding the array is what used to happen every single draw. Same content, no blit.
        const rebuilt = new MangledLayoutCache().get(columns, undefined, 0);
        expect(computeCanBlit(argWith(rebuilt.mappedColumns), argWith(frame1.mappedColumns))).toBe(false);
    });

    it("a real column-width change still defeats the blit", () => {
        const cache = new MangledLayoutCache();
        const before = cache.get(cols(3), undefined, 0);
        const after = cache.get([{ title: "C0", width: 100 }, { title: "C1", width: 180 }, { title: "C2", width: 100 }], undefined, 0);
        // One column resized -> `computeCanBlit` reports its index so the caller can slide-blit.
        expect(computeCanBlit(argWith(after.mappedColumns), argWith(before.mappedColumns))).toBe(1);
    });

    it("toggling row markers defeats the blit", () => {
        const cache = new MangledLayoutCache();
        const columns = cols(3);
        const off = cache.get(columns, undefined, 0);
        const on = cache.get(columns, MARKER, 0);
        expect(computeCanBlit(argWith(on.mappedColumns), argWith(off.mappedColumns))).toBe(false);
    });
});
