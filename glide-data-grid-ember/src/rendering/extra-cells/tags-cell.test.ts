// `toggleTag` itself is trivial; what this file actually pins down is the *contract* the fix for
// the 2026-08-14 stale-`p.value` bug (see `tags-cell.ts`'s `buildTagsEditor` comment) depends on:
// each call must build on the PREVIOUS result, not re-derive from the original list. A regression
// that went back to reading a frozen `tags` array would still pass a test that only checked one
// toggle in isolation -- these chain calls the way `buildTagsEditor` does, one per `change` event.
import { describe, expect, test } from "vitest";
import { toggleTag } from "./tags-cell.ts";

describe("toggleTag", () => {
    test("adds a tag not present", () => {
        expect(toggleTag(["urgent"], "bug")).toEqual(["urgent", "bug"]);
    });

    test("removes a tag already present", () => {
        expect(toggleTag(["urgent", "bug"], "bug")).toEqual(["urgent"]);
    });

    test("does not mutate the input array", () => {
        const tags = ["urgent"];
        toggleTag(tags, "bug");
        expect(tags).toEqual(["urgent"]);
    });

    test("chained toggles accumulate -- the actual shape of a multi-checkbox editor session", () => {
        // This is the sequence that reproduced the bug in the browser: open with ["urgent"], check
        // "bug", then check "feature" in the same session. The buggy version read a frozen
        // `p.value.data.tags` on every click, so the second call recomputed from ["urgent"] again
        // and the commit ended up ["urgent", "feature"] -- "bug" silently dropped.
        let tags: readonly string[] = ["urgent"];
        tags = toggleTag(tags, "bug");
        tags = toggleTag(tags, "feature");
        expect(tags).toEqual(["urgent", "bug", "feature"]);
    });

    test("toggling the same tag twice is a no-op end to end", () => {
        let tags: readonly string[] = ["urgent"];
        tags = toggleTag(tags, "bug");
        tags = toggleTag(tags, "bug");
        expect(tags).toEqual(["urgent"]);
    });
});
