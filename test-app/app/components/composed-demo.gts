// The three composable data-source hooks (backlog 9j), driven **together** — because composability
// is their entire design premise, and a hook demoed alone proves the easy half.
//
//   `withMovableColumns`   remaps COLUMNS   (and translates the write path back)
//   `withCollapsingGroups` remaps NOTHING   (it shrinks widths; see its header — that is a finding)
//   `UndoRedo`             remaps NOTHING   (but has a placement requirement, which is the same
//                                            contract seen from the other side)
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS DEMO EXISTS TO PROVE
// ---------------------------------------------------------------------------------------------
// Not "the hooks run". The claim under test is the **decorator coordinate contract**:
//
//     After you have reordered the columns and collapsed a group, an edit typed into whatever cell
//     is now under the pointer still lands on the field that cell displays.
//
// That is the failure mode Phase 8a exists to remove, and it is invisible by construction: a
// mis-translated column index writes a perfectly valid value into a perfectly valid field, so
// nothing throws, nothing looks wrong, and you find out at the next reorder. So the status line
// below prints **both** coordinate spaces for every edit — the displayed column the grid reported,
// and the natural column + field name the decorators translated it into. If those two ever name
// different-looking things (edit the "Salary" column, see `role` written), the contract is broken.
//
// The fixture is built for that check: every column holds visibly different-shaped data
// (see `app/utils/composed-records.ts`), so a wrong field is obvious rather than merely true.
//
// ---------------------------------------------------------------------------------------------
// THE COMPOSITION ORDER IS LOAD-BEARING — read `undo-redo.ts`'s header before changing it
// ---------------------------------------------------------------------------------------------
// `UndoRedo.wrap()` goes on the **innermost** source, below every remapping decorator, so the
// history is recorded in natural record/field space and stays valid across a reorder. Wrap it the
// other way round and an undo performed after the user drags a column writes the old value into
// whatever field now sits at that screen position — the same data-corruption class, one layer up.
//
// Reading order of one edit, top to bottom:
//
//     grid  →  this.handleCellsEdited   (records the DISPLAYED location, for the status line)
//           →  movable.onCellsEdited    (displayed column → natural column)
//           →  undoable.onCellsEdited   (records before/after, in natural space)
//           →  src.onCellsEdited        (recordsSource resolves records[row])
//           →  this.applyEdit           (writes the tracked field; builds the status line)
//
// ---------------------------------------------------------------------------------------------
// IDENTITY STABILITY
// ---------------------------------------------------------------------------------------------
// Every callback here is a class-field arrow (never `@action`), the columns array and the projection
// live at module scope, and the whole composition sits in ONE `@cached` getter. All three decorators
// memoize internally and hand back the caller's own `columns`/`getCellContent` when nothing is
// reordered or collapsed — so on a grid nobody has touched yet, the scroll blit fast path sees the
// exact same object identities it would with no decorators at all.
import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import {
    recordsSource,
    withCollapsingGroups,
    withMovableColumns,
    UndoRedo,
    type UndoRedoState,
} from "glide-data-grid-ember/data-source/index";
import { getCellRenderer, GridCellKind, type GridCell, type Item } from "glide-data-grid-ember/rendering/index";
import {
    applyStaffEdit,
    buildStaff,
    COMPOSED_COLUMNS,
    COMPOSED_GROUPS,
    staffToCell,
    type Staffer,
} from "test-app/utils/composed-records";

const EMPTY_HISTORY: UndoRedoState = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };

/** What `handleCellsEdited` saw, held until `applyEdit` can pair it with the translated coordinates. */
interface PendingEdit {
    readonly displayedCol: number;
    readonly displayedTitle: string;
    readonly row: number;
    readonly batchSize: number;
    consumed: boolean;
}

function describeValue(value: GridCell): string {
    switch (value.kind) {
        case GridCellKind.Text:
            return JSON.stringify(value.data);
        case GridCellKind.Number:
            return String(value.data ?? "");
        case GridCellKind.Boolean:
            return String(value.data);
        default:
            return value.kind;
    }
}

export default class ComposedDemo extends Component {
    /** Replaced, never mutated — `recordsSource` treats membership as immutable. */
    @tracked records: readonly Staffer[] = buildStaff();

    // --- the three pieces of consumer-owned decorator state ----------------------------------
    //
    // All three hooks are pure functions of state the *consumer* holds, rather than hooks that hide
    // state internally the way their React originals do. That is not a porting shortcut: a plain
    // function has nowhere to keep state that Ember's autotracking would notice, so hidden state
    // would simply never repaint the grid. Both headers spell this out.

    /** `withMovableColumns` order, as `columnOrderKey` values. `undefined` = natural order. */
    @tracked columnOrder: readonly string[] | undefined = undefined;
    /** `withCollapsingGroups` collapsed set, as group names. */
    @tracked collapsedGroups: readonly string[] = [];
    /** `UndoRedo` history shape. The class holds no tracked state of its own, by design. */
    @tracked history: UndoRedoState = EMPTY_HISTORY;

