import Route from "ember-route-template";
import { pageTitle } from "ember-page-title";
import type { CookbookChapterDef } from "test-app/utils/cookbook/chapters.ts";

interface Signature {
    Args: {
        model: CookbookChapterDef;
    };
}

export default Route<Signature>(
    <template>
        {{pageTitle @model.title}}
        <header class="gdg-cookbook__intro">
            <h1>{{@model.title}}</h1>
            <p>{{@model.blurb}}</p>
        </header>
        <@model.component />
    </template>
);
