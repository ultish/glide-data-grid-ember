import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import ColumnsGrid, { COLUMNS_GRID_RECIPE } from "test-app/components/cookbook/examples/columns-grid";

export default class ColumnsChapter extends Component {
    recipe = COLUMNS_GRID_RECIPE;

    <template>
        <p>
            Drag the Name / Email / Notes / Score separators. Name is frozen. Notes has
            <code>grow: 1</code>
            so it takes leftover width. Score is in a
            <code>group</code>, which is what turns on the second header row.
        </p>

        <CookbookSection
            @title="Freeze, grow, group, resize"
            @blurb="You own column state. onColumnResize writes newSize back into the array — writing newSizeWithGrow back would grow the column again on the next layout."
            @code={{this.recipe}}
        >
            <ColumnsGrid />
        </CookbookSection>

        <ul>
            <li>
                A column
                <strong>with</strong>
                <code>width</code>
                is fixed. A column
                <strong>without</strong>
                one is auto-sized: the grid measures a sample of its cells plus its title, clamped
                by
                <code>@minColumnWidth</code>
                /
                <code>@maxColumnWidth</code>
                (default 50 / 500). There is no
                <code>width: "auto"</code>.
            </li>
            <li>
                <code>grow</code>
                is orthogonal to
                <code>width</code>, not an alternative. A fixed-width column with
                <code>grow: 1</code>
                is how you say "take the slack".
            </li>
            <li>
                <code>group</code>
                turns on the second header row automatically. Set it on any column and the band
                appears.
            </li>
            <li>
                <code>hasMenu</code>
                draws the chevron and fires
                <code>@onHeaderMenuClick</code>. The callback reports the column index in
                <strong>your</strong>
                space — the row-marker column is already subtracted.
            </li>
            <li>
                Resize and reorder are notifications. Write the new
                <code>columns</code>
                array back yourself or nothing sticks.
            </li>
        </ul>
    </template>
}
