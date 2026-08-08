# Theming `<GlideDataGrid>`

The grid draws itself onto a `<canvas>`, so **CSS cannot style cells, headers, or gridlines**.
Everything visual is driven by a single plain JavaScript object — the `Theme` — which you supply
as args on `<GlideDataGrid>`. There is no theme service, no context/provider, and no CSS file to
import: it is just data flowing down through args, and it participates in Ember autotracking like
any other arg (change a `@tracked` field holding the theme and the grid repaints).

Everything here is exported from `glide-data-grid-ember/rendering/index`.

```js
import {
    getDataEditorTheme,      // () => Theme            -- the stock light theme (complete)
    getDataEditorDarkTheme,  // () => Partial<Theme>   -- the stock dark theme (an overlay)
    mergeAndRealizeTheme,    // (Theme, ...Partial<Theme>) => FullTheme
    makeCSSStyle,            // (Theme) => Record<string, string>  (the `--gdg-*` variables)
} from "glide-data-grid-ember/rendering/index";
```

---

## 1. Precedence: how a cell's final theme is computed

Five levels, merged left to right — **later wins**:

```
base theme  →  @theme  →  column.themeOverride  →  @getRowThemeOverride(row)  →  cell.themeOverride
```

| Level | Where you set it | Applies to |
|---|---|---|
| base | built in (`getDataEditorTheme()`) | everything |
| global | `<GlideDataGrid @theme={{...}}>` | everything |
| column | `themeOverride` on a `GridColumn` | that column's header **and** all of its cells |
| row | `<GlideDataGrid @getRowThemeOverride={{fn}}>` | every cell in that row (not the header) |
| cell | `themeOverride` on the `GridCell` you return from `getCellContent` | that one cell |

Every level except the base is a `Partial<Theme>` — you only name the fields you want to change.

The exact merge the render engine performs per cell is
`mergeAndRealizeTheme(base+@theme, column.themeOverride, getRowThemeOverride(row), cell.themeOverride)`
(`src/rendering/render/data-grid-render.cells.ts`). Headers use only
`mergeAndRealizeTheme(base+@theme, column.themeOverride)` — a row override cannot reach a header,
because a header belongs to no row.

An open overlay cell editor is given that same fully-merged per-cell theme, so an editor opened
over a dark-themed row is styled to match it.

### `bgCell` is blended, not replaced

`mergeAndRealizeTheme` treats exactly one field specially: `bgCell` from an overlay is **alpha
blended over** the value beneath it rather than replacing it. Every other field is a plain
overwrite. This is what makes layered tints work — a translucent `bgCell` in a row override reads
correctly over a light *or* a dark base:

```js
// composes with whatever bgCell the column/global/base level resolved to
const ZEBRA = { bgCell: "rgba(79, 93, 255, 0.07)" };
```

An opaque `bgCell` (e.g. `"#fff8e1"`) still works — blending an opaque color over anything yields
that color — but it will flatten any tint applied by a less-specific level.

---

## 2. Light / dark

`getDataEditorDarkTheme()` returns a `Partial<Theme>` overlay, so you pass it straight as `@theme`:

```gts
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { getDataEditorDarkTheme, type Theme } from "glide-data-grid-ember/rendering/index";

// Resolved ONCE at module scope, not in the getter -- a new object identity every render
// would force the grid to re-realize the theme on every draw.
const DARK: Partial<Theme> = getDataEditorDarkTheme();

export default class MyGrid extends Component {
    @tracked isDark = false;

    get theme(): Partial<Theme> | undefined {
        return this.isDark ? DARK : undefined; // `undefined` = stock light theme
    }

    @action toggleTheme() {
        this.isDark = !this.isDark;
    }

    <template>
        <button type="button" {{on "click" this.toggleTheme}}>Toggle theme</button>
        <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}}
                       @getCellContent={{this.getCellContent}} @theme={{this.theme}} />
    </template>
}
```

To tweak the dark theme, spread it:

```js
const DARK_BRANDED = { ...getDataEditorDarkTheme(), accentColor: "#00c2a8", linkColor: "#00c2a8" };
```

To build a custom theme from scratch, spread the light base and override what you need:

```js
const HOTDOG = { ...getDataEditorTheme(), bgCell: "#ff0000", bgHeader: "#f3f300", textDark: "#ffffff" };
```

---

## 3. Per-column overrides

Put `themeOverride` on the column itself. It applies to the column's header **and** its cells.

