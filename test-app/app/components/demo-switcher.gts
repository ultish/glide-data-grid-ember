// Tab switcher between the demos. Exists as a component rather than living in
// `app/templates/application.gts` because that template uses `ember-route-template`'s classless
// `Route(<template>)` form, which has no backing class to hold `@tracked` state.
//
//   - "Full grid"      -> `<DemoGrid>`: 200k rows, every cell type, resize/reorder, theming.
//   - "Tracking proof" -> `<TrackingDemo>`: small model-store-backed table + edit form, proving
//                          `@tracked` mutations repaint the canvas with no imperative redraw.
//   - "Glide demo"     -> `<GlideDemo>`: Phase 7c's replica of grid.glideapps.com's demo grid --
//                          column group headers, row markers, sparklines, and the consumer-built
//                          column sort menu.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import DemoGrid from "test-app/components/demo-grid";
import TrackingDemo from "test-app/components/tracking-demo";
import GlideDemo from "test-app/components/glide-demo";

type DemoTab = "full-grid" | "tracking" | "glide";

export default class DemoSwitcher extends Component {
    @tracked tab: DemoTab = "full-grid";

    @action showFullGrid(): void {
        this.tab = "full-grid";
    }

    @action showTrackingDemo(): void {
        this.tab = "tracking";
    }

    @action showGlideDemo(): void {
        this.tab = "glide";
    }

    get isFullGrid(): boolean {
        return this.tab === "full-grid";
    }

    get isTracking(): boolean {
        return this.tab === "tracking";
    }

    get isGlide(): boolean {
        return this.tab === "glide";
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
                <button type="button" data-test-show-glide {{on "click" this.showGlideDemo}}>
                    Glide demo grid
                </button>
            </div>
            <div style="flex: 1 1 auto; min-height: 0;">
                {{#if this.isTracking}}
                    <TrackingDemo />
                {{else if this.isGlide}}
                    <GlideDemo />
                {{else}}
                    <DemoGrid />
                {{/if}}
            </div>
        </div>
    </template>
}
