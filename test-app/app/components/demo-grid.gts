// Demo-app backing component for the `<GlideDataGrid>` smoke-test route.
//
// Holds `@tracked columns` so resize/reorder round-trip visually -- `GridHostController` never
// mutates column state itself (documented "consumer owns the data" contract in
// `grid-host-controller.ts`), so a real consumer needs exactly this kind of tracked-state +
// handler wiring to make resize/reorder actually stick. `ember-route-template`'s `Route(<template>)`
// pattern (used in `application.gts`) has no backing class, hence this separate component.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { demoColumns, demoGetCellContent, DEMO_ROW_COUNT } from "test-app/utils/demo-data";
import type { GridColumn } from "glide-data-grid-ember/rendering/index";

export default class DemoGrid extends Component {
    @tracked columns: readonly GridColumn[] = demoColumns;
    getCellContent = demoGetCellContent;
    rows = DEMO_ROW_COUNT;

    @action
    handleColumnResize(_column: GridColumn, newSize: number, colIndex: number): void {
        this.columns = this.columns.map((c, i) => (i === colIndex ? { ...c, width: newSize } : c));
    }

    @action
    handleColumnMoved(startIndex: number, endIndex: number): void {
        const cols = [...this.columns];
        const [moved] = cols.splice(startIndex, 1);
        if (moved === undefined) return;
        cols.splice(endIndex, 0, moved);
        this.columns = cols;
    }

    <template>
        <GlideDataGrid
            @columns={{this.columns}}
            @getCellContent={{this.getCellContent}}
            @rows={{this.rows}}
            @onColumnResize={{this.handleColumnResize}}
            @onColumnMoved={{this.handleColumnMoved}}
        />
    </template>
}
