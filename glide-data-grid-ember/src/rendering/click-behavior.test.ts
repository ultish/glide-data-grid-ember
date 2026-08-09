// Phase 9g. Tests for the click-vs-drag rule and the click-activation rule.
//
// **The test that matters most in this file is "a drag is not a click".** The first cut of 9g fired
// `onCellClicked` from `onMouseDown`, which meant a consumer wiring "open this row" to it saw it
// fire every time a user merely *began* a drag-selection — a real, user-visible defect, and one
// that no type-check, build or existing test could have caught. `isValidClick` is the whole fix, so
// it gets a test that names the scenario rather than the function.
//
// The activation rule is here for a related reason: `"second-click"` requires the cell to have been
// selected **both before and after** the mousedown, and checking only "selected now" would activate
// on the first click, because that click's own mousedown just selected it. That off-by-one is
// invisible in code review and obvious in a test.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { isValidClick, shouldActivateOnClick, resolvePointerActivation } from "./click-behavior.ts";
import type { Item } from "./data-grid-types.ts";

const A: Item = [2, 5];
const B: Item = [4, 9];

describe("isValidClick — a drag is not a click", () => {
    it("does NOT report a click when the mouseup lands on a different cell", () => {
        // The regression this file exists for: mousedown on A, drag, mouseup on B.
        expect(isValidClick(A, B)).toBe(false);
    });

    it("does NOT report a click for a drag along a single row", () => {
        expect(isValidClick([2, 5], [7, 5])).toBe(false);
    });

    it("does NOT report a click for a drag down a single column", () => {
        expect(isValidClick([2, 5], [2, 8])).toBe(false);
    });

    it("reports a click when press and release are the same cell", () => {
        expect(isValidClick(A, [2, 5])).toBe(true);
    });

    it("does NOT report a click when the mousedown recorded no location", () => {
        // How a resize-edge press or a header-menu-glyph press spells "this was never a plain
        // select" — both return before recording anything.
        expect(isValidClick(undefined, A)).toBe(false);
    });

    it("reports a click for touch regardless of where the press started", () => {
        expect(isValidClick(A, B, true)).toBe(true);
        expect(isValidClick(undefined, B, true)).toBe(true);
    });
});

describe("shouldActivateOnClick", () => {
    const onSelected = { location: A, currentCell: A, previousCell: A };

    describe('"second-click"', () => {
        it("activates a click on a cell that was already selected before the press", () => {
            expect(shouldActivateOnClick({ behavior: "second-click", isDoubleClick: false, ...onSelected })).toBe(true);
        });

        it("does NOT activate the first click on a cell — the press just selected it", () => {
            // `currentCell` is the clicked cell (mousedown selected it) but `previousCell` is not.
            // Checking only `currentCell` would activate here, opening an editor on a single click.
            expect(
                shouldActivateOnClick({
                    behavior: "second-click",
                    isDoubleClick: false,
                    location: A,
                    currentCell: A,
                    previousCell: B,
                })
            ).toBe(false);
        });

        it("does NOT activate when nothing was selected before the press", () => {
            expect(
                shouldActivateOnClick({
                    behavior: "second-click",
                    isDoubleClick: false,
                    location: A,
                    currentCell: A,
                    previousCell: undefined,
                })
            ).toBe(false);
        });

        it("does NOT activate a click on a cell other than the selected one", () => {
            expect(
                shouldActivateOnClick({
                    behavior: "second-click",
                    isDoubleClick: false,
                    location: B,
                    currentCell: A,
                    previousCell: A,
                })
            ).toBe(false);
        });
    });

    describe('"double-click"', () => {
        it("does NOT activate a single click on the already-selected cell", () => {
            expect(shouldActivateOnClick({ behavior: "double-click", isDoubleClick: false, ...onSelected })).toBe(
                false
            );
        });

        it("activates a real double-click on the already-selected cell", () => {
            expect(shouldActivateOnClick({ behavior: "double-click", isDoubleClick: true, ...onSelected })).toBe(true);
        });

        it("still requires the cell to have been selected before the press", () => {
            expect(
                shouldActivateOnClick({
                    behavior: "double-click",
                    isDoubleClick: true,
                    location: A,
                    currentCell: A,
                    previousCell: undefined,
                })
            ).toBe(false);
        });
    });

    describe('"single-click"', () => {
        it("activates a first click on a previously unselected cell", () => {
            expect(
                shouldActivateOnClick({
                    behavior: "single-click",
                    isDoubleClick: false,
                    location: A,
                    currentCell: A,
                    previousCell: undefined,
                })
            ).toBe(true);
        });

        it("activates unconditionally — including after a drag (upstream quirk, copied)", () => {
            // Source's `single-click` case is a bare `shouldActivate = true`, reached from a
            // `handleMaybeClick` that is not gated on `isValidClick`. Pinned so that if anyone
            // "fixes" it, they do so knowingly and against upstream.
            expect(
                shouldActivateOnClick({
                    behavior: "single-click",
                    isDoubleClick: false,
                    location: B,
                    currentCell: A,
                    previousCell: A,
                })
            ).toBe(true);
        });
    });
});

describe("resolvePointerActivation", () => {
    it("reports the observed double-click over the configured behaviour", () => {
        expect(resolvePointerActivation("second-click", true)).toBe("double-click");
    });

    it("reports the configured behaviour otherwise", () => {
        expect(resolvePointerActivation("second-click", false)).toBe("second-click");
        expect(resolvePointerActivation("single-click", false)).toBe("single-click");
    });
});
