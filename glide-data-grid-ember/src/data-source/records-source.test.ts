// Tests for `recordsSource` — the packaged version of the recommended consumer pattern.
//
// PHASES.md 9a item 1 lists this module's two invariants ("identity stability" and "editing one
// field re-projects one row") as proven **only by a browser measurement that nothing re-runs**.
// These tests make the structural half permanent. The measurement itself (Phase 8d, 1,000 rows in a
// real browser) is still the evidence for the perf claim; what a unit test can pin is that the
// caching decisions which *produce* that result are still being made.
//
// The length-change suite is a regression test for a real defect, found 2026-08-09 while migrating
// `DATA.md` into the cookbook. See `records-source.ts`'s comment on `cachesReusable`.
//
// See `src/rendering/copy-paste.test.ts` for this suite's general conventions.
import { describe, expect, it } from "vitest";
import { consumeTag, createTag, dirtyTag } from "@glimmer/validator";
import { recordsSource } from "./records-source.ts";
import { GridCellKind, type GridCell, type GridColumn } from "../rendering/data-grid-types.ts";

interface Person {
    name: string;
    email: string;
}

/**
 * A record with genuinely tracked fields, built from the same `@glimmer/validator` primitives
 * `@tracked` compiles down to. `vitest.config.ts` aliases the tracking primitive to that package,
 * so the caches under test invalidate for real here — this is not a stub.
 */
class TrackedPerson {
    readonly #nameTag = createTag();
    readonly #emailTag = createTag();
    #name: string;
    #email: string;

    constructor(name: string, email: string) {
        this.#name = name;
        this.#email = email;
    }

