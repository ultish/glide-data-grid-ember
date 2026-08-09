// Phase 8 — the high-frequency / streaming real-time-updates demo.
//
// This is the "(b)" half of the port's dual-path reactivity model (PHASES.md's original-request
// section; PORTING-NOTES.md's "Autotracking → canvas"): a lazy `getCellContent` over a plain,
// **non-tracked** buffer, plus imperative `GlideDataGridApi.updateCells()` calls naming exactly the
// cells that changed. The grid then does a damage-based partial repaint instead of a full redraw.
//
// It ports what source's two stories actually demonstrate:
//   * `docs/04-streaming-data.stories.tsx` — mutate the backing store, then tell the grid; plus the
//     optional `lastUpdated` fading highlight (the "Highlight updates" checkbox below).
//   * `docs/examples/rapid-updates.stories.tsx` — thousands of cells per animation frame over a
//     10,000-row table, with a live "updates processed" readout.
//
// Everything on screen is measured, not asserted: the cells/sec figure counts cells actually handed
// to `updateCells`, the frame rate counts real `requestAnimationFrame` callbacks, and the repaint
// time is wall-clock around the `updateCells` call itself (which is synchronous — it goes straight
// to `GridHostController.drawWithDamage`).
//
// NOTE — `@rowMarkers` is ON here, deliberately, and that is load-bearing for what this demo proves.
// Damage is matched inside the draw loop against *mangled* column indices
// (`data-grid-render.cells.ts` compares against `MappedGridColumn.sourceIndex`), so a row-marker
// column shifts every real column right by one. `GridHostController.updateCells` now adds that
// `rowMarkerOffset` itself at the public boundary (as source does at `data-editor.tsx:4001-4006`),
// so the coordinates below are unambiguously in the same space as `getCellContent`'s `Item` — plain
// consumer column indices, no `+1`. Turning markers on is the case that used to be silently wrong
// (every damaged cell landed one column to the left), so leaving them off would mean the one code
// path most worth exercising never runs. Concretely: if that offset were ever dropped again, the
// rightmost updating column (Fill, index 10) would stop repainting while everything else kept
// animating — a visible, checkable symptom rather than an invisible one.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import GlideDataGrid, { type GlideDataGridApi } from "glide-data-grid-ember/components/glide-data-grid";
import {
    getCellRenderer as defaultGetCellRenderer,
    createCombinedCellRenderer,
    allExtraCells,
    type Item,
} from "glide-data-grid-ember/rendering/index";
import {
    streamingColumns,
    streamingGetCellContent,
    setHighlightUpdates,
    tickRow,
    STREAMING_ROW_COUNT,
    STREAMING_UPDATING_COLUMNS,
    CELLS_PER_ROW_TICK,
} from "test-app/utils/streaming-demo-data";

// Built once at module scope: the Phase 4 built-in registry combined with Phase 5's extra cells, so
// the sparkline and range cells in the Trend/Fill columns resolve. Same construction as
// `demo-grid.gts` / `glide-demo.gts`. Module scope also keeps its identity stable, which matters --
// see the identity note on `columns` in `streaming-demo-data.ts`.
const getCellRenderer = createCombinedCellRenderer(defaultGetCellRenderer, allExtraCells);

/** `-1` means "no fixed target — push as hard as the machine allows" (adaptive batch, see `frame`). */
const RATE_OPTIONS: readonly { readonly label: string; readonly rate: number }[] = [
    { label: "1k/s", rate: 1_000 },
    { label: "10k/s", rate: 10_000 },
    { label: "50k/s", rate: 50_000 },
    { label: "100k/s", rate: 100_000 },
    { label: "250k/s", rate: 250_000 },
    { label: "Max", rate: -1 },
];

const STATS_INTERVAL_MS = 500;
/**
 * How long the `setTimeout` guard waits before taking over from `requestAnimationFrame`. Comfortably
 * longer than a 60 Hz frame (so it is always cancelled unused while the page is visible) and short
 * enough that a hidden document still ticks several times a second. Chrome clamps timers in hidden
 * documents to ~1 Hz, so the *effective* occluded rate is that clamp, not this value — which is
 * exactly why the readout names the driver instead of implying every tick is a painted frame.
 */
