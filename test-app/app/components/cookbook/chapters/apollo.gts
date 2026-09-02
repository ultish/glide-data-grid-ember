import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import ApolloDemo from "test-app/components/apollo-demo";

const RECIPE = `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { gql, useQuery, useMutation, useSubscription } from "glimmer-apollo";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const toCell = (person: { name: string; email: string; role: string }, col: number): GridCell => {
  const value = [person.name, person.email, person.role][col] ?? "";
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
};

// Module scope: one identity for the life of the page, so an empty result never looks like a change.
const NONE: readonly never[] = [];

export default class PeopleTable extends Component {
  @tracked activeOnly = true;

  // Class field, not a getter. The thunk returns [document, options]; every @tracked field it
  // READS becomes a dependency, so flipping this.activeOnly re-executes the query by itself.
  peopleQuery = useQuery(this, () => [
    gql\`
      query People($activeOnly: Boolean) {
        people(activeOnly: $activeOnly) { id name email role }
      }
    \`,
    { variables: { activeOnly: this.activeOnly } },
  ]);

  // Its data is not read below — the point is the CACHE WRITE it causes, which re-emits the query.
  personUpdates = useSubscription(this, () => [
    gql\`subscription { personUpdated { id name email role } }\`,
  ]);

  updatePerson = useMutation(this, () => [
    gql\`
      mutation UpdatePerson($id: ID!, $patch: PersonPatch!) {
        updatePerson(id: $id, patch: $patch) { id name email role }
      }
    \`,
  ]);

  onEdit = (person: { id: string }, col: number, value: GridCell): void => {
    if (value.kind !== GridCellKind.Text) return;
    const field = COLUMNS[col]?.id;
    if (field === undefined) return;
    void this.updatePerson.mutate({ variables: { id: person.id, patch: { [field]: value.data } } });
  };

  @cached
  get gridArgs() {
    // .data is tracked, so THIS read registers the dependency — inside the tracking frame.
    return recordsSource({
      records: this.peopleQuery.data?.people ?? NONE,
      columns: COLUMNS,
      toCell,
      onCellEdited: this.onEdit,
    });
  }

  <template>
    {{#if this.peopleQuery.loading}}
      Loading…
    {{else if this.peopleQuery.error}}
      {{this.peopleQuery.error.message}}
    {{else}}
      <div style="height: 480px">
        <GlideDataGrid
          @columns={{this.gridArgs.columns}}
          @rows={{this.gridArgs.rows}}
          @getCellContent={{this.gridArgs.getCellContent}}
          @onCellsEdited={{this.gridArgs.onCellsEdited}}
        />
      </div>
    {{/if}}
  </template>
}`;

const RECONCILE = `import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { recordsSource } from "glide-data-grid-ember/data-source/index";
import { gql, useQuery } from "glimmer-apollo";
import { GridCellKind, type GridCell, type GridColumn } from "glide-data-grid-ember/rendering/index";

type Person = { id: string; name: string; email: string; role: string };

const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

class PersonRow {
  readonly id: string;
  @tracked raw: Person;
  constructor(raw: Person) {
    this.id = raw.id;
    this.raw = raw;
  }
  // Apollo only allocates a new object when something in it changed. === is the whole test.
  apply = (raw: Person): void => {
    if (this.raw !== raw) this.raw = raw;
  };
}

const toCell = (row: PersonRow, col: number): GridCell => {
  const value = [row.raw.name, row.raw.email, row.raw.role][col] ?? "";
  return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
};

export default class PeopleTable extends Component {
  #byId = new Map<string, PersonRow>();
  @tracked rows: readonly PersonRow[] = [];

  // Fold the payload HERE, not in gridArgs. Reconcile reads and then writes tracked state;
  // a getter would trip Ember's backtracking-rerender assertion.
  reconcile = (incoming: readonly Person[]): void => {
    let membershipChanged = incoming.length !== this.rows.length;
    const next = incoming.map((raw, i) => {
      let vm = this.#byId.get(raw.id);
      if (vm === undefined) {
        vm = new PersonRow(raw);
        this.#byId.set(raw.id, vm);
        membershipChanged = true;
      } else {
        vm.apply(raw);
      }
      if (this.rows[i] !== vm) membershipChanged = true;
      return vm;
    });
    // Same array when membership and order are unchanged — that is the whole point.
    // A fresh array identity rebuilds every per-row cache and throws the incrementality away.
    this.rows = membershipChanged ? next : this.rows;
  };

  peopleQuery = useQuery(this, () => [
    gql\`
      query People {
        people { id name email role }
      }
    \`,
    { onComplete: (data: { people: Person[] }) => this.reconcile(data.people) },
  ]);

  @cached
  get gridArgs() {
    // recordsSource sees view models, never query.data.people.
    return recordsSource({ records: this.rows, columns: COLUMNS, toCell });
  }

  <template>
    <div style="height: 480px">
      <GlideDataGrid
        @columns={{this.gridArgs.columns}}
        @rows={{this.gridArgs.rows}}
        @getCellContent={{this.gridArgs.getCellContent}}
      />
    </div>
  </template>
}`;

