// Guide chapter 6. `toCell` as the flattening boundary, and `object-scan` as an OPTIONAL helper.
//
// Per explicit user instruction (2026-08-09): `object-scan` is presented as one of several equally
// fine choices for shaping models/classes into flat fields — never as the recommended path, and never
// as an addon dependency (it is a `test-app`-only devDependency, deliberately). The own-enumerable /
// prototype-accessor caveat is the one that bites in exactly this use case and must stay attached
// to it.
//
// NAMING (fixed 2026-08-09): every sample in this chapter, and in chapter 5, names the projection
// **`toCell`** — the same identifier `recordsSource` takes. The chapter previously said "`toCell` is
// where that flattening belongs" and then defined `gqlPersonToCell`, leaving the reader to infer they
// were the same thing. One name, and the `recordsSource({ ..., toCell })` call is shown so the
// connection is stated rather than implied.
//
// SHAPE-FIRST (rewritten 2026-08-09): the `object-scan` example used to open with needles against a
// `p.profile` whose shape was never printed, so there was nothing to match them against. It now shows
// the literal query result first, maps one row of it to columns, and only then introduces needles —
// each traced back to a key visible in that payload. The payload is the one
// `app/utils/apollo-fake.ts` actually serves to the **Apollo (faked)** tab, and the scanners are the
// ones in `app/utils/scale-records.ts`; both are lifted, not invented, so the chapter cannot drift
// from running code.
import type { Section } from "../cookbook/types.ts";

