// Ported from `packages/core/src/cells/uri-cell.tsx` (Phase 4b). Drawing reuses the already-
// ported `drawTextCell`/`prepTextCell`/`measureTextCached`/`getMeasuredTextCache`/
// `getMiddleCenterBias` (`render/data-grid-lib.ts`) and `pointInRect` (`common/math.ts`)
// primitives verbatim, same as every other cell-renderer port. The editor uses the plain-DOM
// `GrowingEntry` for its edit mode (same as `text-cell.ts`) plus a link-preview/edit-pencil toggle
// built directly here as a small stateful DOM factory (source's `UriOverlayEditor`), since this
// port's editors are plain factory functions, not components -- see `data-grid-types.ts`'s
// `CellEditorProps`/`CellEditorHandle` doc comments and PORTING-NOTES.md's Phase 4a section.
import { GridCellKind, type BaseGridCell, type Rectangle, type UriCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { InternalCellRenderer } from "../cell-types.ts";
import {
    drawTextCell,
    getMeasuredTextCache,
    getMiddleCenterBias,
    measureTextCached,
    prepTextCell,
} from "../render/data-grid-lib.ts";
import type { FullTheme } from "../theme.ts";
import { pointInRect } from "../common/math.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";
import { createEditPencilIcon } from "../../-private/edit-icons.ts";

function getTextRect(
    metrics: TextMetrics,
    rect: Rectangle,
    theme: FullTheme,
    contentAlign: BaseGridCell["contentAlign"]
): Rectangle {
    let x = theme.cellHorizontalPadding;
    const y = rect.height / 2 - metrics.actualBoundingBoxAscent / 2;
    const width = metrics.width;
    const height = metrics.actualBoundingBoxAscent;

    if (contentAlign === "right") {
        x = rect.width - width - theme.cellHorizontalPadding;
    } else if (contentAlign === "center") {
        x = rect.width / 2 - width / 2;
    }

    return { x, y, width, height };
}

function isOverLinkText(e: {
    readonly cell: UriCell;
    readonly posX: number;
    readonly posY: number;
    readonly bounds: Rectangle;
    readonly theme: FullTheme;
}): boolean {
    const { cell, bounds, posX, posY, theme } = e;
    const txt = cell.displayData ?? cell.data;
    if (cell.hoverEffect !== true || cell.onClickUri === undefined) return false;

    const m = getMeasuredTextCache(txt, theme.baseFontFull);
    if (m === undefined) return false;
    const textRect = getTextRect(m, bounds, theme, cell.contentAlign);
    return pointInRect(
        {
            x: textRect.x - 4,
            y: textRect.y - 4,
            width: textRect.width + 8,
            height: textRect.height + 8,
        },
        posX,
        posY
    );
}

export const uriCellRenderer: InternalCellRenderer<UriCell> = {
    getAccessibilityString: c => c.data?.toString() ?? "",
    kind: GridCellKind.Uri,
    needsHover: uriCell => uriCell.hoverEffect === true,
    needsHoverPosition: true,
    useLabel: true,
    drawPrep: prepTextCell,
    draw: a => {
        const { cell, theme, overrideCursor, hoverX, hoverY, rect, ctx } = a;
        const txt = cell.displayData ?? cell.data;
        const isLinky = cell.hoverEffect === true;
        if (overrideCursor !== undefined && isLinky && hoverX !== undefined && hoverY !== undefined) {
            const m = measureTextCached(txt, ctx, theme.baseFontFull);
            const textRect = getTextRect(m, rect, theme, cell.contentAlign);

            const { x, y, width: w, height: h } = textRect;

            // check if hoverX and hoverY inside the box
            if (hoverX >= x - 4 && hoverX <= x - 4 + w + 8 && hoverY >= y - 4 && hoverY <= y - 4 + h + 8) {
                const middleCenterBias = getMiddleCenterBias(ctx, theme.baseFontFull);
                overrideCursor("pointer");
                const underlineOffset = 5;
                const drawY = y - middleCenterBias;

                ctx.beginPath();
                ctx.moveTo(rect.x + x, Math.floor(rect.y + drawY + h + underlineOffset) + 0.5);
                ctx.lineTo(rect.x + x + w, Math.floor(rect.y + drawY + h + underlineOffset) + 0.5);

                ctx.strokeStyle = theme.linkColor;
                ctx.stroke();

                ctx.save();
                ctx.fillStyle = a.cellFillColor;
                drawTextCell({ ...a, rect: { ...rect, x: rect.x - 1 } }, txt, cell.contentAlign);
                drawTextCell({ ...a, rect: { ...rect, x: rect.x - 2 } }, txt, cell.contentAlign);
                drawTextCell({ ...a, rect: { ...rect, x: rect.x + 1 } }, txt, cell.contentAlign);
                drawTextCell({ ...a, rect: { ...rect, x: rect.x + 2 } }, txt, cell.contentAlign);
                ctx.restore();
            }
        }

        ctx.fillStyle = isLinky ? theme.linkColor : theme.textDark;
        drawTextCell(a, txt, cell.contentAlign);
    },
    onSelect: e => {
        if (isOverLinkText(e)) {
            e.preventDefault();
        }
    },
    onClick: a => {
        const { cell } = a;
        const didClick = isOverLinkText(a);
        if (didClick) {
            cell.onClickUri?.(a);
        }
        return undefined;
    },
    measure: (ctx, cell, theme) =>
        ctx.measureText(cell.displayData ?? cell.data).width + theme.cellHorizontalPadding * 2,
    // Deviation from source (`onDelete: c => ({...c, data: ""})`, `displayData` left stale): same
    // reasoning as `text-cell.ts`'s `onDelete` -- this port's `draw` above reads `cell.displayData
    // ?? cell.data`, so a cell with `displayData` set (a realistic case -- showing a friendly label
    // over a raw URL) would keep showing the OLD label after a Delete/Backspace clear if only
    // `data` were reset. Clearing both together is the actually-useful behavior here.
    onDelete: c => ({ ...c, data: "", displayData: c.displayData === undefined ? undefined : "" }),
    provideEditor: () => p => buildUriEditor(p),
    onPaste: (toPaste, cell, details) =>
        toPaste === cell.data
            ? undefined
            : { ...cell, data: toPaste, displayData: details.formattedString ?? cell.displayData },
};

// Port of `UriOverlayEditor` (`internal/data-grid-overlay-editor/private/uri-overlay-editor.tsx`)
// as a plain stateful DOM factory instead of a React function component. Toggles between a
// "preview" view (clickable link + edit-pencil affordance, source's default non-edit render) and
// an "edit" view (`GrowingEntry` textarea) by swapping `container`'s children in place --
// `CellEditorHandle.element` must stay a single stable node for the overlay host's lifetime, so
// the toggle can't just return a different element.
//
// Simplification vs source: source's `editMode` also considers a `forceEditMode` prop (set by the
// cell's `provideEditor` when `cell.hoverEffect && cell.onClickUri` are both set, i.e. "this uri
// looks like a real hyperlink affordance, so open editing immediately rather than showing the
// clickable-link preview"). This port's `CellEditorProps` has no `forceEditMode` field (see
// PORTING-NOTES.md's Phase 4a section on the contract) -- `editMode` here is seeded from
// `uri === ""` only, matching the other half of source's condition. A cell with `hoverEffect`/
// `onClickUri` set will still open showing the link preview first (one extra click to edit) rather
// than jumping straight to edit mode; noted as a minor, low-risk simplification.
function buildUriEditor(p: CellEditorProps<UriCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;

    const container = document.createElement("div");
    container.className = "gdg-uri-editor";

    // Working copy, for the same reason `links-cell.ts` needs one: `p.value` is the cell as it was
    // when the editor opened and is never reassigned, so anything that re-renders from it shows
    // pre-edit data. Today `renderPreview()` is only reachable before any edit (the pencil goes
    // preview -> edit and nothing goes back), so this is hardening rather than a live fix -- but it
    // is the exact shape that was a real, data-losing bug in `links-cell`.
    let currentValue: UriCell = p.value;

    let growingEntry: GrowingEntry | undefined;
    let focusTarget: HTMLElement | undefined;

    function clear(): void {
        container.replaceChildren();
        growingEntry = undefined;
        focusTarget = undefined;
    }

    function renderPreview(): void {
        clear();

        const link = document.createElement("a");
        link.className = "gdg-link-area";
        link.href = currentValue.data;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = currentValue.displayData ?? currentValue.data;
        container.appendChild(link);

        if (!readonly) {
            const editButton = document.createElement("div");
            editButton.className = "gdg-uri-edit-button";
            // Sized by `.gdg-uri-edit-button > svg` (24px here, unlike the markdown editor's 16px).
            editButton.appendChild(createEditPencilIcon());
            editButton.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                renderEdit();
                growingEntry?.focus();
            });
            container.appendChild(editButton);
        }

        // Decoy focusable element (mirrors source's hidden `<textarea autoFocus />` in the non-edit
        // render): the overlay host's `handle.focus()` call needs *something* focusable to put real
        // DOM focus on so the overlay's own Escape/Enter/Tab keydown handling (registered on the
        // host's wrapping `container`, a `keydown` listener that only fires for events bubbling
        // through a focused descendant) actually receives keystrokes while showing the link preview.
        const hidden = document.createElement("textarea");
        hidden.className = "gdg-focus-decoy";
        container.appendChild(hidden);
        focusTarget = hidden;
    }

    function renderEdit(): void {
        clear();
        growingEntry = new GrowingEntry({
            value: currentValue.data,
            theme: p.theme,
            // Matches source's `<GrowingEntry highlight={true} .../>` -- always select-all when
            // entering edit mode, regardless of `p.isHighlighted` (this is the URI text itself, not
            // the cell's general activation-highlight state).
            highlight: true,
            disabled: readonly,
            validatedSelection: p.validatedSelection,
            // Deviation from source (`onChange={e => onChange({...value, data: e.target.value})}`,
            // `displayData` left stale): this port's `draw` above reads `cell.displayData ??
            // cell.data`, so a cell with `displayData` set (e.g. showing a friendly label over a
            // raw URL, a realistic case -- see the test-app demo) would keep rendering the OLD
            // label after committing an edit, even though `data` updated correctly underneath.
            // Confirmed as a real, reproducible bug via browser testing (same class as Phase 4a's
            // text-cell `displayData`-staleness fix, documented in PORTING-NOTES.md) -- fixed here
            // by keeping both fields in sync on every keystroke, not just replicating source.
            onChange: value => {
                currentValue = { ...currentValue, data: value, displayData: value };
                p.onChange(currentValue);
            },
        });
        container.appendChild(growingEntry.element);
    }

    if (!readonly && currentValue.data === "") {
        renderEdit();
    } else {
        renderPreview();
    }

    return {
        element: container,
        focus: () => {
            if (growingEntry !== undefined) growingEntry.focus();
            else focusTarget?.focus();
        },
        destroy: () => {
            growingEntry?.destroy();
            container.remove();
        },
    };
}
