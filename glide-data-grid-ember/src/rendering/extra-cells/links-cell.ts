// Ported from `packages/cells/src/cells/links-cell.tsx` (Phase 5b of the Ember port). A list of
// clickable comma-separated links drawn in one cell -- distinct from `tags-cell.ts`/
// `multi-select-cell.ts` (plain text titles, not colored pills) and, unlike `uri-cell.ts` (Phase
// 4b, single URL), holds a `links: {title, href?, onClick?}[]` array. Draw/hover-hit-test/click
// dispatch are a near-verbatim port of source (same `needsHover`/`needsHoverPosition`/`onClick`
// wiring `uri-cell.ts` already established a precedent for in this port).
//
// **Known pre-existing gap this cell also hits (not introduced here)**: per PORTING-NOTES.md's
// Phase 4b section, `GridHostController`'s click dispatch only wires `renderer.onClick`, not
// `onSelect` -- `onSelect` below is ported for fidelity with source but is currently dead code in
// this port, same as `uri-cell.ts`'s.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias, measureTextCached } from "../render/data-grid-lib.ts";
import { blend } from "../color-parser.ts";

export interface LinksCellLink {
    readonly title: string;
    readonly href?: string;
    readonly onClick?: () => void;
}

export interface LinksCellProps {
    readonly kind: "links-cell";
    readonly underlineOffset?: number;
    readonly maxLinks?: number;
    readonly navigateOn?: "click" | "control-click";
    readonly links: readonly LinksCellLink[];
}

export type LinksCell = CustomCell<LinksCellProps>;

function findHoveredLink(e: {
    readonly cell: LinksCell;
    readonly posX: number;
    readonly bounds: { x: number };
    readonly theme: { baseFontFull: string; cellHorizontalPadding: number };
}): LinksCellLink | undefined {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx === null) return undefined;

    const { posX: hoverX, bounds: rect, cell, theme } = e;
    ctx.font = theme.baseFontFull;

    const { links } = cell.data;
    const xPad = theme.cellHorizontalPadding;
    let drawX = rect.x + xPad;
    const rectHoverX = rect.x + hoverX;

    for (const [index, l] of links.entries()) {
        const needsComma = index < links.length - 1;
        const metrics = measureTextCached(l.title, ctx, theme.baseFontFull);
        const commaMetrics = needsComma ? measureTextCached(l.title + ",", ctx, theme.baseFontFull) : metrics;

        if (rectHoverX > drawX && rectHoverX < drawX + metrics.width) return l;

        drawX += commaMetrics.width + 4;
    }
    return undefined;
}

export const linksCellRenderer: CustomRenderer<LinksCell> = {
    kind: GridCellKind.Custom,
    needsHover: true,
    needsHoverPosition: true,
    isMatch: (c): c is LinksCell => (c.data as { kind?: unknown }).kind === "links-cell",
    onSelect: e => {
        const useCtrl = e.cell.data.navigateOn !== "click";
        if (useCtrl !== e.ctrlKey) return;
        if (findHoveredLink(e) !== undefined) e.preventDefault();
    },
    onClick: e => {
        const useCtrl = e.cell.data.navigateOn !== "click";
        if (useCtrl !== e.ctrlKey) return undefined;
        const hovered = findHoveredLink(e);
        if (hovered !== undefined) {
            hovered.onClick?.();
            e.preventDefault();
        }
        return undefined;
    },
    draw: (args, cell) => {
        const { ctx, rect, theme, hoverX = -100, highlighted } = args;
        const { links, underlineOffset = 5 } = cell.data;

        const xPad = theme.cellHorizontalPadding;
        let drawX = rect.x + xPad;
        const rectHoverX = rect.x + hoverX;
        const font = theme.baseFontFull;

        const middleCenterBias = getMiddleCenterBias(ctx, font);
        const drawY = rect.y + rect.height / 2 + middleCenterBias;

        for (const [index, l] of links.entries()) {
            const needsComma = index < links.length - 1;
            const label = needsComma ? l.title + "," : l.title;
            const metrics = measureTextCached(l.title, ctx, font);
            const commaMetrics = needsComma ? measureTextCached(label, ctx, font) : metrics;

            const isHovered = rectHoverX > drawX && rectHoverX < drawX + metrics.width;

            if (isHovered) {
                args.overrideCursor?.("pointer");
                ctx.beginPath();
                ctx.moveTo(drawX, Math.floor(drawY + underlineOffset) + 0.5);
                ctx.lineTo(drawX + metrics.width, Math.floor(drawY + underlineOffset) + 0.5);
                ctx.strokeStyle = theme.textDark;
                ctx.stroke();

                ctx.fillStyle = highlighted ? blend(theme.accentLight, theme.bgCell) : theme.bgCell;
                ctx.fillText(label, drawX - 1, drawY);
                ctx.fillText(label, drawX + 1, drawY);
                ctx.fillText(label, drawX - 2, drawY);
                ctx.fillText(label, drawX + 2, drawY);
            }
            ctx.fillStyle = theme.textDark;
            ctx.fillText(label, drawX, drawY);

            drawX += commaMetrics.width + 4;
        }

        return true;
    },
    provideEditor: () => p => buildLinksEditor(p),
    onPaste: (v, d) => {
        const split = v.split(",");
        if (d.links.some((l, i) => split[i] !== l.title)) return undefined;
        return { ...d, links: split.map(l => ({ title: l })) };
    },
};

