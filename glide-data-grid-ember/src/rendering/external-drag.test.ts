// 4.4 — the two decisions in the external HTML5 drag-and-drop path.
//
// `canDragFrom` is the whole of `isDraggable`'s meaning, and its interesting cases are the ones a
// reasonable-looking rewrite gets wrong: `true` allows a drag from *out of bounds*, and the string
// form is compared against source's four-way kind, not this port's three-way `MouseHit["kind"]` —
// so a drag off the group-header band does not satisfy `isDraggable: "header"`.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { canDragFrom, dragKindForHit, hasDropTargetChanged, isDraggableAttr } from "./external-drag.ts";

describe("dragKindForHit", () => {
    it("splits the folded header kind back into source's two kinds", () => {
        expect(dragKindForHit("header", -1)).toBe("header");
        expect(dragKindForHit("header", -2)).toBe("group-header");
    });

    it("passes the other kinds through untouched", () => {
        expect(dragKindForHit("cell", 4)).toBe("cell");
        expect(dragKindForHit("out-of-bounds", 99)).toBe("out-of-bounds");
    });
});

describe("canDragFrom", () => {
    it("refuses everything when unset or false", () => {
        for (const kind of ["cell", "header", "group-header", "out-of-bounds"] as const) {
            expect(canDragFrom(undefined, kind)).toBe(false);
            expect(canDragFrom(false, kind)).toBe(false);
        }
    });

    it("allows every kind when true, out-of-bounds included", () => {
        // Source's guard is `isDraggable !== true && args.kind !== isDraggable`, so `true`
        // short-circuits before the kind is ever consulted. Not an oversight to tidy.
        for (const kind of ["cell", "header", "group-header", "out-of-bounds"] as const) {
            expect(canDragFrom(true, kind)).toBe(true);
        }
    });

    it("matches only the named kind when given a string", () => {
        expect(canDragFrom("cell", "cell")).toBe(true);
        expect(canDragFrom("cell", "header")).toBe(false);
        expect(canDragFrom("header", "header")).toBe(true);
        expect(canDragFrom("header", "cell")).toBe(false);
    });

    it('does not treat the group-header band as "header"', () => {
        // The reason `dragKindForHit` exists. Source compares against a kind that keeps the two
        // bands apart, so folding them would make this port's "header" mean one thing more.
        expect(canDragFrom("header", "group-header")).toBe(false);
    });
});

describe("isDraggableAttr", () => {
    it("is set for true and for any string, and not for false or unset", () => {
        expect(isDraggableAttr(true)).toBe(true);
        expect(isDraggableAttr("cell")).toBe(true);
        expect(isDraggableAttr("header")).toBe(true);
        expect(isDraggableAttr(false)).toBe(false);
        expect(isDraggableAttr(undefined)).toBe(false);
    });
});

describe("hasDropTargetChanged", () => {
    it("reports the first target of a drag", () => {
        expect(hasDropTargetChanged(undefined, [0, 0])).toBe(true);
    });

    it("stays quiet while the pointer hovers one cell", () => {
        // `dragover` fires continuously over a stationary pointer; the consumer hears once.
        expect(hasDropTargetChanged([2, 3], [2, 3])).toBe(false);
    });

    it("fires when either axis moves", () => {
        expect(hasDropTargetChanged([2, 3], [3, 3])).toBe(true);
        expect(hasDropTargetChanged([2, 3], [2, 4])).toBe(true);
    });

    it("fires for a move onto the header row", () => {
        expect(hasDropTargetChanged([2, 0], [2, -1])).toBe(true);
    });
});
