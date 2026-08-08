// The cookbook's content model. See `app/components/cookbook-page.gts` for the renderer.
//
// Content is plain data rather than markup for two reasons: code samples containing `{{ }}` would
// otherwise be parsed as Glimmer, and keeping prose as data means editing a recipe is editing one
// string rather than surgery on markup.
//
// One chapter per file in this directory, assembled in order by `index.ts`. Chapter titles carry
// **no leading number** — the page numbers them from their position, so inserting a chapter is a
// one-line edit to `index.ts` instead of a renumbering sweep across every file.

export type Block =
    | { kind: "p"; text: string }
    | { kind: "code"; text: string }
    | { kind: "list"; items: readonly string[] }
    | { kind: "note"; text: string }
    | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }
    | { kind: "live" };

export interface Section {
    readonly id: string;
    readonly title: string;
    readonly blocks: readonly Block[];
}
