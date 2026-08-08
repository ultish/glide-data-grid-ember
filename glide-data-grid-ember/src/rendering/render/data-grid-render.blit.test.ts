// Phase 9a. Regression tests for `computeCanBlit`, the gate on the scroll fast path.
//
// WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS. `computeCanBlit` compares ~18 `DrawGridArg`
// fields by **reference identity**. If any of them is freshly allocated each draw -- a new theme
// object, a new `getCellContent` closure, an inline `() => true` -- the check fails every frame and
// the scroll blit fast path silently stops engaging. There is no error, no warning, and no visual
// difference; the grid just repaints fully instead of translating the previous frame.
//
// That is not hypothetical. It went undetected in this port from Phase 2 to Phase 6, when three
// separate `DrawGridArg` fields were being reallocated per draw. It is the single defect class this
// project has proven it cannot catch by looking, so it gets a test that fails loudly instead.
//
// These tests therefore pin the *contract*: "changing this field's identity must defeat the blit."
// If a future change removes a field from the comparison, the matching test fails and someone has
// to make a deliberate decision about it. Adding a field is not caught automatically -- see the
// FIELDS list below, which must be kept in sync by hand.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { computeCanBlit } from "./data-grid-render.blit.ts";
import type { DrawGridArg } from "./draw-grid-arg.ts";

// A minimal arg carrying only the fields `computeCanBlit` actually reads. Cast because a real
// `DrawGridArg` also carries canvas contexts and sprite managers that this function never touches
// and that cannot exist in bare Node.
// `overrides` is deliberately loose rather than `Partial<DrawGridArg>`: these tests need to pass
// deliberately-minimal stand-ins (a two-key `theme`, a one-column `mappedColumns`) that satisfy
// `computeCanBlit` but not the full `FullTheme`/`MappedGridColumn` types. The whole fixture is a
// cast already; typing the overrides strictly would only force a second cast at every call site.
function makeArg(overrides: Record<string, unknown> = {}): DrawGridArg {
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
        mappedColumns: MAPPED_COLUMNS,
        ...overrides,
    } as unknown as DrawGridArg;
}

// Stable module-scope values, so two `makeArg()` calls are identity-equal by default. That is the
// baseline every test below perturbs exactly one field away from.
const THEME = { accentColor: "#4F5DFF" };
const VERTICAL_BORDER = () => true;
const GET_CELL_CONTENT = () => ({ kind: "text", data: "", displayData: "", allowOverlay: false });
const SELECTION = { current: undefined, rows: [], columns: [] };
const MAPPED_COLUMNS = [{ width: 100, sourceIndex: 0, sticky: false }];

describe("computeCanBlit", () => {
    it("blits when nothing changed", () => {
        expect(computeCanBlit(makeArg(), makeArg())).toBe(true);
    });

    it("cannot blit on the very first draw", () => {
        // `last === undefined` means there is no previous frame to translate.
        expect(computeCanBlit(makeArg(), undefined)).toBe(false);
    });
});

// Every field `computeCanBlit` compares by identity/value, paired with a *different* value. Keep in
// sync with the function by hand: this list can catch a field being dropped from the comparison, but
// nothing here notices a field being added to it.
const FIELDS: ReadonlyArray<readonly [keyof DrawGridArg, unknown]> = [
    ["width", 900],
    ["height", 700],
    ["headerHeight", 40],
    ["rowHeight", 40],
    ["rows", 1001],
    ["freezeColumns", 1],
    ["isFocused", false],
    ["isResizing", true],
    ["touchMode", true],
    ["maxScaleFactor", 4],
    // Reference-compared: a structurally identical but freshly allocated value must still defeat
    // the blit. These are the ones that actually broke in Phase 6.
    ["theme", { accentColor: "#4F5DFF" }],
    ["verticalBorder", () => true],
    ["getCellContent", () => ({ kind: "text", data: "", displayData: "", allowOverlay: false })],
    ["selection", { current: undefined, rows: [], columns: [] }],
    ["getRowThemeOverride", () => undefined],
    ["highlightRegions", []],
    ["prelightCells", []],
    ["dragAndDropState", { src: 0, dest: 1 }],
];

describe("computeCanBlit defeats the blit when a compared field changes", () => {
    it.each(FIELDS)("%s", (field, changed) => {
        const result = computeCanBlit(makeArg({ [field]: changed }), makeArg());
        expect(result).toBe(false);
    });
});

