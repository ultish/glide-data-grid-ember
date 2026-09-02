import Route from "@ember/routing/route";
import { service } from "@ember/service";
import type RouterService from "@ember/routing/router-service";
import { chapterById, type CookbookChapterDef } from "test-app/utils/cookbook/chapters.ts";

export default class CookbookChapterRoute extends Route<CookbookChapterDef> {
    @service declare router: RouterService;

    override model(params: Record<string, unknown>): CookbookChapterDef {
        const chapter = chapterById(String(params["chapter"] ?? ""));
        if (chapter === undefined) {
            void this.router.replaceWith("cookbook");
            return chapterById("first-grid")!;
        }
        return chapter;
    }
}
