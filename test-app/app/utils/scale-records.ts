// The ~1,000-row dataset, columns and projection behind `app/components/scale-proof.gts`.
//
// This module exists to close the open question in the cookbook's "Using the grid in
// Ember" chapter (formerly the addon's `DATA.md`): it tells every consumer to use a per-row
// memoized projection, and until
// Phase 8 that half of the recommendation had only been reasoned about. Everything here is shaped so
// the claim is *measurable* in a browser rather than inferred:
//
//   - records are GQL-shaped (a nested `profile` with an array of related `pets`), so the
//     `object-scan` worked example is exercised by the same grid that carries the counters;
//   - `employeeToCell` increments a plain counter on every call, so "how many rows re-projected"
//     is an observed number rather than a claim;
//   - nothing here is imperative: no `updateCells()`, no `onCellEdited`, and every cell is
//     `allowOverlay: false`. The only way a cell can change is a `@tracked` mutation flowing through
//     `recordsSource` -- exactly the constraint `tracking-demo.gts` established at 8 rows.
//
// ---------------------------------------------------------------------------------------------
// WHY THE COUNTERS ARE PLAIN NUMBERS AND NOT `@tracked`
// ---------------------------------------------------------------------------------------------
// `employeeToCell` runs *inside* the caller's tracking frame (that is the whole point -- see
// `records-source.ts`'s "RULE 1"). Incrementing a `@tracked` field there would read-then-write
// tracked state inside a computation the template has already consumed, which is precisely what
// Ember's backtracking-rerender assertion exists to catch. So the counters are deliberately
// untracked plain state, and the component copies them into tracked display fields *after* the
// render that produced them.
import { tracked } from "@glimmer/tracking";
import objectScan from "object-scan";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

// ------------------------------------------------------------------------------------------------
// Record shape -- deliberately nested, the way a GraphQL response actually arrives
// ------------------------------------------------------------------------------------------------

export interface Pet {
    readonly name: string;
    readonly species: string;
}

export interface Address {
    readonly city: string;
    readonly country: string;
}

/** The nested relation blob. Replaced wholesale on change -- see `Employee.profile`. */
export interface EmployeeProfile {
    readonly address: Address;
    readonly pets: readonly Pet[];
}

/**
 * One record. Every displayed field is `@tracked`, so mutating it in place invalidates exactly this
 * record's `createCache` inside `recordsSource` -- and nothing else.
 *
 * `profile` holds plain (untracked) nested objects on purpose: that is what a normalized GQL cache
 * hands you. Reactivity comes from replacing the whole `profile` object, which is a single tracked
 * write. `id` is not tracked -- it is the stable identity of the record.
 */
export class Employee {
    readonly id: number;

    @tracked name: string;
    @tracked email: string;
    @tracked department: string;
    @tracked salary: number;
    @tracked active: boolean;
    @tracked profile: EmployeeProfile;

    constructor(
        id: number,
        name: string,
        email: string,
        department: string,
        salary: number,
        active: boolean,
        profile: EmployeeProfile
    ) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.department = department;
        this.salary = salary;
        this.active = active;
        this.profile = profile;
    }
}

// ------------------------------------------------------------------------------------------------
// Deterministic generator (a seeded LCG, so every page load produces the identical table)
// ------------------------------------------------------------------------------------------------

const FIRST_NAMES = ["Ada", "Grace", "Alan", "Katherine", "Margaret", "Radia", "Barbara", "Jean", "Lynn", "Frances"];
const LAST_NAMES = ["Lovelace", "Hopper", "Turing", "Johnson", "Hamilton", "Perlman", "Liskov", "Bartik", "Conway", "Allen"];
const DEPARTMENTS = ["Engineering", "Design", "Product", "Support", "Research"];
const CITIES: readonly Address[] = [
    { city: "Lisbon", country: "PT" },
    { city: "Berlin", country: "DE" },
    { city: "Toronto", country: "CA" },
    { city: "Osaka", country: "JP" },
    { city: "Nairobi", country: "KE" },
];
const PET_NAMES = ["Momo", "Rex", "Biscuit", "Nimbus", "Pepper", "Sable", "Tofu", "Juniper"];
const SPECIES = ["cat", "dog", "rabbit", "parrot"];

export const SCALE_ROW_COUNT = 1000;

function pick<T>(list: readonly T[], n: number): T {
    return list[n % list.length]!;
}

/** Builds a fresh records array. Replacing the array (not mutating it) is `recordsSource`'s rule 3. */
export function buildEmployees(count: number = SCALE_ROW_COUNT): readonly Employee[] {
    let seed = 20260808;
    const rand = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };

    const out: Employee[] = [];
    for (let i = 0; i < count; i++) {
        const first = pick(FIRST_NAMES, Math.floor(rand() * 100));
        const last = pick(LAST_NAMES, Math.floor(rand() * 100));
        const petCount = Math.floor(rand() * 3); // 0-2 related entities per row
        const pets: Pet[] = [];
        for (let p = 0; p < petCount; p++) {
            pets.push({ name: pick(PET_NAMES, Math.floor(rand() * 100)), species: pick(SPECIES, Math.floor(rand() * 100)) });
        }
        out.push(
            new Employee(
                i + 1,
                `${first} ${last} #${i + 1}`,
                `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@example.com`,
                pick(DEPARTMENTS, Math.floor(rand() * 100)),
                60000 + Math.floor(rand() * 90000),
                rand() > 0.25,
                { address: pick(CITIES, Math.floor(rand() * 100)), pets }
            )
        );
    }
    return out;
}

