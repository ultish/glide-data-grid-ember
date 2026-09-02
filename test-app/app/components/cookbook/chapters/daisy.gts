import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import DaisyDemo from "test-app/components/daisy-demo";

const RECIPE = `import Component from "@glimmer/component";
import type Owner from "@ember/owner";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import { registerDestructor } from "@ember/destroyable";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import {
  CssThemeWatcher,
  GridCellKind,
  type CssThemeMapping,
  type GridCell,
  type GridColumn,
  type Item,
  type Theme,
} from "glide-data-grid-ember/rendering/index";

// The mapping is the whole integration. DaisyUI tokens on the left of the var(),
// grid Theme fields on the right of the colon. A different design system is a
// different mapping and nothing else.
const DAISY_MAPPING: CssThemeMapping = {
  accentColor: "var(--color-primary)",
  accentFg: "var(--color-primary-content)",
  // Selection wash under text — must stay translucent. A flat primary would black out selected cells.
  accentLight: "color-mix(in oklch, var(--color-primary) 18%, transparent)",

  textDark: "var(--color-base-content)",
  textMedium: "color-mix(in oklch, var(--color-base-content) 70%, transparent)",
  textLight: "color-mix(in oklch, var(--color-base-content) 45%, transparent)",
  textHeader: "var(--color-base-content)",
  textGroupHeader: "color-mix(in oklch, var(--color-base-content) 75%, transparent)",
  textHeaderSelected: "var(--color-primary-content)",
  textBubble: "var(--color-base-content)",

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
};

// Must match the themes: list in your Tailwind/Daisy config. A theme with no CSS
// resolves to the previous one's values, which looks like "the switcher is broken".
const THEMES = ["light", "dark", "cupcake", "dracula", "forest", "nord"] as const;

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const PEOPLE = [
  { name: "Ada Lovelace",      email: "ada@example.com",      role: "Mathematician" },
  { name: "Grace Hopper",      email: "grace@example.com",    role: "Rear Admiral" },
  { name: "Alan Turing",       email: "alan@example.com",     role: "Cryptanalyst" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
  { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

export default class ThemedGrid extends Component {
  @tracked theme: Partial<Theme> | undefined;
  @tracked activeTheme = "light";
  readonly columns = COLUMNS;
  readonly rows = PEOPLE.length;
  readonly themes = THEMES;

  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row];
    const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
  };

  private watcher: CssThemeWatcher | undefined;

  constructor(owner: Owner, args: object) {
    super(owner, args);
    this.watcher = new CssThemeWatcher({
      element: document.documentElement,
      mapping: DAISY_MAPPING,
      onChange: theme => (this.theme = theme),
    });
    this.theme = this.watcher.theme;
    registerDestructor(this, () => {
      this.watcher?.destroy();
      this.watcher = undefined;
      document.documentElement.removeAttribute("data-theme");
    });
  }

  selectTheme = (theme: string): void => {
    this.activeTheme = theme;
    // The only thing this does is set an attribute. CssThemeWatcher sees it,
    // re-resolves the mapping, and publishes a new Theme object only if a value changed.
    document.documentElement.setAttribute("data-theme", theme);
  };

  isActive = (theme: string): boolean => theme === this.activeTheme;

  <template>
    <div>
      {{#each this.themes as |t|}}
        <button type="button" {{on "click" (fn this.selectTheme t)}}>{{t}}</button>
      {{/each}}
    </div>
    <div style="height: 280px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{this.rows}}
        @getCellContent={{this.getCellContent}}
        @theme={{this.theme}}
      />
    </div>
  </template>
}`;

export default class DaisyChapter extends Component {
    recipe = RECIPE;
    liveBlurb = "The buttons are DaisyUI. The grid is a canvas. Both follow data-theme on document.documentElement.";

    <template>
        <p>
            The grid draws itself onto a
            <code>&lt;canvas&gt;</code>, so CSS cannot style cells. DaisyUI (or any design system) reaches the canvas
            through
            <code>CssThemeWatcher</code>: you map CSS custom properties onto
            <code>Theme</code>
            fields, and a
            <code>MutationObserver</code>
            republishes the theme when
            <code>data-theme</code>
            changes.
        </p>

        <p>
            The addon has no DaisyUI dependency. Tailwind 4 and DaisyUI 5 are this app's. A different design system is a
            different mapping.
        </p>

        <CookbookSection @title="DaisyUI 5 driving the canvas" @blurb={{this.liveBlurb}} @code={{this.recipe}}>
            <div style="height: 560px;">
                <DaisyDemo />
            </div>
        </CookbookSection>

        <ul>
            <li>
                DaisyUI 5 stores its palette in
                <code>oklch()</code>.
                <code>getComputedStyle</code>
                hands that back unconverted in Chrome. The addon's colour parser understands it; if this grid ever
                renders in wrong colours, suspect that parser first.
            </li>
            <li>
                <code>theme</code>
                is identity-compared.
                <code>CssThemeWatcher</code>
                publishes a new object only when a resolved value actually changed — re-deriving a theme object on every
                observer callback would silently disable the scroll blit fast path.
            </li>
            <li>
                <code>accentLight</code>
                is a selection wash under text. It must stay translucent (
                <code>color-mix</code>
                with
                <code>transparent</code>). A flat
                <code>primary</code>
                blacks out selected cells.
            </li>
            <li>
                Name every Daisy theme you offer in your Tailwind config. A theme with no emitted CSS resolves to the
                previous theme's values.
            </li>
        </ul>
    </template>
}
