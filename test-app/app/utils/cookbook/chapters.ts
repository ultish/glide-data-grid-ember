import type { ComponentLike } from "@glint/template";
import FirstGrid from "test-app/components/cookbook/chapters/first-grid";
import PullModel from "test-app/components/cookbook/chapters/pull-model";
import Reactivity from "test-app/components/cookbook/chapters/reactivity";
import RecordsSource from "test-app/components/cookbook/chapters/records-source";
import Columns from "test-app/components/cookbook/chapters/columns";
import Interactions from "test-app/components/cookbook/chapters/interactions";
import Filter from "test-app/components/cookbook/chapters/filter";
import Search from "test-app/components/cookbook/chapters/search";
import Async from "test-app/components/cookbook/chapters/async";
import Streaming from "test-app/components/cookbook/chapters/streaming";
import Apollo from "test-app/components/cookbook/chapters/apollo";
import Daisy from "test-app/components/cookbook/chapters/daisy";
import Performance from "test-app/components/cookbook/chapters/performance";

export interface CookbookChapterDef {
    readonly id: string;
    readonly title: string;
    readonly blurb: string;
    readonly part: string;
    readonly component: ComponentLike;
}

export const PARTS: readonly { id: string; title: string }[] = [
    { id: "start", title: "Get a grid on screen" },
    { id: "data", title: "Data in, data out" },
    { id: "look", title: "Look, then speed" },
];

export const CHAPTERS: readonly CookbookChapterDef[] = [
    {
        id: "first-grid",
        title: "Install and render",
        blurb: "Ember 6 or 7, a .gts file, a container with a height.",
        part: "start",
        component: FirstGrid,
    },
    {
        id: "pull-model",
        title: "The pull model",
        blurb: "@rows is a count. getCellContent is an array index, never a computation.",
        part: "start",
        component: PullModel,
    },
    {
        id: "reactivity",
        title: "Why your grid doesn't update",
        blurb: "The grid reads the function, not your data. The getCellContent you will write first never repaints.",
        part: "start",
        component: Reactivity,
    },
    {
        id: "records-source",
        title: "The recommended Ember pattern",
        blurb: "recordsSource in a @cached getter. Write it this way at 8 rows and at 200,000.",
        part: "start",
        component: RecordsSource,
    },
    {
        id: "columns",
        title: "Columns",
        blurb: "Freeze, grow, group, resize. You own column state.",
        part: "start",
        component: Columns,
    },
    {
        id: "interactions",
        title: "Select, edit, add, delete",
        blurb: "Row / cell / column selection, checkbox clicks that mutate a record, add row, delete row.",
        part: "start",
        component: Interactions,
    },
    {
        id: "filter",
        title: "Filter from outside the grid",
        blurb: "Buttons, a text field, a slider. The addon has no filter API — you filter your records.",
        part: "data",
        component: Filter,
    },
    {
        id: "search",
        title: "Find in the grid",
        blurb: "The addon's bar, or your own input. Highlights, does not hide rows.",
        part: "data",
        component: Search,
    },
    {
        id: "async",
        title: "Data you don't hold",
        blurb: "100k paged rows. AsyncRecordsSource plus onVisibleRegionChanged.",
        part: "data",
        component: Async,
    },
    {
        id: "streaming",
        title: "Thousands of cells a second",
        blurb: "A non-tracked buffer and updateCells. Autotracking is the wrong tool here.",
        part: "data",
        component: Streaming,
    },
    {
        id: "apollo",
        title: "GraphQL and glimmer-apollo",
        blurb: "Copy the glimmer-apollo file. The live example fakes InMemoryCache so the identity lesson is visible.",
        part: "data",
        component: Apollo,
    },
    {
        id: "daisy",
        title: "DaisyUI and CSS variables",
        blurb: "CssThemeWatcher maps your design tokens onto the canvas Theme.",
        part: "look",
        component: Daisy,
    },
    {
        id: "performance",
        title: "Performance",
        blurb: "Row count is not the problem. Identity, work on the paint path, and a reallocating records array are.",
        part: "look",
        component: Performance,
    },
];

export function chapterById(id: string): CookbookChapterDef | undefined {
    return CHAPTERS.find(c => c.id === id);
}

export function chaptersByPart(): readonly { id: string; title: string; chapters: readonly CookbookChapterDef[] }[] {
    return PARTS.map(part => ({
        ...part,
        chapters: CHAPTERS.filter(c => c.part === part.id),
    }));
}
