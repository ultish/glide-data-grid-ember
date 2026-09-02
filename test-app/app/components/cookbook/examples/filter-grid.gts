import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

type Team = "Eng" | "Design" | "PM";

class Person {
    readonly id: number;
    readonly name: string;
    readonly team: Team;
    readonly score: number;
    constructor(id: number, name: string, team: Team, score: number) {
        this.id = id;
        this.name = name;
        this.team = team;
        this.score = score;
    }
}

const TEAMS: readonly Team[] = ["Eng", "Design", "PM"];
const FIRST = ["Ada", "Grace", "Alan", "Katherine", "Margaret", "Radia", "Barbara", "Jean"];
const LAST = ["Lovelace", "Hopper", "Turing", "Johnson", "Hamilton", "Perlman", "Liskov", "Bartik"];

const ALL: readonly Person[] = Array.from({ length: 200 }, (_, i) => {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${i + 1}`;
    const team = TEAMS[i % TEAMS.length]!;
    const score = 40 + ((i * 17) % 61);
    return new Person(i + 1, name, team, score);
});

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 220 },
    { id: "team", title: "Team", width: 110 },
    { id: "score", title: "Score", width: 90 },
];

const toCell = (p: Person, col: number): GridCell => {
    if (col === 0) return { kind: GridCellKind.Text, data: p.name, displayData: p.name, allowOverlay: false };
    if (col === 1) return { kind: GridCellKind.Text, data: p.team, displayData: p.team, allowOverlay: false };
    return { kind: GridCellKind.Number, data: p.score, displayData: String(p.score), allowOverlay: false };
};

export default class FilterGrid extends Component {
    @tracked team: Team | "All" = "All";
    @tracked query = "";
    @tracked minScore = 40;

    setTeam = (team: Team | "All"): void => {
        this.team = team;
    };

    onQuery = (event: Event): void => {
        this.query = (event.target as HTMLInputElement).value;
    };

    onScore = (event: Event): void => {
        this.minScore = Number((event.target as HTMLInputElement).value);
    };

    isTeam = (team: Team | "All"): boolean => team === this.team;

    @cached
    get filtered(): readonly Person[] {
        const q = this.query.trim().toLowerCase();
        return ALL.filter(p => {
            if (this.team !== "All" && p.team !== this.team) return false;
            if (p.score < this.minScore) return false;
            if (q !== "" && !p.name.toLowerCase().includes(q)) return false;
            return true;
        });
    }

    @cached
    get gridArgs() {
        return recordsSource({ records: this.filtered, columns: COLUMNS, toCell });
    }

    <template>
        <div class="gdg-cookbook__controls">
            <button
                type="button"
                class="btn btn-xs {{if (this.isTeam 'All') 'btn-active'}}"
                {{on "click" (fn this.setTeam "All")}}
            >All</button>
            <button
                type="button"
                class="btn btn-xs {{if (this.isTeam 'Eng') 'btn-active'}}"
                {{on "click" (fn this.setTeam "Eng")}}
            >Eng</button>
            <button
                type="button"
                class="btn btn-xs {{if (this.isTeam 'Design') 'btn-active'}}"
                {{on "click" (fn this.setTeam "Design")}}
            >Design</button>
            <button
                type="button"
                class="btn btn-xs {{if (this.isTeam 'PM') 'btn-active'}}"
                {{on "click" (fn this.setTeam "PM")}}
            >PM</button>
            <input
                type="search"
                value={{this.query}}
                placeholder="Filter by name"
                aria-label="Filter by name"
                {{on "input" this.onQuery}}
                style="padding: 4px 8px; font: inherit; border: 1px solid #e1e2e5; border-radius: 4px;"
            />
            <label style="display: flex; gap: 6px; align-items: center;">
                Score ≥
                {{this.minScore}}
                <input type="range" min="40" max="100" value={{this.minScore}} {{on "input" this.onScore}} />
            </label>
            <span class="gdg-cookbook__caption">{{this.filtered.length}} of {{ALL.length}}</span>
        </div>
        <div class="gdg-cookbook__live" style="height: 320px;">
            <GlideDataGrid
                @columns={{this.gridArgs.columns}}
                @rows={{this.gridArgs.rows}}
                @getCellContent={{this.gridArgs.getCellContent}}
            />
        </div>
    </template>
}

export const FILTER_GRID_RECIPE = `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

type Team = "Eng" | "Design" | "PM";

class Person {
  readonly id: number;
  readonly name: string;
  readonly team: Team;
  readonly score: number;
  constructor(id: number, name: string, team: Team, score: number) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.score = score;
  }
}

const TEAMS: readonly Team[] = ["Eng", "Design", "PM"];
const FIRST = ["Ada", "Grace", "Alan", "Katherine", "Margaret", "Radia", "Barbara", "Jean"];
const LAST = ["Lovelace", "Hopper", "Turing", "Johnson", "Hamilton", "Perlman", "Liskov", "Bartik"];

const ALL: readonly Person[] = Array.from({ length: 200 }, (_, i) => {
  const name = \`\${FIRST[i % FIRST.length]} \${LAST[Math.floor(i / FIRST.length) % LAST.length]} \${i + 1}\`;
  const team = TEAMS[i % TEAMS.length]!;
  const score = 40 + ((i * 17) % 61);
  return new Person(i + 1, name, team, score);
});

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 220 },
  { id: "team",  title: "Team",  width: 110 },
  { id: "score", title: "Score", width: 90 },
];

const toCell = (p: Person, col: number): GridCell => {
  if (col === 0) return { kind: GridCellKind.Text, data: p.name, displayData: p.name, allowOverlay: false };
  if (col === 1) return { kind: GridCellKind.Text, data: p.team, displayData: p.team, allowOverlay: false };
  return { kind: GridCellKind.Number, data: p.score, displayData: String(p.score), allowOverlay: false };
};

export default class FilterGrid extends Component {
  @tracked team: Team | "All" = "All";
  @tracked query = "";
  @tracked minScore = 40;

  setTeam = (team: Team | "All"): void => { this.team = team; };
  onQuery = (event: Event): void => { this.query = (event.target as HTMLInputElement).value; };
  onScore = (event: Event): void => { this.minScore = Number((event.target as HTMLInputElement).value); };
  isTeam = (team: Team | "All"): boolean => team === this.team;

  // Membership changed → a new array is correct. recordsSource keys caches on array identity,
  // so this rebuilds row caches for the new set. Record identities in ALL never change, so
  // a person who stays in the filtered set keeps their cache.
  @cached
  get filtered(): readonly Person[] {
    const q = this.query.trim().toLowerCase();
    return ALL.filter(p => {
      if (this.team !== "All" && p.team !== this.team) return false;
      if (p.score < this.minScore) return false;
      if (q !== "" && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  @cached
  get gridArgs() {
    return recordsSource({ records: this.filtered, columns: COLUMNS, toCell });
  }

  <template>
    <div>
      <button type="button" {{on "click" (fn this.setTeam "All")}}>All</button>
      <button type="button" {{on "click" (fn this.setTeam "Eng")}}>Eng</button>
      <button type="button" {{on "click" (fn this.setTeam "Design")}}>Design</button>
      <button type="button" {{on "click" (fn this.setTeam "PM")}}>PM</button>
      <input type="search" value={{this.query}} {{on "input" this.onQuery}} placeholder="Filter by name" />
      <label>
        Score ≥ {{this.minScore}}
        <input type="range" min="40" max="100" value={{this.minScore}} {{on "input" this.onScore}} />
      </label>
      <span>{{this.filtered.length}} of {{ALL.length}}</span>
    </div>
    <div style="height: 320px">
      <GlideDataGrid
        @columns={{this.gridArgs.columns}}
        @rows={{this.gridArgs.rows}}
        @getCellContent={{this.gridArgs.getCellContent}}
      />
    </div>
  </template>
}`;
