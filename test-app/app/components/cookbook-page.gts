import Component from "@glimmer/component";
import { LinkTo } from "@ember/routing";
import { chaptersByPart } from "test-app/utils/cookbook/chapters.ts";

export interface CookbookPageSignature {
    Blocks: { default: [] };
}

export default class CookbookPage extends Component<CookbookPageSignature> {
    readonly parts = chaptersByPart();

    <template>
        <div class="gdg-cookbook" data-test-docs-page="cookbook">
            <nav class="gdg-cookbook__toc">
                <LinkTo @route="cookbook.index" class="gdg-cookbook__toc-title" @activeClass="gdg-cookbook__toc-active">
                    Cookbook
                </LinkTo>
                {{#each this.parts as |part|}}
                    <div class="gdg-cookbook__toc-part">{{part.title}}</div>
                    {{#each part.chapters as |chapter|}}
                        <LinkTo @route="cookbook.chapter" @model={{chapter.id}} @activeClass="gdg-cookbook__toc-active">
                            {{chapter.title}}
                        </LinkTo>
                    {{/each}}
                {{/each}}
                <div class="gdg-cookbook__toc-note">
                    If the grid renders and then never updates, that is
                    <LinkTo @route="cookbook.chapter" @model="reactivity">Why your grid doesn't update</LinkTo>
                    — it fails silently. Ember 6 and 7. Every live example is the file under it.
                </div>
            </nav>
            <article class="gdg-cookbook__body">
                {{yield}}
            </article>
        </div>
    </template>
}
