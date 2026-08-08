# TBD — Storybook feature coverage audit

**What this is.** A story-by-story audit of the upstream glide-data-grid Storybook against this port,
done on **2026-08-09** by enumerating the **89 `*.stories.tsx` files** in the local source tree
(`/Users/jxhui/Developer/glide-data-grid`, commit as checked out on this machine) rather than
scraping <https://glideapps.github.io/glide-data-grid/>. Every classification below was checked
against the port's **code** — `glide-data-grid.gts`'s arg list, `grid-host-controller.ts`'s
`DrawGridArg` construction, `src/rendering/`, `src/data-source/` — not against its docs.

**What this is NOT.** It is not a re-statement of `PHASES.md`'s Phase 9 backlog (items 9a–9q). That
backlog was assembled by auditing the source *tree*; this audit asks the different question **"what
does the Storybook demonstrate that the backlog does not already account for?"** Where a story maps
to a known backlog item, this file cites the item id in one line and moves on. **The new findings
in §3 are the point of this document.**

---

## 1. Summary

| | Count |
|---|---|
| Story **files** enumerated | 89 |
| Exported **stories** total | **111** |
| — `Glide-Data-Grid/DataEditor Demos` (the URL the user linked) | 75 |
| — `Glide-Data-Grid/Docs` (numbered guides) | 9 |
| — `Extra Packages/Cells` | 2 |
| — `Extra Packages/Source` | 2 |
| — `Tests/TestCases` + `Subcomponents/*` (internal, not feature docs) | 23 |
| **Feature-facing stories audited in detail** | **88** |

Of those 88:

| Status | Count |
|---|---|
| ✅ Supported | 46 |
| ⚠️ Partially supported | 15 |
| ❌ Missing entirely | 25 |
| ❓ Unknown / needs a check | 1 |
| 📄 Prose only, nothing to port | 1 |

**Of the 40 gaps (⚠️ + ❌ + ❓), 25 are already covered by backlog items 9a–9q. Fifteen are not.**

### The headline: what the Storybook found that the backlog missed

Fourteen genuinely new gaps, plus one behavioural divergence. Full detail in §3.

| # | Gap | Stories | Size |
|---|---|---|---|
| **N1** | **`GridColumn.grow` — stretch columns to fill width — is dead.** The type field exists and `growOffset` is *read* in three resize callbacks, but **nothing anywhere computes it**. A `grow` column silently gets its measured width. | `StretchColumnSize`, docs `03-grid-column` | `S` |
| **N2** | **`onItemHovered` is never surfaced.** The controller tracks hover internally (`hoverInfo`) and animates on it, but there is no arg. This single missing callback blocks the entire tooltip use case. | `Tooltips`, `RowHover`, `ObscuredDataGrid` | `S` |
| **N3** | **`rightElement` / `rightElementProps` — no consumer content beside the last column.** Source's "add a column" `+` button and every right-rail affordance are built on this. In Ember it wants to be a named block. | `RightElement`, `NewColumnButton` | `M` |
| **N4** | **External HTML5 drag-and-drop is absent** — `isDraggable`, `onDragStart`, `onDrop`, `onDragOverCell`, `onDragLeave`. Distinct from the internal column/row DnD the port has. | `DragSource`, `DropEvents` | `M` |
| **N5** | **Scroll shadows are not drawn at all** (`fixedShadowX` / `fixedShadowY`). Frozen columns and the sticky header have no depth cue at any scroll position. | `ScrollShadows` | `S` |
| **N6** | **`overscrollX` / `overscrollY`** — extra scrollable space past the last column/row. | `Overscroll` | `S` |
| **N7** | **`preventDiagonalScrolling`** — axis-locking during trackpad scroll. | `PreventDiagonalScroll` | `S` |
| **N8** | **The whole `experimental` prop bag is unported** — `paddingRight`/`paddingBottom`, `eventTarget`, `hyperWrapping`, `strict`, `scrollbarWidthOverride`, `disableMinimumCellWidth`, `isSubGrid`, the Firefox/Safari rescaling flags, `kineticScrollPerfHack`. Four separate stories demo it. | `Padding`, `CustomEventTarget`, `WrappingText`, `AddColumns` | `M` total |
| **N9** | **`getGroupDetails` is hardcoded** to `DEFAULT_GROUP_DETAILS` — so group headers can have no icon, no `overrideTheme`, no **actions**, and no collapse affordance. The backlog knows about `use-collapsing-groups` (9j) and `onGroupHeaderRenamed` (9g) but never about `getGroupDetails` itself. | `ColumnGroupCollapse`, `GroupHeaderActionClick` | `M` |
| **N10** | **`verticalBorder` is hardcoded** to a module constant that always returns `true`. Per-column gridline suppression is impossible. | `ScrollShadows` | `S` |
| **N11** | **The `onPaste` prop (`boolean \| function`) is unported.** A consumer cannot veto or intercept a paste. The backlog lists `coercePasteValue` but not this. | `PasteSupport`, `ObscuredDataGrid`, `ValidateData` | `S` |
| **N12** | **`resizeIndicator` is hardcoded to `"none"`.** Source offers `"full" \| "header" \| "none"`. | `ResizableColumns` | `S` |
| **N13** | **Scroll is *always* smooth — the port cannot do source's default snap-to-cell scrolling.** This is the reverse of the usual gap: `computeXOffset` always produces sub-pixel `translateX`, deliberately (documented at `grid-host-controller.ts:694`). Source defaults `smoothScrollX`/`smoothScrollY` to **false**. So the port's scroll feel diverges from upstream's default on every grid. | `SmoothScrollingGrid` | `S` |
| **N14** | **Shadow DOM: unknown.** Source has a story for it. The port attaches `mousemove`/`paste` listeners at `window` and appends a measurement canvas to `document.documentElement` (`grid-host-controller.ts:993`). Nobody has ever run the grid inside a shadow root. **Not claimed broken — claimed unverified.** | `ShadowDOM` | `S` to check |

