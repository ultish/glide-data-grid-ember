// `trailingRowOptions.targetColumn` resolution (9f). See `new-row-target.ts` for why this is a
// module of its own: the object-identity branch fails silently, so it needs an assertion rather
// than a reading.
import { describe, expect, test } from "vitest";
import { resolveNewRowTarget } from "./new-row-target.ts";
import type { GridColumn } from "./data-grid-types.ts";

const COLUMNS: GridColumn[] = [
    { title: "Avatar", width: 60 },
    { title: "Name", width: 200 },
    { title: "Company", width: 160 },
];

describe("resolveNewRowTarget", () => {
    test("falls back to the clicked column when nothing is configured", () => {
        expect(resolveNewRowTarget(COLUMNS, undefined, 0)).toBe(0);
        expect(resolveNewRowTarget(COLUMNS, undefined, 2)).toBe(2);
    });

    test("a grid-level numeric target applies to every column", () => {
        expect(resolveNewRowTarget(COLUMNS, 1, 0)).toBe(1);
        expect(resolveNewRowTarget(COLUMNS, 1, 2)).toBe(1);
    });

    test("a grid-level target given as a column object resolves by identity", () => {
        expect(resolveNewRowTarget(COLUMNS, COLUMNS[1], 0)).toBe(1);
    });

    test("a structurally equal COPY does not resolve — it falls back", () => {
        // The silent-failure case. `indexOf` is identity, in this port and in source.
        const copy: GridColumn = { title: "Name", width: 200 };
        expect(resolveNewRowTarget(COLUMNS, copy, 0)).toBe(0);
    });

    test("a column's own target overrides the grid-level one", () => {
        const cols: GridColumn[] = [
            { title: "Avatar", width: 60, trailingRowOptions: { targetColumn: 2 } },
            { title: "Name", width: 200 },
            { title: "Company", width: 160 },
        ];
        expect(resolveNewRowTarget(cols, 1, 0)).toBe(2);
        // ...and only for that column.
        expect(resolveNewRowTarget(cols, 1, 1)).toBe(1);
    });

    test("a per-column target given as an object also resolves by identity", () => {
        const cols: GridColumn[] = [{ title: "Avatar", width: 60 }, { title: "Name", width: 200 }];
        const withTarget: GridColumn[] = [{ ...cols[0]!, trailingRowOptions: { targetColumn: cols[1]! } }, cols[1]!];
        expect(resolveNewRowTarget(withTarget, undefined, 0)).toBe(1);
    });

    test("target column 0 is honoured, not treated as absent", () => {
        // `?? gridTarget` rather than `|| gridTarget` — the falsy-zero trap.
        expect(resolveNewRowTarget(COLUMNS, 0, 2)).toBe(0);
    });

    test("an out-of-range clicked index still answers with something usable", () => {
        expect(resolveNewRowTarget(COLUMNS, 1, 99)).toBe(1);
        expect(resolveNewRowTarget(COLUMNS, undefined, 99)).toBe(99);
    });
});
