// Proof that Ember's native autotracking drives the canvas grid.
//
// The setup is deliberately airtight: a small table backed by a `ModelStore` of long-lived object
// references (`app/utils/model-store.ts`), a form that edits the selected record, and **no
// imperative redraw anywhere in this file**. There is no `updateCells()` call, no `@onCellsEdited`
// handler, and every cell is `allowOverlay: false` so the grid's own overlay editor can never fire
// and repaint via its internal damage path. Nothing changes identity -- not the store, not the
// array, not any `Person` instance. Submitting the form mutates `@tracked` fields *in place*.
//
// So if the canvas updates, autotracking is the only thing that could have caused it.
//
// ---------------------------------------------------------------------------------------------
// THE ONE THING THAT MAKES THIS WORK -- read before copying this pattern
// ---------------------------------------------------------------------------------------------
// `getCellContent` below is a **getter that eagerly reads every tracked field**, not a class-field
// arrow function like `<DemoGrid>` uses.
//
// Autotracking only records reads that happen *during* a tracked computation. `<GlideDataGrid>`'s
// modifier establishes its dependencies by calling `buildGridHostArgs()`, which reads
// `this.args.getCellContent` -- it reads the *function reference*, it does not call it. So any
// tracked property a `getCellContent` closure touches when the grid later invokes it at draw time
// is read OUTSIDE the tracking frame and is never registered as a dependency.
//
// Concretely, this does NOT repaint when `person.name` changes:
//
//     getCellContent = ([col, row]) => cellFor(this.store.all[row], col);   // ❌ class field
//
// ...because `this.store.all[row].name` is only read later, at draw time. Whereas this does:
//
//     get getCellContent() {
//         const snapshot = this.store.all.map(p => ({ name: p.name, ... }));  // ✅ read NOW
//         return ([col, row]) => cellFor(snapshot[row], col);
//     }
//
// Reading the getter (inside the tracking frame) consumes every `@tracked` field, so mutating any
// of them invalidates the modifier, which re-runs, which produces a new closure identity, which
// makes `computeCanBlit` return false, which forces a real repaint. The whole chain is load-bearing.
//
// The tradeoff is that this projects every row up front, so it suits bounded datasets -- exactly
// what a form-backed editing table is. For the 200k-row virtualized case, keep the lazy class-field
// form and drive updates with the imperative `updateCells()` API instead (that is the documented
// dual-path model in PHASES.md, and it is why `<DemoGrid>` is written the other way).
//
// ---------------------------------------------------------------------------------------------
// SCALING: don't copy this projection verbatim past a few hundred rows
// ---------------------------------------------------------------------------------------------
// The snapshot below is a plain `.map()` over every record, which is honest at 8 rows and wrong at
// 1,000: autotracking invalidation is all-or-nothing at the granularity of the computation, so
// changing ONE field re-runs the whole projection and re-derives every cell of every row.
//
// The middle ground (1k-50k rows) is a per-row `@cached` view model -- one object per record whose
// getter reads only that record's tracked fields:
//
//     class PersonRow {
//         constructor(readonly person: Person) {}
//         @cached get cells() { return [this.person.name, this.person.email /* ... */]; }
//     }
//     @cached get rowVMs() { return this.store.all.map(p => new PersonRow(p)); }  // stable
//     get flatRows() { return this.rowVMs.map(r => r.cells); }                    // eager read
//
// Editing one field then invalidates exactly one row's cache: the outer `.map()` still runs, but
// it is 999 cache hits plus 1 real recompute rather than 1,000 recomputes. The load-bearing detail
// is that `rowVMs` must be keyed on the *records array* identity -- if it is rebuilt when a field
// changes, every `@cached` resets and you are back to full recomputation with extra steps.
//
// This is deliberately NOT done here: at 8 rows it would be ceremony that obscures the one thing
// this file exists to demonstrate. It belongs in the Phase 8 `recordsSource` layer, where it can be
// written once instead of copied per consumer -- see PHASES.md's Phase 8 section.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import {
    GridCellKind,
    getCellRenderer,
    type GridCell,
    type GridColumn,
    type GridSelection,
    type Item,
} from "glide-data-grid-ember/rendering/index";
import { ModelStore, ROLES, type Person, type Role } from "test-app/utils/model-store";

