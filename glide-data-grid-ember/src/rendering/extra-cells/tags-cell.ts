// Ported from `packages/cells/src/cells/tags-cell.tsx` (Phase 5b of the Ember port). Unlike
// `bubble-cell.ts` (Phase 4c, read-only chip list), this cell IS editable -- but source's own
// editor is *already* a plain checkbox list (no `react-select` involved at all for this
// particular cell, unlike dropdown/multi-select below), so this is a near-verbatim port, not a
// simplification. Draw reuses the same already-ported `roundedRect`/`measureTextCached`/
// `getMiddleCenterBias` primitives `bubble-cell.ts`/`drilldown-cell.ts` already established.
//
// This is a `CustomRenderer<CustomCell<Props>>` (see PORTING-NOTES.md's Phase 5 research section
// for why -- source's `packages/cells` package registers cells via `CustomRenderer`/`isMatch`,
// not a new `GridCellKind` enum member like Phase 4's built-ins).
import { GridCellKind, type CustomCell, type Rectangle } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias, measureTextCached, roundedRect } from "../render/data-grid-lib.ts";

export interface TagsCellProps {
    readonly kind: "tags-cell";
    readonly tags: readonly string[];
    readonly possibleTags: readonly { tag: string; color: string }[];
}

export type TagsCell = CustomCell<TagsCellProps>;

export const tagsCellRenderer: CustomRenderer<TagsCell> = {
    kind: GridCellKind.Custom,
    isMatch: (c): c is TagsCell => (c.data as { kind?: unknown }).kind === "tags-cell",
    draw: (args, cell) => {
        const { ctx, theme, rect } = args;
        const { possibleTags, tags } = cell.data;

        const drawArea: Rectangle = {
            x: rect.x + theme.cellHorizontalPadding,
            y: rect.y + theme.cellVerticalPadding,
            width: rect.width - 2 * theme.cellHorizontalPadding,
            height: rect.height - 2 * theme.cellVerticalPadding,
        };
        const tagHeight = theme.bubbleHeight;
        const innerPad = theme.bubblePadding;
        const rows = Math.max(1, Math.floor(drawArea.height / (tagHeight + innerPad)));

        let x = drawArea.x;
        let row = 1;
        let y = drawArea.y + (drawArea.height - rows * tagHeight - (rows - 1) * innerPad) / 2;
        for (const tag of tags) {
            const color = possibleTags.find(t => t.tag === tag)?.color ?? theme.bgBubble;

            ctx.font = `12px ${theme.fontFamily}`;
            const metrics = measureTextCached(tag, ctx, `12px ${theme.fontFamily}`);
            const width = metrics.width + innerPad * 2;
            const textY = tagHeight / 2;

            if (x !== drawArea.x && x + width > drawArea.x + drawArea.width && row < rows) {
                row++;
                y += tagHeight + innerPad;
                x = drawArea.x;
            }

            ctx.fillStyle = color;
            ctx.beginPath();
            roundedRect(ctx, x, y, width, tagHeight, theme.roundingRadius ?? tagHeight / 2);
            ctx.fill();

            ctx.fillStyle = theme.textDark;
            ctx.fillText(tag, x + innerPad, y + textY + getMiddleCenterBias(ctx, `12px ${theme.fontFamily}`));

            x += width + 8;
            if (x > drawArea.x + drawArea.width && row >= rows) break;
        }

        return true;
    },
    provideEditor: () => p => buildTagsEditor(p),
    onPaste: (v, d) => ({
        ...d,
        tags: d.possibleTags
            .map(x => x.tag)
            .filter(x =>
                v
                    .split(",")
                    .map(s => s.trim())
                    .includes(x)
            ),
    }),
};

// Port of source's `EditorWrap` checkbox-list editor as a plain stateful DOM factory instead of a
// `styled.div` + React component -- same `CellEditorProps`/`CellEditorHandle` contract every other
// editor in this port uses (see `data-grid-types.ts`'s doc comments, PORTING-NOTES.md's Phase 4a
// section). No `react-select` dependency needed here since source itself never used one for this
// cell. Source's `EditorWrap` Linaria block is ported as plain CSS in
// `src/components/glide-data-grid-extra-cell-editors.css`, keeping source's own
// `gdg-pill`/`gdg-selected`/`gdg-unselected`/`gdg-readonly` class names.
function buildTagsEditor(p: CellEditorProps<TagsCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    const { possibleTags, tags } = p.value.data;

    const container = document.createElement("div");
    // `gdg-readonly` is source's own marker class; it is what switches the rows' cursor off.
    container.className = readonly ? "gdg-tags-editor gdg-readonly" : "gdg-tags-editor";

    let firstInput: HTMLInputElement | undefined;

    for (const t of possibleTags) {
        const selected = tags.includes(t.tag);

        const label = document.createElement("label");

        if (!readonly) {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = selected;
            input.addEventListener("change", () => {
                const currentTags = p.value.data.tags;
                const newTags = currentTags.includes(t.tag)
                    ? currentTags.filter(x => x !== t.tag)
                    : [...currentTags, t.tag];
                p.onChange({ ...p.value, data: { ...p.value.data, tags: newTags } });
            });
            label.appendChild(input);
            if (firstInput === undefined) firstInput = input;
        }

        const pill = document.createElement("div");
        pill.className = selected ? "gdg-pill gdg-selected" : "gdg-pill gdg-unselected";
        pill.textContent = t.tag;
        // The ONE thing here that CSS cannot express: a selected pill is painted in the colour
        // carried by the cell's own `possibleTags[].color` data, not by anything in the theme. The
        // unselected colour (`--gdg-bg-bubble`) and the 0.8 dimming both live in the stylesheet.
        if (selected) pill.style.backgroundColor = t.color;
        label.appendChild(pill);

        container.appendChild(label);
    }

    return {
        element: container,
        focus: () => firstInput?.focus(),
        destroy: () => container.remove(),
    };
}
