// Group-header *actions*: the little icon buttons a `GroupDetails` can put at the right-hand end of
// a column group's header strip. Source draws them in `data-grid-render.header.ts` (`drawGroups`)
// and hit-tests them in `data-grid.tsx` (`groupHeaderActionForEvent`, `:1004-1029`) -- two files
// that share `getActionBoundsForGroup` and must agree pixel-for-pixel or an icon draws where it
// cannot be clicked.
//
// Both halves live here, in a leaf module with no canvas/DOM dependency, so the hit test is
// reachable from vitest (`grid-host-controller.ts` is not importable there -- see TODO.md's working
// practices). `data-grid-render.header.ts` imports the bounds function from here rather than the
// other way round.

import { pointInRect } from "../common/math.ts";
import type { Rectangle } from "../data-grid-types.ts";
import type { GroupDetails } from "./data-grid-render.cells.ts";

/** One entry of `GroupDetails.actions`. */
export type GroupHeaderAction = NonNullable<GroupDetails["actions"]>[number];

/**
 * Appends the "Rename" action that `@onGroupHeaderRenamed` is enabled by, mirroring source's
 * `mangledGetGroupDetails` (`data-editor.tsx:1401-1425`).
 *
 * Two details are source's and both matter:
 *
 * - the entry goes **after** the consumer's own actions, so adding a rename handler never reorders
 *   or displaces buttons a consumer has already positioned;
 * - a group whose key is `""` is left alone. Ungrouped columns render a blank band that is not a
 *   group and has nothing to name.
 *
 * `onRename` is handed the group **key**, not the display name -- see `@onGroupHeaderRenamed`'s doc
 * comment for why this port diverges there.
 *
 * Returns `details` unchanged when there is nothing to add, which keeps the caller's memoization
 * honest: an identical object back means the render path sees no change.
 */
export function appendRenameAction(
    details: GroupDetails,
    groupKey: string,
    onRename: ((groupKey: string, displayName: string, bounds: Rectangle) => void) | undefined
): GroupDetails {
    if (onRename === undefined || groupKey === "") return details;
    return {
        ...details,
        actions: [
            ...(details.actions ?? []),
            {
                title: "Rename",
                icon: "renameIcon",
                onClick: e => onRename(groupKey, details.name, e.bounds),
            },
        ],
    };
}

/**
 * Where each of a group's action icons sits, in the same coordinate space as `box` -- right-aligned
 * inside the group header's rect, 26px square each, vertically centred. Ported verbatim from
 * source's `getActionBoundsForGroup` (`data-grid-render.header.ts:299`).
 */
export function getActionBoundsForGroup(
    box: Rectangle,
    actions: NonNullable<GroupDetails["actions"]>
): readonly Rectangle[] {
    const result: Rectangle[] = [];
    let x = box.x + box.width - 26 * actions.length;
    const y = box.y + box.height / 2 - 13;
    const height = 26;
    const width = 26;
    for (let i = 0; i < actions.length; i++) {
        result.push({
            x,
            y,
            width,
            height,
        });
        x += 26;
    }
    return result;
}

/**
 * The action under a pointer, or `undefined`. `bounds` is the group header's rect and
 * `localEventX`/`localEventY` are the pointer position *relative to it*, exactly as the grid's mouse
 * event args carry them.
 *
 * **The y comparison is source's, and it is odd on purpose** (`data-grid.tsx:1013`,
 * `pointInRect(box, localEventX + bounds.x, localEventY + box.y)`): it adds the *box's* own `y`
 * to the local pointer y, so the test passes for any `localEventY` between 0 and the box height
 * (26px) rather than for the box's actual vertical extent. In practice a group header is ~36px tall
 * and the icons are centred in it, so this makes the top 26px of the strip clickable instead of the
 * middle 26px. Reproduced rather than corrected: a consumer's click targets should land in the same
 * place they do in React, and a "fix" here would be exactly the kind of quiet divergence TODO.md's
 * fidelity rule warns about.
 */
export function hitTestGroupHeaderAction(
    details: GroupDetails | undefined,
    bounds: Rectangle,
    localEventX: number,
    localEventY: number
): GroupHeaderAction | undefined {
    const actions = details?.actions;
    if (actions === undefined || actions.length === 0) return undefined;
    const boxes = getActionBoundsForGroup(bounds, actions);
    for (const [i, box] of boxes.entries()) {
        if (pointInRect(box, localEventX + bounds.x, localEventY + box.y)) {
            return actions[i];
        }
    }
    return undefined;
}
