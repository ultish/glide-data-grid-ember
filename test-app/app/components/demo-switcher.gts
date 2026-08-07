// Tab switcher between the two demos. Exists as a component rather than living in
// `app/templates/application.gts` because that template uses `ember-route-template`'s classless
// `Route(<template>)` form, which has no backing class to hold `@tracked` state.
//
//   - "Full grid"      -> `<DemoGrid>`: 200k rows, every cell type, resize/reorder, theming.
//   - "Tracking proof" -> `<TrackingDemo>`: small model-store-backed table + edit form, proving
//                          `@tracked` mutations repaint the canvas with no imperative redraw.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import DemoGrid from "test-app/components/demo-grid";
import TrackingDemo from "test-app/components/tracking-demo";

export default class DemoSwitcher extends Component {
    @tracked showTracking = false;

    @action showFullGrid(): void {
        this.showTracking = false;
    }

    @action showTrackingDemo(): void {
        this.showTracking = true;
    }

    <template>
        <div style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
            <div style="flex: 0 0 auto; display: flex; gap: 6px; font: 13px system-ui;">
                <button type="button" data-test-show-full-grid {{on "click" this.showFullGrid}}>
                    Full grid demo
                </button>
                <button type="button" data-test-show-tracking {{on "click" this.showTrackingDemo}}>
                    Tracking proof demo
                </button>
            </div>
            <div style="flex: 1 1 auto; min-height: 0;">
                {{#if this.showTracking}}
                    <TrackingDemo />
                {{else}}
                    <DemoGrid />
                {{/if}}
            </div>
        </div>
    </template>
}