    /** Human-readable proof of where the last edit landed. */
    @tracked lastEdit = "— no edits yet —";

    /**
     * Constructed once and held, like `AsyncRecordsSource` — it owns two stacks. Its `wrap()` is
     * called per-render from `gridArgs` below, which is what stops it ever holding a stale
     * `getCellContent` (see its header; that footgun is structurally removed rather than documented).
     */
    private readonly undoRedo = new UndoRedo({
        onHistoryChanged: (state: UndoRedoState): void => {
            this.history = state;
        },
    });

    /** Set while `undo()`/`redo()` is replaying, so `applyEdit` can label the message correctly. */
    private replaying: "Undo" | "Redo" | undefined;
    private pending: PendingEdit | undefined;

    setColumnOrder = (order: readonly string[]): void => {
        this.columnOrder = order;
    };

    setCollapsed = (collapsed: readonly string[]): void => {
        this.collapsedGroups = collapsed;
    };

    /**
     * The single composition. Everything about the coordinate contract is decided by the order of
     * these four lines — see this file's header.
     *
     * `@cached` is not style here: `recordsSource` projects every record *during* this getter, and
     * that eager read is what registers the records' tracked fields as dependencies of the frame that
     * repaints the canvas.
     */
    @cached
    get gridArgs() {
        const src = recordsSource({
            records: this.records,
            columns: COMPOSED_COLUMNS,
            toCell: staffToCell,
            onCellEdited: this.applyEdit,
        });

        // 1. Innermost: undo/redo records in natural record + natural column space.
        const undoable = this.undoRedo.wrap(src);

        // 2. Column reorder. Takes the undo-wrapped write path in, hands a translated one back out.
        const movable = withMovableColumns({
            columns: src.columns,
            getCellContent: undoable.getCellContent,
            onCellsEdited: undoable.onCellsEdited,
            order: this.columnOrder,
            onOrderChange: this.setColumnOrder,
        });

        // 3. Group collapse. Remaps nothing — it only shrinks widths — so it takes `columns` and
        //    `onSelectionChanged` and touches neither the read nor the write path.
        const collapsing = withCollapsingGroups({
            columns: movable.columns,
            collapsed: this.collapsedGroups,
            onCollapsedChange: this.setCollapsed,
            // NOTE: no `rowMarkerOffset`. `@onSelectionChanged` reports the consumer's own column
            // space as of 2026-08-09, the same as every other callback, so the default of 0 is
            // correct even with `@rowMarkers` on. Passing 1 would expand the group one column to the
            // left of the one you clicked.
        });

        return { ...src, ...undoable, ...movable, ...collapsing };
    }

    /**
     * Outermost write path — purely instrumentation. It records what the *grid* reported (displayed
     * coordinates) and then hands the batch straight to the composed handler, which is what actually
     * translates and applies it.
     *
     * A class-field arrow, so its identity never churns; it reads `this.gridArgs` at call time rather
     * than capturing it, which is safe because this runs from an event, not from a tracking frame.
     */
    handleCellsEdited = (edits: readonly { location: Item; value: GridCell }[]): void => {
        const first = edits[0];
        if (first !== undefined) {
            const [displayedCol, row] = first.location;
            this.pending = {
                displayedCol,
                displayedTitle: this.gridArgs.columns[displayedCol]?.title ?? "?",
                row,
                batchSize: edits.length,
                consumed: false,
            };
        }
        this.gridArgs.onCellsEdited?.(edits);
        this.pending = undefined;
    };

    /**
     * The innermost write. `col` is a **natural** column index: by the time this runs,
     * `withMovableColumns` has already translated the displayed one the grid reported.
     */
    applyEdit = (record: Staffer, col: number, value: GridCell): void => {
        const who = record.name; // captured first — editing column 0 changes it
        const field = applyStaffEdit(record, col, value);

        if (this.replaying !== undefined) {
            this.lastEdit = `${this.replaying}: restored \`${field}\` on ${who} → ${describeValue(value)}`;
            return;
        }
        const pending = this.pending;
        if (pending === undefined || pending.consumed) return;
        pending.consumed = true;
        const batch = pending.batchSize > 1 ? ` (batch of ${pending.batchSize}, first shown)` : "";
        this.lastEdit =
            `Grid reported displayed column ${pending.displayedCol} ("${pending.displayedTitle}"), row ${pending.row}` +
            ` → decorators translated it to natural column ${col}, field \`${field}\`` +
            ` on ${who} = ${describeValue(value)}${batch}`;
    };

    undo = (): void => {
        this.replaying = "Undo";
        try {
            this.undoRedo.undo();
        } finally {
            this.replaying = undefined;
        }
    };

    redo = (): void => {
        this.replaying = "Redo";
        try {
            this.undoRedo.redo();
        } finally {
            this.replaying = undefined;
        }
    };

