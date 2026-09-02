import { type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
export interface TagsCellProps {
    readonly kind: "tags-cell";
    readonly tags: readonly string[];
    readonly possibleTags: readonly {
        tag: string;
        color: string;
    }[];
}
export type TagsCell = CustomCell<TagsCellProps>;
/** Toggles `tag` in `tags`, returning a new array either way (never mutates `tags`). Pulled out of
 *  `buildTagsEditor` purely so the one piece of real logic in this file -- as opposed to DOM
 *  wiring, which cannot be unit-tested here (the controller cannot be imported by vitest) -- has a
 *  test next to it. See `tags-cell.test.ts`. */
export declare function toggleTag(tags: readonly string[], tag: string): readonly string[];
export declare const tagsCellRenderer: CustomRenderer<TagsCell>;
//# sourceMappingURL=tags-cell.d.ts.map