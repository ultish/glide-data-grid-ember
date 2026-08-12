// Group-header action geometry and hit-testing (4.2).
//
// Why these deserve tests: the icons are *drawn* by `data-grid-render.header.ts` and *clicked* via
// `GridHostController`, two call sites that only agree because they share the functions here. That
// is exactly the shape of the fill-handle defect from Phase 9h -- drawn since Phase 2, doing
// nothing when clicked, invisible to every full-redraw check. The controller itself cannot be
// imported by vitest, so the shared geometry is where the contract can be pinned down.
import { describe, expect, it } from "vitest";
import { appendRenameAction, getActionBoundsForGroup, hitTestGroupHeaderAction } from "./group-header-actions.ts";
import type { GroupDetails } from "./data-grid-render.cells.ts";

const noop = (): void => undefined;
const ACTIONS: NonNullable<GroupDetails["actions"]> = [
    { title: "one", icon: "headerRowID", onClick: noop },
    { title: "two", icon: "headerCode", onClick: noop },
];

// A group strip 300px wide starting at x=100, 36px tall -- the shape `computeCellRect` returns for
// row -2, grown across the group's whole span.
const BOUNDS = { x: 100, y: 0, width: 300, height: 36 };

describe("getActionBoundsForGroup", () => {
    it("right-aligns 26px squares in the group's rect, in order", () => {
        const boxes = getActionBoundsForGroup(BOUNDS, ACTIONS);
        expect(boxes).toEqual([
            { x: 348, y: 5, width: 26, height: 26 },
            { x: 374, y: 5, width: 26, height: 26 },
        ]);
        // The last box ends exactly at the group's right edge.
        const last = boxes[1]!;
        expect(last.x + last.width).toBe(BOUNDS.x + BOUNDS.width);
    });

    it("centres them vertically on the strip", () => {
        const [box] = getActionBoundsForGroup({ x: 0, y: 0, width: 100, height: 40 }, [ACTIONS[0]!]);
        expect(box!.y).toBe(7);
        expect(box!.y + box!.height).toBe(33);
    });
});

describe("hitTestGroupHeaderAction", () => {
    const details: GroupDetails = { name: "Personal", actions: ACTIONS };

    it("returns nothing when the group has no actions", () => {
        expect(hitTestGroupHeaderAction(undefined, BOUNDS, 250, 10)).toBeUndefined();
        expect(hitTestGroupHeaderAction({ name: "Personal" }, BOUNDS, 250, 10)).toBeUndefined();
        expect(hitTestGroupHeaderAction({ name: "Personal", actions: [] }, BOUNDS, 250, 10)).toBeUndefined();
    });

    it("returns nothing over the group's name, left of the icons", () => {
        expect(hitTestGroupHeaderAction(details, BOUNDS, 10, 10)).toBeUndefined();
    });

    it("picks the action under the pointer", () => {
        // localX is relative to the strip: box 0 spans 348..374 absolute, i.e. 248..274 local.
        expect(hitTestGroupHeaderAction(details, BOUNDS, 250, 10)?.title).toBe("one");
        expect(hitTestGroupHeaderAction(details, BOUNDS, 280, 10)?.title).toBe("two");
    });

    it("hit-tests against the group's own rect, not the column's", () => {
        // The same pointer position resolves differently once the strip moves -- this is what makes
        // passing the *group-spanning* rect (rather than the clicked column's) load-bearing.
        const narrow = { x: 100, y: 0, width: 60, height: 36 };
        expect(hitTestGroupHeaderAction(details, narrow, 250, 10)).toBeUndefined();
        expect(hitTestGroupHeaderAction(details, narrow, 40, 10)?.title).toBe("two");
    });

    it("reproduces source's y comparison: the top 26px of the strip, not the icons' own extent", () => {
        // `pointInRect(box, localX + bounds.x, localY + box.y)` -- see the note in the module. A
        // click at the very top of a 36px strip hits even though the icon starts 5px lower, and one
        // at the bottom misses even though the icon is still under it. Pinned deliberately: it is
        // upstream's behaviour, and a consumer's click targets should match their React version.
        expect(hitTestGroupHeaderAction(details, BOUNDS, 250, 0)?.title).toBe("one");
        expect(hitTestGroupHeaderAction(details, BOUNDS, 250, 26)?.title).toBe("one");
        expect(hitTestGroupHeaderAction(details, BOUNDS, 250, 30)).toBeUndefined();
    });
});

describe("appendRenameAction", () => {
    const onRename = (): void => undefined;

    it("adds nothing when no rename handler is set", () => {
        const details: GroupDetails = { name: "Identity" };
        expect(appendRenameAction(details, "Identity", undefined)).toBe(details);
    });

    it("skips the empty group key -- ungrouped columns are not a group", () => {
        const details: GroupDetails = { name: "" };
        expect(appendRenameAction(details, "", onRename)).toBe(details);
    });

    it("appends a Rename action to a group with none", () => {
        const result = appendRenameAction({ name: "Identity" }, "Identity", onRename);
        expect(result.actions).toHaveLength(1);
        expect(result.actions?.[0]?.title).toBe("Rename");
        expect(result.actions?.[0]?.icon).toBe("renameIcon");
    });

    it("appends *after* the consumer's own actions, never reordering them", () => {
        const result = appendRenameAction({ name: "Signals", actions: ACTIONS }, "Signals", onRename);
        expect(result.actions?.map(a => a.title)).toEqual(["one", "two", "Rename"]);
    });

    it("preserves every other field", () => {
        const theme = { bgHeader: "#123456" };
        const result = appendRenameAction(
            { name: "Media (themed)", icon: "headerImage", overrideTheme: theme },
            "Media",
            onRename
        );
        expect(result.name).toBe("Media (themed)");
        expect(result.icon).toBe("headerImage");
        expect(result.overrideTheme).toBe(theme);
    });

    it("hands the callback the group KEY and the DISPLAY name, in that order", () => {
        // The divergence from source, pinned down: upstream forwards `result.name` as the group
        // identifier, which is unusable for a group whose display name differs from its key.
        const calls: [string, string][] = [];
        const result = appendRenameAction({ name: "Media (themed)" }, "Media", (key, display) => {
            calls.push([key, display]);
        });
        result.actions?.[0]?.onClick({ bounds: BOUNDS } as never);
        expect(calls).toEqual([["Media", "Media (themed)"]]);
    });

    it("passes the group band's bounds through, so the box can be positioned over it", () => {
        let seen: unknown;
        const result = appendRenameAction({ name: "Identity" }, "Identity", (_k, _d, bounds) => {
            seen = bounds;
        });
        result.actions?.[0]?.onClick({ bounds: BOUNDS } as never);
        expect(seen).toBe(BOUNDS);
    });
});
