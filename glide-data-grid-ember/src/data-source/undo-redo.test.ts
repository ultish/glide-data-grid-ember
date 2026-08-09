// 9j. Tests for `UndoRedo`.
//
// Two things here are worth more than the rest.
//
//  1. **The stale-reader suite.** This class exists in `wrap()` form specifically because
//     `recordsSource` hands back a NEW `getCellContent` closure every time the data changes, each
//     capturing that call's projections. A `getCellContent` captured once at construction would
//     record "before" values from whenever the grid was built, and undo would write stale data. The
//     fixture below therefore mints a fresh reader closure on every simulated render, exactly as
//     `recordsSource` does — a fixture that reused one closure would make the whole class look
//     correct while proving nothing.
//
//  2. **The composed-with-sort suite.** `UndoRedo` remaps nothing, so it has no coordinate
//     translation of its own; what it has is a *placement* requirement, which is the same contract
//     seen from the other side. Wrapped below `withColumnSort` the history is in original record
//     space and survives a re-sort; wrapped above it, an undo after the user re-sorts writes to
//     whatever record now sits at that screen row. That last test is the one that would catch a
//     future "simplification" of the documented composition order.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it, vi } from "vitest";
import { UndoRedo } from "./undo-redo.ts";
import { withColumnSort, type CellEdit } from "./column-sort.ts";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "../rendering/data-grid-types.ts";

const COLUMNS: readonly GridColumn[] = [
    { title: "Name", id: "name", width: 100 },
    { title: "City", id: "city", width: 100 },
];

function cell(data: string): GridCell {
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
}

function textOf(c: GridCell): string {
    return (c as { displayData: string }).displayData;
}

/**
 * A minimal stand-in for `recordsSource`: a mutable table plus a `snapshot()` that mints a **fresh**
 * `getCellContent` closure over the data as it stands right now. That freshness is the point — see
 * this file's header.
 */
function makeTable(rows: readonly (readonly string[])[]) {
    const data = rows.map(r => [...r]);
    const onCellsEdited = (edits: readonly CellEdit[]): void => {
        for (const { location, value } of edits) {
            const [col, row] = location;
            const target = data[row];
            if (target !== undefined) target[col] = textOf(value);
        }
    };
    return {
        data,
        onCellsEdited,
        /** One "render": the reader closes over a copy, so a later mutation is invisible to it. */
        snapshot() {
            const frozen = data.map(r => [...r]);
            return {
                getCellContent: ([col, row]: Item): GridCell => cell(frozen[row]?.[col] ?? ""),
                onCellsEdited,
            };
        },
    };
}

describe("UndoRedo — basic history", () => {
    it("exposes replay state while forwarding undo and redo edits", () => {
        const table = makeTable([["a"]]);
        const replayStates: boolean[] = [];
        const ur = new UndoRedo();
        const source = ur.wrap({
            ...table.snapshot(),
            onCellsEdited: edits => {
                replayStates.push(ur.isReplaying);
                table.onCellsEdited(edits);
            },
        });

        source.onCellsEdited([{ location: [0, 0], value: cell("b") }]);
        ur.undo();
        ur.redo();

        expect(replayStates).toEqual([false, true, true]);
    });

    it("undoes an edit back to the value it replaced", () => {
        const table = makeTable([["alice", "Oslo"]]);
        const ur = new UndoRedo();
        const w = ur.wrap(table.snapshot());

        w.onCellsEdited([{ location: [0, 0], value: cell("ALICE") }]);
        expect(table.data[0]![0]).toBe("ALICE");

        ur.undo();
        expect(table.data[0]![0]).toBe("alice");
    });

    it("redoes what it undid", () => {
        const table = makeTable([["alice", "Oslo"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("ALICE") }]);

        ur.undo();
        ur.redo();
        expect(table.data[0]![0]).toBe("ALICE");
    });

    it("treats one onCellsEdited call as one undo step, however many cells it carries", () => {
        // This addon delivers a paste as a single batch, which is why the port drops source's
        // `setTimeout(0)` coalescing entirely. One call in, one step out.
        const table = makeTable([
            ["a", "b"],
            ["c", "d"],
        ]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([
            { location: [0, 0], value: cell("A") },
            { location: [1, 1], value: cell("D") },
        ]);

        ur.undo();
        expect(table.data[0]![0]).toBe("a");
        expect(table.data[1]![1]).toBe("d");
        expect(ur.canUndo).toBe(false);
    });

    it("walks back through several steps in order", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        let w = ur.wrap(table.snapshot());
        w.onCellsEdited([{ location: [0, 0], value: cell("one") }]);
        w = ur.wrap(table.snapshot());
        w.onCellsEdited([{ location: [0, 0], value: cell("two") }]);

        ur.undo();
        expect(table.data[0]![0]).toBe("one");
        ur.undo();
        expect(table.data[0]![0]).toBe("a");
    });

    it("does not record its own replays", () => {
        // The `applying` guard. Without it an undo pushes its own writes back onto the undo stack
        // and the feature degrades into a toggle that never terminates.
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);

        ur.undo();
        expect(ur.canUndo).toBe(false);
        expect(ur.canRedo).toBe(true);
    });

    it("drops the redo branch when a new edit arrives", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        let w = ur.wrap(table.snapshot());
        w.onCellsEdited([{ location: [0, 0], value: cell("A") }]);
        ur.undo();
        expect(ur.canRedo).toBe(true);

        w = ur.wrap(table.snapshot());
        w.onCellsEdited([{ location: [1, 0], value: cell("B") }]);
        expect(ur.canRedo).toBe(false);
    });

    it("is a no-op with an empty history", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot());
        expect(() => {
            ur.undo();
            ur.redo();
        }).not.toThrow();
        expect(table.data[0]![0]).toBe("a");
    });

    it("ignores an empty batch", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([]);
        expect(ur.canUndo).toBe(false);
    });

    it("clears both stacks", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);
        ur.undo();
        ur.clear();
        expect(ur.canUndo).toBe(false);
        expect(ur.canRedo).toBe(false);
    });

    it("drops the oldest step past the limit", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo({ limit: 2 });
        for (const v of ["1", "2", "3"]) {
            ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell(v) }]);
        }
        expect(ur.state.undoDepth).toBe(2);
        ur.undo();
        ur.undo();
        // The first step ("a" -> "1") was evicted, so "1" is as far back as it goes.
        expect(table.data[0]![0]).toBe("1");
        expect(ur.canUndo).toBe(false);
    });
});

