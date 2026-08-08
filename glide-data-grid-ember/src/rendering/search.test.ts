// Phase 9e-a. Tests for the search engine (`search.ts`).
//
// The point of injecting the scheduler/clock into `IncrementalSearch` is realised here: every test
// below drives the scan synchronously in bare Node, with no browser, no rAF and no fake timers. The
// adaptive-stride arithmetic and the wrap-around termination are the parts most worth pinning --
// both are the kind of "looks obviously right" loop arithmetic that this project has repeatedly
// found to be wrong only under conditions no demo produces.
import { describe, expect, test } from "vitest";
import {
    formatSearchStatus,
    getSearchTestString,
    IncrementalSearch,
    INITIAL_SEARCH_STRIDE,
    makeSearchRegex,
    MAX_SEARCH_RESULTS,
    nextSearchStride,
    searchCellChunk,
    TARGET_SEARCH_TIME_MS,
    type SearchStatus,
} from "./search.ts";
import { GridCellKind, type CellArray, type GridCell, type Item } from "./data-grid-types.ts";

const text = (s: string): GridCell => ({
    kind: GridCellKind.Text,
    data: s,
    displayData: s,
    allowOverlay: true,
});

describe("getSearchTestString", () => {
    test("Text and Number match on displayData, not data", () => {
        // This distinction is the whole reason the port keeps `displayData` in sync on edit (see
        // text-cell.ts): a number cell's `data` is a number and would not be searchable at all.
        expect(
            getSearchTestString({ kind: GridCellKind.Text, data: "raw", displayData: "shown", allowOverlay: true })
        ).toBe("shown");
        expect(
            getSearchTestString({ kind: GridCellKind.Number, data: 42, displayData: "$42.00", allowOverlay: true })
        ).toBe("$42.00");
    });

    test("Uri and Markdown match on data", () => {
        expect(getSearchTestString({ kind: GridCellKind.Uri, data: "https://x.test", allowOverlay: true })).toBe(
            "https://x.test"
        );
        expect(getSearchTestString({ kind: GridCellKind.Markdown, data: "# Hi", allowOverlay: true })).toBe("# Hi");
    });

    test("Boolean stringifies only a real boolean -- indeterminate/undefined are not searchable", () => {
        expect(getSearchTestString({ kind: GridCellKind.Boolean, data: true, allowOverlay: false })).toBe("true");
        expect(getSearchTestString({ kind: GridCellKind.Boolean, data: false, allowOverlay: false })).toBe("false");
        expect(getSearchTestString({ kind: GridCellKind.Boolean, data: undefined, allowOverlay: false })).toBeUndefined();
    });

    test("Image and Bubble join with a separator no query will contain", () => {
        // The separator matters: joining with "" would let a query match across two entries.
        const cell: GridCell = { kind: GridCellKind.Bubble, data: ["ab", "c"], allowOverlay: false };
        const joined = getSearchTestString(cell);
        expect(joined).toBe("ab🐳c");
        expect(makeSearchRegex("abc").test(joined!)).toBe(false);
    });

    test("Custom matches on copyData -- the only channel a custom cell has", () => {
        expect(
            getSearchTestString({
                kind: GridCellKind.Custom,
                data: { kind: "whatever" },
                copyData: "findme",
                allowOverlay: true,
            } as GridCell)
        ).toBe("findme");
    });

    test("non-searchable kinds return undefined rather than an empty string", () => {
        // An empty string would match an empty-ish query and light up every loading cell.
        expect(getSearchTestString({ kind: GridCellKind.Loading, allowOverlay: false })).toBeUndefined();
        expect(getSearchTestString({ kind: GridCellKind.Protected, allowOverlay: false })).toBeUndefined();
    });
});

describe("makeSearchRegex", () => {
    test("is case-insensitive", () => {
        expect(makeSearchRegex("HELLO").test("hello world")).toBe(true);
    });

    test("matches as a substring, not anchored", () => {
        expect(makeSearchRegex("ell").test("hello")).toBe(true);
    });

    test("escapes metacharacters so a query is matched literally", () => {
        // Without escaping, "a.c" would match "abc" -- the classic silently-wrong search result.
        expect(makeSearchRegex("a.c").test("abc")).toBe(false);
        expect(makeSearchRegex("a.c").test("a.c")).toBe(true);
        expect(makeSearchRegex("(x)").test("(x)")).toBe(true);
        expect(makeSearchRegex("50%+").test("50%+")).toBe(true);
        expect(makeSearchRegex("[a]").test("[a]")).toBe(true);
    });

    test("a lone backslash does not throw", () => {
        expect(() => makeSearchRegex("\\")).not.toThrow();
        expect(makeSearchRegex("\\").test("a\\b")).toBe(true);
    });
});

