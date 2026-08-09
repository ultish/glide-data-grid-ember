// Guide chapter 5. Where the records actually come from: Ember Data, then GraphQL, then Apollo via
// `glimmer-apollo`.
//
// The Apollo section (added 2026-08-09, at the user's request — `glimmer-apollo` is what they drive
// their GraphQL with) is NOT an API tour: its subject is that **Ember Data and Apollo move in exactly
// opposite directions**, so the memoization habit you learn from one is wrong for the other. Ember
// Data mutates in place and identity is useless as a signal; Apollo's `InMemoryCache` result-caches
// and hands back new objects, so identity is exact. The side-by-side table is the deliverable, and
// chapter 4's "don't key a `WeakMap` on the record" bullet points at it rather than repeating it.
//
// Consequence stated honestly and NOT as a defect: `recordsSource` keys its per-row caches on the
// `records` *array* identity, and Apollo produces a new array on every tick, so a one-field
// subscription update re-projects every row. No benchmark figure appears here because none has been
// taken — do not invent one. `glimmer-apollo` is deliberately not a dependency of this workspace;
// the examples are illustrative, exactly like `object-scan` in chapter 6.
//
// The Ember Data live-array trap in here is not theoretical — it was a real addon-level defect fixed
// on 2026-08-09 (blank rows for records appended to a live array), and it is exactly the kind of
// cross-cutting rule that no single cookbook recipe would ever have covered. That is the argument
// for this guide existing, so it is stated here rather than filed under a recipe.
import type { Section } from "../cookbook/types.ts";

