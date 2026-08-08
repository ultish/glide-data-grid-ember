import type { Section } from "./types.ts";

export const performanceSection: Section = {
    id: "performance",
    title: "Performance rules",
    blocks: [
        {
            kind: "note",
            text: "This is not an appendix. **The identity-stability rule is the single biggest silent footgun this addon has** — it has no error, no warning and no visual symptom.",
        },
        {
            kind: "p",
            text: "The render engine has a fast path: when only the scroll offsets changed, it *blits* the previous frame instead of repainting. To decide that, it compares about eighteen fields **by identity**. A freshly allocated value in any of them makes the check fail permanently, and the grid quietly repaints from scratch every frame.",
        },
        {
            kind: "p",
            text: "These args are identity-compared. Each must be a `@cached` getter, a module-scope constant, or a stable instance field — never an inline arrow or object literal in the template:",
        },
        {
            kind: "table",
            head: ["Arg", "Notes"],
            rows: [
                ["`@getCellContent`", "the big one — a getter returning a fresh closure defeats it"],
                ["`@theme`", "build it once; `getDataEditorDarkTheme()` at module scope"],
                ["`@getRowThemeOverride`", "a plain function reference, not `{{fn this.x}}`"],
                ["`@getCellRenderer` / `@extraCells`", "pass `allExtraCells`, or a `@cached` combination"],
                ["`@prelightCells`", "pass `undefined` for \"none\", not `[]`"],
                ["`@highlightRegions`", "same"],
                ["`@columns`", "replaced wholesale on resize/reorder — just don't rebuild it per render"],
            ],
        },
        {
            kind: "code",
            text: `// ✗ a fresh closure every render — blit path silently off
get getCellContent() {
  return ([col, row]) => this.project(col, row);
}

// ✓ stable
getCellContent = ([col, row]) => this.project(col, row);

// ✓ also stable, and re-derived only when \`records\` changes
@cached get gridArgs() { return recordsSource({ records: this.records, columns: COLUMNS, toCell }); }`,
        },
        {
            kind: "p",
            text: "That is also why every handler in this cookbook is a **class-field arrow** rather than an `@action` method. Ember 6+ no longer recommends the decorator — but the arrow is not merely the modern spelling, it is the identity-stable one: it is created **once per instance**, at construction, so `this.handleReady` is the same reference on every render. The Ember 6 idiom and the identity rule point the same way, which is the only reason a mechanical-looking style choice is safe here.",
        },
        {
            kind: "p",
            text: "**The reactivity rule.** Autotracking only records reads made *during* the tracking frame. A `@getCellContent` closure that reads tracked state lazily — later, when the grid calls it — never registers a dependency, so mutating that state repaints nothing. The *Using the grid in Ember* chapter has the mechanism and the two patterns that work; `recordsSource` packages the safe one.",
        },
        {
            kind: "p",
            text: "**High-frequency updates.** A `@tracked` change triggers a full-viewport redraw, which is cheap because the grid is virtualised. For genuinely high-frequency streams — thousands of cells a second — bypass tracking and use the imperative damage API:",
        },
        {
            kind: "code",
            text: `handleReady = api => { this.api = api; };

// ...later, from a websocket tick:
this.api.updateCells([{ cell: [3, 91] }, { cell: [4, 91] }]);`,
        },
        {
            kind: "p",
            text: "That repaints exactly those cells. It is how the upstream library gets its numbers, and it is not something `@tracked` should be made to do on a large dataset. The **Streaming updates** tab measures it.",
        },
    ],
};
