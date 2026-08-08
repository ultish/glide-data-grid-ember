// Guide chapter 6. `toCell` as the flattening boundary, and `object-scan` as an OPTIONAL helper.
//
// Per explicit user instruction (2026-08-09): `object-scan` is presented as one of several equally
// fine choices for shaping models/classes into flat fields — never as the recommended path, and never
// as an addon dependency (it is a `test-app`-only devDependency, deliberately). The own-enumerable /
// prototype-accessor caveat is the one that bites in exactly this use case and must stay attached
// to it. The worked code is `test-app/app/utils/scale-records.ts`, which is what the samples below
// are lifted from.
import type { Section } from "../cookbook/types.ts";

export const flatteningSection: Section = {
    id: "flattening",
    title: "Flattening a model into the fields a row needs",
    blocks: [
        {
            kind: "p",
            text: "The grid wants a flat list of values per row; your data is almost never flat. Ember Data records have relationships, GraphQL results are nested and carry arrays of related entities, and a domain class has whatever shape it has. **`toCell` is where that flattening belongs**, because it is the memoized side of the boundary: done there it runs once per record, done in `getCellContent` it runs once per painted cell.",
        },
        {
            kind: "p",
            text: "Start with no library at all. A plain accessor is frequently the whole answer:",
        },
        {
            kind: "code",
            text: `// No dependency, no compilation step, and it type-checks. Prefer this until it stops scaling.
const gqlPersonToCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    case 1: return text(p.profile?.address?.city ?? "");
    default: {
      const pets = (p.profile?.pets ?? []).map(pet => pet.name).sort().join(", ");
      return text(pets === "" ? "—" : pets);
    }
  }
};`,
        },
        {
            kind: "note",
            text: "**A traversal library is entirely optional here, and `object-scan` is one of several equally fine choices** — `lodash.get`, `jsonpath` or a hand-written walk are all as good. **The addon depends on none of them and never will**: `toCell` is a plain accessor function generic over your row type, so there is deliberately no path-string syntax to learn and nothing to escape. In this repo `object-scan` is a **test-app dependency only**. Reach for something like it when the shapes are deep or variable enough that hand-written walks stop paying.",
        },
        {
            kind: "p",
            text: "Here is what that looks like when a column's value could be at one of several depths, or you want one declarative needle instead of a chain of `?.` and `.map().filter()`. The rule that matters is **compile once per column, at module scope** — `objectScan(...)` parses its needles and builds a matcher, and doing that inside `toCell` rebuilds it once per cell:",
        },
        {
            kind: "code",
            text: `import objectScan from "object-scan";

// \`useArraySelector: false\` -> array indices are not part of the needle, so \`pets.name\` matches
// every element of \`pets\`. \`rtn: "value"\` -> matched values, not their key paths.
const compile = needle => objectScan([needle], { useArraySelector: false, rtn: "value" });

// One scanner per column, hoisted. Two \`objectScan\` calls for the life of the page — not two per
// cell, which on a 1,000-row × 7-column sweep would be 14,000.
const scanCity     = compile("address.city");
const scanPetNames = compile("pets.name");

const gqlPersonToCell = (p, col) => {
  switch (col) {
    case 0: return text(p.name);
    // Note the scan target: the plain nested payload, NOT the record object. See the warning below.
    case 1: return text(scanCity(p.profile)[0] ?? "");
    default: {
      const names = [...scanPetNames(p.profile)].sort().join(", ");
      return text(names === "" ? "—" : names);
    }
  }
};`,
        },
        {
            kind: "note",
            text: "**⚠️ Point path scanners at plain data, not at a class instance — this is *the* one that bites when flattening models.** `object-scan`, like most traversal libraries, walks **own enumerable** properties, while `@tracked` fields and Ember Data `@attr`s are accessors on the **prototype**. A scanner aimed straight at a tracked model or an Ember Data record matches **nothing, silently** — no error, just empty cells. Two ways out, both fine: scan the plain nested blob the response actually handed you (`person.profile`, `person.pets`) and read the model's own top-level fields with ordinary property access; or convert the record to a POJO first (`record.toJSON()`, a serializer, your own mapper) and scan that. The first is cheaper, and is what the *Scale proof* panel does.",
        },
        {
            kind: "p",
            text: "The worked version of the code above — including the compile counter that puts \"twice, not fourteen thousand\" on screen as an observed number — is `app/utils/scale-records.ts`, running in the **Tracking proof demo** tab's *Scale proof* panel. Both scanners in it deliberately take `employee.profile`, the plain nested blob, and never the `Employee` instance.",
        },
        {
            kind: "p",
            text: "Whatever you use, the shape of the rule is the same and it is chapter 2's rule restated: expensive, declarative, or reflective work goes on the **memoized** side of the boundary. `toCell` runs once per record; `getCellContent` runs once per painted cell.",
        },
    ],
};
