import Component from "@glimmer/component";
import { LinkTo } from "@ember/routing";

export default class PerformanceChapter extends Component {
    <template>
        <p>
            <strong>Row count is not a performance problem.</strong>
            The grid is virtualised and pulls cells as it paints them, so 200,000 rows cost about what 20 do. If
            something feels slow, it is one of three things, and none of them is the row count.
        </p>

        <ul>
            <li>
                <strong>An identity-compared arg is being reallocated.</strong>
                The scroll fast path compares about eighteen inputs by
                <code>===</code>. One fresh allocation disables it permanently, with no error and
                <strong>no visual difference</strong>. Usually
                <code>@getCellContent</code>
                or
                <code>@theme</code>.
            </li>
            <li>
                <strong>There is real work inside <code>getCellContent</code>.</strong>
                It runs in the draw loop. Formatting, date parsing and nested-object walks belong in
                <code>toCell</code>, which is memoized.
            </li>
            <li>
                <strong>The records array is being reallocated on every change.</strong>
                <code>recordsSource</code>
                keys its per-row caches on that identity, so a
                <code>.map()</code>/<code>.filter()</code>
                that also runs on edit turns every keystroke into a full re-projection. Filter
                <em>state</em>
                changes should allocate; field edits should not.
            </li>
        </ul>

        <p>
            How to tell them apart: take a Performance profile while scrolling with nothing else happening. A healthy
            grid does very little per scroll frame. A full paint on every frame is the first item; a paint that is slow
            <em>once</em>
            is the second; a full re-projection on every keystroke is the third.
        </p>

        <h2>Identity-compared args</h2>
        <p>
            Each must be a
            <code>@cached</code>
            getter, a module-scope constant, or a stable instance field — never an inline arrow or object literal in the
            template, and never a plain (uncached) getter that reallocates:
        </p>

        <table class="gdg-cookbook__table">
            <thead>
                <tr>
                    <th>Arg</th>
                    <th>What goes wrong, and the fix</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>@getCellContent</code></td>
                    <td>A plain getter returning a fresh closure defeats blit on every read — use
                        <code>@cached</code>, a class-field arrow, or
                        <code>recordsSource</code></td>
                </tr>
                <tr>
                    <td><code>@theme</code></td>
                    <td>Build it once.
                        <code>getDataEditorDarkTheme()</code>
                        at module scope, or a
                        <code>@cached</code>
                        getter — not an object literal in the template</td>
                </tr>
                <tr>
                    <td><code>@getRowThemeOverride</code></td>
                    <td>A plain function reference.
                        <code>{{this.fnSnippet}}</code>
                        allocates a new one per render</td>
                </tr>
                <tr>
                    <td><code>@getCellRenderer</code> / <code>@extraCells</code></td>
                    <td>Pass
                        <code>allExtraCells</code>
                        (a module constant) or a
                        <code>@cached</code>
                        combination — not a fresh array literal</td>
                </tr>
                <tr>
                    <td><code>@prelightCells</code> / <code>@highlightRegions</code></td>
                    <td>Pass
                        <code>undefined</code>
                        for "none",
                        <strong>not</strong>
                        <code>[]</code>
                        — a fresh empty array is still a fresh identity</td>
                </tr>
                <tr>
                    <td><code>@columns</code></td>
                    <td>Replaced wholesale on resize/reorder, which is correct — just don't rebuild it per render</td>
                </tr>
            </tbody>
        </table>

        <pre class="gdg-cookbook__code"><code>{{this.identityCode}}</code></pre>

        <h2>When not to use tracking</h2>
        <p>
            Thousands of cells a second from a socket: bypass tracking with
            <code>updateCells()</code>
            from
            <code>@onReady</code>. That is the
            <LinkTo @route="cookbook.chapter" @model="streaming">streaming chapter</LinkTo>. It is not a fallback for a
            tracked grid that is not repainting.
        </p>

        <h2>Hi-DPI, wide grids</h2>
        <p>
            The canvas is painted at up to 5× device pixel ratio. On a Retina or 4K screen that is the per-frame fill
            cost —
            <code>@enableFirefoxRescaling</code>,
            <code>@enableSafariRescaling</code>
            and
            <code>@enableChromeRescaling</code>
            drop it
            <strong>while scrolling</strong>
            (to 1×, 2× and 1× respectively) and restore full resolution 200ms after the last scroll. Each only applies
            on its own browser, so switching all three on is the normal thing to do. The
            <LinkTo @route="full-grid">Full grid</LinkTo>
            has a toggle that drives all three.
        </p>

        <p class="gdg-cookbook__note">
            <code>@renderStrategy</code>
            is a diagnostic, not a tuning knob. The default already picks
            <code>"double-buffer"</code>
            on Safari and
            <code>"single-buffer"</code>
            elsewhere. Setting
            <code>"direct"</code>
            disables the scroll blit fast path and repaints every frame — useful for exactly one thing: if
            <code>"direct"</code>
            feels no slower than the default, the fast path was already disabled, and the cause is the first item in the
            list above.
        </p>
    </template>

    fnSnippet = "{{fn this.x ...}}";

    identityCode = `// ✗ a fresh closure on every read — the blit path is silently off, forever
get getCellContent() {
  return ([col, row]) => this.project(col, row);
}

// ✗ a fresh object on every render
<GlideDataGrid @theme={{hash accentColor="#4F5DFF"}} ... />

// ✓ stable: created once per component instance, at construction
getCellContent = ([col, row]: Item): GridCell => this.cells[row]?.[col] ?? BLANK;

const DARK = getDataEditorDarkTheme();
<GlideDataGrid @theme={{this.theme}} ... />   // this.theme is DARK or undefined, never a literal`;
}
