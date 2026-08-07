# glide-data-grid-ember

An Ember v2 addon port of [glide-data-grid](https://github.com/glideapps/glide-data-grid) — a
canvas-rendered data grid that stays fast at millions of rows, with a sticky header, native
scrolling, cell selection and copy/paste, column resize/reorder, overlay cell editors, and a large
library of built-in cell types (text, number, boolean, uri, markdown, image, bubble, drilldown,
sparklines, star ratings, tags, dropdowns, date pickers, and more).

## Compatibility

- Ember.js v4.12 or above
- Embroider or ember-auto-import v2

## Installation

```
ember install glide-data-grid-ember
```

## Usage

```gts
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";

<template>
  <GlideDataGrid
    @columns={{this.columns}}
    @rows={{this.rowCount}}
    @getCellContent={{this.getCellContent}}
  />
</template>
```

`@getCellContent` is `([col, row]) => GridCell` and is called on demand for visible cells only —
nothing is materialized up front, which is what makes very large row counts cheap.

## Feeding it data

Because the grid pulls cells during paint rather than rendering them, wiring your data up has one
rule that isn't obvious: **the tracked reads have to happen in the right place, or the grid silently
won't update.** The most natural-looking way to write `@getCellContent` — a class-field arrow
function that reaches into your data — never repaints, because the grid reads the function
*reference* without calling it, so nothing it touches is registered as a dependency.

**See [DATA.md](glide-data-grid-ember/DATA.md)** for the one recommended pattern (a per-row
`@cached` view model plus a getter that reads them), which works unchanged from a handful of rows to
hundreds of thousands. It also covers the single case that needs something different — data you
can't hold in memory, such as paged or streamed feeds — and where to put formatting and nested-value
extraction so it stays off the paint path.

## Theming

The grid renders to a `<canvas>`, so CSS cannot style cells or headers. Instead you pass a plain
theme object, with optional per-column, per-row, and per-cell overrides:

```gts
import { getDataEditorDarkTheme } from "glide-data-grid-ember/rendering/index";

<GlideDataGrid ... @theme={{DARK_THEME}} @getRowThemeOverride={{this.zebraStripe}} />
```

**See [THEMING.md](glide-data-grid-ember/THEMING.md)** (shipped as `THEMING.md` inside the addon
package) for the full guide: the override precedence chain, a copy-pasteable dark-theme example,
per-column/row/cell examples, every `Theme` field and what it visually controls, the `--gdg-*` CSS
custom properties the grid publishes for your own DOM, and the identity-stability rules that keep
the scroll fast path enabled.

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
