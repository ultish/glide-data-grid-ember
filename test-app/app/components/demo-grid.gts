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
import type { GridColumn, GridCell, Item } from "glide-data-grid-ember/rendering/index";

export default class DemoGrid extends Component {
    @tracked columns: readonly GridColumn[] = demoColumns;
    // Phase 4a: cell edits (from the overlay editor / boolean toggle / delete) land here rather
    // than mutating `demoGetCellContent`'s output directly -- `GridHostController` never owns cell
    // data itself (same "consumer owns the data" contract as columns above), so a real consumer
    // needs exactly this kind of override-map + `onCellsEdited` handler to make edits stick.
    @tracked edits: ReadonlyMap<string, GridCell> = new Map();
    rows = DEMO_ROW_COUNT;

    getCellContent = (item: Item): GridCell => {
        return this.edits.get(`${item[0]},${item[1]}`) ?? demoGetCellContent(item);
    };

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

    @action
    handleCellsEdited(edits: readonly { location: Item; value: GridCell }[]): void {
        const next = new Map(this.edits);
        for (const edit of edits) next.set(`${edit.location[0]},${edit.location[1]}`, edit.value);
        this.edits = next;
    }

    <template>
        <GlideDataGrid
            @columns={{this.columns}}
            @getCellContent={{this.getCellContent}}
            @rows={{this.rows}}
            @onColumnResize={{this.handleColumnResize}}
            @onColumnMoved={{this.handleColumnMoved}}
            @onCellsEdited={{this.handleCellsEdited}}
        />
    </template>
}
