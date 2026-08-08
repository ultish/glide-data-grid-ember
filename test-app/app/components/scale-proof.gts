// The measurement that closed the addon's old `DATA.md` "Status of this recommendation" question
// (that file is now the cookbook's "Using the grid in Ember" chapter).
//
// That chapter tells every consumer to project rows through a per-row memoized view model, and the addon
// now ships that as `recordsSource`. Up to Phase 8 the *eager-read* half was browser-verified (see
// `tracking-demo.gts`, which this component renders below) but the *per-row memoization* half had
// only been reasoned about, and later measured in Node. This component runs it in a real browser, at
// 1,000 rows, with the recompute counter on screen.
//
// The claim being tested, stated so it can fail: **editing one field re-projects one row, not 1,000.**
//
// The proof keeps `tracking-demo.gts`'s constraints, because they are what make a repaint mean
// something: no `updateCells()`, no `@onCellsEdited`, every cell `allowOverlay: false`, and the
// records array is never mutated in place. Every button below mutates a `@tracked` field on one
// existing `Employee` and then does nothing else. If the canvas changes, autotracking did it; if the
// counter says "1 row", the memoization did it.
//
// The interesting number is deliberately "since the last action", not a cumulative total: a running
// total of `toCell` calls is uninterpretable, whereas "1 of 1000 rows" is not. The "Re-render,
// touching no record" and "Replace the records array" buttons are the two controls that bracket it
// (0 rows and 1,000 rows respectively), so the middle number can be read against something.
//
// Counter mechanics: the counters in `scale-records.ts` are plain untracked numbers, incremented
// inside the projection -- which runs inside the tracking frame, where writing tracked state would
// trip Ember's backtracking assertion. So each action marks a baseline, mutates, and then reads the
// counters back in a `next()` turn, i.e. after the render the mutation caused.
import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { next } from "@ember/runloop";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { getCellRenderer } from "glide-data-grid-ember/rendering/index";
import {
    addPet,
    buildEmployees,
    employeeToCell,
    getScannerCompileCount,
    markProjectionBaseline,
    readProjectionCounters,
    SCALE_COLUMNS,
    type Employee,
} from "test-app/utils/scale-records";

interface Report {
    readonly label: string;
    readonly rows: number;
    readonly cells: number;
    readonly cellsTotal: number;
    readonly ms: string;
    /** Rows that a naive whole-table projection would have rebuilt, for the side-by-side. */
    readonly naiveRows: number;
}

export default class ScaleProof extends Component {
    /** Replaced (never mutated) when rows are added/removed/reordered -- `recordsSource` rule 3. */
    @tracked records: readonly Employee[] = buildEmployees();

    /** Which row the edit buttons target. Defaults to 0 so the repaint is visible without scrolling. */
    @tracked targetRow = 0;

    /** Bumped by the "touch nothing" control, purely so that button causes a real re-render. */
    @tracked rerenderCount = 0;

    @tracked report: Report | undefined = undefined;

    private editSerial = 0;

    constructor(...args: ConstructorParameters<typeof Component>) {
        super(...args);
        markProjectionBaseline();
        // Runs after the first render, so this captures the cold sweep.
        next(this, () => this.captureReport("Initial build (cold)"));
    }

    /**
     * The one call. `@cached` is load-bearing, not style: `recordsSource` reads every record's
     * tracked fields *during* this getter, and those reads are what make a later mutation invalidate
     * the frame that repaints the grid.
     *
     * No `onCellEdited` is passed, so `source.onCellsEdited` is `undefined` and the grid has no write
     * path at all -- see the header for why that matters here.
     */
    @cached
    get source() {
        return recordsSource({
            records: this.records,
            columns: SCALE_COLUMNS,
            toCell: employeeToCell,
        });
    }

    get scannerCompiles(): number {
        return getScannerCompileCount();
    }

    get targetEmployee(): Employee | undefined {
        return this.records[this.targetRow];
    }

    private captureReport(label: string, ms = 0): void {
        const reading = readProjectionCounters();
        this.report = {
            label,
            rows: reading.rows,
            cells: reading.cells,
            cellsTotal: reading.cellsTotal,
            ms: ms.toFixed(1),
            naiveRows: this.records.length,
        };
    }

    /**
     * Mark → mutate → read back after the render. Everything the buttons do goes through here so the
     * measurement is identical in each case.
     */
    private measure(label: string, mutate: () => void): void {
        markProjectionBaseline();
        const t0 = performance.now();
        mutate();
        next(this, () => this.captureReport(label, performance.now() - t0));
    }

    /** THE MEASUREMENT. One tracked write on one record. Expect 1 row. */
    editOneField = (): void => {
        const employee = this.targetEmployee;
        if (employee === undefined) return;
        this.editSerial++;
        const serial = this.editSerial;
        this.measure(`Edited one field on row ${this.targetRow}`, () => {
            employee.name = `${employee.name.replace(/ \(edit #\d+\)$/, "")} (edit #${serial})`;
        });
    };

