import Route from "ember-route-template";
import { LinkTo } from "@ember/routing";
import { chaptersByPart } from "test-app/utils/cookbook/chapters.ts";

const parts = chaptersByPart();

export default Route(
    <template>
        <header class="gdg-cookbook__intro">
            <h1>Using <code>&lt;GlideDataGrid&gt;</code> in an Ember app</h1>
            <p>
                Basics to advanced, in order. Every chapter that can show a running grid does, and the file under it is
                the complete source — imports, module-scope constants, the class, the template. Ember 6 and 7,
                <code>.gts</code>, no
                <code>@action</code>.
            </p>
        </header>

        <p class="gdg-cookbook__note">
            <strong>If you read one chapter, read
                <LinkTo @route="cookbook.chapter" @model="reactivity">Why your grid doesn't update</LinkTo>.</strong>
            Autotracking only records reads made
            <em>during</em>
            the tracking frame. The grid's modifier reads the
            <code>getCellContent</code>
            <em>function</em>, then the engine calls it later, at paint time — so a closure that reads
            <code>@tracked</code>
            state lazily never registers a dependency. No error, no warning, no console message. The grid looks
            completely correct until your data changes and nothing happens.
            <code>recordsSource</code>
            inside a
            <code>@cached</code>
            getter is the fix; that chapter is why.
        </p>

        {{#each parts as |part|}}
            <section class="gdg-cookbook__index-part">
                <h2>{{part.title}}</h2>
                {{#each part.chapters as |chapter|}}
                    <LinkTo @route="cookbook.chapter" @model={{chapter.id}}>
                        <strong>{{chapter.title}}</strong>
                        <span>{{chapter.blurb}}</span>
                    </LinkTo>
                {{/each}}
            </section>
        {{/each}}
    </template>
);
