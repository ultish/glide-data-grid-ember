import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import {
    GridCellKind,
    type GridCell,
    type GridColumn,
    type GridSelection,
} from "glide-data-grid-ember/rendering/index";

class Person {
    @tracked name: string;
    @tracked role: string;
    @tracked active: boolean;
    constructor(name: string, role: string, active: boolean) {
        this.name = name;
        this.role = role;
        this.active = active;
    }
}

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 200 },
    { id: "role", title: "Role", width: 160 },
    { id: "active", title: "Active", width: 80 },
];

const TRAILING_ROW_OPTIONS = { hint: "Add row", tint: true };

const toCell = (p: Person, col: number): GridCell => {
    if (col === 0) return { kind: GridCellKind.Text, data: p.name, displayData: p.name, allowOverlay: true };
    if (col === 1) return { kind: GridCellKind.Text, data: p.role, displayData: p.role, allowOverlay: true };
    return { kind: GridCellKind.Boolean, data: p.active, allowOverlay: false };
};

export default class InteractionsGrid extends Component {
    @tracked people: readonly Person[] = [
        new Person("Ada Lovelace", "Mathematician", true),
        new Person("Grace Hopper", "Rear Admiral", true),
        new Person("Alan Turing", "Cryptanalyst", false),
        new Person("Katherine Johnson", "Aerospace", true),
        new Person("Margaret Hamilton", "Engineer", true),
    ];

    @tracked selectedRows: readonly number[] = [];
    @tracked selectedColumns: readonly number[] = [];
    @tracked focused = "none";

    onEdit = (person: Person, col: number, value: GridCell): void => {
        const field = COLUMNS[col]?.id;
        if (field === "active" && value.kind === GridCellKind.Boolean) {
            person.active = value.data === true;
            return;
        }
        if (value.kind !== GridCellKind.Text) return;
        if (field === "name") person.name = value.data;
        else if (field === "role") person.role = value.data;
    };

    onSelectionChanged = (selection: GridSelection): void => {
        this.selectedRows = selection.rows.toArray();
        this.selectedColumns = selection.columns.toArray();
        const cell = selection.current?.cell;
        this.focused = cell === undefined ? "none" : `col ${cell[0]}, row ${cell[1]}`;
    };

    addRow = (): void => {
        this.people = [...this.people, new Person("", "", true)];
    };

    deleteSelectedRows = (): void => {
        if (this.selectedRows.length === 0) return;
        const drop = new Set(this.selectedRows);
        this.people = this.people.filter((_, i) => !drop.has(i));
        this.selectedRows = [];
        this.focused = "none";
    };

