import Route from "ember-route-template";
import { pageTitle } from "ember-page-title";
import DemoSwitcher from "test-app/components/demo-switcher";

export default Route(
    <template>
        {{pageTitle "GlideDataGrid Demo"}}

        <div style="width: 100vw; height: 100vh; box-sizing: border-box; padding: 8px;">
            {{! Natural (fractional) height, deliberately. A row of 13px system-ui buttons measures
                21.5px here, which leaves every grid below it on a fractional height -- the exact
                case that used to blank the canvas on damage-only repaints, fixed in Phase 8 (see
                `data-grid-render.ts`'s backing-size comment). Keeping it fractional means the demos
                keep exercising that path instead of tiptoeing around it. }}
            <div style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
                <DemoSwitcher />
                <div style="flex: 1 1 auto; min-height: 0;">
                    {{outlet}}
                </div>
            </div>
        </div>
    </template>
);
