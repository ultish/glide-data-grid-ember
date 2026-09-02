import EmberRouter from "@embroider/router";
import config from "test-app/config/environment";

export default class Router extends EmberRouter {
    location = config.locationType;
    rootURL = config.rootURL;
}

Router.map(function () {
    this.route("full-grid");
    this.route("cookbook", function () {
        this.route("chapter", { path: "/:chapter" });
    });
    // Old demo-tab URLs. Route classes replaceWith the cookbook chapter that replaced them.
    this.route("tracking");
    this.route("streaming");
    this.route("composed");
    this.route("async");
    this.route("apollo");
    this.route("daisy");
    this.route("shadow");
    this.route("guide");
    this.route("not-found", { path: "/*path" });
});
