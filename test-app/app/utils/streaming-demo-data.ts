// Phase 8 — backing store for the high-frequency / streaming demo
// (`app/components/streaming-demo.gts`).
//
// This is the Ember port's equivalent of source's `docs/04-streaming-data.stories.tsx` (mutate a
// plain backing store, then tell the grid what changed) and
// `docs/examples/rapid-updates.stories.tsx` (thousands of cells per animation frame). Shape and
// scale deliberately mirror the latter: 10,000 rows and a per-frame batch of cells chosen at
// random across the whole table.
//
// ============================================================================================
// WHY THERE IS DELIBERATELY NO `@tracked` ANYWHERE IN THIS FILE
// ============================================================================================
// PORTING-NOTES.md's "Autotracking → canvas" section documents exactly two working patterns for
// getting a cell to repaint:
//
//   1. A lazy `getCellContent` over a NON-tracked buffer + an imperative
//      `GridHostController.updateCells()` call naming the changed cells. Damage-based partial
//      repaint; bypasses autotracking entirely.
//   2. A getter-shaped `getCellContent` that EAGERLY reads the tracked fields inside the tracking
//      frame, so a mutation invalidates the grid's modifier and triggers a full-viewport redraw.
//
// This module is pattern (1), and it is the only pattern that can work here. Pattern (2) requires
// projecting every row inside the tracking frame; at 10,000 rows × 12 columns that is 120,000 cell
// objects rebuilt for *every* tick, sixty times a second. Pattern (1)'s cost is proportional to
// the number of cells that actually changed, which is the entire point of the exercise.
//
// Concretely that means: plain `Float64Array`/`string[]` buffers mutated **in place**, no
// `@tracked` on any per-cell value, and no eager projection anywhere. Nothing in this file will
// ever repaint anything on its own — `streaming-demo.gts` owns that, via `updateCells`.
//
// ============================================================================================
// WHY EVERY DISPLAY STRING IS PRECOMPUTED AT MUTATION TIME
// ============================================================================================
// DATA.md's first rule: `getCellContent` must be an O(1) lookup, never a computation. It runs once
// per painted cell inside the draw loop (`render/data-grid-render.cells.ts`). So `tickRow()` — which
// runs once per *changed* row — does all the `toFixed`/`toLocaleString` formatting and stores the
// result; `streamingGetCellContent` only ever indexes arrays. This also satisfies the "display
// field" rule at the top of PORTING-NOTES.md: `NumberCell`/`TextCell` draw `displayData`, never
// `data`, so any path that changes the raw value must recompute the display string in the same
// place. `tickRow` is the single such path.
import {
    GridCellKind,
    type GridCell,
    type GridColumn,
    type Item,
    type Theme,
} from "glide-data-grid-ember/rendering/index";

/** Mirrors source's `rapid-updates` story row count. */
export const STREAMING_ROW_COUNT = 10_000;

/** Points held in each row's sparkline history. */
const SPARK_HISTORY = 24;

// Column indices, named so the ticker and the cell accessor can't drift apart.
const COL_SYMBOL = 0;
const COL_COMPANY = 1;
const COL_LAST = 2;
const COL_CHANGE = 3;
const COL_CHANGE_PCT = 4;
const COL_BID = 5;
const COL_ASK = 6;
const COL_VOLUME = 7;
const COL_TRADES = 8;
const COL_TREND = 9;
const COL_FILL = 10;
const COL_VENUE = 11;

/**
 * The columns a single "row tick" touches. Everything else (symbol/company/venue) is static, so
 * naming it in `updateCells` would be pure waste. `streaming-demo.gts` sizes its per-frame row
 * budget off this length, which is how "cells per second" stays an honest number.
 */
export const STREAMING_UPDATING_COLUMNS: readonly number[] = [
    COL_LAST,
    COL_CHANGE,
    COL_CHANGE_PCT,
    COL_BID,
    COL_ASK,
    COL_VOLUME,
    COL_TRADES,
    COL_TREND,
    COL_FILL,
];

/** Cells emitted per row tick. Exported so the component can report the arithmetic honestly. */
export const CELLS_PER_ROW_TICK = STREAMING_UPDATING_COLUMNS.length;

// --- theme overrides -----------------------------------------------------------------------------
// Module-scope constants, not per-cell literals. Two reasons, both real:
//   * `getCellContent` is on the paint path, so it must not allocate an object per call it can
//     avoid allocating.
//   * `mergeAndRealizeTheme` *blends* an overlay's `bgCell` over the value beneath rather than
//     replacing it (PORTING-NOTES.md, Phase 6). A translucent tint therefore reads correctly on
//     top of whatever the base theme is; a solid colour would flatten it.
const UP_THEME: Partial<Theme> = { bgCell: "rgba(16, 163, 74, 0.14)", textDark: "#0a7c38" };
const DOWN_THEME: Partial<Theme> = { bgCell: "rgba(220, 38, 38, 0.14)", textDark: "#c02626" };

