import "./glide-data-grid.css"
import "./glide-data-grid-editors.css"
import "./glide-data-grid-extra-cell-editors.css"
import Component from '@glimmer/component';
import { tracked, cached } from '@glimmer/tracking';
import { hash } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import { GridHostController } from '../-private/grid-host-controller.js';
import { getCellRenderer } from '../rendering/cells/index.js';
import { createCombinedCellRenderer } from '../rendering/extra-cells/index.js';
import { precompileTemplate } from '@ember/template-compilation';
import { setComponentTemplate } from '@ember/component';
import { g, i, n } from 'decorator-transforms/runtime';

;

;

;

// Public `<GlideDataGrid>` component -- Phase 2b of the Ember port. Thin reactivity/lifecycle
// wrapper around the plain-TS `GridHostController` (`../-private/grid-host-controller.ts`), which
// owns all the actual canvas/scroll/resize/hover DOM. This component's only jobs are:
//   1. Render the single container `<div>` the controller mounts itself into.
//   2. Construct the controller once the element exists, destroy it when the component is torn
//      down.
//   3. Re-run `scheduleFullRedraw()` whenever any relevant `@arg` changes, using autotracking
//      rather than any manual dependency list.
//   4. Surface the controller's imperative `updateCells` API to the consumer via `@onReady`.
class GlideDataGrid extends Component {
  // Plain (non-tracked) instance field -- deliberately not `@tracked`. Reading it must NOT be
  // an autotracking dependency of `setupGrid` below, or every `scheduleFullRedraw()`-triggering
  // rerun would also register as a change to `this.controller` and could cause redundant reruns.
  controller;
  // Yielded to the default block. Both are written from callbacks that only fire *after* the
  // initial render (the modifier's setup, and user interaction respectively), so neither can
  // trigger a backtracking re-render of content that already consumed them.
  static {
    g(this.prototype, "searchApi", [tracked]);
  }
  #searchApi = (i(this, "searchApi"), void 0);
  static {
    g(this.prototype, "searchState", [tracked]);
  }
  #searchState = (i(this, "searchState"), void 0);
  // 4.3: the host node for the `<:rightElement>` block. `{{in-element}}` renders the block *into*
  // it; the controller decides where in the scroller's DOM it sits.
  //
  // WHY THE NODE IS CREATED HERE AND NOT IN THE TEMPLATE. A node Glimmer itself rendered must not
  // be reparented -- Glimmer removes it on teardown through the parent it recorded at insertion
  // time, so moving it into the scroller turns teardown into a `NotFoundError`. A node Glimmer only
  // renders *into* carries no such constraint, which is precisely what `{{in-element}}` is for.
  //
  // WHY LAZILY, AND WHY THAT IS ALSO THE "IS THERE A BLOCK?" SIGNAL. `has-block` is template-only
  // -- there is no `this.hasBlock` to read from JS. But the template only reads this getter from
  // inside `{{#if (has-block "rightElement")}}`, so the node existing *is* the answer, with no
  // heuristic and no extra DOM. The getter runs during render and the controller reads
  // `buildGridHostArgs()` afterwards (modifiers install once the tree is in the DOM), so the
  // ordering is settled rather than lucky.
  rightHostEl;
  get rightElementHost() {
    // `ember/no-side-effects` guards against a getter writing *tracked* state, which invalidates
    // mid-render and causes backtracking assertions. This writes one plain, untracked field and
    // does it once: memoizing a detached DOM node so the value stays reference-stable, which
    // `GridHostArgs` requires of everything it carries. Creating it eagerly instead would make
    // the node exist for grids that pass no block, and its existence is the signal that one was.
    // eslint-disable-next-line ember/no-side-effects
    this.rightHostEl ??= document.createElement("div");
    return this.rightHostEl;
  }
  // Wraps the consumer's `@onSearchStateChange` so the yielded `searchState` stays current
  // whether or not they passed one. A stable reference, since it is a `GridHostArgs` field.
  handleSearchStateChange = state => {
    this.searchState = state;
    this.args.onSearchStateChange?.(state);
  };
  // The effective cell-renderer registry. `@cached` is load-bearing, not tidiness:
  // `getCellRenderer` is one of `computeCanBlit`'s ~18 identity-compared `DrawGridArg` fields, so
  // calling `createCombinedCellRenderer` inline in `buildGridHostArgs()` -- which runs on every
  // draw, scroll and hover pass -- would hand the render engine a fresh closure every frame and
  // silently disable the scroll blit fast path, with no error and no visual difference. This is
  // the exact defect Phase 6 found and fixed for three other fields; see PORTING-NOTES.md.
  //
  // `@cached` recomputes only when a tracked value it read changes -- here, the `@extraCells` and
  // `@getCellRenderer` args -- which is precisely the invalidation rule we want, and is why this
  // belongs on a component getter rather than in the (deliberately untracked) controller.
  get cellRenderer() {
    const explicit = this.args.getCellRenderer;
    if (explicit !== undefined) return explicit;
    const extras = this.args.extraCells;
    if (extras === undefined || extras.length === 0) return getCellRenderer;
    return createCombinedCellRenderer(getCellRenderer, extras);
  }
  // Reads every `@arg` this component exposes and shapes them into `GridHostArgs`. Called both:
  //   (a) synchronously inside `setupGrid` below -- reading `this.args.*` here, inside that
  //       modifier's autotracking frame, is what makes Ember consider the modifier "dirty" (and
  //       therefore re-run it) whenever any of these args change later.
  //   (b) as the `getArgs` closure `GridHostController` calls fresh on every internal draw/
  //       scroll/hover pass, per its documented calling convention (never cached internally).
  static {
    n(this.prototype, "cellRenderer", [cached]);
  }
  buildGridHostArgs = () => ({
    columns: this.args.columns,
    getCellContent: this.args.getCellContent,
    rows: this.args.rows,
    rowHeight: this.args.rowHeight,
    headerHeight: this.args.headerHeight,
    groupHeaderHeight: this.args.groupHeaderHeight,
    theme: this.args.theme,
    freezeColumns: this.args.freezeColumns,
    verticalBorder: this.args.verticalBorder,
    resizeIndicator: this.args.resizeIndicator,
    hyperWrapping: this.args.hyperWrapping,
    getGroupDetails: this.args.getGroupDetails,
    overscrollX: this.args.overscrollX,
    overscrollY: this.args.overscrollY,
    fixedShadowX: this.args.fixedShadowX,
    fixedShadowY: this.args.fixedShadowY,
    disableMinimumCellWidth: this.args.disableMinimumCellWidth,
    renderStrategy: this.args.renderStrategy,
    enableFirefoxRescaling: this.args.enableFirefoxRescaling,
    enableSafariRescaling: this.args.enableSafariRescaling,
    enableChromeRescaling: this.args.enableChromeRescaling,
    strictVisibleRegion: this.args.strictVisibleRegion,
    eventTarget: this.args.eventTarget,
    // `undefined` until the template has rendered a `<:rightElement>` block -- see the getter.
    rightElement: this.rightHostEl,
    rightElementSticky: this.args.rightElementSticky,
    rightElementFill: this.args.rightElementFill,
    paddingRight: this.args.paddingRight,
    paddingBottom: this.args.paddingBottom,
    getCellRenderer: this.cellRenderer,
    headerIcons: this.args.headerIcons,
    rowMarkers: this.args.rowMarkers,
    rowMarkerWidth: this.args.rowMarkerWidth,
    rowMarkerStartIndex: this.args.rowMarkerStartIndex,
    rowMarkerTheme: this.args.rowMarkerTheme,
    rowSelect: this.args.rowSelect,
    columnSelect: this.args.columnSelect,
    rangeSelect: this.args.rangeSelect,
    rangeSelectionColumnSpanning: this.args.rangeSelectionColumnSpanning,
    rangeSelectionBlending: this.args.rangeSelectionBlending,
    columnSelectionBlending: this.args.columnSelectionBlending,
    rowSelectionBlending: this.args.rowSelectionBlending,
    rowSelectionMode: this.args.rowSelectionMode,
    columnSelectionMode: this.args.columnSelectionMode,
    selection: this.args.selection,
    onSelectionChanged: this.args.onSelectionChanged,
    onSelectionCleared: this.args.onSelectionCleared,
    onHeaderMenuClick: this.args.onHeaderMenuClick,
    onHeaderIndicatorClick: this.args.onHeaderIndicatorClick,
    onCellsEdited: this.args.onCellsEdited,
    onColumnResizeStart: this.args.onColumnResizeStart,
    onColumnResize: this.args.onColumnResize,
    onColumnResizeEnd: this.args.onColumnResizeEnd,
    onColumnProposeMove: this.args.onColumnProposeMove,
    onColumnMoved: this.args.onColumnMoved,
    onRowMoved: this.args.onRowMoved,
    fillHandle: this.args.fillHandle,
    allowedFillDirections: this.args.allowedFillDirections,
    onFillPattern: this.args.onFillPattern,
    showTrailingBlankRow: this.args.showTrailingBlankRow,
    trailingRowOptions: this.args.trailingRowOptions,
    onRowAppended: this.args.onRowAppended,
    getRowThemeOverride: this.args.getRowThemeOverride,
    rowGrouping: this.args.rowGrouping,
    onVisibleRegionChanged: this.args.onVisibleRegionChanged,
    getCellsForSelection: this.args.getCellsForSelection,
    drawCell: this.args.drawCell,
    drawHeader: this.args.drawHeader,
    prelightCells: this.args.prelightCells,
    highlightRegions: this.args.highlightRegions,
    showSearch: this.args.showSearch,
    searchValue: this.args.searchValue,
    onSearchValueChange: this.args.onSearchValueChange,
    onSearchClose: this.args.onSearchClose,
    searchResults: this.args.searchResults,
    onSearchResultsChanged: this.args.onSearchResultsChanged,
    onSearchStateChange: this.handleSearchStateChange,
    minColumnWidth: this.args.minColumnWidth,
    maxColumnWidth: this.args.maxColumnWidth,
    onCellContextMenu: this.args.onCellContextMenu,
    onHeaderContextMenu: this.args.onHeaderContextMenu,
    onGroupHeaderContextMenu: this.args.onGroupHeaderContextMenu,
    onItemHovered: this.args.onItemHovered,
    validateCell: this.args.validateCell,
    coercePasteValue: this.args.coercePasteValue,
    onPaste: this.args.onPaste,
    copyHeaders: this.args.copyHeaders,
    onDelete: this.args.onDelete,
    onCellClicked: this.args.onCellClicked,
    onHeaderClicked: this.args.onHeaderClicked,
    onGroupHeaderClicked: this.args.onGroupHeaderClicked,
    onGroupHeaderRenamed: this.args.onGroupHeaderRenamed,
    keybindings: this.args.keybindings,
    isDraggable: this.args.isDraggable,
    onDragStart: this.args.onDragStart,
    onDragOverCell: this.args.onDragOverCell,
    onDragLeave: this.args.onDragLeave,
    onDrop: this.args.onDrop,
    onCellActivated: this.args.onCellActivated,
    onFinishedEditing: this.args.onFinishedEditing,
    onColumnAppended: this.args.onColumnAppended,
    cellActivationBehavior: this.args.cellActivationBehavior,
    editOnType: this.args.editOnType,
    trapFocus: this.args.trapFocus,
    drawFocusRing: this.args.drawFocusRing,
    scrollOffsetX: this.args.scrollOffsetX,
    scrollOffsetY: this.args.scrollOffsetY,
    scaleToRem: this.args.scaleToRem
  });
  /** Inline size for the container div (Phase 9g's `@width`/`@height`). A bare number means px;
   *  anything else is passed through verbatim. `@cached` because it is read in the template on
   *  every render and `htmlSafe` allocates. */
  get containerStyle() {
    const size = value => {
      if (value === undefined) return "100%";
      return typeof value === "number" ? `${value}px` : value;
    };
    // Both halves are either a number this component stringified itself or a CSS length the
    // consumer supplied for their own page -- the same trust level as any `style` attribute
    // they could set through `...attributes`.
    return htmlSafe(`width: ${size(this.args.width)}; height: ${size(this.args.height)};`);
  }
  // Installs `GridHostController` on the container div on first insert. `ember-modifier`'s
  // functional `modifier()` autotracks its whole function body: this function re-runs whenever
  // any tracked value it read on a previous run changes. `buildGridHostArgs()` below reads every
  // reactive `@arg`, so any of them changing re-runs this function -- at which point
  // `this.controller` is already set, so we just call `scheduleFullRedraw()` rather than
  // reconstructing anything.
  //
  // Deliberately does NOT return a teardown function: `ember-modifier` calls a returned teardown
  // both before every rerun AND on final element removal, with no way to distinguish the two --
  // returning `() => controller.destroy()` here would wrongly destroy the live controller on
  // every single arg change instead of just redrawing it. Final cleanup is instead wired via
  // `registerDestructor`, tied to the component's own destruction, not the modifier's rerun
  // cycle.
  static {
    n(this.prototype, "containerStyle", [cached]);
  }
  setupGrid = modifier(element => {
    // Establishes the autotracking dependency for this modifier's rerun -- see comment above.
    this.buildGridHostArgs();
    if (this.controller === undefined) {
      const controller = new GridHostController({
        root: element,
        getArgs: this.buildGridHostArgs
      });
      this.controller = controller;
      registerDestructor(this, () => controller.destroy());
      // Built once and never rebuilt: the consumer is expected to stash this from `@onReady`,
      // and `<GlideSearchBar>` holds it across rerenders too.
      const api = {
        updateCells: cells => controller.updateCells(cells),
        focus: () => controller.focus(),
        getBounds: (col, row) => controller.getBounds(col, row),
        scrollTo: (col, row, params) => controller.scrollTo(col, row, params),
        remeasureColumns: cols => controller.remeasureColumns(cols),
        getMouseArgsForPosition: (clientX, clientY, ev) => controller.getMouseArgsForPosition(clientX, clientY, ev),
        appendRow: (col, openOverlay, behavior) => controller.appendRow(col, openOverlay, behavior),
        appendColumn: (row, openOverlay) => controller.appendColumn(row, openOverlay),
        emit: event => controller.emit(event),
        openSearch: () => controller.openSearch(),
        closeSearch: () => controller.closeSearch(),
        setSearchValue: value => controller.setSearchValue(value),
        searchNext: () => controller.searchNext(),
        searchPrev: () => controller.searchPrev(),
        getSearchState: () => controller.getSearchState(),
        getRootElement: () => element
      };
      this.searchApi = api;
      this.args.onReady?.(api);
    } else {
      this.controller.scheduleFullRedraw();
    }
  });
  static {
    setComponentTemplate(precompileTemplate("<div style={{this.containerStyle}} {{this.setupGrid}} ...attributes>\n    {{yield (hash api=this.searchApi searchState=this.searchState)}}\n    {{!-- 4.3. The block renders into a detached node the controller then places inside the\n        scroller, past the last column. The in-element keyword rather than plain markup,\n        because the node has to live somewhere Glimmer did not put it -- see the\n        `rightElementHost` getter for why that distinction is load-bearing.\n\n        NB: a template comment ends at the first closing double-brace, so writing a curly\n        expression inside one silently truncates it and leaks the remainder as text. --}}\n    {{#if (has-block \"rightElement\")}}\n        {{#in-element this.rightElementHost}}{{yield to=\"rightElement\"}}{{/in-element}}\n    {{/if}}\n</div>", {
      strictMode: true,
      scope: () => ({
        hash
      })
    }), this);
  }
}

export { GlideDataGrid as default };
//# sourceMappingURL=glide-data-grid.js.map
