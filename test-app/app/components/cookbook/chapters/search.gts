import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import {
    AddonSearchGrid,
    ExternalSearchGrid,
    ADDON_SEARCH_RECIPE,
    EXTERNAL_SEARCH_RECIPE,
} from "test-app/components/cookbook/examples/search-grids";

export default class SearchChapter extends Component {
    addonRecipe = ADDON_SEARCH_RECIPE;
    externalRecipe = EXTERNAL_SEARCH_RECIPE;
    externalBlurb =
        "@showSearch={{true}} takes control of visibility, so Escape and Cmd/Ctrl+F stop toggling it. You own next / prev / close.";

    <template>
        <p>
            Find-in-grid highlights matching cells and walks them. It does not hide rows — that is
            the previous chapter. Two shapes, both driving the same engine.
        </p>

        <CookbookSection
            @title="The addon's bar"
            @blurb="Cmd/Ctrl+F opens it. Render it in the grid's block so it inherits the grid's CSS and theme. Type Hopper."
            @code={{this.addonRecipe}}
        >
            <AddonSearchGrid />
        </CookbookSection>

        <CookbookSection
            @title="Your own input, anywhere"
            @blurb={{this.externalBlurb}}
            @code={{this.externalRecipe}}
        >
            <ExternalSearchGrid />
        </CookbookSection>

        <ul>
            <li>The scan is incremental and chunked, so it does not block on a large grid.</li>
            <li><code>RowID</code> cells are deliberately not searchable, matching upstream.</li>
            <li>
                <code>&lt;GlideSearchBar&gt;</code>
                only works inside the grid's block — its stylesheet is scoped under
                <code>.gdg-root</code>
                and its colours come from
                <code>--gdg-*</code>
                on that element.
            </li>
        </ul>
    </template>
}
