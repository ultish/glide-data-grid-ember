// Demo dataset for `<DemoGrid>`, the fully-featured reference grid.
//
// 50 columns x 200,000 rows, generated on demand via a **pure function of `[col, row]`** --
// nothing is materialized up front. That is what actually proves the virtualization/scroll pipeline
// works: only cells the render engine asks for (the visible window) ever get a `GridCell` built.
//
// **The content is realistic on purpose** (2026-08-08). It used to be `Column 12` / `row-7` /
// `R7C12` filler at widths that clipped half of it, which made the port look worse than it is next
// to `<GlideDemo>`'s replica -- and clipped cells hide rendering defects rather than exposing them,
// which is the opposite of what a coverage demo is for. Every field now comes from
// `demo-fixtures.ts`'s `fieldHash`, so it stays a pure `[col, row]` function with no PRNG state and
// byte-identical output on every reload.
//
// Column widths are fitted to their content for the same reason. If you add a column, size it.
import {
    GridCellKind,
    type CustomCell,
    type GridCell,
    type GridColumn,
    type Item,
    type Theme,
} from "glide-data-grid-ember/rendering/index";
import {
    FIRST_NAMES,
    LAST_NAMES,
    PHOTO_PALETTE,
    avatarUrl,
    fieldHash,
    photoUrl,
    pickFrom,
} from "test-app/utils/demo-fixtures";

export const DEMO_ROW_COUNT = 200_000;

/**
 * 21 typed columns + 5 filler. Was 50 (29 filler); trimmed 2026-08-13 because 29 columns of
 * plausible-but-inert text made the demo tedious to scroll through horizontally without
 * demonstrating anything the first few don't.
 *
 * **The floor is `TYPED_COLUMNS.length`, and it is a hard floor**: every one of those 21 is a
 * *distinct* cell kind (8 built-in + the 13 extra cell types), so dropping any of them drops the
 * only place that type is exercised — which rule 5 says makes it unverified code. The filler is the
 * only slack, and a few are kept so horizontal scrolling still has somewhere to go.
 *
 * **This does not make scrolling faster and is not meant to.** Only *visible* columns are drawn, so
 * off-screen ones cost nothing per frame beyond `mapColumns` allocating one object each. The scroll
 * cost is the visible heavy cells (image, bubble, drilldown, sparkline, star), which are columns
 * 5–9 and all on screen at once. See TODO.md §3b.
 */
export const DEMO_COLUMN_COUNT = 26;

// --- the demo's activity channel ----------------------------------------------------------------
// Several cell kinds carry a *callback* on the cell itself -- `ButtonCell`'s `onClick`,
// `UriCell`'s `onClickUri`, `LinksCell`'s per-link `onClick`. Those are the only way those cells do
// anything, and until 2026-08-09 this demo either logged them to the console (invisible) or omitted
// them entirely, so three of its columns read as broken rather than as wired.
//
// The awkwardness is that `demoGetCellContent` is a pure module-scope function of `[col, row]` (by
// design -- see the header), so it cannot reach `<DemoGrid>`'s tracked state directly. A single
// module-scope listener slot is the smallest thing that bridges the two: the component registers
// one in its constructor and renders whatever arrives into its status line.
export type DemoActivityListener = (message: string) => void;

let activityListener: DemoActivityListener | undefined;

/** Registered by `<DemoGrid>`. Pass `undefined` to unregister. */
export function setDemoActivityListener(listener: DemoActivityListener | undefined): void {
    activityListener = listener;
}

function reportActivity(message: string): void {
    activityListener?.(message);
}

// --- per-row derived fields ---------------------------------------------------------------------
// Each takes a distinct `salt` so fields vary independently -- without it every column in a row
// would move together and the table would look like a pattern rather than data.

