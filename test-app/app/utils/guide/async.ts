// Guide chapter 8. The one case the recommended pattern does not cover, and the imperative escape
// hatch. Includes the `registerDestructor` teardown idiom, because a websocket subscription is the
// first place in this guide where a consumer opens something that has to be closed.
import type { Section } from "../cookbook/types.ts";

export const asyncSection: Section = {
    id: "async",
    title: "When the data isn't in memory",
    blocks: [
        {
            kind: "p",
            text: "Everything so far assumes a materialized array. The only case that needs something different is when you fundamentally do not have one — and note that this is a question about your **data**, not a row count. 200,000 records genuinely in memory use chapter 4; 500 rows arriving page-by-page from a server cannot.",
        },
        {
            kind: "list",
            items: [
                "an infinite or async feed where rows load as you scroll",
                "server-side pagination",
                "synthetic or computed rows, with no backing objects at all",
                "a high-frequency stream where you already know exactly which cells changed",
            ],
        },

        // -- AsyncRecordsSource ----------------------------------------------------------------------
        {
            kind: "p",
            text: "**Paged data: `AsyncRecordsSource`.** Unlike the pure decorators it is a class you construct once, because it owns a row buffer and page state. Its bound instance fields are identity-stable for free, so there is no `@cached` to remember.",
        },
        {
            kind: "code",
            text: `import { AsyncRecordsSource } from "glide-data-grid-ember/data-source/index";

export default class PagedTable extends Component {
  // Constructed ONCE, as a class field.
  source = new AsyncRecordsSource({
    columns: COLUMNS,
    rows: 100_000,          // total, including rows not yet loaded — the scrollbar needs it up front
    pageSize: 100,
    maxConcurrency: 4,
    toCell,                 // unloaded rows never reach it; they draw as \`Loading\` cells
    getRowData: async ([start, end]) => fetchPage(start, end),
    onCellEdited: (record, col, value) => { /* return a replacement record, or mutate in place */ },
  });
}`,
        },
        {
            kind: "code",
            text: `<GlideDataGrid
  @columns={{this.source.columns}}
  @rows={{this.source.rows}}
  @getCellContent={{this.source.getCellContent}}
  @onCellsEdited={{this.source.onCellsEdited}}
  @onVisibleRegionChanged={{this.source.onVisibleRegionChanged}}
  @onReady={{this.source.attach}}
/>`,
        },
        {
            kind: "p",
            text: "The last two args are both required and do different jobs. `@onVisibleRegionChanged` tells the source which rows are on screen, so it knows what to fetch. `@onReady` hands it the grid's imperative `updateCells` API, which is what repaints a page once it lands — **without it the pages still load and nothing shows them** until some unrelated event happens to repaint. `setRowCount()` updates the total when the server tells you the real one, and `invalidate()` drops the buffer so pages refetch. The **Async paging** tab is exactly this, live, at 100,000 rows.",
        },

        // -- updateCells -----------------------------------------------------------------------------
        {
            kind: "p",
            text: "**The imperative escape hatch is available on any grid**, paged or not. Hold the API object `@onReady` gives you:",
        },
        {
            kind: "code",
            text: `import { registerDestructor } from "@ember/destroyable";

export default class TickerTable extends Component {
  #api;
  #socket;

  // Not \`@tracked\`: nothing renders from it, and making it tracked would invalidate the very
  // computation that produced it.
  onGridReady = api => { this.#api = api; };

  constructor(owner, args) {
    super(owner, args);
    this.#socket = openFeed(tick => {
      this.buffer[tick.row][tick.col] = tick.value;    // a plain, untracked buffer
      this.#api?.updateCells([{ cell: [tick.col, tick.row] }]);
    });

    // Teardown belongs to the component, and \`registerDestructor\` is the Ember 6 idiom for it —
    // no \`willDestroy\` override, and it works on any destroyable, not just components.
    registerDestructor(this, () => this.#socket.close());
  }
}`,
        },
        {
            kind: "code",
            text: `<GlideDataGrid @onReady={{this.onGridReady}} ... />`,
        },
        {
            kind: "p",
            text: "`updateCells` does a damage-based partial repaint of exactly those cells and **bypasses autotracking entirely** — which is why the buffer above is deliberately not tracked. It is how the grid gets its high-frequency numbers; the **Streaming updates** tab measures it in the hundreds of thousands of cells per second.",
        },
        {
            kind: "note",
            text: "**`updateCells` is not a fallback for having written chapter 3 wrong.** If tracked data is not repainting, the fix is upstream — an eager read inside the frame — not a call that forces the pixels. Reaching for it there gives you a grid that repaints when you remember to ask and is stale when you forget.",
        },
        {
            kind: "p",
            text: "The two models coexist happily in one app: a tracked `recordsSource` grid for the table users edit, an `AsyncRecordsSource` for the 100k-row audit log, and `updateCells` for the live-price column. They are different answers to different questions about your data, not a maturity ladder.",
        },
    ],
};
