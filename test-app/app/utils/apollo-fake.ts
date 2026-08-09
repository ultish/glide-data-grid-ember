// A **local fake of Apollo Client's semantics**, backing `app/components/apollo-demo.gts`.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------------------------
// The guide's "Ember Data, GraphQL, and Apollo" chapter makes one performance claim that nothing in
// this workspace could previously check: because `recordsSource` keys its per-row caches on the
// `records` **array identity**, and Apollo hands you a **new array on every cache write**, a
// one-field subscription update re-projects **every** row rather than one. That was reasoned about
// and written down; it had never been *observed*. This module plus the demo make it a number on
// screen, next to the number the reconciled path produces, which is 1.
//
// `@apollo/client` and `glimmer-apollo` are deliberately **not** dependencies of this workspace
// (standing decision: the addon depends on no data layer, and the test-app only takes what a demo
// genuinely needs). So this is a small hand-written stand-in. It is a sibling of
// `app/utils/scale-records.ts` — same counter discipline, same "measure it, don't assert it" goal.
//
// WHAT IT REPRODUCES FAITHFULLY
// ---------------------------------------------------------------------------------------------
//   1. **`InMemoryCache` is immutable.** A field write produces a NEW entity object, leaves every
//      unchanged sibling **referentially identical**, and produces a NEW containing array (because
//      the array holds a changed child) and a NEW result object. `FakeInMemoryCache` measures that
//      asymmetry element-by-element on every write instead of claiming it — see `IdentityReport`.
//   2. **Result caching.** Writing a field its identical value is a no-op: no new object, no
//      notification. That is why the ticker below always writes a genuinely different value.
//   3. **A `useQuery`-shaped result** used as a class field, exposing `@tracked` `loading` / `data` /
//      `error` — the shape `useQuery(this, () => [DOC, opts])` returns in `glimmer-apollo`.
//   4. **A real initial fetch delay**, as a `Promise` behind a `setTimeout`, so `loading` is a state
//      the template actually renders rather than a field that is `false` from the first paint.
//   5. **A subscription** on an interval that changes exactly **one field on one entity**, which is
//      the minimal change that still forces (1)'s new array.
//
// WHAT IT DELIBERATELY DOES **NOT** MODEL
// ---------------------------------------------------------------------------------------------
//   - No GraphQL at all: no documents, no parsing, no variables, no selection sets. The demo's
//      "query" is `{ people }` and nothing else.
//   - **No normalization.** Real `InMemoryCache` stores entities flat by `__typename:id` and
//      reassembles results; here the array *is* the store. The observable consequence for the grid
//      is identical, which is the only consequence this demo is about.
//   - No optimistic responses, no refetching/polling, no error/retry paths, no field policies, no
//      partial-data or `fetchPolicy` behaviour, no `canonizeResults` cross-query sharing (removed in
//      Apollo Client 4 anyway).
//   - No network. The "mutation" writes straight to the cache after a short delay.
//
// If any of that turns out to matter for a future demo, add a real Apollo dependency rather than
// growing this file — the moment a fake needs field policies it has stopped being a fake.
import { tracked } from "@glimmer/tracking";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

// ------------------------------------------------------------------------------------------------
// The query result shape — nested, with an array of related entities, as GraphQL actually arrives
// ------------------------------------------------------------------------------------------------
//
// This is the exact shape the guide's chapter 6 ("Flattening a model into the fields a row needs")
// prints as its worked payload. Keep the two in step: the chapter shows this literal shape and then
// traces every `object-scan` needle back to it.

export interface Pet {
    readonly __typename: "Pet";
    readonly id: string;
    readonly name: string;
    readonly species: string;
}

export interface Address {
    readonly __typename: "Address";
    readonly city: string;
    readonly country: string;
}

export interface PersonProfile {
    readonly __typename: "Profile";
    readonly address: Address;
    readonly pets: readonly Pet[];
}

/** One entity as the cache holds it. Plain, frozen-in-spirit data: nothing here is `@tracked`. */
export interface Person {
    readonly __typename: "Person";
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
    /** The field the fake subscription ticks. One field, one entity, every tick. */
    readonly status: string;
    readonly profile: PersonProfile;
}