const COLUMNS: readonly GridColumn[] = [
    { title: "Name", width: 190 },
    { title: "Email", width: 230 },
    { title: "Role", width: 130 },
    { title: "Age", width: 80 },
    { title: "Active", width: 90 },
];

// A plain, non-reactive projection of one model. Building this is what forces the tracked reads.
interface PersonSnapshot {
    readonly id: number;
    readonly name: string;
    readonly email: string;
    readonly role: Role;
    readonly age: number;
    readonly active: boolean;
}

export default class TrackingDemo extends Component {
    private readonly store = new ModelStore();

    /** `id` of the selected record, or `undefined`. Drives which record the form is bound to. */
    @tracked selectedId: number | undefined = undefined;

    // Form draft state. Deliberately separate from the model: the model is only written on submit,
    // so "the grid updated" can't be an artifact of the form and the grid sharing one object.
    @tracked draftName = "";
    @tracked draftEmail = "";
    @tracked draftRole: Role = "Engineer";
    @tracked draftAge = 0;
    @tracked draftActive = false;

    /** Last-submitted summary, purely so the page shows that a write really happened. */
    @tracked lastSubmit: string | undefined = undefined;

    readonly columns = COLUMNS;

    // Precomputed so the template needs no `eq` helper (which would mean an `ember-truth-helpers`
    // dependency this app doesn't otherwise have).
    get roleOptions(): readonly { value: Role; selected: boolean }[] {
        return ROLES.map(r => ({ value: r, selected: r === this.draftRole }));
    }

    get rowCount(): number {
        return this.store.all.length;
    }

    get selectedPerson(): Person | undefined {
        return this.selectedId === undefined ? undefined : this.store.find(this.selectedId);
    }

    // See the header comment -- this MUST be a getter that reads the tracked fields eagerly.
    get getCellContent(): (item: Item) => GridCell {
        const snapshot: readonly PersonSnapshot[] = this.store.all.map(p => ({
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role,
            age: p.age,
            active: p.active,
        }));

        return ([col, row]: Item): GridCell => {
            const person = snapshot[row];
            if (person === undefined) {
                return { kind: GridCellKind.Text, allowOverlay: false, data: "", displayData: "" };
            }
            switch (col) {
                case 0:
                    return {
                        kind: GridCellKind.Text,
                        allowOverlay: false,
                        data: person.name,
                        displayData: person.name,
                    };
                case 1:
                    return {
                        kind: GridCellKind.Text,
                        allowOverlay: false,
                        data: person.email,
                        displayData: person.email,
                    };
                case 2:
                    return {
                        kind: GridCellKind.Text,
                        allowOverlay: false,
                        data: person.role,
                        displayData: person.role,
                    };
                case 3:
                    return {
                        kind: GridCellKind.Number,
                        allowOverlay: false,
                        data: person.age,
                        displayData: String(person.age),
                    };
                default:
                    return { kind: GridCellKind.Boolean, allowOverlay: false, data: person.active };
            }
        };
    }

    /** Clicking a row loads that record into the form. */
    @action
    handleSelectionChanged(selection: GridSelection): void {
        const row = selection.current?.cell[1];
        const person = row === undefined ? undefined : this.store.all[row];
        if (person === undefined) return;
        this.selectedId = person.id;
        this.draftName = person.name;
        this.draftEmail = person.email;
        this.draftRole = person.role;
        this.draftAge = person.age;
        this.draftActive = person.active;
    }

