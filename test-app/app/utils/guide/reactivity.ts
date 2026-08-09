// Guide chapter 3 — the highest-value chapter in the document.
//
// The tracking-frame rule is the addon's single most expensive misunderstanding, and it is the one
// thing that is genuinely *Ember-specific* about using it: everything else in this guide would read
// the same in any framework. The mechanism (and the evidence) is in PORTING-NOTES.md's
// "Autotracking → canvas" section; this is the consumer-facing version, and it is the only copy.
import type { Section } from "../cookbook/types.ts";

export const reactivitySection: Section = {
    id: "reactivity",
    title: "The reactivity model",
    blocks: [
        {
            kind: "note",
            text: "**If you read one chapter, read this one.** Everything it describes fails *silently* — no error, no warning, no console message, and a grid that looks completely correct until the moment your data changes and nothing happens.",
        },

        // -- the rule ------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**The rule: autotracking only records reads that happen *during* the tracking frame.** Ember establishes a computation's dependencies by watching which tracked properties are read *while it runs*. Reads that happen later — from a callback, a timer, an event handler — are outside the frame and register nothing.",
        },
        {
            kind: "p",
            text: "Now apply that to the pull model. `<GlideDataGrid>`'s modifier reads `this.args.getCellContent` — the function **reference**. It never calls it; the render engine calls it later, at paint time, from inside the draw loop. So every `@tracked` property your closure touches is read *outside* the frame that established the grid's dependencies, and **none of them becomes a dependency**.",
        },
        {
            kind: "code",
            text: `// ✗ Never repaints on a tracked change. This is the default thing to write, it type-checks,
//   it renders perfectly, and mutating \`person.name\` does absolutely nothing.
@tracked people = [ /* tracked Person instances */ ];

getCellContent = ([col, row]: Item): GridCell => cellFor(this.people[row]!, col);
//                                                     ^^^^^^^^^^^^^^^^^^
//                          read at PAINT time — long after the tracking frame closed.`,
        },
        {
            kind: "note",
            text: '**Nothing about that code is wrong to a type-checker, a linter, or a browser.** It is the shape almost everyone writes first, and the symptom — "my grid doesn\'t update" — points at the grid rather than at the closure. It is the reason `recordsSource` exists.',
        },

        // -- the fix -------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**The fix: read your data eagerly, inside the frame, and let the closure only index the result.** In practice that means a getter that projects the rows *when it runs* and returns a closure over the finished array.",
        },
        {
            kind: "code",
            text: `// ✓ The projection happens HERE, while the getter is running, so every \`person.name\` read is
//   inside the tracking frame and becomes a dependency of this getter.
@cached
get getCellContent() {
  const cells = this.people.map(p => [text(p.name), text(p.email), text(p.role)]);
  return ([col, row]: Item): GridCell => cells[row]?.[col] ?? BLANK;
}`,
        },
        {
            kind: "p",
            text: "Every link in the chain that follows is load-bearing, and it is worth being able to recite it: mutating `person.name` dirties the tag the getter consumed → the getter invalidates → the grid's modifier re-runs → `getCellContent` comes back with a **new identity** → the render engine's fast path sees a changed field and does a real repaint. Break any link and you get silence. (That last step is chapter 9: identity is not only a performance concern, it is *how the repaint happens*.)",
        },

        // -- @cached -------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Why `@cached`, and not a plain getter.** A plain getter re-runs on every read, and re-running that projection allocates a fresh closure — a fresh `getCellContent` identity — on every single access. The grid would see a changed arg constantly and repaint from scratch every frame, forever, while behaving perfectly. `@cached` (from `@glimmer/tracking`) memoizes the getter against the tracked state it consumed: it recomputes when, and only when, something it actually read changed.",
        },
        {
            kind: "list",
            items: [
                "`@cached` is **correctness plus performance** here, not tidiness. The projection is what registers your dependencies; the caching is what keeps the identity stable between real changes.",
                "It is invalidated by the same tags it consumed, so it cannot go stale. A `WeakMap` keyed on the record object *can* — see chapter 4's tuning notes for why that difference matters.",
                "The pattern to internalise is **`@cached get gridArgs()`**. Every later chapter uses it, and chapter 4 packages the projection inside it.",
            ],
        },

        // -- what repaints -------------------------------------------------------------------------
        {
            kind: "p",
            text: "**What actually repaints.** This table is the whole reactivity model in one place. Every row is a consequence of the rule at the top of this chapter plus the pull model in chapter 2 — there is nothing else to memorise.",
        },
        {
            kind: "table",
            head: ["What you did", "What re-projects", "Why"],
            rows: [
                [
                    "Mutate a `@tracked` field on one record",
                    "that one row",
                    "the record's own cache consumed that tag during the eager read",
                ],
                [
                    "Write an `@attr` on an Ember Data model",
                    "that one row",
                    "`@attr` is tracked; identical to the row above",
                ],
                [
                    "Replace a nested blob (`person.profile = {...}`)",
                    "that one row",
                    "one tracked write — the idiomatic way to change nested data (chapter 5)",
                ],
                [
                    "Assign a new `records` array (refetch, filter, server sort)",
                    "**every row**",
                    "the array identity is the per-row caches' key, so they are all rebuilt",
                ],
                [
                    "`push` / `splice` the existing array",
                    "**nothing**",
                    "identity unchanged and no tag dirtied — the grid never hears about it",
                ],
                [
                    "Mutate an untracked plain object (a GraphQL cache entity)",
                    "**nothing**",
                    "there is no tag to dirty; wrap it in a tracked class, or assign a new array",
                ],
                [
                    "Read tracked state lazily inside `getCellContent`",
                    "**nothing, ever**",
                    "the read happens at paint time, outside the tracking frame",
                ],
                [
                    "`api.updateCells([{ cell: [c, r] }])`",
                    "nothing re-projects; those cells repaint",
                    "the imperative damage path — bypasses autotracking entirely (chapter 8)",
                ],
            ],
        },
        {
            kind: "note",
            text: '**Two of those rows are the same bug wearing different clothes.** "`push` the existing array" and "mutate an untracked object" both mean *no tag was dirtied*, and both produce a grid that is confidently displaying stale data. When something doesn\'t update, ask "which tracked write was supposed to have happened?" before looking at the grid at all.',
        },
        {
            kind: "p",
            text: "There is one deliberate exception to all of this, and it is not a workaround: `updateCells()` from `@onReady` repaints named cells imperatively, bypassing tracking entirely. It is the right tool for a genuine firehose and the wrong tool for an untracked read. Chapter 8.",
        },
        {
            kind: "p",
            text: "The next chapter packages this whole chapter into one function call, so that the eager read, the per-row memoization and the identity stability are all things you get rather than things you remember.",
        },
    ],
};
