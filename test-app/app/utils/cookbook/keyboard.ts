// 4.6 — the keyboard, and `@keybindings`.
//
// Its own chapter because until 4.6 there was nothing to say: the keys were hardcoded. Now every
// gesture is named, remappable and switchable, which makes "what keys does this grid respond to?" a
// question with a documented answer — and that list is the reason this chapter is mostly a table.
import type { Section } from "./types.ts";

export const keyboardSection: Section = {
    id: "keyboard",
    title: "Keyboard, and remapping keys",
    blocks: [
        {
            kind: "p",
            text: "The grid handles a full set of keyboard gestures out of the box — navigation, selection, editing, clipboard and search. Every one of them is named, and `@keybindings` lets you rebind or switch off any of them individually.",
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @columns={{this.columns}}
  @rows={{this.rows}}
  @getCellContent={{this.getCellContent}}
  @keybindings={{this.keybindings}}
/>

// In your component. \`true\` keeps the default, \`false\` switches the gesture off,
// a string rebinds it. Anything you leave out keeps its default.
keybindings = {
  selectAll: false,               // no Cmd/Ctrl+A
  goDownCell: "ArrowDown|ctrl+j", // keep the arrow, add a vim-ish alias
  search: "primary+shift+f",
};`,
        },
        {
            kind: "p",
            text: "**The binding syntax** is upstream's, so a `keybindings` map written for the React grid transfers unchanged: modifiers joined with `+` and the key last (`ctrl+shift+k`), `|` between alternatives (`ArrowRight|Tab`), `primary` meaning Cmd on macOS and Ctrl elsewhere, `any` to ignore modifiers entirely (`any+Escape`), and a literal space for the space bar (`shift+ `). A key written as `_68` matches the **keyCode** instead of the character, which is what survives a keyboard layout where alt+d types `∂`.",
        },
        {
            kind: "note",
            text: "Modifiers are matched **exactly**. `ArrowDown` does not fire when shift is held — that is what keeps `goDownCell` and `selectGrowDown` from both running on one keypress. If you rebind something and it seems dead, check you have not written a binding that a more specific one already claims.",
        },
        {
            kind: "p",
            text: "**The defaults**, which are also the full list of what the keyboard does:",
        },
        {
            kind: "table",
            head: ["Binding", "Default", "What it does"],
            rows: [
                ["`goUpCell` / `goDownCell`", "`ArrowUp` / `ArrowDown`", "Move the cursor a row"],
                [
                    "`goLeftCell` / `goRightCell`",
                    "`ArrowLeft|shift+Tab` / `ArrowRight|Tab`",
                    "Move a column. Tab is an alias, so tabbing walks the row",
                ],
                [
                    "`go*CellRetainSelection`",
                    "`alt+Arrow*`",
                    "Move the cursor **without** collapsing the selection — the old range stays selected",
                ],
                [
                    "`goToFirstColumn` / `goToLastColumn`",
                    "`Home|primary+ArrowLeft` / `End|primary+ArrowRight`",
                    "Jump to the row's first/last cell",
                ],
                [
                    "`goToFirstRow` / `goToLastRow`",
                    "`primary+ArrowUp` / `primary+ArrowDown`",
                    "Jump to the column's first/last row",
                ],
                [
                    "`goToFirstCell` / `goToLastCell`",
                    "`primary+Home` / `primary+End`",
                    "Jump to the corner of the grid",
                ],
                ["`goToPreviousPage` / `goToNextPage`", "`PageUp` / `PageDown`", "Move by a visible page"],
                ["`selectGrow*`", "`shift+Arrow*`", "Grow or shrink the selected range"],
                ["`selectTo*`", "`primary+shift+Arrow*`, `primary+shift+Home/End`", "Extend the selection to an edge"],
                ["`selectAll`", "`primary+a`", "Select every cell"],
                [
                    "`selectRow` / `selectColumn`",
                    "`shift+ ` / `ctrl+ `",
                    "Toggle the current row/column's selection. Needs `@rowSelect` / `@columnSelect`",
                ],
                [
                    "`activateCell`",
                    "` |Enter|shift+Enter`",
                    "Open the editor, toggle a boolean, or append a row on the trailing blank row",
                ],
                ["`delete`", "`Delete` (`Backspace|Delete` on macOS)", "Clear the selected cells"],
                ["`clear`", "`any+Escape`", "Clear the selection, and fire `@onSelectionCleared`"],
                ["`search`", "`primary+f`", "Toggle the search bar"],
                ["`scrollToSelectedCell`", "`primary+Enter`", "Scroll the selection back into view without moving it"],
            ],
        },
        {
            kind: "list",
            items: [
                "**Typing a printable character** opens the editor seeded with that character. It is not a binding — it is whatever is left after every binding has had its chance, so a rebinding always wins over it. Switch it off with `@editOnType={{false}}`.",
                "**Copy, cut and paste** are native clipboard events rather than keybindings, so they are not in the table and cannot be rebound. Gate them with `@onPaste` and `@copyHeaders` instead.",
                "A nav key that hits a wall is deliberately **not** swallowed, so Tab at the last column moves focus out of the grid. `@trapFocus={{true}}` keeps it in.",
                "Upstream's `downFill` / `rightFill` bindings are absent here: this port has no keyboard fill command (the fill handle is a mouse gesture), and they are off by default upstream too.",
            ],
        },
        {
            kind: "p",
            text: "**A cell type can intercept its own selection.** A custom renderer's `onSelect` runs when a click is about to move the selection onto one of its cells, and `preventDefault()` refuses the move — the only thing in the grid that can. It fires only when the click lands on a *different* cell than the current one, and only from a click, never from keyboard navigation.",
        },
        {
            kind: "code",
            text: `const lockedRenderer = {
  ...starCellRenderer,
  onSelect: args => {
    if (args.shiftKey) return;   // still reachable deliberately
    args.preventDefault();       // a plain click cannot select this cell
  },
};

// Pass it through @extraCells, ahead of the renderer it replaces.`,
        },
        {
            kind: "note",
            text: "Swap a renderer **by identity**, not by `kind`: every custom renderer carries `kind: GridCellKind.Custom`, and dispatch picks the first whose `isMatch` accepts the cell. Filtering on `kind` removes nothing and leaves the original ahead of your replacement — a wrapper that never runs.",
        },
        {
            kind: "p",
            text: "The **Full grid demo**'s `Keys:` toggle cycles the default map, a remap of vertical movement onto ctrl+j / ctrl+k, and a restricted map with select-all and the page keys switched off. Its `Select hook:` toggle wraps the Rating column's renderer with the `onSelect` above.",
        },
    ],
};
