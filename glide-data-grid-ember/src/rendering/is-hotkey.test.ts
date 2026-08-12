// 4.6 — the hotkey matcher and the keybinding map.
//
// The matcher is small and near-verbatim from source, but it decides *every* keyboard gesture in the
// grid, so the cases below are the ones where a plausible reimplementation diverges: exact modifier
// matching (which is what stops `goDownCell` and `selectGrowDown` both firing on shift+ArrowDown),
// the `_` keyCode form, the a–z keyCode form, `any`, and `|` alternatives.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { isHotkey, type HotkeyEvent, type HotkeyResultDetails } from "./is-hotkey.ts";
import { keybindingDefaults, realizeKeybinds, resolveKeybindings } from "./keybindings.ts";

// These tests run in bare Node, where there is no `window` — and both `primary` and the `delete`
// default read the platform through `browserIsOSX`, which caches on first read. So the platform is
// stubbed once, here, before any test can trigger that read. Windows is the arbitrary choice; it is
// what makes `primary` mean ctrl below.
vi.stubGlobal("window", { navigator: { platform: "Win32", userAgent: "" } });

function ev(key: string, mods: Partial<HotkeyEvent> = {}): HotkeyEvent {
    return {
        key,
        keyCode: key.length === 1 ? (key.toUpperCase().codePointAt(0) ?? 0) : 0,
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        ...mods,
    };
}

function match(hotkey: string, event: HotkeyEvent): boolean {
    const details: HotkeyResultDetails = { didMatch: false };
    return isHotkey(hotkey, event, details);
}

describe("isHotkey", () => {
    it("matches a bare key with no modifiers held", () => {
        expect(match("ArrowDown", ev("ArrowDown"))).toBe(true);
    });

    it("requires modifier state to match EXACTLY", () => {
        // The rule the whole keybinding scheme rests on: a bare binding must not fire when a
        // modifier is held, or one keypress would trigger two commands.
        expect(match("ArrowDown", ev("ArrowDown", { shiftKey: true }))).toBe(false);
        expect(match("shift+ArrowDown", ev("ArrowDown"))).toBe(false);
        expect(match("shift+ArrowDown", ev("ArrowDown", { shiftKey: true }))).toBe(true);
        expect(match("shift+ArrowDown", ev("ArrowDown", { shiftKey: true, altKey: true }))).toBe(false);
    });

    it("matches any of several alternatives separated by |", () => {
        expect(match("ArrowRight|Tab", ev("Tab"))).toBe(true);
        expect(match("ArrowRight|Tab", ev("ArrowRight"))).toBe(true);
        expect(match("ArrowRight|Tab", ev("ArrowLeft"))).toBe(false);
        // Each alternative carries its own modifiers.
        expect(match("ArrowLeft|shift+Tab", ev("Tab", { shiftKey: true }))).toBe(true);
        expect(match("ArrowLeft|shift+Tab", ev("Tab"))).toBe(false);
    });

    it("ignores modifier state entirely under `any`", () => {
        expect(match("any+Escape", ev("Escape"))).toBe(true);
        expect(match("any+Escape", ev("Escape", { shiftKey: true, ctrlKey: true, altKey: true }))).toBe(true);
    });

    it("matches a single a-z letter by keyCode, so caps does not break it", () => {
        // The letter is compared by keyCode, so an uppercase `key` with the same code still matches
        // — which is why select-all works with caps lock on.
        expect(match("shift+a", { ...ev("A", { shiftKey: true }), keyCode: 65 })).toBe(true);
    });

    it("resolves `primary` to ctrl on Windows and not to meta", () => {
        expect(match("primary+a", { ...ev("a", { ctrlKey: true }), keyCode: 65 })).toBe(true);
        expect(match("primary+a", { ...ev("a", { metaKey: true }), keyCode: 65 })).toBe(false);
    });

    it("matches an underscore-prefixed binding against keyCode, not key", () => {
        // This is the form that survives a keyboard layout where the character differs from the
        // physical key — alt+d emits "∂" on macOS but still reports keyCode 68.
        expect(match("_68", { ...ev("∂"), keyCode: 68 })).toBe(true);
        expect(match("_68", { ...ev("d"), keyCode: 70 })).toBe(false);
    });

    it("matches a literal space binding", () => {
        expect(match("shift+ ", ev(" ", { shiftKey: true }))).toBe(true);
        expect(match("ctrl+ ", ev(" ", { ctrlKey: true }))).toBe(true);
        expect(match("ctrl+ ", ev(" "))).toBe(false);
    });

    it("never matches an empty (disabled) binding", () => {
        // `""` is what a `false` keybind realizes to — the gesture must be completely off.
        expect(match("", ev("Escape"))).toBe(false);
        expect(match("", ev(" "))).toBe(false);
    });

    it("sets didMatch only on a match, and leaves it latched", () => {
        const details: HotkeyResultDetails = { didMatch: false };
        isHotkey("ArrowUp", ev("ArrowDown"), details);
        expect(details.didMatch).toBe(false);
        isHotkey("ArrowDown", ev("ArrowDown"), details);
        expect(details.didMatch).toBe(true);
        // Latched: a later miss does not clear it. The keydown handler relies on this to decide
        // whether anything at all handled the event.
        isHotkey("ArrowUp", ev("ArrowDown"), details);
        expect(details.didMatch).toBe(true);
    });
});

describe("realizeKeybinds", () => {
    it("turns true into the default binding and false into an empty string", () => {
        const realized = realizeKeybinds({ ...keybindingDefaults, selectAll: false });
        expect(realized.goDownCell).toBe("ArrowDown");
        expect(realized.selectAll).toBe("");
    });

    it("passes a string through as the replacement binding", () => {
        const realized = realizeKeybinds({ ...keybindingDefaults, goDownCell: "ctrl+j" });
        expect(realized.goDownCell).toBe("ctrl+j");
    });

    it("keeps Tab aliased onto horizontal movement by default", () => {
        const realized = realizeKeybinds(keybindingDefaults);
        expect(realized.goRightCell).toBe("ArrowRight|Tab");
        expect(realized.goLeftCell).toBe("ArrowLeft|shift+Tab");
    });
});

describe("resolveKeybindings", () => {
    it("returns the defaults when nothing is passed", () => {
        expect(resolveKeybindings(undefined).goUpCell).toBe("ArrowUp");
    });

    it("applies a partial override over the defaults, leaving the rest alone", () => {
        const realized = resolveKeybindings({ goDownCell: false });
        expect(realized.goDownCell).toBe("");
        expect(realized.goUpCell).toBe("ArrowUp");
    });

    it("keeps search ON by default, unlike source", () => {
        // A stated divergence: this port has had Cmd/Ctrl+F since 9e, so defaulting it off the way
        // source does would silently regress every existing consumer.
        expect(resolveKeybindings(undefined).search).toBe("primary+f");
        expect(resolveKeybindings({ search: false }).search).toBe("");
    });
});
