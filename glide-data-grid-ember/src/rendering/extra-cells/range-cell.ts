// Ported from `packages/cells/src/cells/range-cell.tsx` (Phase 5a of the Ember port).
//
// `draw()` (the gradient-filled rounded "progress track" + optional trailing label) is ported
// near-verbatim, reusing this port's already-ported `roundedRect`/`measureTextCached`/
// `getMiddleCenterBias`/`getEmHeight` primitives (`render/data-grid-lib.ts`), same as
// bubble-cell/drilldown-cell already do.
//
// **Editor deviates from source, per PORTING-NOTES.md's Phase 5 research**: source's editor is a
// native `<input type="range">` rendered via React. Ported here as the equivalent plain-DOM
// factory satisfying this port's `CellEditorProps`/`CellEditorHandle` contract (established in
// Phase 4a, see `data-grid-types.ts`) -- a `<label>` wrapping a real `<input type="range">` plus a
// live numeric-value `<span>`, built with the same `Object.assign(el.style, {...})` inline-style
// pattern `GrowingEntry` uses (no CSS-in-JS dependency, matching the `@linaria/react` skip called
// out in PORTING-NOTES.md's Phase 5 section).
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { roundedRect, measureTextCached, getMiddleCenterBias, getEmHeight } from "../render/data-grid-lib.ts";

export interface RangeCellProps {
    readonly kind: "range-cell";
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly label?: string;
    readonly measureLabel?: string;
    /** The color of the range, fallback to theme.accentColor. */
    readonly color?: string;
}

export type RangeCell = CustomCell<RangeCellProps>;

function isRangeCell(cell: CustomCell): cell is RangeCell {
    return (cell.data as { kind?: unknown }).kind === "range-cell";
}

function adaptFontSize(font: string, percentage: number): string {
    const regex = /(\d+\.?\d*)\s*(px|rem|em|%|pt)/;
    const match = font.match(regex);

    if (match !== null) {
        const value = Number.parseFloat(match[1]!);
        const unit = match[2];
        const scaledValue = value * percentage;
        return font.replace(regex, `${Number(scaledValue.toPrecision(3))}${unit}`);
    }

    return font;
}

export const rangeCellRenderer: CustomRenderer<RangeCell> = {
    kind: GridCellKind.Custom,
    isMatch: isRangeCell,
    draw: (args, cell) => {
        const { ctx, theme, rect } = args;
        const { min, max, value, label, measureLabel, color } = cell.data;

        const x = rect.x + theme.cellHorizontalPadding;
        const yMid = rect.y + rect.height / 2;

        const rangeSize = max - min;
        const fillRatio = (value - min) / rangeSize;
        // Only use 90% of the base font size for the label
        const labelFont = `${adaptFontSize(theme.baseFontStyle, 0.9)} ${theme.fontFamily}`;

        const emHeight = getEmHeight(ctx, labelFont);
        const rangeHeight = emHeight / 2;

        ctx.save();
        let labelWidth = 0;
        if (label !== undefined) {
            ctx.font = labelFont; // fixme this is slow
            labelWidth = measureTextCached(measureLabel ?? label, ctx, labelFont).width + theme.cellHorizontalPadding;
        }

        const rangeWidth = rect.width - theme.cellHorizontalPadding * 2 - labelWidth;

        if (rangeWidth >= rangeHeight) {
            const gradient = ctx.createLinearGradient(x, yMid, x + rangeWidth, yMid);

            const fillColor = color ?? theme.accentColor;
            // Deviation from source: source passes `fillRatio` straight into `addColorStop`
            // unclamped, which throws a DOMException if `value` ever falls outside `[min, max]`
            // (an out-of-range gradient stop is invalid). Clamping here is a strict correctness
            // improvement with no visible behavior change for in-range values.
            const clampedRatio = Math.min(1, Math.max(0, fillRatio));
            gradient.addColorStop(0, fillColor);
            gradient.addColorStop(clampedRatio, fillColor);
            gradient.addColorStop(clampedRatio, theme.bgBubble);
            gradient.addColorStop(1, theme.bgBubble);

            ctx.beginPath();
            ctx.fillStyle = gradient;
            roundedRect(ctx, x, yMid - rangeHeight / 2, rangeWidth, rangeHeight, rangeHeight / 2);
            ctx.fill();

            ctx.beginPath();
            roundedRect(
                ctx,
                x + 0.5,
                yMid - rangeHeight / 2 + 0.5,
                rangeWidth - 1,
                rangeHeight - 1,
                (rangeHeight - 1) / 2
            );
            ctx.strokeStyle = theme.accentLight;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        if (label !== undefined) {
            ctx.textAlign = "right";
            ctx.fillStyle = theme.textDark;
            ctx.fillText(
                label,
                rect.x + rect.width - theme.cellHorizontalPadding,
                yMid + getMiddleCenterBias(ctx, labelFont)
            );
        }

        ctx.restore();
    },
    provideEditor: () => p => {
        const { value, onChange, theme } = p;
        const data = value.data;
        const readonly = value.readonly === true;

        const wrapper = document.createElement("label");
        Object.assign(wrapper.style, {
            display: "flex",
            alignItems: "center",
            flexGrow: "1",
            gap: "8px",
            width: "100%",
            padding: "0 8px",
        } satisfies Partial<CSSStyleDeclaration>);

        const input = document.createElement("input");
        input.type = "range";
        input.min = String(data.min);
        input.max = String(data.max);
        input.step = String(data.step);
        input.value = String(data.value);
        input.disabled = readonly;
        Object.assign(input.style, {
            flexGrow: "1",
        } satisfies Partial<CSSStyleDeclaration>);

        const valueLabel = document.createElement("span");
        valueLabel.textContent = String(data.value);
        Object.assign(valueLabel.style, {
            fontFamily: theme.fontFamily,
            fontSize: theme.editorFontSize,
            color: theme.textDark,
            minWidth: "3ch",
            textAlign: "right",
        } satisfies Partial<CSSStyleDeclaration>);

        input.addEventListener("input", () => {
            const newValue = Number(input.value);
            valueLabel.textContent = input.value;
            onChange({
                ...value,
                data: { ...data, value: newValue },
            });
        });

        wrapper.append(input, valueLabel);

        return {
            element: wrapper,
            focus: () => input.focus(),
            destroy: () => wrapper.remove(),
        };
    },
    onPaste: (val, data) => {
        let num = Number.parseFloat(val);
        num = Number.isNaN(num) ? data.value : Math.max(data.min, Math.min(data.max, num));
        return {
            ...data,
            value: num,
        };
    },
};
