import Route from "ember-route-template";
import { pageTitle } from "ember-page-title";
import DemoGrid from "test-app/components/demo-grid";

export default Route(
    <template>
        {{pageTitle "Full grid"}}
        <DemoGrid />
    </template>
);
