// Tests for plain utility functions and equality helpers. See copy-paste.test.ts for conventions
// (test contract not implementation; note surprising but faithful-to-source behavior; prefer
// tables for repeated patterns; no DOM).
import { describe, expect, it } from "vitest";
import { proveType, assert, assertNever, maybe, deepEqual } from "./support.ts";

describe("proveType", () => {
    it("accepts a value and does nothing", () => {
        // proveType is a compile-time helper; at runtime it's a no-op that doesn't throw.
        const value = 42;
        proveType<number>(value);
        expect(value).toBe(42); // unchanged
    });

    it("accepts any type without error", () => {
        proveType<string>("hello");
        proveType<{ a: number }>({ a: 1 });
        proveType<unknown>(null);
        expect(true).toBe(true);
    });
});

describe("assert", () => {
    it("does not throw when fact is true", () => {
        assert(true);
        assert(1 === 1);
        assert("hello".length === 5);
        expect(true).toBe(true);
    });

    it("throws with default message when fact is false", () => {
        expect(() => assert(false)).toThrow(/Assertion failed/);
    });

    it("throws with custom message when fact is false", () => {
        expect(() => assert(false, "custom message")).toThrow(/custom message/);
    });
});

describe("assertNever", () => {
    it("throws with default message", () => {
        // assertNever is normally unreachable in well-typed code, so we cast to call it.
        expect(() => assertNever(null as never)).toThrow(/Hell froze over/);
    });

    it("throws with custom message", () => {
        expect(() => assertNever(null as never, "custom never")).toThrow(/custom never/);
    });

    it("always throws regardless of input (unreachable in production code)", () => {
        // In well-typed code, this function is unreachable because the parameter type is `never`.
        // At runtime, we force it with a cast to verify it always throws.
        expect(() => assertNever(undefined as never)).toThrow();
    });
});

describe("maybe", () => {
    it("returns result when function succeeds", () => {
        const result = maybe(() => 42, 0);
        expect(result).toBe(42);
    });

    it("returns default value when function throws", () => {
        const result = maybe(() => {
            throw new Error("oops");
        }, "default");
        expect(result).toBe("default");
    });

    it("executes function only once", () => {
        let callCount = 0;
        const result = maybe(() => {
            callCount++;
            return "result";
        }, "default");
        expect(callCount).toBe(1);
        expect(result).toBe("result");
    });

    it("preserves function result type even on error (returns default)", () => {
        const result = maybe(() => {
            throw new Error();
        }, 42);
        expect(result).toBe(42);
    });

    it("catches any error type, not just Error", () => {
        const result = maybe(() => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw "string error";
        }, "fallback");
        expect(result).toBe("fallback");
    });
});

