import Route from "@ember/routing/route";
import { service } from "@ember/service";
import type RouterService from "@ember/routing/router-service";

/** Unknown paths fall through here. Send them home rather than rendering an empty outlet. */
export default class NotFoundRoute extends Route {
    @service declare router: RouterService;

    override beforeModel(): void {
        void this.router.replaceWith("index");
    }
}
