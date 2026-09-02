import { browserIsOSX } from './common/browser-detect.js';

/**
 * 4.6 — the configurable keybinding map. Port of source's `data-editor/data-editor-keybindings.ts`.
 *
 * Every keyboard gesture the grid handles is named here and can be remapped or switched off through
 * `@keybindings`. A value of `true` keeps the default binding, `false` disables the gesture
 * entirely, and a string replaces it using the syntax in `is-hotkey.ts`.
 *
 * **Only the bindings this port implements are listed.** Source's map also carries `downFill`,
 * `rightFill` and the four `acceptOverlay*` entries; the fills are omitted because this port has no
 * keyboard fill command to bind them to (the fill handle is a mouse gesture here — 9h), and the
 * overlay-accept keys are omitted because this port's overlay editor owns its own `keydown`
 * listener and never routes through this map. Adding an entry that nothing reads would be worse
 * than its absence: it would look configurable and silently do nothing.
 *
 * The back-compat aliases source keeps (`pageUp`/`pageDown`/`first`/`last`, superseded by
 * `goToNextPage`/`goToPreviousPage`/`goToFirstCell`/`goToLastCell`) are not ported either — they
 * exist upstream to avoid breaking an older release of a library this port has never shipped.
 */


/** `true` keeps the default, `false` disables the gesture, a string rebinds it. */

/** Every binding resolved to a hotkey string. `""` means the gesture is off. */

const keybindingDefaults = {
  clear: true,
  // `false` upstream. The one default this port changes — see `resolveKeybindings`.
  search: true,
  delete: true,
  activateCell: true,
  scrollToSelectedCell: true,
  goToFirstCell: true,
  goToFirstColumn: true,
  goToFirstRow: true,
  goToLastCell: true,
  goToLastColumn: true,
  goToLastRow: true,
  goToNextPage: true,
  goToPreviousPage: true,
  selectToFirstCell: true,
  selectToFirstColumn: true,
  selectToFirstRow: true,
  selectToLastCell: true,
  selectToLastColumn: true,
  selectToLastRow: true,
  selectAll: true,
  selectRow: true,
  selectColumn: true,
  goUpCell: true,
  goRightCell: true,
  goDownCell: true,
  goLeftCell: true,
  goUpCellRetainSelection: true,
  goRightCellRetainSelection: true,
  goDownCellRetainSelection: true,
  goLeftCellRetainSelection: true,
  selectGrowUp: true,
  selectGrowRight: true,
  selectGrowDown: true,
  selectGrowLeft: true
};
function realizeKeybind(keybind, defaultVal) {
  if (keybind === true) return defaultVal;
  if (keybind === false) return "";
  return keybind;
}

/**
 * Resolve a full `Keybinds` map to hotkey strings. Every default here is source's, character for
 * character — including `search` defaulting to **off** upstream, which this port overrides one level
 * up (see `resolveKeybindings`).
 */
function realizeKeybinds(keybinds) {
  const isOSX = browserIsOSX.value;
  return {
    activateCell: realizeKeybind(keybinds.activateCell, " |Enter|shift+Enter"),
    clear: realizeKeybind(keybinds.clear, "any+Escape"),
    delete: realizeKeybind(keybinds.delete, isOSX ? "Backspace|Delete" : "Delete"),
    scrollToSelectedCell: realizeKeybind(keybinds.scrollToSelectedCell, "primary+Enter"),
    goDownCell: realizeKeybind(keybinds.goDownCell, "ArrowDown"),
    goDownCellRetainSelection: realizeKeybind(keybinds.goDownCellRetainSelection, "alt+ArrowDown"),
    goLeftCell: realizeKeybind(keybinds.goLeftCell, "ArrowLeft|shift+Tab"),
    goLeftCellRetainSelection: realizeKeybind(keybinds.goLeftCellRetainSelection, "alt+ArrowLeft"),
    goRightCell: realizeKeybind(keybinds.goRightCell, "ArrowRight|Tab"),
    goRightCellRetainSelection: realizeKeybind(keybinds.goRightCellRetainSelection, "alt+ArrowRight"),
    goUpCell: realizeKeybind(keybinds.goUpCell, "ArrowUp"),
    goUpCellRetainSelection: realizeKeybind(keybinds.goUpCellRetainSelection, "alt+ArrowUp"),
    goToFirstCell: realizeKeybind(keybinds.goToFirstCell, "primary+Home"),
    goToFirstColumn: realizeKeybind(keybinds.goToFirstColumn, "Home|primary+ArrowLeft"),
    goToFirstRow: realizeKeybind(keybinds.goToFirstRow, "primary+ArrowUp"),
    goToLastCell: realizeKeybind(keybinds.goToLastCell, "primary+End"),
    goToLastColumn: realizeKeybind(keybinds.goToLastColumn, "End|primary+ArrowRight"),
    goToLastRow: realizeKeybind(keybinds.goToLastRow, "primary+ArrowDown"),
    goToNextPage: realizeKeybind(keybinds.goToNextPage, "PageDown"),
    goToPreviousPage: realizeKeybind(keybinds.goToPreviousPage, "PageUp"),
    search: realizeKeybind(keybinds.search, "primary+f"),
    selectAll: realizeKeybind(keybinds.selectAll, "primary+a"),
    selectColumn: realizeKeybind(keybinds.selectColumn, "ctrl+ "),
    selectGrowDown: realizeKeybind(keybinds.selectGrowDown, "shift+ArrowDown"),
    selectGrowLeft: realizeKeybind(keybinds.selectGrowLeft, "shift+ArrowLeft"),
    selectGrowRight: realizeKeybind(keybinds.selectGrowRight, "shift+ArrowRight"),
    selectGrowUp: realizeKeybind(keybinds.selectGrowUp, "shift+ArrowUp"),
    selectRow: realizeKeybind(keybinds.selectRow, "shift+ "),
    selectToFirstCell: realizeKeybind(keybinds.selectToFirstCell, "primary+shift+Home"),
    selectToFirstColumn: realizeKeybind(keybinds.selectToFirstColumn, "primary+shift+ArrowLeft"),
    selectToFirstRow: realizeKeybind(keybinds.selectToFirstRow, "primary+shift+ArrowUp"),
    selectToLastCell: realizeKeybind(keybinds.selectToLastCell, "primary+shift+End"),
    selectToLastColumn: realizeKeybind(keybinds.selectToLastColumn, "primary+shift+ArrowRight"),
    selectToLastRow: realizeKeybind(keybinds.selectToLastRow, "primary+shift+ArrowDown")
  };
}

/**
 * Apply a consumer's partial map over the defaults.
 *
 * **One default differs from source, deliberately:** `search` is `true` here and `false` upstream.
 * Source ships the search *bar* as part of its own component and gates the shortcut behind a prop;
 * this port has had Cmd/Ctrl+F working since 9e, and flipping it off as a side effect of making the
 * map configurable would be a silent regression for every existing consumer. Pass
 * `@keybindings={{hash search=false}}` for upstream's behaviour.
 */
function resolveKeybindings(overrides) {
  if (overrides === undefined) return realizeKeybinds(keybindingDefaults);
  return realizeKeybinds({
    ...keybindingDefaults,
    ...overrides
  });
}

export { keybindingDefaults, realizeKeybinds, resolveKeybindings };
//# sourceMappingURL=keybindings.js.map