    clearHistory = (): void => {
        this.undoRedo.clear();
        this.lastEdit = "— history cleared —";
    };

    toggleGroup = (group: string): void => {
        this.gridArgs.toggleGroup(group);
    };

    resetOrder = (): void => {
        this.columnOrder = undefined;
    };

    reverseOrder = (): void => {
        // Deliberately *not* a drag: it proves the order really is consumer state, settable from
        // anywhere, and that a reorder applied programmatically translates edits identically.
        this.columnOrder = [...this.gridArgs.columns].reverse().map(c => c.id ?? `${c.group ?? ""}/${c.title}`);
    };

    /** Group name + collapsed flag, for the chrome's toggles. */
    get groupStates(): readonly { name: string; collapsed: boolean }[] {
        return COMPOSED_GROUPS.map(name => ({ name, collapsed: this.collapsedGroups.includes(name) }));
    }

    /** The current display order as titles, so a reorder is visible without reading the canvas. */
    get displayOrder(): string {
        return this.gridArgs.columns.map(c => c.title).join(" · ");
    }

    get isNaturalOrder(): boolean {
        return this.columnOrder === undefined;
    }

    get cannotUndo(): boolean {
        return !this.history.canUndo;
    }

    get cannotRedo(): boolean {
        return !this.history.canRedo;
    }

    <template>
        <div style="display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: auto;">
            <p style="margin: 0; font: 13px system-ui; color: #444; max-width: 72ch;">
                Three composable data-source hooks stacked on one
                <code>recordsSource</code>:
                <strong>withMovableColumns</strong>
                (drag a column header),
                <strong>withCollapsingGroups</strong>
                (click a group header, or the buttons below) and
                <strong>UndoRedo</strong>. The point is the line at the bottom: reorder the columns, collapse a group,
                then edit any cell — the edit is reported in
                <em>displayed</em>
                coordinates and lands in
                <em>natural</em>
                ones, and both are printed so a mistranslation would be visible rather than silent.
            </p>

            <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font: 13px system-ui;">
                <button
                    class="btn btn-xs"
                    type="button"
                    data-test-composed-undo
                    disabled={{this.cannotUndo}}
                    {{on "click" this.undo}}
                >
                    Undo
                </button>
                <button
                    class="btn btn-xs"
                    type="button"
                    data-test-composed-redo
                    disabled={{this.cannotRedo}}
                    {{on "click" this.redo}}
                >
                    Redo
                </button>
                <span data-test-composed-depth style="color: #555;">
                    undo stack
                    {{this.history.undoDepth}}
                    · redo stack
                    {{this.history.redoDepth}}
                </span>
                <button class="btn btn-xs btn-ghost" type="button" {{on "click" this.clearHistory}}>
                    Clear history
                </button>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font: 13px system-ui;">
                <span style="color: #555;">Collapse group:</span>
                {{#each this.groupStates as |g|}}
                    <button
                        class="btn btn-xs {{if g.collapsed 'btn-active'}}"
                        type="button"
                        data-test-composed-group={{g.name}}
                        {{on "click" (fn this.toggleGroup g.name)}}
                    >
                        {{g.name}}
                        {{if g.collapsed "▸" "▾"}}
                    </button>
                {{/each}}
                <span style="color: #bbb;">|</span>
                <button
                    class="btn btn-xs btn-ghost"
                    type="button"
                    data-test-composed-reverse
                    {{on "click" this.reverseOrder}}
                >
                    Reverse column order
                </button>
                <button
                    class="btn btn-xs btn-ghost"
                    type="button"
                    data-test-composed-reset-order
                    disabled={{this.isNaturalOrder}}
                    {{on "click" this.resetOrder}}
                >
                    Reset order
                </button>
            </div>

            <p data-test-composed-order style="margin: 0; font: 12px ui-monospace, monospace; color: #666;">
                display order:
                {{this.displayOrder}}
            </p>

            <div style="flex: 1 1 auto; min-height: 320px;">
                <GlideDataGrid
                    @columns={{this.gridArgs.columns}}
                    @rows={{this.gridArgs.rows}}
                    @getCellContent={{this.gridArgs.getCellContent}}
                    @getCellRenderer={{getCellRenderer}}
                    @onCellsEdited={{this.handleCellsEdited}}
                    @onColumnMoved={{this.gridArgs.onColumnMoved}}
                    @onGroupHeaderClicked={{this.gridArgs.onGroupHeaderClicked}}
                    @onSelectionChanged={{this.gridArgs.onSelectionChanged}}
                    @rowMarkers="both"
                    @rowSelect="multi"
                    @rangeSelect="rect"
                    @getCellsForSelection={{true}}
                />
            </div>

            <p data-test-composed-last-edit style="margin: 0; font: 12px ui-monospace, monospace; color: #0a7;">
                {{this.lastEdit}}
            </p>
        </div>
    </template>
}