    /**
     * The whole point. Mutates `@tracked` fields on an existing `Person` **in place** -- no new
     * object, no new array, no store replacement, and no call into the grid's imperative API.
     * The canvas repaint that follows is autotracking doing its job.
     */
    @action
    submitForm(event: Event): void {
        event.preventDefault();
        const person = this.selectedPerson;
        if (person === undefined) return;
        person.name = this.draftName;
        person.email = this.draftEmail;
        person.role = this.draftRole;
        person.age = this.draftAge;
        person.active = this.draftActive;
        this.lastSubmit = `Wrote #${person.id} at ${new Date().toLocaleTimeString()} — no updateCells() called`;
    }

    /** A second, form-free mutation path, to show the trigger isn't special to the form. */
    @action
    toggleActiveOnSelected(): void {
        const person = this.selectedPerson;
        if (person === undefined) return;
        person.active = !person.active;
        this.draftActive = person.active;
        this.lastSubmit = `Toggled #${person.id} active → ${person.active} — no updateCells() called`;
    }

    @action updateName(e: Event): void {
        this.draftName = (e.target as HTMLInputElement).value;
    }
    @action updateEmail(e: Event): void {
        this.draftEmail = (e.target as HTMLInputElement).value;
    }
    @action updateRole(e: Event): void {
        this.draftRole = (e.target as HTMLSelectElement).value as Role;
    }
    @action updateAge(e: Event): void {
        this.draftAge = Number((e.target as HTMLInputElement).value);
    }
    @action updateActive(e: Event): void {
        this.draftActive = (e.target as HTMLInputElement).checked;
    }

    <template>
        <div style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
            <p style="margin: 0; font: 13px system-ui; color: #444;">
                Click a row to load it into the form. Editing and submitting mutates
                <code>@tracked</code>
                fields on the existing model object — no
                <code>updateCells()</code>, no
                <code>@onCellsEdited</code>, and cells are
                <code>allowOverlay: false</code>
                so the grid can't edit itself. Any repaint you see is autotracking.
            </p>

            <div style="flex: 0 0 320px; min-height: 0;">
                <GlideDataGrid
                    @columns={{this.columns}}
                    @getCellContent={{this.getCellContent}}
                    @getCellRenderer={{getCellRenderer}}
                    @rows={{this.rowCount}}
                    @onSelectionChanged={{this.handleSelectionChanged}}
                />
            </div>

            {{#if this.selectedPerson}}
                <form
                    style="font: 13px system-ui; display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; border: 1px solid #ddd; border-radius: 6px; padding: 12px;"
                    {{on "submit" this.submitForm}}
                >
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="td-name">Name</label>
                        <input
                            id="td-name"
                            data-test-name
                            type="text"
                            value={{this.draftName}}
                            {{on "input" this.updateName}}
                        />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="td-email">Email</label>
                        <input
                            id="td-email"
                            data-test-email
                            type="text"
                            value={{this.draftEmail}}
                            {{on "input" this.updateEmail}}
                        />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="td-role">Role</label>
                        <select id="td-role" data-test-role {{on "change" this.updateRole}}>
                            {{#each this.roleOptions as |opt|}}
                                <option value={{opt.value}} selected={{opt.selected}}>{{opt.value}}</option>
                            {{/each}}
                        </select>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="td-age">Age</label>
                        <input
                            id="td-age"
                            data-test-age
                            type="number"
                            style="width: 80px;"
                            value={{this.draftAge}}
                            {{on "input" this.updateAge}}
                        />
                    </div>
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input
                            data-test-active
                            type="checkbox"
                            checked={{this.draftActive}}
                            {{on "change" this.updateActive}}
                        />
                        Active
                    </label>

                    <button type="submit" data-test-submit>Submit</button>
                    <button type="button" data-test-toggle-active {{on "click" this.toggleActiveOnSelected}}>
                        Toggle active (no form)
                    </button>
                </form>

                {{#if this.lastSubmit}}
                    <p data-test-last-submit style="margin: 0; font: 12px system-ui; color: #0a7;">
                        {{this.lastSubmit}}
                    </p>
                {{/if}}
            {{else}}
                <p style="font: 13px system-ui; color: #888; margin: 0;">No row selected.</p>
            {{/if}}
        </div>
    </template>
}
