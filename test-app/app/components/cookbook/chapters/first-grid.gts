import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import PeopleTable, { PEOPLE_TABLE_RECIPE } from "test-app/components/cookbook/examples/people-table";

export default class FirstGridChapter extends Component {
    recipe = PEOPLE_TABLE_RECIPE;

    <template>
        <p>
            Ember 6 or 7, a
            <code>.gts</code>
            file, nothing else to wire. The addon imports its own CSS, registers its own cell types, and exposes one
            component.
        </p>

        <pre class="gdg-cookbook__code"><code>ember install glide-data-grid-ember</code></pre>

        <CookbookSection
            @title="The smallest thing that works"
            @blurb="A component class from the start, because everything later builds on this file. Click a cell, type, press Enter."
            @code={{this.recipe}}
        >
            <PeopleTable />
        </CookbookSection>

        <p class="gdg-cookbook__note">
            <strong>The grid sizes itself to its container and has no
                <code>width</code>/<code>height</code>
                args.</strong>
            A container with no height renders a zero-height grid. That is, by a wide margin, the most common "nothing
            appears". Check this before anything else.
        </p>

        <p>Three things are already true of that file, and each is the next chapter:</p>
        <ul>
            <li>
                <strong><code>@rows</code> is a count, not data.</strong>
                Nothing is materialised, nothing is copied, and the grid never sees
                <code>PEOPLE</code>. That is the pull model.
            </li>
            <li>
                <strong><code>getCellContent</code> is called by the paint loop</strong>, once per painted cell. What
                you are allowed to do inside it is not a style question.
            </li>
            <li>
                <strong><code>PEOPLE</code> is a module constant, so nothing can change.</strong>
                Making it change correctly is the part of this addon that has no error message when you get it wrong.
            </li>
        </ul>
    </template>
}
