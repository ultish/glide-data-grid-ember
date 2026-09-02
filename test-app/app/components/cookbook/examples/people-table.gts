import Component from "@glimmer/component";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 190 },
    { id: "email", title: "Email", width: 240 },
    { id: "role", title: "Role", width: 150 },
];

const PEOPLE = [
    { name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" },
    { name: "Grace Hopper", email: "grace@example.com", role: "Rear Admiral" },
    { name: "Alan Turing", email: "alan@example.com", role: "Cryptanalyst" },
    { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
    { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

export default class PeopleTable extends Component {
    columns = COLUMNS;
    rows = PEOPLE.length;

    getCellContent = ([col, row]: Item): GridCell => {
        const person = PEOPLE[row];
        const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
        return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
    };

    <template>
        <div class="gdg-cookbook__live">
            <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}} @getCellContent={{this.getCellContent}} />
        </div>
    </template>
}

export const PEOPLE_TABLE_RECIPE = `import Component from "@glimmer/component";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const PEOPLE = [
  { name: "Ada Lovelace",      email: "ada@example.com",      role: "Mathematician" },
  { name: "Grace Hopper",      email: "grace@example.com",    role: "Rear Admiral" },
  { name: "Alan Turing",       email: "alan@example.com",     role: "Cryptanalyst" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
  { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

export default class PeopleTable extends Component {
  columns = COLUMNS;
  rows = PEOPLE.length;

  // A class-field arrow, never @action. Ember 6+ no longer recommends the decorator,
  // and the arrow is identity-stable — which the grid's scroll fast path requires.
  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row];
    const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
  };

  <template>
    {{! The grid fills its container, so the container needs a height. }}
    <div style="height: 220px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{this.rows}}
        @getCellContent={{this.getCellContent}}
      />
    </div>
  </template>
}`;
