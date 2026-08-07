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
// source's `Wrapper`'s `.gdg-close-button`/`.gdg-save-button` footer (translated from source's
// `@linaria/react` CSS-in-JS to inline styles, this port's established styling convention -- see
// `growing-entry.ts`/`markdown-div.ts`). **Known size limitation vs. source, worth noting**:
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

function footerButton(theme: CellEditorProps<ArticleCell>["theme"], label: string, kind: "save" | "close"): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
        border: "none",
        padding: "8px 16px",
        fontSize: "14px",
        fontWeight: "500",
        fontFamily: theme.fontFamily,
        cursor: "pointer",
        borderRadius: `${theme.roundingRadius ?? 9}px`,
        marginRight: kind === "close" ? "8px" : "0",
        backgroundColor: kind === "save" ? theme.accentColor : theme.bgHeader,
        color: kind === "save" ? theme.accentFg : theme.textMedium,
    } satisfies Partial<CSSStyleDeclaration>);
    return btn;
}

function buildArticleEditor(p: CellEditorProps<ArticleCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;

    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "260px",
        padding: `${p.theme.cellVerticalPadding + 8}px ${p.theme.cellHorizontalPadding + 8}px`,
        boxSizing: "border-box",
        color: p.theme.textDark,
    } satisfies Partial<CSSStyleDeclaration>);

    let currentMarkdown = p.value.data.markdown;

    const entry = new GrowingEntry({
        value: currentMarkdown,
        theme: p.theme,
        highlight: false,
        disabled: readonly,
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
    Object.assign(entry.element.style, {
        flexGrow: "1",
        minHeight: "200px",
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(entry.element);

    if (!readonly) {
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: "12px",
        } satisfies Partial<CSSStyleDeclaration>);

        const closeButton = footerButton(p.theme, "Close", "close");
        closeButton.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            p.onFinishedEditing(undefined);
        });
        footer.appendChild(closeButton);

        const saveButton = footerButton(p.theme, "Save", "save");
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
        ctx.fillText(data, rect.x + theme.cellHorizontalPadding, rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme));
    },
    provideEditor: () => ({
        editor: buildArticleEditor,
        disablePadding: true,
    }),
    onPaste: (val, d) => ({ ...d, markdown: val }),
};
