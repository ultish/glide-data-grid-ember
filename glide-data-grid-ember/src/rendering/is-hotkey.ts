/**
 * 4.6 — source's hotkey matcher (`common/is-hotkey.ts`), ported near-verbatim.
 *
 * The syntax is source's, deliberately kept identical so a React consumer's `keybindings` object
 * transfers unchanged: `ctrl+shift+alt+d`, `shift+Backspace`, `alt+_53`, `primary+a`. Rules:
 *
 * - The **last** segment is the key, everything before it is a modifier.
 * - `primary` is `ctrl` on Windows/Linux and `meta` on macOS.
 * - `any` as the first modifier means "match regardless of modifier state".
 * - A key starting with `_` is a **keyCode** rather than a `key` (`_68` is D).
 * - A single lowercase `a`–`z` is matched by keyCode, so it survives shift/caps.
 * - `|` separates alternatives: `ArrowLeft|shift+Tab` matches either.
 * - Space is written as a literal space: `ctrl+ `. Load-bearing whitespace, as source's own comment
 *   puts it.
 *
 * Modifier matching is **exact** except under `any`: `ArrowDown` does not match shift+ArrowDown,
 * which is what keeps `goDownCell` and `selectGrowDown` from both firing on one press.
 */

import { browserIsOSX } from "./common/browser-detect.ts";

/** The subset of a key event this matcher reads. Structural on purpose — it is satisfied by a DOM
 *  `KeyboardEvent` as well as by the port's `GridKeyEventArgs`, so callers pass either. */
export interface HotkeyEvent {
    readonly key: string;
    readonly keyCode: number;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
}

function checkKey(key: string | undefined, args: HotkeyEvent): boolean {
    if (key === undefined) return false;
    if (key.length > 1 && key.startsWith("_")) {
        const keycode = Number.parseInt(key.slice(1));
        return keycode === args.keyCode;
    }
    if (key.length === 1 && key >= "a" && key <= "z") {
        return key.toUpperCase().codePointAt(0) === args.keyCode;
    }

    return key === args.key;
}

/** Set by `isHotkey` when a match is found. Source threads this through every call in one keydown so
 *  the handler can tell "a binding handled this" from "nothing matched" without re-deriving it. */
export interface HotkeyResultDetails {
    didMatch: boolean;
}

export function isHotkey(hotkey: string, args: HotkeyEvent, details: HotkeyResultDetails): boolean {
    const result = isHotkeyInner(hotkey, args);
    if (result) details.didMatch = true;
    return result;
}

function isHotkeyInner(hotkey: string, args: HotkeyEvent): boolean {
    if (hotkey.length === 0) return false;

    if (hotkey.includes("|")) {
        const parts = hotkey.split("|");
        for (const part of parts) {
            if (isHotkeyInner(part, args)) return true;
        }
        return false;
    }

    let wantCtrl = false;
    let wantShift = false;
    let wantAlt = false;
    let wantMeta = false;

    const split = hotkey.split("+");
    const key = split.pop();

    if (!checkKey(key, args)) return false;
    if (split[0] === "any") return true;

    for (const accel of split) {
        switch (accel) {
            case "ctrl": {
                wantCtrl = true;
                break;
            }
            case "shift": {
                wantShift = true;
                break;
            }
            case "alt": {
                wantAlt = true;
                break;
            }
            case "meta": {
                wantMeta = true;
                break;
            }
            case "primary": {
                if (browserIsOSX.value) {
                    wantMeta = true;
                } else {
                    wantCtrl = true;
                }
                break;
            }
        }
    }

    return (
        args.altKey === wantAlt && args.ctrlKey === wantCtrl && args.shiftKey === wantShift && args.metaKey === wantMeta
    );
}
