import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const PEOPLE = [
    { name: "Ada Lovelace", email: "ada@example.com", notes: "Analytical engine", score: 98 },
    { name: "Grace Hopper", email: "grace@example.com", notes: "COBOL", score: 95 },
    { name: "Alan Turing", email: "alan@example.com", notes: "Halting problem", score: 97 },
    { name: "Katherine Johnson", email: "katherine@example.com", notes: "Orbital mechanics", score: 99 },
    { name: "Margaret Hamilton", email: "margaret@example.com", notes: "Apollo guidance", score: 96 },
];

function initialColumns(): GridColumn[] {
    return [
        { id: "name", title: "Name", width: 180, icon: "headerString" },
        { id: "email", title: "Email", width: 200, icon: "headerEmail" },
        { id: "notes", title: "Notes", width: 160, grow: 1, icon: "headerString" },
        { id: "score", title: "Score", width: 90, group: "Metrics", icon: "headerNumber", hasMenu: true },
    ];
}

export default class ColumnsGrid extends Component {
    @tracked columns: readonly GridColumn[] = initialColumns();

    getCellContent = ([col, row]: Item): GridCell => {
        const person = PEOPLE[row];
        if (person === undefined) {
            return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false };
        }
        const value = [person.name, person.email, person.notes, String(person.score)][col] ?? "";
        return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
    };

    onColumnResize = (column: GridColumn, newSize: number): void => {
        this.columns = this.columns.map(c => (c.id === column.id ? { ...c, width: newSize } : c));
    };

    <template>
        <div class="gdg-cookbook__live" style="height: 260px;">
            <GlideDataGrid
                @columns={{this.columns}}
                @rows={{5}}
                @getCellContent={{this.getCellContent}}
                @onColumnResize={{this.onColumnResize}}
                @freezeColumns={{1}}
            />
        </div>
    </template>
}

export const COLUMNS_GRID_RECIPE = `import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const PEOPLE = [
  { name: "Ada Lovelace", email: "ada@example.com", notes: "Analytical engine", score: 98 },
  { name: "Grace Hopper", email: "grace@example.com", notes: "COBOL", score: 95 },
  { name: "Alan Turing", email: "alan@example.com", notes: "Halting problem", score: 97 },
  { name: "Katherine Johnson", email: "katherine@example.com", notes: "Orbital mechanics", score: 99 },
  { name: "Margaret Hamilton", email: "margaret@example.com", notes: "Apollo guidance", score: 96 },
];

export default class ColumnsGrid extends Component {
  // You own column state. Resize is a notification — write the new width back or nothing sticks.
  @tracked columns: readonly GridColumn[] = [
    { id: "name",  title: "Name",  width: 180, icon: "headerString" },
    { id: "email", title: "Email", width: 200, icon: "headerEmail" },
    { id: "notes", title: "Notes", width: 160, grow: 1, icon: "headerString" },
    { id: "score", title: "Score", width: 90,  group: "Metrics", icon: "headerNumber", hasMenu: true },
  ];

  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row];
    if (person === undefined) {
      return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false };
    }
    const value = [person.name, person.email, person.notes, String(person.score)][col] ?? "";
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
  };

  onColumnResize = (column: GridColumn, newSize: number): void => {
    this.columns = this.columns.map(c => (c.id === column.id ? { ...c, width: newSize } : c));
  };

  <template>
    <div style="height: 260px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{5}}
        @getCellContent={{this.getCellContent}}
        @onColumnResize={{this.onColumnResize}}
        @freezeColumns={{1}}
      />
    </div>
  </template>
}`;