// ------------------------------------------------------------------------------------------------
// `object-scan` worked example -- the consumer-side boundary the addon deliberately does not cross
// ------------------------------------------------------------------------------------------------
//
// The addon takes `toCell`, a plain accessor function, and depends on **no** traversal library. That
// is what lets a consumer use whatever they already have. Here that is `object-scan`, added to
// `test-app/package.json` only.
//
// **Compile once per column, never per cell.** `objectScan(...)` parses its needles and builds a
// matcher; doing that inside `toCell` would rebuild it 7,000 times on a cold sweep of this table
// instead of twice for the life of the page. `scannerCompileCount` below is on screen precisely so
// that "twice, not 7,000 times" is visible rather than asserted.

let scannerCompileCount = 0;

function compileScanner(needle: string): (haystack: unknown) => readonly string[] {
    scannerCompileCount++;
    // `useArraySelector: false` -> array indices are not part of the needle, so `pets.name` matches
    // every element of `pets`. `rtn: "value"` -> we get the matched values, not their key paths.
    const scan = objectScan([needle], { useArraySelector: false, rtn: "value" });
    return (haystack: unknown) => scan(haystack) as readonly string[];
}

/** How many times `objectScan(...)` has been called. Should be 2 forever. */
export function getScannerCompileCount(): number {
    return scannerCompileCount;
}

// One compiled scanner per column that needs one, hoisted to module scope.
//
// Both scan the plain `profile` blob rather than the `Employee` itself, and that is not incidental:
// `object-scan` traverses **own enumerable** properties, while `@tracked` fields are accessors on
// the prototype. Pointing a scanner at a class instance would quietly match nothing. Scanning the
// nested payload -- which is what a GraphQL response actually is -- sidesteps that entirely.
const scanCity = compileScanner("address.city");
const scanPetNames = compileScanner("pets.name");

// ------------------------------------------------------------------------------------------------
// Columns + the projection
// ------------------------------------------------------------------------------------------------

export const SCALE_COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 210 },
    { id: "email", title: "Email", width: 240 },
    { id: "department", title: "Department", width: 130 },
    { id: "salary", title: "Salary", width: 100 },
    { id: "city", title: "City (object-scan)", width: 150 },
    { id: "pets", title: "Pets (object-scan)", width: 180 },
    { id: "active", title: "Active", width: 80 },
];

/**
 * Untracked, deliberately (see this file's header). `cells`/`rows` are the numbers on screen.
 *
 * `rowIds` is a `Set` of the record ids projected since the last `markProjectionBaseline()`, which is
 * what makes "one row re-projected, not one thousand" a directly observed count.
 */
const counters = {
    cellsTotal: 0,
    cellsSinceMark: 0,
    rowIdsSinceMark: new Set<number>(),
};

/** Call immediately *before* the mutation you want to measure. */
export function markProjectionBaseline(): void {
    counters.cellsSinceMark = 0;
    counters.rowIdsSinceMark.clear();
}

export interface ProjectionReading {
    /** Distinct records re-projected since the baseline. This is the number the whole demo is about. */
    readonly rows: number;
    /** `toCell` calls since the baseline (`rows * SCALE_COLUMNS.length`). */
    readonly cells: number;
    /** `toCell` calls since page load, for context. */
    readonly cellsTotal: number;
}

/** Call *after* the render that the mutation triggered. */
export function readProjectionCounters(): ProjectionReading {
    return {
        rows: counters.rowIdsSinceMark.size,
        cells: counters.cellsSinceMark,
        cellsTotal: counters.cellsTotal,
    };
}

/**
 * The projection. Module scope, so it is identity-stable -- `recordsSource`'s per-row caches close
 * over it, and a fresh identity would rebuild every one of them (`recordsSource` rule 2).
 *
 * All the real work lives here, on the memoized side of the boundary: string formatting, number
 * formatting, and the nested-relation digging. **None of it is in `getCellContent`**, which
 * `recordsSource` reduces to a single array index on the paint path.
 */
export function employeeToCell(e: Employee, col: number): GridCell {
    counters.cellsTotal++;
    counters.cellsSinceMark++;
    counters.rowIdsSinceMark.add(e.id);

    switch (col) {
        case 0:
            return { kind: GridCellKind.Text, allowOverlay: false, data: e.name, displayData: e.name };
        case 1:
            return { kind: GridCellKind.Text, allowOverlay: false, data: e.email, displayData: e.email };
        case 2:
            return { kind: GridCellKind.Text, allowOverlay: false, data: e.department, displayData: e.department };
        case 3:
            return {
                kind: GridCellKind.Number,
                allowOverlay: false,
                data: e.salary,
                displayData: `$${e.salary.toLocaleString("en-US")}`,
            };
        case 4: {
            // Nested single value: `profile` -> `address.city`.
            const city = scanCity(e.profile)[0] ?? "";
            return { kind: GridCellKind.Text, allowOverlay: false, data: city, displayData: city };
        }
        case 5: {
            // Nested *array* of related entities: one match per `profile` -> `pets[i].name`.
            const names = [...scanPetNames(e.profile)].sort().join(", ");
            const display = names === "" ? "—" : names;
            return { kind: GridCellKind.Text, allowOverlay: false, data: display, displayData: display };
        }
        default:
            return { kind: GridCellKind.Boolean, allowOverlay: false, data: e.active };
    }
}

/** Adds one related entity by replacing `profile` -- a single tracked write, GQL-cache style. */
export function addPet(e: Employee, name: string): void {
    e.profile = {
        address: e.profile.address,
        pets: [...e.profile.pets, { name, species: "cat" }],
    };
}
