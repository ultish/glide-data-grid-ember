import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import AsyncDemo from "test-app/components/async-demo";

const RECIPE = `import Component from "@glimmer/component";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { AsyncRecordsSource } from "glide-data-grid-ember/data-source/index";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 280 },
  { id: "team",  title: "Team",  width: 130 },
  { id: "score", title: "Score", width: 100 },
];

type Person = { name: string; email: string; team: string; score: number };

const TEAMS = ["Eng", "Design", "PM"] as const;

function makePerson(row: number): Person {
  return {
    name: \`Person \${row}\`,
    email: \`p\${row}@example.com\`,
    team: TEAMS[row % TEAMS.length]!,
    score: 40 + (row % 61),
  };
}

// Swap this for your real fetch. A delay is load-bearing: without it every page lands
// before the first frame and you never see a Loading cell.
function getRowData([start, end]: readonly [number, number]): Promise<readonly Person[]> {
  const rows = Array.from({ length: end - start }, (_, i) => makePerson(start + i));
  return new Promise(resolve => setTimeout(() => resolve(rows), 400));
}

// toCell runs on the paint path for a lazy source — keep it a field read.
function toCell(record: Person, col: number): GridCell {
  switch (col) {
    case 0: return { kind: GridCellKind.Text, data: record.name, displayData: record.name, allowOverlay: true };
    case 1: return { kind: GridCellKind.Text, data: record.email, displayData: record.email, allowOverlay: false };
    case 2: return { kind: GridCellKind.Text, data: record.team, displayData: record.team, allowOverlay: false };
    default: return { kind: GridCellKind.Number, data: record.score, displayData: String(record.score), allowOverlay: false };
  }
}

export default class PagedGrid extends Component {
  // Constructed once, as a class field. Owns the row buffer and page state.
  // Bound instance fields are identity-stable for free — no @cached to remember.
  readonly source = new AsyncRecordsSource<Person>({
    columns: COLUMNS,
    rows: 100_000,
    pageSize: 100,
    maxConcurrency: 4,
    getRowData,
    toCell,
  });

  <template>
    <div style="height: 480px">
      <GlideDataGrid
        @columns={{this.source.columns}}
        @rows={{this.source.rows}}
        @getCellContent={{this.source.getCellContent}}
        @onVisibleRegionChanged={{this.source.onVisibleRegionChanged}}
        @onCellsEdited={{this.source.onCellsEdited}}
        @onReady={{this.source.attach}}
      />
    </div>
  </template>
}`;

export default class AsyncChapter extends Component {
    recipe = RECIPE;

    <template>
        <p>
            100,000 rows that do not exist in memory. Rows arrive a page at a time as you scroll;
            everything not yet loaded draws as a
            <code>Loading</code>
            cell, and each page that lands repaints exactly its own rows via damage, not a full
            redraw.
        </p>

        <p>
            This is the opposite of
            <code>recordsSource</code>. Use
            <code>recordsSource</code>
            for data you hold.
            <code>AsyncRecordsSource</code>
            for data you don't. The deciding fact is whether the rows exist in memory, not how many
            there are.
        </p>

        <CookbookSection
            @title="Paged fetch as the viewport moves"
            @blurb="Scroll. Loading cells fill in as pages land. @onVisibleRegionChanged tells the source what to fetch; @onReady hands it updateCells so arrivals repaint."
            @code={{this.recipe}}
        >
            <div style="height: 560px;">
                <AsyncDemo />
            </div>
        </CookbookSection>

        <p class="gdg-cookbook__note">
            Without
            <code>@onReady</code>
            the pages still load, but nothing would show them until some unrelated event happened to
            repaint. Both args are load-bearing.
        </p>
    </template>
}