function firstName(row: number): string {
    return pickFrom(FIRST_NAMES, row, 1);
}
function lastName(row: number): string {
    return pickFrom(LAST_NAMES, row, 2);
}
export function personName(row: number): string {
    return `${firstName(row)} ${lastName(row)}`;
}
function slug(row: number): string {
    return `${firstName(row)}.${lastName(row)}`.toLowerCase().replace(/[^a-z.]/g, "");
}
function initials(row: number): string {
    return `${firstName(row)[0] ?? ""}${lastName(row)[0] ?? ""}`;
}

/**
 * `count` DISTINCT picks from `pool`. Independently salted picks collide surprisingly often, and a
 * chip list reading "Ember  Ember" looks like a bug in the renderer rather than a coincidence in
 * the fixture. Walks forward from the first pick, so it stays a pure function of `[row, salt]`.
 */
function distinctPicks<T>(pool: readonly T[], row: number, salt: number, count: number): T[] {
    const start = fieldHash(row, salt) % pool.length;
    // The stride must be coprime with the pool length or the walk revisits: length 8 with stride 4
    // yields start, start+4, start again. Nudging until `gcd === 1` is cheaper than a Set here and
    // keeps the result a pure function of `[row, salt]`.
    let stride = 1 + (fieldHash(row, salt + 100) % Math.max(1, pool.length - 1));
    while (gcd(stride, pool.length) !== 1) stride++;
    const out: T[] = [];
    for (let i = 0; i < Math.min(count, pool.length); i++) {
        out.push(pool[(start + i * stride) % pool.length]!);
    }
    return out;
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

// Phase 6: a per-column theme override on column 1, so `column.themeOverride` is visibly exercised
// end to end in the demo. `bgCell` is deliberately semi-transparent: `mergeAndRealizeTheme` treats
// `bgCell` specially and *blends* an overlay's value over the value beneath it (rather than
// replacing it, like every other field) -- so an alpha tint reads correctly over both the light and
// the dark base theme, which a solid color would not. See THEMING.md.
const DEMO_COLUMN_THEME_OVERRIDE: Partial<Theme> = {
    bgCell: "rgba(255, 196, 61, 0.22)",
    textDark: "#b06a00",
    baseFontStyle: "600 13px",
};

// The 21 typed columns, each sized to what it actually draws. Order matters: `demoGetCellContent`
// below switches on the column index, and `<DemoGrid>`'s groups/icons are indexed to match.
//
// `icon` lives here rather than in the component because it is a property of the column, not of the
// demo -- `<DaisyDemo>` reuses these columns and gets the icons for free.
const TYPED_COLUMNS: readonly { title: string; width: number; icon: string }[] = [
    { title: "Employee ID", width: 120, icon: "headerRowID" },
    { title: "Salary", width: 110, icon: "headerNumber" },
    { title: "Active", width: 80, icon: "headerBoolean" },
    { title: "Profile", width: 240, icon: "headerUri" },
    { title: "Notes", width: 260, icon: "headerMarkdown" },
    { title: "Photo", width: 90, icon: "headerImage" },
    { title: "Skills", width: 230, icon: "headerArray" },
    { title: "Projects", width: 230, icon: "headerReference" },
    { title: "Trend", width: 150, icon: "headerMath" },
    { title: "Rating", width: 130, icon: "headerEmoji" },
    { title: "Progress", width: 160, icon: "headerSingleValue" },
    { title: "Sync", width: 70, icon: "headerTime" },
    { title: "Labels", width: 210, icon: "headerArray" },
    { title: "Status", width: 150, icon: "headerLookup" },
    { title: "Browsers", width: 230, icon: "headerJoinStrings" },
    { title: "Links", width: 210, icon: "headerUri" },
    { title: "Hired", width: 180, icon: "headerDate" },
    { title: "Actions", width: 130, icon: "headerIfThenElse" },
    { title: "Files (toggle)", width: 210, icon: "headerArray" },
    { title: "Owner", width: 210, icon: "headerReference" },
    { title: "Summary", width: 280, icon: "headerTextTemplate" },
];

// Everything past the typed columns is ordinary text, but with plausible headings and values --
// 29 columns of `R7C34` was the single biggest reason this demo read as placeholder art.
const FILLER_COLUMNS = [
    "Region",
    "Team",
    "Cost centre",
    "Office",
    "Timezone",
    "Manager",
    "Department",
    "Contract",
    "Seniority",
    "Locale",
    "Badge",
    "Desk",
    "Shift",
    "Cohort",
    "Program",
    "Segment",
    "Channel",
    "Tier",
    "Vendor",
    "Account",
    "Category",
    "Stage",
    "Priority",
    "Source",
    "Owner group",
    "Workstream",
    "Portfolio",
    "Initiative",
    "Milestone",
] as const;

export const demoColumns: readonly GridColumn[] = Array.from({ length: DEMO_COLUMN_COUNT }, (_, i) => {
    const typed = TYPED_COLUMNS[i];
    if (typed !== undefined) {
        return {
            id: `col-${i}`,
            title: typed.title,
            width: typed.width,
            icon: typed.icon,
            themeOverride: i === 1 ? DEMO_COLUMN_THEME_OVERRIDE : undefined,
        };
    }
    return {
        id: `col-${i}`,
        title: FILLER_COLUMNS[(i - TYPED_COLUMNS.length) % FILLER_COLUMNS.length] ?? `Field ${i}`,
        // Still varied, so horizontal scrolling stays visually obvious -- just not clipping-varied.
        width: 140 + ((i * 23) % 60),
        icon: "headerString",
    };
});

// --- what each interactive column actually does --------------------------------------------------
// Rendered by `<DemoGrid>` for whichever column is selected. Added 2026-08-09 after a run through
// the demo produced six "this looks broken" reports, two of which were **by-design behaviour** with
// nowhere to say so: a canvas cell can only advertise what it does by drawing it, and a chip list
// cannot draw "there is deliberately no editor for me".
//
// Only columns whose behaviour is genuinely non-obvious are listed; the rest fall through to
// `undefined` and the note area stays empty.
// Kept to one line each -- a note that wraps changes the height of the bar above the grid, which
// moves every row underneath it.
const COLUMN_NOTES: Readonly<Record<number, string>> = {
    3: "Uri cell -- click the link TEXT to fire onClickUri; click elsewhere in the cell to edit.",
    4: "Markdown cell -- opens a rendered preview; the pencil edits, the checkmark commits.",
    6: "Bubble chips: DISPLAY-ONLY BY DESIGN -- source ships no bubble editor either. Not a gap.",
    7: "Drilldown chips: DISPLAY-ONLY BY DESIGN -- source's overlay only re-shows them, uneditable.",
    8: "Sparkline -- display-only in source too. Hover for the crosshair and nearest value.",
    9: "Star cell -- click a star to rate; hovering previews, faintly, what that click would set.",
    11: "Spinner -- self-animating, no data and no interaction.",
    15: "Links cell -- click a link TITLE to fire its onClick; click elsewhere to edit the list.",
    17: "Button cell -- fires a callback and never edits the cell. Watch 'Last action' above.",
    18:
        "Tree view -- a DISCLOSURE TOGGLE, not a row tree. Click the chevron to flip isOpen. Hiding " +
        "rows is the consumer's job and source ships no grid-level tree, so this demo deliberately " +
        "does not fake one.",
};

export function demoColumnNote(col: number): string | undefined {
    return COLUMN_NOTES[col];
}

// Phase 6: zebra striping via `getRowThemeOverride`. **Module scope on purpose** -- the render
// engine's blit fast path compares this callback by identity across draws
// (`render/data-grid-render.blit.ts:243`), so a fresh inline arrow function per render would
// silently disable it and make scrolling repaint from scratch every frame. Returning `undefined`
// (not an empty object) for non-striped rows is also deliberate: it takes the cheap "no override"
// branch in the draw loop.
const ZEBRA_ROW_THEME: Partial<Theme> = { bgCell: "rgba(79, 93, 255, 0.07)" };

// Phase 6: per-cell theme override (see column 0's cell below) -- the most specific override level.
const CELL_FLAG_THEME_OVERRIDE: Partial<Theme> = {
    bgCell: "rgba(255, 71, 87, 0.30)",
    textDark: "#c40021",
    textLight: "#c40021",
};
export function demoGetRowThemeOverride(row: number): Partial<Theme> | undefined {
    return row % 2 === 1 ? ZEBRA_ROW_THEME : undefined;
}

// Phase 4c sample data: a handful of tags per row for the bubble column, and a small chip list
// (one with an icon, mixing in a data-URI so the demo has zero external network dependency) for
// the drilldown column.
const BUBBLE_TAGS = ["TypeScript", "Canvas", "Ember", "Rust", "GraphQL", "CSS", "Testing", "Infra"] as const;

// Images come from `demo-fixtures.ts` now: canvas-generated `data:` URIs, distinct per row, still
// with zero network dependency. They replaced a single tiny 8x8 solid-blue PNG reused for every
// thumbnail, chip icon and avatar -- which is a large part of why this demo used to look like
// placeholder art next to `<GlideDemo>`.
//
// **Built eagerly, at module load.** `getCellContent` runs inside the canvas draw loop, and
// `photoUrl` generates its whole palette on first call -- twelve offscreen canvases and twelve
// `toDataURL()` calls, mid-paint. `<GlideDemo>` never hit that because it materialises its records
// up front, so its first `photoUrl` call happens long before any drawing.
const PHOTOS: readonly string[] = Array.from({ length: PHOTO_PALETTE.length }, (_, i) => photoUrl(i));

// Phase 4b sample content for the markdown column -- exercises headings, bold/italic, and a list
// so the rendered-HTML preview (vs. the raw-text canvas draw) is visually obvious in the browser.
// Kept to ONE short line each. The markdown cell draws its raw source on the canvas (source does
// the same), so a multi-line sample renders as a clipped fragment of syntax -- which is what made
// this column read as broken rather than as a feature.
const MARKDOWN_SAMPLES = [
    "Renewal due in **March**",
    "Pending _security review_",
    "Approved by **Finance**",
    "Contract awaiting _signature_",
    "Escalated to **Owner**",
] as const;

// Phase 5b sample data for the tags/dropdown/multi-select/links `CustomRenderer` columns.
const POSSIBLE_TAGS = [
    { tag: "urgent", color: "#ff6b6b" },
    { tag: "bug", color: "#ffa94d" },
    { tag: "feature", color: "#69db7c" },
    { tag: "design", color: "#4dabf7" },
    { tag: "ops", color: "#da77f2" },
] as const;

const DROPDOWN_OPTIONS = ["Backlog", "In Progress", "In Review", "Done", "Blocked"] as const;

const MULTI_SELECT_OPTIONS = [
    { value: "chrome", label: "Chrome", color: "#4dabf7" },
    { value: "firefox", label: "Firefox", color: "#ffa94d" },
    { value: "safari", label: "Safari", color: "#69db7c" },
    { value: "edge", label: "Edge", color: "#748ffc" },
] as const;

// Phase 5c sample data for the date-picker/button/tree-view/user-profile/article `CustomRenderer`
// columns.
const PROJECT_NAMES = ["Atlas", "Beacon", "Cascade", "Delta", "Ember", "Foundry", "Harbour", "Ionic"] as const;
const FILE_NAMES = ["Contracts", "Onboarding", "Reviews", "Payroll", "Equipment", "Travel"] as const;

// Values for the 29 plain-text filler columns. One shared pool rather than a per-column one: the
// `salt` in `pickFrom` already keeps neighbouring columns from moving together, and the point is
// that the table reads as data, not that every column is semantically correct.
const FILLER_VALUES = [
    "EMEA",
    "AMER",
    "APAC",
    "Platform",
    "Growth",
    "Core",
    "Research",
    "London",
    "Berlin",
    "Toronto",
    "Sydney",
    "UTC+0",
    "UTC+1",
    "UTC-5",
    "UTC+10",
    "Permanent",
    "Contract",
    "Intern",
    "Tier 1",
    "Tier 2",
    "Tier 3",
    "Active",
    "On hold",
    "Renewing",
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    "Approved",
    "Pending",
    "Draft",
    "Archived",
    "Internal",
    "Partner",
    "Direct",
    "Referral",
] as const;

const WRAPPING_SAMPLE = "Wrapped text\ndemo content";

// Phase 4a: varies cell kind by column so text/number/boolean/row-id editing can all be exercised
// in the browser -- col 0 is a row-id (readonly), col 1 a number, col 2 a boolean. Phase 4b adds
// col 3 (uri, editable link) and col 4 (markdown, editable + rendered preview). Phase 4d adds col 5
// (image, 1-2 thumbnails + editable URL-list overlay). Phase 4c adds col 6 (bubble, display-only
// chip list of 2-4 tags) and col 7 (drilldown, display-only chips, one carrying a small icon).
// Phase 5a adds cols 8-11 (sparkline/star/range/spinner, all `GridCellKind.Custom`). Phase 5b adds
// cols 12-15 (tags/dropdown/multi-select/links, also `GridCellKind.Custom`). Everything else falls
// through to plain editable text.
export function demoGetCellContent(item: Item): GridCell {
    const [col, row] = item;

    if (col === 0) {
        return {
            kind: GridCellKind.RowID,
            data: `EMP-${String(row).padStart(5, "0")}`,
            allowOverlay: false,
            // Phase 6: per-cell `themeOverride`, the most specific level of the precedence chain
            // (it wins over both the column and the row override). Every 10th row is flagged red
            // so the cell level is visibly exercised alongside the column/row levels.
            themeOverride: row % 10 === 0 ? CELL_FLAG_THEME_OVERRIDE : undefined,
        };
    }

    if (col === 1) {
        const salary = 62_000 + (fieldHash(row, 3) % 118) * 1000;
        return {
            kind: GridCellKind.Number,
            data: salary,
            displayData: `$${salary.toLocaleString("en-US")}`,
            allowOverlay: true,
        };
    }

    if (col === 2) {
        return {
            kind: GridCellKind.Boolean,
            data: fieldHash(row, 4) % 4 !== 0,
            allowOverlay: false,
        };
    }

    if (col === 3) {
        // `onClickUri` is what makes the link *clickable* -- without it `uri-cell.ts`'s
        // `isOverLinkText` returns `false` unconditionally, so clicking the link text does nothing
        // at all (and this demo shipped exactly that until 2026-08-09, which read as a broken
        // affordance rather than as a deliberate omission).
        //
        // It is deliberately **not** a `window.open(...)`: the handler is the consumer's, and a
        // demo that spawns a real browser tab is a demo that cannot be click-tested by automation.
        // Reporting into the status line keeps the whole click path -- hover hit-test, cursor,
        // underline, dispatch -- genuinely exercised while staying inside the page.
        const uri = `https://example.com/u/${slug(row)}`;
        return {
            kind: GridCellKind.Uri,
            data: uri,
            displayData: uri,
            hoverEffect: true,
            allowOverlay: true,
            onClickUri: () => reportActivity(`Opened profile ${uri} (row ${row}) -- no real tab spawned`),
        };
    }

    if (col === 4) {
        return {
            kind: GridCellKind.Markdown,
            data: pickFrom(MARKDOWN_SAMPLES, row, 5),
            allowOverlay: true,
        };
    }

    if (col === 5) {
        // One portrait per row, generated on a canvas so each is visibly distinct. A second
        // thumbnail every fifth row still exercises `image-cell.ts`'s multi-image layout math
        // without making the common case look cramped.
        const urls = [PHOTOS[fieldHash(row, 6) % PHOTOS.length]!];
        if (row % 5 === 4) urls.push(PHOTOS[fieldHash(row, 7) % PHOTOS.length]!);
        return {
            kind: GridCellKind.Image,
            data: urls,
            allowOverlay: true,
        };
    }

    if (col === 6) {
        // 2-3 short skills. Deliberately not 4: at this column width a fourth would clip, and a
        // clipped chip hides the renderer's own truncation behaviour rather than showing it.
        const tagCount = 2 + (fieldHash(row, 8) % 2);
        const tags = distinctPicks(BUBBLE_TAGS, row, 8, tagCount);
        return {
            kind: GridCellKind.Bubble,
            data: tags,
            allowOverlay: false,
        };
    }

    if (col === 7) {
        const chipCount = 1 + (fieldHash(row, 11) % 2); // 1-2 chips
        const chips = distinctPicks(PROJECT_NAMES, row, 11, chipCount).map((name, i) => ({
            text: name,
            img: avatarUrl(name.slice(0, 2).toUpperCase(), fieldHash(row, 11 + i)),
        }));
        return {
            kind: GridCellKind.Drilldown,
            data: chips,
            allowOverlay: false,
        };
    }

    // Phase 5a: sparkline/star/range/spinner, all `GridCellKind.Custom` cells matched by
    // `extra-cells/index.ts`'s combinator via `cell.data.kind` (see PORTING-NOTES.md's Phase 5a
    // section). `copyData` is required by `CustomCell` even though nothing in this demo copies it.
    if (col === 8) {
        // A wavy-ish deterministic series per row so every row's chart looks visibly different,
        // alternating graph kind by row so line/bar/area are all exercised in one column.
        const phase = fieldHash(row, 14) % 100;
        const values = Array.from({ length: 12 }, (_, i) => 50 + 40 * Math.sin(phase / 8 + i / 2) + (phase % 7) * 2);
        const graphKinds = ["line", "bar", "area"] as const;
        return {
            kind: GridCellKind.Custom,
            allowOverlay: false,
            copyData: values.map(v => v.toFixed(1)).join(","),
            data: {
                kind: "sparkline-cell",
                values,
                displayValues: values.map(v => v.toFixed(0)),
                yAxis: [0, 100],
                graphKind: pickFrom(graphKinds, row, 15),
            },
        };
    }

    if (col === 9) {
        const rating = 1 + (fieldHash(row, 16) % 5);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: false,
            copyData: String(rating),
            data: {
                kind: "star-cell",
                rating,
            },
        };
    }

    if (col === 10) {
        const value = fieldHash(row, 17) % 101;
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: String(value),
            data: {
                kind: "range-cell",
                value,
                min: 0,
                max: 100,
                step: 1,
                label: `${value}%`,
            },
        };
    }

    if (col === 11) {
        return {
            kind: GridCellKind.Custom,
            allowOverlay: false,
            copyData: "",
            data: {
                kind: "spinner-cell",
            },
        };
    }

    // Phase 5b: tags (editable checkbox-list of pills), dropdown (native `<select>`), multi-select
    // (native `<select multiple>` + "add new" for `allowCreation`), links (list of clickable
    // titles). All `GridCellKind.Custom`, matched via `extra-cells/index.ts`'s combinator.
    if (col === 12) {
        const tagCount = 1 + (fieldHash(row, 18) % 2); // 1-2 labels
        const tags = distinctPicks(POSSIBLE_TAGS, row, 18, tagCount).map(t => t.tag);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: tags.join(", "),
            data: {
                kind: "tags-cell",
                tags,
                possibleTags: POSSIBLE_TAGS,
            },
        };
    }

    if (col === 13) {
        const value = pickFrom(DROPDOWN_OPTIONS, row, 20);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: value,
            data: {
                kind: "dropdown-cell",
                value,
                allowedValues: DROPDOWN_OPTIONS,
            },
        };
    }

    if (col === 14) {
        const count = 1 + (fieldHash(row, 21) % 2); // 1-2 selected browsers
        const values = distinctPicks(MULTI_SELECT_OPTIONS, row, 21, count).map(o => o.value);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: values.join(", "),
            data: {
                kind: "multi-select-cell",
                values,
                options: MULTI_SELECT_OPTIONS,
                allowCreation: true,
            },
        };
    }

    if (col === 15) {
        // `links-cell` dispatches a click to the hovered link's own `onClick` and never navigates
        // by itself, so a link with only an `href` is inert. Same treatment as col 3's uri cell:
        // a real handler, reporting into the status line rather than opening a tab.
        const links = [
            {
                title: `Issue #${1000 + (fieldHash(row, 23) % 8999)}`,
                href: `https://example.com/issues/${row}`,
                onClick: () => reportActivity(`Opened issue link for row ${row} -- no real tab spawned`),
            },
            {
                title: "Handbook",
                href: "https://example.com/handbook",
                onClick: () => reportActivity("Opened the handbook link -- no real tab spawned"),
            },
        ];
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: links.map(l => l.title).join(","),
            data: {
                kind: "links-cell",
                links,
            },
        };
    }

    // Phase 5c: date-picker (native `<input type="date"|"datetime-local">` editor), button
    // (in-cell click action, no editor), tree-view (expand/collapse state lives in the cell's own
    // `data`, see `extra-cells/tree-view-cell.ts`'s header comment + PORTING-NOTES.md's Phase 5c
    // section), user-profile (avatar + name, editable name), article (markdown preview +
    // plain-textarea editor, see `extra-cells/article-cell.ts` for the toast-ui simplification).
    // All `GridCellKind.Custom`, matched via `extra-cells/index.ts`'s combinator.
    if (col === 16) {
        // Alternates date-only vs. date+time format by row so both native input types are
        // exercised in one column.
        const isDateTime = fieldHash(row, 24) % 2 === 1;
        const dayOfYear = fieldHash(row, 25) % 365;
        const date = new Date(
            Date.UTC(
                2024,
                0,
                1 + dayOfYear,
                isDateTime ? fieldHash(row, 26) % 24 : 0,
                isDateTime ? fieldHash(row, 27) % 60 : 0
            )
        );
        const displayDate = isDateTime
            ? date.toISOString().slice(0, 16).replace("T", " ")
            : date.toISOString().slice(0, 10);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: displayDate,
            data: {
                kind: "date-picker-cell",
                date,
                displayDate,
                format: isDateTime ? "datetime-local" : "date",
            },
        };
    }

    if (col === 17) {
        const title = "Run report";
        return {
            kind: GridCellKind.Custom,
            readonly: true,
            allowOverlay: false,
            copyData: title,
            data: {
                kind: "button-cell",
                title,
                backgroundColor: "accentColor",
                color: "accentFg",
                borderRadius: 6,
                // `button-cell` never mutates its cell -- the entire feature is "call this callback"
                // (see `extra-cells/button-cell.ts`). This used to `console.log`, which meant the
                // column looked inert to anyone driving the demo. Reporting into the status line is
                // the same contract, made visible.
                onClick: () => reportActivity(`Ran report for ${personName(row)} (row ${row})`),
            },
        };
    }

    if (col === 18) {
        // A shallow, deterministic 3-level tree (depth cycles 0/1/2 by row) -- rows at depth 0/1
        // can open/close, depth 2 is always a leaf. Toggling the disclosure triangle commits a new
        // cell via the renderer's `onClick` hook (see `extra-cells/tree-view-cell.ts`), which lands
        // in `DemoGrid`'s `edits` override map exactly like any other cell edit -- no extra plumbing
        // needed here, `isOpen` for a given row just starts `false` until the user toggles it.
        const depth = row % 3;
        const name = pickFrom(FILE_NAMES, row, 28);
        const text = depth === 0 ? name : depth === 1 ? `${name} / 2024` : `${name.toLowerCase()}-2024.pdf`;
        return {
            kind: GridCellKind.Custom,
            readonly: true,
            allowOverlay: false,
            copyData: text,
            data: {
                kind: "tree-view-cell",
                text,
                isOpen: false,
                canOpen: depth < 2,
                depth,
                // Only the disclosure triangle is clickable (`tree-view-cell.ts`'s `isOverIcon`,
                // ported verbatim from source) -- clicking the row text does nothing but select,
                // which is why this column reads as inert until you find the ~22px target. The
                // activity report is here to make a successful toggle unmistakable, and to say the
                // part the glyph cannot: **no rows are hidden or revealed**. Row visibility is a
                // consumer concern in source too -- `packages/cells` ships no grid-level tree --
                // and this demo deliberately keeps `getCellContent` a pure function of `[col, row]`
                // over 200,000 rows, which a real collapse would have to break.
                onClickOpener: (cell: CustomCell<{ kind: "tree-view-cell"; isOpen: boolean }>) => {
                    const nowOpen = !cell.data.isOpen;
                    reportActivity(
                        `${nowOpen ? "Expanded" : "Collapsed"} "${text}" (row ${row}) -- isOpen only, no rows hidden`
                    );
                    return { ...cell, data: { ...cell.data, isOpen: nowOpen } };
                },
            },
        };
    }

    if (col === 19) {
        const name = personName(row);
        const tintIndex = fieldHash(row, 29);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: name,
            data: {
                kind: "user-profile-cell",
                image: avatarUrl(initials(row), tintIndex),
                initial: name[0]!,
                tint: PHOTO_PALETTE[tintIndex % PHOTO_PALETTE.length]![0],
                name,
            },
        };
    }

    if (col === 20) {
        const markdown = pickFrom(MARKDOWN_SAMPLES, row, 30);
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: markdown.split(/\r?\n/)[0] ?? markdown,
            data: {
                kind: "article-cell",
                markdown,
            },
        };
    }

    // One real wrapping cell keeps the Full grid demo's `hyperWrapping` option observable. The
    // other plain-text cells intentionally remain non-wrapping so their truncation behavior stays
    // visible too.
    if (col === 21) {
        return {
            kind: GridCellKind.Text,
            data: WRAPPING_SAMPLE,
            displayData: WRAPPING_SAMPLE,
            allowOverlay: true,
            allowWrapping: true,
        };
    }

    // Plain text for every remaining column, but plausible: `R7C34` in 29 columns was the single
    // biggest reason this demo read as filler.
    const text = pickFrom(FILLER_VALUES, row, 40 + col);
    return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: true,
    };
}

