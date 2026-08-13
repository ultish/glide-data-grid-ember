import type { Section } from "./types.ts";

export const rowGroupingSection: Section = {
    id: "row-grouping",
    title: "Grouping rows",
    blocks: [
        {
            kind: "p",
            text: "`@rowGrouping` puts collapsible header rows between your data rows. Turn it on in the Full grid demo with the “Row groups” toggle.",
        },
        {
            kind: "note",
            text: "**The grid does not draw group headers.** It only learns which rows are headers, so it can give them their own height and theme, keep the row-marker numbering from counting them, and optionally skip them during navigation. What a header row *looks like* is entirely up to your `@getCellContent` — which means a group header can be any cell type you like, including a custom one.",
        },
        {
            kind: "p",
            text: "That has one consequence you cannot skip: once grouping is on, the row index the grid hands you is no longer an index into your data. It counts header rows and omits the rows inside a collapsed group. Translate it first, on every single read.",
        },
        {
            kind: "code",
            text: `import { rowGroupingApi, updateRowGroupingByPath, getRowGroupingForPath } from "glide-data-grid-ember/rendering/index";
import type { RowGroup, RowGroupingOptions } from "glide-data-grid-ember/rendering/index";

class Demo extends Component {
    @tracked groups: readonly RowGroup[] = [
        { headerIndex: 0, isCollapsed: false },
        { headerIndex: 50, isCollapsed: false },
        { headerIndex: 100, isCollapsed: false },
    ];

    // @cached is load-bearing, not tidiness — see the note below.
    @cached
    get rowGrouping(): RowGroupingOptions {
        return { groups: this.groups, height: 44, navigationBehavior: "block" };
    }

    @cached
    get grouping() {
        // Same row count you pass as @rows, or the mapper and the grid disagree.
        return rowGroupingApi(this.rowGrouping, this.rows);
    }

    getCellContent = (item: Item): GridCell => {
        const { isGroupHeader, originalIndex, groupRows } = this.grouping.mapper(item[1]);

        if (isGroupHeader) {
            // Only the first column carries the label; the rest stay blank so the
            // band reads as a single strip.
            const text = item[0] === 0 ? \`Group of \${groupRows}\` : "";
            return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false };
        }

        // originalIndex — never item[1] — is the index into your own array.
        return this.rowsData[originalIndex];
    };

    // Collapsing is yours to apply; the grid never changes \`groups\` itself.
    handleCellClicked = (cell: Item): void => {
        const { isGroupHeader, path } = this.grouping.mapper(cell[1]);
        if (!isGroupHeader) return;
        const group = getRowGroupingForPath(this.groups, path);
        this.groups = updateRowGroupingByPath(this.groups, path, {
            isCollapsed: !(typeof group === "number" ? false : group.isCollapsed),
        });
    };
}`,
        },
        {
            kind: "note",
            text: "**`@cached` on the options getter is load-bearing.** The grid memoizes its whole grouping transform on that object's identity, and two of the values it derives are identity-compared when deciding whether a scroll can be blitted instead of repainted. A getter that rebuilt the object on every access would silently disable the scroll fast path — no error, no warning, nothing visibly different. Same rule as `@getRowThemeOverride`; see *Performance rules*.",
        },
        {
            kind: "p",
            text: "`headerIndex` is an index in your **flat, fully-expanded** row space, and it does not move as other groups collapse. The header occupies that slot, so a group at `headerIndex: 0` displaces your row 0 — its content starts at 1. Give `@rows` the fully-expanded count; the grid works out the collapsed one itself.",
        },
        {
            kind: "p",
            text: "What `mapper(row)` gives you:",
        },
        {
            kind: "table",
            head: ["Field", "Meaning"],
            rows: [
                ["`isGroupHeader`", "This row is a group header — draw the band, don't read your data."],
                [
                    "`originalIndex`",
                    "Index into your flat, fully-expanded array. **This is the one you read data with.**",
                ],
                ["`contentIndex`", "Index counting content rows only. What the row-marker column numbers with."],
                ["`groupIndex`", "Position within the owning group, header excluded."],
                ["`groupRows`", "How many content rows the owning group has."],
                ["`path`", "Sibling-index chain addressing the group — pass it to `updateRowGroupingByPath`."],
            ],
        },
        {
            kind: "p",
            text: "Nest groups by giving one `subGroups`. A subgroup's rows are carved out of its parent, so the parent runs only up to its first child's `headerIndex`; collapsing the parent hides the children whole.",
        },
        {
            kind: "p",
            text: "Two options control how the grid treats header rows during interaction:",
        },
        {
            kind: "table",
            head: ["Option", "Values", "Effect"],
            rows: [
                [
                    "`navigationBehavior`",
                    "`normal` · `skip-up` · `skip-down` · `skip` · `block`",
                    "Whether arrow keys step over header rows. `block` is `skip` plus refusing to select a header on click — while still firing `@onCellClicked`, which is what makes click-to-collapse work on one.",
                ],
                [
                    "`selectionBehavior`",
                    "`allow-spanning` · `block-spanning`",
                    "Whether a drag-selection may cross a group boundary. `block-spanning` clamps it to the group the drag started in.",
                ],
            ],
        },
        {
            kind: "p",
            text: "`height` sets every group header's row height (they all share one, as upstream), and `themeOverride` is merged over the grid theme for header rows only. With `@scaleToRem` on, `height` scales with the rest.",
        },
        {
            kind: "note",
            text: "**Row-marker numbers deliberately show gaps over a collapsed group.** The numbering follows `contentIndex`, which counts your fully-expanded content space — so a row keeps its number when a group above it folds, rather than everything below renumbering. Collapse the first group in the demo and the next group's rows still start in the thousands.",
        },
        {
            kind: "p",
            text: "One divergence from upstream worth knowing: React's `flattenRowGroups` computes each group's grid row index across hidden groups as well as visible ones, so collapsing a group that has subgroups makes every group header below it lose its `height`. This port assigns that index over the visible groups only, which makes it agree with the mapper by construction.",
        },
    ],
};
