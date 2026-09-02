import Route from "@ember/routing/route";
import { service } from "@ember/service";
import type RouterService from "@ember/routing/router-service";

/** Old demo-tab URLs (`/daisy`, `/guide`, …) land on the cookbook chapter that replaced them. */
export function redirectTo(routeName: string, model?: string): typeof Route {
    class RedirectRoute extends Route {
        @service declare router: RouterService;

        override beforeModel(): void {
            if (model === undefined) {
                void this.router.replaceWith(routeName);
            } else {
                void this.router.replaceWith(routeName, model);
            }
        }
    }
    return RedirectRoute as typeof Route;
}
