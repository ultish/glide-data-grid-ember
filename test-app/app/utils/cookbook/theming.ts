import type { Section } from "./types.ts";

export const themingSection: Section = {
    id: "theming",
    title: "Theming",
    blocks: [
        { kind: "p", text: "`THEMING.md` in the addon is the full guide. The two-line version:" },
        {
            kind: "code",
            text: `import { getDataEditorDarkTheme } from "glide-data-grid-ember/rendering/index";

const DARK = getDataEditorDarkTheme();     // module scope — see the performance chapter

<GlideDataGrid @theme={{if this.isDark DARK undefined}} ... />`,
        },
        {
            kind: "p",
            text: "Overrides stack: `@theme` → `column.themeOverride` → `@getRowThemeOverride` → `cell.themeOverride`.",
        },
        {
            kind: "p",
            text: "**\"My app already has a design system.\"** The grid stamps every theme value onto its root as a `--gdg-*` custom property, and `CssThemeWatcher` reads a theme back *out* of CSS variables — so a Tailwind or DaisyUI palette can drive the canvas, and switching `data-theme` switches the grid. The **DaisyUI theming** tab is that, live.",
        },
    ],
};
