// Phase 10b: the consumer cookbook, as a real page rather than a markdown file.
//
// It lives in the test-app on purpose: this app is what gets deployed, so the cookbook ships with
// the demos it describes, and the "one-line render" recipe at the top is an actual live grid rather
// than a screenshot of one. The addon's README covers install and the minimal render and links
// here; `DATA.md` and `THEMING.md` remain the deep guides and are not restated.
//
// Content is a plain data model rendered by a small template, for two reasons: code samples
// containing `{{ }}` would otherwise be parsed as Glimmer, and keeping prose as data means editing
// a recipe is editing one string rather than surgery on markup. **The chapters live one-per-file in
// `app/utils/cookbook/`** and are ordered by that directory's `index.ts`; this file is only the
// renderer plus the live grid recipe 1 shows.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { htmlSafe } from "@ember/template";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";
import { SECTIONS, type Block } from "../utils/cookbook/index.ts";

// --- the live example at the top of the page ---------------------------------------------------
// Deliberately the exact code the first recipe shows, so the two cannot drift.
const LIVE_COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 190 },
    { id: "email", title: "Email", width: 240 },
    { id: "role", title: "Role", width: 150 },
];

const LIVE_PEOPLE = [
    { name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" },
    { name: "Grace Hopper", email: "grace@example.com", role: "Rear Admiral" },
    { name: "Alan Turing", email: "alan@example.com", role: "Cryptanalyst" },
    { name: "Katherine Johnson", email: "katherine@example.com", role: "Aerospace" },
    { name: "Margaret Hamilton", email: "margaret@example.com", role: "Engineer" },
];

function text(value: string): GridCell {
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
}

// --- tiny inline formatter ----------------------------------------------------------------------
// Escapes first, then applies a deliberately small markdown subset: `code`, **bold**, and nothing
// else. Escaping before substitution is what makes the `htmlSafe` below safe; the content is
// module-scope constants in this file either way.
function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): ReturnType<typeof htmlSafe> {
    const escaped = escapeHtml(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        // Bold before italic: `**x**` would otherwise be eaten by the single-asterisk rule.
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return htmlSafe(escaped);
}

// Flattened for rendering: one uniform shape with `is*` booleans, rather than a discriminated union.
// Glimmer templates cannot narrow a union, so this is what keeps the template both type-checkable
// and free of helper gymnastics.
interface RenderBlock {
    readonly isP: boolean;
    readonly isCode: boolean;
    readonly isNote: boolean;
    readonly isList: boolean;
    readonly isTable: boolean;
    readonly isLive: boolean;
    readonly html: ReturnType<typeof htmlSafe> | undefined;
    readonly text: string;
    readonly htmlItems: readonly ReturnType<typeof htmlSafe>[];
    readonly head: readonly string[];
    readonly htmlRows: readonly (readonly ReturnType<typeof htmlSafe>[])[];
}

function toRenderBlock(block: Block): RenderBlock {
    return {
        isP: block.kind === "p",
        isCode: block.kind === "code",
        isNote: block.kind === "note",
        isList: block.kind === "list",
        isTable: block.kind === "table",
        isLive: block.kind === "live",
        html: block.kind === "p" || block.kind === "note" ? inline(block.text) : undefined,
        text: block.kind === "code" ? block.text : "",
        htmlItems: block.kind === "list" ? block.items.map(inline) : [],
        head: block.kind === "table" ? block.head : [],
        htmlRows: block.kind === "table" ? block.rows.map(row => row.map(inline)) : [],
    };
}

export default class CookbookPage extends Component {
    // Chapter numbers come from position, not from the titles themselves — see
    // `app/utils/cookbook/types.ts` for why.
    readonly sections = SECTIONS.map((section, i) => ({
        id: section.id,
        title: `${i + 1}. ${section.title}`,
        blocks: section.blocks.map(toRenderBlock),
    }));

    readonly liveColumns = LIVE_COLUMNS;
    readonly liveRows = LIVE_PEOPLE.length;

    @tracked private liveEdits: ReadonlyMap<string, GridCell> = new Map();

    getCellContent = ([col, row]: Item): GridCell => {
        const edited = this.liveEdits.get(`${col},${row}`);
        if (edited !== undefined) return edited;
        const person = LIVE_PEOPLE[row];
        if (person === undefined) return text("");
        return text([person.name, person.email, person.role][col] ?? "");
    };

    // A class-field arrow, not `@action`: Ember 6+ no longer recommends the decorator, and an arrow
    // field is identity-stable, which is what the grid's identity-compared args need anyway.
    handleCellsEdited = (edits: readonly { location: Item; value: GridCell }[]): void => {
        const next = new Map(this.liveEdits);
        for (const e of edits) next.set(`${e.location[0]},${e.location[1]}`, e.value);
        this.liveEdits = next;
    };

    <template>
        <div class="gdg-cookbook">
            <nav class="gdg-cookbook__toc">
                <div class="gdg-cookbook__toc-title">Cookbook</div>
                {{#each this.sections as |chapter|}}
                    <a href="#{{chapter.id}}">{{chapter.title}}</a>
                {{/each}}
                <div class="gdg-cookbook__toc-note">
                    Deep guides live in the addon:
                    <code>DATA.md</code>
                    and
                    <code>THEMING.md</code>. Every other tab above is a working demo of something
                    described here.
                </div>
            </nav>

            <article class="gdg-cookbook__body">
                <header class="gdg-cookbook__intro">
                    <h1>Using <code>&lt;GlideDataGrid&gt;</code> in an Ember app</h1>
                    <p>
                        Task-oriented recipes, each one copy-pasteable. They are lifted from the demos in
                        the other tabs — so if a recipe here stops working, a demo stops working.
                    </p>
                </header>

                {{! `section` would shadow the `<section>` element in a strict-mode template --
                    any lowercase tag matching an in-scope binding resolves to that binding. }}
                {{#each this.sections as |chapter|}}
                    <section id={{chapter.id}} class="gdg-cookbook__section">
                        <h2>{{chapter.title}}</h2>
                        {{#each chapter.blocks as |block|}}
                            {{#if block.isP}}
                                <p>{{block.html}}</p>
                            {{else if block.isCode}}
                                <pre class="gdg-cookbook__code"><code>{{block.text}}</code></pre>
                            {{else if block.isNote}}
                                <p class="gdg-cookbook__note">{{block.html}}</p>
                            {{else if block.isList}}
                                <ul>
                                    {{#each block.htmlItems as |item|}}<li>{{item}}</li>{{/each}}
                                </ul>
                            {{else if block.isTable}}
                                <table class="gdg-cookbook__table">
                                    <thead>
                                        <tr>{{#each block.head as |h|}}<th>{{h}}</th>{{/each}}</tr>
                                    </thead>
                                    <tbody>
                                        {{#each block.htmlRows as |row|}}
                                            <tr>{{#each row as |cell|}}<td>{{cell}}</td>{{/each}}</tr>
                                        {{/each}}
                                    </tbody>
                                </table>
                            {{else if block.isLive}}
                                <div class="gdg-cookbook__live" data-test-cookbook-live-grid>
                                    <GlideDataGrid
                                        @columns={{this.liveColumns}}
                                        @rows={{this.liveRows}}
                                        @getCellContent={{this.getCellContent}}
                                        @onCellsEdited={{this.handleCellsEdited}}
                                    />
                                </div>
                                <p class="gdg-cookbook__caption">
                                    A real grid, not a screenshot — click a cell, type, press Enter.
                                </p>
                            {{/if}}
                        {{/each}}
                    </section>
                {{/each}}
            </article>
        </div>
    </template>
}