export const storesSection: Section = {
    id: "stores",
    title: "Ember Data, GraphQL, and Apollo",
    blocks: [
        {
            kind: "p",
            text: "Chapter 4's `Person` was a hand-written tracked class, which is the simplest thing that satisfies the rules. Real apps get their records from a store. The common ones — Ember Data, a raw GraphQL client, Apollo through `glimmer-apollo` — all work with `recordsSource` unchanged, but each has its own sharp edge, and none of them produces an error when you hit it.",
        },

        // -- Ember Data ------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Ember Data.** An `@attr` field is tracked, so an Ember Data model *is* a record in chapter 4's sense: mutate it in place and the row repaints, with no extra machinery and no adapter.",
        },
        {
            kind: "code",
            text: `// app/models/person.ts
import Model, { attr } from "@ember-data/model";

export default class Person extends Model {
  @attr("string") declare name: string;
  @attr("string") declare email: string;
  @attr("string") declare role: string;
}

// app/routes/people.ts — load it the ordinary way; the grid has no opinion about fetching.
export default class PeopleRoute extends Route {
  @service declare store: Store;
  model() { return this.store.findAll("person"); }
}`,
        },
        {
            kind: "code",
            text: `// app/components/people-table.gts
export default class PeopleTable extends Component {
  @service declare store;

  // \`peekAll\` returns a LIVE array whose identity never changes. Spread it: the spread reads the
  // live array's tracked length, so this getter re-runs when a record is added or removed — and it
  // hands \`recordsSource\` a fresh array identity, which is rule 3.
  @cached get people() { return [...this.store.peekAll("person")]; }

  onEdit = (person, col, value) => {
    if (col === 0) person.name = value.data;
    else if (col === 1) person.email = value.data;
    else person.role = value.data;
    // Persisting is yours. The grid never saves, and never mutates your data.
  };

  @cached get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell, onCellEdited: this.onEdit });
  }
}`,
        },
        {
            kind: "note",
            text: "**⚠️ Do not hand a live array straight to `recordsSource`.** `store.peekAll(...)` — and a `findAll` result you hold onto — keeps **one array identity for the life of the store**. `recordsSource` keys its per-row caches on that identity, so when a record is added the caches are reused at the *old* length while `rows` comes from the *new* one: the added row asks for a projection that does not exist and paints as blank cells. The `[...spread]` above is the fix, and it is one character of ceremony. This is a real defect that shipped, not a hypothetical.",
        },
        {
            kind: "p",
            text: "Everything else follows from chapter 4's four rules. `person.save()`, `store.unloadRecord()` and friends are yours to call; deleting a record changes the live array's length, which re-runs the `@cached` getter, which produces a new array, which re-projects. Sorting or filtering server-side likewise produces a new array — correct, and correctly costing a full re-projection.",
        },

        // -- GraphQL ---------------------------------------------------------------------------------
        {
            kind: "p",
            text: "**GraphQL.** The important difference is that a GraphQL client hands you **plain objects**, and plain objects are not tracked. So there is exactly one reactivity edge available by default: assigning the new result array to a `@tracked` field.",
        },
        {
            kind: "code",
            text: `const PEOPLE_QUERY = gql\`
  query People {
    people { id name email role profile { address { city country } pets { name species } } }
  }
\`;

export default class PeopleTable extends Component {
  @tracked people = [];
  @tracked loading = false;

  // Class-field arrow: identity-stable, and usable directly as {{on "click" this.load}}.
  load = async () => {
    this.loading = true;
    try {
      const { data } = await client.query({ query: PEOPLE_QUERY });
      this.people = data.people;   // NEW array identity -> every row re-projects. Correct here.
    } finally {
      this.loading = false;
    }
  };

  @cached get gridArgs() {
    return recordsSource({ records: this.people, columns: COLUMNS, toCell: gqlPersonToCell });
  }
}`,
        },
        {
            kind: "p",
            text: "For a refetch that genuinely replaced the data, re-projecting every row is the right cost and there is nothing to tune. It stops being right when a poll or a subscription refetches the *same* rows every few seconds: each response is a new array, so every row re-projects even though almost nothing changed. That is the case for reconciling into tracked models keyed by id.",
        },
        {
            kind: "code",
            text: `class PersonRow {
  @tracked name; @tracked email; @tracked role;
  @tracked profile;                 // the nested blob, replaced wholesale — one tracked write
  constructor(raw) { this.id = raw.id; this.apply(raw); }

  // Guard every assignment. \`@tracked\` dirties its tag on EVERY set, equal value or not, so an
  // unguarded \`this.name = raw.name\` would re-project every row on every poll.
  apply = raw => {
    if (this.name !== raw.name) this.name = raw.name;
    if (this.email !== raw.email) this.email = raw.email;
    if (this.role !== raw.role) this.role = raw.role;
    if (!sameProfile(this.profile, raw.profile)) this.profile = raw.profile;
  };
}

#byId = new Map();

reconcile = rows => {
  let membershipChanged = rows.length !== this.people.length;
  const next = rows.map((raw, i) => {
    let vm = this.#byId.get(raw.id);
    if (vm === undefined) { vm = new PersonRow(raw); this.#byId.set(raw.id, vm); membershipChanged = true; }
    else vm.apply(raw);                                  // tracked writes -> only real changes dirty
    if (this.people[i] !== vm) membershipChanged = true;  // reordered
    return vm;
  });
  // Keep the SAME array when membership and order are unchanged: a new array identity would rebuild
  // every per-row cache and throw away the incrementality the guards above just bought.
  if (membershipChanged) this.people = next;
};`,
        },
        {
            kind: "list",
            items: [
                "**Most clients reallocate nested objects on every response**, even when the values are identical — so an identity check on `profile` never matches. Compare the fields you actually display (`sameProfile` above), or key off a server-supplied version / `updatedAt`.",
                "**A client that hands you back the *same* object with new contents changes nothing you can observe from Ember.** The identity is unchanged and the fields are not tracked, so no repaint happens — chapter 3's table, row six. The reconcile above is the bridge: your tracked `PersonRow` is what Ember watches, and the raw entity is just the payload it copies from. (Apollo is **not** such a client, despite the common assumption — see the next section.)",
                "**Don't reach for `updateCells` to paper over this.** It is the right tool for a genuinely lazy buffer (chapter 8), not a workaround for an untracked read.",
            ],
        },
        // -- glimmer-apollo ---------------------------------------------------------------------------
        {
            kind: "p",
            text: "**Apollo, via `glimmer-apollo`.** If your GraphQL goes through Apollo Client, you do not need the raw-client plumbing above at all: `glimmer-apollo` already bridges Apollo to autotracking. `useQuery`, `useMutation` and `useSubscription` are used as **class fields**, and the object each returns exposes `loading`, `data` and `error` as `@tracked` properties. So the \"plain objects are not tracked\" problem is solved one level up: the tracked thing is the **result**, and each new result is a new array — which is exactly the signal `recordsSource` keys on.",
        },
        {
            kind: "code",
            text: `// app/instance-initializers/apollo.ts — one client for the app, registered as the default.
// Apollo Client 4: import from "@apollo/client". The v3 "@apollo/client/core" entry point was
// REMOVED in v4 (the whole top level is React-free now, so the split stopped earning its keep).
import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { setClient } from "glimmer-apollo";

export function initialize(appInstance) {
  setClient(appInstance, new ApolloClient({
    link: new HttpLink({ uri: "/graphql" }),
    cache: new InMemoryCache(),
  }));
}

export default { initialize };`,
        },
        {
            kind: "code",
            text: `// app/components/people-table.gts
import { useQuery } from "glimmer-apollo";

// Module scope: one identity for the life of the page, so an empty result never looks like a change.
// Chapter 9's rule, applied to the one place it is easy to miss.
const NONE = [];

export default class PeopleTable extends Component {
  @tracked activeOnly = true;

  // A class field, not a getter. The thunk returns [document, options]; every \`@tracked\` field it
  // READS becomes a dependency, so flipping \`this.activeOnly\` re-executes the query by itself.
  peopleQuery = useQuery(this, () => [
    gql\`
      query People($activeOnly: Boolean) {
        people(activeOnly: $activeOnly) { id name email role }
      }
    \`,
    { variables: { activeOnly: this.activeOnly } },
  ]);

  @cached get gridArgs() {
    // \`.data\` is tracked, so THIS read is what registers the dependency — inside the frame, per
    // chapter 3. \`recordsSource\` then eagerly projects whatever array it got.
    return recordsSource({
      records: this.peopleQuery.data?.people ?? NONE,
      columns: COLUMNS,
      toCell: personToCell,
      onCellEdited: this.onEdit,
    });
  }

  <template>
    {{#if this.peopleQuery.loading}}<Spinner />
    {{else if this.peopleQuery.error}}<ErrorBox @error={{this.peopleQuery.error}} />
    {{else}}
      <GlideDataGrid @columns={{this.gridArgs.columns}} @rows={{this.gridArgs.rows}}
        @getCellContent={{this.gridArgs.getCellContent}}
        @onCellsEdited={{this.gridArgs.onCellsEdited}} />
    {{/if}}
  </template>
}`,
        },
        {
            kind: "p",
            text: "**A subscription needs no imperative call whatsoever.** Add one as another class field; when its payload carries `__typename` and `id`, Apollo normalizes it onto the same cache entity your query read, the query's result is recomputed, `glimmer-apollo` writes the new result to its tracked `data`, and the chain from chapter 3 runs end to end on its own — `gridArgs` invalidates, `getCellContent` comes back with a fresh identity, the grid repaints. You never call `updateCells`, and there is nothing to keep in sync.",
        },
        {
            kind: "code",
            text: `import { useSubscription } from "glimmer-apollo";

// Its own \`data\` is not read anywhere below — the point is the CACHE WRITE it causes, which is what
// re-emits the query above. Reading \`.data\` is only useful if you want the raw event as well.
personUpdates = useSubscription(this, () => [
  gql\`subscription { personUpdated { id name email role } }\`,
]);`,
        },
        {
            kind: "p",
            text: "**Now the part that is genuinely non-obvious, and the reason this section exists.** Apollo's `InMemoryCache` does *result caching* with field-level dependency tracking: it returns **referentially identical** result objects while the underlying data is unchanged, and produces **new** objects when it changes. So one subscription updating one field on one entity gives you a new object for *that* entity, the identical object for every unchanged sibling — and a **new containing array**, because the array holds a changed child. Ember Data behaves the exact opposite way. Read this table in both columns before you carry a habit from one to the other:",
        },
        {
            kind: "table",
            head: ["Behaviour", "Ember Data", "Apollo (InMemoryCache)"],
            rows: [
                ["A field changes. What happens to the object?", "it mutates **in place**", "a **new** object is produced"],
                ["Does the record's identity change?", "never — stable for the life of the record", "yes, for the changed entity"],
                ["Does the containing array's identity change?", "no — a live array keeps one identity forever", "yes — it holds a changed child"],
                ["Is identity a usable change signal?", "**no.** It never moves; the tracked tag is the signal", "**yes.** `!==` means genuinely different data"],
                [
                    "Memoize rows in a `WeakMap` keyed on the record?",
                    "**unsafe** — same key, new contents, stale rows forever",
                    "**safe** — a changed entity is a new key",
                ],
            ],
        },
        {
            kind: "note",
            text: "**That last row is why chapter 4's warning does not transfer.** \"Don't memoize rows in a `WeakMap` keyed on the record object\" is a rule about *mutable* stores — the key stays put while the contents move underneath it. Apollo's results are immutable, so the same technique is sound there for precisely the reason it is broken for Ember Data. The rule is not \"identity-keyed caching is bad\"; it is **\"match your memoization to which way your data layer moves.\"**",
        },
        {
            kind: "p",
            text: "**The honest performance consequence.** `recordsSource` keys its per-row caches on the `records` **array** identity. Apollo hands you a new array on every tick that touched any row in it — so a one-field subscription update rebuilds every per-row cache and **re-projects every row**, not one. That is a real trade-off rather than a defect, and it is worth being exact about what it does and does not cost.",
        },
        {
            kind: "list",
            items: [
                "**It is not the paint path.** `getCellContent` is still an O(1) array lookup, and the blit rules of chapter 9 are unaffected. What repeats is `toCell` — a plain function you wrote — once per row per tick.",
                "**At moderate row counts, stop here.** A full re-projection of a few hundred rows is cheap next to the network round trip that caused it, and the code you get is the simple version above with nothing to maintain.",
                "**At large row counts with a high-frequency subscription, reconcile.** Feed the Apollo result into tracked models keyed by `id` — the `PersonRow` / `reconcile` pattern shown earlier in this chapter for polling is the same pattern, and Apollo makes it *cheaper*. Keep the raw entity on the view-model and an early `if (raw === vm.raw) return vm;` skips an unchanged row exactly, with no field comparison at all — the `sameProfile`-style field guards above exist because *most* clients reallocate identical nested objects, and Apollo's result caching is precisely the case where they don't.",
                "**Where the crossover sits depends on your rows × columns × tick rate**, and on how much work your `toCell` does. No figure is given here because none has been measured; profile your own grid before adding the reconcile layer.",
            ],
        },
        {
            kind: "p",
            text: "**Mutations round-trip through the same loop**, and the ownership contract of chapter 7 is what makes it work: the grid never mutates your data, so an edit is only a notification and Apollo remains the single source of truth. The path is `onCellsEdited` → `mutate` → cache write → new result → repaint — one direction, no local copy to reconcile.",
        },
        {
            kind: "code",
            text: `import { useMutation } from "glimmer-apollo";

updatePerson = useMutation(this, () => [
  gql\`
    mutation UpdatePerson($id: ID!, $patch: PersonPatch!) {
      updatePerson(id: $id, patch: $patch) { id name email role }
    }
  \`,
]);

// \`person\` is the Apollo result object for that row. Nothing is written to it — the mutation's
// response updates the cache, which produces the new result, which repaints the row.
onEdit = (person, col, value) => {
  const field = ["name", "email", "role"][col];
  this.updatePerson.mutate({ variables: { id: person.id, patch: { [field]: value.data } } });
};`,
        },
        {
            kind: "note",
            text: "**Optimistic updates are Apollo's job, not the grid's.** Without one, the cell shows its old value until the mutation resolves — a normal round trip, and the same behaviour you would get writing to a server-authoritative store by hand. If that gap matters, reach for Apollo's own `optimisticResponse`; the grid needs no knowledge of it either way, because it is only ever displaying whatever the last result said.",
        },
        {
            kind: "p",
            text: "One convenience worth knowing: Apollo cache results are **plain objects**, so a path scanner works on them directly — unlike an Ember Data record, whose `@attr`s are prototype accessors and are invisible to one. That distinction, and what to do about it, is the next chapter.",
        },

        {
            kind: "p",
            text: "Notice what all three stores have in common: the record is whatever object holds — or *is* — the state Ember can see, and `recordsSource` never learns which kind it got. The next chapter is about the other half of that boundary — turning a record of *any* shape into the flat values a row needs.",
        },
    ],
};