    // Delete/Backspace: if whole rows are selected, remove them. Otherwise let the grid
    // clear the selected cells (the default).
    onDelete = (selection: GridSelection): boolean => {
        if (selection.rows.length === 0) return true;
        const drop = new Set(selection.rows.toArray());
        this.people = this.people.filter((_, i) => !drop.has(i));
        this.selectedRows = [];
        this.selectedColumns = [];
        this.focused = "none";
        return false;
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
            <button
                type="button"
                class="btn btn-xs"
                disabled={{if this.selectedRows.length false true}}
                {{on "click" this.deleteSelectedRows}}
            >
                Delete selected rows
            </button>
            <span class="gdg-cookbook__caption">
                focused
                {{this.focused}}
                · rows
                {{this.selectedRows.length}}
                · columns
                {{this.selectedColumns.length}}
            </span>
        </div>
        <div class="gdg-cookbook__live" style="height: 280px;">
            <GlideDataGrid
                @columns={{this.gridArgs.columns}}
                @rows={{this.gridArgs.rows}}
                @getCellContent={{this.gridArgs.getCellContent}}
                @onCellsEdited={{this.gridArgs.onCellsEdited}}
                @rowMarkers="both"
                @rowSelect="multi"
                @columnSelect="multi"
                @onSelectionChanged={{this.onSelectionChanged}}
                @showTrailingBlankRow={{true}}
                @trailingRowOptions={{TRAILING_ROW_OPTIONS}}
                @onRowAppended={{this.addRow}}
                @onDelete={{this.onDelete}}
            />
        </div>
    </template>
}

export const INTERACTIONS_RECIPE = `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn, type GridSelection } from "glide-data-grid-ember/rendering/index";

class Person {
  @tracked name: string;
  @tracked role: string;
  @tracked active: boolean;
  constructor(name: string, role: string, active: boolean) {
    this.name = name;
    this.role = role;
    this.active = active;
  }
}

const COLUMNS: readonly GridColumn[] = [
  { id: "name",   title: "Name",   width: 200 },
  { id: "role",   title: "Role",   width: 160 },
  { id: "active", title: "Active", width: 80 },
];

// Module scope: identity-stable. An inline hash in the template would be a new object every render.
const TRAILING_ROW_OPTIONS = { hint: "Add row", tint: true };

const toCell = (p: Person, col: number): GridCell => {
  if (col === 0) return { kind: GridCellKind.Text, data: p.name, displayData: p.name, allowOverlay: true };
  if (col === 1) return { kind: GridCellKind.Text, data: p.role, displayData: p.role, allowOverlay: true };
  // Boolean cells have no overlay. A click toggles and arrives as onCellsEdited.
  return { kind: GridCellKind.Boolean, data: p.active, allowOverlay: false };
};

export default class PeopleTable extends Component {
  @tracked people: readonly Person[] = [
    new Person("Ada Lovelace", "Mathematician", true),
    new Person("Grace Hopper", "Rear Admiral", true),
    new Person("Alan Turing", "Cryptanalyst", false),
    new Person("Katherine Johnson", "Aerospace", true),
    new Person("Margaret Hamilton", "Engineer", true),
  ];

  @tracked selectedRows: readonly number[] = [];
  @tracked selectedColumns: readonly number[] = [];
  @tracked focused = "none";

  onEdit = (person: Person, col: number, value: GridCell): void => {
    const field = COLUMNS[col]?.id;
    if (field === "active" && value.kind === GridCellKind.Boolean) {
      person.active = value.data === true;
      return;
    }
    if (value.kind !== GridCellKind.Text) return;
    if (field === "name") person.name = value.data;
    else if (field === "role") person.role = value.data;
  };

  onSelectionChanged = (selection: GridSelection): void => {
    this.selectedRows = selection.rows.toArray();
    this.selectedColumns = selection.columns.toArray();
    const cell = selection.current?.cell;
    this.focused = cell === undefined ? "none" : \`col \${cell[0]}, row \${cell[1]}\`;
  };

  addRow = (): void => {
    // New array. An in-place push keeps the identity and the grid never sees the row.
    this.people = [...this.people, new Person("", "", true)];
  };

  deleteSelectedRows = (): void => {
    if (this.selectedRows.length === 0) return;
    const drop = new Set(this.selectedRows);
    this.people = this.people.filter((_, i) => !drop.has(i));
    this.selectedRows = [];
    this.focused = "none";
  };

  // Delete/Backspace: remove whole rows when the marker column has a selection.
  // Return true to let the grid clear cells (the default); false if you handled it.
  onDelete = (selection: GridSelection): boolean => {
    if (selection.rows.length === 0) return true;
    const drop = new Set(selection.rows.toArray());
    this.people = this.people.filter((_, i) => !drop.has(i));
    this.selectedRows = [];
    this.selectedColumns = [];
    this.focused = "none";
    return false;
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
    <button type="button" {{on "click" this.deleteSelectedRows}}>Delete selected rows</button>
    <div style="height: 280px">
      <GlideDataGrid
        @columns={{this.gridArgs.columns}}
        @rows={{this.gridArgs.rows}}
        @getCellContent={{this.gridArgs.getCellContent}}
        @onCellsEdited={{this.gridArgs.onCellsEdited}}
        @rowMarkers="both"
        @rowSelect="multi"
        @columnSelect="multi"
        @onSelectionChanged={{this.onSelectionChanged}}
        @showTrailingBlankRow={{true}}
        @trailingRowOptions={{TRAILING_ROW_OPTIONS}}
        @onRowAppended={{this.addRow}}
        @onDelete={{this.onDelete}}
      />
    </div>
  </template>
}`;