/** What `useQuery(...).data` holds. A new object on every cache write, exactly like Apollo. */
export interface PeopleQueryData {
    readonly people: readonly Person[];
}

/** The fields the demo's "mutation" and subscription are allowed to write. */
export type WritablePersonField = "name" | "email" | "role" | "status";

// ------------------------------------------------------------------------------------------------
// Deterministic seed data (a seeded LCG, so every page load produces the identical table)
// ------------------------------------------------------------------------------------------------

const FIRST_NAMES = ["Ada", "Grace", "Alan", "Katherine", "Margaret", "Radia", "Barbara", "Jean", "Lynn", "Frances"];
const LAST_NAMES = [
    "Lovelace",
    "Hopper",
    "Turing",
    "Johnson",
    "Hamilton",
    "Perlman",
    "Liskov",
    "Bartik",
    "Conway",
    "Allen",
];
const ROLES = ["Engineer", "Designer", "Product", "Support", "Researcher"];
const ADDRESSES: readonly Omit<Address, "__typename">[] = [
    { city: "Lisbon", country: "PT" },
    { city: "Berlin", country: "DE" },
    { city: "Toronto", country: "CA" },
    { city: "Osaka", country: "JP" },
    { city: "Nairobi", country: "KE" },
];
const PET_NAMES = ["Momo", "Rex", "Biscuit", "Nimbus", "Pepper", "Sable", "Tofu", "Juniper"];
const SPECIES = ["cat", "dog", "rabbit", "parrot"];

/** The cycle the subscription walks a person's `status` through. Always a genuinely new value. */
export const STATUSES: readonly string[] = ["Online", "Idle", "Away", "In a meeting", "Offline"];

/**
 * 200 rows. Big enough that "200 re-projected" and "1 re-projected" are unmistakably different
 * numbers, small enough that two live canvases on one page stay comfortable.
 */
export const PEOPLE_ROW_COUNT = 200;

function pick<T>(list: readonly T[], n: number): T {
    return list[n % list.length]!;
}

