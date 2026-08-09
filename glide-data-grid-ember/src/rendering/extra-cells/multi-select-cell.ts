// Ported from `packages/cells/src/cells/multi-select-cell.tsx` (Phase 5b of the Ember port).
//
// **Deliberate simplification, per PORTING-NOTES.md's Phase 5 research**: source's editor uses
// `react-select`/`react-select/creatable` for a searchable multi-select dropdown UI with pill
// removal, duplicate-value support (via an internal value-prefixing scheme purely for
// react-select's own keying needs), etc. This port does not add that dependency -- the editor here
// is a plain native `<select multiple>` (checkbox-equivalent selection, no search) plus, when
// `allowCreation` is set, a small text input + "Add" button for entering values outside the
// configured `options` list. **Known simplification vs source**: a native multi-`<select>` cannot
// represent the same option selected twice, so `allowDuplicates` is honored for `onPaste` (which
// operates on plain string arrays) but not reachable via this editor's UI -- a low-risk, rarely-hit
// edge case. Draw/measure are near-verbatim ports of source's canvas drawing.
import { GridCellKind, type CustomCell, type Rectangle } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias, measureTextCached, roundedRect } from "../render/data-grid-lib.ts";
import { getLuminance } from "../color-parser.ts";

export type SelectOption = { value: string; label?: string; color?: string };

export interface MultiSelectCellProps {
    readonly kind: "multi-select-cell";
    readonly values: string[] | undefined | null;
    readonly options?: readonly (SelectOption | string)[];
    readonly allowCreation?: boolean;
    readonly allowDuplicates?: boolean;
}

export type MultiSelectCell = CustomCell<MultiSelectCellProps>;

function prepareOptions(options: readonly (string | SelectOption)[]): SelectOption[] {
    return options.map(option => {
        if (typeof option === "string" || option === null || option === undefined) {
            return { value: option, label: option ?? "", color: undefined };
        }
        return { value: option.value, label: option.label ?? option.value ?? "", color: option.color };
    });
}

export const multiSelectCellRenderer: CustomRenderer<MultiSelectCell> = {
    kind: GridCellKind.Custom,
    isMatch: (c): c is MultiSelectCell => (c.data as { kind?: unknown }).kind === "multi-select-cell",
    draw: (args, cell) => {
        const { ctx, theme, rect, highlighted } = args;
        const { values, options: optionsIn } = cell.data;

        if (values === undefined || values === null) return true;

        const options = prepareOptions(optionsIn ?? []);

        const drawArea: Rectangle = {
            x: rect.x + theme.cellHorizontalPadding,
            y: rect.y + theme.cellVerticalPadding,
            width: rect.width - 2 * theme.cellHorizontalPadding,
            height: rect.height - 2 * theme.cellVerticalPadding,
        };
        const rows = Math.max(1, Math.floor(drawArea.height / (theme.bubbleHeight + theme.bubblePadding)));

        let x = drawArea.x;
        let row = 1;
        let y =
            rows === 1
                ? drawArea.y + (drawArea.height - theme.bubbleHeight) / 2
                : drawArea.y + (drawArea.height - rows * theme.bubbleHeight - (rows - 1) * theme.bubblePadding) / 2;

        for (const value of values) {
            const matchedOption = options.find(t => t.value === value);
            const color = matchedOption?.color ?? (highlighted ? theme.bgBubbleSelected : theme.bgBubble);
            const displayText = matchedOption?.label ?? value;
            const metrics = measureTextCached(displayText, ctx, theme.baseFontFull);
            const width = metrics.width + theme.bubblePadding * 2;
            const textY = theme.bubbleHeight / 2;

            if (x !== drawArea.x && x + width > drawArea.x + drawArea.width && row < rows) {
                row++;
                y += theme.bubbleHeight + theme.bubblePadding;
                x = drawArea.x;
            }

            ctx.fillStyle = color;
            ctx.beginPath();
            roundedRect(ctx, x, y, width, theme.bubbleHeight, theme.roundingRadius ?? theme.bubbleHeight / 2);
            ctx.fill();

            ctx.fillStyle = matchedOption?.color
                ? getLuminance(color) > 0.5
                    ? "#000000"
                    : "#ffffff"
                : theme.textBubble;
            ctx.fillText(displayText, x + theme.bubblePadding, y + textY + getMiddleCenterBias(ctx, theme));

            x += width + theme.bubbleMargin;
            if (x > drawArea.x + drawArea.width + theme.cellHorizontalPadding && row >= rows) break;
        }

        return true;
    },
    measure: (ctx, cell, theme) => {
        const { values, options: optionsIn } = cell.data;
        if (!values || values.length === 0) return theme.cellHorizontalPadding * 2;

        const options = prepareOptions(optionsIn ?? []);
        const labels = values.map(v => options.find(o => o.value === v)?.label ?? v);
        const bubblesWidth = labels.reduce(
            (acc, label) => ctx.measureText(label).width + acc + theme.bubblePadding * 2 + theme.bubbleMargin,
            0
        );
        return bubblesWidth + 2 * theme.cellHorizontalPadding - theme.bubbleMargin;
    },
    provideEditor: () => ({
        editor: p => buildMultiSelectEditor(p),
        disablePadding: true,
        deletedValue: v => ({ ...v, copyData: "", data: { ...v.data, values: [] } }),
    }),
    onPaste: (val, cell) => {
        if (!val || !val.trim()) return { ...cell, values: [] };
        let values = val.split(",").map(s => s.trim());

        if (!cell.allowDuplicates) values = values.filter((v, index) => values.indexOf(v) === index);

        if (!cell.allowCreation) {
            const options = prepareOptions(cell.options ?? []);
            values = values.filter(v => options.some(o => o.value === v));
        }

        if (values.length === 0) return undefined;
        return { ...cell, values };
    },
};