export default class ApolloChapter extends Component {
    recipe = RECIPE;
    reconcile = RECONCILE;

    <template>
        <p>
            What is
            <strong>running</strong>
            is a local fake of Apollo
            <code>InMemoryCache</code>'s immutability —
            <code>@apollo/client</code>
            and
            <code>glimmer-apollo</code>
            are not dependencies of this workspace. What you
            <strong>copy</strong>
            is the glimmer-apollo file below. The fake exists so the identity lesson is observable without installing
            those packages.
        </p>

        <p>
            Ember Data mutates in place; Apollo hands you a new object and a new containing array.
            <code>recordsSource</code>
            keys per-row caches on the array identity, so a one-field subscription update re-projects every row if you
            feed it
            <code>query.data.people</code>
            directly. That is a trade-off, not a defect, and it is off the paint path.
        </p>

        <CookbookSection
            @title="Raw result array vs reconciled view models"
            @blurb="One subscription tick changes one field on one entity. The left grid re-projects every row. The right grid re-projects one. Both numbers are exact toCell counts."
            @code={{this.recipe}}
        >
            <ApolloDemo />
        </CookbookSection>

        <h2>When to reconcile</h2>
        <p>
            At a few hundred rows, stop at the file above — pass
            <code>query.data.people</code>
            straight into
            <code>recordsSource</code>. At large row counts with a high-frequency subscription, don't. Keep the query;
            on each result, fold the payload into tracked view models keyed by
            <code>id</code>, and hand
            <code>recordsSource</code>
            <em>those</em>, not the Apollo array. Keep the same array identity when membership and order do not change.
            That is the right-hand grid in the live example.
        </p>

        <pre class="gdg-cookbook__code"><code>{{this.reconcile}}</code></pre>

        <table class="gdg-cookbook__table">
            <thead>
                <tr>
                    <th>Behaviour</th>
                    <th>Ember Data</th>
                    <th>Apollo (InMemoryCache)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>A field changes. What happens to the object?</td>
                    <td>mutates in place</td>
                    <td>a new object is produced</td>
                </tr>
                <tr>
                    <td>Does the record's identity change?</td>
                    <td>never</td>
                    <td>yes, for the changed entity</td>
                </tr>
                <tr>
                    <td>Does the containing array's identity change?</td>
                    <td>no — a live array keeps one identity forever</td>
                    <td>yes — it holds a changed child</td>
                </tr>
                <tr>
                    <td>Is identity a usable change signal?</td>
                    <td>no. The tracked tag is the signal</td>
                    <td>yes.
                        <code>!==</code>
                        means genuinely different data</td>
                </tr>
                <tr>
                    <td>Memoize rows in a WeakMap keyed on the record?</td>
                    <td>unsafe — same key, new contents</td>
                    <td>safe — a changed entity is a new key</td>
                </tr>
            </tbody>
        </table>

        <p class="gdg-cookbook__note">
            <strong>Optimistic updates are Apollo's job, not the grid's.</strong>
            Without one, the cell shows its old value until the mutation resolves. Use Apollo's
            <code>optimisticResponse</code>
            if that gap matters. The grid needs no knowledge of it.
        </p>
    </template>
}
