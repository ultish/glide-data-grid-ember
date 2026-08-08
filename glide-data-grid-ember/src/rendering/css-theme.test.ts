// Tests for the pure half of `css-theme.ts`.
//
// Only `themeOverlaysEqual` is testable in bare Node -- everything else in that module resolves
// colours through a live DOM cascade. That is not a coverage gap so much as where the risk
// actually sits: this predicate decides whether a *new theme object identity* is published, and
// publishing one needlessly silently disables the scroll blit fast path (`computeCanBlit`
// identity-compares `theme`). A wrong `false` here is the expensive direction.
import { describe, expect, test } from "vitest";
import { themeOverlaysEqual } from "./css-theme.ts";
import type { Theme } from "./theme.ts";

const overlay = (o: Record<string, string>): Partial<Theme> => o as Partial<Theme>;

describe("themeOverlaysEqual", () => {
    test("two empty overlays are equal", () => {
        expect(themeOverlaysEqual({}, {})).toBe(true);
    });

    test("same keys and values are equal despite different object identity", () => {
        // The entire point: structurally identical results must NOT publish a new identity.
        const a = overlay({ accentColor: "rgb(1, 2, 3)", bgCell: "rgb(255, 255, 255)" });
        const b = overlay({ accentColor: "rgb(1, 2, 3)", bgCell: "rgb(255, 255, 255)" });
        expect(a).not.toBe(b);
        expect(themeOverlaysEqual(a, b)).toBe(true);
    });

    test("a changed value is not equal", () => {
        expect(
            themeOverlaysEqual(overlay({ accentColor: "rgb(1, 2, 3)" }), overlay({ accentColor: "rgb(9, 9, 9)" }))
        ).toBe(false);
    });

    test("key order does not matter", () => {
        const a = overlay({ accentColor: "a", bgCell: "b" });
        const b = overlay({ bgCell: "b", accentColor: "a" });
        expect(themeOverlaysEqual(a, b)).toBe(true);
    });

    test("an added key is not equal", () => {
        expect(themeOverlaysEqual(overlay({ accentColor: "a" }), overlay({ accentColor: "a", bgCell: "b" }))).toBe(
            false
        );
    });

    test("a removed key is not equal", () => {
        // Guards the length check specifically: a subset with all-matching values must still differ.
        // Without the length comparison this returns true and a theme that *lost* a field would
        // never be republished.
        expect(themeOverlaysEqual(overlay({ accentColor: "a", bgCell: "b" }), overlay({ accentColor: "a" }))).toBe(
            false
        );
    });

    test("a key renamed but same count is not equal", () => {
        // Same length, same values, different keys -- the case a naive length+values check misses.
        expect(themeOverlaysEqual(overlay({ accentColor: "a" }), overlay({ bgCell: "a" }))).toBe(false);
    });
});
