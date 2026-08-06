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

export function demoGetCellContent(item: Item): GridCell {
    const [col, row] = item;
    const text = `R${row}C${col}`;
    return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: false,
    };
}
