// Ported from `packages/core/src/cells/markdown-cell.tsx` (Phase 4b). Drawing reuses the already-
// ported `drawTextCell`/`prepTextCell` (draws the *raw* markdown source text on the canvas, same
// as source -- only the overlay editor's preview mode renders it as HTML). The editor is a
// plain-DOM port of source's `MarkdownOverlayEditor`
// (`internal/data-grid-overlay-editor/private/markdown-overlay-editor.tsx`): a preview mode
// (`MarkdownDiv`-rendered HTML + edit-pencil icon, ported as `createMarkdownDiv` in
// `src/-private/markdown-div.ts`) that toggles to an edit mode (`GrowingEntry` + checkmark icon)
// and back, matching source's exact interaction -- see the `buildMarkdownEditor` doc comment below
// for the one real behavioral nuance (the checkmark commits+closes, it does not toggle back to
// preview).
import { GridCellKind, type MarkdownCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { InternalCellRenderer } from "../cell-types.ts";
import { drawTextCell, prepTextCell } from "../render/data-grid-lib.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";
import { createMarkdownDiv } from "../../-private/markdown-div.ts";
import { createCheckmarkIcon, createEditPencilIcon } from "../../-private/edit-icons.ts";

export const markdownCellRenderer: InternalCellRenderer<MarkdownCell> = {
    getAccessibilityString: c => c.data?.toString() ?? "",
    kind: GridCellKind.Markdown,
    needsHover: false,
    needsHoverPosition: false,
    drawPrep: prepTextCell,
    measure: (ctx, cell, t) => {
        const firstLine = cell.data.split("\n")[0] ?? "";
        return ctx.measureText(firstLine).width + 2 * t.cellHorizontalPadding;
    },
    draw: a => drawTextCell(a, a.cell.data, a.cell.contentAlign),
    onDelete: c => ({ ...c, data: "" }),
    provideEditor: () => p => buildMarkdownEditor(p),
    onPaste: (toPaste, cell) => (toPaste === cell.data ? undefined : { ...cell, data: toPaste }),
};

// Styled as `.gdg-icon-button` in `components/glide-data-grid-editors.css`, which also sizes the
// nested `<svg>`. The button's `color` is what drives the glyph -- every path in `edit-icons.ts`
// is `stroke="currentColor"`.
function iconButton(icon: SVGSVGElement): HTMLDivElement {
    const btn = document.createElement("div");
    btn.className = "gdg-icon-button";
    btn.appendChild(icon);
    return btn;
}

// Port of `MarkdownOverlayEditor` as a plain stateful DOM factory (same pattern as `uri-cell.ts`'s
// `buildUriEditor`) -- toggles between a "preview" view (rendered-HTML `MarkdownDiv` + edit-pencil)
// and an "edit" view (`GrowingEntry` + checkmark) by swapping `container`'s children in place.
//
// **Real interaction detail confirmed by reading source closely (matches the informal task
// description only partway)**: the checkmark icon's `onClick` in source is `() => onFinish(value)`
// -- it does NOT toggle back to preview mode within the still-open overlay. It calls the overlay's
// own finish/commit callback directly, which commits the edit AND closes the whole overlay (the
// cell then redraws showing the raw markdown text on the canvas, per `draw` above -- the *canvas*
// cell never shows rendered HTML, only the overlay's preview mode does). Ported faithfully here:
// the checkmark button calls `p.onFinishedEditing(currentValue)`, not a mode toggle.
//
// Simplification vs source: source's initial `editMode` is `markdown === "" || forceEditMode`.
// This port's `CellEditorProps` has no `forceEditMode` field (see PORTING-NOTES.md's Phase 4a
// section), so `editMode` here is seeded from `markdown === ""` alone -- an empty cell opens
// straight into edit mode (nothing to preview), any non-empty cell opens showing the rendered
// preview first (matches source's overwhelmingly common case, since Phase 4a's activation path
// never sets an equivalent of `forceEditMode` today).
function buildMarkdownEditor(p: CellEditorProps<MarkdownCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    let currentValue: MarkdownCell = p.value;
    let growingEntry: GrowingEntry | undefined;
    let focusTarget: HTMLElement | undefined;

    const container = document.createElement("div");
    container.className = "gdg-markdown-editor";

    function clear(): void {
        container.replaceChildren();
        growingEntry = undefined;
        focusTarget = undefined;
    }

    function renderPreview(): void {
        clear();

        // `createMarkdownDiv` already carries `.gdg-markdown-div`; the flex sizing that makes it
        // share the row with the icon button is `.gdg-markdown-editor > .gdg-markdown-div`.
        const div = createMarkdownDiv(currentValue.data);
        container.appendChild(div);

        if (!readonly) {
            const spacer = document.createElement("div");
            spacer.className = "gdg-markdown-spacer";
            container.appendChild(spacer);

            const editButton = iconButton(createEditPencilIcon());
            editButton.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                renderEdit();
                growingEntry?.focus();
            });
            container.appendChild(editButton);
        }

        // Decoy focusable element, same rationale as `uri-cell.ts`'s preview mode: gives the
        // overlay host's `handle.focus()` a real focus target so Escape/Enter/Tab keydown handling
        // (registered on the host's wrapping container) actually receives keystrokes while showing
        // the rendered-markdown preview, mirrors source's hidden `<textarea autoFocus />`.
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
            highlight: false,
            disabled: readonly,
            validatedSelection: p.validatedSelection,
            onChange: value => {
                currentValue = { ...currentValue, data: value };
                p.onChange(currentValue);
            },
            onKeyDown: ev => {
                // Mirrors source's markdown `GrowingEntry`'s `onKeyDown={e => { if (e.key ===
                // "Enter") e.stopPropagation(); }}` -- stops Enter from bubbling to the overlay
                // host's container-level commit-on-Enter handling so multi-line markdown can
                // actually be typed; Enter always inserts a newline in this editor instead.
                if (ev.key === "Enter") ev.stopPropagation();
            },
        });
        // Flex sizing comes from `.gdg-markdown-editor > .gdg-growing-entry` in the stylesheet.
        container.appendChild(growingEntry.element);

        const checkButton = iconButton(createCheckmarkIcon());
        checkButton.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            p.onFinishedEditing(currentValue);
        });
        container.appendChild(checkButton);
    }

    if (currentValue.data === "") {
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
