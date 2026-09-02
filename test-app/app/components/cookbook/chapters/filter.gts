import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import FilterGrid, { FILTER_GRID_RECIPE } from "test-app/components/cookbook/examples/filter-grid";

export default class FilterChapter extends Component {
    recipe = FILTER_GRID_RECIPE;

    <template>
        <p>
            The addon has no filter API. You filter
            <strong>your</strong>
            records and pass a new
            <code>@rows</code>
            /
            <code>getCellContent</code>. Controls live outside the grid: chips, a text field, a slider, a date range —
            anything that produces a subset.
        </p>

        <p>
            This is not find-in-grid. Find highlights rows that stay in the table. Filter
            <em>removes</em>
            rows. The next chapter is find.
        </p>

        <CookbookSection
            @title="Buttons, a text field, and a slider"
            @blurb="200 in-memory people. The grid only ever sees the filtered subset. Record objects never get copied."
            @code={{this.recipe}}
        >
            <FilterGrid />
        </CookbookSection>

        <p>
            <code>.filter()</code>
            <strong>should</strong>
            allocate a new array here. Membership changed, so
            <code>recordsSource</code>
            should rebuild the row list. The record objects in
            <code>ALL</code>
            keep their identity, so a person who stays visible keeps their per-row cache.
        </p>

        <p class="gdg-cookbook__note">
            <strong>The wrong <code>.filter()</code>.</strong>
            Putting
            <code>this.people.filter(...)</code>
            inside a getter that also runs when you edit a single field — because the getter reads both the filter state
            <em>and</em>
            a tracked field on a person — busts every per-row cache on every keystroke. Keep the source array (
            <code>ALL</code>
            here) identity-stable forever. Filter in its own
            <code>@cached</code>
            getter that only reads filter state plus the source array. Edit fields on the records, not by mapping a new
            array of clones.
        </p>
    </template>
}
