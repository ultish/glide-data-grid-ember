import Component from "@glimmer/component";
import { LinkTo } from "@ember/routing";
import CookbookSection from "test-app/components/cookbook-section";
import TrackedPeople, { TRACKED_PEOPLE_RECIPE } from "test-app/components/cookbook/examples/tracked-people";

export default class ReactivityChapter extends Component {
    recipe = TRACKED_PEOPLE_RECIPE;

    wrong = `// Renders perfectly. Mutating person.name does nothing.
@tracked people = [/* tracked Person instances */];

getCellContent = ([col, row]: Item): GridCell => cellFor(this.people[row]!, col);
//                                                     ^^^^^^^^^^^^^^^^^^
//                          read at paint time, after the tracking frame closed`;

    right = `@cached
get gridArgs() {
  return recordsSource({
    records: this.people,   // every person.name is read HERE, inside the frame
    columns: COLUMNS,
    toCell,
    onCellEdited: this.onEdit,
  });
}

<GlideDataGrid
  @columns={{this.gridArgs.columns}}
  @rows={{this.gridArgs.rows}}
  @getCellContent={{this.gridArgs.getCellContent}}
  @onCellsEdited={{this.gridArgs.onCellsEdited}}
/>`;

    <template>
        <p>
            Ember only tracks reads that happen while a computation is running. The grid's modifier reads the
            <code>getCellContent</code>
            <em>function</em>. It never calls it. The engine calls it later, at paint time, from the draw loop — outside
            that frame. So this is the default thing to write, and it never repaints:
        </p>

        <pre class="gdg-cookbook__code"><code>{{this.wrong}}</code></pre>

        <p>
            The fix is to read your data
            <em>while the getter runs</em>, and let
            <code>getCellContent</code>
            only index the result.
            <code>recordsSource</code>
            inside a
            <code>@cached</code>
            getter is that pattern:
        </p>

        <pre class="gdg-cookbook__code"><code>{{this.right}}</code></pre>

        <p>
            Mutating
            <code>person.name</code>
            dirties the getter → the modifier re-runs →
            <code>getCellContent</code>
            comes back as a new function → the canvas repaints. Break any link and you get silence.
        </p>

        <CookbookSection
            @title="Edit a cell. The canvas follows. Nothing imperative."
            @blurb="Overlay editors on, Add row in the toolbar. The full file is under the fold."
            @code={{this.recipe}}
            @codeOpen={{false}}
        >
            <TrackedPeople />
        </CookbookSection>

        <h2>Why @cached, not a plain getter</h2>
        <p>
            A plain getter re-runs on every read and allocates a new
            <code>getCellContent</code>
            every time. The grid sees a changed arg on every access and fully repaints every frame — no error, looks
            fine, several times the work.
            <code>@cached</code>
            recomputes only when something it actually read changed.
        </p>

        <h2>Don't write tracked state from toCell</h2>
        <p>
            <code>toCell</code>
            runs
            <em>inside</em>
            that getter, during the tracking frame. It must be a pure read of the record. Writing
            <code>@tracked</code>
            state in there (a counter, a "last painted" stamp) is Ember's backtracking-rerender assertion — the getter
            invalidates while it is still running.
        </p>
        <p>
            Event handlers are the opposite.
            <code>onCellEdited</code>, a checkbox click, Add row all run later. Mutating there is the correct finite
            cycle: write → one re-render → stop. That is
            <LinkTo @route="cookbook.chapter" @model="interactions">Select, edit, add, delete</LinkTo>.
        </p>
        <p>
            Same trap, different costume: don't call
            <code>recordsSource</code>
            from a getter that also writes. Reconciling an Apollo result belongs in
            <code>onComplete</code>, not in
            <code>gridArgs</code>.
        </p>
    </template>
}