// Plain stateful DOM factory porting source's `LinksCellEditorStyle`/`LinkTitleEditor` -- a
// title+URL input pair per link, add/delete affordances. No `react-select`/styled-components
// dependency needed (this cell's source editor was already plain React DOM + `@linaria/react`
// styling, not `react-select` -- only the CSS-in-JS is dropped, in favor of plain CSS in
// `src/components/glide-data-grid-extra-cell-editors.css`, per PORTING-NOTES.md's Phase 5 guidance
// on `@linaria/react`).
function buildLinksEditor(p: CellEditorProps<LinksCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    const maxLinks = p.value.data.maxLinks ?? Number.MAX_SAFE_INTEGER;

    const container = document.createElement("div");
    container.className = "gdg-links-editor";

    let firstInput: HTMLInputElement | undefined;

    function currentLinks(): readonly LinksCellLink[] {
        return p.value.data.links;
    }

    function setLinks(newLinks: readonly LinksCellLink[]): void {
        p.onChange({ ...p.value, data: { ...p.value.data, links: newLinks } });
        render();
    }

    function render(): void {
        container.replaceChildren();
        firstInput = undefined;
        const links = currentLinks();

        for (const [i, l] of links.entries()) {
            const row = document.createElement("div");
            row.className = "gdg-links-row";

            const titleInput = document.createElement("input");
            // `gdg-title-input`/`gdg-link-input` are source's own class names, kept as the public
            // hooks for targeting one input or the other; every style they used to set inline is
            // exactly the shared `.gdg-editor-input` primitive.
            titleInput.className = "gdg-editor-input gdg-title-input";
            titleInput.value = l.title;
            titleInput.placeholder = "Title";
            titleInput.disabled = readonly;
            titleInput.addEventListener("input", () => {
                const next = [...currentLinks()];
                next[i] = { ...next[i]!, title: titleInput.value };
                p.onChange({ ...p.value, data: { ...p.value.data, links: next } });
            });

            const linkInput = document.createElement("input");
            linkInput.className = "gdg-editor-input gdg-link-input";
            linkInput.value = l.href ?? "";
            linkInput.placeholder = "URL";
            linkInput.disabled = readonly;
            linkInput.addEventListener("input", () => {
                const next = [...currentLinks()];
                next[i] = { ...next[i]!, href: linkInput.value };
                p.onChange({ ...p.value, data: { ...p.value.data, links: next } });
            });

            row.append(titleInput, linkInput);

            if (!readonly && links.length > 1) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.textContent = "✕";
                deleteButton.className = "gdg-editor-button gdg-links-delete-button";
                deleteButton.addEventListener("click", () => {
                    const next = [...currentLinks()];
                    next.splice(i, 1);
                    setLinks(next);
                });
                row.appendChild(deleteButton);
            }

            container.appendChild(row);
            if (i === 0) firstInput = titleInput;
        }

        if (!readonly) {
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.textContent = "Add link";
            // The dimmed/not-clickable look of the maxed-out state is the shared
            // `.gdg-editor-button:disabled` rule -- setting `disabled` is behaviour, not style.
            addButton.disabled = links.length >= maxLinks;
            addButton.className = "gdg-editor-button gdg-links-add-button";
            addButton.addEventListener("click", () => {
                setLinks([...currentLinks(), { title: "" }]);
            });
            container.appendChild(addButton);
        }
    }

    render();

    return {
        element: container,
        focus: () => firstInput?.focus(),
        destroy: () => container.remove(),
    };
}
