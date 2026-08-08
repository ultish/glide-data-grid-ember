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
//   - "Streaming"      -> `<StreamingDemo>`: Phase 8's high-frequency demo -- a non-tracked buffer
//                          + imperative `updateCells()` at thousands of cells/sec, with measured
//                          throughput and repaint timings.
//   - "DaisyUI theme"  -> `<DaisyDemo>`: Phase 9's CSS-variable theming bridge -- DaisyUI 5's
//                          oklch() palette driving the canvas, switching live via `data-theme`.
//   - "Cookbook"       -> `<CookbookPage>`: Phase 10b's consumer guide, as a live page rather than
//                          a markdown file, so it deploys with the demos it describes.
//   - "Async paging"   -> `<AsyncDemo>`: Phase 8's `AsyncRecordsSource` -- 100k rows that aren't in
//                          memory, fetched a page at a time as `@onVisibleRegionChanged` reports
//                          what's on screen, each arrival repainted by damage.
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import DemoGrid from 'test-app/components/demo-grid';
import TrackingDemo from 'test-app/components/tracking-demo';
import GlideDemo from 'test-app/components/glide-demo';
import StreamingDemo from 'test-app/components/streaming-demo';
import AsyncDemo from 'test-app/components/async-demo';
import DaisyDemo from 'test-app/components/daisy-demo';
import CookbookPage from 'test-app/components/cookbook-page';

type DemoTab =
  'full-grid' | 'tracking' | 'glide' | 'streaming' | 'async' | 'daisy' | 'cookbook';

export default class DemoSwitcher extends Component {
  @tracked tab: DemoTab = 'full-grid';

  showFullGrid = (): void => {
    this.tab = 'full-grid';
  };

  showTrackingDemo = (): void => {
    this.tab = 'tracking';
  };

  showGlideDemo = (): void => {
    this.tab = 'glide';
  };

  showStreamingDemo = (): void => {
    this.tab = 'streaming';
  };

  showAsyncDemo = (): void => {
    this.tab = 'async';
  };

  showDaisyDemo = (): void => {
    this.tab = 'daisy';
  };

  showCookbook = (): void => {
    this.tab = 'cookbook';
  };

  get isDaisy(): boolean {
    return this.tab === 'daisy';
  }

  get isFullGrid(): boolean {
    return this.tab === 'full-grid';
  }

  get isTracking(): boolean {
    return this.tab === 'tracking';
  }

  get isGlide(): boolean {
    return this.tab === 'glide';
  }

  get isStreaming(): boolean {
    return this.tab === 'streaming';
  }

  get isAsync(): boolean {
    return this.tab === 'async';
  }

  get isCookbook(): boolean {
    return this.tab === 'cookbook';
  }

  <template>
    <div style="display: flex; flex-direction: column; height: 100%; gap: 8px;">
      {{! Natural (fractional) height, deliberately. A row of 13px system-ui buttons measures
    21.5px here, which leaves every grid below it on a fractional height -- the exact
    case that used to blank the canvas on damage-only repaints, fixed in Phase 8 (see
    `data-grid-render.ts`'s backing-size comment). Keeping it fractional means the demos
    keep exercising that path instead of tiptoeing around it. }}
      <div
        style="flex: 0 0 auto; display: flex; gap: 6px; align-items: center; font: 13px system-ui;"
      >
        <button
          class="btn btn-xs btn-ghost {{if this.isFullGrid 'btn-active'}}"
          type="button"
          data-test-show-full-grid
          {{on "click" this.showFullGrid}}
        >
          Full grid demo
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isTracking 'btn-active'}}"
          type="button"
          data-test-show-tracking
          {{on "click" this.showTrackingDemo}}
        >
          Tracking proof demo
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isGlide 'btn-active'}}"
          type="button"
          data-test-show-glide
          {{on "click" this.showGlideDemo}}
        >
          Glide demo grid
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isStreaming 'btn-active'}}"
          type="button"
          data-test-show-streaming
          {{on "click" this.showStreamingDemo}}
        >
          Streaming updates
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isAsync 'btn-active'}}"
          type="button"
          data-test-show-async
          {{on "click" this.showAsyncDemo}}
        >
          Async paging
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isDaisy 'btn-active'}}"
          type="button"
          data-test-show-daisy
          {{on "click" this.showDaisyDemo}}
        >
          DaisyUI theming
        </button>
        <button
          class="btn btn-xs btn-ghost {{if this.isCookbook 'btn-active'}}"
          type="button"
          data-test-show-cookbook
          {{on "click" this.showCookbook}}
        >
          Cookbook
        </button>
      </div>
      <div style="flex: 1 1 auto; min-height: 0;">
        {{#if this.isTracking}}
          <TrackingDemo />
        {{else if this.isGlide}}
          <GlideDemo />
        {{else if this.isStreaming}}
          <StreamingDemo />
        {{else if this.isAsync}}
          <AsyncDemo />
        {{else if this.isDaisy}}
          <DaisyDemo />
        {{else if this.isCookbook}}
          <CookbookPage />
        {{else}}
          <DemoGrid />
        {{/if}}
      </div>
    </div>
  </template>
}