    /** Same, but through the nested GQL-shaped relation the `object-scan` columns read. */
    addPetToRow = (): void => {
        const employee = this.targetEmployee;
        if (employee === undefined) return;
        this.editSerial++;
        const serial = this.editSerial;
        this.measure(`Added a pet to row ${this.targetRow} (nested relation)`, () => {
            addPet(employee, `Pet${serial}`);
        });
    };

    /** Control #1: a real re-render that touches no record. Expect 0 rows. */
    rerenderOnly = (): void => {
        this.measure("Re-render, touching no record", () => {
            this.rerenderCount++;
        });
    };

    /**
     * Control #2 / the contrast: a new `records` array identity rebuilds every per-row cache, which
     * is exactly the cookbook's "the one way to break it". Expect the full row count. The `Employee`
     * objects are the same instances -- only the array identity changed.
     */
    replaceRecordsArray = (): void => {
        this.measure("Replaced the records array (worst case)", () => {
            this.records = [...this.records];
        });
    };

    updateTargetRow = (event: Event): void => {
        const value = Number((event.target as HTMLInputElement).value);
        if (!Number.isFinite(value)) return;
        this.targetRow = Math.max(0, Math.min(this.records.length - 1, Math.trunc(value)));
    };

    <template>
        <section style="display: flex; flex-direction: column; gap: 10px;">
            <h3 style="margin: 0; font: 600 15px system-ui;">
                Scale proof — {{this.source.rows}} rows through
                <code>recordsSource</code>
            </h3>
            <p style="margin: 0; font: 13px system-ui; color: #444; max-width: 80ch;">
                Same rules as the proof above: no
                <code>updateCells()</code>, no
                <code>@onCellsEdited</code>, every cell
                <code>allowOverlay: false</code>. The claim under test is that editing
                <em>one</em>
                field re-projects
                <em>one</em>
                row rather than all
                {{this.source.rows}}. The "City" and "Pets" columns are dug out of a nested
                GraphQL-shaped payload with
                <code>object-scan</code>, compiled once per column
                (<strong data-test-scanner-compiles>{{this.scannerCompiles}}</strong>
                compiles total, not one per cell) and evaluated inside
                <code>toCell</code>
                — never inside
                <code>getCellContent</code>, which is a single array index.
            </p>

            <div
                style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; font: 13px system-ui; border: 1px solid #ddd; border-radius: 6px; padding: 10px;"
            >
                <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label for="sp-row">Target row</label>
                    <input
                        id="sp-row"
                        data-test-scale-row
                        type="number"
                        min="0"
                        style="width: 90px;"
                        value={{this.targetRow}}
                        {{on "change" this.updateTargetRow}}
                    />
                </div>
                <button type="button" data-test-scale-edit {{on "click" this.editOneField}}>
                    Edit one field
                </button>
                <button type="button" data-test-scale-add-pet {{on "click" this.addPetToRow}}>
                    Add a pet (nested)
                </button>
                <button type="button" data-test-scale-noop {{on "click" this.rerenderOnly}}>
                    Re-render, touch nothing
                </button>
                <button type="button" data-test-scale-replace {{on "click" this.replaceRecordsArray}}>
                    Replace records array (worst case)
                </button>
                <span style="color: #888;">re-renders: {{this.rerenderCount}}</span>
            </div>

            {{#if this.report}}
                <div
                    data-test-scale-report
                    style="font: 13px/1.5 system-ui; border: 1px solid #cfe; background: #f4fbff; border-radius: 6px; padding: 10px;"
                >
                    <div style="font-weight: 600;">{{this.report.label}}</div>
                    <div>
                        Rows re-projected since that action:
                        <strong data-test-scale-rows style="font-size: 16px;">{{this.report.rows}}</strong>
                        of
                        {{this.report.naiveRows}}
                        <span style="color: #666;">
                            (a naive whole-table projection would have rebuilt all
                            {{this.report.naiveRows}})
                        </span>
                    </div>
                    <div>
                        <code>toCell</code>
                        calls since that action:
                        <strong data-test-scale-cells>{{this.report.cells}}</strong>
                        · cumulative since page load:
                        <span data-test-scale-total>{{this.report.cellsTotal}}</span>
                    </div>
                    <div style="color: #666;">
                        mutation → counter read:
                        {{this.report.ms}}
                        ms
                        <em>(wall clock including render scheduling — not a benchmark)</em>
                    </div>
                </div>
            {{/if}}

            <div style="height: 340px;">
                <GlideDataGrid
                    @columns={{this.source.columns}}
                    @rows={{this.source.rows}}
                    @getCellContent={{this.source.getCellContent}}
                    @getCellRenderer={{getCellRenderer}}
                    @rowMarkers="number"
                />
            </div>
        </section>
    </template>
}