describe("searchCellChunk", () => {
    const chunk: CellArray = [
        [text("apple"), text("banana")],
        [text("cherry"), text("APPLE pie")],
    ];

    test("returns [col, row] pairs offset by the chunk's origin row", () => {
        expect(searchCellChunk(chunk, makeSearchRegex("apple"), 100)).toEqual([
            [0, 100],
            [1, 101],
        ]);
    });

    test("originX offsets the column too", () => {
        expect(searchCellChunk(chunk, makeSearchRegex("banana"), 0, 5)).toEqual([[6, 0]]);
    });

    test("no matches yields an empty array, not undefined", () => {
        expect(searchCellChunk(chunk, makeSearchRegex("zzz"), 0)).toEqual([]);
    });
});

describe("nextSearchStride", () => {
    test("grows the stride when a chunk finished under budget", () => {
        expect(nextSearchStride(10, TARGET_SEARCH_TIME_MS / 2)).toBe(20);
    });

    test("shrinks the stride when a chunk overran", () => {
        expect(nextSearchStride(10, TARGET_SEARCH_TIME_MS * 2)).toBe(5);
    });

    test("a 0ms chunk does not produce an infinite stride", () => {
        // The `Math.max(elapsed, 1)` floor. Without it this is Infinity, and the next chunk becomes
        // the entire table -- the exact one-long-frame stall the chunking exists to prevent.
        expect(Number.isFinite(nextSearchStride(10, 0))).toBe(true);
        expect(nextSearchStride(10, 0)).toBe(10 * TARGET_SEARCH_TIME_MS);
    });

    test("never returns a fractional stride", () => {
        expect(Number.isInteger(nextSearchStride(3, 7))).toBe(true);
    });
});

/** Drives an `IncrementalSearch` to completion synchronously, returning every progress report. */
async function runScan(
    rows: number,
    startRow: number,
    cellAt: (col: number, row: number) => GridCell,
    query: string,
    opts: { readonly columns?: number; readonly elapsedMs?: number } = {}
): Promise<{ reports: { results: readonly Item[]; status: SearchStatus }[]; chunks: [number, number][] }> {
    const columns = opts.columns ?? 2;
    const reports: { results: readonly Item[]; status: SearchStatus }[] = [];
    const chunks: [number, number][] = [];
    let pending: (() => void) | undefined;
    let clock = 0;

    const search = new IncrementalSearch({
        rows,
        startRow,
        fetchChunk: (start, height) => {
            chunks.push([start, height]);
            const out: GridCell[][] = [];
            for (let y = start; y < start + height; y++) {
                const row: GridCell[] = [];
                for (let x = 0; x < columns; x++) row.push(cellAt(x, y));
                out.push(row);
            }
            return out;
        },
        onProgress: (results, status) => reports.push({ results, status }),
        schedule: fn => {
            pending = fn;
            return 1;
        },
        unschedule: () => {
            pending = undefined;
        },
        now: () => (clock += (opts.elapsedMs ?? TARGET_SEARCH_TIME_MS) / 2),
    });

    search.start(query);
    // Bounded so a termination bug fails loudly instead of hanging the suite.
    for (let i = 0; pending !== undefined && i < 10_000; i++) {
        const fn = pending;
        pending = undefined;
        fn();
        await Promise.resolve();
    }
    return { reports, chunks };
}

