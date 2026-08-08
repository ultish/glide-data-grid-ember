// Guide chapter 5. Where the records actually come from: Ember Data, then GraphQL.
//
// The Ember Data live-array trap in here is not theoretical — it was a real addon-level defect fixed
// on 2026-08-09 (blank rows for records appended to a live array), and it is exactly the kind of
// cross-cutting rule that no single cookbook recipe would ever have covered. That is the argument
// for this guide existing, so it is stated here rather than filed under a recipe.
import type { Section } from "../cookbook/types.ts";

export const storesSection: Section = {
    id: "stores",
    title: "Ember Data, and GraphQL",
    blocks: [
        {
            kind: "p",
            text: "Chapter 4's `Person` was a hand-written tracked class, which is the simplest thing that satisfies the rules. Real apps get their records from a store. Both of the common ones work with `recordsSource` unchanged — but each has exactly one sharp edge, and neither produces an error when you hit it.",
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
                "**A normalized cache that mutates entities in place (Apollo and friends) changes nothing you can observe from Ember.** The entity's identity is the same and its fields are not tracked, so no repaint happens — chapter 3's table, row six. The reconcile above is the bridge: your tracked `PersonRow` is what Ember watches, and the cache entity is just the payload it copies from.",
                "**Don't reach for `updateCells` to paper over this.** It is the right tool for a genuinely lazy buffer (chapter 8), not a workaround for an untracked read.",
            ],
        },
        {
            kind: "p",
            text: "Notice what both stores have in common: the record is whatever object holds tracked state, and `recordsSource` never learns which kind it got. The next chapter is about the other half of that boundary — turning a record of *any* shape into the flat values a row needs.",
        },
    ],
};
