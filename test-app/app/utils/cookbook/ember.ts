// Phase 11 shrank this chapter from ~25k characters to a signpost, and that was the point of the
// phase rather than a side effect.
//
// It used to be the addon's `DATA.md` poured into a recipe slot, and it was by far the longest thing
// in the book — the visible symptom of one artifact doing two jobs. That material is *narrative*: the
// pull model, the tracking-frame rule, `@cached`, identity stability, Ember Data live arrays. None of
// it is task-shaped, because nobody looks up "don't let my array identity go stale" — you have to
// know it before recipe 1. It now lives in the **Guide** tab (`app/utils/guide/`), in order, and
// there is exactly one copy: nothing below restates it.
//
// What stays here is the thing a cookbook is actually good at — a symptom index. Every entry is a
// real failure mode of this addon in an Ember app, and every one of them is silent.
import type { Section } from "./types.ts";

export const emberSection: Section = {
    id: "ember",
    title: "Using the grid in Ember",
    blocks: [
        {
            kind: "note",
            text: "**This chapter is an index, not a manual. The manual is the Guide tab.** Wiring the grid into an Ember app is a handful of cross-cutting rules — the pull model, autotracking's tracking-frame rule, identity stability — that apply to *every* recipe in this book rather than to any one of them. They are written out in order in the **Guide**, with one worked example carried end to end. Read it once; this chapter is what you come back to when something is silently wrong.",
        },

        {
            kind: "p",
            text: "**The five rules, one line each.** Each links to the chapter of the **Guide** that explains why. If you can recite these you will not hit anything below.",
        },
        {
            kind: "list",
            items: [
                "`getCellContent` is an **array index, never a computation** — it runs inside the draw loop. *(Guide 2)*",
                "Your data must be read **eagerly, inside the tracking frame** — a closure that reads `@tracked` state at paint time registers no dependency. *(Guide 3)*",
                "Call `recordsSource` from a **`@cached` getter**, and keep `columns` / `toCell` identity-stable. *(Guide 4)*",
                "**Replace the array; mutate the records.** `push`/`splice` keeps the identity and is missed. *(Guide 4)*",
                "The **identity-compared args** — `@getCellContent`, `@theme`, `@getRowThemeOverride`, `@getCellRenderer`/`@extraCells`, `@prelightCells`, `@highlightRegions`, `@columns` — must never be reallocated per render. Class-field arrows, module constants, `@cached` getters. *(Guide 9)*",
            ],
        },

        {
            kind: "p",
            text: "**Symptom index.** Every row here fails silently: no error, no warning, and in the last case no visual difference at all.",
        },
        {
            kind: "table",
            head: ["Symptom", "Almost always", "Read"],
            rows: [
                [
                    "Nothing appears; the grid has zero height",
                    "the container has no height — the grid sizes to it and has no `width`/`height` args",
                    "Guide 1",
                ],
                [
                    "Data changes, the grid never repaints",
                    "`getCellContent` reads tracked state lazily, so no dependency was ever registered",
                    "Guide 3",
                ],
                [
                    "A row you added paints as blank cells",
                    "a live Ember Data array (`peekAll`/`findAll`) handed straight to `recordsSource` — spread it",
                    "Guide 5",
                ],
                [
                    "A new row doesn't show up at all",
                    "an in-place `push` — the array identity never changed",
                    "Guide 4",
                ],
                [
                    "Editing feels slow at a few thousand rows",
                    "`records` is derived from a `.map()`/`.filter()`, so every per-row cache resets on every change",
                    "Guide 4",
                ],
                [
                    "A GraphQL poll re-projects everything every few seconds",
                    "each response is a new array; reconcile into tracked models keyed by id instead",
                    "Guide 5",
                ],
                [
                    "An `object-scan`-style path scanner matches nothing",
                    "it was pointed at a model instance — `@tracked`/`@attr` are prototype accessors, not own properties",
                    "Guide 6",
                ],
                [
                    "Edits land on the wrong record after sorting",
                    "your own `onCellsEdited` was wired to the grid instead of the one `withColumnSort` returns",
                    "*Sorting*, below",
                ],
                [
                    "Everything works, but scrolling repaints every frame",
                    "an identity-compared arg is being reallocated — usually `@getCellContent` or `@theme`",
                    "Guide 9",
                ],
            ],
        },
        {
            kind: "note",
            text: "**`@action` is not the idiom here.** Ember 6+ no longer recommends the decorator, and in this addon the class-field arrow is not merely the modern spelling — it is the **identity-stable** one, created once per instance at construction. The Ember 6 idiom and the blit-path rule point the same way, which is the only reason a mechanical-looking style choice is safe. *(Guide 9.)*",
        },
    ],
};
