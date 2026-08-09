// Async / paged data source demo -- Phase 8c.
//
// 100,000 rows that do not exist in memory. Rows arrive a page at a time from a simulated backend as
// you scroll; everything not yet loaded draws as a `Loading` cell, and each page that lands repaints
// exactly its own rows via a **damage** redraw rather than a full repaint.
//
// This is the second half of the port's dual-path reactivity model, and the deliberate opposite of
// `<TrackingDemo>`:
//
//   <TrackingDemo>  -- `recordsSource`, eager projection inside the tracking frame, `@tracked`
//                      mutations repaint automatically. For data you hold in memory.
//   <AsyncDemo>     -- `AsyncRecordsSource`, a lazy buffer of plain objects, zero tracked state,
//                      repaints driven imperatively by `updateCells()`. For data you don't.
//
// See the cookbook's "When you can't hold the data in memory" for the consumer-facing version of that
// split, and PORTING-NOTES.md's "Autotracking → canvas" for the mechanism.
//
// The two grid args that make this work are both new in Phase 8:
//   @onVisibleRegionChanged -- tells the source which rows are on screen, so it knows what to fetch
//   @onReady                -- hands the source the `updateCells` API it repaints arrived rows with
// Without the second one the pages still load, but nothing would show them until some unrelated
// event happened to repaint.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid, { type GlideDataGridApi } from "glide-data-grid-ember/components/glide-data-grid";
import { AsyncRecordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, getCellRenderer, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";
import { ASYNC_DEMO_ROWS, fetchPage, type EmployeeRecord } from "test-app/utils/async-demo-data";

// Module scope: every one of these is handed to `<GlideDataGrid>` and must be identity-stable, or
// the render engine's blit fast path silently stops engaging (PORTING-NOTES.md, standing lesson #1).
const COLUMNS: readonly GridColumn[] = [
    { id: "id", title: "Row", width: 90, icon: "headerRowID" },
    { id: "name", title: "Name", width: 190, icon: "headerString" },
    { id: "email", title: "Email", width: 280, icon: "headerEmail" },
    { id: "team", title: "Team", width: 130, icon: "headerString" },
    { id: "score", title: "Score", width: 100, icon: "headerNumber" },
    { id: "startedAt", title: "Started", width: 130, icon: "headerDate" },
];

const PAGE_SIZE = 100;
const MAX_CONCURRENCY = 4;

// Projects one loaded record into a cell. Unlike `recordsSource`'s `toCell`, this one runs on the
// paint path (a lazy source has nowhere else to put it), so it stays a plain field read plus at most
// a `String()` -- no formatting, no parsing, no allocation beyond the cell itself.
function toCell(record: EmployeeRecord, col: number): GridCell {
    switch (col) {
        case 0:
            return { kind: GridCellKind.RowID, allowOverlay: false, data: String(record.id) };
        case 1:
            return { kind: GridCellKind.Text, allowOverlay: true, data: record.name, displayData: record.name };
        case 2:
            return { kind: GridCellKind.Text, allowOverlay: false, data: record.email, displayData: record.email };
        case 3:
            return { kind: GridCellKind.Text, allowOverlay: false, data: record.team, displayData: record.team };
        case 4:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: record.score,
                displayData: String(record.score),
            };
        default:
            return {
                kind: GridCellKind.Text,
                allowOverlay: false,
                data: record.startedAt,
                displayData: record.startedAt,
            };
    }
}

export default class AsyncDemo extends Component {
    /** Simulated round-trip time. Tracked only because a slider drives it -- the grid never reads it. */
    @tracked latencyMs = 400;

    // On-screen instrumentation. None of this is read by the grid; it exists so the async behaviour
    // is observable rather than asserted.
    @tracked pagesRequested = 0;
    @tracked pagesLoaded = 0;
    @tracked rowsLoaded = 0;
    @tracked inFlight = 0;
    @tracked peakInFlight = 0;
    @tracked lastPage = "—";
    @tracked visibleRegion = "—";
    @tracked edits = 0;