describe("deepEqual", () => {
    it("returns true for identical primitive values", () => {
        expect(deepEqual(42, 42)).toBe(true);
        expect(deepEqual("hello", "hello")).toBe(true);
        expect(deepEqual(true, true)).toBe(true);
    });

    it("returns false for different primitive values", () => {
        expect(deepEqual(42, 43)).toBe(false);
        expect(deepEqual("hello", "world")).toBe(false);
        expect(deepEqual(true, false)).toBe(false);
    });

    it("returns true for the same object reference", () => {
        const obj = { a: 1 };
        expect(deepEqual(obj, obj)).toBe(true);
    });

    it("returns true for objects with identical structure", () => {
        const a = { x: 1, y: "hi" };
        const b = { x: 1, y: "hi" };
        expect(deepEqual(a, b)).toBe(true);
    });

    it("returns false for objects with different values", () => {
        const a = { x: 1 };
        const b = { x: 2 };
        expect(deepEqual(a, b)).toBe(false);
    });

    it("returns false for objects with different keys", () => {
        const a = { x: 1 };
        const b = { y: 1 };
        expect(deepEqual(a, b)).toBe(false);
    });

    it("returns false when one object has more keys than the other", () => {
        const a = { x: 1 };
        const b = { x: 1, y: 2 };
        expect(deepEqual(a, b)).toBe(false);
    });

    it("returns true for arrays with identical elements", () => {
        expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(deepEqual(["a", "b"], ["a", "b"])).toBe(true);
    });

    it("returns false for arrays with different lengths", () => {
        expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
        expect(deepEqual([1], [])).toBe(false);
    });

    it("returns false for arrays with different elements", () => {
        expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    it("returns true for nested objects", () => {
        const a = { outer: { inner: { value: 42 } } };
        const b = { outer: { inner: { value: 42 } } };
        expect(deepEqual(a, b)).toBe(true);
    });

    it("returns false for differently nested objects", () => {
        const a = { outer: { inner: 1 } };
        const b = { outer: { inner: 2 } };
        expect(deepEqual(a, b)).toBe(false);
    });

    it("returns true for arrays containing objects", () => {
        const a = [{ id: 1 }, { id: 2 }];
        const b = [{ id: 1 }, { id: 2 }];
        expect(deepEqual(a, b)).toBe(true);
    });

    it("returns true for Date objects with the same time", () => {
        const a = new Date("2024-01-01");
        const b = new Date("2024-01-01");
        expect(deepEqual(a, b)).toBe(true);
    });

    it("returns false for Date objects with different times", () => {
        const a = new Date("2024-01-01");
        const b = new Date("2024-01-02");
        expect(deepEqual(a, b)).toBe(false);
    });

    it("returns true for RegExp objects with the same pattern", () => {
        expect(deepEqual(/test/, /test/)).toBe(true);
        expect(deepEqual(/hello/gi, /hello/gi)).toBe(true);
    });

    it("returns false for RegExp objects with different patterns", () => {
        expect(deepEqual(/test/, /other/)).toBe(false);
        expect(deepEqual(/test/i, /test/)).toBe(false);
    });

    it("handles null and undefined as different values", () => {
        expect(deepEqual(null, undefined)).toBe(false);
        expect(deepEqual(null, null)).toBe(true);
        expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it("returns false when comparing an object to an array", () => {
        // An object and array with the same structure should not be equal because
        // their constructors differ (Object vs Array).
        expect(deepEqual({ 0: "a", 1: "b" }, ["a", "b"])).toBe(false);
    });

    it("treats NaN as equal to NaN", () => {
        // Surprising: `NaN === NaN` is false in JavaScript, but `deepEqual(NaN, NaN)` is true --
        // the function's final line is `return foo !== foo && bar !== bar`, which is only true when
        // both operands are NaN (the one value that isn't equal to itself).
        //
        // VERIFIED against upstream 2026-08-08 (not by the agent that wrote this test, which had no
        // access to the source repo): the port's `deepEqual` is byte-identical to
        // `packages/core/src/common/support.ts` in glide-data-grid, same line 58. So this is
        // upstream behaviour to preserve, not a port defect to fix.
        expect(deepEqual(NaN, NaN)).toBe(true);
    });

    it("returns false for NaN compared to a number", () => {
        expect(deepEqual(NaN, 0)).toBe(false);
        expect(deepEqual(0, NaN)).toBe(false);
    });

    it("returns false for NaN in arrays if only one is NaN", () => {
        expect(deepEqual([NaN], [0])).toBe(false);
        expect(deepEqual([1, NaN], [1, 0])).toBe(false);
    });

    it("returns true for arrays with NaN in both", () => {
        expect(deepEqual([NaN], [NaN])).toBe(true);
        expect(deepEqual([1, NaN, 3], [1, NaN, 3])).toBe(true);
    });

    it("handles empty objects and arrays", () => {
        expect(deepEqual({}, {})).toBe(true);
        expect(deepEqual([], [])).toBe(true);
    });

    it("recursively compares nested arrays", () => {
        const a = [
            [1, 2],
            [3, 4],
        ];
        const b = [
            [1, 2],
            [3, 4],
        ];
        const c = [
            [1, 2],
            [3, 5],
        ];
        expect(deepEqual(a, b)).toBe(true);
        expect(deepEqual(a, c)).toBe(false);
    });
});