```js
const columns = [
    { id: "name", title: "Name", width: 200 },
    {
        id: "total",
        title: "Total",
        width: 120,
        themeOverride: {
            bgCell: "rgba(255, 196, 61, 0.22)", // translucent -> tints whatever is beneath
            textDark: "#b06a00",
            baseFontStyle: "600 13px",
        },
    },
];
```

Note the consumer-owns-the-data contract: if you rebuild the `columns` array on every render, build
the `themeOverride` objects at module scope so their identity is stable.

---

## 4. Per-row overrides (zebra striping, status highlighting)

```js
// MODULE SCOPE -- see the performance note below. This is not stylistic advice.
const ODD_ROW = { bgCell: "rgba(79, 93, 255, 0.07)" };

export function getRowThemeOverride(row) {
    return row % 2 === 1 ? ODD_ROW : undefined; // return undefined, not {}, for "no override"
}
```

```gts
<GlideDataGrid ... @getRowThemeOverride={{getRowThemeOverride}} />
```

Returning `undefined` (rather than an empty object) for unstyled rows matters: the render loop has
a cheap "no override for this row" fast path keyed on exactly that.

### ⚠️ Hoist `@getRowThemeOverride` to a stable reference

The scroll fast path ("blit") repaints only the newly exposed strip and translates the rest of the
previous frame instead of redrawing every visible cell. It is enabled by
`computeCanBlit` (`src/rendering/render/data-grid-render.blit.ts`), which compares a handful of
`DrawGridArg` fields — including `getRowThemeOverride` — **by object identity**.

A fresh arrow function per render defeats it, and scrolling silently falls back to a full repaint
every frame:

```gts
{{! ✗ new function identity on every render -- full repaint per scroll frame }}
<GlideDataGrid @getRowThemeOverride={{fn this.rowTheme}} />

{{! ✓ stable identity }}
<GlideDataGrid @getRowThemeOverride={{this.getRowThemeOverride}} />
```

where `getRowThemeOverride` is a module-scope function, a class field assigned once, or an
`@action`-bound method — anything but a getter that builds a new closure. The same applies to
`@getCellContent` and `@columns`.

---

## 5. Per-cell overrides

`themeOverride` on the `GridCell` you return from `getCellContent` is the most specific level and
beats the column and row levels.

```js
const OVERDUE = { bgCell: "rgba(255, 71, 87, 0.30)", textDark: "#c40021" };

getCellContent = ([col, row]) => {
    const record = this.data[row];
    return {
        kind: GridCellKind.Text,
        data: record.title,
        displayData: record.title,
        allowOverlay: true,
        themeOverride: record.isOverdue ? OVERDUE : undefined,
    };
};
```

Same identity guidance: hoist the override objects, don't build a new one per call — `getCellContent`
runs for every visible cell on every draw.

---

## 6. The `Theme` fields

Only `Theme` fields at the end are optional; everything else is present on the base theme, and any
level may override any field.

### What a color value may be

**Any CSS color the browser understands**, including modern color spaces. Theme colors are handed
to the canvas verbatim for plain fills, but the grid also has to *read* them numerically — to alpha
blend a `bgCell` overlay, to derive translucent variants, and to pick a readable foreground — so
each one is resolved to RGBA on first use and cached.

That resolution understands `rgb()` / `rgba()`, **`oklch()`** and **`oklab()`** directly, and falls
back to painting a pixel for anything else (`lab()`, `lch()`, `color(display-p3 …)`, …). Named
colors, hex and `hsl()` are converted to `rgb()` by the browser before it ever gets there.

`oklch()` matters in particular because **Chrome does not convert it** — `getComputedStyle` hands
back `oklch(0.7 0.15 250)` unchanged — and it is the native format of Tailwind 4 and DaisyUI 5
palettes. Before 2026-08 that produced silently wrong colors anywhere a color had to be read back
rather than just painted; it is converted properly now.

```js
// all equivalent, all fine as a theme value
{ accentColor: "#4F5DFF" }
{ accentColor: "rgb(79, 93, 255)" }
{ accentColor: "oklch(0.5693 0.2369 272.44)" }
{ bgCell: "oklch(0.7 0.15 250 / 0.07)" }   // translucent overlays work too
```

An unparseable value degrades to opaque black rather than to a random color, and warns on the
console in development builds.

### Colors — accents & selection