export function buildPeople(count: number = PEOPLE_ROW_COUNT): readonly Person[] {
    let seed = 20260809;
    const rand = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };

    const out: Person[] = [];
    for (let i = 0; i < count; i++) {
        const first = pick(FIRST_NAMES, Math.floor(rand() * 100));
        const last = pick(LAST_NAMES, Math.floor(rand() * 100));
        const petCount = Math.floor(rand() * 3); // 0-2 related entities per row
        const pets: Pet[] = [];
        for (let p = 0; p < petCount; p++) {
            pets.push({
                __typename: "Pet",
                id: `pet:${i + 1}:${p + 1}`,
                name: pick(PET_NAMES, Math.floor(rand() * 100)),
                species: pick(SPECIES, Math.floor(rand() * 100)),
            });
        }
        out.push({
            __typename: "Person",
            id: `person:${i + 1}`,
            name: `${first} ${last} #${i + 1}`,
            email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@example.com`,
            role: pick(ROLES, Math.floor(rand() * 100)),
            status: pick(STATUSES, Math.floor(rand() * 100)),
            profile: {
                __typename: "Profile",
                address: { __typename: "Address", ...pick(ADDRESSES, Math.floor(rand() * 100)) },
                pets,
            },
        });
    }
    return out;
}

// ------------------------------------------------------------------------------------------------
// The cache
// ------------------------------------------------------------------------------------------------

/** Measured, not asserted: what a single field write did to object identity across the whole array. */
export interface IdentityReport {
    /** Entities whose object identity changed. For a one-field write this is 1. */
    readonly changedEntities: number;
    /** Entities still `===` their previous object. For a one-field write this is `length - 1`. */
    readonly preservedEntities: number;
    /** Always true: the array holds a changed child, so Apollo produces a new one. */
    readonly arrayIdentityChanged: boolean;
    /** Always true, for the same reason. This is what `recordsSource` keys its caches on. */
    readonly resultIdentityChanged: boolean;
}

/**
 * The immutable store. The whole point of this class is the **asymmetry** in `IdentityReport`: one
 * new entity, N-1 preserved entities, and a new array anyway.
 */
export class FakeInMemoryCache {
    #people: readonly Person[];
    #result: PeopleQueryData;
    #listeners = new Set<(data: PeopleQueryData) => void>();
    #lastIdentity: IdentityReport | undefined = undefined;

    constructor(people: readonly Person[]) {
        this.#people = people;
        this.#result = { people };
    }

    /** The current query result. Referentially stable while nothing underneath has changed. */
    get result(): PeopleQueryData {
        return this.#result;
    }

    get lastIdentity(): IdentityReport | undefined {
        return this.#lastIdentity;
    }

    subscribe(listener: (data: PeopleQueryData) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    idAt(index: number): string | undefined {
        return this.#people[index]?.id;
    }

    /**
     * The one write path. Immutable, exactly like `InMemoryCache.writeFragment` landing a
     * subscription payload or a mutation response.
     *
     * Returns `false` when nothing changed — Apollo's result caching means writing a field its
     * current value produces no new object and notifies nobody, and the demo relies on that being
     * true here as well (it is why the ticker cycles `status` rather than re-writing it).
     */
    writePersonField(id: string, field: WritablePersonField, value: string): boolean {
        const index = this.#people.findIndex(p => p.id === id);
        if (index < 0) return false;
        const before = this.#people;
        const prev = before[index]!;
        if (prev[field] === value) return false;

        // NEW entity object for the changed one...
        const updated: Person = { ...prev, ...({ [field]: value } as Partial<Person>) };
        // ...NEW containing array, because it holds a changed child...
        const next = before.slice();
        next[index] = updated;

        // ...and every *other* element is still the same object. Counted rather than claimed.
        let preserved = 0;
        for (let i = 0; i < next.length; i++) if (next[i] === before[i]) preserved++;

        this.#people = next;
        // NEW result object, which is the identity `recordsSource` keys its per-row caches on.
        this.#result = { people: next };
        this.#lastIdentity = {
            changedEntities: next.length - preserved,
            preservedEntities: preserved,
            arrayIdentityChanged: next !== before,
            resultIdentityChanged: true,
        };

        for (const listener of this.#listeners) listener(this.#result);
        return true;
    }
}

// ------------------------------------------------------------------------------------------------
// The `useQuery`-shaped result
// ------------------------------------------------------------------------------------------------

/**
 * Stands in for what `useQuery(this, () => [PEOPLE_QUERY])` returns in `glimmer-apollo`: an object
 * held as a **class field** whose `loading` / `data` / `error` are `@tracked`, so reading `.data`
 * inside a `@cached` getter registers the dependency that later repaints the grid.
 */
export class FakeQueryResult {
    @tracked loading = true;
    @tracked data: PeopleQueryData | undefined = undefined;
    @tracked error: Error | undefined = undefined;

    #unsubscribe: (() => void) | undefined = undefined;
    #timer = 0;

    constructor(
        cache: FakeInMemoryCache,
        options: { readonly delayMs: number; readonly onData?: (data: PeopleQueryData) => void }
    ) {
        // The initial fetch, as a real Promise behind a real delay, so `loading` is observable.
        this.#timer = window.setTimeout(() => {
            this.#timer = 0;
            void Promise.resolve(cache.result).then(data => {
                this.loading = false;
                this.data = data;
                options.onData?.(data);
                // Only now start following the cache — mirroring a query that begins watching once
                // its first result has landed.
                this.#unsubscribe = cache.subscribe(next => {
                    this.data = next;
                    options.onData?.(next);
                });
            });
        }, options.delayMs);
    }

    /** `glimmer-apollo` tears its resources down with the owning component; do it by hand here. */
    stop(): void {
        if (this.#timer !== 0) window.clearTimeout(this.#timer);
        this.#timer = 0;
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
    }
}

// ------------------------------------------------------------------------------------------------
// The fake subscription
// ------------------------------------------------------------------------------------------------

/**
 * Stands in for `useSubscription(this, () => [gql`subscription { personUpdated { ... } }`])`.
 *
 * Every tick changes **one field on one entity** — the smallest possible payload — and lets the
 * cache do the rest. The consumer never calls `updateCells`; the repaint comes out of the tracked
 * `data` write inside `FakeQueryResult`.
 */
export class FakePersonSubscription {
    #cache: FakeInMemoryCache;
    #intervalMs: number;
    #onBeforeTick: (() => void) | undefined;
    #onAfterTick: (() => void) | undefined;
    #timer = 0;
    #cursor = 0;
    #statusCursor = 0;

    constructor(
        cache: FakeInMemoryCache,
        options: {
            readonly intervalMs: number;
            readonly onBeforeTick?: () => void;
            readonly onAfterTick?: () => void;
        }
    ) {
        this.#cache = cache;
        this.#intervalMs = options.intervalMs;
        this.#onBeforeTick = options.onBeforeTick;
        this.#onAfterTick = options.onAfterTick;
    }

    get running(): boolean {
        return this.#timer !== 0;
    }

    get intervalMs(): number {
        return this.#intervalMs;
    }

    /** Changing the rate keeps the cursor, so the demo carries on where it left off. */
    setIntervalMs(ms: number): void {
        this.#intervalMs = ms;
        if (this.#timer === 0) return;
        this.stop();
        this.start();
    }

    /** The row the *next* tick will touch, so the demo can point at it before it happens. */
    get nextRow(): number {
        return this.#cursor;
    }

    start(): void {
        if (this.#timer !== 0) return;
        this.#timer = window.setInterval(() => this.tickOnce(), this.#intervalMs);
    }

    stop(): void {
        if (this.#timer === 0) return;
        window.clearInterval(this.#timer);
        this.#timer = 0;
    }

    /** One subscription event, delivered by hand. Same code path as the interval. */
    tickOnce(): void {
        const id = this.#cache.idAt(this.#cursor);
        if (id === undefined) return;
        this.#statusCursor = (this.#statusCursor + 1) % STATUSES.length;
        const status = STATUSES[this.#statusCursor]!;

        this.#onBeforeTick?.();
        this.#cache.writePersonField(id, "status", status);
        this.#onAfterTick?.();

        this.#cursor = (this.#cursor + 1) % PEOPLE_ROW_COUNT;
    }
}

/**
 * Stands in for `useMutation(...).mutate(...)`: a delay, then a cache write. Nothing is written to
 * the record the grid handed back — the grid never mutates your data, so the round trip is
 * `onCellsEdited` -> mutate -> cache write -> new result -> repaint, in one direction.
 */
export function fakeMutatePersonField(
    cache: FakeInMemoryCache,
    id: string,
    field: WritablePersonField,
    value: string,
    options: { readonly delayMs: number; readonly onBeforeWrite?: () => void; readonly onAfterWrite?: () => void }
): void {
    window.setTimeout(() => {
        options.onBeforeWrite?.();
        cache.writePersonField(id, field, value);
        options.onAfterWrite?.();
    }, options.delayMs);
}

// ------------------------------------------------------------------------------------------------
// The reconcile layer — tracked view models keyed by id
// ------------------------------------------------------------------------------------------------

/**
 * The mitigation the guide recommends for a high-frequency subscription, and it is *smaller* against
 * Apollo than against any other client: because the cache is immutable, an unchanged entity is the
 * **same object**, so the whole view model is one `@tracked` field plus an identity guard. There are
 * no per-field comparisons to write and none to get wrong.
 *
 * Against a client that reallocates identical objects (most of them) this early-out misses and you
 * are back to comparing the fields you display.
 */
export class PersonRow {
    readonly id: string;
    @tracked raw: Person;

    constructor(raw: Person) {
        this.id = raw.id;
        this.raw = raw;
    }

    /** One tracked write, and only when the entity genuinely changed. */
    apply = (raw: Person): void => {
        if (this.raw !== raw) this.raw = raw;
    };
}

/**
 * Folds a new query result into the existing view models.
 *
 * Returns the **same array** when membership and order are unchanged — that is the load-bearing
 * half. A fresh array identity would rebuild every one of `recordsSource`'s per-row caches and throw
 * away exactly the incrementality the `apply` guard above just bought.
 */
export function reconcilePeople(
    previous: readonly PersonRow[],
    byId: Map<string, PersonRow>,
    incoming: readonly Person[]
): readonly PersonRow[] {
    let membershipChanged = incoming.length !== previous.length;
    const next = incoming.map((raw, i) => {
        let vm = byId.get(raw.id);
        if (vm === undefined) {
            vm = new PersonRow(raw);
            byId.set(raw.id, vm);
            membershipChanged = true;
        } else {
            vm.apply(raw);
        }
        if (previous[i] !== vm) membershipChanged = true;
        return vm;
    });
    return membershipChanged ? next : previous;
}

// ------------------------------------------------------------------------------------------------
// Columns + the projection, with per-path counters
// ------------------------------------------------------------------------------------------------

export const PEOPLE_COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 200 },
    { id: "email", title: "Email", width: 230 },
    { id: "role", title: "Role", width: 120 },
    { id: "status", title: "Status", width: 120 },
    { id: "city", title: "City", width: 110 },
    { id: "pets", title: "Pets", width: 170 },
];

/** Which grid a projection call belongs to. Two counters is the entire lesson. */
export type ProjectionPath = "raw" | "reconciled";

// Plain untracked numbers, for the same reason as `scale-records.ts`: `toCell` runs *inside* the
// caller's tracking frame, and writing tracked state there is what Ember's backtracking-rerender
// assertion exists to catch. The component copies them into tracked display fields afterwards.
interface Counter {
    rowIdsSinceMark: Set<string>;
    cellsSinceMark: number;
    cellsTotal: number;
}

const counters: Record<ProjectionPath, Counter> = {
    raw: { rowIdsSinceMark: new Set(), cellsSinceMark: 0, cellsTotal: 0 },
    reconciled: { rowIdsSinceMark: new Set(), cellsSinceMark: 0, cellsTotal: 0 },
};

/** Call immediately *before* the change you want to measure. Resets both paths together. */
export function markProjectionBaseline(): void {
    for (const key of ["raw", "reconciled"] as const) {
        counters[key].rowIdsSinceMark.clear();
        counters[key].cellsSinceMark = 0;
    }
}

export interface ProjectionReading {
    /** Distinct records re-projected since the baseline. The number the demo is about. */
    readonly rows: number;
    /** `toCell` calls since the baseline (`rows * PEOPLE_COLUMNS.length`). */
    readonly cells: number;
    /** `toCell` calls since page load, for context. */
    readonly cellsTotal: number;
}

/** Call *after* the render the change triggered. */
export function readProjection(path: ProjectionPath): ProjectionReading {
    const c = counters[path];
    return { rows: c.rowIdsSinceMark.size, cells: c.cellsSinceMark, cellsTotal: c.cellsTotal };
}

function count(path: ProjectionPath, id: string): void {
    const c = counters[path];
    c.cellsTotal++;
    c.cellsSinceMark++;
    c.rowIdsSinceMark.add(id);
}

function text(value: string, editable = false): GridCell {
    return { kind: GridCellKind.Text, allowOverlay: editable, data: value, displayData: value };
}

/**
 * The shared projection body, so the two paths measure identical work. Plain property access — no
 * traversal library, which is the guide's default recommendation. (`app/utils/scale-records.ts` is
 * where the same shape is dug out with `object-scan` instead.)
 */
function personCell(p: Person, col: number): GridCell {
    switch (col) {
        case 0:
            return text(p.name);
        case 1:
            return text(p.email);
        case 2:
            // The one editable column, so the mutation round trip has somewhere to land.
            return text(p.role, true);
        case 3:
            return text(p.status);
        case 4:
            return text(p.profile.address.city);
        default: {
            const names = p.profile.pets
                .map(pet => pet.name)
                .sort()
                .join(", ");
            return text(names === "" ? "—" : names);
        }
    }
}

/** Projection for the grid fed straight from the Apollo result array. */
export function apolloPersonToCell(p: Person, col: number): GridCell {
    count("raw", p.id);
    return personCell(p, col);
}

/** Projection for the grid fed from reconciled tracked view models. Reads `row.raw` — tracked. */
export function personRowToCell(row: PersonRow, col: number): GridCell {
    count("reconciled", row.id);
    return personCell(row.raw, col);
}