Two of these are worth calling out as more than parity items:

- **N1 (`grow`) is a live half-implemented feature.** `growOffset` is read at three call sites
  (`grid-host-controller.ts:2043`, `:2653`, `:2776`) and is always `undefined`. A consumer reading
  the port's own `GridColumn` type will set `grow` and get no error and no effect.
- **N13 is a behavioural divergence, not a missing prop.** Every grid this port renders scrolls
  differently from an upstream grid with default props. That is a defensible choice — it is written
  down as one — but it had never been connected to the fact that source's default is the *other* mode.

---

## 2. Full story table

Legend: ✅ supported · ⚠️ partial · ❌ missing · ❓ unknown · 📄 prose only.
"Backlog" cites `PHASES.md` item ids; **NEW** means no backlog item covers it (see §3).

### 2.1 `Glide-Data-Grid/DataEditor Demos` (75 stories, 74 files)

| Story | Feature it demonstrates | Status | Backlog |
|---|---|---|---|
| `AddColumns` | columns array grows/shrinks live; `experimental.strict` | ⚠️ | reactive columns work; `strict` **NEW** (N8) |
| `AddDataToMiddle` | rows inserted mid-dataset | ✅ | — |
| `AddDataToTop` | rows prepended | ✅ | — |
| `AddData` | rows appended | ✅ | — |
| `AllCellKinds` | every core `GridCellKind` | ✅ | Phase 4 |
| `AppendRowHandle` | `ref.appendRow()` + `trailingRowOptions` | ⚠️ | `@onRowAppended`/`@showTrailingBlankRow` exist; imperative `appendRow` = 9f, rich options = 9g |
| `AutomaticRowMarkers` | `rowMarkers` | ✅ | — |
| `BuiltInSearch` | `showSearch` | ✅ | 9e (landed) |
| `CellActivatedEvent` | `onCellActivated`, `cellActivationBehavior` | ❌ | 9g |
| `ColumnGroupCollapse` | collapsible column groups | ❌ | 9j (`use-collapsing-groups`) **+ N9** (`getGroupDetails`) |
| `ColumnGroups` | `column.group` | ✅ | Phase 7b |
| `ContentAlignment` | `cell.contentAlign` | ✅ | ported in `data-grid-lib.ts`; not in any port demo |
| `ControlledSearch` | `searchValue`/`searchResults`/`onSearchValueChange` | ✅ | 9e |
| `ControlledSelection` | `gridSelection` + `onGridSelectionChange` | ❌ | 9h ("controlled-selection mode") |
| `CopySupport` | copy via `getCellsForSelection` | ✅ | `copyHeaders` still 9g |
| `CustomEditors` | `provideEditor` on a custom renderer | ⚠️ | works as a DOM factory, not a component — 9l / 9m |
| `CustomEventTarget` | `experimental.eventTarget` | ❌ | **NEW** (N8) |
| `CustomHeaderIcons` | `@headerIcons` + `column.icon` | ✅ | Phase 7e |
| `CustomDrawing` | `drawCell` / `drawHeader` | ✅ | Phase 9 partial |
| `OverrideMarkerRenderer` | `renderers` prop overriding a built-in | ✅ | `@getCellRenderer` is the full override |
| `DragSource` | `isDraggable`, `onDragStart` | ❌ | **NEW** (N4) |
| `DropEvents` | `onDrop`, `onDragOverCell`, `onDragLeave` | ❌ | **NEW** (N4) |
| `FillHandle` | fill-handle drag | ✅ | 9h (landed) |
| `FreezeColumns` | `freezeColumns` | ✅ | — |
| `FreezeRows` | `freezeTrailingRows` | ❌ | 9g (flagged `M`, not `S` — 7 hit-test call sites) |
| `GetMouseArgsForPosition` | `ref.getMouseArgsForPosition` | ❌ | 9f |
| `HeaderMenus` | `hasMenu` + `onHeaderMenuClick` | ✅ | Phase 7 |
| `HighlightCells` | `highlightRegions` | ✅ | Phase 9 partial |
| `ImperativeScroll` | `ref.scrollTo` | ❌ | 9f (private `scrollCellIntoView` is most of it) |
| `InputBlending` | `range/row/columnSelectionBlending`, `*SelectionMode` | ❌ | 9g (`resolveArgs()` plumbing only) |
| `CustomKeybindings` | `keybindings` remapping DSL | ❌ | 9h |
| `LayoutIntegration` | grid inside a flex layout | ✅ | port sizes from its container; `width`/`height` props = 9g |
| `MultiSelectColumns` | ctrl/cmd multi-column select | ✅ | `@columnSelect="multi"` |
| `NewColumnButton` | `rightElement` "+" button | ❌ | **NEW** (N3) |
| `ObscuredDataGrid` | grid in a clipping container + hover/context/paste callbacks | ⚠️ | context menus ✅ (9d); `onItemHovered` **NEW** (N2); `onPaste` **NEW** (N11); `trailingRowOptions` 9g |
| `ObserveVisibleRegion` | `onVisibleRegionChanged` | ✅ | Phase 8e |
| `OneHundredThousandCols` | 100 000 columns | ⚠️ | renders, but 9k: blit fast path bails out above 100 columns |
| `OneMillionRows` | 1 000 000 rows | ✅ | — |
| `Overscroll` | `overscrollX` / `overscrollY` | ❌ | **NEW** (N6) |
| `Padding` | `experimental.paddingRight/paddingBottom` | ❌ | **NEW** (N8) |
| `PasteSupport` | `onPaste` interception | ⚠️ | paste itself ✅ (Phase 3c); the `onPaste` prop **NEW** (N11); `coercePasteValue` 9g |
| `PreventDiagonalScroll` | `preventDiagonalScrolling` | ❌ | **NEW** (N7) |
| `RapidUpdates` | `ref.updateCells` at high frequency | ✅ | Phase 8c |
| `RearrangeColumns` | `onColumnMoved` + consumer reorder | ✅ | 9j would package it as `withMovableColumns` |
| `ReorderRows` | `onRowMoved` | ✅ | 9h (landed) |
| `ResizableColumns` | `onColumnResize*` | ⚠️ | resize ✅; `resizeIndicator` hardcoded **NEW** (N12) |
| `RightElement` | `rightElement` / `rightElementProps` | ❌ | **NEW** (N3) |
| `RightToLeft` | bidi/RTL text in cells | ✅ | `data-grid-lib.ts:567` ports the bidi branch; **no port demo has ever rendered RTL text** |
| `RowAndHeaderSizes` | `rowHeight`/`headerHeight`/`groupHeaderHeight` | ✅ | — |
| `RowGrouping` | `rowGrouping` prop | ❌ | 9i (`L`) |
| `RowHover` | hover-driven `getRowThemeOverride` | ⚠️ | theme override ✅; the `onItemHovered` that drives it **NEW** (N2) |
| `RowMarkers` | marker kinds, `rowMarkerStartIndex`, `rowMarkerTheme` | ⚠️ | kinds ✅; start-index and marker theme = 9g |
| `RowSelections` | `rowSelect` + `rowSelectionMode`/`Blending` | ⚠️ | `rowSelect` ✅; mode/blending = 9g |
| `ScaledView` | `scaleToRem` | ❌ | 9g |
| `ScrollOffset` | `scrollOffsetX`/`scrollOffsetY` | ❌ | 9g |
| `ScrollShadows` | `fixedShadowX/Y`, `verticalBorder`, `drawFocusRing` | ❌ | shadows **NEW** (N5); `verticalBorder` **NEW** (N10); `drawFocusRing` 9g |
| `SearchAsFilter` | search results used to filter rows | ✅ | 9e |
| `SelectionSerialization` | `CompactSelection` → JSON → restore | ⚠️ | `CompactSelection` ported; restoring needs controlled selection = 9h |
| `SelectionRoundTrip` | same, round-tripped | ⚠️ | 9h |
| `ServerSideData` | paged async fetch | ✅ | `AsyncRecordsSource`, Phase 8e |
| `ShadowDOM` | grid inside a shadow root | ❓ | **NEW** (N14) — unverified, not known-broken |
| `SillyNumbers` | very large/precise numbers | ✅ | — |
| `SmallEditableGrid` | minimal editable grid | ✅ | — |
| `SmoothScrollingGrid` | `smoothScrollX`/`smoothScrollY` | ⚠️ | port is **always** smooth; source defaults to off — **NEW** (N13) |
| `SpanCell` | `cell.span` merged cells | ⚠️ | span *rendering* ported (`data-grid-render.cells.ts:226`); span selection growth = 9h |
| `StretchColumnSize` | `column.grow` fills leftover width | ❌ | **NEW** (N1) — the biggest surprise in this audit |
| `TenMillionCells` | 10M cells | ✅ | — |
| `ThemePerColumn` | `column.themeOverride` | ✅ | Phase 6 |
| `ThemePerRow` | `getRowThemeOverride` | ✅ | Phase 6 |
| `ThemeSupport` | full theme object | ✅ | Phase 6 |
| `Tooltips` | `onItemHovered` → tooltip | ❌ | **NEW** (N2) |
| `TrailingRowOptions` | `trailingRowOptions` (`tint`/`hint`/`sticky`/`addIcon`) | ❌ | 9g |
| `UnevenRows` | `rowHeight` as a function | ✅ | — |
| `ValidateData` | `validateCell` | ❌ | 9g (type ported, nothing calls it) |
| `WrappingText` | `allowWrapping` + `experimental.hyperWrapping` | ⚠️ | `allowWrapping` ✅; `hyperWrapping` hardcoded `false` — **NEW** (N8) |