| Field | Controls |
|---|---|
| `accentColor` | selection ring / selected-column header fill, focus ring, the overlay editor's border, and several cells' primary color (link/button/slider fill, sparkline stroke) |
| `accentFg` | foreground drawn on top of `accentColor` (e.g. button-cell label) |
| `accentLight` | translucent fill for cells inside a selected range, selected blank areas, and the column-resize indicator |

### Colors — text

| Field | Controls |
|---|---|
| `textDark` | primary cell text (text/number/uri/markdown/date/tags/… cells) and editor input text |
| `textMedium` | secondary text — the "add row" hint, checkbox glyph outlines, sparkline labels, tree-view chrome, spinner |
| `textLight` | de-emphasized text — row-ID cells, protected cells, sparkline axis labels |
| `textBubble` | text inside bubble / drilldown / multi-select chips |
| `textHeader` | column header title text |
| `textHeaderSelected` | header title text when that column is selected |
| `textGroupHeader` *(optional)* | column-group header text. **Column grouping is not implemented in this port** — this field is emitted as a CSS variable but never drawn. |

### Colors — backgrounds

| Field | Controls |
|---|---|
| `bgCell` | the cell background. **Alpha blended, not replaced, when overridden** — see §1. |
| `bgCellMedium` | background for `Protected` cells |
| `bgHeader` | header background, and the background behind blank areas past the last row/column |
| `bgHeaderHasFocus` | header background when the active cell is in that column |
| `bgHeaderHovered` | header background on hover; also the "add row" affordance hover fill |
| `bgBubble` | chip/pill fill in bubble, tags, multi-select, and range cells |
| `bgBubbleSelected` | chip fill when that cell is selected |
| `bgSearchResult` | search-hit highlight. **Search is not implemented in this port**; the field is ported and emitted as a CSS variable but never drawn. |
| `bgIconHeader` | fill of header icon sprites, and the "add row" `+` icon |
| `fgIconHeader` | foreground of header icon sprites |
| `bgGroupHeader`, `bgGroupHeaderHovered` *(optional)* | column-group header backgrounds — **not implemented**, CSS variables only |

### Colors — borders & links

| Field | Controls |
|---|---|
| `borderColor` | all gridlines (vertical, and horizontal when `horizontalBorderColor` is unset), header borders, highlight rings |
| `horizontalBorderColor` *(optional)* | horizontal gridlines only; falls back to `borderColor` |
| `headerBottomBorderColor` *(optional)* | the line under the header; falls back to `horizontalBorderColor`, then `borderColor` |
| `drilldownBorder` | border around drilldown-cell chips |
| `linkColor` | uri-cell link text (and its underline on hover) |
| `resizeIndicatorColor` *(optional)* | the column-resize drag indicator; falls back to `accentLight` |

### Sizes & spacing (numbers, in px unless noted)

| Field | Controls |
|---|---|
| `cellHorizontalPadding` | left/right padding inside every cell and header — the single most impactful layout knob |
| `cellVerticalPadding` | top/bottom padding inside cells; also the overlay editor's vertical padding |
| `bubbleHeight` | height of chips in bubble / tags / multi-select cells |
| `bubblePadding` | horizontal padding inside a chip |
| `bubbleMargin` | gap between adjacent chips |
| `headerIconSize` | size of a column's header icon sprite (also used by the header-menu hit-test) |
| `checkboxMaxSize` | max drawn size of boolean-cell and row-marker checkboxes |
| `lineHeight` | unitless multiplier for multi-line/wrapped text layout |
| `roundingRadius` *(optional)* | corner radius for chips, checkboxes, image thumbnails, buttons, loading skeletons. Unset = each element's own default. |

### Fonts

| Field | Controls |
|---|---|
| `fontFamily` | font stack for both canvas text and DOM editors |
| `baseFontStyle` | CSS font shorthand *minus family* for cell text, e.g. `"13px"` or `"600 13px"` |
| `headerFontStyle` | same, for header titles, e.g. `"600 13px"` |
| `markerFontStyle` | same, for row-marker numbers, e.g. `"9px"` |
| `editorFontSize` | font size for DOM overlay editors (a CSS length string, e.g. `"13px"`) |

`mergeAndRealizeTheme` derives `headerFontFull` / `baseFontFull` / `markerFontFull` (the
`"<style> <family>"` strings actually assigned to `ctx.font`) from the three `*FontStyle` fields
plus `fontFamily`. Those three derived fields live on `FullTheme`, not `Theme` — you never set them
yourself, and overriding a `*FontStyle` or `fontFamily` at any level is enough.

