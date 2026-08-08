// Ported from `packages/core/src/cells/image-cell.tsx` (Phase 4d). `draw`/`measure`/`onDelete`/
// `onPaste` are near-verbatim, reusing the already-ported `roundedRect` (`render/data-grid-lib.ts`)
// and the Phase-1-ported `ImageWindowLoader` (`args.imageLoader.loadOrGetImage`, same pattern
// drilldown-cell.ts already established for image thumbnails).
//
// **Editor is a deliberate simplification, documented here and in PORTING-NOTES.md's Phase 4d
// section.** Source's actual default editor (`internal/data-grid-overlay-editor/private/
// image-overlay-editor.tsx`, `ImageOverlayEditor`) is, on close inspection, NOT editable at all:
// it's a read-only `react-responsive-carousel` viewer. The component destructures only
// `{urls, canWrite, onEditClick, renderImage}` from its props -- `onChange`/`onCancel` (declared on
// the `OverlayImageEditorProps` interface) are never actually consumed by the component body. Its
// one interactive affordance, an edit-pencil button, is gated on `canWrite && onEditClick`, but
// `image-cell.tsx`'s `provideEditor` never passes an `onEditClick` prop when instantiating the
// default editor -- so that button never renders either. Net effect in source itself: the built-in
// image cell overlay is a pure image viewer; actual editing only happens via a fully custom
// `imageEditorOverride` (a consumer-supplied component, not shipped in core) or via paste/delete.
// This mirrors the same "editor renders but doesn't actually wire commit" pattern already found and
// documented for bubble-cell/drilldown-cell in Phase 4c.
//
// Per this phase's task instructions ("a reasonably simple textarea-per-URL-list ... is fine if
// source's own UI is more complex than fits cleanly; use judgment"), this port intentionally
// diverges from source's view-only default and builds a genuinely *editable* list-of-URLs editor
// instead (thumbnail preview row + one comma-separated `GrowingEntry`, splitting/rejoining on
// `,` -- matching the same comma-separated format `onPaste` below already parses) -- more useful
// than faithfully porting a dead-end viewer, while staying a small, low-risk amount of new code
// reusing entirely existing primitives (`GrowingEntry`, plain `<img>` tags for preview).
import { GridCellKind, type BaseGridCell, type ImageCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { BaseDrawArgs, InternalCellRenderer } from "../cell-types.ts";
import { roundedRect } from "../render/data-grid-lib.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export const imageCellRenderer: InternalCellRenderer<ImageCell> = {
    getAccessibilityString: c => c.data.join(", "),
    kind: GridCellKind.Image,
    needsHover: false,
    useLabel: false,
    needsHoverPosition: false,
    draw: a => drawImage(a, a.cell.displayData ?? a.cell.data, a.cell.rounding ?? a.theme.roundingRadius ?? 4, a.cell.contentAlign),
    measure: (_ctx, cell) => cell.data.length * 50,
    onDelete: c => ({
        ...c,
        data: [],
    }),
    provideEditor: () => p => buildImageEditor(p),
    onPaste: (toPaste, cell) => {
        toPaste = toPaste.trim();
        const fragments = toPaste.split(",");
        const uris = fragments
            .map(f => {
                try {
                    new URL(f);
                    return f;
                } catch {
                    return undefined;
                }
            })
            .filter(x => x !== undefined) as string[];

        if (uris.length === cell.data.length && uris.every((u, i) => u === cell.data[i])) return undefined;
        return {
            ...cell,
            data: uris,
        };
    },
};

const itemMargin = 4;

export function drawImage(args: BaseDrawArgs, data: readonly string[], rounding: number, contentAlign?: BaseGridCell["contentAlign"]) {
    const { rect, col, row, theme, ctx, imageLoader } = args;
    const { x, y, height: h, width: w } = rect;

    const imgHeight = h - theme.cellVerticalPadding * 2;
    const images: (HTMLImageElement | ImageBitmap | undefined)[] = [];
    let totalWidth = 0;
    // eslint-disable-next-line unicorn/no-for-loop
    for (let index = 0; index < data.length; index++) {
        const i = data[index]!;
        if (i.length === 0) continue;
        const img = imageLoader.loadOrGetImage(i, col, row);

        if (img !== undefined) {
            images[index] = img;
            const imgWidth = img.width * (imgHeight / img.height);
            totalWidth += imgWidth + itemMargin;
        }
    }

    if (totalWidth === 0) return;
    totalWidth -= itemMargin;

    let drawX = x + theme.cellHorizontalPadding;
    if (contentAlign === "right") drawX = Math.floor(x + w - theme.cellHorizontalPadding - totalWidth);
    else if (contentAlign === "center") drawX = Math.floor(x + w / 2 - totalWidth / 2);

    for (const img of images) {
        if (img === undefined) continue; //array is sparse
        const imgWidth = img.width * (imgHeight / img.height);
        if (rounding > 0) {
            ctx.beginPath();
            roundedRect(ctx, drawX, y + theme.cellVerticalPadding, imgWidth, imgHeight, rounding);
            ctx.save();
            ctx.clip();
        }
        ctx.drawImage(img, drawX, y + theme.cellVerticalPadding, imgWidth, imgHeight);
        if (rounding > 0) {
            ctx.restore();
        }

        drawX += imgWidth + itemMargin;
    }
}

// See the file-header comment for why this is an intentional divergence from source's (effectively
// non-functional) default editor: a thumbnail preview row plus one editable, comma-separated
// `GrowingEntry` -- reusing the exact same primitive every other text-based editor in this port
// already uses, rather than inventing a new per-row-input UI.
function buildImageEditor(p: CellEditorProps<ImageCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;

    const container = document.createElement("div");
    container.className = "gdg-image-editor";

    const thumbRow = document.createElement("div");
    thumbRow.className = "gdg-image-editor-thumbs";
    container.appendChild(thumbRow);

    // The `cell.rounding ?? theme.roundingRadius ?? 4` precedence chain now lives in the
    // stylesheet: `.gdg-image-editor-thumbs` defaults `--gdg-image-thumb-radius` to
    // `var(--gdg-rounding-radius, 4px)`, covering the last two links. Only the first link is
    // per-instance -- it comes from this cell's own data -- so only it is set here.
    if (p.value.rounding !== undefined) {
        thumbRow.style.setProperty("--gdg-image-thumb-radius", `${p.value.rounding}px`);
    }

    function renderThumbs(urls: readonly string[]): void {
        thumbRow.replaceChildren();
        for (const url of urls) {
            if (url.trim().length === 0) continue;
            const img = document.createElement("img");
            img.src = url;
            img.draggable = false;
            thumbRow.appendChild(img);
        }
    }
    renderThumbs(p.value.data);

    let growingEntry: GrowingEntry | undefined;
    if (!readonly) {
        growingEntry = new GrowingEntry({
            value: p.value.data.join(", "),
            theme: p.theme,
            highlight: p.isHighlighted,
            placeholder: "Image URL(s), comma-separated",
            validatedSelection: p.validatedSelection,
            onChange: value => {
                const urls = value
                    .split(",")
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                renderThumbs(urls);
                p.onChange({ ...p.value, data: urls });
            },
        });
        container.appendChild(growingEntry.element);
    }

    return {
        element: container,
        focus: () => growingEntry?.focus(),
        destroy: () => growingEntry?.destroy(),
    };
}
