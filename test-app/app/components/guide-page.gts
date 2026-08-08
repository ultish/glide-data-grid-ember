// The **Guide** tab (Phase 11): the narrative document, read in order, one running example carried
// from chapter 1 to chapter 11.
//
// Why this exists as a second tab rather than as more cookbook chapters — the diagnosis was
// structural, not a writing-quality problem. A cookbook is *task-indexed*: you arrive knowing you
// want context menus, jump to that recipe, and each recipe stands alone. A guide is *narrative*: you
// arrive knowing nothing and are walked from zero to a working integration. One artifact was doing
// both jobs, and the Ember-idioms material is the proof that it could not: the pull model vs
// `@tracked`, class-field arrows being identity-stable, `@cached` getters, `registerDestructor`
// teardown, Ember Data live arrays keeping one identity forever. Those are cross-cutting rules that
// apply to *every* recipe. There is no recipe for "don't let your array identity go stale" — it is
// something you must understand before recipe 1.
//
// Chapters live one-per-file in `app/utils/guide/`, ordered by that directory's `index.ts`.
// Rendering is `<DocsPage>`, shared with the cookbook.
import Component from "@glimmer/component";
import DocsPage from "test-app/components/docs-page";
import { GUIDE_SECTIONS } from "../utils/guide/index.ts";

const TITLE = "Using `<GlideDataGrid>` in an Ember app";

const LEDE =
    "Zero to a working integration, in order, carrying one example the whole way. Read it once and " +
    "the **Cookbook** tab becomes a reference you can skim. Most of what is here is not about the " +
    "grid's API at all — it is about how a canvas that *pulls* its data meets Ember's autotracking, " +
    "which is the part with no error messages.";

const TOC_NOTE =
    "Task-indexed recipes live in the **Cookbook** tab — columns, selection, search, context menus, " +
    "custom cell types. This guide does not restate them, and they do not restate this guide: there " +
    "is exactly one copy of everything, and chapter 11 is the map between the two.";

export default class GuidePage extends Component {
    readonly sections = GUIDE_SECTIONS;

    <template>
        <DocsPage
            @title={{TITLE}}
            @lede={{LEDE}}
            @tocTitle="Guide"
            @tocNote={{TOC_NOTE}}
            @sections={{this.sections}}
            @testId="guide"
        />
    </template>
}
