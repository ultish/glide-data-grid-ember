import Route from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import GlideDataGrid from 'glide-data-grid-ember/components/glide-data-grid';
import { demoColumns, demoGetCellContent, DEMO_ROW_COUNT } from 'test-app/utils/demo-data';

export default Route(
  <template>
    {{pageTitle "GlideDataGrid Demo"}}

    <div style="width: 100vw; height: 100vh; box-sizing: border-box; padding: 8px;">
      <GlideDataGrid
        @columns={{demoColumns}}
        @getCellContent={{demoGetCellContent}}
        @rows={{DEMO_ROW_COUNT}}
      />
    </div>

    {{outlet}}
  </template>
);
