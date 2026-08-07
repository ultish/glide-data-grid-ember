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

// Phase 4a: varies cell kind by column so text/number/boolean/row-id editing can all be exercised
// in the browser -- col 0 is a row-id (readonly), col 1 a number, col 2 a boolean. Phase 4c adds
// col 6 (bubble, display-only chip list of 2-4 tags) and col 7 (drilldown, display-only chips, one
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