describe("UndoRedo — the stale-reader hazard this API shape exists to remove", () => {
    it("records the value as of the edit, reading through the CURRENT snapshot", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();

        // Two edits, each preceded by a fresh `wrap` — exactly what a `@cached` getter recomputing
        // after a tracked mutation produces.
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("one") }]);
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("two") }]);

        ur.undo();
        // "one", not "a": the second step's "before" was read after the first edit landed. A reader
        // captured once at construction would have recorded "a" here.
        expect(table.data[0]![0]).toBe("one");
    });

    it("survives two undos in a row with no intervening render", () => {
        // Divergence 2 in the module header: each batch stores both directions at record time, so
        // replaying reads nothing at all and cannot consult a stale reader.
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("one") }]);
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("two") }]);

        ur.undo();
        ur.undo();
        expect(table.data[0]![0]).toBe("a");
        // ...and the redo stack is still coherent afterwards.
        ur.redo();
        expect(table.data[0]![0]).toBe("one");
        ur.redo();
        expect(table.data[0]![0]).toBe("two");
    });

    it("forwards but does not record an edit arriving before anything called wrap", () => {
        // Recording an entry whose "before" values could not be read would make undo write garbage.
        const ur = new UndoRedo();
        ur.onCellsEdited([{ location: [0, 0], value: cell("A") }]);
        expect(ur.canUndo).toBe(false);
    });

    it("does not alias the caller's edit array", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        const edits: CellEdit[] = [{ location: [0, 0], value: cell("A") }];
        ur.wrap(table.snapshot()).onCellsEdited(edits);
        edits.length = 0;

        ur.undo();
        ur.redo();
        expect(table.data[0]![0]).toBe("A");
    });
});

describe("UndoRedo — composition (wrap the INNERMOST source)", () => {
    it("records original row space, so undo survives a re-sort", () => {
        // Rows: charlie(0), alice(1), bob(2). Sorted ascending by name, displayed row 0 is "alice",
        // i.e. original row 1. `withColumnSort` translates displayed -> original BEFORE the edit
        // reaches `UndoRedo`, so that is what the history holds.
        const table = makeTable([
            ["charlie", "Oslo"],
            ["alice", "Rome"],
            ["bob", "Lima"],
        ]);
        const ur = new UndoRedo();

        const src = table.snapshot();
        const undoable = ur.wrap(src);
        const sorted = withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: src.getCellContent,
            onCellsEdited: undoable.onCellsEdited,
            sort: { column: COLUMNS[0]!, direction: "asc" },
        });

        sorted.onCellsEdited?.([{ location: [1, 0], value: cell("Paris") }]);
        expect(table.data[1]![1]).toBe("Paris"); // alice's city, not charlie's

        // Now the user flips the sort. The history is in original space, so it is unaffected.
        const src2 = table.snapshot();
        const undoable2 = ur.wrap(src2);
        withColumnSort({
            columns: COLUMNS,
            rows: 3,
            getCellContent: src2.getCellContent,
            onCellsEdited: undoable2.onCellsEdited,
            sort: { column: COLUMNS[0]!, direction: "desc" },
        });

        ur.undo();
        expect(table.data[1]![1]).toBe("Rome"); // alice's city restored
        expect(table.data[0]![1]).toBe("Oslo"); // charlie untouched
    });
});

