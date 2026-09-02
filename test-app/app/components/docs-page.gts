// The shared renderer behind both documentation tabs: **Guide** and **Cookbook**.
//
// Phase 11 split one artifact into two, because they were doing two different jobs:
//
//   - the **Guide** (`app/utils/guide/`) is narrative — you arrive knowing nothing and it walks you
//     from zero to a working integration, in order, carrying one running example the whole way;
//   - the **Cookbook** (`app/utils/cookbook/`) is task-indexed — you arrive knowing you want context
//     menus, jump to that recipe, and each recipe stands alone.
//
// Both are the same *shape* of document, so they share this renderer, the `Section`/`Block` content
// model in `app/utils/cookbook/types.ts`, and the position-numbered TOC. Extracting it here is what
// makes a second tab a ~40-line component rather than a second copy of a 200-line one.
//
// Content is plain data rather than markup for two reasons that have not changed: code samples
// containing `{{ }}` would otherwise be parsed as Glimmer, and keeping prose as data means editing a
// chapter is editing one string rather than surgery on markup.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { htmlSafe } from "@ember/template";
import { modifier } from "ember-modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";
import type { Block, Section } from "../utils/cookbook/types.ts";

// --- the live example a `{ kind: "live" }` block renders ----------------------------------------
// Deliberately the exact code the surrounding chapter shows, so the two cannot drift.
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
// module-scope constants in this app either way.
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

// Ember paints after the browser has already tried (and failed) to honour the URL hash — the
// target `<section id>` did not exist yet. Scroll once the chapters are in the DOM, and again
// after the live example grid in chapter 1 sizes itself (that first layout shift would otherwise
// push the target back down). Native in-page `#id` clicks keep working on their own; this is
// only for a cold load of `/cookbook#columns` or `/guide#reactivity`.
const scrollToHash = modifier((element: Element) => {
    const raw = globalThis.location.hash;
    if (raw.length < 2) return;
    const id = decodeURIComponent(raw.slice(1));

    let cancelled = false;
    const timers: ReturnType<typeof globalThis.setTimeout>[] = [];

    const scroll = (): void => {
        if (cancelled) return;
        const target = document.getElementById(id);
        if (target === null || !element.contains(target)) return;
        target.scrollIntoView({ block: "start" });
    };

    for (const delay of [0, 50, 200]) {
        timers.push(globalThis.setTimeout(scroll, delay));
    }

    return () => {
        cancelled = true;
        for (const timer of timers) globalThis.clearTimeout(timer);
    };
});

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

export interface DocsPageSignature {
    Args: {
        /** `<h1>`. Rendered through the same inline formatter as prose, so backticks work. */
        readonly title: string;
        /** One paragraph under the title, saying who this document is for. */
        readonly lede: string;
        /** Heading above the table of contents. */
        readonly tocTitle: string;
        /** Small print under the table of contents — usually a pointer at the *other* tab. */
        readonly tocNote: string;
        /** The chapters, in order. Numbered from position; titles carry no leading number. */
        readonly sections: readonly Section[];
        /** Test hook, so the two pages are distinguishable in a DOM probe. */
        readonly testId?: string;
    };
}

export default class DocsPage extends Component<DocsPageSignature> {
    // Chapter numbers come from position, not from the titles themselves — see
    // `app/utils/cookbook/types.ts` for why.
    get sections(): readonly { id: string; title: string; blocks: readonly RenderBlock[] }[] {
        return this.args.sections.map((section, i) => ({
            id: section.id,
            title: `${i + 1}. ${section.title}`,
            blocks: section.blocks.map(toRenderBlock),
        }));
    }

    get titleHtml(): ReturnType<typeof htmlSafe> {
        return inline(this.args.title);
    }

    get ledeHtml(): ReturnType<typeof htmlSafe> {
        return inline(this.args.lede);
    }

    get tocNoteHtml(): ReturnType<typeof htmlSafe> {
        return inline(this.args.tocNote);
    }

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
        <div class="gdg-cookbook" data-test-docs-page={{@testId}} {{scrollToHash}}>
            <nav class="gdg-cookbook__toc">
                <div class="gdg-cookbook__toc-title">{{@tocTitle}}</div>
                {{#each this.sections as |chapter|}}
                    <a href="#{{chapter.id}}">{{chapter.title}}</a>
                {{/each}}
                <div class="gdg-cookbook__toc-note">{{this.tocNoteHtml}}</div>
            </nav>

            <article class="gdg-cookbook__body">
                <header class="gdg-cookbook__intro">
                    <h1>{{this.titleHtml}}</h1>
                    <p>{{this.ledeHtml}}</p>
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
