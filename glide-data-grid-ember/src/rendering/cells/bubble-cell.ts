// Ported from `packages/core/src/cells/bubble-cell.tsx` (Phase 4c). Draws a horizontal row of
// rounded "pill" chips from `cell.data: string[]`, using the already-ported `roundedRect`/
// `measureTextCached`/`getMiddleCenterBias` primitives (`render/data-grid-lib.ts`) verbatim.
//
// Source's renderer has a `provideEditor` (see `bubbles-overlay-editor.tsx`), but it is a plain,
// non-interactive display of the full chip list plus a decorative offscreen `<textarea>` -- it
// never calls the editor's `onChange`/`onFinishedEditing` in a way that mutates cell data (there's
// no wiring for it at all in the component itself), and `onPaste` unconditionally returns
// `undefined`. Functionally this cell is read-only end to end. Per PORTING-NOTES.md's Phase 4c
// scope, no overlay editor is built here -- confirmed by reading source directly (not assumed).
import { GridCellKind, type BubbleCell } from "../data-grid-types.ts";
import type { BaseDrawArgs, InternalCellRenderer } from "../cell-types.ts";
import { getMiddleCenterBias, measureTextCached, roundedRect } from "../render/data-grid-lib.ts";
import { makeAccessibilityStringForArray } from "../common/utils.ts";

export const bubbleCellRenderer: InternalCellRenderer<BubbleCell> = {
    getAccessibilityString: c => makeAccessibilityStringForArray(c.data),
    kind: GridCellKind.Bubble,
    needsHover: false,
    useLabel: false,
    needsHoverPosition: false,
    measure: (ctx, cell, theme) => {
        const bubblesWidth = cell.data.reduce(
            (acc, data) => ctx.measureText(data).width + acc + theme.bubblePadding * 2 + theme.bubbleMargin,
            0
        );
        if (cell.data.length === 0) return theme.cellHorizontalPadding * 2;
        return bubblesWidth + 2 * theme.cellHorizontalPadding - theme.bubbleMargin;
    },
    draw: a => drawBubbles(a, a.cell.data),
    onPaste: () => undefined,
};

function drawBubbles(args: BaseDrawArgs, data: readonly string[]) {
    const { rect, theme, ctx, highlighted } = args;
    const { x, y, width: w, height: h } = rect;

    let renderX = x + theme.cellHorizontalPadding;

    const renderBoxes: { x: number; width: number }[] = [];
    for (const s of data) {
        if (renderX > x + w) break;
        const textWidth = measureTextCached(s, ctx, theme.baseFontFull).width;
        renderBoxes.push({
            x: renderX,
            width: textWidth,
        });

        renderX += textWidth + theme.bubblePadding * 2 + theme.bubbleMargin;
    }

    ctx.beginPath();
    for (const rectInfo of renderBoxes) {
        roundedRect(
            ctx,
            rectInfo.x,
            y + (h - theme.bubbleHeight) / 2,
            rectInfo.width + theme.bubblePadding * 2,
            theme.bubbleHeight,
            theme.roundingRadius ?? theme.bubbleHeight / 2
        );
    }
    ctx.fillStyle = highlighted ? theme.bgBubbleSelected : theme.bgBubble;
    ctx.fill();

    for (const [i, rectInfo] of renderBoxes.entries()) {
        ctx.beginPath();
        ctx.fillStyle = theme.textBubble;
        ctx.fillText(data[i]!, rectInfo.x + theme.bubblePadding, y + h / 2 + getMiddleCenterBias(ctx, theme));
    }
}