### 2.2 `Glide-Data-Grid/Docs` (9 stories)

| Story | Covers | Status | Notes |
|---|---|---|---|
| `FAQ` | prose | 📄 | nothing to port |
| `GettingStarted` | minimal grid | ✅ | cookbook recipe 1 is the port's equivalent |
| `EditingData` | `onCellEdited` | ✅ | `@onCellsEdited` |
| `GridColumns` | every `GridColumn` field | ⚠️ | `icon`/`overlayIcon`/`menuIcon`/`themeOverride`/`group`/`hasMenu`/`style` all ✅; **`grow` ❌ (N1)** |
| `StreamingData` | `updateCells` | ✅ | Phase 8c |
| `Search` | search engine + UI | ✅ | 9e |
| `ColumnGrouping` | groups | ✅ | Phase 7b |
| `Theming` | theme object | ✅ | Phase 6 |
| `Menus` | header menus | ✅ | Phase 7 |

### 2.3 `Extra Packages` (4 stories)

| Story | Covers | Status | Notes |
|---|---|---|---|
| `CustomCells` | all 13 `packages/cells` types | ✅ | Phase 5, exposed via `@extraCells` |
| `CustomCellEditing` | their editors | ⚠️ | 9m — deliberate editor simplifications (no ProseMirror / `react-select` / TOAST UI) |
| `UseDataSource` | `useAsyncDataSource` | ✅ | `AsyncRecordsSource` |
| `UndoRedo` | `useUndoRedo` | ❌ | 9j (`M`) |

