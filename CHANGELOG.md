# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-08-22

### Changed

- **Breaking:** `@onHeaderMenuClick` and `@onHeaderIndicatorClick` now report the consumer's column
  index — the row-marker column is already subtracted, matching every other callback. Previously
  they reported the grid's internal index, so with `@rowMarkers` on a handler that indexed
  `columns[col]` acted on the neighbouring column. Callers that already subtracted `1` themselves
  must stop.

## [0.5.1] - 2026-08-15

### Fixed

- **Escape now closes a read-only overlay editor.** Clicking inside a read-only cell's editor left
  it stuck open with no keyboard way out: the editor was built on a `disabled` textarea, which
  cannot hold focus, so the keystroke reached neither the overlay (whose listener needs focus inside
  it) nor the grid (which stands down while an overlay is open). Upstream
  [#910](https://github.com/glideapps/glide-data-grid/issues/910), still open there. Fixed twice
  over, because the two halves cover different editors: read-only `GrowingEntry`-based editors now
  use `readOnly` instead of `disabled` — which also makes a read-only cell's text selectable and
  copyable, previously impossible — and the overlay container itself is now focusable as a backstop,
  which covers **every** editor that cannot take focus, including `dropdown`/`range`/`links` cells
  and consumer-written ones.

  Custom editors are unaffected unless they relied on `GrowingEntry`'s internal `disabled` option,
  which is now `readOnly` (`glide-data-grid-ember/-private/growing-entry`).

- **The tags cell's editor no longer drops earlier checkbox toggles.** Checking two or more tags in
  a single editor session (e.g. "bug" then "feature") committed only the last one on top of the tags
  the cell started with — `["urgent"]` → check "bug" → check "feature" → committed
  `["urgent", "feature"]`, silently discarding "bug". Each checkbox read the cell's *original* tag
  list instead of an accumulating working copy, so a later toggle in the same session recomputed
  against stale data. A second, related defect is fixed alongside it: a checked pill's colour and
  selected styling now update immediately, rather than only reflecting the tag list as it was when
  the editor opened. Not an upstream bug — source's editor is a React component whose props refresh
  on every keystroke, which has no equivalent in this port's imperative editors.

- **Column auto-sizing now pays for a column's `indicatorIcon`.** A column with an `indicatorIcon`
  but no explicit `width` was measured from its title, padding and `icon` only — while the header
  renderer lays the indicator out *after* the title and takes that space back. The result was a
  title clipped by exactly the icon's width, or the icon itself clipped to a sliver at the column
  edge. Also applies to `remeasureColumns()`. This is upstream
  [#954](https://github.com/glideapps/glide-data-grid/issues/954), still open there; the allowance
  is derived from `theme.headerIconSize` rather than hardcoded, so raising it in a theme stays
  correct. `hasMenu` deliberately adds nothing — the menu button overlays and fades the title rather
  than being laid out beside it, so it reserves no width.

## [0.5.0] - 2026-08-14

### Added

- **`@enableChromeRescaling`** — the scroll-time canvas downscale for Chromium browsers (Chrome,
  Edge, Brave, Opera, Arc), capping at 1x while scrolling and restoring full resolution 200ms after
  the last scroll. **Not an upstream arg**: React's grid offers this for Firefox and Safari only.
  Added because the reason for it — canvas fill cost scaling with `devicePixelRatio` — is not
  browser specific, and a Chromium browser on a Retina display pays exactly the 4x fill the other
  two are allowed to avoid. Caps at 1x rather than Safari's 2x because at the common dpr of 2 a 2x
  cap is a no-op. Off by default, like the other two.

## [0.4.0] - 2026-08-13

### Added

- **Row grouping** — `@rowGrouping` puts collapsible header rows between your data rows, with
  per-group `height`, `themeOverride`, `navigationBehavior` (`normal` / `skip-up` / `skip-down` /
  `skip` / `block`) and `selectionBehavior` (`allow-spanning` / `block-spanning`). The grid does
  **not** draw group headers — it learns which rows they are so it can size, theme and number around
  them, and `@getCellContent` draws them. `rowGroupingApi`, `mapRowIndexToPath`,
  `updateRowGroupingByPath` and `getRowGroupingForPath` are exported for that: `mapper(row).originalIndex`
  translates a grid row back into your own data space, which you must do on every read once grouping
  is on. Nesting is supported via `subGroups`.
- **`@getRowThemeOverride` now receives `(row, groupIndex, contentIndex)`**, matching upstream. With
  `@rowGrouping` unset all three are the row index. Existing one-argument callbacks are unaffected.

### Fixed

- Row grouping computes a group header's grid row index over the visible groups only. Upstream
  computes it across hidden groups too, so collapsing a group that has subgroups made every group
  header below it lose its configured height.

### Documentation

- New cookbook chapter, *Grouping rows*.
- *Performance rules* now records that this port always smooth-scrolls where upstream defaults to
  snap-to-cell — a deliberate divergence that was previously undocumented.

## [0.3.0] - 2026-08-13

### Added

- **External HTML5 drag-and-drop** — `@isDraggable` (`true`, `"cell"` or `"header"`) makes the grid
  a drag source, and `@onDrop` separately makes it a drop target; the two halves are independent.
  `@onDragStart` supplies the payload with `setData(mime, payload)` and can override the drag image,
  `@onDragOverCell` fires once per new cell rather than per event, `@onDragLeave` completes the set.
  Distinct from the internal column/row reorder gestures, which are plain mouse drags. **A drag that
  sets no data is cancelled**, so `@isDraggable` is safe to switch on before the callback exists.
- **`@keybindings`** — remap or switch off any keyboard gesture: `true` keeps the default, `false`
  disables it, a string rebinds it. Same syntax as upstream (`primary+shift+f`, `ArrowRight|Tab`,
  `any+Escape`, `_68` for a keyCode), so a React `keybindings` map transfers unchanged. The
  _Keyboard, and remapping keys_ cookbook chapter lists every binding and its default.
- **Keyboard gestures that were missing**, all now bindable: Tab / shift+Tab as horizontal movement,
  alt+Arrow to move the cursor without collapsing the selection, primary+shift+Arrow/Home/End to
  extend the selection to an edge, shift+space / ctrl+space to select the row / column,
  PageUp/PageDown, primary+Enter to scroll the selection back into view, and **Escape to clear the
  selection** (which also fires `@onSelectionCleared`, matching upstream).
- **`CellRenderer.onSelect`** is now called. A custom cell renderer can intercept a click that would
  move the selection onto one of its cells, and `preventDefault()` refuses it — the only callback in
  the grid that can.
- `<DemoGrid>`'s header menu gained real items (auto-size, hide/show column), and the demo app gained
  a **Shadow DOM** tab.

### Fixed

- A drag started inside the grid no longer extends the selection underneath it.

### Notes

- **The grid works inside a shadow root**, now verified rather than assumed: hit-testing, focus,
  pointer listeners and keyboard navigation all cross the boundary. **Styles do not** — the addon's
  stylesheets land in the document head, which a shadow boundary blocks by construction, so a
  consumer mounting the grid in a shadow root must adopt them (e.g. via `adoptedStyleSheets`).
- The `search` keybinding defaults to **on** here where upstream defaults it off; Cmd/Ctrl+F has
  worked in this addon since 0.1.x, and inheriting upstream's default would have silently removed it.
  Pass `keybindings={{hash search=false}}` for upstream's behaviour.
- Upstream's `downFill` / `rightFill` and `acceptOverlay*` bindings are deliberately absent from the
  map rather than present and inert: this addon has no keyboard fill command (its fill handle is a
  mouse gesture), and its overlay editor handles its own keys.
- A `shift+Arrow` that grows the selection without moving the cursor is swallowed here, where
  upstream lets it through. Unchanged from previous releases of this addon; without it the page
  scrolls under the user mid-selection. Tab at the last column still moves focus out of the grid.
- When you write a cell through `@onDrop` (or any other consumer-initiated path), call
  `updateCells` — nothing has told the grid to repaint. This is the same tracking rule as everywhere
  else, but a drop _looks_ like an edit the grid made.
- Swapping a shipped cell renderer for your own must be done **by identity**, not by filtering on
  `kind`: every custom renderer carries `kind: GridCellKind.Custom`, so a `kind` filter removes
  nothing and leaves the original ahead of your replacement.

## [0.2.1] - 2026-08-12

### Added

- `@onGroupHeaderRenamed` — providing the callback injects a "Rename" entry into every column
  group's details, appended after the consumer's own `actions`, and clicking it opens a small
  inline text box over the group's band. Escape and Enter return focus to the grid.
- `<:rightElement>` — a named block rendering a panel past the last column, with
  `@rightElementSticky` and `@rightElementFill`. A block rather than upstream's node prop, so the
  content keeps the consumer's own components and actions in scope.
- `@paddingRight` / `@paddingBottom` — a gutter beside the right panel and below the last row.
  Added to the scroller's extent and subtracted from the area the visible region is measured
  against. Not scaled by `@scaleToRem`, matching upstream.
- `@selection` / `@onSelectionCleared` — controlled selection. Passing `@selection` makes the grid
  keep none of its own: every gesture reports the _requested_ selection through
  `@onSelectionChanged` and nothing moves until a new value is handed back, so a consumer can
  refuse a selection, snap it to whole rows, or keep it in step with the rest of their UI.
  `@onSelectionCleared` fires on the out-of-bounds click only, as narrow as upstream's.

### Notes

- `@onGroupHeaderRenamed` receives the group **key**, not the display name source passes. Renaming
  means rewriting `column.group`, and a consumer who gave the group a distinct display name — the
  main reason to use `@getGroupDetails` at all — could not map that name back to those columns.
- Controlled selection is one flag where source has two. Upstream splits control across
  `gridSelection` (reads) and `onGridSelectionChange` (writes); all three useful configurations are
  reachable here — controlled, frozen, and the notify-only grid this already had.
- A `@onSelectionChanged` handler that stores whatever it is handed is indistinguishable from an
  uncontrolled grid, and its argument is the _requested_ selection, not the accepted one. The
  cookbook calls this out.

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

[0.6.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.6.0
[0.5.1]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.5.1
[0.5.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.5.0
[0.4.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.4.0
[0.3.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.3.0
[0.2.1]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.2.1
[0.2.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.2.0
[0.1.7]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.7
[0.1.0]: https://github.com/ultish/glide-data-grid-ember/releases/tag/v0.1.0
