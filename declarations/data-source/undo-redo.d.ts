import type { GridCell, Item } from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";
type GetCellContentFn = (cell: Item) => GridCell;
type OnCellsEditedFn = (edits: readonly CellEdit[]) => void;
/** What {@link UndoRedo.wrap} takes and returns -- the read/write half of any source in this directory. */
export interface UndoRedoWrappable {
    readonly getCellContent: GetCellContentFn;
    readonly onCellsEdited?: OnCellsEditedFn;
}
/** Snapshot of the history's shape, for driving disabled states on Undo/Redo buttons. */
export interface UndoRedoState {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoDepth: number;
    readonly redoDepth: number;
}
export interface UndoRedoOptions {
    /**
     * Called whenever the history changes. Assign the state to a `@tracked` field to make
     * Undo/Redo buttons react -- this class holds no tracked state of its own (see this file's
     * header, divergence 5).
     */
    readonly onHistoryChanged?: (state: UndoRedoState) => void;
    /**
     * Optional damage repaint, straight from `@onReady`'s api (`api.updateCells`).
     *
     * **Only needed for the lazy/untracked data pattern** (`AsyncRecordsSource`, or a hand-written
     * `getCellContent` that reads untracked state). With `recordsSource` the undo's write mutates a
     * tracked field, which invalidates the consumer's `@cached` getter and repaints on its own --
     * and passing `updateCells` there is not merely redundant but *wrong* under an active sort,
     * because the history is in original row space while `updateCells` expects displayed space.
     */
    readonly updateCells?: (cells: readonly {
        cell: Item;
    }[]) => void;
    /**
     * Maximum number of undo steps retained; the oldest is dropped past it. @defaultValue 100
     *
     * Divergence from source, which is unbounded -- see this file's header.
     */
    readonly limit?: number;
}
export declare class UndoRedo {
    private readonly onHistoryChanged;
    private readonly updateCellsFn;
    private readonly limit;
    private readonly undoHistory;
    private readonly redoHistory;
    /**
     * The read/write pair from the most recent {@link wrap} call. Refreshed on every call precisely
     * so a recorded "before" value is never read through a stale projection -- see this file's
     * header.
     */
    private currentGetCellContent;
    private currentOnCellsEdited;
    /**
     * True while a batch is being replayed. Source keeps the same flag (`isApplyingUndo`/
     * `isApplyingRedo`): the replay goes back out through the very `onCellsEdited` being recorded,
     * so without it every undo would push its own edits onto the undo stack and undo would become a
     * no-op that toggles forever.
     */
    private applying;
    /** Memo for {@link wrap}, so a stable input pair yields a stable output object. */
    private lastWrapped;
    private lastWrapInputRead;
    private lastWrapInputWrite;
    constructor(options?: UndoRedoOptions);
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** True while an undo or redo is forwarding its edits to the wrapped source. */
    get isReplaying(): boolean;
    /** The same snapshot `onHistoryChanged` receives, for a consumer that mounts mid-session. */
    get state(): UndoRedoState;
    /**
     * Wraps a source's read/write pair so every edit through it becomes undoable.
     *
     * Call it inside the same `@cached` getter that builds the rest of the grid args, on the
     * **innermost** source (below any sort/reorder decorator -- see this file's header):
     *
     * ```ts
     * const undoable = this.undoRedo.wrap(src);
     * ```
     *
     * `getCellContent` is handed straight back by identity -- this decorator remaps nothing and must
     * not disturb the blit fast path. The returned `onCellsEdited` is a bound instance field, so it
     * is permanently identity-stable regardless of what the input does.
     */
    readonly wrap: (source: UndoRedoWrappable) => UndoRedoWrappable & {
        readonly onCellsEdited: OnCellsEditedFn;
    };
    /**
     * The recording write path. Normally consumed via {@link wrap}; exposed directly for a consumer
     * hand-wiring their own source rather than using one from this directory.
     */
    readonly onCellsEdited: (edits: readonly CellEdit[]) => void;
    /** Undo the most recent batch. No-op when there is nothing to undo. */
    undo(): void;
    /** Redo the most recently undone batch. No-op when there is nothing to redo. */
    redo(): void;
    /** Drop both stacks -- e.g. after loading a different record set, where the history is meaningless. */
    clear(): void;
    /**
     * Keyboard handling for primary+Z / primary+Shift+Z / primary+Y, matching source's bindings.
     * Returns `true` if the event was one of them (in which case `preventDefault` has been called),
     * so a consumer can decide whether to stop propagating it.
     *
     * Wire it wherever suits -- `{{on "keydown"}}` on a wrapper element, or
     * {@link attachKeyboardShortcuts} for source's window-level behaviour. It is deliberately not
     * attached for you: an addon that silently binds a window listener from a constructor has no
     * teardown story, and the grid's own key handling stays in the controller where it belongs.
     */
    readonly handleKeyDown: (ev: KeyboardEvent) => boolean;
    /**
     * Attaches {@link handleKeyDown} to `target` (default `window`, as source does) and returns the
     * teardown. Call the teardown from `willDestroy`.
     */
    attachKeyboardShortcuts(target?: EventTarget): () => void;
    /** Sends a recorded direction back out through the current write path, without re-recording it. */
    private replay;
    private push;
    private notify;
}
export {};
//# sourceMappingURL=undo-redo.d.ts.map