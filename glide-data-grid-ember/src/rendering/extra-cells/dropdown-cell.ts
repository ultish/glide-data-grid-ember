// Ported from `packages/cells/src/cells/dropdown-cell.tsx` (Phase 5b of the Ember port).
//
// **Deliberate simplification, per PORTING-NOTES.md's Phase 5 research**: source's editor uses the
// `react-select` npm package for a searchable dropdown menu portaled outside the cell. This port
// does not add that dependency -- the editor here is a plain native `<select>` populated with
// `<option>`s, matching this project's established "simplify heavy UI deps, keep the drawing
// faithful" pattern (already applied to markdown-cell skipping ProseMirror, image-cell skipping
// the carousel lib, etc). Draw is a near-verbatim port (plain text of the selected option's label).
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { getMiddleCenterBias } from "../render/data-grid-lib.ts";

type DropdownOption = string | { value: string; label: string } | undefined | null;

export interface DropdownCellProps {
    readonly kind: "dropdown-cell";
    readonly value: string | undefined | null;
    readonly allowedValues: readonly DropdownOption[];
}

export type DropdownCell = CustomCell<DropdownCellProps>;

function optionValue(opt: DropdownOption): string | undefined | null {
    return typeof opt === "string" || opt === null || opt === undefined ? opt : opt.value;
}

function optionLabel(opt: DropdownOption): string {
    if (typeof opt === "string") return opt;
    if (opt === null || opt === undefined) return "";
    return opt.label ?? opt.value;
}

export const dropdownCellRenderer: CustomRenderer<DropdownCell> = {
    kind: GridCellKind.Custom,
    isMatch: (c): c is DropdownCell => (c.data as { kind?: unknown }).kind === "dropdown-cell",
    draw: (args, cell) => {
        const { ctx, theme, rect } = args;
        const { value, allowedValues } = cell.data;
        const foundOption = allowedValues.find(opt => optionValue(opt) === value);
        const displayText = foundOption === undefined ? "" : optionLabel(foundOption);
        if (displayText) {
            ctx.fillStyle = theme.textDark;
            ctx.fillText(
                displayText,
                rect.x + theme.cellHorizontalPadding,
                rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
            );
        }
        return true;
    },
    measure: (ctx, cell, theme) => (cell.data.value ? ctx.measureText(cell.data.value).width : 0) + theme.cellHorizontalPadding * 2,
    provideEditor: () => ({
        editor: p => buildDropdownEditor(p),
        disablePadding: true,
        deletedValue: v => ({ ...v, copyData: "", data: { ...v.data, value: "" } }),
    }),
    onPaste: (v, d) => ({
        ...d,
        value: d.allowedValues.some(option => optionValue(option) === v) ? v : d.value,
    }),
};

// Plain native `<select>` editor (see file header for why -- no `react-select` port). Auto-opens
// on focus (`showPicker()` where supported) to mimic source's `openMenuOnFocus`/`autoFocus`
// behavior as closely as a native control allows.
function buildDropdownEditor(p: CellEditorProps<DropdownCell>): CellEditorHandle {
    const readonly = p.value.readonly === true;
    const { allowedValues, value: valueIn } = p.value.data;

    // Chrome for both of these lives in `glide-data-grid-extra-cell-editors.css` (port of source's
    // `Wrap`/`.glide-select` Linaria block).
    const container = document.createElement("div");
    container.className = "gdg-dropdown-editor";

    const select = document.createElement("select");
    select.className = "gdg-dropdown-select";
    select.disabled = readonly;

    // A blank leading option so "no selection" is representable (source's `allowedValues` can
    // include `undefined`/`null`/`""`).
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "";
    select.appendChild(blankOption);

    for (const opt of allowedValues) {
        const value = optionValue(opt);
        const option = document.createElement("option");
        option.value = value ?? "";
        option.textContent = optionLabel(opt);
        if (value === valueIn) option.selected = true;
        select.appendChild(option);
    }

    select.addEventListener("change", () => {
        p.onFinishedEditing({ ...p.value, data: { ...p.value.data, value: select.value === "" ? undefined : select.value } });
    });

    container.appendChild(select);

    return {
        element: container,
        focus: () => {
            select.focus();
            // `showPicker` isn't in every TS DOM lib target yet and isn't universally supported --
            // best-effort only, matching source's "open menu on focus" UX where the platform allows.
            (select as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
        },
        destroy: () => container.remove(),
    };
}