### 2.4 `Tests/TestCases` + `Subcomponents/*` (23 stories — not feature documentation)

These are upstream's own regression/visual-check fixtures, not user-facing feature docs. Audited
only for anything the demos above do not already cover; two are worth noting:

- **`GroupHeaderActionClick`** — group-header **actions** (clickable icons in the group strip),
  supplied via `getGroupDetails`. Reinforces **N9**; nothing else demonstrates it.
- **`DeleteColumnsViaOnDelete`** — the `onDelete` prop overriding delete-key behaviour → 9g.

The rest (`Simplenotest`, `Minimal`, `Smooth`, `ManualControl`, `Draggable`, `IdealSize`,
`DynamicAddRemoveColumns`, the three `GridSelectionOutOfRange*` cases, `ResizableColumns`,
`GridAddNewRows`, `GridNoTrailingBlankRow`, `MarkdownEdits`, `CanEditBoolean`, `SimpleEditable`,
`RelationColumn`, `Bug70`, `FilterColumns`, and the five `Subcomponents/*` stories) exercise
behaviour already covered by the table in §2.1 — or, in the `GridSelectionOutOfRange*` cases,
defensive edge handling that is a natural fit for **9a**'s vitest suite rather than a feature gap.

---

## 3. The new gaps, in detail

