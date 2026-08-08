import type { Section } from "./types.ts";

export const searchSection: Section = {
    id: "search",
    title: "Search",
    blocks: [
        { kind: "p", text: "Two shapes, both driving the same engine. Take either — or both, as the full grid demo does." },
        { kind: "p", text: "**The addon's bar**, rendered in the grid's own block so it inherits the grid's CSS and theme. Cmd/Ctrl+F opens it; nothing else to write." },
        {
            kind: "code",
            text: `import GlideSearchBar from "glide-data-grid-ember/components/glide-search-bar";

<GlideDataGrid @columns={{this.columns}} ... as |grid|>
  <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
</GlideDataGrid>`,
        },
        { kind: "p", text: "**Your own input**, anywhere in your app:" },
        {
            kind: "code",
            text: `<input value={{this.searchValue}} {{on "input" this.handleSearchInput}} />

<GlideDataGrid
  @showSearch={{true}}          {{! required: highlighting is gated on search being open }}
  @onReady={{this.handleReady}}
  @onSearchStateChange={{this.handleSearchState}}
  ...
/>

@action handleReady(api) { this.gridApi = api; }
@action handleSearchState(state) { this.searchState = state; }
@action handleSearchInput(ev) { this.gridApi?.setSearchValue(ev.target.value); }
// this.gridApi.searchNext() / .searchPrev() / .closeSearch()`,
        },
        {
            kind: "list",
            items: [
                "`@showSearch={{true}}` takes control of visibility, so Escape and Cmd/Ctrl+F stop toggling it.",
                "The scan is incremental and chunked, so it doesn't block on a large grid.",
                "`RowID` cells are deliberately not searchable, matching upstream.",
            ],
        },
    ],
};
