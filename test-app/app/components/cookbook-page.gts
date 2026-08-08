// The **Cookbook** tab: task-indexed recipes, each one standing alone.
//
// It lives in the test-app on purpose: this app is what gets deployed, so the cookbook ships with
// the demos it describes, and the "one-line render" recipe at the top is an actual live grid rather
// than a screenshot of one.
//
// Phase 11 gave it a sibling. The **Guide** tab (`app/components/guide-page.gts`) is the *narrative*
// document — zero to a working integration, in order, one running example. This one is the *index*:
// you arrive knowing what you want and jump to it. The rule between them, and the whole reason the
// split happened, is **exactly one copy of everything**: where a recipe here needs the mechanism
// explained, it links into the guide rather than restating it.
//
// The chapters live one-per-file in `app/utils/cookbook/`, ordered by that directory's `index.ts`.
// Rendering is `<DocsPage>`, shared with the guide.
import Component from "@glimmer/component";
import DocsPage from "test-app/components/docs-page";
import { SECTIONS } from "../utils/cookbook/index.ts";

const TITLE = "Recipes for `<GlideDataGrid>`";

const LEDE =
    "Task-indexed and copy-pasteable: find the thing you want to do, take the recipe, move on. " +
    "They are lifted from the demos in the other tabs — so if a recipe here stops working, a demo " +
    "stops working. If you are starting from nothing, read the **Guide** tab first instead; it is " +
    "the same material in narrative order, and these recipes assume it.";

const TOC_NOTE =
    "Reading order lives in the **Guide** tab — the pull model, the reactivity rules, wiring real " +
    "data, and the identity rules that have no error message. This tab does not restate any of it; " +
    "it links there. Every other tab above is a working demo of something described in one of the two.";

export default class CookbookPage extends Component {
    readonly sections = SECTIONS;

    <template>
        <DocsPage
            @title={{TITLE}}
            @lede={{LEDE}}
            @tocTitle="Cookbook"
            @tocNote={{TOC_NOTE}}
            @sections={{this.sections}}
            @testId="cookbook"
        />
    </template>
}
