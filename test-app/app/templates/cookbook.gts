import Route from "ember-route-template";
import { pageTitle } from "ember-page-title";
import CookbookPage from "test-app/components/cookbook-page";

export default Route(
    <template>
        {{pageTitle "Cookbook"}}
        <CookbookPage>
            {{outlet}}
        </CookbookPage>
    </template>
);