const TIMER_FALLBACK_MS = 250;
const MIN_ADAPTIVE_BATCH = 200;
const MAX_ADAPTIVE_BATCH = 200_000;
const INITIAL_ADAPTIVE_BATCH = 2_000;

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export default class StreamingDemo extends Component {
    // --- grid args (all identity-stable) ---------------------------------------------------------
    // Plain readonly fields bound to module-scope values. `columns`, `getCellContent` and the theme
    // are among `computeCanBlit`'s ~18 identity-compared `DrawGridArg` fields, so an inline literal
    // or a getter returning a fresh value here would silently disable the scroll blit fast path with
    // no visible symptom (PORTING-NOTES.md standing lesson #1).
    readonly columns = streamingColumns;
    readonly rows = STREAMING_ROW_COUNT;
    readonly getCellContent = streamingGetCellContent;
    readonly getCellRenderer = getCellRenderer;
    readonly cellsPerRowTick = CELLS_PER_ROW_TICK;

    // --- UI state ---------------------------------------------------------------------------------
    @tracked running = false;
    @tracked targetRate = 50_000;
    @tracked highlight = true;

    // --- measured readouts (written at ~2 Hz from inside the rAF loop) -----------------------------
    @tracked achievedRate = 0;
    @tracked fps = 0;
    @tracked avgRepaintMs = 0;
    @tracked maxRepaintMs = 0;
    @tracked avgFrameCostMs = 0;
    @tracked cellsPerFrame = 0;
    @tracked totalCells = 0;

    /** Which scheduler actually delivered the last tick -- see `scheduleTick`. */
    @tracked driver: "rAF" | "timer" = "rAF";

    // --- non-reactive ticker state ----------------------------------------------------------------
    // Plain fields on purpose: these change up to 60x/second and nothing in the template needs to
    // re-render for them. Making them `@tracked` would invalidate this component every frame.
    private api: GlideDataGridApi | undefined;
    private rafId = 0;
    private timerId = 0;
    private lastFrameTs = 0;
    private cellCredit = 0;
    private adaptiveBatch = INITIAL_ADAPTIVE_BATCH;
    private nextRow = 0;

    // Windowed accumulators feeding the readouts above.
    private windowStart = 0;
    private windowFrames = 0;
    private windowCells = 0;
    private windowRepaintMs = 0;
    private windowMaxRepaintMs = 0;
    private windowFrameCostMs = 0;

    // Reused `{ cell }` batch handed to `updateCells`. Pooled rather than rebuilt because at
    // 250k cells/sec a fresh `{ cell: [col, row] }` pair per cell is ~500k allocations a second of
    // pure measurement noise. Safe to reuse: `GridHostController.updateCells` immediately packs the
    // tuples into a `CellSet` (a `Set<number>` of packed col/row ints) and never retains them.
    private readonly pool: { cell: [number, number] }[] = [];
    private readonly batch: { cell: Item }[] = [];

    // --- derived labels ---------------------------------------------------------------------------
    get rateButtons(): readonly { readonly label: string; readonly rate: number; readonly active: boolean }[] {
        return RATE_OPTIONS.map(o => ({ ...o, active: o.rate === this.targetRate }));
    }

    get targetRateLabel(): string {
        return this.targetRate < 0 ? "unbounded" : `${integerFormat.format(this.targetRate)}/s`;
    }

    get achievedRateLabel(): string {
        return integerFormat.format(Math.round(this.achievedRate));
    }

    get totalCellsLabel(): string {
        return integerFormat.format(this.totalCells);
    }

    get rowTicksPerSecondLabel(): string {
        return integerFormat.format(Math.round(this.achievedRate / CELLS_PER_ROW_TICK));
    }

    get fpsLabel(): string {
        return this.fps.toFixed(1);
    }

    get avgRepaintLabel(): string {
        return this.avgRepaintMs.toFixed(2);
    }

    get maxRepaintLabel(): string {
        return this.maxRepaintMs.toFixed(2);
    }

    get avgFrameCostLabel(): string {
        return this.avgFrameCostMs.toFixed(2);
    }

    // --- actions ----------------------------------------------------------------------------------
    onReady = (api: GlideDataGridApi): void => {
        this.api = api;
    };

    toggleRunning = (): void => {
        this.running = !this.running;
        if (this.running) {
            this.lastFrameTs = 0;
            this.cellCredit = 0;
            this.resetWindow(performance.now());
            this.scheduleTick();
        } else {
            this.cancelTick();
        }
    };

    setRate = (rate: number): void => {
        this.targetRate = rate;
        this.cellCredit = 0;
        this.adaptiveBatch = INITIAL_ADAPTIVE_BATCH;
    };

    onHighlightChange = (event: Event): void => {
        this.highlight = (event.target as HTMLInputElement).checked;
        // The real switch lives in the (non-tracked) data module -- `getCellContent` is invoked at
        // paint time, outside any tracking frame, so a `@tracked` read there would register no
        // dependency at all. The tracked field above exists only to keep the checkbox rendered.
        setHighlightUpdates(this.highlight);
    };

    resetStats = (): void => {
        this.totalCells = 0;
        this.achievedRate = 0;
        this.fps = 0;
        this.avgRepaintMs = 0;
        this.maxRepaintMs = 0;
        this.avgFrameCostMs = 0;
        this.cellsPerFrame = 0;
        this.resetWindow(performance.now());
    };

    // --- the ticker -------------------------------------------------------------------------------
    private resetWindow(now: number): void {
        this.windowStart = now;
        this.windowFrames = 0;
        this.windowCells = 0;
        this.windowRepaintMs = 0;
        this.windowMaxRepaintMs = 0;
        this.windowFrameCostMs = 0;
    }

    /**
     * Schedules the next tick on `requestAnimationFrame`, with a `setTimeout` guard racing it.
     * Whichever fires first runs the tick and cancels the other.
     *
     * rAF alone is the right primary: it is what source's `rapid-updates` story uses, and it keeps
     * the ticker in step with the compositor so `updateCells` repaints once per painted frame. But
     * **Chrome does not run rAF at all while a document is hidden** (`document.visibilityState ===
     * "hidden"`, which includes a fully occluded window, not just a background tab), so an
     * rAF-only ticker silently freezes with the UI still saying "streaming". The guard keeps the
     * stream alive at whatever rate the timer is throttled to, and `driver` below says which one is
     * actually delivering ticks so the measured numbers can be read honestly.
     */
    private scheduleTick(): void {
        this.rafId = requestAnimationFrame(ts => {
            this.setDriver("rAF");
            this.frame(ts);
        });
        this.timerId = window.setTimeout(() => {
            this.setDriver("timer");
            this.frame(performance.now());
        }, TIMER_FALLBACK_MS);
    }

    /**
     * Compare-and-set, not a plain assignment. `@tracked` setters dirty their tag **unconditionally**
     * — assigning the same value still invalidates every binding that consumed it and schedules a
     * revalidation. `driver` is written from inside the ticker, so an unguarded `this.driver = "rAF"`
     * would push a Glimmer revalidation into every one of the 60 frames a second this loop already
     * has a budget for. It genuinely changes at most twice per visibility transition.
     */
    private setDriver(kind: "rAF" | "timer"): void {
        if (this.driver !== kind) this.driver = kind;
    }

    private cancelTick(): void {
        if (this.rafId !== 0) cancelAnimationFrame(this.rafId);
        if (this.timerId !== 0) clearTimeout(this.timerId);
        this.rafId = 0;
        this.timerId = 0;
    }

    private readonly frame = (now: number): void => {
        this.cancelTick();
        if (!this.running) return;
        this.scheduleTick();

        const dt = this.lastFrameTs === 0 ? 1 / 60 : Math.min(0.25, (now - this.lastFrameTs) / 1000);
        this.lastFrameTs = now;

        // How many cells this frame may touch. Throttled modes carry the unspent credit forward so
        // a 1,000 cells/sec target really is ~1,000 a second and not "one batch per frame".
        //
        // The credit is drained in whole *row ticks*, not whole cells, and that distinction is
        // load-bearing at low rates: a row tick is indivisible (9 cells), so a frame that banks
        // fewer than 9 cells of credit can do nothing at all. Deducting the cells it could not
        // spend would quietly throw them away — at 1,000/s and 120 fps each frame earns ~8.3 cells,
        // so almost every frame would forfeit its whole budget and the measured rate came out at
        // ~430/s against a 1,000/s target. Rounding down to row ticks and deducting only what was
        // actually spent lets the remainder accumulate until it buys a tick.
        const target = this.targetRate;
        let rowTicks: number;
        if (target < 0) {
            rowTicks = Math.floor(this.adaptiveBatch / CELLS_PER_ROW_TICK);
        } else {
            this.cellCredit += target * dt;
            rowTicks = Math.floor(this.cellCredit / CELLS_PER_ROW_TICK);
            this.cellCredit -= rowTicks * CELLS_PER_ROW_TICK;
        }

        if (rowTicks <= 0) {
            this.windowFrames++;
            this.maybePublishStats(now);
            return;
        }

        const frameStart = performance.now();

        // 1. Mutate the backing store. Rows advance by a fixed stride rather than at random: 57 is
        //    coprime with 10,000 so the walk covers every row, it costs no PRNG call per row, and it
        //    guarantees the visible window is hit regularly (uniform random only does so on average).
        const batch = this.batch;
        batch.length = 0;
        let poolIndex = 0;
        for (let i = 0; i < rowTicks; i++) {
            const row = this.nextRow;
            this.nextRow = (this.nextRow + 57) % STREAMING_ROW_COUNT;
            tickRow(row, frameStart);
            for (let c = 0; c < STREAMING_UPDATING_COLUMNS.length; c++) {
                let slot = this.pool[poolIndex];
                if (slot === undefined) {
                    slot = { cell: [0, 0] };
                    this.pool[poolIndex] = slot;
                }
                slot.cell[0] = STREAMING_UPDATING_COLUMNS[c]!;
                slot.cell[1] = row;
                batch.push(slot);
                poolIndex++;
            }
        }

        // 2. Tell the grid exactly what changed. Synchronous damage repaint; of this list, only the
        //    cells actually on screen are re-drawn.
        const repaintStart = performance.now();
        this.api?.updateCells(batch);
        const frameEnd = performance.now();

        const repaintMs = frameEnd - repaintStart;
        this.windowFrames++;
        this.windowCells += batch.length;
        this.windowRepaintMs += repaintMs;
        this.windowMaxRepaintMs = Math.max(this.windowMaxRepaintMs, repaintMs);
        this.windowFrameCostMs += frameEnd - frameStart;

        // Adaptive mode: converge on the largest batch that still fits comfortably inside a frame.
        // This is what makes "Max" a measurement rather than a hardcoded claim.
        if (target < 0) {
            const cost = frameEnd - frameStart;
            if (cost < 6) this.adaptiveBatch = Math.min(MAX_ADAPTIVE_BATCH, Math.ceil(this.adaptiveBatch * 1.3));
            else if (cost > 12)
                this.adaptiveBatch = Math.max(MIN_ADAPTIVE_BATCH, Math.floor(this.adaptiveBatch * 0.75));
        }

        this.maybePublishStats(now);
    };

    private maybePublishStats(now: number): void {
        const elapsed = now - this.windowStart;
        if (elapsed < STATS_INTERVAL_MS) return;

        const seconds = elapsed / 1000;
        this.achievedRate = this.windowCells / seconds;
        this.fps = this.windowFrames / seconds;
        this.avgRepaintMs = this.windowFrames === 0 ? 0 : this.windowRepaintMs / this.windowFrames;
        this.maxRepaintMs = this.windowMaxRepaintMs;
        this.avgFrameCostMs = this.windowFrames === 0 ? 0 : this.windowFrameCostMs / this.windowFrames;
        this.cellsPerFrame = this.windowFrames === 0 ? 0 : Math.round(this.windowCells / this.windowFrames);
        this.totalCells += this.windowCells;

        // Mirrored onto the DOM so a browser-automation script can read the live numbers without
        // scraping formatted text -- `javascript_tool` runs in an isolated world where page globals
        // are invisible, so the DOM is the only reliable bridge out (PORTING-NOTES.md, Phase 6).
        const el = document.querySelector("[data-test-streaming-stats]");
        if (el !== null) {
            el.setAttribute("data-rate", String(Math.round(this.achievedRate)));
            el.setAttribute("data-fps", this.fps.toFixed(1));
            el.setAttribute("data-repaint-ms", this.avgRepaintMs.toFixed(3));
            el.setAttribute("data-max-repaint-ms", this.maxRepaintMs.toFixed(3));
            el.setAttribute("data-frame-ms", this.avgFrameCostMs.toFixed(3));
            el.setAttribute("data-cells-per-frame", String(this.cellsPerFrame));
            el.setAttribute("data-total", String(this.totalCells));
            el.setAttribute("data-adaptive-batch", String(this.adaptiveBatch));
            el.setAttribute("data-driver", this.driver);
        }

        this.resetWindow(now);
    }

    willDestroy(): void {
        super.willDestroy();
        this.running = false;
        this.cancelTick();
    }

    <template>
        <div class="gdg-streaming">
            <div class="gdg-streaming__controls">
                <button
                    type="button"
                    class="gdg-streaming__primary"
                    data-test-streaming-toggle
                    {{on "click" this.toggleRunning}}
                >
                    {{if this.running "Stop stream" "Start stream"}}
                </button>

                <span class="gdg-streaming__group" data-test-streaming-rates>
                    <span class="gdg-streaming__group-label">Target</span>
                    {{#each this.rateButtons as |option|}}
                        <button
                            type="button"
                            class="gdg-streaming__rate {{if option.active 'is-active'}}"
                            data-test-streaming-rate={{option.label}}
                            {{on "click" (fn this.setRate option.rate)}}
                        >
                            {{option.label}}
                        </button>
                    {{/each}}
                </span>

                <label class="gdg-streaming__checkbox">
                    <input
                        type="checkbox"
                        checked={{this.highlight}}
                        data-test-streaming-highlight
                        {{on "change" this.onHighlightChange}}
                    />
                    Highlight updates
                </label>

                <button class="btn btn-xs" type="button" data-test-streaming-reset {{on "click" this.resetStats}}>Reset
                    stats</button>

                <span class="gdg-streaming__note">
                    {{this.rows}}
                    rows &times;
                    {{this.columns.length}}
                    columns &middot;
                    {{this.cellsPerRowTick}}
                    cells per row tick
                </span>
            </div>

            <div class="gdg-streaming__stats" data-test-streaming-stats>
                <div class="gdg-streaming__stat">
                    <span class="gdg-streaming__stat-label">Cells / sec (measured)</span>
                    <span class="gdg-streaming__stat-value" data-test-streaming-achieved>
                        {{this.achievedRateLabel}}
                    </span>
                    <span class="gdg-streaming__stat-sub">target {{this.targetRateLabel}}</span>
                </div>
                <div class="gdg-streaming__stat">
                    <span class="gdg-streaming__stat-label">Ticks / sec ({{this.driver}})</span>
                    <span class="gdg-streaming__stat-value">{{this.fpsLabel}}</span>
                    <span class="gdg-streaming__stat-sub">{{this.cellsPerFrame}} cells/tick</span>
                </div>
                <div class="gdg-streaming__stat">
                    <span class="gdg-streaming__stat-label">Damage repaint</span>
                    <span class="gdg-streaming__stat-value">{{this.avgRepaintLabel}} ms</span>
                    <span class="gdg-streaming__stat-sub">peak {{this.maxRepaintLabel}} ms</span>
                </div>
                <div class="gdg-streaming__stat">
                    <span class="gdg-streaming__stat-label">Total frame cost</span>
                    <span class="gdg-streaming__stat-value">{{this.avgFrameCostLabel}} ms</span>
                    <span class="gdg-streaming__stat-sub">mutate + updateCells</span>
                </div>
                <div class="gdg-streaming__stat">
                    <span class="gdg-streaming__stat-label">Cells updated</span>
                    <span class="gdg-streaming__stat-value">{{this.totalCellsLabel}}</span>
                    <span class="gdg-streaming__stat-sub">{{this.rowTicksPerSecondLabel}} rows/sec</span>
                </div>
            </div>

            <div class="gdg-streaming__grid">
                <GlideDataGrid
                    @columns={{this.columns}}
                    @rows={{this.rows}}
                    @getCellContent={{this.getCellContent}}
                    @getCellRenderer={{this.getCellRenderer}}
                    @onReady={{this.onReady}}
                    @rowMarkers="number"
                    @groupHeaderHeight={{28}}
                    @headerHeight={{34}}
                />
            </div>
        </div>
    </template>
}
