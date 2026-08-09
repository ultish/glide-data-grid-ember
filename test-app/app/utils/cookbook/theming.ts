import type { Section } from "./types.ts";

export const themingSection: Section = {
    id: "theming",
    title: "Theming",
    blocks: [
        {
            kind: "p",
            text: "The grid draws itself onto a `<canvas>`, so **CSS cannot style cells, headers or gridlines**. Everything visual comes from one plain JavaScript object — the `Theme` — handed down as args. There is no theme service, no context/provider and no stylesheet to import: it is data flowing through args, and it participates in autotracking like any other arg.",
        },
        {
            kind: "code",
            text: `import {
  getDataEditorTheme,      // () => Theme           — the stock light theme (complete)
  getDataEditorDarkTheme,  // () => Partial<Theme>  — the stock dark theme (an overlay)
  mergeAndRealizeTheme,    // (Theme, ...Partial<Theme>) => FullTheme
  makeCSSStyle,            // (Theme) => Record<string, string>  — the --gdg-* variables
  CssThemeWatcher,         // drive the theme from CSS custom properties
} from "glide-data-grid-ember/rendering/index";`,
        },

        {
            kind: "p",
            text: "**Precedence.** Five levels, merged left to right — later wins. Everything except the base is a `Partial<Theme>`: name only the fields you want to change.",
        },
        {
            kind: "code",
            text: `base theme → @theme → column.themeOverride → @getRowThemeOverride(row) → cell.themeOverride`,
        },
        {
            kind: "table",
            head: ["Level", "Where you set it", "Applies to"],
            rows: [
                ["base", "built in (`getDataEditorTheme()`)", "everything"],
                ["global", "`<GlideDataGrid @theme={{...}}>`", "everything"],
                ["column", "`themeOverride` on a `GridColumn`", "that column's header **and** all of its cells"],
                ["row", "`<GlideDataGrid @getRowThemeOverride={{fn}}>`", "every cell in that row — *not* the header"],
                ["cell", "`themeOverride` on the `GridCell` you return", "that one cell; beats column and row"],
            ],
        },
        {
            kind: "p",
            text: "Headers merge only `base + @theme + column.themeOverride` — a row override cannot reach a header, because a header belongs to no row. An open overlay editor is given the *cell's* fully merged theme, so an editor opened over a dark-themed row is styled to match it.",
        },
        {
            kind: "note",
            text: "**`bgCell` is blended, not replaced.** It is the one field the merge treats specially: an overlay's `bgCell` is alpha-blended *over* the value beneath it. Every other field is a plain overwrite. That is what makes layered tints compose — a translucent `bgCell` reads correctly over a light *or* a dark base.",
        },
        {
            kind: "code",
            text: `const ZEBRA = { bgCell: "rgba(79, 93, 255, 0.07)" };   // tints whatever is underneath
const SOLID = { bgCell: "#fff8e1" };                    // opaque — flattens any tint below it`,
        },

        {
            kind: "p",
            text: "**Light and dark.** `getDataEditorDarkTheme()` returns a `Partial<Theme>` overlay, so it goes straight into `@theme`. `undefined` means the stock light theme.",
        },
        {
            kind: "code",
            text: `import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { getDataEditorDarkTheme, type Theme } from "glide-data-grid-ember/rendering/index";

// MODULE SCOPE. Resolved once — a new object identity per render would silently
// disable the scroll blit fast path. See the identity note below.
const DARK: Partial<Theme> = getDataEditorDarkTheme();

export default class MyGrid extends Component {
  @tracked isDark = false;

  get theme(): Partial<Theme> | undefined {
    return this.isDark ? DARK : undefined;   // two stable identities, never a fresh one
  }

  // Class-field arrow, not @action — Ember 6 idiom, and stable by identity for free.
  toggleTheme = () => { this.isDark = !this.isDark; };

  <template>
    <button class="btn btn-xs" type="button" {{on "click" this.toggleTheme}}>Toggle theme</button>
    <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}}
                   @getCellContent={{this.getCellContent}} @theme={{this.theme}} />
  </template>
}`,
        },
        {
            kind: "code",
            text: `// Tweak the stock dark theme
const DARK_BRANDED = { ...getDataEditorDarkTheme(), accentColor: "#00c2a8", linkColor: "#00c2a8" };

// Or build one from the light base
const HOTDOG = { ...getDataEditorTheme(), bgCell: "#ff0000", bgHeader: "#f3f300", textDark: "#fff" };`,
        },

        {
            kind: "p",
            text: "**Per-column overrides.** `themeOverride` on the column itself, applying to its header and its cells.",
        },
        {
            kind: "code",
            text: `const TOTAL_COLUMN = {                     // hoisted, so its identity is stable
  bgCell: "rgba(255, 196, 61, 0.22)",      // translucent → tints whatever is beneath
  textDark: "#b06a00",
  baseFontStyle: "600 13px",
};

const columns = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "total", title: "Total", width: 120, themeOverride: TOTAL_COLUMN },
];`,
        },

        {
            kind: "p",
            text: '**Per-row overrides** — zebra striping, status highlighting. Return `undefined`, not `{}`, for an unstyled row: the render loop has a cheap "no override for this row" fast path keyed on exactly that.',
        },
        {
            kind: "code",
            text: `// MODULE SCOPE — both the override object and the function itself.
const ODD_ROW = { bgCell: "rgba(79, 93, 255, 0.07)" };

function getRowThemeOverride(row: number) {
  return row % 2 === 1 ? ODD_ROW : undefined;
}

<GlideDataGrid ... @getRowThemeOverride={{getRowThemeOverride}} />`,
        },

        {
            kind: "p",
            text: "**Per-cell overrides.** The most specific level. `getCellContent` runs for every visible cell on every draw, so hoist the override objects rather than building one per call.",
        },
        {
            kind: "code",
            text: `const OVERDUE = { bgCell: "rgba(255, 71, 87, 0.30)", textDark: "#c40021" };

getCellContent = ([col, row]) => {
  const record = this.data[row];
  return {
    kind: GridCellKind.Text,
    data: record.title,
    displayData: record.title,
    allowOverlay: true,
    themeOverride: record.isOverdue ? OVERDUE : undefined,
  };
};`,
        },

        {
            kind: "note",
            text: "**Identity stability is load-bearing here, not stylistic advice.** `@theme` and `@getRowThemeOverride` are among the ~18 `DrawGridArg` fields `computeCanBlit` compares **by object identity** to decide whether it can blit the previous frame instead of repainting. A fresh object or arrow function per render defeats that check permanently — with no error, no warning and no visual difference, just a full repaint on every scroll frame.",
        },
        {
            kind: "list",
            items: [
                "`@theme` — a module-scope constant or a `@cached` getter. Never `getDataEditorDarkTheme()` inline in a plain getter.",
                "`@getRowThemeOverride` — a module-scope function or a **class-field arrow** (`x = () => {}`), which is created once per instance. Never `{{fn this.rowTheme}}` and never a getter that returns a new closure.",
                "Every `themeOverride` object on a column or a cell — hoist them.",
                "The same rule covers `@getCellContent` and `@columns`. The **Performance rules** chapter has the full list.",
            ],
        },

        {
            kind: "p",
            text: '**"My app already has a design system."** If your palette is already CSS custom properties, drive the grid from those instead of hand-writing a `Theme` — including switching themes at runtime. `CssThemeWatcher` is the bridge: you name the CSS expressions and which `Theme` fields they feed. **The addon has no dependency on, and no knowledge of, any design system** — DaisyUI below is a `test-app` devDependency only.',
        },
        {
            kind: "p",
            text: "Step 1 — the mapping. Left side: your semantic tokens. Right side: the grid's `Theme` fields. A semantic palette never maps one-to-one onto a grid's, and the interesting choices are the ones that don't:",
        },
        {
            kind: "code",
            text: `import { CssThemeWatcher, type CssThemeMapping } from "glide-data-grid-ember/rendering/index";

const DAISY_MAPPING: CssThemeMapping = {
  accentColor: "var(--color-primary)",
  accentFg: "var(--color-primary-content)",
  // A selection wash is drawn UNDER text, so it must stay translucent. Mapping it to a
  // flat --color-primary would black out every selected cell. color-mix keeps it tied
  // to the theme while staying see-through.
  accentLight: "color-mix(in oklch, var(--color-primary) 18%, transparent)",

  // base-content is "text on a base surface", so it drives every text role. DaisyUI has no
  // separate muted-text token, and a hardcoded grey would break in dark themes — which is
  // exactly what this must not do.
  textDark: "var(--color-base-content)",
  textMedium: "color-mix(in oklch, var(--color-base-content) 70%, transparent)",
  textLight: "color-mix(in oklch, var(--color-base-content) 45%, transparent)",
  textHeader: "var(--color-base-content)",
  textGroupHeader: "color-mix(in oklch, var(--color-base-content) 75%, transparent)",
  textHeaderSelected: "var(--color-primary-content)",
  textBubble: "var(--color-base-content)",

  // base-100/200/300 are the surface ramp. base-200 for bgCellMedium is what makes zebra
  // striping follow the theme.
  bgCell: "var(--color-base-100)",
  bgCellMedium: "var(--color-base-200)",
  bgHeader: "var(--color-base-200)",
  bgHeaderHasFocus: "var(--color-base-300)",
  bgHeaderHovered: "var(--color-base-300)",
  bgGroupHeader: "var(--color-base-200)",
  bgGroupHeaderHovered: "var(--color-base-300)",
  bgBubble: "var(--color-base-200)",
  bgBubbleSelected: "var(--color-base-100)",
  bgSearchResult: "color-mix(in oklch, var(--color-warning) 25%, transparent)",

  borderColor: "color-mix(in oklch, var(--color-base-content) 15%, transparent)",
  horizontalBorderColor: "color-mix(in oklch, var(--color-base-content) 10%, transparent)",
  drilldownBorder: "color-mix(in oklch, var(--color-base-content) 20%, transparent)",
  linkColor: "var(--color-info)",

  bgIconHeader: "color-mix(in oklch, var(--color-base-content) 60%, transparent)",
  fgIconHeader: "var(--color-base-100)",
};`,
        },
        {
            kind: "p",
            text: "Step 2 — the component. Construct the watcher, take its synchronous initial value so the grid never renders unthemed, and destroy it on teardown. Switching themes is then *only* setting an attribute; re-resolving the properties, deciding whether anything changed, republishing and repainting all follow from the watcher's `MutationObserver`.",
        },
        {
            kind: "code",
            text: `import Component from "@glimmer/component";
import type Owner from "@ember/owner";
import { tracked } from "@glimmer/tracking";
import { registerDestructor } from "@ember/destroyable";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { CssThemeWatcher, type Theme } from "glide-data-grid-ember/rendering/index";

export default class DaisyGrid extends Component {
  @tracked theme: Partial<Theme> | undefined;
  @tracked activeTheme = "light";

  private watcher: CssThemeWatcher | undefined;

  constructor(owner: Owner, args: object) {
    super(owner, args);
    // data-theme is set on <html>, so that is what the mapping resolves against
    // and what the watcher observes.
    this.watcher = new CssThemeWatcher({
      element: document.documentElement,
      mapping: DAISY_MAPPING,
      onChange: theme => (this.theme = theme),
    });
    this.theme = this.watcher.theme;   // synchronous initial value
    registerDestructor(this, () => {
      this.watcher?.destroy();
      this.watcher = undefined;
    });
  }

  // Class-field arrow: stable identity, and the Ember 6 replacement for @action.
  selectTheme = (theme: string) => {
    this.activeTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);   // that is the whole switch
  };

  <template>
    {{#each this.themes as |t|}}
      <button class="btn btn-xs" type="button" {{on "click" (fn this.selectTheme t)}}>{{t}}</button>
    {{/each}}
    <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}}
                   @getCellContent={{this.getCellContent}} @theme={{this.theme}} />
  </template>
}`,
        },
        {
            kind: "p",
            text: 'Any expression valid in a `color:` declaration works: `var(--x)`, `var(--x, fallback)`, a literal `oklch(...)`, `color-mix(...)`. An expression that does not resolve is **skipped**, leaving that field\'s built-in value — so a typo degrades to "unthemed field", never to black. The probe element is appended *inside* your element, so a `[data-theme]` set on a subtree resolves correctly. `CssThemeWatcher` watches `data-theme` by default; pass `attributes` to watch others, or `[]` and call `refresh()` yourself.',
        },
        {
            kind: "note",
            text: "**Why this is a class and not three lines of your own code.** It publishes a new theme object *only when a resolved value actually changed*. The obvious implementation — re-deriving the theme inside the `MutationObserver` callback — hands the render engine a fresh object on every unrelated attribute write and silently disables the scroll blit fast path for the lifetime of the app. Same identity rule as above, in the one place it is easiest to trip over.",
        },
        {
            kind: "p",
            text: '**Tailwind 4 in an Ember app — the non-obvious part.** `@import "tailwindcss"` inside `app/styles/app.css` **does not work**. Embroider serves that file as a *virtual* module (`@embroider/virtual/app.css`) which never reaches `@tailwindcss/vite`, so the directives ship to the browser as literal text: no utilities generated, no design-system variables defined, and the only symptom is unstyled markup — nothing errors. Put them in a real file and import it from `app/app.ts`, which routes it through Vite\'s ordinary CSS pipeline where the plugin does run.',
        },
        {
            kind: "code",
            text: `/* app/styles/tailwind.css — a REAL file, not app.css */
@import "tailwindcss";

/* DaisyUI only emits CSS for themes named here. Selecting a theme that was never built
   silently keeps the previous theme's values, which reads as "the switcher is broken". */
@plugin "daisyui" {
  themes: light --default, dark, cupcake, synthwave, dracula, retro, forest, aqua, nord;
}

/* app/app.ts */
import "./styles/tailwind.css";`,
        },
        {
            kind: "p",
            text: "Modern palettes — DaisyUI 5 and Tailwind 4 among them — store colours as `oklch()`, and Chrome hands those back from `getComputedStyle` *unconverted*. The grid parses `oklch()` and `oklab()` directly and falls back to a canvas probe for `lab()`, `lch()` and `color()`; hex, named colours and `hsl()` are converted by the browser before it ever sees them. The **DaisyUI theming** tab is this recipe, live.",
        },
    ],
};