describe("computeCanBlit: identity, not deep equality", () => {
    // The whole point of the Phase 6 defect: these values are structurally identical to the
    // baseline, so a deep comparison would say "no change" and blit. `computeCanBlit` uses `!==`,
    // so a fresh allocation is a change. A consumer must therefore hoist these to stable
    // references -- documented on the `GridHostArgs` fields that accept them.
    it.each([
        ["theme", { accentColor: "#4F5DFF" }],
        ["selection", { current: undefined, rows: [], columns: [] }],
        ["highlightRegions", []],
        ["prelightCells", []],
    ] as const)("a structurally-equal but freshly allocated %s still blocks the blit", (field, value) => {
        expect(computeCanBlit(makeArg({ [field]: value }), makeArg())).toBe(false);
    });

    it("two undefined values are the same reference, so they do not block the blit", () => {
        // The flip side, and why passing `undefined` rather than a fresh `[]` for "no regions" is
        // the documented advice on the `@highlightRegions` / `@prelightCells` args.
        expect(computeCanBlit(makeArg({ highlightRegions: undefined }), makeArg({ highlightRegions: undefined }))).toBe(
            true
        );
    });

    it("an identical reference does NOT block the blit", () => {
        const shared = { accentColor: "#000000" };
        expect(computeCanBlit(makeArg({ theme: shared }), makeArg({ theme: shared }))).toBe(true);
    });
});

describe("computeCanBlit: mappedColumns", () => {
    it("blits when the array is a new reference but every column is deep-equal", () => {
        // `mappedColumns` is exempt from the identity rule -- it falls into a per-column
        // `deepEqual` branch. This is why `computeMangledLayout` rebuilding the array every draw
        // does not fully disable blitting at small column counts (it does above 100 -- see below).
        const a = makeArg({ mappedColumns: [{ width: 100, sourceIndex: 0, sticky: false }] });
        const b = makeArg({ mappedColumns: [{ width: 100, sourceIndex: 0, sticky: false }] });
        expect(computeCanBlit(a, b)).toBe(true);
    });

    it("returns the column index when exactly one column changed width", () => {
        // A number return means "only this column resized" -- the caller can do a cheaper
        // left/right sliding blit rather than a full repaint.
        const last = makeArg({
            mappedColumns: [
                { width: 100, sourceIndex: 0, sticky: false },
                { width: 100, sourceIndex: 1, sticky: false },
            ],
        });
        const current = makeArg({
            mappedColumns: [
                { width: 100, sourceIndex: 0, sticky: false },
                { width: 150, sourceIndex: 1, sticky: false },
            ],
        });
        expect(computeCanBlit(current, last)).toBe(1);
    });

    it("cannot blit when two columns changed", () => {
        const last = makeArg({
            mappedColumns: [
                { width: 100, sourceIndex: 0, sticky: false },
                { width: 100, sourceIndex: 1, sticky: false },
            ],
        });
        const current = makeArg({
            mappedColumns: [
                { width: 120, sourceIndex: 0, sticky: false },
                { width: 150, sourceIndex: 1, sticky: false },
            ],
        });
        expect(computeCanBlit(current, last)).toBe(false);
    });

    it("cannot blit when a column changed by something other than width", () => {
        const last = makeArg({ mappedColumns: [{ width: 100, sourceIndex: 0, sticky: false }] });
        const current = makeArg({ mappedColumns: [{ width: 100, sourceIndex: 0, sticky: true }] });
        expect(computeCanBlit(current, last)).toBe(false);
    });

    it("cannot blit when the column count changed", () => {
        const last = makeArg({ mappedColumns: [{ width: 100, sourceIndex: 0, sticky: false }] });
        const current = makeArg({
            mappedColumns: [
                { width: 100, sourceIndex: 0, sticky: false },
                { width: 100, sourceIndex: 1, sticky: false },
            ],
        });
        expect(computeCanBlit(current, last)).toBe(false);
    });

    it("bails out entirely above 100 columns when the array reference changed", () => {
        // Known perf cliff, and a real one for this port: `computeMangledLayout` rebuilds
        // `mappedColumns` every draw, so a grid with >100 columns never blits. Recorded as a
        // backlog item (PHASES.md 9k); pinned here so the threshold isn't changed by accident.
        const cols = (n: number) =>
            Array.from({ length: n }, (_, i) => ({ width: 100, sourceIndex: i, sticky: false }));
        expect(computeCanBlit(makeArg({ mappedColumns: cols(101) }), makeArg({ mappedColumns: cols(101) }))).toBe(
            false
        );
        // ...but the identical content at 100 columns is fine.
        expect(computeCanBlit(makeArg({ mappedColumns: cols(100) }), makeArg({ mappedColumns: cols(100) }))).toBe(true);
    });
});
