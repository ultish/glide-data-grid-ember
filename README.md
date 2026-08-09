# glide-data-grid-ember

A fast, canvas-rendered data grid for Ember — an Ember v2 addon port of
[glide-data-grid](https://github.com/glideapps/glide-data-grid).

It stays smooth at hundreds of thousands of rows because it never renders cells as DOM: it paints
only what's on screen, to a canvas, and asks you for those cells one at a time.

**[▶ Live demos and the full cookbook](https://ultish.github.io/glide-data-grid-ember/)** — every option, switched on, in a real grid.

## What you get

- **Scale** — 200,000 rows and 50 columns is an ordinary case, not a stress test. Native scrolling
  with a sticky header, both axes.
- **Cell types** — text, number, boolean, uri, markdown, image, bubble, drilldown, row ID, plus
  sparklines, star ratings, tags, dropdowns, multi-select, date pickers, range sliders, buttons,
  tree views, user profiles and article editors.
- **Editing** — overlay editors, copy/paste (with Excel/Sheets fidelity), delete, fill-handle
  drag-to-fill, and an "add row" affordance.
- **Selection** — cells, ranges, rows, columns, row markers with select-all.
- **Columns and rows** — resize, reorder, freeze, group headers, header icons, auto-sizing.
- **Search** — incremental, chunked, with a built-in bar you can use or ignore.
- **Theming** — light/dark, per-column, per-row and per-cell overrides, and a bridge that lets a
  Tailwind/DaisyUI palette drive the canvas.

## Compatibility

| | |
|---|---|
| `ember-source` | **v6.4 or above.** CI runs the full `ember-try` matrix on 6.4 LTS, 6.8 LTS, release, beta and canary — i.e. through Ember **7.x**. |
| Build | Embroider, or ember-auto-import v2. |

## Installation

```
ember install glide-data-grid-ember
```

## Usage

```gjs
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind } from "glide-data-grid-ember/rendering/index";

const columns = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 260 },
];

const people = [
  { name: "Ada Lovelace", email: "ada@example.com" },
  { name: "Grace Hopper", email: "grace@example.com" },
];

function getCellContent([col, row]) {
  const person = people[row];
  const value = col === 0 ? person.name : person.email;
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
}

<template>
  {{! The grid fills its container, so the container needs a height. }}
  <div style="height: 480px">
    <GlideDataGrid
      @columns={{columns}}
      @rows={{people.length}}
      @getCellContent={{getCellContent}}
    />
  </div>
</template>
```

Three things worth knowing straight away:

- **`@rows` is a count, not data.** The grid never sees your array — it asks `@getCellContent` for
  one cell at a time, only for cells it is painting. That's why very large row counts are cheap.
- **`@getCellContent` receives `[column, row]`**, both zero-based, both in your own coordinate
  space. Row markers and frozen columns are the grid's business; it never shifts your indices.
- **The grid sizes itself to its container.** A container with no height renders a zero-height grid.
  This is the most common "nothing appears" cause.

The addon imports its own CSS, so there is no stylesheet to wire up.

## Live demos

**[▶ https://ultish.github.io/glide-data-grid-ember/](https://ultish.github.io/glide-data-grid-ember/)**

The test app is the reference: a fully-featured grid with every option switched on and a toggle row
to change them live, plus focused demos for streaming updates, async paging, theming and the
[grid.glideapps.com](https://grid.glideapps.com/) replica — and the **cookbook**, a page of
copy-pasteable recipes for each task you'll hit when integrating.

To run it locally:

```
pnpm install
pnpm --filter test-app start
```

then open <http://localhost:4200> and pick the **Cookbook** tab.

## Deeper guides

All of them are chapters of the **Cookbook** tab in the demo app above — one place, every recipe
runnable next to the demo that proves it.

- **Using the grid in Ember** — where cell data comes from. Read this before wiring anything real
  up: because the grid pulls cells during paint, the most natural-looking `@getCellContent` never
  repaints, and this explains why and what to write instead. Also covers `recordsSource` (the
  packaged version of the recommended pattern), Ember Data and GraphQL, paged/streamed data, and
  where to put formatting so it stays off the paint path.
- **Theming** and **Theme reference** — the override precedence chain, a copy-pasteable dark theme,
  every `Theme` field and what it controls, the `--gdg-*` CSS custom properties, and the
  CSS-variable bridge for design systems (with the working DaisyUI integration).
- **Performance rules** — the identity-stability rule, which is the one footgun here that fails
  silently: no error, no warning, no visual difference, just a slower grid.

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