const UP_COLOR = "#0a7c38";
const DOWN_COLOR = "#c02626";
const FLAT_COLOR = "#4f5dff";

// --- deterministic data generation ---------------------------------------------------------------
// mulberry32, same 5-line PRNG `glide-demo-data.ts` uses: the starting table must be identical on
// every reload, or "did the numbers actually move?" is unanswerable.
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b_79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const COMPANY_HEADS = [
    "Northwind",
    "Acme",
    "Initech",
    "Umbrella",
    "Globex",
    "Soylent",
    "Hooli",
    "Vehement",
    "Massive",
    "Cyberdyne",
    "Stark",
    "Wayne",
    "Tyrell",
    "Wonka",
    "Gringotts",
    "Aperture",
];
const COMPANY_TAILS = ["Holdings", "Industries", "Capital", "Labs", "Systems", "Partners", "Group", "Energy"];
const VENUES = ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX", "XETRA"];

// --- the backing store ---------------------------------------------------------------------------
// Typed arrays for everything numeric; plain arrays for the strings the canvas actually draws and
// for the per-row sparkline history. All mutated in place, forever. No object is ever replaced, so
// there is nothing for autotracking to observe even if someone wrapped it — which is the point.
interface StreamingStore {
    readonly symbol: string[];
    readonly company: string[];
    readonly venue: string[];

    readonly last: Float64Array;
    readonly open: Float64Array;
    readonly bid: Float64Array;
    readonly ask: Float64Array;
    readonly volume: Float64Array;
    readonly trades: Float64Array;
    readonly fill: Float64Array;
    /** +1 / -1 / 0 — selects the up/down theme override without recomputing a comparison. */
    readonly dir: Int8Array;
    /** `performance.now()` of this row's last tick; feeds `GridCell.lastUpdated`. */
    readonly updatedAt: Float64Array;
    /** Per-row sparkline history, shifted in place. `SparklineCellProps.values` is `readonly
     * number[]`, so these have to be real arrays rather than a slice of one big typed array. */
    readonly history: number[][];

    // Precomputed display strings — see the header comment.
    readonly dLast: string[];
    readonly dChange: string[];
    readonly dChangePct: string[];
    readonly dBid: string[];
    readonly dAsk: string[];
    readonly dVolume: string[];
    readonly dTrades: string[];
    readonly dFill: string[];
}

function buildStore(): StreamingStore {
    const n = STREAMING_ROW_COUNT;
    const rand = mulberry32(0x5eed_51de);

    const store: StreamingStore = {
        symbol: Array.from({ length: n }),
        company: Array.from({ length: n }),
        venue: Array.from({ length: n }),
        last: new Float64Array(n),
        open: new Float64Array(n),
        bid: new Float64Array(n),
        ask: new Float64Array(n),
        volume: new Float64Array(n),
        trades: new Float64Array(n),
        fill: new Float64Array(n),
        dir: new Int8Array(n),
        updatedAt: new Float64Array(n),
        history: Array.from({ length: n }),
        dLast: Array.from({ length: n }),
        dChange: Array.from({ length: n }),
        dChangePct: Array.from({ length: n }),
        dBid: Array.from({ length: n }),
        dAsk: Array.from({ length: n }),
        dVolume: Array.from({ length: n }),
        dTrades: Array.from({ length: n }),
        dFill: Array.from({ length: n }),
    };

    for (let i = 0; i < n; i++) {
        const a = LETTERS[Math.floor(rand() * 26)]!;
        const b = LETTERS[Math.floor(rand() * 26)]!;
        const c = LETTERS[Math.floor(rand() * 26)]!;
        // Row index in the symbol keeps it unique across 10k rows, and makes it obvious at a glance
        // which row you are looking at while everything else flickers.
        store.symbol[i] = `${a}${b}${c}.${i}`;
        store.company[i] =
            `${COMPANY_HEADS[Math.floor(rand() * COMPANY_HEADS.length)]!} ${COMPANY_TAILS[Math.floor(rand() * COMPANY_TAILS.length)]!}`;
        store.venue[i] = VENUES[Math.floor(rand() * VENUES.length)]!;

        const price = 5 + rand() * 480;
        store.open[i] = price;
        store.last[i] = price;
        store.bid[i] = price - 0.02;
        store.ask[i] = price + 0.02;
        store.volume[i] = Math.floor(rand() * 4_000_000);
        store.trades[i] = Math.floor(rand() * 40_000);
        store.fill[i] = rand() * 100;
        store.dir[i] = 0;

        const hist: number[] = Array.from({ length: SPARK_HISTORY });
        for (let j = 0; j < SPARK_HISTORY; j++) hist[j] = price * (0.97 + rand() * 0.06);
        store.history[i] = hist;

        writeDisplayStrings(store, i);
    }

    return store;
}

