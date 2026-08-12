// Phase 11: this chapter used to carry the identity-compared arg table and the `updateCells` recipe.
// Both were narrative, cross-cutting material — they apply to every recipe in this book — so they
// moved to the **Guide** (chapters 9 and 8 respectively) and there is exactly one copy of each.
//
// What remains is the task this chapter is actually looked up for: "the grid feels slow, where do I
// look?". Keep it a triage list. If an entry here grows an explanation, the explanation belongs in
// the guide and this entry belongs to be a link to it.
import type { Section } from "./types.ts";

export const performanceSection: Section = {
    id: "performance",
    title: "Performance rules",
    blocks: [
        {
            kind: "p",
            text: "**Row count is not a performance problem.** The grid is virtualised and pulls cells as it paints them, so 200,000 rows cost about what 20 do. If something feels slow, it is one of three things, and none of them is the row count.",
        },
        {
            kind: "list",
            items: [
                "**An identity-compared arg is being reallocated.** The scroll fast path compares about eighteen inputs by identity; one fresh allocation disables it permanently, with no error and **no visual difference**. Usually `@getCellContent` or `@theme`. → **Guide 9, *The identity rules*** has the full list and the fixes.",
                "**There is real work inside `getCellContent`.** It runs in the draw loop — formatting, date parsing and nested-object walks belong in `toCell`, which is memoized. → **Guide 2, *The pull model***.",
                "**The records array is being reallocated on every change.** `recordsSource` keys its per-row caches on that identity, so a `.map()`/`.filter()` upstream turns every edit into a full re-projection. → **Guide 4, *Wiring real data***.",
            ],
        },
        {
            kind: "note",
            text: "**How to tell them apart.** There is no runtime warning, so take a Performance profile while scrolling with nothing else happening. A healthy grid does very little per scroll frame. A full paint on every frame is the first item; a paint that is slow *once* is the second; a full re-projection on every keystroke is the third.",
        },
        {
            kind: "p",
            text: "**Hi-DPI screens, wide grids.** The canvas is painted at up to 5x device pixel ratio, and on a 4K screen that is the per-frame fill cost. `@enableFirefoxRescaling` / `@enableSafariRescaling` drop it to 1x / 2x **while scrolling** and restore full resolution 200ms after the last scroll — blurrier in motion, sharp at rest. Each only applies on its own browser, so switching both on is the normal thing to do.",
        },
        {
            kind: "note",
            text: '**`@renderStrategy` is a diagnostic, not a tuning knob.** The default already picks `"double-buffer"` on Safari and `"single-buffer"` elsewhere. Setting `"direct"` disables the scroll blit fast path and repaints every frame — which makes it useful for exactly one thing: if `"direct"` feels no slower than the default, the fast path was already disabled, and the cause is the first item in the list above.',
        },
        {
            kind: "p",
            text: "For genuinely high-frequency updates — thousands of cells a second from a socket — bypass tracking entirely with the imperative damage API (`updateCells` from `@onReady`). That is **Guide 8, *When the data isn't in memory***, and the **Streaming updates** tab measures it. It is not a fallback for a tracked grid that isn't repainting; that is a different bug, and it is **Guide 3**.",
        },
    ],
};
