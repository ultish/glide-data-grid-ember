// Guide chapter 9. The identity rules, as a first-class chapter.
//
// This is the definitive copy of the identity-compared arg list. The cookbook's `Performance rules`
// recipe is now a symptom-driven pointer at this chapter rather than a second statement of it — the
// whole point of Phase 11 was ending a two-copies situation, not creating a new one.
//
// The addon-side write-up (which fields `computeCanBlit` compares, and the Phase 2→6 history of this
// going undetected) is PORTING-NOTES.md's "computeCanBlit" material. This is the consumer version.
import type { Section } from "../cookbook/types.ts";

export const identitySection: Section = {
    id: "identity",
    title: "The identity rules",
    blocks: [
        {
            kind: "note",
            text: "**This is not an appendix.** The identity rule is the single biggest silent footgun this addon has: no error, no warning, no console message, and — unlike everything in chapter 3 — **no visual difference either**. The grid looks and behaves perfectly. It is just doing several times the work, forever.",
        },
        {
            kind: "p",
            text: "You have already met identity once, in chapter 3, wearing its *correctness* hat: a fresh `getCellContent` identity is what tells the render engine something changed, and is therefore how a repaint happens at all. This chapter is the other hat.",
        },

        // -- the mechanism ---------------------------------------------------------------------------
        {
            kind: "p",
            text: "**The mechanism.** The render engine has a fast path: when only the scroll offsets changed, it *blits* the previous frame instead of repainting it. To decide whether that is safe it compares about eighteen of its inputs **by identity** — `===`, not deep equality, because a deep comparison on every frame would cost more than the repaint it is trying to avoid.",
        },
        {
            kind: "p",
            text: "So a freshly allocated value in any one of those inputs makes the check fail on **every** frame, permanently. Scrolling stops blitting and starts fully repainting, and nothing tells you. This addon shipped exactly that defect in three fields from Phase 2 through Phase 6: the fast path never once engaged, every build passed, every browser test passed, and the grid looked flawless.",
        },

        // -- the args --------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**These args are identity-compared.** Each must be a `@cached` getter, a module-scope constant, or a stable instance field — never an inline arrow or object literal in the template, and never a plain (uncached) getter that reallocates:",
        },
        {
            kind: "table",
            head: ["Arg", "What goes wrong, and the fix"],
            rows: [
                [
                    "`@getCellContent`",
                    "the big one. A plain getter returning a fresh closure defeats it on every read — use `@cached`, or a class-field arrow, or `recordsSource`",
                ],
                [
                    "`@theme`",
                    "build it **once**. `getDataEditorDarkTheme()` at module scope, or a `@cached` getter — not an object literal in the template",
                ],
                [
                    "`@getRowThemeOverride`",
                    "a plain function reference. `{{fn this.x ...}}` allocates a new one per render",
                ],
                [
                    "`@getCellRenderer` / `@extraCells`",
                    "pass `allExtraCells` (a module constant) or a `@cached` combination — not a fresh array literal",
                ],
                [
                    "`@prelightCells`",
                    'pass `undefined` for "none", **not** `[]` — a fresh empty array is still a fresh identity',
                ],
                ["`@highlightRegions`", "same rule, same fix"],
                [
                    "`@columns`",
                    "replaced wholesale on resize/reorder, which is correct and expected — just don't rebuild it per render",
                ],
            ],
        },
        {
            kind: "code",
            text: `// ✗ a fresh closure on every read — the blit path is silently off, forever
get getCellContent() {
  return ([col, row]) => this.project(col, row);
}

// ✗ a fresh object on every render
<GlideDataGrid @theme={{hash accentColor="#4F5DFF"}} ... />

// ✓ stable: created once per component instance, at construction
getCellContent = ([col, row]) => this.project(col, row);

// ✓ stable, and re-derived only when \`records\` actually changes
@cached get gridArgs() { return recordsSource({ records: this.records, columns: COLUMNS, toCell }); }

// ✓ stable: module scope, one allocation for the life of the page
const DARK = getDataEditorDarkTheme();`,
        },

        // -- the Ember 6 convergence ------------------------------------------------------------------
        {
            kind: "p",
            text: "**This is why every handler in this guide is a class-field arrow rather than an `@action` method**, and the reason is worth stating rather than leaving as coincidence. Ember 6+ no longer recommends the decorator, so the arrow is simply the modern spelling — but it is *also* the identity-stable one: a class field is created **once per instance**, at construction, so `this.onEdit` is the same reference on every render. An `@action`-decorated method is bound per instance too, but the habit that comes with it — `{{fn this.thing arg}}`, inline arrows in templates — is exactly what allocates.",
        },
        {
            kind: "list",
            items: [
                "**The Ember 6 idiom and the blit-path rule point the same way**, so there is no trade-off to weigh. Write the modern spelling and you get the stable one.",
                "`{{fn}}` and `{{hash}}` allocate on every render. Both are fine on ordinary components and both defeat these seven args.",
                "A `@cached` getter is the escape hatch for anything that genuinely has to be derived: it recomputes only when tracked state it read changed, so its result keeps one identity in between.",
            ],
        },
        {
            kind: "note",
            text: "**How to check.** There is no runtime warning to enable, so the practical test is a Performance profile while scrolling: a healthy grid does very little per frame on a pure scroll. If every scroll frame shows a full paint, walk the seven args above and find the one being reallocated. It is nearly always `@getCellContent` or `@theme`.",
        },
        {
            kind: "p",
            text: "One last framing that makes the whole chapter easier to hold: chapter 3 said a **new** identity is how the grid learns something changed. This chapter says a **stable** identity is how it learns nothing did. They are the same mechanism read in two directions, and `recordsSource` is built to give you exactly one and exactly the other at the right moments.",
        },
    ],
};