describe("IncrementalSearch", () => {
    test("finds every match in a small table and reports full progress", async () => {
        const { reports } = await runScan(20, 0, (col, row) => text(row === 7 && col === 1 ? "needle" : "hay"), "needle");
        const last = reports.at(-1)!;
        expect(last.results).toEqual([[1, 7]]);
        expect(last.status).toEqual({ rowsSearched: 20, results: 1 });
    });

    test("starts at startRow and wraps around to cover the rows above it", async () => {
        // The behaviour that makes search feel instant: results already on screen come first, but
        // the rows above still get searched.
        const { reports, chunks } = await runScan(30, 20, (col, row) => text(`r${row}`), "r");
        expect(chunks[0]![0]).toBe(20);
        expect(chunks.some(([start]) => start === 0)).toBe(true);
        // 30 rows x 2 columns, every cell matching "r".
        expect(reports.at(-1)!.status).toEqual({ rowsSearched: 30, results: 60 });
    });

    test("never scans more rows than the table has", async () => {
        const { chunks } = await runScan(25, 13, () => text("x"), "x");
        const total = chunks.reduce((sum, [, height]) => sum + height, 0);
        expect(total).toBe(25);
    });

    test("results stream in -- an early report is a prefix of a later one", async () => {
        const { reports } = await runScan(200, 0, () => text("match"), "match");
        expect(reports.length).toBeGreaterThan(1);
        for (let i = 1; i < reports.length; i++) {
            const prev = reports[i - 1]!.results;
            expect(reports[i]!.results.slice(0, prev.length)).toEqual(prev);
        }
    });

    test("stops early once the result cap is hit", async () => {
        const { reports } = await runScan(100_000, 0, () => text("x"), "x");
        const last = reports.at(-1)!;
        expect(last.results.length).toBeGreaterThanOrEqual(MAX_SEARCH_RESULTS);
        expect(last.status.rowsSearched).toBeLessThan(100_000);
    });

    test("the stride adapts -- slow chunks shrink it, fast chunks grow it", async () => {
        const fast = await runScan(5000, 0, () => text("no"), "zzz", { elapsedMs: 1 });
        const slow = await runScan(5000, 0, () => text("no"), "zzz", { elapsedMs: 200 });
        // Both cover the table; the fast clock should need far fewer chunks to do it.
        expect(fast.chunks.length).toBeLessThan(slow.chunks.length);
        expect(fast.chunks[0]![1]).toBe(INITIAL_SEARCH_STRIDE);
    });

    test("an empty query cancels and reports a single empty result set", async () => {
        const { reports, chunks } = await runScan(50, 0, () => text("x"), "");
        expect(chunks).toEqual([]);
        expect(reports).toEqual([{ results: [], status: { rowsSearched: 0, results: 0 } }]);
    });

    test("a zero-row table terminates instead of spinning", async () => {
        const { reports, chunks } = await runScan(0, 0, () => text("x"), "x");
        expect(chunks).toEqual([]);
        expect(reports).toEqual([]);
    });

    test("cancel() stops the scan", async () => {
        let pending: (() => void) | undefined;
        let calls = 0;
        const search = new IncrementalSearch({
            rows: 1000,
            startRow: 0,
            fetchChunk: (start, height) => {
                calls++;
                return Array.from({ length: height }, (_, i) => [text(`r${start + i}`)]);
            },
            onProgress: () => undefined,
            schedule: fn => {
                pending = fn;
                return 1;
            },
            unschedule: () => {
                pending = undefined;
            },
            now: () => 0,
        });
        search.start("r");
        pending!();
        await Promise.resolve();
        const afterOneChunk = calls;
        search.cancel();
        expect(pending).toBeUndefined();
        expect(calls).toBe(afterOneChunk);
        expect(search.isRunning).toBe(false);
    });

    test("a restarted scan drops a superseded async chunk instead of interleaving results", async () => {
        // The case source cannot handle: typing a second character while a `Promise` chunk from the
        // first query is still in flight. Without the generation guard, the stale chunk's matches
        // land in the new query's result list.
        let resolveFirst: ((v: CellArray) => void) | undefined;
        const reports: (readonly Item[])[] = [];
        let pending: (() => void) | undefined;
        let query = "first";

        const search = new IncrementalSearch({
            rows: 10,
            startRow: 0,
            // The two queries deliberately match at *different* positions, so a leaked stale result
            // is distinguishable from the legitimate one rather than coinciding with it.
            fetchChunk: () =>
                query === "first"
                    ? new Promise<CellArray>(res => (resolveFirst = res))
                    : [[text("second")]],
            onProgress: results => reports.push(results),
            schedule: fn => {
                pending = fn;
                return 1;
            },
            unschedule: () => {
                pending = undefined;
            },
            now: () => 0,
        });

        search.start("first");
        pending!();
        await Promise.resolve();

        // Second query starts while the first chunk is still unresolved.
        query = "second";
        search.start("second");
        const secondTick = pending!;

        // Now the stale chunk finally answers, with cells that WOULD match "first" -- at row 1,
        // where the live query has no match at all.
        resolveFirst!([[text("no")], [text("first")]]);
        await Promise.resolve();
        await Promise.resolve();

        secondTick();
        await Promise.resolve();

        for (const results of reports) {
            expect(results).not.toContainEqual([0, 1] as Item);
        }
        expect(reports.at(-1)).toEqual([[0, 0]]);
    });
});

describe("formatSearchStatus", () => {
    test("pluralises, and singular has no 's'", () => {
        expect(formatSearchStatus({ rowsSearched: 10, results: 1 }, -1)).toBe("1 result");
        expect(formatSearchStatus({ rowsSearched: 10, results: 2 }, -1)).toBe("2 results");
        expect(formatSearchStatus({ rowsSearched: 10, results: 0 }, -1)).toBe("0 results");
    });

    test("prefixes the 1-based position once something is navigated to", () => {
        expect(formatSearchStatus({ rowsSearched: 10, results: 12 }, 2)).toBe("3 of 12 results");
    });

    test("caps at 'over 1000', matching the scan's own result cap", () => {
        expect(formatSearchStatus({ rowsSearched: 10, results: MAX_SEARCH_RESULTS }, -1)).toBe("over 1000");
        expect(formatSearchStatus({ rowsSearched: 10, results: MAX_SEARCH_RESULTS }, 0)).toBe("1 of over 1000");
    });
});
