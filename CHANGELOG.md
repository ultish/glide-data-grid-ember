# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-08-09

### Fixed

- Column reordering now keeps displayed values and edits mapped to the correct columns after data
  refreshes.
- The selected column remains selected after it is moved.
- Column resizing works from header and sub-header edges, with the resize cursor and indicator
  visible in the demo.
- Markdown edit-on-type keeps the complete typed value in the Notes column.

### Added

- Exposed `verticalBorder`, `resizeIndicator`, and `hyperWrapping` grid options.
- Added the `UndoRedo.isReplaying` signal for distinguishing replayed edits from user edits.
- Expanded the demo to exercise alternating borders and wrapped text.

## [0.1.0] - 2026-08-09

First public release — a full-parity Ember v2 addon port of
[glide-data-grid](https://github.com/glideapps/glide-data-grid), the canvas-rendered React data
grid. Cells are painted to a canvas rather than rendered as DOM, so row counts in the hundreds of
thousands stay smooth.

### Added

- **`<GlideDataGrid>`** — the grid component. Native scrolling on both axes with a sticky header,
  viewport virtualization, and a damage-only repaint path for cell updates.
- **Cell types** — text, number, boolean, uri, markdown, image, bubble, drilldown, row ID, plus the
  13 extras from `packages/cells`: sparkline, star rating, tags, dropdown, multi-select, date
  picker, range slider, button, tree view, user profile, links, article and spinner. Custom cell
  renderers via `@extraCells`.
- **Editing** — overlay editors for every editable kind, copy/paste with Excel/Sheets fidelity,
  delete, fill-handle drag-to-fill, paste coercion and cell validation, and a trailing "add row"
  row.
- **Selection** — cell, range, row and column selection; row markers with select-all; configurable
  blending and selection modes; keyboard navigation.
- **Columns and rows** — resize, reorder, freeze, group headers, header icons (28 glyphs),
  content-measured auto-sizing, and row reordering with autoscroll.
- **Search** — incremental chunked search, plus an opt-in `<GlideSearchBar>` component.
- **Context menus** — cell, header and group-header callbacks.
- **Theming** — light/dark, per-column, per-row and per-cell overrides, `--gdg-*` CSS custom
  properties, and a CSS-variable bridge that lets a Tailwind/DaisyUI palette drive the canvas. The
  addon ships its own stylesheets; there is nothing to wire up.
- **Data-source layer** (`glide-data-grid-ember/data-source`) — `recordsSource` for in-memory
  records (per-record caching, so editing one field re-projects one row), `AsyncRecordsSource` for
  paged/async data driven by `onVisibleRegionChanged`, and the composable decorators
  `withColumnSort` (read _and_ write path), `withMovableColumns` and `withCollapsingGroups`, plus
  the `UndoRedo` helper.
- **Consumer draw hooks** — `drawCell`, `drawHeader` and friends, and an imperative ref API for
  scrolling, damage and focus.
- **Docs** — a live cookbook (14 chapters) and demo app covering data sourcing in Ember, Ember Data
  and GraphQL, theming, the theme reference and the identity-stability performance rules.

### Compatibility

- `ember-source` v6.4 or above; CI runs the `ember-try` matrix on 6.4 LTS, 6.8 LTS, release, beta
  and canary — i.e. through Ember 7.x.
- Embroider or ember-auto-import v2.

[0.1.7]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.7
[0.1.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.0
