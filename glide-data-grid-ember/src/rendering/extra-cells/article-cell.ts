// Ported from `packages/cells/src/cells/article-cell.tsx` + `article-cell-types.ts` (Phase 5c of
// the Ember port). `draw()` is ported verbatim (first-line-only, width/4-char-truncated preview).
//
// **Editor simplification (per PORTING-NOTES.md's Phase 5 research, already agreed -- not
// relitigated here)**: source's real editor (`article-cell-editor.tsx`) is a full `@toast-ui/editor`
// WYSIWYG rich-text editor with a separate readonly `Viewer` mode, wrapped in `React.lazy` +
// `Suspense`. That dependency is intentionally NOT ported. `ArticleCellProps` has only one field
// besides `kind` -- `markdown: string` -- there is no separate title field to preserve; source's
// editor is single-field (one big rich-text body), so the plain-textarea replacement below is
// likewise single-field: a `GrowingEntry`-based `<textarea>` plus Close/Save buttons mirroring
// source's `Wrapper`'s `.gdg-close-button`/`.gdg-save-button` footer (source's `@linaria/react`
// CSS-in-JS is translated to plain CSS in `src/components/glide-data-grid-extra-cell-editors.css`,
// which keeps source's class names). **Known size limitation vs. source, worth noting**:
// source's `provideEditor` sets `styleOverride` to a fixed-position ~75vw x 75vh full-viewport box;
// this port's `CellEditorProps`/overlay host contract has a `styleOverride` field that is
// documented as "unused/unguessed" (`data-grid-types.ts`, `ObjectEditorCallbackResult`) -- the
// overlay host's container is always capped at `maxWidth: 400px` regardless of what a renderer
// passes there (see `grid-host-controller.ts`'s `openOverlay`). So this editor is a normal-size
// (not full-viewport) box; it sets an explicit min-height on itself so it's still comfortably usable
// for a paragraph or two, and the host's `overflow: auto` lets longer content scroll. A future
// phase wiring `styleOverride` through the overlay host would let this (and any future
// large-surface editor) grow to source's full-viewport size.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias } from "../render/data-grid-lib.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export interface ArticleCellProps {
    readonly kind: "article-cell";
    readonly markdown: string;
}

export type ArticleCell = CustomCell<ArticleCellProps>;

function isArticleCell(cell: CustomCell): cell is ArticleCell {
    return (cell.data as { kind?: unknown }).kind === "article-cell";
}

function footerButton(label: string, kind: "save" | "close"): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    // Source's own `.gdg-save-button`/`.gdg-close-button` names; everything they used to set
    // inline now lives in `glide-data-grid-extra-cell-editors.css` on top of the shared
    // `.gdg-editor-button` primitive.
    btn.className = `gdg-editor-button gdg-${kind}-button`;
    return btn;
}

function buildArticleEditor(p: CellEditorProps<ArticleCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;

    const container = document.createElement("div");
    container.className = "gdg-article-editor";

    let currentMarkdown = p.value.data.markdown;

    const entry = new GrowingEntry({
        value: currentMarkdown,
        theme: p.theme,
        highlight: false,
        readOnly: readonly,
        altNewline: true,
        validatedSelection: p.validatedSelection,
        onChange: value => {
            currentMarkdown = value;
        },
        onKeyDown: ev => {
            // Multi-line body text -- Enter must never bubble to the overlay host's
            // container-level commit-on-Enter handling (same rationale as `markdown-cell.ts`'s
            // editor: mirrors source stopping propagation on its own editor's `onKeyDown`).
            if (ev.key === "Enter") ev.stopPropagation();
        },
    });
    // `classList.add`, not `className =` -- `GrowingEntry` sets its own class on this element.
    entry.element.classList.add("gdg-article-body");
    container.appendChild(entry.element);

    if (!readonly) {
        const footer = document.createElement("div");
        footer.className = "gdg-article-footer";

        const closeButton = footerButton("Close", "close");
        closeButton.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            p.onFinishedEditing(undefined);
        });
        footer.appendChild(closeButton);

        const saveButton = footerButton("Save", "save");
        saveButton.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            p.onFinishedEditing({ ...p.value, data: { ...p.value.data, markdown: currentMarkdown } });
        });
        footer.appendChild(saveButton);

        container.appendChild(footer);
    }

    return {
        element: container,
        focus: () => entry.focus(),
        destroy: () => {
            entry.destroy();
            container.remove();
        },
    };
}

export const articleCellRenderer: CustomRenderer<ArticleCell> = {
    kind: GridCellKind.Custom,
    isMatch: isArticleCell,
    draw: (args, cell) => {
        const { ctx, theme, rect } = args;
        let data = cell.data.markdown;
        if (data.includes("\n")) {
            data = data.split(/\r?\n/)[0] ?? "";
        }
        const max = rect.width / 4; // no need to round, slice will just truncate this
        if (data.length > max) {
            data = data.slice(0, max);
        }

        ctx.fillStyle = theme.textDark;
        ctx.fillText(
            data,
            rect.x + theme.cellHorizontalPadding,
            rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
        );
    },
    provideEditor: () => ({
        editor: buildArticleEditor,
        disablePadding: true,
    }),
    onPaste: (val, d) => ({ ...d, markdown: val }),
};