function writeDisplayStrings(store: StreamingStore, row: number): void {
    const last = store.last[row]!;
    const open = store.open[row]!;
    const change = last - open;
    store.dLast[row] = last.toFixed(2);
    store.dChange[row] = `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;
    store.dChangePct[row] = `${change >= 0 ? "▲" : "▼"} ${((change / open) * 100).toFixed(2)}%`;
    store.dBid[row] = store.bid[row]!.toFixed(2);
    store.dAsk[row] = store.ask[row]!.toFixed(2);
    store.dVolume[row] = store.volume[row]!.toLocaleString("en-US");
    store.dTrades[row] = store.trades[row]!.toLocaleString("en-US");
    store.dFill[row] = `${store.fill[row]!.toFixed(0)}%`;
}

const store = buildStore();

// A separate PRNG for the live ticker: the *initial* table is deterministic (see above), the
// stream deliberately is not.
const tickRand = mulberry32((Date.now() & 0xffff) || 1);

/**
 * Mutates one row's numbers in place and recomputes its display strings. Does **not** repaint —
 * the caller batches the changed cells and hands them to `GlideDataGridApi.updateCells()`.
 *
 * `now` is a `performance.now()` value supplied by the caller (once per frame, not once per row):
 * `GridCell.lastUpdated` is compared against the render engine's monotonic frame time, so
 * `Date.now()` would be wrong here — same note source's streaming-data story makes.
 */
export function tickRow(row: number, now: number): void {
    const prev = store.last[row]!;
    const drift = (tickRand() - 0.5) * Math.max(0.02, prev * 0.012);
    const next = Math.max(0.5, prev + drift);
    const spread = Math.max(0.01, next * 0.0008);

    store.last[row] = next;
    store.bid[row] = next - spread;
    store.ask[row] = next + spread;
    store.volume[row] = store.volume[row]! + Math.floor(tickRand() * 5000);
    store.trades[row] = store.trades[row]! + Math.floor(tickRand() * 40);
    store.fill[row] = Math.min(100, Math.max(0, store.fill[row]! + (tickRand() - 0.5) * 14));
    store.dir[row] = next > prev ? 1 : next < prev ? -1 : 0;
    store.updatedAt[row] = now;

    // Shift-and-append in place: the sparkline draws `values` in order, so a rotating ring buffer
    // would show a discontinuity. 23 assignments is cheap next to the string formatting below.
    const hist = store.history[row]!;
    for (let j = 0; j < SPARK_HISTORY - 1; j++) hist[j] = hist[j + 1]!;
    hist[SPARK_HISTORY - 1] = next;

    writeDisplayStrings(store, row);
}

/**
 * Whether emitted cells carry `lastUpdated`, which makes the render engine paint a 500 ms fading
 * highlight under each changed cell (`drawLastUpdateUnderlay`, `render/data-grid-lib.ts:399`).
 * This is source's `04-streaming-data` story's second grid, as a toggle.
 *
 * Deliberately a plain module-scope boolean rather than tracked state: `streamingGetCellContent`
 * is a lazy closure invoked at paint time, so a `@tracked` read inside it would happen *outside*
 * the tracking frame and register no dependency at all (PORTING-NOTES.md, "Autotracking → canvas").
 * The component mirrors this into a `@tracked` field purely so the checkbox re-renders.
 */
let highlightUpdates = true;

export function setHighlightUpdates(value: boolean): void {
    highlightUpdates = value;
}

// --- columns -------------------------------------------------------------------------------------
// Module-scope constant. `columns` is one of `computeCanBlit`'s identity-compared `DrawGridArg`
// fields, so a getter returning a fresh array would silently disable the scroll blit fast path
// (PORTING-NOTES.md, standing lesson #1).
export const streamingColumns: readonly GridColumn[] = [
    { title: "Symbol", id: "symbol", width: 110, group: "Instrument" },
    { title: "Company", id: "company", width: 190, group: "Instrument" },
    { title: "Last", id: "last", width: 90, group: "Price" },
    { title: "Change", id: "change", width: 90, group: "Price" },
    { title: "Change %", id: "changePct", width: 100, group: "Price" },
    { title: "Bid", id: "bid", width: 90, group: "Book" },
    { title: "Ask", id: "ask", width: 90, group: "Book" },
    { title: "Volume", id: "volume", width: 110, group: "Activity" },
    { title: "Trades", id: "trades", width: 90, group: "Activity" },
    { title: "Trend", id: "trend", width: 150, group: "Activity" },
    { title: "Fill", id: "fill", width: 140, group: "Activity" },
    // Its own group rather than re-using "Instrument": column groups are contiguous runs, so a
    // non-adjacent column repeating an earlier group name draws a second header of the same name.
    { title: "Venue", id: "venue", width: 90, group: "Listing" },
];

// --- the lazy accessor ---------------------------------------------------------------------------
/**
 * O(1) array lookups only — no formatting, no traversal, no allocation beyond the cell object the
 * contract forces. A module-scope function, so its identity is stable for the lifetime of the page
 * and `computeCanBlit` keeps the blit fast path alive during scroll.
 */
export function streamingGetCellContent(item: Item): GridCell {
    const [col, row] = item;
    const updated = highlightUpdates ? store.updatedAt[row] || undefined : undefined;
    const dir = store.dir[row] ?? 0;
    const dirTheme = dir > 0 ? UP_THEME : dir < 0 ? DOWN_THEME : undefined;

    switch (col) {
        case COL_SYMBOL: {
            const v = store.symbol[row] ?? "";
            return { kind: GridCellKind.Text, allowOverlay: false, data: v, displayData: v };
        }
        case COL_COMPANY: {
            const v = store.company[row] ?? "";
            return { kind: GridCellKind.Text, allowOverlay: false, data: v, displayData: v };
        }
        case COL_VENUE: {
            const v = store.venue[row] ?? "";
            return { kind: GridCellKind.Text, allowOverlay: false, data: v, displayData: v };
        }
        case COL_LAST:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.last[row],
                displayData: store.dLast[row] ?? "",
                lastUpdated: updated,
            };
        case COL_CHANGE:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.last[row]! - store.open[row]!,
                displayData: store.dChange[row] ?? "",
                themeOverride: dirTheme,
                lastUpdated: updated,
            };
        case COL_CHANGE_PCT: {
            const v = store.dChangePct[row] ?? "";
            return {
                kind: GridCellKind.Text,
                allowOverlay: false,
                data: v,
                displayData: v,
                themeOverride: dirTheme,
                lastUpdated: updated,
            };
        }
        case COL_BID:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.bid[row],
                displayData: store.dBid[row] ?? "",
                lastUpdated: updated,
            };
        case COL_ASK:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.ask[row],
                displayData: store.dAsk[row] ?? "",
                lastUpdated: updated,
            };
        case COL_VOLUME:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.volume[row],
                displayData: store.dVolume[row] ?? "",
                lastUpdated: updated,
            };
        case COL_TRADES:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: store.trades[row],
                displayData: store.dTrades[row] ?? "",
                lastUpdated: updated,
            };
        case COL_TREND: {
            const hist = store.history[row];
            if (hist === undefined) {
                return { kind: GridCellKind.Text, allowOverlay: false, data: "", displayData: "" };
            }
            // `yAxis` is recomputed from the (24-element) history rather than cached: the price
            // wanders far enough over a session that a fixed axis would flatten the line. 24
            // comparisons is genuinely O(1) in the row count, which is the contract that matters.
            let lo = hist[0]!;
            let hi = hist[0]!;
            for (let j = 1; j < hist.length; j++) {
                const v = hist[j]!;
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            const pad = Math.max(0.01, (hi - lo) * 0.1);
            return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                // Reuses an already-computed string rather than joining 24 numbers on the paint
                // path. Copy fidelity is not what this demo is testing.
                copyData: store.dLast[row] ?? "",
                lastUpdated: updated,
                data: {
                    kind: "sparkline-cell",
                    graphKind: "line",
                    values: hist,
                    yAxis: [lo - pad, hi + pad],
                    color: dir > 0 ? UP_COLOR : dir < 0 ? DOWN_COLOR : FLAT_COLOR,
                    hideAxis: true,
                },
            };
        }
        case COL_FILL:
            return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                copyData: store.dFill[row] ?? "",
                lastUpdated: updated,
                data: {
                    kind: "range-cell",
                    value: store.fill[row] ?? 0,
                    min: 0,
                    max: 100,
                    step: 1,
                    label: store.dFill[row] ?? "",
                    measureLabel: "100%",
                    color: dir > 0 ? UP_COLOR : dir < 0 ? DOWN_COLOR : FLAT_COLOR,
                },
            };
        default:
            return { kind: GridCellKind.Text, allowOverlay: false, data: "", displayData: "" };
    }
}