export const flatteningSection: Section = {
    id: "flattening",
    title: "Flattening a model into the fields a row needs",
    blocks: [
        {
            kind: "p",
            text: "The grid wants a flat list of values per row; your data is almost never flat. Ember Data records have relationships, GraphQL results are nested and carry arrays of related entities, and a domain class has whatever shape it has. **`toCell` is where that flattening belongs** — the same `toCell` you hand to `recordsSource` in chapter 4 — because it is the memoized side of the boundary: done there it runs once per record, done in `getCellContent` it runs once per painted cell.",
        },
        {
            kind: "p",
            text: "**Start from the shape you actually have.** Here is one `data` payload as a GraphQL client hands it to you — plain objects, nested, with an array of related entities. This is the literal shape the **Apollo (faked)** tab serves, and everything in this chapter is about turning one element of `data.people` into one row:",
        },
        {
            kind: "code",
            text: `const data = {
  people: [
    {
      __typename: "Person",
      id:      "person:1",
      name:    "Ada Lovelace #1",
      email:   "ada.lovelace1@example.com",
      role:    "Engineer",
      status:  "Online",
      profile: {
        __typename: "Profile",
        address: { __typename: "Address", city: "Lisbon", country: "PT" },
        pets: [
          { __typename: "Pet", id: "pet:1:1", name: "Momo", species: "cat" },
          { __typename: "Pet", id: "pet:1:2", name: "Rex",  species: "dog" },
        ],
      },
    },
    // ...199 more
  ],
};`,
        },
        {
            kind: "p",
            text: "One element of that array becomes one row. Six columns, three of which are not at the top level:",
        },
        {
            kind: "table",
            head: ["Column", "Where it lives in the payload", "Value for the row above"],
            rows: [
                ["Name", "`person.name`", "Ada Lovelace #1"],
                ["Email", "`person.email`", "ada.lovelace1@example.com"],
                ["Role", "`person.role`", "Engineer"],
                ["Status", "`person.status`", "Online"],
                ["City", "`person.profile.address.city`", "Lisbon"],
                ["Pets", "`name` of **every** element of `person.profile.pets`", "Momo, Rex"],
            ],
        },
        {
            kind: "p",
            text: "Start with no library at all. A plain accessor is frequently the whole answer, and it is what the demo actually ships:",
        },
        {
            kind: "code",
            text: `// \`p\` is one element of \`data.people\` above. No dependency, no compilation step, and it
// type-checks against your own row type. Prefer this until it stops scaling.
const toCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(p.email);
    case 2: return text(p.role);
    case 3: return text(p.status);
    case 4: return text(p.profile.address.city);
    default: {
      const names = p.profile.pets.map(pet => pet.name).sort().join(", ");
      return text(names === "" ? "—" : names);
    }
  }
};

// ...and this is the whole connection. The function above IS the \`toCell\` argument — there is no
// adapter and no registration step, which is why it can be any shape you like.
@cached get gridArgs() {
  return recordsSource({ records: this.query.data?.people ?? NONE, columns: COLUMNS, toCell });
}`,
        },
        {
            kind: "note",
            text: "**A traversal library is entirely optional here, and `object-scan` is one of several equally fine choices** — `lodash.get`, `jsonpath` or a hand-written walk are all as good. **The addon depends on none of them and never will**: `toCell` is a plain accessor function generic over your row type, so there is deliberately no path-string syntax to learn and nothing to escape. In this repo `object-scan` is a **test-app dependency only**. Reach for something like it when the shapes are deep or variable enough that hand-written walks stop paying.",
        },
        {
            kind: "p",
            text: "Here is the same six columns with one, for when a column's value could be at one of several depths, or you want a declarative needle instead of a chain of `?.` and `.map().filter()`. The rule that matters is **compile once per column, at module scope** — `objectScan(...)` parses its needles and builds a matcher, and doing that inside `toCell` rebuilds it once per painted cell:",
        },
        {
            kind: "code",
            text: `import objectScan from "object-scan";

// \`useArraySelector: false\` -> array indices are not part of the needle. \`rtn: "value"\` -> matched
// values, not their key paths.
const compile = needle => objectScan([needle], { useArraySelector: false, rtn: "value" });

// One scanner per column that needs one, hoisted. Two \`objectScan\` calls for the life of the page —
// not two per cell, which on a 200-row × 6-column sweep would be 2,400.
const scanCity     = compile("address.city");
const scanPetNames = compile("pets.name");

const toCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(p.email);
    case 2: return text(p.role);
    case 3: return text(p.status);
    // Note the scan target: \`p.profile\`, the plain nested payload. See the warning below.
    case 4: return text(scanCity(p.profile)[0] ?? "");
    default: {
      const names = [...scanPetNames(p.profile)].sort().join(", ");
      return text(names === "" ? "—" : names);
    }
  }
};`,
        },
        {
            kind: "p",
            text: "Every needle above traces back to a key you can see in the payload. Read them against it:",
        },
        {
            kind: "list",
            items: [
                "**The needle is relative to the haystack you pass.** The haystack is `p.profile`, so `address.city` starts at `address` — *not* `profile.address.city`. Passing `p` instead would need the longer needle, and against a class instance it would match nothing at all (see below).",
                '**`address.city` matches one key.** `profile.address` is a single object with `city` and `country`; the needle names `city`, so the scan returns `["Lisbon"]` and `[0]` is the value. A one-element array is the normal result for a single-valued path — `scanCity(...)[0] ?? ""` is the whole ceremony.',
                '**`pets.name` matches every element of `pets`, because `useArraySelector: false` means array indices are not part of the needle.** `profile.pets` is an array of two objects, so the needle matches `pets[0].name` and `pets[1].name` and the scan returns `["Momo", "Rex"]`. Under the default `useArraySelector: true` you would have to write `pets[*].name` to get the same thing.',
                "**Keys you do not name are simply not visited** — `species`, `country`, `__typename` and `id` never appear in a result here because no needle mentions them. Order of results follows traversal order, which is why the pets are `.sort()`ed before joining rather than trusted.",
                "**A needle that matches nothing returns `[]`, silently.** There is no error and no warning; the cell just comes out empty. That is worth knowing on its own, and it is exactly the failure mode of the next paragraph.",
            ],
        },
        {
            kind: "note",
            text: "**⚠️ Point path scanners at plain data, not at a class instance — this is *the* one that bites when flattening models.** `object-scan`, like most traversal libraries, walks **own enumerable** properties, while `@tracked` fields and Ember Data `@attr`s are accessors on the **prototype**. A scanner aimed straight at a tracked model or an Ember Data record matches **nothing, silently** — no error, just empty cells. Two ways out, both fine: scan the plain nested blob the response actually handed you (`person.profile`, `person.pets`) and read the model's own top-level fields with ordinary property access; or convert the record to a POJO first (`record.toJSON()`, a serializer, your own mapper) and scan that. The first is cheaper, and is what the *Scale proof* panel does. Apollo cache results are plain objects throughout, so this does not arise there at all.",
        },
        {
            kind: "p",
            text: 'Both versions are running in this app. The plain-accessor `toCell` is `app/utils/apollo-fake.ts`, feeding the **Apollo (faked)** tab from exactly the payload printed above. The `object-scan` version is `app/utils/scale-records.ts`, running in the **Tracking proof demo** tab\'s *Scale proof* panel — including the compile counter that puts "twice, not thousands of times" on screen as an observed number. Both scanners there deliberately take `employee.profile`, the plain nested blob, and never the `Employee` instance.',
        },
        {
            kind: "p",
            text: "Whatever you use, the shape of the rule is the same and it is chapter 2's rule restated: expensive, declarative, or reflective work goes on the **memoized** side of the boundary. `toCell` runs once per record; `getCellContent` runs once per painted cell.",
        },
    ],
};
