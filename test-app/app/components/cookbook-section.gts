// One cookbook unit: a live example, then the complete source that produced it.
// Lifted from floating-ember's demo-app `CookbookSection` — same contract, this addon's styling.
import Component from "@glimmer/component";

export interface CookbookSectionSignature {
    Args: {
        readonly title: string;
        readonly blurb?: string;
        readonly code: string;
        readonly codeOpen?: boolean;
    };
    Blocks: {
        default: [];
    };
}

export default class CookbookSection extends Component<CookbookSectionSignature> {
    get codeOpen(): boolean {
        return this.args.codeOpen !== false;
    }

    <template>
        <section class="gdg-cookbook__section">
            <header class="gdg-cookbook__section-head">
                <h2>{{@title}}</h2>
                {{#if @blurb}}
                    <p class="gdg-cookbook__blurb">{{@blurb}}</p>
                {{/if}}
            </header>

            <div class="gdg-cookbook__live-wrap">
                <div class="gdg-cookbook__live-label">Live</div>
                <div class="gdg-cookbook__live-body">
                    {{yield}}
                </div>
            </div>

            <details class="gdg-cookbook__recipe" open={{this.codeOpen}}>
                <summary>
                    <span>How to build this</span>
                    <span class="gdg-cookbook__recipe-hint">complete file, nothing omitted</span>
                </summary>
                <pre class="gdg-cookbook__code"><code>{{@code}}</code></pre>
            </details>
        </section>
    </template>
}
