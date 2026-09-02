import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import StreamingDemo from "test-app/components/streaming-demo";

const RECIPE = `import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { registerDestructor } from "@ember/destroyable";
import type Owner from "@ember/owner";
import GlideDataGrid, { type GlideDataGridApi } from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
  { id: "name", title: "Name", width: 180 },
  { id: "value", title: "Value", width: 100 },
];

const ROWS = 10_000;

// Plain, non-tracked buffer. Tracking thousands of writes a second is the wrong tool.
const buffer: { name: string; value: number }[] = Array.from({ length: ROWS }, (_, i) => ({
  name: \`Row \${i}\`,
  value: 0,
}));

export default class StreamingGrid extends Component {
  columns = COLUMNS;
  rows = ROWS;
  @tracked private api: GlideDataGridApi | undefined;

  constructor(owner: Owner, args: object) {
    super(owner, args);
    let raf = 0;
    const tick = (): void => {
      const damage: { cell: Item }[] = [];
      for (let i = 0; i < 40; i++) {
        const row = Math.floor(Math.random() * ROWS);
        buffer[row]!.value += 1;
        damage.push({ cell: [1, row] });
      }
      this.api?.updateCells(damage);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    registerDestructor(this, () => cancelAnimationFrame(raf));
  }

  getCellContent = ([col, row]: Item): GridCell => {
    const rec = buffer[row]!;
    if (col === 0) return { kind: GridCellKind.Text, data: rec.name, displayData: rec.name, allowOverlay: false };
    return { kind: GridCellKind.Number, data: rec.value, displayData: String(rec.value), allowOverlay: false };
  };

  onReady = (api: GlideDataGridApi): void => {
    this.api = api;
  };

  <template>
    <div style="height: 480px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{this.rows}}
        @getCellContent={{this.getCellContent}}
        @onReady={{this.onReady}}
      />
    </div>
  </template>
}`;

export default class StreamingChapter extends Component {
    recipe = RECIPE;

    <template>
        <p>
            A genuine firehose: thousands of cells a second, a non-tracked buffer, and
            <code>updateCells()</code>
            naming exactly the cells that changed. The grid does a damage-based partial repaint instead of a full
            redraw. Autotracking is the wrong tool here.
        </p>

        <p>
            What is running includes measurements (cells/sec, frame time). What you copy is the pattern: mutate a plain
            buffer, tell the grid which cells changed.
        </p>

        <CookbookSection
            @title="Imperative damage, no tracking"
            @blurb="The cells/sec figure counts cells actually handed to updateCells. Coordinates are in your space — row markers are subtracted at the public boundary."
            @code={{this.recipe}}
        >
            <div style="height: 560px;">
                <StreamingDemo />
            </div>
        </CookbookSection>

        <p class="gdg-cookbook__note">
            This is not a fallback for a tracked grid that is not repainting. If a
            <code>@tracked</code>
            mutation does nothing, that is the reactivity chapter, not this one.
        </p>
    </template>
}