    /**
     * Constructed **once**, as a class field. `AsyncRecordsSource` owns a row buffer and page state,
     * so unlike the pure decorators it is an object you hold rather than a function you re-call --
     * and its bound instance fields are identity-stable for free, with no `@cached` to remember.
     */
    readonly source = new AsyncRecordsSource<EmployeeRecord>({
        columns: COLUMNS,
        rows: ASYNC_DEMO_ROWS,
        pageSize: PAGE_SIZE,
        maxConcurrency: MAX_CONCURRENCY,
        toCell,
        getRowData: async ([start, end]) => {
            // Safe to write tracked state here: this is an async callback, never a render pass.
            this.pagesRequested++;
            this.inFlight++;
            this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
            try {
                const { rows, elapsedMs } = await fetchPage(start, end, this.latencyMs);
                this.pagesLoaded++;
                this.rowsLoaded += rows.length;
                this.lastPage = `rows ${start}–${end - 1} in ${elapsedMs}ms`;
                return rows;
            } finally {
                this.inFlight--;
            }
        },
        // Mutates the buffered record in place; the source damages that one cell itself.
        onCellEdited: (record, col, value) => {
            // `value` is the full `GridCell` union, so narrow on `kind` rather than probing `data`
            // (a `LoadingCell` has none).
            if (col === 1 && value.kind === GridCellKind.Text) {
                record.name = value.data;
                this.edits++;
            }
        },
    });

    readonly columns = COLUMNS;

    get rows(): number {
        return this.source.rows;
    }

    get loadedPercent(): string {
        return ((this.rowsLoaded / ASYNC_DEMO_ROWS) * 100).toFixed(2);
    }

    /**
     * Hands the source the imperative repaint API. This is the link that makes an arrived page
     * visible -- the source calls `updateCells` with just the rows it filled in.
     */
    handleReady = (api: GlideDataGridApi): void => {
        this.source.attach(api);
    };

    /**
     * Forwarded straight to the source, plus a readout. Deduped and microtask-deferred by the grid,
     * so setting tracked state here is safe even though a draw can originate inside a render pass.
     */
    handleVisibleRegionChanged = (region: { x: number; y: number; width: number; height: number }): void => {
        this.visibleRegion = `cols ${region.x}–${region.x + region.width - 1}, rows ${region.y}–${
            region.y + region.height - 1
        }`;
        this.source.onVisibleRegionChanged(region);
    };

    /** Drops every loaded page, as a real app would after changing a server-side filter. */
    invalidate = (): void => {
        this.rowsLoaded = 0;
        this.pagesLoaded = 0;
        this.source.invalidate();
    };

    updateLatency = (event: Event): void => {
        this.latencyMs = Number((event.target as HTMLInputElement).value);
    };

    <template>
        <div style="display: flex; flex-direction: column; gap: 10px; height: 100%;">
            <p style="margin: 0; font: 13px system-ui; color: #444;">
                <strong>{{ASYNC_DEMO_ROWS}}</strong>
                rows that are not in memory. Scroll: pages of
                {{PAGE_SIZE}}
                load on demand, unloaded rows draw as loading placeholders, and each page that arrives repaints only its
                own rows via
                <code>updateCells()</code>
                — no full redraw, and no
                <code>@tracked</code>
                data anywhere. The Name column is editable.
            </p>

            <div
                style="flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font: 12px system-ui; border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px;"
            >
                <label style="display: flex; align-items: center; gap: 6px;">
                    Latency
                    <input
                        data-test-latency
                        type="range"
                        min="0"
                        max="2000"
                        step="50"
                        value={{this.latencyMs}}
                        {{on "input" this.updateLatency}}
                    />
                    <span style="width: 52px;">{{this.latencyMs}}ms</span>
                </label>
                <span data-test-pages>Pages:
                    <strong>{{this.pagesLoaded}}</strong>
                    /
                    {{this.pagesRequested}}
                    requested</span>
                <span data-test-inflight>In flight:
                    <strong>{{this.inFlight}}</strong>
                    (peak
                    {{this.peakInFlight}}, cap
                    {{MAX_CONCURRENCY}})</span>
                <span data-test-rows-loaded>Rows loaded:
                    <strong>{{this.rowsLoaded}}</strong>
                    ({{this.loadedPercent}}%)</span>
                <span data-test-edits>Edits: <strong>{{this.edits}}</strong></span>
                <button class="btn btn-xs" type="button" data-test-invalidate {{on "click" this.invalidate}}>
                    Invalidate (refetch)
                </button>
            </div>

            <div style="flex: 0 0 auto; font: 12px system-ui; color: #666;">
                <span data-test-last-page>Last page: {{this.lastPage}}</span>
                &nbsp;·&nbsp;
                <span data-test-visible>Visible: {{this.visibleRegion}}</span>
            </div>

            <div style="flex: 1 1 auto; min-height: 0;">
                <GlideDataGrid
                    @columns={{this.columns}}
                    @rows={{this.rows}}
                    @getCellContent={{this.source.getCellContent}}
                    @onCellsEdited={{this.source.onCellsEdited}}
                    @onVisibleRegionChanged={{this.handleVisibleRegionChanged}}
                    @onReady={{this.handleReady}}
                    @getCellRenderer={{getCellRenderer}}
                    @rowMarkers="number"
                />
            </div>
        </div>
    </template>
}
