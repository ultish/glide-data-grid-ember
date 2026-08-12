// Guide chapter 11. The hand-off into the cookbook, indexed by task.
//
// This is the seam between the two documents: the guide ends by telling you which recipe answers
// which question. Keep this table honest — if a cookbook chapter is added or renamed, it belongs here.
import type { Section } from "../cookbook/types.ts";

export const nextSection: Section = {
    id: "next",
    title: "Where to go next",
    blocks: [
        {
            kind: "p",
            text: "You now have a working, reactive, editable, themed grid backed by real data — and, more usefully, you know which of its rules are mechanical consequences of the pull model and which are genuinely arbitrary. From here on it is task-shaped, and that is what the **Cookbook** tab is for. Everything below is a recipe there.",
        },
        {
            kind: "table",
            head: ["You want to…", "Cookbook chapter"],
            rows: [
                ["size, freeze, group, auto-size or make columns resizable", "**Columns**"],
                ['make cells editable, add a trailing "new row", handle pastes', "**Editing**"],
                [
                    "read or control the selection, add row markers, drag rows, use the fill handle",
                    "**Selection, row markers, reordering, fill**",
                ],
                ["drag a value out to another app, or accept a drop onto a cell", "**Dragging data in and out**"],
                ["sort, and build the header dropdown that drives it", "**Sorting, and the header menu**"],
                [
                    "restyle it, or drive the canvas from your app's CSS variables",
                    "**Theming** and **Theme reference**",
                ],
                ["add find-in-grid, or wire your own search input", "**Search**"],
                ["show a right-click menu on a cell, header or group header", "**Context menus**"],
                ["ship a cell type the addon doesn't have", "**Custom cell types**"],
                ["use the 13 extra cell types (sparkline, star, tags, date picker, …)", "**Custom cell types**"],
                ["find out what this port deliberately does not do", "**Gotchas worth knowing once**"],
            ],
        },
        {
            kind: "p",
            text: "**Every other tab in this app is a working demo of something in one of the two documents**, and the recipes are lifted from them — so if a recipe stops working, a demo stops working. The **Full grid demo** is the reference integration with every shipped arg switched on; the **Tracking proof demo** is chapter 3 and chapter 4's measurements, live; **Streaming updates** and **Async paging** are chapter 8; **Apollo (faked)** is chapter 5's performance trade-off, with both projection counters on screen; **DaisyUI theming** is chapter 10.",
        },
        {
            kind: "note",
            text: "**If you take four things from this guide**, take these. `getCellContent` is an array index, not a computation (chapter 2). Reads must happen *inside* the tracking frame, which is what `@cached get gridArgs()` arranges (chapters 3 and 4). Replace arrays, mutate records (chapter 4, rule 3). And the seven identity-compared args must never be reallocated (chapter 9). Every other rule in this document follows from one of those.",
        },
    ],
};