// Plain native `<select multiple>` editor + an optional "add new value" affordance when
// `allowCreation` is set (see file header for why -- no `react-select`/`react-select/creatable`
// port).
function buildMultiSelectEditor(p: CellEditorProps<MultiSelectCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    const { options: optionsIn, values: valuesIn, allowCreation } = p.value.data;
    let values = [...(valuesIn ?? [])];
    const options = prepareOptions(optionsIn ?? []);

    // Chrome for both of these lives in `glide-data-grid-extra-cell-editors.css` (port of source's
    // `Wrap`/`.gdg-multi-select` Linaria block; `gdg-multi-select` is source's own class name).
    const container = document.createElement("div");
    container.className = "gdg-multi-select-editor";

    const select = document.createElement("select");
    select.className = "gdg-multi-select";
    select.multiple = true;
    select.disabled = readonly;

    function renderOptions(): void {
        select.replaceChildren();
        // Anything currently selected but not in `options` (e.g. added via the "create" input, or
        // pasted in) is shown too, so it doesn't silently disappear from the visible list.
        const allValues = [...options.map(o => o.value), ...values.filter(v => !options.some(o => o.value === v))];
        for (const value of allValues) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = options.find(o => o.value === value)?.label ?? value;
            option.selected = values.includes(value);
            select.appendChild(option);
        }
    }
    renderOptions();

    function commit(): void {
        p.onChange({ ...p.value, data: { ...p.value.data, values: [...values] } });
    }

    select.addEventListener("change", () => {
        values = Array.from(select.selectedOptions).map(o => o.value);
        commit();
    });

    container.appendChild(select);

    let addInput: HTMLInputElement | undefined;
    if (allowCreation === true && !readonly) {
        const addRow = document.createElement("div");
        addRow.className = "gdg-multi-select-add-row";

        addInput = document.createElement("input");
        addInput.type = "text";
        addInput.placeholder = "Add...";
        // Shared `.gdg-editor-input` primitive; the per-cell class only tightens the padding.
        addInput.className = "gdg-editor-input gdg-multi-select-add-input";

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "Add";
        addButton.className = "gdg-editor-button gdg-multi-select-add-button";

        const addValue = (): void => {
            const raw = addInput!.value.trim();
            if (raw === "") return;
            values = [...values, raw];
            addInput!.value = "";
            renderOptions();
            commit();
        };
        addButton.addEventListener("click", addValue);
        addInput.addEventListener("keydown", ev => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                ev.stopPropagation();
                addValue();
            }
        });

        addRow.append(addInput, addButton);
        container.appendChild(addRow);
    }

    return {
        element: container,
        focus: () => select.focus(),
        destroy: () => container.remove(),
    };
}
