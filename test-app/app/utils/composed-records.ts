// Fixture for `<ComposedDemo>` — the three composable data-source hooks (backlog 9j) driven together.
//
// A separate file from `demo-data.ts` on purpose: `<DemoGrid>`'s fixture is about *cell types*, and
// everything here is about *coordinates*. The three properties this data needs are all coordinate
// properties:
//
//  1. **Every column carries a `group`**, because `withCollapsingGroups` has nothing to collapse
//     otherwise — grouping is driven entirely by `GridColumn.group`, as the grid itself does it.
//  2. **Every column carries an `id`**, because `withMovableColumns` expresses its order as
//     `columnOrderKey` values (`id`, falling back to `"<group>/<title>"`). An id-less column still
//     works, but a *persisted* order would then break the moment a title changed.
//  3. **Every column's values are visibly distinguishable from every other column's** — the Role
//     column holds job titles, Team holds team names, Salary holds money. That is what makes "the
//     edit landed on the wrong field" *visible* rather than merely true, which is the whole point of
//     the demo. A fixture where two columns both held plausible short strings would hide exactly the
//     defect class this demo exists to catch.
import { tracked } from "@glimmer/tracking";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

/** The field each column index maps to, in **natural** column order. */
export const COMPOSED_FIELDS = ["name", "email", "role", "team", "salary", "active", "rating"] as const;

export type ComposedField = (typeof COMPOSED_FIELDS)[number];

/**
 * Natural column order — the order `staffToCell`'s `col` argument refers to, and the order the
 * records themselves are written in. `withMovableColumns` never reorders this array; it returns a
 * reordered copy and translates indices back to this space at both boundaries.
 */
export const COMPOSED_COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", group: "Identity", width: 170 },
    { id: "email", title: "Email", group: "Identity", width: 220 },
    { id: "role", title: "Role", group: "Employment", width: 150 },
    { id: "team", title: "Team", group: "Employment", width: 130 },
    { id: "salary", title: "Salary", group: "Employment", width: 110 },
    { id: "active", title: "Active", group: "Status", width: 90 },
    { id: "rating", title: "Rating", group: "Status", width: 90 },
];

/** Group names, in the order they appear across `COMPOSED_COLUMNS`. Drives the chrome's toggles. */
export const COMPOSED_GROUPS: readonly string[] = ["Identity", "Employment", "Status"];

/**
 * One record. Tracked fields, mutated **in place** — `recordsSource` builds one `createCache` per
 * record, so writing a field re-projects that record's row and nothing else.
 */
export class Staffer {
    @tracked name: string;
    @tracked email: string;
    @tracked role: string;
    @tracked team: string;
    @tracked salary: number;
    @tracked active: boolean;
    @tracked rating: number;

    constructor(init: {
        name: string;
        email: string;
        role: string;
        team: string;
        salary: number;
        active: boolean;
        rating: number;
    }) {
        this.name = init.name;
        this.email = init.email;
        this.role = init.role;
        this.team = init.team;
        this.salary = init.salary;
        this.active = init.active;
        this.rating = init.rating;
    }
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * The projection. Module scope so it is identity-stable: `recordsSource` keys its per-record cache
 * set on `{records, columns, toCell}`, and a fresh `toCell` identity rebuilds all of them.
 *
 * `col` is always a **natural** column index. By the time this runs, `withMovableColumns` has already
 * translated the displayed index the grid asked for.
 */
export function staffToCell(s: Staffer, col: number): GridCell {
    switch (col) {
        case 0:
            return { kind: GridCellKind.Text, allowOverlay: true, data: s.name, displayData: s.name };
        case 1:
            return { kind: GridCellKind.Text, allowOverlay: true, data: s.email, displayData: s.email };
        case 2:
            return { kind: GridCellKind.Text, allowOverlay: true, data: s.role, displayData: s.role };
        case 3:
            return { kind: GridCellKind.Text, allowOverlay: true, data: s.team, displayData: s.team };
        case 4:
            return {
                kind: GridCellKind.Number,
                allowOverlay: true,
                data: s.salary,
                displayData: MONEY.format(s.salary),
            };
        case 5:
            return { kind: GridCellKind.Boolean, allowOverlay: false, data: s.active };
        default:
            return {
                kind: GridCellKind.Number,
                allowOverlay: true,
                data: s.rating,
                displayData: s.rating.toFixed(1),
            };
    }
}

/** Applies one edit to one record, in **natural** column space. Returns a human-readable summary. */
export function applyStaffEdit(s: Staffer, col: number, value: GridCell): string {
    const field = COMPOSED_FIELDS[col];
    switch (col) {
        case 0:
            if (value.kind === GridCellKind.Text) s.name = value.data;
            break;
        case 1:
            if (value.kind === GridCellKind.Text) s.email = value.data;
            break;
        case 2:
            if (value.kind === GridCellKind.Text) s.role = value.data;
            break;
        case 3:
            if (value.kind === GridCellKind.Text) s.team = value.data;
            break;
        case 4:
            if (value.kind === GridCellKind.Number) s.salary = value.data ?? 0;
            break;
        case 5:
            if (value.kind === GridCellKind.Boolean) s.active = value.data === true;
            break;
        default:
            if (value.kind === GridCellKind.Number) s.rating = value.data ?? 0;
            break;
    }
    return `${field ?? "?"}`;
}

const ROLES = ["Engineer", "Designer", "Analyst", "Manager", "Technician"];
const TEAMS = ["Platform", "Growth", "Payments", "Insights", "Support"];
const FIRST = ["Ada", "Grace", "Alan", "Katherine", "Linus", "Barbara", "Dennis", "Radia", "Ken", "Margaret"];
const LAST = ["Lovelace", "Hopper", "Turing", "Johnson", "Torvalds", "Liskov", "Ritchie", "Perlman", "Thompson", "Hamilton"];

/** A fresh, deterministic record set. Small on purpose — this demo is about coordinates, not scale. */
export function buildStaff(): readonly Staffer[] {
    return FIRST.map((first, i) => {
        const last = LAST[i] ?? "Doe";
        return new Staffer({
            name: `${first} ${last}`,
            email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
            role: ROLES[i % ROLES.length] ?? "Engineer",
            team: TEAMS[i % TEAMS.length] ?? "Platform",
            salary: 90_000 + i * 7_500,
            active: i % 3 !== 0,
            rating: 3 + ((i * 7) % 21) / 10,
        });
    });
}
