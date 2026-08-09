// The **Apollo (faked)** demo tab.
//
// WHAT IT IS FOR
// ---------------------------------------------------------------------------------------------
// The guide's "Ember Data, GraphQL, and Apollo" chapter states one performance consequence that had
// never been observed in this workspace: `recordsSource` keys its per-row caches on the `records`
// **array identity**, and Apollo's `InMemoryCache` hands you a new array on every write, so a
// subscription that changes **one field on one entity** re-projects **every** row. This tab puts
// that number on screen next to the number the reconciled path produces, which is 1.
//
// Two grids, same data, same projection work, different record types:
//
//   * **Raw** — records are the Apollo result objects themselves. New array every tick.
//   * **Reconciled** — records are tracked `PersonRow` view models keyed by id, and the array keeps
//     its identity while membership and order do not change.
//
// Both counters are live at once because both `@cached` getters are consumed by every render (the
// readouts read `.rows`, and both grids are rendered). Neither number is a benchmark: they are exact
// counts of `toCell` calls, taken by `app/utils/apollo-fake.ts`.
//
// HONEST FRAMING, which the copy on screen repeats: this is a **trade-off, not a defect**, and it is
// **off the paint path**. `getCellContent` stays an O(1) array index in both grids; what repeats is
// `toCell`, a function the consumer wrote.
//
// NO APOLLO DEPENDENCY. `@apollo/client` and `glimmer-apollo` are deliberately not installed — see
// `app/utils/apollo-fake.ts`'s header for exactly which semantics the local fake reproduces and
// which it does not.
//
// COUNTER MECHANICS, same as `scale-proof.gts`: the counters are plain untracked numbers because
// `toCell` runs inside the caller's tracking frame, where writing tracked state would trip Ember's
// backtracking-rerender assertion. So every action marks a baseline, causes the change, and reads
// the counters back in a `next()` turn — i.e. after the render that change produced.
import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { next } from "@ember/runloop";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { getCellRenderer, GridCellKind, type GridCell } from "glide-data-grid-ember/rendering/index";
import {
    apolloPersonToCell,
    buildPeople,
    FakeInMemoryCache,
    FakePersonSubscription,
    FakeQueryResult,
    fakeMutatePersonField,
    markProjectionBaseline,
    PEOPLE_COLUMNS,
    PEOPLE_ROW_COUNT,
    personRowToCell,
    readProjection,
    reconcilePeople,
    type IdentityReport,
    type PeopleQueryData,
    type Person,
    type PersonRow,
} from "test-app/utils/apollo-fake";

/** Module scope: one identity for the life of the page, so an empty result never looks like a
 * change. This is the guide's chapter-9 rule applied to the one place it is easy to miss. */
const NONE: readonly Person[] = [];
const NO_ROWS: readonly PersonRow[] = [];

/** How long the fake initial fetch takes, so `loading` is a state the template actually renders. */
const FETCH_DELAY_MS = 700;
/** How long the fake mutation takes before its response lands in the cache. */
const MUTATION_DELAY_MS = 350;

const TICK_OPTIONS: readonly number[] = [1000, 500, 250, 100];

interface Report {
    readonly label: string;
    readonly rawRows: number;
    readonly rawCells: number;
    readonly reconciledRows: number;
    readonly reconciledCells: number;
    readonly total: number;
    readonly ms: string;
}

function cellText(value: GridCell): string {
    return value.kind === GridCellKind.Text ? value.data : "";
}

export default class ApolloDemo extends Component {
    readonly rowCount = PEOPLE_ROW_COUNT;
    readonly columns = PEOPLE_COLUMNS;
    readonly getCellRenderer = getCellRenderer;

    /** The immutable store. One write produces one new entity, N-1 preserved siblings, a new array. */
    readonly cache = new FakeInMemoryCache(buildPeople());

    // --- the reconcile layer ----------------------------------------------------------------------
    // Reconciling in a getter would read-then-write tracked state inside a tracking frame, which is
    // exactly what the backtracking assertion catches. So it happens here, in the cache callback,
    // which runs from a timer or a click handler — never inside a render.
    #byId = new Map<string, PersonRow>();
    @tracked reconciledRows: readonly PersonRow[] = NO_ROWS;

