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
// cell.
function buildTagsEditor(p: CellEditorProps<TagsCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    const { possibleTags, tags } = p.value.data;
    const tagHeight = p.theme.bubbleHeight;
    const innerPad = p.theme.bubblePadding;

    const container = document.createElement("div");
    container.className = "gdg-tags-editor";
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        paddingTop: "6px",
        boxSizing: "border-box",
        color: p.theme.textDark,
        fontFamily: p.theme.fontFamily,
        fontSize: p.theme.editorFontSize,
    } satisfies Partial<CSSStyleDeclaration>);

    let firstInput: HTMLInputElement | undefined;

    for (const t of possibleTags) {
        const selected = tags.includes(t.tag);

        const label = document.createElement("label");
        Object.assign(label.style, {
            display: "flex",
            alignItems: "center",
            cursor: readonly ? "default" : "pointer",
        } satisfies Partial<CSSStyleDeclaration>);

        if (!readonly) {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = selected;
            Object.assign(input.style, { cursor: "pointer" } satisfies Partial<CSSStyleDeclaration>);
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
        pill.className = "gdg-pill";
        pill.textContent = t.tag;
        Object.assign(pill.style, {
            marginLeft: "8px",
            marginRight: "6px",
            marginBottom: "6px",
            borderRadius: `${p.theme.roundingRadius ?? tagHeight / 2}px`,
            minHeight: `${tagHeight}px`,
            padding: `2px ${innerPad}px`,
            display: "flex",
            alignItems: "center",
            font: `12px ${p.theme.fontFamily}`,
            backgroundColor: selected ? t.color : p.theme.bgBubble,
            opacity: selected ? "1" : "0.8",
        } satisfies Partial<CSSStyleDeclaration>);
        label.appendChild(pill);

        container.appendChild(label);
    }

    return {
        element: container,
        focus: () => firstInput?.focus(),
        destroy: () => container.remove(),
    };
}
