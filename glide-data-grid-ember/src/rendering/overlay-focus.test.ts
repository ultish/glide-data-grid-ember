// Upstream #910 (see `overlay-focus.ts`). These are the four states focus can be in when an overlay
// editor has just opened; only one of them must be left alone.
import { describe, expect, test } from "vitest";
import { shouldFocusOverlayContainer, type FocusContainment } from "./overlay-focus.ts";

/** Stands in for the overlay container. `children` is what `contains()` answers `true` for. */
function container(...children: unknown[]): FocusContainment {
    return { contains: (other: unknown) => children.includes(other) };
}

describe("shouldFocusOverlayContainer", () => {
    test("leaves focus alone when the editor focused one of its own controls", () => {
        // The common path: a text/number/uri editor focused its textarea. Stealing focus back to the
        // container here would drop the caret out of a working editor.
        const textarea = { name: "textarea" };
        expect(shouldFocusOverlayContainer(container(textarea), textarea)).toBe(false);
    });

    test("takes focus when nothing is focused", () => {
        // What a disabled control leaves behind: the browser reports `<body>`, jsdom `null`.
        expect(shouldFocusOverlayContainer(container(), null)).toBe(true);
        expect(shouldFocusOverlayContainer(container(), undefined)).toBe(true);
    });

    test("takes focus when focus escaped to an element outside the overlay", () => {
        // Clicking a `disabled` control moves focus out of the overlay entirely -- this is the
        // #910 case, and the one the grid's own `onKeyDown` cannot rescue because it early-returns
        // while an overlay is open.
        const body = { name: "body" };
        expect(shouldFocusOverlayContainer(container({ name: "textarea" }), body)).toBe(true);
    });

    test("takes focus when the grid root itself is focused", () => {
        // The case that looks harmless and is not: the canvas keeps focus because the editor had
        // nothing focusable to hand it to. Escape reaches the grid handler, which ignores it.
        const gridRoot = { name: "grid-root" };
        expect(shouldFocusOverlayContainer(container(), gridRoot)).toBe(true);
    });
});
