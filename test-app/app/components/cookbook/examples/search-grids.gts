import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid, { type GlideDataGridApi } from "glide-data-grid-ember/components/glide-data-grid";
import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";
import type { SearchState } from "glide-data-grid-ember/components/glide-search-bar";

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 200 },
    { id: "email", title: "Email", width: 240 },
    { id: "role", title: "Role", width: 140 },
];

const PEOPLE = [
    { name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" },
    { name: "Grace Hopper", email: "grace@example.com", role: "Rear Admiral" },
    { name: "Alan Turing", email: "alan@example.com", role: "Cryptanalyst" },
    { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
    { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
    { name: "Radia Perlman", email: "radia@example.com", role: "Networks" },
    { name: "Barbara Liskov", email: "barbara@example.com", role: "Languages" },
    { name: "Jean Bartik", email: "jean@example.com", role: "Hardware" },
];

function getCellContent([col, row]: Item): GridCell {
    const person = PEOPLE[row];
    const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
}

export class AddonSearchGrid extends Component {
    columns = COLUMNS;
    rows = PEOPLE.length;
    getCellContent = getCellContent;

    <template>
        <div class="gdg-cookbook__live" style="height: 280px;">
            <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}} @getCellContent={{this.getCellContent}}>
                <:default as |grid|>
                    <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
                </:default>
            </GlideDataGrid>
        </div>
    </template>
}

export class ExternalSearchGrid extends Component {
    columns = COLUMNS;
    rows = PEOPLE.length;
    getCellContent = getCellContent;

    @tracked private api: GlideDataGridApi | undefined;
    @tracked private searchState: SearchState | undefined;
    @tracked query = "";

    onReady = (api: GlideDataGridApi): void => {
        this.api = api;
    };

    onSearchStateChange = (state: SearchState): void => {
        this.searchState = state;
    };

    onInput = (event: Event): void => {
        const value = (event.target as HTMLInputElement).value;
        this.query = value;
        this.api?.setSearchValue(value);
    };

    next = (): void => {
        this.api?.searchNext();
    };

    prev = (): void => {
        this.api?.searchPrev();
    };

    close = (): void => {
        this.query = "";
        this.api?.closeSearch();
    };

    get matchLabel(): string {
        const state = this.searchState;
        if (state === undefined || state.status === undefined) return "";
        const n = state.results.length;
        if (n === 0) return "0 results";
        return `${state.selectedIndex + 1} of ${n}`;
    }

    <template>
        <div class="gdg-cookbook__controls">
            <input
                type="search"
                value={{this.query}}
                placeholder="Find in grid"
                {{on "input" this.onInput}}
                style="padding: 4px 8px; font: inherit; border: 1px solid #e1e2e5; border-radius: 4px;"
            />
            <button type="button" class="btn btn-xs" {{on "click" this.prev}}>Prev</button>
            <button type="button" class="btn btn-xs" {{on "click" this.next}}>Next</button>
            <button type="button" class="btn btn-xs" {{on "click" this.close}}>Close</button>
            {{#if this.searchState.status}}
                <span class="gdg-cookbook__caption">
                    {{this.matchLabel}}
                </span>
            {{/if}}
        </div>
        <div class="gdg-cookbook__live" style="height: 280px;">
            <GlideDataGrid
                @columns={{this.columns}}
                @rows={{this.rows}}
                @getCellContent={{this.getCellContent}}
                @showSearch={{true}}
                @onReady={{this.onReady}}
                @onSearchStateChange={{this.onSearchStateChange}}
            />
        </div>
    </template>
}

export const ADDON_SEARCH_RECIPE = `import Component from "@glimmer/component";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 140 },
];

const PEOPLE = [
  { name: "Ada Lovelace",      email: "ada@example.com",      role: "Mathematician" },
  { name: "Grace Hopper",      email: "grace@example.com",    role: "Rear Admiral" },
  { name: "Alan Turing",       email: "alan@example.com",     role: "Cryptanalyst" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
  { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
  { name: "Radia Perlman",     email: "radia@example.com",     role: "Networks" },
  { name: "Barbara Liskov",    email: "barbara@example.com",    role: "Languages" },
  { name: "Jean Bartik",       email: "jean@example.com",      role: "Hardware" },
];

export default class PeopleSearch extends Component {
  columns = COLUMNS;
  rows = PEOPLE.length;

  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row];
    const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
  };

  <template>
    <div style="height: 280px">
      <GlideDataGrid @columns={{this.columns}} @rows={{this.rows}} @getCellContent={{this.getCellContent}}>
        <:default as |grid|>
          <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
        </:default>
      </GlideDataGrid>
    </div>
  </template>
}`;

export const EXTERNAL_SEARCH_RECIPE = `import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import GlideDataGrid, { type GlideDataGridApi } from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";
import type { SearchState } from "glide-data-grid-ember/components/glide-search-bar";

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 200 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 140 },
];

const PEOPLE = [
  { name: "Ada Lovelace",      email: "ada@example.com",      role: "Mathematician" },
  { name: "Grace Hopper",      email: "grace@example.com",    role: "Rear Admiral" },
  { name: "Alan Turing",       email: "alan@example.com",     role: "Cryptanalyst" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
  { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
  { name: "Radia Perlman",     email: "radia@example.com",     role: "Networks" },
  { name: "Barbara Liskov",    email: "barbara@example.com",    role: "Languages" },
  { name: "Jean Bartik",       email: "jean@example.com",      role: "Hardware" },
];

export default class ExternalSearch extends Component {
  columns = COLUMNS;
  rows = PEOPLE.length;

  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row];
    const value = person === undefined ? "" : ([person.name, person.email, person.role][col] ?? "");
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
  };

  @tracked api: GlideDataGridApi | undefined;
  @tracked searchState: SearchState | undefined;
  @tracked query = "";

  onReady = (api: GlideDataGridApi): void => { this.api = api; };
  onSearchStateChange = (state: SearchState): void => { this.searchState = state; };

  onInput = (event: Event): void => {
    const value = (event.target as HTMLInputElement).value;
    this.query = value;
    this.api?.setSearchValue(value);
  };

  next = (): void => { this.api?.searchNext(); };
  prev = (): void => { this.api?.searchPrev(); };
  close = (): void => { this.query = ""; this.api?.closeSearch(); };

  <template>
    <input type="search" value={{this.query}} {{on "input" this.onInput}} placeholder="Find in grid" />
    <button type="button" {{on "click" this.prev}}>Prev</button>
    <button type="button" {{on "click" this.next}}>Next</button>
    <button type="button" {{on "click" this.close}}>Close</button>
    <div style="height: 280px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{this.rows}}
        @getCellContent={{this.getCellContent}}
        @showSearch={{true}}
        @onReady={{this.onReady}}
        @onSearchStateChange={{this.onSearchStateChange}}
      />
    </div>
  </template>
}`;