/**
 * Recompute any **derived display field** on a cell the user just edited, before the demo stores it.
 *
 * WHY THIS EXISTS -- and why it is the consumer's job, not the addon's. Several `GridCell` shapes
 * carry a raw value *and* a separate derived field that `draw()` is what actually reads. The addon
 * owns that sync wherever it owns the formatting (`displayData` on text cells, `displayDate` on
 * date-picker cells -- its own editors recompute those, and failing to was a real addon defect three
 * times over; see PORTING-NOTES.md's "Recurring bug class" section).
 *
 * `range-cell`'s `label` is the case where it CANNOT: the label is optional free-form text -- "42%",
 * "42 of 100", "high" -- so there is no formatter the addon could apply. Source's editor has the
 * identical shape and updates only `value` too. Whoever wrote the label owns keeping it true, and in
 * this demo that is us: `demoGetCellContent` builds `${value}%` for column 10.
 *
 * Without this, dragging the Progress slider moved the bar and left the trailing "42%" reading the
 * pre-edit number -- which looks exactly like "the value didn't save".
 */
export function normalizeEditedCell(cell: GridCell): GridCell {
    if (cell.kind !== GridCellKind.Custom) return cell;
    const data = cell.data as { kind?: string; value?: number; label?: string };
    if (data.kind === "range-cell" && data.label !== undefined && typeof data.value === "number") {
        return {
            ...cell,
            copyData: String(data.value),
            data: { ...data, label: `${data.value}%` },
        };
    }
    return cell;
}