---

## 7. `--gdg-*` CSS custom properties

The grid also publishes its resolved theme as CSS custom properties, so DOM you layer on top of (or
inside) the grid can match it without you duplicating color values:

- **on the grid's root element** — the global theme (base + `@theme`)
- **on each open overlay-editor container** — that specific cell's fully-merged theme (so a custom
  editor automatically picks up the column/row/cell overrides)

```css
.my-toolbar-above-the-grid {
    background: var(--gdg-bg-header);
    color: var(--gdg-text-header);
    border-bottom: 1px solid var(--gdg-border-color);
    font-family: var(--gdg-font-family);
}
```

The grid's own canvas rendering does **not** read these — they exist purely for your CSS. Call
`makeCSSStyle(theme)` yourself if you want the same mapping somewhere else.

| Variable | Theme field |
|---|---|
| `--gdg-accent-color` | `accentColor` |
| `--gdg-accent-fg` | `accentFg` |
| `--gdg-accent-light` | `accentLight` |
| `--gdg-text-dark` | `textDark` |
| `--gdg-text-medium` | `textMedium` |
| `--gdg-text-light` | `textLight` |
| `--gdg-text-bubble` | `textBubble` |
| `--gdg-bg-icon-header` | `bgIconHeader` |
| `--gdg-fg-icon-header` | `fgIconHeader` |
| `--gdg-text-header` | `textHeader` |
| `--gdg-text-group-header` | `textGroupHeader ?? textHeader` |
| `--gdg-bg-group-header` | `bgGroupHeader ?? bgHeader` |
| `--gdg-bg-group-header-hovered` | `bgGroupHeaderHovered ?? bgHeaderHovered` |
| `--gdg-text-header-selected` | `textHeaderSelected` |
| `--gdg-bg-cell` | `bgCell` |
| `--gdg-bg-cell-medium` | `bgCellMedium` |
| `--gdg-bg-header` | `bgHeader` |
| `--gdg-bg-header-has-focus` | `bgHeaderHasFocus` |
| `--gdg-bg-header-hovered` | `bgHeaderHovered` |
| `--gdg-bg-bubble` | `bgBubble` |
| `--gdg-bg-bubble-selected` | `bgBubbleSelected` |
| `--gdg-bubble-height` | `bubbleHeight` + `px` |
| `--gdg-bubble-padding` | `bubblePadding` + `px` |
| `--gdg-bubble-margin` | `bubbleMargin` + `px` |
| `--gdg-bg-search-result` | `bgSearchResult` |
| `--gdg-border-color` | `borderColor` |
| `--gdg-horizontal-border-color` | `horizontalBorderColor ?? borderColor` |
| `--gdg-drilldown-border` | `drilldownBorder` |
| `--gdg-link-color` | `linkColor` |
| `--gdg-cell-horizontal-padding` | `cellHorizontalPadding` + `px` |
| `--gdg-cell-vertical-padding` | `cellVerticalPadding` + `px` |
| `--gdg-header-font-style` | `headerFontStyle` |
| `--gdg-base-font-style` | `baseFontStyle` |
| `--gdg-marker-font-style` | `markerFontStyle` |
| `--gdg-font-family` | `fontFamily` |
| `--gdg-editor-font-size` | `editorFontSize` |
| `--gdg-checkbox-max-size` | `checkboxMaxSize` + `px` |
| `--gdg-resize-indicator-color` | `resizeIndicatorColor` — emitted only when set |
| `--gdg-header-bottom-border-color` | `headerBottomBorderColor` — emitted only when set |
| `--gdg-rounding-radius` | `roundingRadius` + `px` — emitted only when set |

---

## 8. Performance checklist

Identity, not deep equality, is what the render loop compares. Keep these stable across renders:

- `@theme` — resolve overlay objects at module scope, not inside a getter
- `@getRowThemeOverride` — module-scope function or a bound method (see §4)
- `@getCellContent`, `@columns`
- every `themeOverride` object on a column or cell

Doing this keeps the scroll blit fast path alive; not doing it turns every scroll frame into a full
repaint of the visible window.

---

## 9. Not implemented in this port

Present in the `Theme` type (and emitted as CSS variables) but never drawn, because the underlying
feature is not ported: **column/row grouping** (`textGroupHeader`, `bgGroupHeader`,
`bgGroupHeaderHovered`) and **search-result highlighting** (`bgSearchResult`).
