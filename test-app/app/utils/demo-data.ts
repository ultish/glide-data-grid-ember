// Demo dataset for the `<GlideDataGrid>` smoke-test route (`app/templates/application.gts`).
//
// ~50 columns x ~200,000 rows of plain text cells, generated on demand via a pure
// `getCellContent` function -- nothing is materialized up front. This is what actually proves the
// virtualization/scroll pipeline works: only cells the render engine asks for (the visible window)
// ever get a `GridCell` object built.
import { GridCellKind, type CustomCell, type GridCell, type GridColumn, type Item, type Theme } from "glide-data-grid-ember/rendering/index";

export const DEMO_ROW_COUNT = 200_000;
export const DEMO_COLUMN_COUNT = 50;

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

// Varied widths (visually obvious horizontal scrolling) and distinct titles per column.
export const demoColumns: readonly GridColumn[] = Array.from({ length: DEMO_COLUMN_COUNT }, (_, i) => ({
    id: `col-${i}`,
    title: `Column ${i}`,
    width: 90 + ((i * 37) % 220),
    themeOverride: i === 1 ? DEMO_COLUMN_THEME_OVERRIDE : undefined,
}));

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
const BUBBLE_TAGS = ["urgent", "bug", "feature", "design", "backend", "frontend", "ops", "docs"] as const;

// A tiny 8x8 solid-color PNG, inlined as a data URI -- used as the drilldown chip icon so the demo
// never depends on an external image URL (avoids flaky network-dependent browser tests).
const DRILLDOWN_ICON =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mNk+M9QzzCAgHFgYBQMYQAA4WkBH8fY6WkAAAAASUVORK5CYII=";

// Phase 4d: same tiny inlined data-URI PNG reused for the image column's thumbnail(s) -- keeps the
// demo free of any external network dependency (a real consumer would pass real image URLs;
// `ImageWindowLoader` doesn't care whether the URL is a data URI or a network one).
const IMAGE_SAMPLE = DRILLDOWN_ICON;

// Phase 4b sample content for the markdown column -- exercises headings, bold/italic, and a list
// so the rendered-HTML preview (vs. the raw-text canvas draw) is visually obvious in the browser.
const MARKDOWN_SAMPLES = [
    "# Heading\n\nSome **bold** and _italic_ text.",
    "**Bold row** with a [link](https://example.com).\n\n- one\n- two",
    "## Row note\n\nJust a *simple* paragraph.",
] as const;

// Phase 5b sample data for the tags/dropdown/multi-select/links `CustomRenderer` columns.
const POSSIBLE_TAGS = [
    { tag: "urgent", color: "#ff6b6b" },
    { tag: "bug", color: "#ffa94d" },
    { tag: "feature", color: "#69db7c" },
    { tag: "design", color: "#4dabf7" },
    { tag: "ops", color: "#da77f2" },
] as const;

const DROPDOWN_OPTIONS = ["Backlog", "In Progress", "In Review", "Done"] as const;

const MULTI_SELECT_OPTIONS = [
    { value: "chrome", label: "Chrome", color: "#4dabf7" },
    { value: "firefox", label: "Firefox", color: "#ffa94d" },
    { value: "safari", label: "Safari", color: "#69db7c" },
    { value: "edge", label: "Edge", color: "#748ffc" },
] as const;

