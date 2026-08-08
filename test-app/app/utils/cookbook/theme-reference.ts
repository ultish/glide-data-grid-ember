import type { Section } from "./types.ts";

export const themeReferenceSection: Section = {
    id: "theme-reference",
    title: "Theme reference",
    blocks: [
        {
            kind: "p",
            text: "Every field of `Theme`, and the `--gdg-*` custom properties the grid stamps for your DOM. Only the fields marked *optional* may be absent — everything else is present on the base theme, and **any level of the precedence chain may override any field**.",
        },

        {
            kind: "p",
            text: "**What a colour value may be.** Any CSS colour the browser understands, including modern colour spaces. Theme colours are handed to the canvas verbatim for plain fills, but the grid also has to *read* them numerically — to alpha-blend a `bgCell` overlay, to derive translucent variants, to pick a readable foreground — so each one is resolved to RGBA on first use and cached.",
        },
        {
            kind: "p",
            text: "That resolution understands `rgb()`/`rgba()` (comma **and** space syntax), `oklch()` and `oklab()` directly, and falls back to painting a pixel for anything else (`lab()`, `lch()`, `color(display-p3 …)`, …). Named colours, hex and `hsl()` are converted to `rgb()` by the browser before it ever gets there. An unparseable value degrades to opaque black rather than to a random colour, and warns on the console in development builds.",
        },
        {
            kind: "note",
            text: "`oklch()` matters in particular because **Chrome does not convert it** — `getComputedStyle` hands back `oklch(0.7 0.15 250)` unchanged — and it is the native format of Tailwind 4 and DaisyUI 5 palettes.",
        },
        {
            kind: "code",
            text: `// all equivalent, all fine as a theme value
{ accentColor: "#4F5DFF" }
{ accentColor: "rgb(79, 93, 255)" }
{ accentColor: "oklch(0.5693 0.2369 272.44)" }
{ bgCell: "oklch(0.7 0.15 250 / 0.07)" }   // translucent overlays work too`,
        },

        { kind: "p", text: "**Colours — accents and selection**" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                [
                    "`accentColor`",
                    "selection ring, selected-column header fill, focus ring, the overlay editor's border, and several cells' primary colour (link / button / slider fill, sparkline stroke)",
                ],
                ["`accentFg`", "foreground drawn on top of `accentColor` — e.g. a button cell's label"],
                [
                    "`accentLight`",
                    "translucent fill for cells inside a selected range, selected blank areas, and the column-resize indicator. **Keep it translucent** — it is drawn under text",
                ],
            ],
        },

        { kind: "p", text: "**Colours — text**" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                [
                    "`textDark`",
                    "primary cell text (text / number / uri / markdown / date / tags / … cells) and editor input text",
                ],
                [
                    "`textMedium`",
                    "secondary text — the \"add row\" hint, checkbox glyph outlines, sparkline labels, tree-view chrome, spinner",
                ],
                [
                    "`textLight`",
                    "de-emphasised text — row-ID cells, protected cells, sparkline axis labels",
                ],
                ["`textBubble`", "text inside bubble / drilldown / multi-select chips"],
                ["`textHeader`", "column header title text"],
                ["`textHeaderSelected`", "header title text when that column is selected"],
                [
                    "`textGroupHeader` *(optional)*",
                    "column-group header text; falls back to `textHeader`. Drawn — column grouping is live, and turns on automatically when any column has a `group`",
                ],
            ],
        },

        { kind: "p", text: "**Colours — backgrounds**" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                [
                    "`bgCell`",
                    "the cell background. **Alpha-blended, not replaced, when overridden** — the one field the merge treats specially",
                ],
                ["`bgCellMedium`", "background for `Protected` cells; also the usual zebra-stripe target"],
                [
                    "`bgHeader`",
                    "header background, and the background behind blank areas past the last row/column",
                ],
                ["`bgHeaderHasFocus`", "header background when the active cell is in that column"],
                [
                    "`bgHeaderHovered`",
                    "header background on hover; also the \"add row\" affordance hover fill",
                ],
                ["`bgBubble`", "chip/pill fill in bubble, tags, multi-select and range cells"],
                ["`bgBubbleSelected`", "chip fill when that cell is selected"],
                ["`bgSearchResult`", "search-hit highlight. Drawn — search is implemented"],
                ["`bgIconHeader`", "fill of header icon sprites, and the \"add row\" `+` icon"],
                ["`fgIconHeader`", "foreground of header icon sprites"],
                [
                    "`bgGroupHeader`, `bgGroupHeaderHovered` *(optional)*",
                    "column-group header background and its hover state; fall back to `bgHeader` / `bgHeaderHovered`",
                ],
            ],
        },

        { kind: "p", text: "**Colours — borders and links**" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                [
                    "`borderColor`",
                    "all gridlines (vertical, and horizontal when `horizontalBorderColor` is unset), header borders, highlight rings",
                ],
                [
                    "`horizontalBorderColor` *(optional)*",
                    "horizontal gridlines only; falls back to `borderColor`",
                ],
                [
                    "`headerBottomBorderColor` *(optional)*",
                    "the line under the header; falls back to `horizontalBorderColor`, then `borderColor`",
                ],
                ["`drilldownBorder`", "border around drilldown-cell chips"],
                ["`linkColor`", "uri-cell link text, and its underline on hover"],
                [
                    "`resizeIndicatorColor` *(optional)*",
                    "the column-resize drag indicator; falls back to `accentLight`",
                ],
            ],
        },

        { kind: "p", text: "**Sizes and spacing** — numbers, in px unless noted" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                [
                    "`cellHorizontalPadding`",
                    "left/right padding inside every cell and header — the single most impactful layout knob",
                ],
                [
                    "`cellVerticalPadding`",
                    "top/bottom padding inside cells; also the overlay editor's vertical padding",
                ],
                ["`bubbleHeight`", "height of chips in bubble / tags / multi-select cells"],
                ["`bubblePadding`", "horizontal padding inside a chip"],
                ["`bubbleMargin`", "gap between adjacent chips"],
                [
                    "`headerIconSize`",
                    "size of a column's header icon sprite; also used by the header-menu hit test",
                ],
                ["`checkboxMaxSize`", "max drawn size of boolean-cell and row-marker checkboxes"],
                ["`lineHeight`", "**unitless** multiplier for multi-line / wrapped text layout"],
                [
                    "`roundingRadius` *(optional)*",
                    "corner radius for chips, checkboxes, image thumbnails, buttons, loading skeletons. Unset = each element's own default",
                ],
            ],
        },

        { kind: "p", text: "**Fonts**" },
        {
            kind: "table",
            head: ["Field", "Controls"],
            rows: [
                ["`fontFamily`", "font stack for both canvas text and DOM editors"],
                [
                    "`baseFontStyle`",
                    "CSS font shorthand *minus the family*, for cell text — e.g. `\"13px\"` or `\"600 13px\"`",
                ],
                ["`headerFontStyle`", "same, for header titles — e.g. `\"600 13px\"`"],
                ["`markerFontStyle`", "same, for row-marker numbers — e.g. `\"9px\"`"],
                ["`editorFontSize`", "font size for DOM overlay editors — a CSS length string, e.g. `\"13px\"`"],
            ],
        },
        {
            kind: "p",
            text: "`mergeAndRealizeTheme` derives `headerFontFull` / `baseFontFull` / `markerFontFull` — the `\"<style> <family>\"` strings actually assigned to `ctx.font` — from the three `*FontStyle` fields plus `fontFamily`. Those three live on `FullTheme`, not `Theme`: you never set them yourself, and overriding a `*FontStyle` or `fontFamily` at any level is enough.",
        },

        {
            kind: "p",
            text: "**`--gdg-*` CSS custom properties.** The grid publishes its resolved theme as custom properties so DOM you layer on top of (or inside) the grid can match it without you duplicating colour values. They are stamped in two places: on the **grid's root element** (the global theme — base + `@theme`), and on **each open overlay-editor container** (that specific cell's fully merged theme, so a custom editor picks up the column/row/cell overrides automatically).",
        },
        {
            kind: "code",
            text: `.my-toolbar-above-the-grid {
  background: var(--gdg-bg-header);
  color: var(--gdg-text-header);
  border-bottom: 1px solid var(--gdg-border-color);
  font-family: var(--gdg-font-family);
}`,
        },
        {
            kind: "note",
            text: "The grid's own canvas rendering does **not** read these — they exist purely for your CSS. Call `makeCSSStyle(theme)` yourself if you want the same mapping elsewhere. Note also that not every `Theme` field has a variable: `lineHeight` and `headerIconSize` have none.",
        },
        {
            kind: "table",
            head: ["Variable", "Theme field"],
            rows: [
                ["`--gdg-accent-color`", "`accentColor`"],
                ["`--gdg-accent-fg`", "`accentFg`"],
                ["`--gdg-accent-light`", "`accentLight`"],
                ["`--gdg-text-dark`", "`textDark`"],
                ["`--gdg-text-medium`", "`textMedium`"],
                ["`--gdg-text-light`", "`textLight`"],
                ["`--gdg-text-bubble`", "`textBubble`"],
                ["`--gdg-bg-icon-header`", "`bgIconHeader`"],
                ["`--gdg-fg-icon-header`", "`fgIconHeader`"],
                ["`--gdg-text-header`", "`textHeader`"],
                ["`--gdg-text-group-header`", "`textGroupHeader ?? textHeader`"],
                ["`--gdg-bg-group-header`", "`bgGroupHeader ?? bgHeader`"],
                ["`--gdg-bg-group-header-hovered`", "`bgGroupHeaderHovered ?? bgHeaderHovered`"],
                ["`--gdg-text-header-selected`", "`textHeaderSelected`"],
                ["`--gdg-bg-cell`", "`bgCell`"],
                ["`--gdg-bg-cell-medium`", "`bgCellMedium`"],
                ["`--gdg-bg-header`", "`bgHeader`"],
                ["`--gdg-bg-header-has-focus`", "`bgHeaderHasFocus`"],
                ["`--gdg-bg-header-hovered`", "`bgHeaderHovered`"],
                ["`--gdg-bg-bubble`", "`bgBubble`"],
                ["`--gdg-bg-bubble-selected`", "`bgBubbleSelected`"],
                ["`--gdg-bubble-height`", "`bubbleHeight` + `px`"],
                ["`--gdg-bubble-padding`", "`bubblePadding` + `px`"],
                ["`--gdg-bubble-margin`", "`bubbleMargin` + `px`"],
                ["`--gdg-bg-search-result`", "`bgSearchResult`"],
                ["`--gdg-border-color`", "`borderColor`"],
                ["`--gdg-horizontal-border-color`", "`horizontalBorderColor ?? borderColor`"],
                ["`--gdg-drilldown-border`", "`drilldownBorder`"],
                ["`--gdg-link-color`", "`linkColor`"],
                ["`--gdg-cell-horizontal-padding`", "`cellHorizontalPadding` + `px`"],
                ["`--gdg-cell-vertical-padding`", "`cellVerticalPadding` + `px`"],
                ["`--gdg-header-font-style`", "`headerFontStyle`"],
                ["`--gdg-base-font-style`", "`baseFontStyle`"],
                ["`--gdg-marker-font-style`", "`markerFontStyle`"],
                ["`--gdg-font-family`", "`fontFamily`"],
                ["`--gdg-editor-font-size`", "`editorFontSize`"],
                ["`--gdg-checkbox-max-size`", "`checkboxMaxSize` + `px`"],
                ["`--gdg-resize-indicator-color`", "`resizeIndicatorColor` — emitted only when set"],
                ["`--gdg-header-bottom-border-color`", "`headerBottomBorderColor` — emitted only when set"],
                ["`--gdg-rounding-radius`", "`roundingRadius` + `px` — emitted only when set"],
            ],
        },
        {
            kind: "p",
            text: "The `px`-suffixed ones are stamped as strings so they compose in `calc()` — the addon's own stylesheet does exactly that, e.g. `var(--gdg-rounding-radius, calc(var(--gdg-bubble-height) / 2))` for a tag pill's radius.",
        },
    ],
};
