// Guide chapter 1. Install, render, and introduce the running example every later chapter extends.
//
// The example is a `Person` table, and it is deliberately the same shape as the live grid `<DocsPage>`
// renders for the `{ kind: "live" }` block below — so the code on the page and the grid under it are
// the same thing.
import type { Section } from "../cookbook/types.ts";

export const installSection: Section = {
    id: "install",
    title: "Install, and get a grid on screen",
    blocks: [
        {
            kind: "p",
            text: "This guide is one continuous example. It starts as an array of plain objects and ends as an editable, themed, sorted grid backed by a real store — the same `Person` table the whole way, growing a chapter at a time. Nothing here is a recipe you look up; read it in order once and the **Cookbook** tab will make sense as a reference.",
        },
        { kind: "code", text: `ember install glide-data-grid-ember` },
        {
            kind: "p",
            text: "There is nothing else to wire. The addon imports its own CSS, registers its own cell types, and exposes one component. Here is the smallest thing that works — a component class from the start, because that is what the rest of the guide builds on:",
        },
        {
            kind: "code",
            text: `// app/components/people-table.gts
import Component from "@glimmer/component";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

// Module scope, not a getter. Chapter 9 explains why this matters more than it looks like it does.
const COLUMNS: readonly GridColumn[] = [
  { id: "name",  title: "Name",  width: 190 },
  { id: "email", title: "Email", width: 240 },
  { id: "role",  title: "Role",  width: 150 },
];

const PEOPLE = [
  { name: "Ada Lovelace",      email: "ada@example.com",      role: "Mathematician" },
  { name: "Grace Hopper",      email: "grace@example.com",    role: "Rear Admiral" },
  { name: "Alan Turing",       email: "alan@example.com",     role: "Cryptanalyst" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
  { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

export default class PeopleTable extends Component {
  columns = COLUMNS;
  rows = PEOPLE.length;

  // A class-field arrow, never \`@action\`. Ember 6+ no longer recommends the decorator — and the
  // arrow happens to be the identity-stable spelling, which chapter 9 shows is load-bearing here.
  getCellContent = ([col, row]: Item): GridCell => {
    const person = PEOPLE[row]!;
    const value = [person.name, person.email, person.role][col] ?? "";
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
  };

  <template>
    {{! The grid fills its container, so the container needs a height. }}
    <div style="height: 220px">
      <GlideDataGrid
        @columns={{this.columns}}
        @rows={{this.rows}}
        @getCellContent={{this.getCellContent}}
      />
    </div>
  </template>
}`,
        },
        { kind: "p", text: "That code, running:" },
        { kind: "live" },
        {
            kind: "note",
            text: '**The grid sizes itself to its container and has no `width`/`height` args.** A container with no height renders a zero-height grid, which is by a wide margin the most common "nothing appears". If your first render is blank, check this before anything else.',
        },
        {
            kind: "p",
            text: "Three things are already true of that snippet, and each becomes a chapter:",
        },
        {
            kind: "list",
            items: [
                "**`@rows` is a count, not data.** Nothing is materialised, nothing is copied, and the grid never sees `PEOPLE`. That is the *pull model* — chapter 2.",
                "**`getCellContent` is called by the paint loop**, once per painted cell. What you are allowed to do inside it is therefore not a style question — chapter 2.",
                "**`PEOPLE` is a module constant, so nothing can change.** Making it change correctly is the part of this addon that has no error message when you get it wrong — chapter 3.",
            ],
        },
    ],
};
