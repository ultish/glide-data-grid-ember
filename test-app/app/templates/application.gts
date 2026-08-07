import Route from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import DemoGrid from 'test-app/components/demo-grid';

export default Route(
  <template>
    {{pageTitle "GlideDataGrid Demo"}}

    <div style="width: 100vw; height: 100vh; box-sizing: border-box; padding: 8px;">
      <DemoGrid />
    </div>

    {{outlet}}
  </template>
);
