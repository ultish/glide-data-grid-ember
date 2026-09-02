// Landing page. `<GlideDemo>` rather than `<DemoGrid>` because it is the showcase and the cheaper
// grid — `<DemoGrid>` renders every cell type at once, which measured a p90 of ~5ms per draw
// against this one's fraction of that. See TODO.md 3b.
import Route from "ember-route-template";
import GlideDemo from "test-app/components/glide-demo";

export default Route(<template><GlideDemo /></template>);
