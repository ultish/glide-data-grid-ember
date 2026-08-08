// Guide chapter 2. The pull model: the contract that makes 200,000 rows cost what 20 does, and the
// one consequence of it that consumers get wrong (work inside `getCellContent`).
//
// This absorbs the "1. `getCellContent` must be an O(1) lookup" half of the cookbook's old chapter 4.
import type { Section } from "../cookbook/types.ts";

export const pullModelSection: Section = {
    id: "pull-model",
    title: "The pull model",
    blocks: [
        {
            kind: "p",
            text: "`<GlideDataGrid>` is a **pull** API. You hand it `@columns`, `@rows` (a count) and `@getCellContent`, and it asks for cells as it paints them — only the cells actually on screen, only when it is drawing them. It never receives your array, never iterates it, and never holds a copy. That is the whole reason 200,000 rows costs about what 20 does: the viewport is what is expensive, and the viewport is a constant.",
        },
        {
            kind: "p",
            text: "It also means the grid has no idea when your data changes. Nothing observes `PEOPLE`. Chapter 3 is entirely about closing that loop; this chapter is about the other half of the contract.",
        },

        {
            kind: "p",
            text: "**`getCellContent` must be an O(1) lookup, never a computation.** It runs *inside the draw loop*. A full repaint of an ordinary viewport is a few hundred calls; a fast scroll is a fresh strip of them every frame; a drag-selection re-reads on every mouse move. Anything you do in there, you do at frame rate.",
        },
        {
            kind: "code",
            text: `// ✗ On the paint path. Date parsing, currency formatting and a nested walk, several hundred
//   times per frame — for cells that mostly did not change.
getCellContent = ([col, row]: Item): GridCell => {
  const p = this.people[row]!;
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.salary));
    case 2: return text(p.profile.pets.map(x => x.name).sort().join(", "));
  }
};

// ✓ Off the paint path. \`cells\` was projected once, ahead of time; this is an array index.
getCellContent = ([col, row]: Item): GridCell => this.cells[row]?.[col] ?? BLANK;`,
        },
        {
            kind: "p",
            text: "Everything the second version needs — where `this.cells` comes from, when it is rebuilt, and how it stays *correct* — is chapters 3 and 4. `recordsSource` exists precisely to produce it, and reduces `getCellContent` to exactly that one index.",
        },

        {
            kind: "p",
            text: "**Coordinates.** `getCellContent` receives `[column, row]`, both zero-based, both in **your** coordinate space. Row markers, frozen columns, the trailing blank row and the header are the grid's own business — it never shifts your indices to account for them, and every callback that hands you a column index has already stripped the row-marker column back out.",
        },
        {
            kind: "note",
            text: "**`@rows` past the end of your data is your bug, not the grid's.** The grid will ask for those cells, and `getCellContent` must return *something* for them. Return a blank cell rather than throwing — a throw inside the draw loop takes the frame with it.",
        },
        {
            kind: "p",
            text: "The one thing you never do is reach for a row count to decide your architecture. Which helper you want is decided by a fact about your data, not by a number you have to guess: an array you genuinely hold in memory uses chapter 4 at eight rows and at two hundred thousand; data that arrives a page at a time cannot use it at five hundred. That is chapter 8.",
        },
    ],
};
