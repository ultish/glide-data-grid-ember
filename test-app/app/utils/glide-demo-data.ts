// Phase 7c: data for the grid.glideapps.com replica demo (`app/components/glide-demo.gts`).
//
// This is a SECOND, independent dataset -- `app/utils/demo-data.ts` (the 50-column x 200k-row
// everything-cell-type smoke test) is the verification surface for Phases 3-6 and is deliberately
// left untouched.
//
// Design constraints, all deliberate:
//   - **Deterministic.** A seeded mulberry32 PRNG, so every reload produces byte-identical data.
//     No `faker`, no `Math.random()` -- a demo whose contents change on reload makes "did the sort
//     actually reorder the rows?" unanswerable.
//   - **Zero network requests.** Photos and manager avatars are `data:` URI PNGs generated at
//     runtime from an offscreen `<canvas>` (memoized), so thumbnails are visually distinct per row
//     without shipping N base64 blobs or hitting the network. Falls back to the same tiny static
//     PNG `demo-data.ts` uses if there's no DOM (SSR / build-time evaluation).
//   - **Records materialized up front, `getCellContent` O(1).** 3,000 rows is small enough to hold
//     in memory, and `getCellContent` runs inside the canvas draw loop (once per painted cell), so
//     it must never do real work. See DATA.md / PORTING-NOTES.md's "Autotracking -> canvas" section.
import {
    GridCellKind,
    GridColumnIcon,
    type GridCell,
    type GridColumn,
    type Item,
} from "glide-data-grid-ember/rendering/index";
import { PHOTO_PALETTE, avatarUrl, photoUrl } from "test-app/utils/demo-fixtures";

export const GLIDE_DEMO_ROW_COUNT = 3000;

// --- Seeded PRNG -----------------------------------------------------------------------------
// mulberry32: 5 lines, no dependency, good enough distribution for demo data. Same seed => same
// dataset on every reload, which is what makes the sort verification meaningful.
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d_2b_79_f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

// --- Images ------------------------------------------------------------------------------------
// Canvas-generated `data:` URIs, shared with `demo-data.ts` via `demo-fixtures.ts`. They used to
// live here in full, with a "keep the two copies in sync" note about the fallback PNG -- which is
// exactly the hazard the shared module removes.
function managerAvatarUrl(index: number): string {
    const manager = MANAGERS[index % MANAGERS.length] ?? "";
    const parts = manager.split(" ");
    return avatarUrl(`${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`, index);
}

// --- Name / title / manager pools -------------------------------------------------------------
const FIRST_NAMES = [
    "Ada",
    "Grace",
    "Alan",
    "Katherine",
    "Margaret",
    "Linus",
    "Barbara",
    "Edsger",
    "Radia",
    "Ken",
    "Anita",
    "Donald",
    "Frances",
    "Tim",
    "Shafi",
    "Vint",
    "Jean",
    "Dennis",
    "Sophie",
    "Guido",
    "Leslie",
    "Hedy",
    "Bjarne",
    "Carol",
    "Niklaus",
    "Adele",
    "Marvin",
    "Evelyn",
    "Alonzo",
    "Ida",
] as const;

const LAST_NAMES = [
    "Lovelace",
    "Hopper",
    "Turing",
    "Johnson",
    "Hamilton",
    "Torvalds",
    "Liskov",
    "Dijkstra",
    "Perlman",
    "Thompson",
    "Borg",
    "Knuth",
    "Allen",
    "Berners-Lee",
    "Goldwasser",
    "Cerf",
    "Bartik",
    "Ritchie",
    "Wilson",
    "Rossum",
    "Lamport",
    "Lamarr",
    "Stroustrup",
    "Shaw",
    "Wirth",
    "Goldberg",
    "Minsky",
    "Boyd",
    "Church",
    "Rhodes",
] as const;

const TITLES = [
    "Software Engineer",
    "Senior Software Engineer",
    "Staff Engineer",
    "Engineering Manager",
    "Product Designer",
    "Product Manager",
    "Data Analyst",
    "Data Engineer",
    "QA Engineer",
    "Site Reliability Engineer",
    "Technical Writer",
    "Solutions Architect",
    "Support Lead",
    "Sales Engineer",
    "Recruiter",
    "Office Manager",
    "Finance Analyst",
    "Marketing Lead",
] as const;

