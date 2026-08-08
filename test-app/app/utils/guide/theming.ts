// Guide chapter 10. Theming in one screen, deliberately.
//
// The full treatment — the precedence table, every `Theme` field, the `--gdg-*` custom properties and
// the DaisyUI/CSS-variable bridge — is the cookbook's `Theming` and `Theme reference` chapters, and
// stays there. This chapter exists only to tell a reader who has followed the guide in order what
// kind of thing theming is, and to hand them the one rule that connects it back to chapter 9.
import type { Section } from "../cookbook/types.ts";

export const themingSection: Section = {
    id: "theming",
    title: "Theming, in one screen",
    blocks: [
        {
            kind: "p",
            text: "The grid draws itself onto a `<canvas>`, so **CSS cannot style cells, headers or gridlines**. Everything visual comes from one plain JavaScript object — the `Theme` — handed down as an arg. There is no theme service, no provider and no stylesheet to import: it is data flowing through args, and it participates in autotracking like any other arg.",
        },
        {
            kind: "code",
            text: `import { getDataEditorDarkTheme } from "glide-data-grid-ember/rendering/index";

// Module scope: ONE allocation for the life of the page. \`@theme\` is identity-compared (chapter 9),
// so building this in the template — or in a plain getter — silently disables the scroll fast path.
const DARK = getDataEditorDarkTheme();

<GlideDataGrid @theme={{DARK}} ... />`,
        },
        {
            kind: "p",
            text: "Overrides layer, and later wins. Five levels, each one a `Partial<Theme>` naming only the fields it changes:",
        },
        {
            kind: "code",
            text: `base theme → @theme → column.themeOverride → @getRowThemeOverride(row) → cell.themeOverride`,
        },
        {
            kind: "list",
            items: [
                "A **column** override styles that column's header *and* its cells; a **row** override cannot reach a header, because a header belongs to no row.",
                "An open overlay editor is given the cell's fully merged theme, so an editor over a dark-themed row is styled to match it.",
                "`@getRowThemeOverride` is identity-compared too — a plain function reference, never `{{fn}}`.",
                "The addon's own DOM (overlay editors, the search bar, the scrollbars) *is* ordinary CSS, scoped under `.gdg-root`, and is yours to restyle.",
            ],
        },
        {
            kind: "note",
            text: "**The rest of theming is reference material, and it lives in the Cookbook.** → **Theming** for the precedence rules in full, the `--gdg-*` custom properties, and the working DaisyUI integration (`CssThemeWatcher` driving the canvas from your CSS variables, switching live on `data-theme`). → **Theme reference** for every field of `Theme`, with what each one paints. The **DaisyUI theming** tab is that integration running.",
        },
    ],
};
