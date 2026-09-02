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
export declare function appendRenameAction(details: GroupDetails, groupKey: string, onRename: ((groupKey: string, displayName: string, bounds: Rectangle) => void) | undefined): GroupDetails;
/**
 * Where each of a group's action icons sits, in the same coordinate space as `box` -- right-aligned
 * inside the group header's rect, 26px square each, vertically centred. Ported verbatim from
 * source's `getActionBoundsForGroup` (`data-grid-render.header.ts:299`).
 */
export declare function getActionBoundsForGroup(box: Rectangle, actions: NonNullable<GroupDetails["actions"]>): readonly Rectangle[];
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
export declare function hitTestGroupHeaderAction(details: GroupDetails | undefined, bounds: Rectangle, localEventX: number, localEventY: number): GroupHeaderAction | undefined;
//# sourceMappingURL=group-header-actions.d.ts.map