// Phase 5c sample data for the date-picker/button/tree-view/user-profile/article `CustomRenderer`
// columns. `USER_NAMES`/`USER_TINTS` feed the user-profile column; `IMAGE_SAMPLE` (defined above,
// Phase 4d's tiny inlined data-URI PNG) is reused as every row's avatar so this demo stays free of
// external network dependencies.
const USER_NAMES = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Margaret Hamilton"] as const;
const USER_TINTS = ["#ff6b6b", "#4dabf7", "#69db7c", "#da77f2", "#ffa94d"] as const;

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
            data: `row-${row}`,
            allowOverlay: false,
            // Phase 6: per-cell `themeOverride`, the most specific level of the precedence chain
            // (it wins over both the column and the row override). Every 10th row is flagged red
            // so the cell level is visibly exercised alongside the column/row levels.
            themeOverride: row % 10 === 0 ? CELL_FLAG_THEME_OVERRIDE : undefined,
        };
    }

    if (col === 1) {
        return {
            kind: GridCellKind.Number,
            data: row,
            displayData: String(row),
            allowOverlay: true,
        };
    }

    if (col === 2) {
        return {
            kind: GridCellKind.Boolean,
            data: row % 2 === 0,
            allowOverlay: false,
        };
    }

    if (col === 3) {
        // `hoverEffect: true` alone is enough to exercise the link-colored/underline-on-hover
        // rendering and the editor open/commit path. Deliberately no `onClickUri` handler: setting
        // one makes a real in-bounds click on the link text short-circuit to `window.open(...)`
        // (see `uri-cell.ts`'s `onClick`/`isOverLinkText`) instead of the normal select/activate
        // flow, which would spawn a real new browser tab during automated click-testing -- not
        // worth the risk for a demo. The renderer's click-to-open affordance is still fully
        // implemented and would work for any real consumer that supplies `onClickUri`.
        const uri = `https://example.com/items/${row}`;
        return {
            kind: GridCellKind.Uri,
            data: uri,
            displayData: uri,
            hoverEffect: true,
            allowOverlay: true,
        };
    }

    if (col === 4) {
        return {
            kind: GridCellKind.Markdown,
            data: MARKDOWN_SAMPLES[row % MARKDOWN_SAMPLES.length]!,
            allowOverlay: true,
        };
    }

    if (col === 5) {
        // 1 or 2 thumbnails per row, exercising `image-cell.ts`'s multi-image layout math.
        const count = 1 + (row % 2);
        return {
            kind: GridCellKind.Image,
            data: Array.from({ length: count }, () => IMAGE_SAMPLE),
            allowOverlay: true,
        };
    }

    if (col === 6) {
        const tagCount = 2 + (row % 3); // 2-4 tags
        const tags = Array.from(
            { length: tagCount },
            (_, i) => BUBBLE_TAGS[(row + i * 3) % BUBBLE_TAGS.length]!
        );
        return {
            kind: GridCellKind.Bubble,
            data: tags,
            allowOverlay: false,
        };
    }

    if (col === 7) {
        const chipCount = 2 + (row % 2); // 2-3 chips
        const chips = Array.from({ length: chipCount }, (_, i) => ({
            text: `Item ${row}-${i}`,
            img: i === 0 ? DRILLDOWN_ICON : undefined,
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
        const values = Array.from({ length: 12 }, (_, i) => 50 + 40 * Math.sin(row / 3 + i / 2) + (row % 7) * 2);
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
                graphKind: graphKinds[row % graphKinds.length],
            },
        };
    }

    if (col === 9) {
        const rating = 1 + (row % 5);
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
        const value = row % 101;
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
        const tagCount = 1 + (row % 3); // 1-3 tags
        const tags = Array.from({ length: tagCount }, (_, i) => POSSIBLE_TAGS[(row + i * 2) % POSSIBLE_TAGS.length]!.tag);
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
        const value = DROPDOWN_OPTIONS[row % DROPDOWN_OPTIONS.length]!;
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
        const count = 1 + (row % 3); // 1-3 selected browsers
        const values = Array.from({ length: count }, (_, i) => MULTI_SELECT_OPTIONS[(row + i) % MULTI_SELECT_OPTIONS.length]!.value);
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
        // Deliberately no real `href`/`onClick` navigation wired up (same reasoning as col 3's uri
        // cell -- avoids spawning real browser tabs/navigation during automated click-testing), but
        // the draw/hover-underline and editor's add/remove/edit-title-and-url affordances are all
        // fully real and exercised.
        const links = [
            { title: `Issue #${row}`, href: `https://example.com/issues/${row}` },
            { title: "Docs", href: "https://example.com/docs" },
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
        const isDateTime = row % 2 === 1;
        const date = new Date(Date.UTC(2024, 0, 1 + (row % 365), isDateTime ? row % 24 : 0, isDateTime ? (row * 7) % 60 : 0));
        const displayDate = isDateTime ? date.toISOString().slice(0, 16).replace("T", " ") : date.toISOString().slice(0, 10);
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
        const title = `Run #${row}`;
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
                // eslint-disable-next-line no-console
                onClick: () => console.log(`[demo] button-cell clicked, row ${row}`),
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
        const text = depth === 0 ? `Folder ${row}` : depth === 1 ? `Subfolder ${row}` : `File ${row}`;
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
                onClickOpener: (cell: CustomCell<{ kind: "tree-view-cell"; isOpen: boolean }>) => ({
                    ...cell,
                    data: { ...cell.data, isOpen: !cell.data.isOpen },
                }),
            },
        };
    }

    if (col === 19) {
        const name = USER_NAMES[row % USER_NAMES.length]!;
        return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: name,
            data: {
                kind: "user-profile-cell",
                image: IMAGE_SAMPLE,
                initial: name[0]!,
                tint: USER_TINTS[row % USER_TINTS.length]!,
                name,
            },
        };
    }

    if (col === 20) {
        const markdown = MARKDOWN_SAMPLES[row % MARKDOWN_SAMPLES.length]!;
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

    const text = `R${row}C${col}`;
    return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: true,
    };
}
