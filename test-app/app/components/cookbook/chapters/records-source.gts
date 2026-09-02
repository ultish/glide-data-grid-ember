import Component from "@glimmer/component";
import CookbookSection from "test-app/components/cookbook-section";
import TrackedPeople, { TRACKED_PEOPLE_RECIPE } from "test-app/components/cookbook/examples/tracked-people";

export default class RecordsSourceChapter extends Component {
    recipe = TRACKED_PEOPLE_RECIPE;

    <template>
        <p>
            If your rows are in memory — Ember Data, a tracked class, a store you own — this is what you write. Not a
            starter template you outgrow:
            <code>recordsSource</code>
            in a
            <code>@cached</code>
            getter is the same file at 8 rows and at 200,000. The only times you skip it are paging and a firehose, and
            those are facts about the data, not a row count.
        </p>

        <p>
            It takes your array and returns the args the grid wants. The previous chapter's eager read and a per-record
            cache are already inside. Edit a cell, or add a row:
        </p>

        <CookbookSection
            @title="Tracked records, no imperative redraw"
            @blurb="Mutate a field in place to repaint that cell. Replace the array to add a row."
            @code={{this.recipe}}
        >
            <TrackedPeople />
        </CookbookSection>

        <p>
            Note the singular/plural: you write the
            <strong>per-record</strong>
            <code>onCellEdited</code>, which receives the actual record object, and get back the batched, index-based
            <code>onCellsEdited</code>
            the grid wants. It is
            <code>undefined</code>
            if and only if you passed no
            <code>onCellEdited</code>, so a read-only grid needs no handler at all.
        </p>

        <p><strong>Four rules. All four are mechanical, not style.</strong></p>
        <ul>
            <li>
                <strong>Call it inside a tracked computation</strong>
                — a
                <code>@cached</code>
                getter is the idiomatic place.
                <code>recordsSource</code>
                projects every row
                <em>during the call</em>, and those reads are what register your records'
                <code>@tracked</code>
                fields as dependencies of the frame that repaints the grid. Call it from a constructor or an event
                handler and nothing will ever update.
            </li>
            <li>
                <strong><code>toCell</code> must be identity-stable</strong>
                — module scope, a class-field arrow, or a bound method. Not an arrow allocated inline inside the getter.
                The per-row caches close over it, so a fresh identity rebuilds all of them.
            </li>
            <li>
                <strong>Replace the <code>records</code> array; mutate the records.</strong>
                Mutating a record's
                <code>@tracked</code>
                fields in place is the supported way to change data. Adding, removing or reordering rows must produce a
                <strong>new array</strong>
                — an in-place
                <code>push</code>/<code>splice</code>
                keeps the array's identity and will be missed.
            </li>
            <li>
                <strong>Put formatting and nested-data digging in
                    <code>toCell</code>, never in
                    <code>getCellContent</code>.</strong>
                <code>toCell</code>
                runs once per record and is memoized;
                <code>getCellContent</code>
                is on the paint path and
                <code>recordsSource</code>
                reduces it to a single array index.
            </li>
        </ul>

        <p class="gdg-cookbook__note">
            <strong>The one way to break it.</strong>
            The per-row caches are keyed on the records
            <strong>array identity</strong>. Derive
            <code>records</code>
            from something that reallocates on every edit — a
            <code>.map()</code>, a
            <code>.filter()</code>
            in a getter that also runs when a field edits, a fresh array literal in a plain (uncached) getter — and
            every per-row cache resets on every change. You are then back to full recomputation with extra machinery on
            top. Filtering
            <em>is</em>
            supposed to allocate a new array (membership changed). That is the next data chapter. Filtering as a side
            effect of an edit is the bug.
        </p>
    </template>
}
