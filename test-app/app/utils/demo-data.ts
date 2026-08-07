// Demo dataset for the `<GlideDataGrid>` smoke-test route (`app/templates/application.gts`).
//
// ~50 columns x ~200,000 rows of plain text cells, generated on demand via a pure
// `getCellContent` function -- nothing is materialized up front. This is what actually proves the
// virtualization/scroll pipeline works: only cells the render engine asks for (the visible window)
// ever get a `GridCell` object built.
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

export const DEMO_ROW_COUNT = 200_000;
export const DEMO_COLUMN_COUNT = 50;

// Varied widths (visually obvious horizontal scrolling) and distinct titles per column.
export const demoColumns: readonly GridColumn[] = Array.from({ length: DEMO_COLUMN_COUNT }, (_, i) => ({
    id: `col-${i}`,
    title: `Column ${i}`,
    width: 90 + ((i * 37) % 220),
}));

// Phase 4c sample data: a handful of tags per row for the bubble column, and a small chip list
// (one with an icon, mixing in a data-URI so the demo has zero external network dependency) for
// the drilldown column.
const BUBBLE_TAGS = ["urgent", "bug", "feature", "design", "backend", "frontend", "ops", "docs"] as const;

// A tiny 8x8 solid-color PNG, inlined as a data URI -- used as the drilldown chip icon so the demo
// never depends on an external image URL (avoids flaky network-dependent browser tests).
const DRILLDOWN_ICON =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mNk+M9QzzCAgHFgYBQMYQAA4WkBH8fY6WkAAAAASUVORK5CYII=";

// Phase 4b sample content for the markdown column -- exercises headings, bold/italic, and a list
// so the rendered-HTML preview (vs. the raw-text canvas draw) is visually obvious in the browser.
const MARKDOWN_SAMPLES = [
    "# Heading\n\nSome **bold** and _italic_ text.",
    "**Bold row** with a [link](https://example.com).\n\n- one\n- two",
    "## Row note\n\nJust a *simple* paragraph.",
] as const;

// Phase 4a: varies cell kind by column so text/number/boolean/row-id editing can all be exercised
// in the browser -- col 0 is a row-id (readonly), col 1 a number, col 2 a boolean. Phase 4b adds
// col 3 (uri, editable link) and col 4 (markdown, editable + rendered preview). Phase 4c adds col 6
// (bubble, display-only chip list of 2-4 tags) and col 7 (drilldown, display-only chips, one
// carrying a small icon). Everything else falls through to plain editable text.
export function demoGetCellContent(item: Item): GridCell {
    const [col, row] = item;

    if (col === 0) {
        return {
            kind: GridCellKind.RowID,
            data: `row-${row}`,
            allowOverlay: false,
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

    const text = `R${row}C${col}`;
    return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: true,
    };
}
