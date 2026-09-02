// Undo / redo over cell edits -- backlog item 9j of the Ember port.
//
// Port of source's `packages/source/src/use-undo-redo.ts`. Every edit that passes through is
// recorded together with the values it replaced; undo replays the old values back through the same
// write path, redo replays the new ones.
//
// -------------------------------------------------------------------------------------------
// WHY THIS IS A CLASS WITH A `wrap()` METHOD, AND NOT A `withX()` FUNCTION
// -------------------------------------------------------------------------------------------
//
// Every other decorator in this directory is a pure function memoized on its inputs, because it owns
// no state. This one owns two stacks, so -- like `AsyncRecordsSource` -- it is an object the consumer
// constructs once and holds:
//
//     undoRedo = new UndoRedo({ onHistoryChanged: s => (this.history = s) });   // a class field
//
// But it cannot be *only* a constructor, and that is the interesting part. Recording an edit means
// reading the value the cell holds **right now**, and `recordsSource` hands back a **new**
// `getCellContent` closure every time the data changes -- each one capturing that call's
// projections. A `getCellContent` captured once in the constructor is therefore a snapshot: it would
// keep reporting the data as it stood when the grid was built, and undo would silently write stale
// values back. (Source dodges this because React re-invokes the hook with fresh props on every
// render; there is no equivalent here.)
//
// So the read/write pair is supplied **per call** through {@link UndoRedo.wrap}, which the consumer
// invokes from the same `@cached` getter that builds the rest of the grid args. The instance always
// holds the current pair, and the class holds the history. The footgun is structurally removed
// rather than documented.
//
// -------------------------------------------------------------------------------------------
// WHERE IT SITS IN THE STACK -- the coordinate contract, stated for this decorator
// -------------------------------------------------------------------------------------------
//
// It remaps nothing, so it has nothing to translate. What it *does* have is a placement requirement,
// which is the same contract seen from the other side: **wrap the innermost source, below any
// row/column-remapping decorator.**
//
//     @cached get gridArgs() {
//         const src = recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited });
//         const undoable = this.undoRedo.wrap(src);
//         return { ...src, ...undoable, ...withColumnSort({ ...src, ...undoable, sort: this.sort }) };
//     }
//
// `withColumnSort` translates displayed -> original *before* the edit reaches `undoable`, so the
// history is recorded in original record space and stays valid across a re-sort. Wrapping the other
// way round records displayed coordinates, and an undo after the user re-sorts then writes to
// whatever record happens to sit at that screen row now -- the exact data-corruption class Phase 8
// exists to remove, reintroduced one layer up.
//
// -------------------------------------------------------------------------------------------
// DELIBERATE DIVERGENCES FROM SOURCE
// -------------------------------------------------------------------------------------------
//
//  1. **No `setTimeout(0)` batching.** Source coalesces edits into one undo step with a zero
//     timeout, because its `onCellEdited` fires once *per cell* and a paste therefore arrives as a
//     burst of separate calls. This addon's `@onCellsEdited` already delivers a paste (and a fill,
//     and a cut-clear) as one batch -- that is an explicit contract of `GridHostArgs`. One call is
//     one undo step: no timer, no event-loop dependency, and the whole class is testable in bare
//     Node without fake timers.
//  2. **Each batch stores BOTH directions, captured once at record time.** Source re-reads the
//     grid's current values when replaying, from inside a React effect that is guaranteed to run
//     after a re-render. Nothing guarantees that here -- two `undo()` calls in one turn would have
//     the second one read through a `getCellContent` from before the first, and push a wrong entry
//     onto the redo stack. Storing the before/after pair up front means replaying reads nothing at
//     all, so the whole staleness class is gone rather than merely unlikely.
//  3. **No selection capture or restore.** Source stores the `GridSelection` with each batch and
//     restores it on undo, which it can only do because `DataEditor` accepts a *controlled*
//     `gridSelection`. This addon's selection is uncontrolled (`grid-host-controller.ts`:
//     "there is no `GridHostArgs.selection` prop yet"), so there is nothing to restore it through.
//     Capturing a selection that can never be applied would be dead weight; when a controlled
//     selection arg lands, adding it here is additive. See the 9j report.
//  4. **A bounded history** ({@link UndoRedoOptions.limit}). Source's stacks are unbounded, which is
//     survivable in a React page that unmounts; an Ember service-scoped instance can outlive many
//     grids, and each entry retains two `GridCell`s per edited cell.
//  5. **`canUndo`/`canRedo` are plain getters plus an `onHistoryChanged` callback**, not `@tracked`
//     fields. This directory is deliberately free of Ember imports below `records-source.ts`'s one
//     tracking primitive -- it is what lets the whole layer run in bare-Node vitest. The callback is
//     the same shape `@onSearchStateChange` uses (Phase 9e) for exactly the same reason: the
//     consumer assigns it to their own `@tracked` field and templates react normally.

/** What {@link UndoRedo.wrap} takes and returns -- the read/write half of any source in this directory. */

/** Snapshot of the history's shape, for driving disabled states on Undo/Redo buttons. */

/**
 * One undoable step, holding both directions so replaying reads nothing (divergence 2).
 *
 * `before` and `after` cover the same locations in the same order; only the values differ.
 */

const DEFAULT_LIMIT = 100;
class UndoRedo {
  onHistoryChanged;
  updateCellsFn;
  limit;
  undoHistory = [];
  redoHistory = [];

  /**
   * The read/write pair from the most recent {@link wrap} call. Refreshed on every call precisely
   * so a recorded "before" value is never read through a stale projection -- see this file's
   * header.
   */
  currentGetCellContent;
  currentOnCellsEdited;

