// Backlog 9j's three composable data-source hooks, as a recipe.
//
// It sits immediately after the sorting chapter on purpose: sorting is where the coordinate contract
// is first stated, and this chapter is that same contract applied three more times. The chapter does
// not restate the mechanism — it points at the sorting chapter and at Guide 7 — because there is
// exactly one copy of everything.
import type { Section } from "./types.ts";

export const composingSection: Section = {
    id: "composing",
    title: "Composing data-source hooks",
    blocks: [
        {
            kind: "p",
            text: "`withColumnSort` is one of five things in `glide-data-grid-ember/data-source/index`, and they are all designed to **stack**. Each takes a props object and returns fields named exactly like `<GlideDataGrid>`'s args, so composing them is object spread and wiring them is `{{! }}` one attribute each.",
        },
        {
            kind: "table",
            head: ["Hook", "What it remaps", "State it needs from you"],
            rows: [
                ["`recordsSource`", "nothing — it *is* the source", "your records array"],
                ["`withColumnSort`", "**rows**, read and write", "`sort`"],
                ["`withMovableColumns`", "**columns**, read and write", "`order` (an array of column keys)"],
                ["`withCollapsingGroups`", "nothing — it shrinks widths", "`collapsed` (an array of group names)"],
                ["`UndoRedo`", "nothing — but see the placement rule below", "nothing; it owns its stacks"],
            ],
        },
        {
            kind: "code",
            text: `import {
  recordsSource, withMovableColumns, withCollapsingGroups, UndoRedo,
} from "glide-data-grid-ember/data-source/index";

@tracked columnOrder = undefined;      // readonly string[] | undefined
@tracked collapsedGroups = [];         // readonly string[]
@tracked history = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };

undoRedo = new UndoRedo({ onHistoryChanged: s => (this.history = s) });

@cached
get gridArgs() {
  const src = recordsSource({ records: this.staff, columns: COLUMNS, toCell, onCellEdited: this.applyEdit });

  const undoable = this.undoRedo.wrap(src);                 // 1. innermost

  const movable = withMovableColumns({                      // 2. remaps columns
    columns: src.columns,
    getCellContent: undoable.getCellContent,
    onCellsEdited: undoable.onCellsEdited,
    order: this.columnOrder,
    onOrderChange: o => (this.columnOrder = o),
  });

  const collapsing = withCollapsingGroups({                  // 3. shrinks widths only
    columns: movable.columns,
    collapsed: this.collapsedGroups,
    onCollapsedChange: c => (this.collapsedGroups = c),
  });

  return { ...src, ...undoable, ...movable, ...collapsing };
}`,
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @columns={{this.gridArgs.columns}}
  @rows={{this.gridArgs.rows}}
  @getCellContent={{this.gridArgs.getCellContent}}
  @onCellsEdited={{this.gridArgs.onCellsEdited}}
  @onColumnMoved={{this.gridArgs.onColumnMoved}}            {{! enables the reorder drag }}
  @onGroupHeaderClicked={{this.gridArgs.onGroupHeaderClicked}}
  @onSelectionChanged={{this.gridArgs.onSelectionChanged}}
  ...
/>`,
        },
        {
            kind: "note",
            text: "**Order matters, and getting it wrong corrupts data silently.** Wrap `UndoRedo` around the **innermost** source, below every row/column-remapping hook. Then the history is recorded in your own record-and-field space and survives a re-sort or a reorder. Wrap it the other way round and it records *screen* coordinates — so an undo performed after the user drags a column writes the old value into whatever field now sits at that position. Nothing throws; you find out later.",
        },
        {
            kind: "p",
            text: "**The state is yours, deliberately.** The React originals hide `order` / `collapsed` in a `useState`; a plain function has no equivalent hiding place here, and hidden state that Ember's autotracking never sees would simply never repaint the canvas. So each hook is a pure, memoizable function of a `@tracked` field you own — which is also what makes a column order persistable to `localStorage`.",
        },
        {
            kind: "list",
            items: [
                "`withMovableColumns` expresses order as **column keys** (`id`, falling back to `\"<group>/<title>\"`), not indices — give every column an `id`. Keys naming columns that no longer exist are ignored, and a column missing from a saved order is slotted in beside its left-hand neighbour rather than dumped at one end. Export `columnOrderKey` if you need to build the initial value: `columns.map(columnOrderKey)`.",
                "`withCollapsingGroups` needs columns with `group` set — grouping is driven entirely by that field. It **remaps nothing**: collapsing shrinks a run of columns to 8px slivers, so every column keeps its index and there is no write path to translate. It also expands a collapsed group when the selection lands inside it, which is why you wire its `onSelectionChanged` rather than your own.",
                "`UndoRedo` is a class you construct once, like `AsyncRecordsSource`, because it owns two stacks. Call `wrap()` from inside the same `@cached` getter — **not** from the constructor: `recordsSource` hands back a fresh `getCellContent` every time the data changes, and one captured at construction time would make undo write values that were current when the grid was built.",
                "`UndoRedo` holds no tracked state (the whole data-source layer is Ember-free below `recordsSource`), so drive your buttons from `onHistoryChanged` into a `@tracked` field. `handleKeyDown` / `attachKeyboardShortcuts()` give you primary+Z, primary+Shift+Z and primary+Y; nothing is bound for you.",
                "One `@onCellsEdited` call is one undo step. A paste, a fill-handle drag and a delete-over-a-range each arrive as a single batch, so they each undo in one go.",
            ],
        },
        {
            kind: "p",
            text: "The **Composed hooks** tab runs all three at once and prints both coordinate spaces for every edit — the displayed column the grid reported, and the natural column and field name the hooks translated it into. Reorder the columns, collapse a group, then edit a cell: those two lines are the contract, on screen.",
        },
    ],
};
