import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import PeopleTable, { PEOPLE_TABLE_RECIPE } from "test-app/components/cookbook/examples/people-table";

export default class PullModelChapter extends Component {
    recipe = PEOPLE_TABLE_RECIPE;

    paintPath = `// ✗ On the paint path. Date parsing, currency formatting and a nested walk,
//   several hundred times per frame — for cells that mostly did not change.
getCellContent = ([col, row]: Item): GridCell => {
  const p = this.people[row]!;
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.salary));
    case 2: return text(p.profile.pets.map(x => x.name).sort().join(", "));
  }
};

// ✓ Off the paint path. \`cells\` was projected once, ahead of time; this is an array index.
getCellContent = ([col, row]: Item): GridCell => this.cells[row]?.[col] ?? BLANK;`;

    <template>
        <p>
            <code>&lt;GlideDataGrid&gt;</code>
            is a
            <strong>pull</strong>
            API. You hand it
            <code>@columns</code>,
            <code>@rows</code>
            (a count) and
            <code>@getCellContent</code>, and it asks for cells as it paints them — only the cells actually on screen,
            only when it is drawing them. It never receives your array, never iterates it, and never holds a copy. That
            is the whole reason 200,000 rows costs about what 20 does: the viewport is what is expensive, and the
            viewport is a constant.
        </p>

        <p>
            It also means the grid has no idea when your data changes. Nothing observes
            <code>PEOPLE</code>. The next chapter is entirely about closing that loop; this one is the other half of the
            contract.
        </p>

        <CookbookSection
            @title="Still the same grid"
            @blurb="Same file as chapter 1. getCellContent is an array index. That is the whole point."
            @code={{this.recipe}}
            @codeOpen={{false}}
        >
            <PeopleTable />
        </CookbookSection>

        <p>
            <strong><code>getCellContent</code> must be an O(1) lookup, never a computation.</strong>
            It runs
            <em>inside the draw loop</em>. A full repaint of an ordinary viewport is a few hundred calls; a fast scroll
            is a fresh strip of them every frame; a drag-selection re-reads on every mouse move. Anything you do in
            there, you do at frame rate.
        </p>

        <pre class="gdg-cookbook__code"><code>{{this.paintPath}}</code></pre>

        <p>
            <code>recordsSource</code>
            exists to produce that second version. The next two chapters show why you cannot just drop a
            <code>@tracked</code>
            read into
            <code>getCellContent</code>, and then package the fix.
        </p>

        <p>
            <strong>Coordinates.</strong>
            <code>getCellContent</code>
            receives
            <code>[column, row]</code>, both zero-based, both in
            <strong>your</strong>
            coordinate space. Row markers, frozen columns, the trailing blank row and the header are the grid's own
            business — it never shifts your indices to account for them, and every callback that hands you a column
            index has already stripped the row-marker column back out.
        </p>

        <p class="gdg-cookbook__note">
            <strong><code>@rows</code> past the end of your data is your bug, not the grid's.</strong>
            The grid will ask for those cells, and
            <code>getCellContent</code>
            must return
            <em>something</em>
            for them. Return a blank cell rather than throwing — a throw inside the draw loop takes the frame with it.
        </p>
    </template>
}