    absorb = (data: PeopleQueryData): void => {
        this.reconciledRows = reconcilePeople(this.reconciledRows, this.#byId, data.people);
    };

    /**
     * A **class field**, not a getter — mirroring `useQuery(this, () => [PEOPLE_QUERY])`. Its
     * `loading` / `data` / `error` are `@tracked`, so reading `.data` inside the `@cached` getters
     * below is what registers the dependency that later repaints both grids.
     */
    query = new FakeQueryResult(this.cache, { delayMs: FETCH_DELAY_MS, onData: this.absorb });

    /**
     * Stands in for `useSubscription(this, () => [...])`. One field, one entity, every tick.
     *
     * The tick brackets its own measurement: mark the baseline, let the cache write happen, then read
     * both counters back after the render. Nothing about the grid is touched imperatively.
     */
    readonly subscription = new FakePersonSubscription(this.cache, {
        intervalMs: 500,
        onBeforeTick: () => {
            markProjectionBaseline();
            this.#t0 = performance.now();
        },
        onAfterTick: () => {
            const row = (this.subscription.nextRow + PEOPLE_ROW_COUNT - 1) % PEOPLE_ROW_COUNT;
            this.finish(`Subscription tick — one field on row ${row}`, this.cache.lastIdentity);
        },
    });

    @tracked running = false;
    @tracked tickMs = 500;
    @tracked report: Report | undefined = undefined;
    @tracked identity: IdentityReport | undefined = undefined;
    @tracked pendingMutations = 0;

    #t0 = 0;
    #editSerial = 0;

    // --- the two sources --------------------------------------------------------------------------

    /**
     * Fed straight from the Apollo result. Every cache write hands this a **new array**, so
     * `recordsSource` rebuilds every per-row cache and re-projects every row.
     */
    @cached
    get rawSource() {
        return recordsSource({
            records: this.query.data?.people ?? NONE,
            columns: PEOPLE_COLUMNS,
            toCell: apolloPersonToCell,
            onCellEdited: this.editRawPerson,
        });
    }

    /**
     * Fed from tracked view models. The array identity survives a tick, so the per-row caches
     * survive too and exactly one of them is dirtied — by the single `row.raw = ...` write inside
     * `PersonRow.apply`.
     */
    @cached
    get reconciledSource() {
        return recordsSource({
            records: this.reconciledRows,
            columns: PEOPLE_COLUMNS,
            toCell: personRowToCell,
            onCellEdited: this.editReconciledRow,
        });
    }

    // --- measurement ------------------------------------------------------------------------------

    /**
     * Reads both counters back after the render the change caused.
     *
     * `identity` is passed in rather than read off the cache, because a change that never touched
     * the cache (the local tracked edit) must show *no* identity report rather than a stale one.
     */
    private finish(label: string, identity: IdentityReport | undefined): void {
        const ms = performance.now() - this.#t0;
        this.identity = identity;
        // `next` is deliberate, and is the same call `scale-proof.gts` makes for the same reason: the
        // counters must be read in the turn *after* the render this change caused. `runTask` from
        // ember-lifeline would be a plain timer, a weaker guarantee, and this workspace has no
        // ember-lifeline dependency.
        // eslint-disable-next-line ember/no-runloop
        next(this, () => {
            const raw = readProjection("raw");
            const rec = readProjection("reconciled");
            this.report = {
                label,
                rawRows: raw.rows,
                rawCells: raw.cells,
                reconciledRows: rec.rows,
                reconciledCells: rec.cells,
                total: raw.cellsTotal + rec.cellsTotal,
                ms: ms.toFixed(1),
            };
        });
    }

    /** Mark → change → read back, with no cache write involved. */
    private measureLocal(label: string, change: () => void): void {
        markProjectionBaseline();
        this.#t0 = performance.now();
        change();
        this.finish(label, undefined);
    }

    // --- controls ---------------------------------------------------------------------------------

    /** `{ ms, isSelected }`, because a strict-mode template has no `eq` helper in scope. */
    get tickChoices(): readonly { readonly ms: number; readonly isSelected: boolean }[] {
        return TICK_OPTIONS.map(ms => ({ ms, isSelected: ms === this.tickMs }));
    }

    toggleSubscription = (): void => {
        if (this.subscription.running) {
            this.subscription.stop();
        } else {
            this.subscription.start();
        }
        this.running = this.subscription.running;
    };

    tickOnce = (): void => {
        this.subscription.tickOnce();
    };

    setTickRate = (event: Event): void => {
        const value = Number((event.target as HTMLSelectElement).value);
        if (!Number.isFinite(value)) return;
        this.tickMs = value;
        this.subscription.setIntervalMs(value);
    };

    /**
     * THE CONTRAST. A tracked write on one view model, with **no cache write at all** — so the raw
     * grid sees nothing (0 rows) and the reconciled grid re-projects exactly 1.
     *
     * It deliberately puts the view model out of step with the cache, which is fine here and is
     * itself worth seeing: the next subscription tick that touches this row reconciles it back.
     */
    localTrackedEdit = (): void => {
        const row = this.reconciledRows[0];
        if (row === undefined) return;
        this.#editSerial++;
        const serial = this.#editSerial;
        this.measureLocal("Local tracked edit on row 0 — no cache write", () => {
            row.raw = { ...row.raw, name: `${row.raw.name.replace(/ \(local #\d+\)$/, "")} (local #${serial})` };
        });
    };

    // --- the mutation round trip ------------------------------------------------------------------
    // `onCellsEdited` -> mutate -> cache write -> new result -> repaint. One direction, no local
    // copy: the grid never mutates your data, so nothing is written to the record it handed back.

    private mutate(id: string, value: string): void {
        this.pendingMutations++;
        fakeMutatePersonField(this.cache, id, "role", value, {
            delayMs: MUTATION_DELAY_MS,
            onBeforeWrite: () => {
                markProjectionBaseline();
                this.#t0 = performance.now();
            },
            onAfterWrite: () => {
                this.pendingMutations--;
                this.finish("Mutation response landed in the cache", this.cache.lastIdentity);
            },
        });
    }

    editRawPerson = (person: Person, col: number, value: GridCell): void => {
        if (col !== 2) return;
        this.mutate(person.id, cellText(value));
    };

    editReconciledRow = (row: PersonRow, col: number, value: GridCell): void => {
        if (col !== 2) return;
        this.mutate(row.id, cellText(value));
    };

    willDestroy(): void {
        super.willDestroy();
        this.subscription.stop();
        this.query.stop();
    }

    <template>
        <div style="height: 100%; overflow: auto; font: 13px/1.5 system-ui;">
            <section style="display: flex; flex-direction: column; gap: 10px; padding: 2px 2px 20px;">
                <h3 style="margin: 0; font: 600 15px system-ui;">
                    Apollo (faked) — what a one-field subscription update actually costs
                </h3>
                <p style="margin: 0; color: #444; max-width: 92ch;">
                    No
                    <code>@apollo/client</code>
                    and no
                    <code>glimmer-apollo</code>
                    here — a local fake reproduces the semantics that matter:
                    <code>InMemoryCache</code>
                    is
                    <strong>immutable</strong>, so a change produces a
                    <strong>new</strong>
                    object for the changed entity,
                    <strong>referentially identical</strong>
                    objects for its unchanged siblings, and a
                    <strong>new containing array</strong>. The subscription below changes
                    <em>one field on one entity</em>
                    per tick.
                    <code>recordsSource</code>
                    keys its per-row caches on the
                    <em>array</em>
                    identity, so the grid fed straight from the result re-projects every row. That is a real trade-off,
                    not a defect, and it is
                    <strong>off the paint path</strong>:
                    <code>getCellContent</code>
                    stays an O(1) array index in both grids. What repeats is
                    <code>toCell</code>, a function you wrote.
                </p>

                {{#if this.query.loading}}
                    <div
                        data-test-apollo-loading
                        style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; color: #666;"
                    >
                        Loading… (the fake initial fetch is a real
                        <code>Promise</code>
                        behind a
                        {{FETCH_DELAY_MS}}ms delay, so
                        <code>loading</code>
                        is a state and not a formality)
                    </div>
                {{else}}
                    <div
                        style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border: 1px solid #ddd; border-radius: 6px; padding: 10px;"
                    >
                        <button
                            class="btn btn-xs"
                            type="button"
                            data-test-apollo-toggle
                            {{on "click" this.toggleSubscription}}
                        >
                            {{if this.running "Stop subscription" "Start subscription"}}
                        </button>
                        <button class="btn btn-xs" type="button" data-test-apollo-tick {{on "click" this.tickOnce}}>
                            Tick once
                        </button>
                        <label for="apollo-rate">every</label>
                        <select id="apollo-rate" data-test-apollo-rate {{on "change" this.setTickRate}}>
                            {{#each this.tickChoices as |choice|}}
                                <option value={{choice.ms}} selected={{choice.isSelected}}>
                                    {{choice.ms}}ms
                                </option>
                            {{/each}}
                        </select>
                        <button
                            class="btn btn-xs"
                            type="button"
                            data-test-apollo-local
                            {{on "click" this.localTrackedEdit}}
                        >
                            Local tracked edit (no cache write)
                        </button>
                        <span style="color: #888;">
                            rows:
                            {{this.rowCount}}
                            · columns:
                            {{this.columns.length}}
                            {{#if this.pendingMutations}}
                                · mutations in flight:
                                {{this.pendingMutations}}
                            {{/if}}
                        </span>
                    </div>

                    {{#if this.report}}
                        <div
                            data-test-apollo-report
                            style="border: 1px solid #cfe; background: #f4fbff; border-radius: 6px; padding: 10px;"
                        >
                            <div style="font-weight: 600;">{{this.report.label}}</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 24px; margin-top: 6px;">
                                <div>
                                    <div style="color: #666;">Raw Apollo result array</div>
                                    <div>
                                        rows re-projected:
                                        <strong data-test-apollo-raw-rows style="font-size: 18px;">
                                            {{this.report.rawRows}}
                                        </strong>
                                        of
                                        {{this.rowCount}}
                                    </div>
                                    <div style="color: #666;">
                                        <code>toCell</code>
                                        calls:
                                        {{this.report.rawCells}}
                                    </div>
                                </div>
                                <div>
                                    <div style="color: #666;">Reconciled tracked rows</div>
                                    <div>
                                        rows re-projected:
                                        <strong data-test-apollo-reconciled-rows style="font-size: 18px;">
                                            {{this.report.reconciledRows}}
                                        </strong>
                                        of
                                        {{this.rowCount}}
                                    </div>
                                    <div style="color: #666;">
                                        <code>toCell</code>
                                        calls:
                                        {{this.report.reconciledCells}}
                                    </div>
                                </div>
                                {{#if this.identity}}
                                    <div>
                                        <div style="color: #666;">Object identity after that write</div>
                                        <div data-test-apollo-identity>
                                            {{this.identity.changedEntities}}
                                            new entity ·
                                            {{this.identity.preservedEntities}}
                                            siblings still
                                            <code>===</code>
                                        </div>
                                        <div style="color: #666;">
                                            containing array is new:
                                            {{if this.identity.arrayIdentityChanged "yes" "no"}}
                                        </div>
                                    </div>
                                {{/if}}
                                <div>
                                    <div style="color: #666;">change → counter read</div>
                                    <div>{{this.report.ms}}ms</div>
                                    <div style="color: #666;">
                                        <em>wall clock including render scheduling — not a benchmark</em>
                                    </div>
                                    <div style="color: #666;">
                                        <code>toCell</code>
                                        calls since page load:
                                        {{this.report.total}}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {{/if}}

                    <div>
                        <h4 style="margin: 0 0 4px; font: 600 13px system-ui;">
                            1 · Records are the Apollo result objects
                        </h4>
                        <p style="margin: 0 0 6px; color: #666; max-width: 92ch;">
                            <code>records: this.query.data?.people</code>. A new array on every cache write, so every
                            per-row cache is rebuilt. The
                            <em>Role</em>
                            column is editable and round-trips through the fake mutation.
                        </p>
                        <div style="height: 220px;" data-test-apollo-raw-grid>
                            <GlideDataGrid
                                @columns={{this.rawSource.columns}}
                                @rows={{this.rawSource.rows}}
                                @getCellContent={{this.rawSource.getCellContent}}
                                @onCellsEdited={{this.rawSource.onCellsEdited}}
                                @getCellRenderer={{this.getCellRenderer}}
                                @rowMarkers="number"
                            />
                        </div>
                    </div>

                    <div>
                        <h4 style="margin: 0 0 4px; font: 600 13px system-ui;">
                            2 · Records are tracked view models reconciled by id
                        </h4>
                        <p style="margin: 0 0 6px; color: #666; max-width: 92ch;">
                            Same data, same projection work. The reconcile keeps the
                            <strong>same array</strong>
                            while membership and order are unchanged, and each
                            <code>PersonRow</code>
                            holds one
                            <code>@tracked raw</code>
                            guarded by
                            <code>if (this.raw !== raw)</code>
                            — which against Apollo is an exact test, because an unchanged entity is the same object.
                        </p>
                        <div style="height: 220px;" data-test-apollo-reconciled-grid>
                            <GlideDataGrid
                                @columns={{this.reconciledSource.columns}}
                                @rows={{this.reconciledSource.rows}}
                                @getCellContent={{this.reconciledSource.getCellContent}}
                                @onCellsEdited={{this.reconciledSource.onCellsEdited}}
                                @getCellRenderer={{this.getCellRenderer}}
                                @rowMarkers="number"
                            />
                        </div>
                    </div>

                    <p style="margin: 0; color: #444; max-width: 92ch;">
                        <strong>What this does not say.</strong>
                        It does not say the reconcile layer is the default — at a few hundred rows a full re-projection
                        is cheap next to the network round trip that caused it, and the simple version has nothing to
                        maintain. It says where the cost is and what it is proportional to, so you can decide. Where the
                        crossover sits depends on your rows × columns × tick rate and on how much work your
                        <code>toCell</code>
                        does.
                    </p>
                {{/if}}
            </section>
        </div>
    </template>
}