Everything here is **not** covered by any 9a–9q item. Sizes use `PHASES.md`'s tags:
`S` ≈ half a day · `M` ≈ 1–2 sessions · `L` ≈ multi-session.

### N1 — `GridColumn.grow` is declared but dead — `S`

**Story:** `StretchColumnSize`. Columns with `grow: 1` / `grow: 2` share the container's leftover
width proportionally; resizing one redistributes the rest.

**Source:** `packages/core/src/data-editor/use-column-sizer.ts:220-245`. After measuring, it sums
`grow` across columns, computes each column's weighted share of `(clientWidth - totalWidth)`, and
writes it to `growOffset`, adding it to `width`.

**Port:** `src/rendering/column-sizer.ts`'s `sizeColumns` maps columns to a measured or default
width and **returns**. There is no grow pass. `GridColumn.grow` exists on the type
(`rendering/data-grid-types.ts:164`) and `InnerGridColumn.growOffset` at `:205`, and
`grid-host-controller.ts` reads `growOffset` at `:2043`, `:2653` and `:2776` — always `undefined`.

**Why it matters more than a typical parity gap:** a consumer reads the port's own exported type,
sets `grow`, and gets silence. `newSizeWithGrow` in the three resize callbacks is documented as
"adds back the column's `growOffset`" and can never differ from `newSize`.

**Porting it:** add the grow pass to `sizeColumns` (it needs the container width, which the
controller has), and make sure the result stays identity-stable per the `computeCanBlit` rule —
`mappedColumns` already churns per draw (9k), so do not make that worse.

### N2 — `onItemHovered` — `S`

**Stories:** `Tooltips` (the canonical tooltip recipe), `RowHover` (hover-driven row theming),
`ObscuredDataGrid`.

**Source:** `data-editor.tsx:2728-2816` — `onItemHoveredImpl` wraps the internal hover and emits
`onItemHovered?.({ ...args, location: [col - rowMarkerOffset, row] })`. Note it **subtracts the
row-marker offset**, which is exactly the class of bug 9h and Phase 8e both found; copy that.