describe("UndoRedo — identity stability and reported state", () => {
    it("hands getCellContent straight back by identity", () => {
        // It remaps nothing, so wrapping must not disturb the blit fast path.
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        const src = table.snapshot();
        expect(ur.wrap(src).getCellContent).toBe(src.getCellContent);
    });

    it("returns a permanently stable onCellsEdited across every wrap", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        const a = ur.wrap(table.snapshot());
        const b = ur.wrap(table.snapshot());
        expect(b.onCellsEdited).toBe(a.onCellsEdited);
    });

    it("returns the same wrapper object for an unchanged input pair", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        const src = table.snapshot();
        expect(ur.wrap(src)).toBe(ur.wrap(src));
    });

    it("notifies onHistoryChanged on every history change", () => {
        const table = makeTable([["a", "b"]]);
        const onHistoryChanged = vi.fn();
        const ur = new UndoRedo({ onHistoryChanged });
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);
        expect(onHistoryChanged).toHaveBeenLastCalledWith({
            canUndo: true,
            canRedo: false,
            undoDepth: 1,
            redoDepth: 0,
        });

        ur.undo();
        expect(onHistoryChanged).toHaveBeenLastCalledWith({
            canUndo: false,
            canRedo: true,
            undoDepth: 0,
            redoDepth: 1,
        });
    });

    it("does not notify when clear() has nothing to clear", () => {
        const onHistoryChanged = vi.fn();
        new UndoRedo({ onHistoryChanged }).clear();
        expect(onHistoryChanged).not.toHaveBeenCalled();
    });

    it("damages exactly the replayed cells when updateCells is supplied", () => {
        const table = makeTable([
            ["a", "b"],
            ["c", "d"],
        ]);
        const updateCells = vi.fn();
        const ur = new UndoRedo({ updateCells });
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [1, 1], value: cell("D") }]);
        expect(updateCells).not.toHaveBeenCalled(); // nothing to repaint until a replay

        ur.undo();
        expect(updateCells).toHaveBeenCalledWith([{ cell: [1, 1] }]);
    });
});

describe("UndoRedo — keyboard", () => {
    /** `preventDefault` is returned alongside rather than read back off the event, so the assertion
     *  never accesses an unbound method. */
    function keyEvent(key: string, modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}) {
        const preventDefault = vi.fn();
        const event = {
            key,
            metaKey: modifiers.meta ?? false,
            ctrlKey: modifiers.ctrl ?? false,
            shiftKey: modifiers.shift ?? false,
            preventDefault,
        } as unknown as KeyboardEvent;
        return { event, preventDefault };
    }

    it("undoes on primary+Z and redoes on primary+Shift+Z", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);

        ur.handleKeyDown(keyEvent("z", { meta: true }).event);
        expect(table.data[0]![0]).toBe("a");
        ur.handleKeyDown(keyEvent("z", { meta: true, shift: true }).event);
        expect(table.data[0]![0]).toBe("A");
    });

    it("redoes on primary+Y", () => {
        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);
        ur.undo();

        ur.handleKeyDown(keyEvent("y", { ctrl: true }).event);
        expect(table.data[0]![0]).toBe("A");
    });

    it("reports whether it handled the event, and only suppresses ones it did", () => {
        const ur = new UndoRedo();
        const plain = keyEvent("z");
        expect(ur.handleKeyDown(plain.event)).toBe(false);
        expect(plain.preventDefault).not.toHaveBeenCalled();

        const handled = keyEvent("Z", { ctrl: true });
        expect(ur.handleKeyDown(handled.event)).toBe(true);
        expect(handled.preventDefault).toHaveBeenCalled();
    });

    it("attaches and detaches a keydown listener", () => {
        const listeners: ((ev: Event) => void)[] = [];
        const target = {
            addEventListener: (_t: string, l: EventListenerOrEventListenerObject) =>
                listeners.push(l as (ev: Event) => void),
            removeEventListener: () => listeners.splice(0, listeners.length),
        } as unknown as EventTarget;

        const table = makeTable([["a", "b"]]);
        const ur = new UndoRedo();
        ur.wrap(table.snapshot()).onCellsEdited([{ location: [0, 0], value: cell("A") }]);

        const detach = ur.attachKeyboardShortcuts(target);
        listeners[0]!(keyEvent("z", { meta: true }).event);
        expect(table.data[0]![0]).toBe("a");

        detach();
        expect(listeners).toHaveLength(0);
    });
});