const MANAGERS = [
    "Ruth Bennett",
    "Omar Haddad",
    "Sofia Ricci",
    "Jonah Park",
    "Neve Callahan",
    "Priya Nair",
    "Tomas Vega",
    "Ida Lindqvist",
] as const;

const DOMAINS = ["example.com", "acme.io", "globex.dev", "initech.net", "umbrella.co"] as const;

// --- Records ----------------------------------------------------------------------------------
interface PersonRecord {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly photoIndex: number;
    readonly optIn: boolean;
    readonly title: string;
    readonly moreInfo: string;
    readonly performance: readonly number[];
    readonly managerIndex: number;
    readonly hired: string;
    readonly level: number;
}

function buildRecords(count: number): readonly PersonRecord[] {
    const rand = mulberry32(0x91_3a_7c_15);
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
    const out: PersonRecord[] = [];

    for (let i = 0; i < count; i++) {
        const firstName = pick(FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const domain = pick(DOMAINS);
        // Disambiguated with the row index so Email is a genuinely unique, sortable key even though
        // the name pools repeat.
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}${i}@${domain}`;

        // 12-point performance series with a per-row baseline + drift, so every sparkline looks
        // visibly different rather than 3000 copies of one curve.
        const base = 20 + rand() * 50;
        const drift = (rand() - 0.5) * 8;
        const performance: number[] = [];
        let v = base;
        for (let j = 0; j < 12; j++) {
            v = Math.min(100, Math.max(0, v + drift + (rand() - 0.5) * 22));
            performance.push(v);
        }

        // Hire dates spread across ~6 years, formatted the way the target site shows them
        // ("Sun Jun 21 2026") -- `Date.prototype.toDateString()` produces exactly that format.
        const hiredDate = new Date(Date.UTC(2020, 0, 1 + Math.floor(rand() * 2200)));

        out.push({
            email,
            firstName,
            lastName,
            photoIndex: Math.floor(rand() * PHOTO_PALETTE.length),
            optIn: rand() > 0.45,
            title: pick(TITLES),
            moreInfo: `https://${domain}/people/${i}`,
            performance,
            managerIndex: Math.floor(rand() * MANAGERS.length),
            hired: hiredDate.toDateString(),
            level: 1 + Math.floor(rand() * 12),
        });
    }

    return out;
}

export const glideDemoRecords: readonly PersonRecord[] = buildRecords(GLIDE_DEMO_ROW_COUNT);

// --- Columns ------------------------------------------------------------------------------------
// `group` is what turns column grouping on -- the addon derives `enableGroups` from
// `columns.some(c => c.group !== undefined)`, exactly as source does (Phase 7b). No flag to pass.
//
// `hasMenu: true` on every column is what makes the header chevron drawable and, more importantly,
// what gates `onHeaderMenuClick`'s hit-test (`hitTestHeaderMenu` returns `undefined` without it).
// `icon` picks a glyph from the ported `GridColumnIcon` sprite set (`src/rendering/sprites.ts`).
export const GLIDE_DEMO_COLUMNS: readonly GridColumn[] = [
    { id: "email", title: "Email", group: "ID", icon: GridColumnIcon.HeaderEmail, hasMenu: true, width: 250 },
    {
        id: "firstName",
        title: "First name",
        group: "Name",
        icon: GridColumnIcon.HeaderString,
        hasMenu: true,
        width: 130,
    },
    { id: "lastName", title: "Last name", group: "Name", icon: GridColumnIcon.HeaderString, hasMenu: true, width: 140 },
    { id: "photo", title: "Photo", group: "Info", icon: GridColumnIcon.HeaderImage, hasMenu: true, width: 90 },
    { id: "optIn", title: "Opt-In", group: "Info", icon: GridColumnIcon.HeaderBoolean, hasMenu: true, width: 80 },
    { id: "title", title: "Title", group: "Info", icon: GridColumnIcon.HeaderString, hasMenu: true, width: 210 },
    { id: "moreInfo", title: "More Info", group: "Info", icon: GridColumnIcon.HeaderUri, hasMenu: true, width: 220 },
    {
        id: "performance",
        title: "Performance",
        group: "Info",
        icon: GridColumnIcon.HeaderArray,
        hasMenu: true,
        width: 150,
    },
    {
        id: "manager",
        title: "Manager",
        group: "Employment Data",
        icon: GridColumnIcon.HeaderReference,
        hasMenu: true,
        width: 190,
    },
    {
        id: "hired",
        title: "Hired",
        group: "Employment Data",
        icon: GridColumnIcon.HeaderDate,
        hasMenu: true,
        width: 170,
    },
    {
        id: "level",
        title: "Level",
        group: "Employment Data",
        icon: GridColumnIcon.HeaderNumber,
        hasMenu: true,
        width: 90,
    },
];

