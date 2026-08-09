import Route from "ember-route-template";
import { pageTitle } from "ember-page-title";
import DemoSwitcher from "test-app/components/demo-switcher";

export default Route(
    <template>
        {{pageTitle "GlideDataGrid Demo"}}

        <div style="width: 100vw; height: 100vh; box-sizing: border-box; padding: 8px;">
            <DemoSwitcher />
        </div>

        {{outlet}}
    </template>
);
