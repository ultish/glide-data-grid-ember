// Ported from `packages/core/src/cells/protected-cell.tsx` (Phase 4a), verbatim -- pure canvas
// drawing (a row of little "password dots"), no editor, not read-write.
import { GridCellKind, type ProtectedCell } from "../data-grid-types.ts";
import type { BaseDrawArgs, InternalCellRenderer } from "../cell-types.ts";

function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

export const protectedCellRenderer: InternalCellRenderer<ProtectedCell> = {
    getAccessibilityString: () => "",
    measure: () => 108,
    kind: GridCellKind.Protected,
    needsHover: false,
    needsHoverPosition: false,
    draw: drawProtectedCell,
    onPaste: () => undefined,
};

function drawProtectedCell(args: BaseDrawArgs) {
    const { ctx, theme, rect } = args;
    const { x, y, height: h } = rect;

    ctx.beginPath();

    const radius = 2.5;
    let xStart = x + theme.cellHorizontalPadding + radius;
    const center = y + h / 2;
    const p = Math.cos(degreesToRadians(30)) * radius;
    const q = Math.sin(degreesToRadians(30)) * radius;

    for (let i = 0; i < 12; i++) {
        ctx.moveTo(xStart, center - radius);
        ctx.lineTo(xStart, center + radius);

        ctx.moveTo(xStart + p, center - q);
        ctx.lineTo(xStart - p, center + q);

        ctx.moveTo(xStart - p, center - q);
        ctx.lineTo(xStart + p, center + q);
        xStart += 8;
    }
    ctx.lineWidth = 1.1;
    ctx.lineCap = "square";
    ctx.strokeStyle = theme.textLight;
    ctx.stroke();
}
