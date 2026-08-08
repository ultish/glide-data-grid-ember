// DaisyUI theming demo (Phase 9). Proves a consuming app can drive the grid's canvas theme from
// its own design system's CSS custom properties, and that switching themes at runtime repaints the
// grid to match.
//
// **The addon has no DaisyUI dependency and no knowledge of DaisyUI.** Tailwind 4 and DaisyUI 5 are
// devDependencies of `test-app` only -- the same consumer-side boundary `object-scan` sits on (see
// PHASES.md's Phase 8 brief). What makes this work is generic: DaisyUI publishes its palette as
// inheritable CSS custom properties on `[data-theme]`, and `CssThemeWatcher` resolves whatever
// expressions you map onto whichever `Theme` fields you name.
//
// Two things had to be true before this was possible, and both are worth knowing:
//
//  1. **DaisyUI 5 stores its palette in `oklch()`**, and until the OKLCH fix in
//     `rendering/color-parser.ts` the grid parsed those to garbage -- `getComputedStyle` hands back
//     `oklch(...)` unconverted in Chrome, and the old regex stripped the spaces out of it. Every
//     colour below arrives as `oklch(...)`; if this demo ever renders in wrong colours, suspect
//     that parser first.
//  2. **`theme` is identity-compared by `computeCanBlit`.** Re-deriving the theme object on every
//     `MutationObserver` callback -- the obvious implementation -- would silently disable the
//     scroll blit fast path forever. `CssThemeWatcher` publishes a new object only when a resolved
//     value actually changed, which is the entire reason it lives in the addon instead of here.
import Component from "@glimmer/component";
import type Owner from "@ember/owner";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import { registerDestructor } from "@ember/destroyable";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import {
    allExtraCells,
    CssThemeWatcher,
    type CssThemeMapping,
    type GridColumn,
    type GridCell,
    type Item,
    type Theme,
} from "glide-data-grid-ember/rendering/index";
import { demoColumns, demoGetCellContent, DEMO_ROW_COUNT } from "test-app/utils/demo-data";

// The mapping is the whole integration: DaisyUI's semantic tokens on the left of the `var()`, the
// grid's `Theme` fields on the right of the colon. Nothing here is privileged -- a consumer with a
// different design system writes a different mapping and changes nothing else.
//
// The choices worth explaining, since a semantic palette never maps one-to-one onto a grid's:
//   - `base-100/200/300` are DaisyUI's surface ramp, so they become the cell/alt-cell/header
//     backgrounds. Using `base-200` for `bgCellMedium` is what makes zebra striping follow the theme.
//   - `base-content` is DaisyUI's "text on a base surface", so it drives every text colour. The
//     lighter grid text roles get it too -- DaisyUI has no separate muted-text token, and picking a
//     hardcoded grey here would break in dark themes, which is exactly what this demo must not do.
//   - `primary` is the accent. `accentLight` deliberately does NOT map to it: it is a *selection
//     wash* drawn under text, so it must stay translucent. `color-mix` keeps it tied to the theme
//     while staying see-through -- a flat `primary` would black out selected cells.
const DAISY_MAPPING: CssThemeMapping = {
    accentColor: "var(--color-primary)",
    accentFg: "var(--color-primary-content)",
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

// DaisyUI themes to offer. Must match the `themes:` list in `app/styles/tailwind.css` -- DaisyUI only
// emits CSS for themes named there, and a theme with no CSS resolves to the previous one's values,
// which looks like "the switcher is broken" rather than "that theme wasn't built".
const THEMES = ["light", "dark", "cupcake", "synthwave", "dracula", "retro", "forest", "aqua", "nord"] as const;

export default class DaisyDemo extends Component {
    @tracked theme: Partial<Theme> | undefined;
    @tracked activeTheme = "light";

    readonly columns: readonly GridColumn[] = demoColumns.slice(0, 10);
    readonly rows = DEMO_ROW_COUNT;
    readonly themes = THEMES;

    private watcher: CssThemeWatcher | undefined;

    constructor(owner: Owner, args: object) {
        super(owner, args);
        // `data-theme` is set on <html>, so that is what the mapping resolves against and what the
        // watcher observes. The initial read is synchronous -- the grid never renders unthemed.
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

    getCellContent = (item: Item): GridCell => demoGetCellContent(item);

    @action
    selectTheme(theme: string): void {
        this.activeTheme = theme;
        // The *only* thing this does is set an attribute. Everything else -- re-resolving ~25
        // custom properties, deciding whether anything actually changed, publishing a new theme
        // object, repainting the canvas -- follows from the MutationObserver inside CssThemeWatcher.
        document.documentElement.setAttribute("data-theme", theme);
    }

    isActive = (theme: string): boolean => this.activeTheme === theme;

    <template>
        <div class="flex flex-col gap-3 h-full bg-base-100 text-base-content p-3">
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold">DaisyUI theme:</span>
                {{#each this.themes as |t|}}
                    <button
                        type="button"
                        class="btn btn-sm {{if (this.isActive t) 'btn-primary' 'btn-outline'}}"
                        data-test-daisy-theme={{t}}
                        {{on "click" (fn this.selectTheme t)}}
                    >
                        {{t}}
                    </button>
                {{/each}}
            </div>

            <p class="text-xs opacity-70">
                The buttons above are DaisyUI components and the grid below is a canvas — both are
                driven by the same
                <code>data-theme</code>
                attribute on
                <code>&lt;html&gt;</code>. The grid follows via
                <code>CssThemeWatcher</code>, which resolves DaisyUI's
                <code>oklch()</code>
                custom properties into a grid theme and republishes it only when a value really
                changed.
            </p>

            <div class="flex-1 min-h-0 rounded-box overflow-hidden border border-base-300">
                <GlideDataGrid
                    @columns={{this.columns}}
                    @getCellContent={{this.getCellContent}}
                    @extraCells={{allExtraCells}}
                    @rows={{this.rows}}
                    @theme={{this.theme}}
                    @rowMarkers="number"
                />
            </div>
        </div>
    </template>
}
