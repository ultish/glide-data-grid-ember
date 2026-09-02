import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

class Person {
    @tracked name: string;
    @tracked email: string;
    @tracked role: string;
    constructor(name: string, email: string, role: string) {
        this.name = name;
        this.email = email;
        this.role = role;
    }
}

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 190 },
    { id: "email", title: "Email", width: 240 },
    { id: "role", title: "Role", width: 150 },
];

const toCell = (p: Person, col: number): GridCell => {
    const value = [p.name, p.email, p.role][col] ?? "";
    return { kind: GridCellKind.Text, allowOverlay: true, data: value, displayData: value };
};

const SEED: readonly Person[] = [
    new Person("Ada Lovelace", "ada@example.com", "Mathematician"),
    new Person("Grace Hopper", "grace@example.com", "Rear Admiral"),
    new Person("Alan Turing", "alan@example.com", "Cryptanalyst"),
    new Person("Katherine Johnson", "katherine@example.com", "Aerospace"),
    new Person("Margaret Hamilton", "margaret@example.com", "Engineer"),
];

export default class TrackedPeople extends Component {
    @tracked people: readonly Person[] = SEED;

    onEdit = (person: Person, col: number, value: GridCell): void => {
        if (value.kind !== GridCellKind.Text) return;
        const field = COLUMNS[col]?.id;
        if (field === "name") person.name = value.data;
        else if (field === "email") person.email = value.data;
        else if (field === "role") person.role = value.data;
    };

    addRow = (): void => {
        const n = this.people.length + 1;
        this.people = [...this.people, new Person(`Person ${n}`, `p${n}@example.com`, "Engineer")];
    };

    @cached
    get gridArgs() {
        return recordsSource({
            records: this.people,
            columns: COLUMNS,
            toCell,
            onCellEdited: this.onEdit,
        });
    }

    <template>
        <div class="gdg-cookbook__controls">
            <button type="button" class="btn btn-xs" {{on "click" this.addRow}}>Add row</button>
            <span class="gdg-cookbook__caption">{{this.people.length}}
                rows. Edit a cell, or add one — both repaint with no imperative redraw.</span>
        </div>
        <div class="gdg-cookbook__live">
            <GlideDataGrid
                @columns={{this.gridArgs.columns}}
                @rows={{this.gridArgs.rows}}
                @getCellContent={{this.gridArgs.getCellContent}}
                @onCellsEdited={{this.gridArgs.onCellsEdited}}
            />
        </div>
    </template>
}

export const TRACKED_PEOPLE_RECIPE = `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

class Person {
  @tracked name: string;
  @tracked email: string;
  @tracked role: string;
  constructor(name: string, email: string, role: string) {
    this.name = name;
    this.email = email;
    this.role = role;
  }
}

// Module scope. Both of these are identity-stable: the per-row caches close over them,
// and a new identity rebuilds every cache.
const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const toCell = (p: Person, col: number): GridCell => {
  const value = [p.name, p.email, p.role][col] ?? "";
  return { kind: GridCellKind.Text, allowOverlay: true, data: value, displayData: value };
};

export default class PeopleTable extends Component {
  @tracked people: readonly Person[] = [
    new Person("Ada Lovelace", "ada@example.com", "Mathematician"),
    new Person("Grace Hopper", "grace@example.com", "Rear Admiral"),
    new Person("Alan Turing", "alan@example.com", "Cryptanalyst"),
    new Person("Katherine Johnson", "katherine@example.com", "Aerospace"),
    new Person("Margaret Hamilton", "margaret@example.com", "Engineer"),
  ];

  // Class-field arrow, not @action: Ember 6+ no longer recommends the decorator,
  // and an arrow field is identity-stable per instance.
  onEdit = (person: Person, col: number, value: GridCell): void => {
    if (value.kind !== GridCellKind.Text) return;
    const field = COLUMNS[col]?.id;
    if (field === "name") person.name = value.data;
    else if (field === "email") person.email = value.data;
    else if (field === "role") person.role = value.data;
  };

  addRow = (): void => {
    const n = this.people.length + 1;
    this.people = [...this.people, new Person(\`Person \${n}\`, \`p\${n}@example.com\`, "Engineer")];
  };

  @cached
  get gridArgs() {
    return recordsSource({
      records: this.people,
      columns: COLUMNS,
      toCell,
      onCellEdited: this.onEdit,
    });
  }

  <template>
    <button type="button" {{on "click" this.addRow}}>Add row</button>
    <div style="height: 220px">
      <GlideDataGrid
        @columns={{this.gridArgs.columns}}
        @rows={{this.gridArgs.rows}}
        @getCellContent={{this.gridArgs.getCellContent}}
        @onCellsEdited={{this.gridArgs.onCellsEdited}}
      />
    </div>
  </template>
}`;