**Port:** hover is fully tracked — `hoverInfo`, `hoverValues`, `onItemHoveredImpl`-equivalent logic
around `grid-host-controller.ts:2082-2104`, feeding the hover-fade animation. It is simply never
handed out. Adding `@onItemHovered` is one arg, one emit, and the offset subtraction.

**Consequence today:** tooltips are impossible for a consumer to build. That is the most commonly
requested grid feature after context menus, and 9d already established the pattern for this exact
shape of "hit test exists, event isn't emitted" plumbing.

### N3 — `rightElement` / `rightElementProps` — `M`

**Stories:** `RightElement`, `NewColumnButton` (the "+ add column" button every spreadsheet UI has).

**Source:** `scrolling-data-grid.tsx` → `infinite-scroller.tsx`; `rightElementProps` is
`{ sticky?: boolean; fill?: boolean }`.

**Port:** nothing. The DOM scaffolding (`.dvn-*` scroller, `scrollInnerEl`, `stackEl`, `spacerEl`,
built at `grid-host-controller.ts:954-972`) is where it would live.

**Ember shape:** this is the one gap that is *nicer* in Ember than in React — a named block
(`<:rightElement>`) rendered into a positioned div inside the scroll inner element. Sizing/stickiness
is the real work; the block plumbing is trivial. Interacts with the horizontal scroll-width
computation, so budget for that rather than treating it as a passthrough.

### N4 — External HTML5 drag-and-drop — `M`

**Stories:** `DragSource` (`isDraggable: boolean | "header" | "cell"` + `onDragStart` populating a
`DataTransfer` so cells can be dragged *out* of the grid), `DropEvents` (`onDragOverCell` +
`onDrop` + `onDragLeave`, dropping files/text *onto* a cell, with `highlightRegions` used to show
the target).

**Source:** `data-editor.tsx:2683-2699` (`onDragStartImpl`) plus the passthroughs at `:4235-4296`.

**Port:** no `dragstart`/`dragover`/`drop`/`dragleave` listeners anywhere. This is **not** the
internal column/row DnD from Phase 3d and 9h — that is `mousedown`-based and unrelated.

**Porting it:** four listeners on `root`, reusing `resolveMouseHit` for the cell target (same
machinery 9d reused), plus setting `draggable` on the root when `isDraggable` is on. The fiddly part
is that a native drag suppresses `mousemove`, so it must not fight the Phase-9h `Autoscroller` or
the window-level drag listener.

### N5 — Scroll shadows — `S`

**Story:** `ScrollShadows`.

**Source:** `data-grid.tsx:362,454,1879` — `fixedShadowX`/`fixedShadowY` (both default **true**), the
sticky width memo, and the shadow-alpha ramp
(`cellXOffset > freezeColumns ? 1 : clamp(-translateX / 100, 0, 1)`).

**Port:** the string "shadow" appears in this addon only in `GrowingEntry`'s autosize shadow box and
`drilldown-cell`'s chip shadow. No scroll shadow is drawn, at any offset, on either axis.

**Why it is easy to miss:** it is purely cosmetic and it *degrades* rather than breaks — frozen
columns simply look flat against the scrolled body. The ramp formula above is the whole feature.

### N6 — `overscrollX` / `overscrollY` — `S`

**Story:** `Overscroll`. Adds N pixels of empty scrollable space past the last column/row, so the
final cell can be scrolled clear of a floating UI element.

**Port:** the scroll extent is computed from content only (`stackEl`/`spacerEl` sizing,
`grid-host-controller.ts:1940+`). Adding two args that pad those numbers is small — but note source
routes `overscrollX/Y` through `useRemAdjuster` (`data-editor.tsx:939-946`), so it is entangled with
`scaleToRem` (9g). Land whichever comes first and wire the other in.

### N7 — `preventDiagonalScrolling` — `S`

**Story:** `PreventDiagonalScroll`. Locks scrolling to one axis per gesture, which materially
improves trackpad feel on wide grids.

**Port:** nothing; the port relies entirely on the native scroller (`onScroll` →
`syncScrollOffsets`), so this becomes a wheel-event axis lock rather than a pure passthrough.