    get name(): string {
        consumeTag(this.#nameTag);
        return this.#name;
    }

    set name(value: string) {
        this.#name = value;
        dirtyTag(this.#nameTag);
    }

    get email(): string {
        consumeTag(this.#emailTag);
        return this.#email;
    }

    set email(value: string) {
        this.#email = value;
        dirtyTag(this.#emailTag);
    }
}

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 100 },
    { id: "email", title: "Email", width: 100 },
];

const toCell = (p: Person, col: number): GridCell => {
    const value = col === 0 ? p.name : p.email;
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
};

function people(n: number): Person[] {
    return Array.from({ length: n }, (_, i) => ({ name: `Person ${i}`, email: `p${i}@example.com` }));
}

describe("recordsSource", () => {
    it("projects records into cells", () => {
        const src = recordsSource({ records: people(3), columns: COLUMNS, toCell });

        expect(src.rows).toBe(3);
        expect(src.columns).toBe(COLUMNS);
        expect(src.getCellContent([0, 1])).toMatchObject({ data: "Person 1" });
        expect(src.getCellContent([1, 2])).toMatchObject({ data: "p2@example.com" });
    });

    it("returns the identical result object when nothing changed", () => {
        // `getCellContent` is one of `computeCanBlit`'s reference-compared fields: a fresh closure
        // per call silently disables the scroll blit fast path, with no error and no visual
        // difference. This is the assertion that stops that regressing.
        const records = people(3);
        const a = recordsSource({ records, columns: COLUMNS, toCell });
        const b = recordsSource({ records, columns: COLUMNS, toCell });

        expect(b).toBe(a);
        expect(b.getCellContent).toBe(a.getCellContent);
    });

    it("rebuilds when `toCell` changes identity", () => {
        const records = people(3);
        const a = recordsSource({ records, columns: COLUMNS, toCell });
        const b = recordsSource({ records, columns: COLUMNS, toCell: (p, c) => toCell(p, c) });

        expect(b).not.toBe(a);
    });

    // --- the 2026-08-09 regression -------------------------------------------------------------
    // A live Ember Data array (`store.peekAll(...)`) keeps ONE identity for the life of the store
    // and mutates in place, so it hits `recordsSource` with the same `records` reference at a new
    // length. Before the fix the per-row caches were reused at the OLD length while `rows` came
    // from the NEW one, and every added row painted `FALLBACK_CELL` — blank cells, no error.
    describe("when the same array instance changes length (Ember Data live arrays)", () => {
        it("projects rows appended in place, rather than serving blank cells", () => {
            const records = people(2);
            recordsSource({ records, columns: COLUMNS, toCell });

            records.push({ name: "Appended", email: "appended@example.com" });
            const after = recordsSource({ records, columns: COLUMNS, toCell });

            expect(after.rows).toBe(3);
            // The bug: this was `FALLBACK_CELL` — an empty, non-editable text cell.
            expect(after.getCellContent([0, 2])).toMatchObject({ data: "Appended" });
            expect(after.getCellContent([1, 2])).toMatchObject({ data: "appended@example.com" });
        });

        it("drops rows removed in place", () => {
            const records = people(3);
            recordsSource({ records, columns: COLUMNS, toCell });

            records.pop();
            const after = recordsSource({ records, columns: COLUMNS, toCell });

            expect(after.rows).toBe(2);
            expect(after.getCellContent([0, 1])).toMatchObject({ data: "Person 1" });
        });

        it("keeps every surviving row's content correct after an in-place append", () => {
            const records = people(2);
            const before = recordsSource({ records, columns: COLUMNS, toCell });
            expect(before.getCellContent([0, 0])).toMatchObject({ data: "Person 0" });

            records.push({ name: "Appended", email: "appended@example.com" });
            const after = recordsSource({ records, columns: COLUMNS, toCell });

            expect(after.getCellContent([0, 0])).toMatchObject({ data: "Person 0" });
            expect(after.getCellContent([0, 1])).toMatchObject({ data: "Person 1" });
        });
    });

    // The invariant DATA.md's "Status of this recommendation" was built around, and which PHASES.md
    // 9a item 1 records as proven **only** by a Phase 8d browser measurement that nothing re-runs.
    // The whole point of `recordsSource` over a naive whole-table projection is that this holds.
    describe("incremental re-projection", () => {
        it("re-projects only the row whose tracked field changed", () => {
            const records = [
                new TrackedPerson("Ada", "ada@example.com"),
                new TrackedPerson("Grace", "grace@example.com"),
                new TrackedPerson("Alan", "alan@example.com"),
            ];
            let calls = 0;
            const counting = (p: TrackedPerson, col: number): GridCell => {
                calls++;
                return toCell(p, col);
            };

            recordsSource({ records, columns: COLUMNS, toCell: counting });
            expect(calls).toBe(6); // 3 rows x 2 columns, the initial projection

            calls = 0;
            records[1]!.name = "Grace Hopper";
            const after = recordsSource({ records, columns: COLUMNS, toCell: counting });

            // 2 (one row's worth), NOT 6. A naive projection would rescan the whole table.
            expect(calls).toBe(COLUMNS.length);
            expect(after.getCellContent([0, 1])).toMatchObject({ data: "Grace Hopper" });
            expect(after.getCellContent([0, 0])).toMatchObject({ data: "Ada" });
        });

        it("re-projects nothing when no tracked field changed", () => {
            const records = [new TrackedPerson("Ada", "ada@example.com")];
            let calls = 0;
            const counting = (p: TrackedPerson, col: number): GridCell => {
                calls++;
                return toCell(p, col);
            };

            const first = recordsSource({ records, columns: COLUMNS, toCell: counting });
            calls = 0;
            const second = recordsSource({ records, columns: COLUMNS, toCell: counting });

            expect(calls).toBe(0);
            // And the identity is preserved, so the blit fast path survives an idle re-render.
            expect(second).toBe(first);
        });
    });

    describe("onCellsEdited", () => {
        it("is undefined when no `onCellEdited` was supplied", () => {
            const src = recordsSource({ records: people(2), columns: COLUMNS, toCell });
            expect(src.onCellsEdited).toBeUndefined();
        });

        it("routes an edit to the record at that row", () => {
            const records = people(3);
            const edited: { record: Person; col: number }[] = [];
            const src = recordsSource({
                records,
                columns: COLUMNS,
                toCell,
                onCellEdited: (record, col) => edited.push({ record, col }),
            });

            src.onCellsEdited?.([
                { location: [1, 2], value: { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true } },
            ]);

            expect(edited).toHaveLength(1);
            expect(edited[0]!.record).toBe(records[2]);
            expect(edited[0]!.col).toBe(1);
        });

        it("ignores an edit to a row past the end (the trailing blank row)", () => {
            const records = people(2);
            let calls = 0;
            const src = recordsSource({ records, columns: COLUMNS, toCell, onCellEdited: () => calls++ });

            src.onCellsEdited?.([
                { location: [0, 9], value: { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true } },
            ]);

            expect(calls).toBe(0);
        });
    });
});