const EMPTY_CELL: GridCell = { kind: GridCellKind.Loading, allowOverlay: false };

/**
 * Builds a `getCellContent` bound to a specific column order.
 *
 * Takes the column list as a parameter (rather than closing over the module-scope one) because the
 * demo supports drag-to-reorder: after a reorder, physical column index N maps to a different
 * field. **Identity matters** -- `getCellContent` is one of the ~18 `DrawGridArg` fields
 * `computeCanBlit` compares by identity, so the caller must hold the returned closure behind a
 * `@cached` getter keyed on the column array, never rebuild it per render.
 */
export function makeGlideDemoGetCellContent(columns: readonly GridColumn[]): (item: Item) => GridCell {
    const fieldIds = columns.map(c => c.id ?? "");

    return (item: Item): GridCell => {
        const [col, row] = item;
        const record = glideDemoRecords[row];
        const field = fieldIds[col];
        if (record === undefined || field === undefined) return EMPTY_CELL;

        switch (field) {
            case "email":
                return {
                    kind: GridCellKind.Text,
                    data: record.email,
                    displayData: record.email,
                    allowOverlay: true,
                };
            case "firstName":
                return {
                    kind: GridCellKind.Text,
                    data: record.firstName,
                    displayData: record.firstName,
                    allowOverlay: true,
                };
            case "lastName":
                return {
                    kind: GridCellKind.Text,
                    data: record.lastName,
                    displayData: record.lastName,
                    allowOverlay: true,
                };
            case "photo":
                return {
                    kind: GridCellKind.Image,
                    data: [photoUrl(record.photoIndex)],
                    allowOverlay: true,
                    rounding: 4,
                };
            case "optIn":
                return {
                    kind: GridCellKind.Boolean,
                    data: record.optIn,
                    allowOverlay: false,
                };
            case "title":
                return {
                    kind: GridCellKind.Text,
                    data: record.title,
                    displayData: record.title,
                    allowOverlay: true,
                };
            case "moreInfo":
                // Deliberately no `onClickUri` -- same reasoning as `demo-data.ts`'s uri column:
                // supplying one makes an in-bounds click on the link text call `window.open(...)`,
                // which spawns real browser tabs during automated click-testing.
                return {
                    kind: GridCellKind.Uri,
                    data: record.moreInfo,
                    displayData: record.moreInfo,
                    hoverEffect: true,
                    allowOverlay: true,
                };
            case "performance":
                // The Phase 5a sparkline `CustomCell`. Requires the demo component to pass a
                // `@getCellRenderer` built with `createCombinedCellRenderer` -- the Phase 4
                // built-in registry alone does not know about `GridCellKind.Custom` cells.
                return {
                    kind: GridCellKind.Custom,
                    allowOverlay: false,
                    copyData: record.performance.map(v => v.toFixed(0)).join(","),
                    data: {
                        kind: "sparkline-cell",
                        values: record.performance,
                        displayValues: record.performance.map(v => v.toFixed(0)),
                        yAxis: [0, 100],
                        graphKind: "area",
                        color: "#4F5DFF",
                    },
                };
            case "manager": {
                const name = MANAGERS[record.managerIndex % MANAGERS.length]!;
                return {
                    kind: GridCellKind.Drilldown,
                    data: [{ text: name, img: managerAvatarUrl(record.managerIndex) }],
                    allowOverlay: false,
                    copyData: name,
                };
            }
            case "hired":
                return {
                    kind: GridCellKind.Text,
                    data: record.hired,
                    displayData: record.hired,
                    allowOverlay: true,
                };
            case "level":
                return {
                    kind: GridCellKind.Number,
                    data: record.level,
                    displayData: String(record.level),
                    allowOverlay: true,
                };
            default:
                return EMPTY_CELL;
        }
    };
}
