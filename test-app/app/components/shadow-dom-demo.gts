// §4.5's last open row: does the grid work inside a shadow root?
//
// This existed as a question rather than a demo for a long time, which is exactly the state TODO.md's
// rule 5 warns about — the pointer-listener half was *reasoned* to work (`@eventTarget` resolves
// `root.getRootNode()`, so the three window-level mouse listeners bind to the `ShadowRoot`), but
// nothing had ever mounted the grid inside one.
//
// What a shadow root actually changes, and why each is a separate risk:
//   1. **Styles.** The addon's stylesheets are imported from its component modules, so they land in
//      the *document* head. Shadow DOM's whole point is that document styles do not cross the
//      boundary — so the grid inside one would render unstyled unless the styles are adopted. This
//      demo copies them in, and that copy is the finding: it is a consumer responsibility, not
//      something the addon can do for you.
//   2. **Pointer events.** Handled by the addon already (see above).
//   3. **The measurement canvas**, appended to `document.documentElement`. Outside the shadow root,
//      which is fine *because* it is measured with an explicit `ctx.font` rather than inherited CSS.
//   4. **Clipboard listeners**, which stay on `window` by design (source does the same) — a
//      clipboard event is dispatched at the focused document either way.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { modifier } from "ember-modifier";
import GlideDataGrid from "glide-data-grid-ember/components/glide-data-grid";
import { GridCellKind, type GridCell, type GridColumn, type Item } from "glide-data-grid-ember/rendering/index";

const COLUMNS: readonly GridColumn[] = [
    { id: "name", title: "Name", width: 180 },
    { id: "role", title: "Role", width: 160 },
    { id: "team", title: "Team", width: 140 },
];

const ROWS = [
    ["Ada Lovelace", "Analyst", "Engine"],
    ["Grace Hopper", "Compiler", "Navy"],
    ["Alan Turing", "Cryptanalyst", "Hut 8"],
    ["Radia Perlman", "Networks", "Spanning"],
    ["Barbara Liskov", "Languages", "Substitution"],
];

/**
 * Attaches a shadow root to the element and renders into it with `{{in-element}}`.
 *
 * The style sheets are adopted by cloning every `<style>`/`<link rel=stylesheet>` the document has
 * into the shadow root. Crude on purpose: the point is to show *that* the boundary has to be crossed
 * deliberately, not to ship a styling strategy. A real consumer would use `adoptedStyleSheets` with
 * the addon's own sheet, or build with a bundler that emits it as a constructable sheet.
 */
const attachShadow = modifier((element: HTMLElement, [onReady]: [(root: ShadowRoot) => void]) => {
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    if (shadow.childNodes.length === 0) {
        for (const sheet of document.querySelectorAll('style, link[rel="stylesheet"]')) {
            shadow.append(sheet.cloneNode(true));
        }
        const host = document.createElement("div");
        // The grid sizes itself from its container, and a shadow host is `display: inline` by
        // default -- so without an explicit box here the grid gets zero height and paints nothing.
        host.style.cssText = "height: 320px; width: 100%;";
        shadow.append(host);
    }
    onReady(shadow.lastElementChild as HTMLElement as unknown as ShadowRoot);
});

export default class ShadowDomDemo extends Component {
    @tracked mountPoint: HTMLElement | undefined;
    @tracked lastEvent = "—";
    @tracked selectionSummary = "none";

    handleShadowReady = (node: unknown): void => {
        // Assigned in a microtask: the modifier runs during render, and setting tracked state that
        // the same render reads is what Ember's backtracking assertion exists to catch.
        void Promise.resolve().then(() => {
            this.mountPoint = node as HTMLElement;
        });
    };

    getCellContent = (item: Item): GridCell => {
        const [col, row] = item;
        const data = ROWS[row]?.[col] ?? "";
        return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: false };
    };

    handleCellClicked = (cell: Item): void => {
        this.lastEvent = `clicked col ${cell[0]}, row ${cell[1]}`;
    };

    handleSelectionChanged = (selection: { current?: { cell: Item } }): void => {
        const current = selection.current;
        this.selectionSummary = current === undefined ? "none" : `cell ${current.cell[0]},${current.cell[1]}`;
    };

    <template>
        <div class="gdg-page">
            <h2 class="gdg-page__title">Inside a shadow root</h2>
            <p class="gdg-page__lede">
                The grid below is rendered into an open shadow root, which is what §4.5's last item asked about. Click a
                cell and use the arrow keys: selection, hit-testing and keyboard nav all have to work across the
                boundary. The styles are cloned into the root by this demo — document styles do not cross a shadow
                boundary, so that part is the consumer's job.
            </p>

            <div class="gdg-page__status">
                <span>Selection: <b data-test-shadow-selection>{{this.selectionSummary}}</b></span>
                <span>Last event: <b data-test-shadow-event>{{this.lastEvent}}</b></span>
            </div>

            <div data-test-shadow-host {{attachShadow this.handleShadowReady}}></div>

            {{#if this.mountPoint}}
                {{#in-element this.mountPoint}}
                    <GlideDataGrid
                        @columns={{COLUMNS}}
                        @rows={{ROWS.length}}
                        @getCellContent={{this.getCellContent}}
                        @rowMarkers="number"
                        @onCellClicked={{this.handleCellClicked}}
                        @onSelectionChanged={{this.handleSelectionChanged}}
                    />
                {{/in-element}}
            {{/if}}
        </div>
    </template>
}
