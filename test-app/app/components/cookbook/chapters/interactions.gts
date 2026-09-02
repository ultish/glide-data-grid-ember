import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import InteractionsGrid, { INTERACTIONS_RECIPE } from "test-app/components/cookbook/examples/interactions-grid";

export default class InteractionsChapter extends Component {
    recipe = INTERACTIONS_RECIPE;

    <template>
        <p>
            The grid never mutates your data. Clicks, Delete, the trailing "add row" row — every one of them is a
            <strong>notification</strong>. You write to a
            <code>@tracked</code>
            field or replace the array; the canvas follows because
            <code>recordsSource</code>
            ran inside a
            <code>@cached</code>
            getter.
        </p>

        <CookbookSection
            @title="Select, toggle, add, delete"
            @blurb="Click a checkbox. Click a row marker (shift-click for a range). Click a column header. Add a row from the trailing blank or the button. Delete selected rows with the button or Delete."
            @code={{this.recipe}}
        >
            <InteractionsGrid />
        </CookbookSection>

        <h2>Select rows, cells, columns</h2>
        <p>
            <code>@onSelectionChanged</code>
            is the handler. It reports
            <strong>your</strong>
            coordinate space — no row-marker column. The object is:
        </p>
        <ul>
            <li>
                <code>selection.current?.cell</code>
                — the focused cell,
                <code>[col, row]</code>
            </li>
            <li>
                <code>selection.rows</code>
                — a
                <code>CompactSelection</code>
                of whole rows (from the marker column).
                <code>.toArray()</code>,
                <code>.hasIndex(i)</code>,
                <code>.length</code>
            </li>
            <li>
                <code>selection.columns</code>
                — the same shape, for column headers
            </li>
        </ul>
        <p>
            <code>@rowMarkers="both"</code>
            is the checkbox + number column. It is a native grid feature: tri-state select-all, shift-to-extend,
            drag-to-extend. Pair it with
            <code>@rowSelect="multi"</code>
            and
            <code>@columnSelect="multi"</code>.
        </p>
        <p>
            By default the grid
            <em>owns</em>
            the selection and the callback is a notification. Pass
            <code>@selection</code>
            as well and it flips: every gesture reports a
            <em>request</em>, and nothing moves until you write a new value back. That is how you refuse a selection,
            snap it to whole rows, or keep it in step with a sidebar.
        </p>

        <h2>Click a checkbox (or edit a cell)</h2>
        <p>
            A boolean cell has no overlay. Clicking it toggles and arrives as
            <code>onCellsEdited</code>
            — with
            <code>recordsSource</code>, that is your
            <code>onCellEdited(person, col, value)</code>. The grid only ever hands you a column index; look up
            <code>COLUMNS[col].id</code>
            so a freeze or reorder does not retarget the write. Assign the tracked field:
        </p>
        <pre class="gdg-cookbook__code"><code>{{this.booleanEdit}}</code></pre>
        <p>
            Same path as typing in a text cell. The grid does not know about Ember. A click that is
            <em>not</em>
            an edit —
            <code>@onCellClicked</code>
            — is for things like opening a URI. Don't put mutations there if the cell already reports them through
            <code>onCellsEdited</code>.
        </p>

        <h2>Add a row</h2>
        <p>
            Replace the array.
            <code>push</code>
            keeps the identity and the grid never sees the row — that is the single most common "my new row doesn't show
            up".
        </p>
        <pre class="gdg-cookbook__code"><code>{{this.addRow}}</code></pre>
        <p>
            <code>@showTrailingBlankRow</code>
            draws a synthetic last row (the grid never asks
            <code>getCellContent</code>
            for it). Clicking it fires
            <code>@onRowAppended</code>.
            <code>@trailingRowOptions</code>
            is cosmetic —
            <code>hint</code>,
            <code>tint</code>
            — and must be a stable object, not an inline hash.
        </p>

        <h2>Delete a row</h2>
        <p>
            Two different operations, do not mix them up:
        </p>
        <ul>
            <li>
                <strong>Remove records</strong>
                — filter your array, assign a new one. Drive it from selected
                <code>selection.rows</code>
                (a button, or Delete when whole rows are selected).
            </li>
            <li>
                <strong>Clear cell contents</strong>
                — the default for Delete/Backspace.
                <code>@onDelete</code>
                can veto (
                <code>false</code>) or redirect. Return
                <code>true</code>
                for the default clear.
            </li>
        </ul>
        <p>
            The live example uses Delete to
            <em>remove rows</em>
            when the marker column has a selection, and otherwise lets the grid clear cells.
        </p>
    </template>

    booleanEdit = `onEdit = (person: Person, col: number, value: GridCell): void => {
  const field = COLUMNS[col]?.id;
  if (field === "active" && value.kind === GridCellKind.Boolean) {
    person.active = value.data === true;
    return;
  }
  if (value.kind !== GridCellKind.Text) return;
  if (field === "name") person.name = value.data;
  else if (field === "role") person.role = value.data;
};`;

    addRow = `addRow = (): void => {
  this.people = [...this.people, new Person("", "", true)];
};`;
}