### N8 — The `experimental` prop bag — `M` in total, `S` each

Source's full shape (`internal/data-grid/data-grid.tsx:246-265`):

| Field | Story | Port |
|---|---|---|
| `paddingRight` / `paddingBottom` | `Padding` | ❌ nothing |
| `eventTarget` | `CustomEventTarget` | ❌ — `src/-private/grid-event-target.ts` has it only as a **comment** at line 23 |
| `hyperWrapping` | `WrappingText` | ⚠️ hardcoded `false` at `grid-host-controller.ts:1692`; the render engine **does** honour it (`data-grid-lib.ts:592`) — a one-line passthrough |
| `strict` | `AddColumns` | ❌ |
| `scrollbarWidthOverride` | — | ❌ |
| `disableMinimumCellWidth` | — | ❌ (`minimumCellWidth: 10` hardcoded at `:1719`) |
| `renderStrategy` | — | ⚠️ derived from `browserIsSafari`, not overridable (`:1717`) |
| `isSubGrid` | — | ❌ |
| `enableFirefoxRescaling` / `enableSafariRescaling` | — | ❌ (relates to 9i's flat `maxScaleFactor: 5`) |
| `kineticScrollPerfHack` | — | ❌ (touch-only → dies with 9c) |
| `disableAccessibilityTree` | — | n/a until 9b |

`hyperWrapping` is the cheapest real win here: the plumbing already exists end to end and is pinned
shut by one literal.

### N9 — `getGroupDetails` — group header icons, themes, actions and collapse — `M`

**Stories:** `ColumnGroupCollapse`, and the `GroupHeaderActionClick` test story.

**Source:** `getGroupDetails(group) => { name, icon?, overrideTheme?, actions? }`. `actions` are
clickable icons drawn into the group strip with their own click targets.

**Port:** hardcoded to `DEFAULT_GROUP_DETAILS` at `grid-host-controller.ts:1699`, with a comment at
`:1312` explicitly noting that group themes can therefore never merge. The render engine already
consumes it fully (`data-grid-render.ts:439`).

**Backlog relationship:** 9j covers `use-collapsing-groups` (the *state* hook) and 9g covers
`onGroupHeaderRenamed`/`onGroupHeaderClicked`. Neither covers `getGroupDetails` itself, which is the
prop all of them actually hang off — and group-header **actions** appear in no backlog item at all.
Do this before or alongside 9j, not after.

### N10 — `verticalBorder` is hardcoded — `S`

`ALWAYS_VERTICAL_BORDER` at `grid-host-controller.ts:1680`, with a note at `:643` saying "this port
always draws every vertical gridline (no per-column control)". Source takes `verticalBorder?:
(col: number) => boolean` and `ScrollShadows` sets it. The blocker is real but stated: the value is
`computeCanBlit`-identity-compared, so exposing it needs a memoized wrapper, not an inline arrow —
the same trap Phase 6 documented.

### N11 — The `onPaste` prop — `S`

**Stories:** `PasteSupport`, `ObscuredDataGrid` (`onPaste={true}`), `ValidateData`.

Source's `onPaste?: boolean | ((target: Item, values: readonly (readonly string[])[]) => boolean)`
lets a consumer veto a paste wholesale or let it fall through to `onCellEdited`. The port's paste
path (`grid-host-controller.ts:4117+`) is unconditional. The backlog's `coercePasteValue` (9g) is a
*per-value* hook and is not a substitute for the whole-operation veto.

### N12 — `resizeIndicator` — `S`

Hardcoded `"none"` at `grid-host-controller.ts:1720`. Source: `"full" | "header" | "none"`, drawn by
the render engine, which the port already contains. One arg + one passthrough.

### N13 — The port always smooth-scrolls; source defaults to snap-to-cell — `S`

**Story:** `SmoothScrollingGrid` sets `smoothScrollX`/`smoothScrollY` to `true` — i.e. upstream
treats smooth scroll as the *opt-in*, and both props default to `false`
(`scrolling-data-grid.tsx:93`).

**Port:** `computeXOffset` (`grid-host-controller.ts:705-721`) always returns a sub-pixel
`translateX`; the same is true on Y. The simplification is deliberate and documented at `:694`
("always computing the smooth/sub-pixel form is a reasonable default for this phase").

**Why it belongs on this list anyway:** it was recorded as a *Phase 2 simplification* and never as a
*divergence from source's default behaviour*. Every grid this port renders scrolls differently from
the same grid upstream. That may well be the better default — but it should be a stated choice, and
a consumer migrating from React glide-data-grid will notice it immediately. If it stays, say so in
the cookbook's performance chapter; if not, the source branch to port is
`scrolling-data-grid.tsx:145-175`.

### N14 — Shadow DOM: unverified — `S` to check

**Story:** `ShadowDOM` renders the grid inside a shadow root with styles copied in.

**Port:** never tried. Two specific things to check, both real risks rather than certainties:
`window`-scoped listeners (`paste` at `grid-host-controller.ts:1069`, and 9h's window-level
`mousemove`) and the measurement canvas appended to `document.documentElement` at `:993`. Overlay
editors are appended to the **grid root** (`:972`, `:1940-1949`), which is the good case — they will
inherit shadow-root styles correctly.

**Stated honestly: this is "unknown", not "broken".** It might work unchanged.

---

## 4. What this audit could not determine

Recorded deliberately, per `PHASES.md`'s standing rule that a wrong "supported" is worse than an
admitted unknown.

1. **Per-story visual fidelity.** Nothing here was run. "Supported" means the arg/behaviour exists in
   the port's code and was ported from the corresponding source file — not that a side-by-side
   render matches. This is the same limitation `PHASES.md` already records for the 26 cell renderers.
2. **`ShadowDOM` (N14)** — see above.
3. **`RightToLeft`** is marked ✅ because `data-grid-lib.ts:567-600` ports source's bidi branch
   verbatim, but **no demo in this repo has ever rendered RTL text**. By this project's own standing
   lesson ("a feature no demo has ever switched on is effectively unverified code") that ✅ is weaker
   than the others in this table. Same caveat, less strongly, for `ContentAlignment` and `SpanCell`'s
   render path.
4. **`OneHundredThousandCols`** is marked ⚠️ on the strength of 9k's documented >100-column blit
   bail-out. Whether 100 000 columns is merely slower or actually unusable was not measured.
5. **Upstream drift.** This compares against the source tree as checked out on this machine. No check
   was made of whether glideapps/glide-data-grid has moved since, so the deployed Storybook the user
   linked may contain stories that do not exist locally. The local file count (89) can be reconciled
   against the live site's sidebar if that matters.
6. **`Tests/TestCases` was audited shallowly** (§2.4). Those 20 stories are upstream's regression
   fixtures; two produced findings, the rest were matched against §2.1 by story name and prop usage
   rather than read line by line.

---

## 5. Suggested ordering, if any of this gets picked up

Not a plan — `PHASES.md` owns planning. Just the order the value lands, given that 25 of the 40 gaps
are already-known backlog items:

1. **N1 (`grow`)** — it is a half-implemented public type field, which is worse than an absent one.
2. **N2 (`onItemHovered`)** — one arg; unblocks tooltips, the most-requested thing still missing.
3. **The one-literal unlocks:** N8's `hyperWrapping`, N12's `resizeIndicator`, N10's `verticalBorder`
   (memoized), N11's `onPaste`. Roughly one session for all four, and each is a
   `DrawGridArg`/callback the engine already honours.
4. **N5 (scroll shadows)** — cosmetic, self-contained, visible on every frozen-column grid.
5. **N9 (`getGroupDetails`)** — do it *before* 9j's `use-collapsing-groups`, which depends on it.
6. **N3 (`rightElement`)** and **N4 (external DnD)** — the two genuinely `M`-sized new subsystems.
7. **N13** — decide and document, rather than implement.
8. **N14** — a 30-minute browser check that either closes an unknown or opens a real item.

Whatever is picked up: anything touching `DrawGridArg` must respect the `computeCanBlit`
identity-stability rule (N10 and N1 both do), and per Phase 10a's lesson, wire it into `<DemoGrid>`
in the same change — otherwise it joins the pile of features no demo has ever switched on.
