// Regression tests for the pointer-dispatch guard. The defect these pin down (found 2026-08-09
// while driving `<DemoGrid>`): every mousedown inside an *open overlay editor* bubbled to the
// grid root's own `mousedown` listener and was dispatched as a grid click, which re-activated the
// cell the editor was sitting on and rebuilt the editor from scratch mid-interaction. The markdown
// cell was where it became visible -- its preview/edit-pencil toggle is editor-local state, so the
// rebuild dropped you straight back into preview and the cell read as uneditable.
//
// The module takes a plain array rather than a DOM node, so the rule is testable with no DOM.
import { describe, expect, test } from "vitest";
import { isGridSurfaceTarget } from "./grid-event-target.ts";

const root = { name: "root" };
const canvas = { name: "canvas" };
const scroller = { name: "scroller" };
const surfaces = [root, canvas, scroller];

describe("isGridSurfaceTarget", () => {
    test("accepts each of the grid's own surface nodes", () => {
        for (const surface of surfaces) {
            expect(isGridSurfaceTarget(surface as unknown as EventTarget, surfaces)).toBe(true);
        }
    });

    test("rejects a node that merely lives inside the grid root", () => {
        // The overlay editor's container, `<GlideSearchBar>`, consumer chrome in the yielded block:
        // all children of `root`, none of them the grid surface. A `root.contains()` check would
        // wrongly accept every one of these -- which is exactly the bug.
        const overlayEditorTextarea = { name: "textarea", parent: root };
        expect(isGridSurfaceTarget(overlayEditorTextarea as unknown as EventTarget, surfaces)).toBe(false);
    });

    test("rejects null/undefined targets", () => {
        expect(isGridSurfaceTarget(null, surfaces)).toBe(false);
        expect(isGridSurfaceTarget(undefined, surfaces)).toBe(false);
    });

    test("rejects everything when the surface list is empty", () => {
        expect(isGridSurfaceTarget(root as unknown as EventTarget, [])).toBe(false);
    });
});