  /**
   * True while a batch is being replayed. Source keeps the same flag (`isApplyingUndo`/
   * `isApplyingRedo`): the replay goes back out through the very `onCellsEdited` being recorded,
   * so without it every undo would push its own edits onto the undo stack and undo would become a
   * no-op that toggles forever.
   */
  applying = false;

  /** Memo for {@link wrap}, so a stable input pair yields a stable output object. */
  lastWrapped;
  lastWrapInputRead;
  lastWrapInputWrite;
  constructor(options = {}) {
    this.onHistoryChanged = options.onHistoryChanged;
    this.updateCellsFn = options.updateCells;
    this.limit = Math.max(options.limit ?? DEFAULT_LIMIT, 1);
  }
  get canUndo() {
    return this.undoHistory.length > 0;
  }
  get canRedo() {
    return this.redoHistory.length > 0;
  }

  /** True while an undo or redo is forwarding its edits to the wrapped source. */
  get isReplaying() {
    return this.applying;
  }

  /** The same snapshot `onHistoryChanged` receives, for a consumer that mounts mid-session. */
  get state() {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoDepth: this.undoHistory.length,
      redoDepth: this.redoHistory.length
    };
  }

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
  wrap = source => {
    this.currentGetCellContent = source.getCellContent;
    this.currentOnCellsEdited = source.onCellsEdited;

    // The returned object is stable while the input pair is. Keyed on the *pair*, because the
    // returned `getCellContent` is the input one by identity.
    if (this.lastWrapped !== undefined && this.lastWrapInputRead === source.getCellContent && this.lastWrapInputWrite === source.onCellsEdited) {
      return this.lastWrapped;
    }
    const wrapped = {
      getCellContent: source.getCellContent,
      onCellsEdited: this.onCellsEdited
    };
    this.lastWrapInputRead = source.getCellContent;
    this.lastWrapInputWrite = source.onCellsEdited;
    this.lastWrapped = wrapped;
    return wrapped;
  };

  /**
   * The recording write path. Normally consumed via {@link wrap}; exposed directly for a consumer
   * hand-wiring their own source rather than using one from this directory.
   */
  onCellsEdited = edits => {
    // A replay is passing back through: forward it, but do not record it. `undo()`/`redo()`
    // manage the stacks themselves, so recording here would double-count.
    if (!this.applying && edits.length > 0) {
      const read = this.currentGetCellContent;
      // No reader wired yet (nothing has called `wrap`): forward the edit but don't record it.
      // An entry whose "before" values we could not read would make undo write garbage, which
      // is strictly worse than not offering undo for that edit.
      if (read !== undefined) {
        this.push(this.undoHistory, {
          before: edits.map(({
            location
          }) => ({
            location,
            value: read(location)
          })),
          // Copied, not aliased: the caller owns the array it passed and may reuse it.
          after: edits.map(({
            location,
            value
          }) => ({
            location,
            value
          }))
        });
        // Any new edit invalidates the redo branch -- standard linear-history semantics,
        // and source's.
        this.redoHistory.length = 0;
        this.notify();
      }
    }
    this.currentOnCellsEdited?.(edits);
  };

  /** Undo the most recent batch. No-op when there is nothing to undo. */
  undo() {
    const batch = this.undoHistory.pop();
    if (batch === undefined) return;
    this.replay(batch.before);
    this.push(this.redoHistory, batch);
    this.notify();
  }

  /** Redo the most recently undone batch. No-op when there is nothing to redo. */
  redo() {
    const batch = this.redoHistory.pop();
    if (batch === undefined) return;
    this.replay(batch.after);
    this.push(this.undoHistory, batch);
    this.notify();
  }

  /** Drop both stacks -- e.g. after loading a different record set, where the history is meaningless. */
  clear() {
    if (this.undoHistory.length === 0 && this.redoHistory.length === 0) return;
    this.undoHistory.length = 0;
    this.redoHistory.length = 0;
    this.notify();
  }

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
  handleKeyDown = ev => {
    // Source tests `metaKey || ctrlKey` rather than branching on platform, so Ctrl+Z works on a
    // Mac with an external PC keyboard too. Kept.
    if (!ev.metaKey && !ev.ctrlKey) return false;
    const key = ev.key.toLowerCase();
    if (key === "z") {
      if (ev.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      ev.preventDefault();
      return true;
    }
    if (key === "y") {
      this.redo();
      ev.preventDefault();
      return true;
    }
    return false;
  };

  /**
   * Attaches {@link handleKeyDown} to `target` (default `window`, as source does) and returns the
   * teardown. Call the teardown from `willDestroy`.
   */
  attachKeyboardShortcuts(target) {
    const el = target ?? (typeof window === "undefined" ? undefined : window);
    if (el === undefined) return () => undefined;
    const listener = ev => {
      this.handleKeyDown(ev);
    };
    el.addEventListener("keydown", listener);
    return () => el.removeEventListener("keydown", listener);
  }

  /** Sends a recorded direction back out through the current write path, without re-recording it. */
  replay(edits) {
    this.applying = true;
    try {
      this.currentOnCellsEdited?.(edits);
    } finally {
      // `finally`, so a throwing consumer handler cannot leave the flag set and silently turn
      // every subsequent edit un-undoable.
      this.applying = false;
    }
    this.updateCellsFn?.(edits.map(({
      location
    }) => ({
      cell: location
    })));
  }
  push(stack, batch) {
    stack.push(batch);
    if (stack.length > this.limit) stack.splice(0, stack.length - this.limit);
  }
  notify() {
    this.onHistoryChanged?.(this.state);
  }
}

export { UndoRedo };
//# sourceMappingURL=undo-redo.js.map
