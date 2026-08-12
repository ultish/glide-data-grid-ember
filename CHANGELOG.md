# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-12

### Added

- `@getGroupDetails` — column-group headers gain a display name distinct from the group key, an
  `icon`, an `overrideTheme`, and `actions`: hover-revealed icon buttons with their own hit targets,
  which report themselves and suppress both `@onGroupHeaderClicked` and the group-column selection.
  `withCollapsingGroups` now returns one too, so a collapsed group's header is tinted.
- `@onPaste` — `boolean | ((target, values) => boolean)`, an all-or-nothing gate checked once the
  paste target is known and before any cell is written. The values handed over are unclipped, so a
  consumer can refuse a block that will not fit.
- `@fixedShadowX` / `@fixedShadowY` — the inset depth cues over the frozen columns' right edge and
  under the header. **Both default to `true`**, matching upstream, so they are opt-_out_.
- `@overscrollX` / `@overscrollY` — empty scrollable space past the last column and row. Scaled by
  `@scaleToRem` like every other dimension.
- `@disableMinimumCellWidth` — drops the 10px floor below which a cell paints its background and
  skips its contents, to 1px. Needed for deliberately hairline columns.
- `@renderStrategy` — `"single-buffer" | "double-buffer" | "direct"`. The browser-derived value
  (double-buffer on Safari) is now just the default.
- `@enableFirefoxRescaling` / `@enableSafariRescaling` — cap the canvas device-pixel ratio at 1x/2x
  while scrolling and restore it 200ms after the last scroll event. Each applies only on its own
  browser.
- `@strictVisibleRegion` — refuse to read any cell outside the region last reported to
  `@onVisibleRegionChanged`, drawing a loading cell instead. A development harness for paged and
  async sources: it turns "the grid quietly rendered whatever the array held" into visible loading
  cells. The selected cell and frozen columns stay readable.
- `@eventTarget` — where the grid attaches its window-level pointer listeners (drag-end, autoscroll
  pointer tracking, overlay-editor outside-click), for a grid living in an iframe or a portal. Left
  unset, the target is resolved from the grid root's `getRootNode()`, so a grid inside a shadow root
  needs no configuration.

### Fixed

- A mousedown on the column-group band no longer arms a column drag. `resolveMouseHit` folds the
  group band and the header row into one kind, so the group band had been reaching drag state that
  is meant for headers only.

### Notes

- `@onPaste` diverges from upstream in the `undefined` case only: source treats an absent `onPaste`
  as "write the whole clipboard into the single target cell" and requires `onPaste={true}` for a
  range paste. This addon has split on tabs and newlines since its first release, so `undefined`
  continues to behave as `true` here.

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

[0.2.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.2.0
[0.1.7]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.7
[0.1.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.0
