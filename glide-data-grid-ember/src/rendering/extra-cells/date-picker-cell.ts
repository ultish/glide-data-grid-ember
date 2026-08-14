// Ported from `packages/cells/src/cells/date-picker-cell.tsx` (Phase 5c of the Ember port).
//
// Source's editor is a native `<input>` whose `type` attribute is driven by the cell's own
// `format: "date" | "time" | "datetime-local"` prop -- there is no separate date-only vs.
// date+time *component*, just one native input whose HTML `type` switches between the three.
// Ported near-verbatim: same `formatValueForHTMLInput` ISO-string-slicing logic, same
// min/max/step passthrough, same timezone-offset adjustment math. The only simplification is
// structural, not behavioral: source's editor is a styled-components `<input>` React component;
// here it's the same native `<input>` built directly via `document.createElement`, matching this
// port's "plain-DOM factory" editor contract (`CellEditorProps`/`CellEditorHandle`, see
// `data-grid-types.ts` and PORTING-NOTES.md's Phase 4a section) -- no dependency needed either way,
// this is squarely the "native HTML date input, no extra dependency" case flagged in the task brief.
import { GridCellKind, type CustomCell } from "../data-grid-types.ts";
import type { CellEditorHandle, CellEditorProps } from "../data-grid-types.ts";
import type { CustomRenderer } from "../cell-types.ts";
import { drawTextCell, prepTextCell } from "../render/data-grid-lib.ts";
import { GrowingEntry } from "../../-private/growing-entry.ts";

export type DateKind = "date" | "time" | "datetime-local";

export interface DatePickerCellProps {
    readonly kind: "date-picker-cell";
    readonly date: Date | undefined | null;
    readonly displayDate: string;
    readonly format: DateKind;
    readonly timezoneOffset?: number;
    readonly min?: string | Date;
    readonly max?: string | Date;
    readonly step?: string;
}

export type DatePickerCell = CustomCell<DatePickerCellProps>;

function isDatePickerCell(cell: CustomCell): cell is DatePickerCell {
    return (cell.data as { kind?: unknown }).kind === "date-picker-cell";
}

export function formatValueForHTMLInput(
    dateKind: DateKind,
    date: Date | undefined | null,
    timezoneOffsetMs?: number
): string {
    if (date === undefined || date === null) {
        return "";
    }

    let adjusted = date;
    if (timezoneOffsetMs) {
        adjusted = new Date(date.getTime() + timezoneOffsetMs);
    }

    const isoDate = adjusted.toISOString();
    switch (dateKind) {
        case "date":
            return isoDate.split("T")[0] ?? "";
        case "datetime-local":
            return isoDate.replace("Z", "");
        case "time":
            return (isoDate.split("T")[1] ?? "").replace("Z", "");
        default:
            throw new Error(`Unknown date kind ${dateKind as string}`);
    }
}

function buildDatePickerEditor(p: CellEditorProps<DatePickerCell>): CellEditorHandle {
    const cellData = p.value.data;
    const { format, displayDate } = cellData;
    const readonly = p.value.readonly === true;

    if (readonly) {
        // Mirrors source's `<TextCellEntry highlight disabled value={displayDate} />` for the
        // readonly case -- this port's equivalent "read-only text display" primitive is a
        // `readOnly` `GrowingEntry` (same pattern `text-cell.ts`'s `provideEditor` uses for its own
        // readonly case), not a distinct `TextCellEntry` component (never ported, source's only
        // other user of it besides date-picker is inside `packages/core` cells already covered in
        // Phase 4). `readOnly` rather than source's `disabled` -- see `GrowingEntry.readOnly`.
        const entry = new GrowingEntry({
            value: displayDate ?? "",
            theme: p.theme,
            highlight: true,
            readOnly: true,
            onChange: () => undefined,
        });
        return { element: entry.element, focus: () => entry.focus(), destroy: () => entry.destroy() };
    }

    const step =
        cellData.step !== undefined && !Number.isNaN(Number(cellData.step)) ? Number(cellData.step) : undefined;

    // Convert timezone offset from minutes to milliseconds:
    const timezoneOffsetMs = cellData.timezoneOffset ? cellData.timezoneOffset * 60 * 1000 : 0;

    const minValue =
        cellData.min instanceof Date ? formatValueForHTMLInput(format, cellData.min, timezoneOffsetMs) : cellData.min;
    const maxValue =
        cellData.max instanceof Date ? formatValueForHTMLInput(format, cellData.max, timezoneOffsetMs) : cellData.max;

    const value = formatValueForHTMLInput(format, cellData.date, timezoneOffsetMs);

    const input = document.createElement("input");
    input.type = format;
    input.required = true;
    if (minValue !== undefined) input.min = minValue;
    if (maxValue !== undefined) input.max = maxValue;
    if (step !== undefined) input.step = String(step);
    input.value = value;
    // Port of source's `StyledInputBox` -- see `glide-data-grid-extra-cell-editors.css`.
    input.className = "gdg-date-picker-input";

    let currentValue: DatePickerCell = p.value;
    input.addEventListener("change", () => {
        if (Number.isNaN(input.valueAsNumber)) {
            currentValue = { ...currentValue, data: { ...currentValue.data, date: undefined, displayDate: "" } };
        } else {
            // Use valueAsNumber, not valueAsDate -- valueAsDate is null for "datetime-local"
            // (matches source's own comment/behavior exactly, see MDN link in source).
            const newDate = new Date(input.valueAsNumber - timezoneOffsetMs);
            currentValue = {
                ...currentValue,
                data: {
                    ...currentValue.data,
                    date: newDate,
                    // Deviation from source (source leaves `displayDate` stale after an edit, same
                    // class of bug already fixed for `text-cell.ts`/`uri-cell.ts` in Phase 4a/4b):
                    // this port's `draw()` reads `cell.data.displayDate`, not `.date` -- committing
                    // without keeping this in sync would silently redraw the OLD date after editing.
                    displayDate: formatValueForHTMLInput(format, newDate, timezoneOffsetMs),
                },
            };
        }
        p.onChange(currentValue);
    });

    return {
        element: input,
        focus: () => input.focus(),
        destroy: () => input.remove(),
    };
}

export const datePickerCellRenderer: CustomRenderer<DatePickerCell> = {
    kind: GridCellKind.Custom,
    isMatch: isDatePickerCell,
    // `drawTextCell` never sets `ctx.fillStyle` itself (see `render/data-grid-lib.ts`) -- every
    // other text-drawing renderer either supplies `drawPrep: prepTextCell` (sets `fillStyle =
    // theme.textDark`, same as `text-cell.ts`/`markdown-cell.ts`/`uri-cell.ts`) or sets it inline.
    // Missing this here was a real bug caught via browser testing: the cell drew with whatever
    // `fillStyle` the previous cell on the canvas happened to leave behind, which reliably
    // rendered invisible (transparent/background-colored) text -- the column looked entirely
    // blank despite `draw` running without error every time.
    drawPrep: prepTextCell,
    draw: (args, cell) => {
        const { displayDate } = cell.data;
        drawTextCell(args, displayDate, cell.contentAlign);
    },
    measure: (ctx, cell, theme) => ctx.measureText(cell.data.displayDate).width + theme.cellHorizontalPadding * 2,
    provideEditor: () => ({ editor: buildDatePickerEditor }),
    onPaste: (v, d) => {
        let parseDateTimestamp = Number.NaN;
        if (v) {
            // Support for unix timestamps (milliseconds since 1970-01-01):
            parseDateTimestamp = Number(v).valueOf();

            if (Number.isNaN(parseDateTimestamp)) {
                // Support for parsing ISO 8601 date strings:
                parseDateTimestamp = Date.parse(v);
                if (d.format === "time" && Number.isNaN(parseDateTimestamp)) {
                    // The pasted value was not a valid date string -- try interpreting it as a
                    // time string instead (HH:mm:ss).
                    parseDateTimestamp = Date.parse(`1970-01-01T${v}Z`);
                }
            }
        }
        const newDate = Number.isNaN(parseDateTimestamp) ? undefined : new Date(parseDateTimestamp);
        return {
            ...d,
            date: newDate,
            // Same staleness fix as the editor's `onChange` above (source leaves `displayDate`
            // untouched on paste too) -- `draw()` reads `displayDate`, so a paste that only updated
            // `date` would visibly show the OLD date on the canvas despite the underlying value
            // being correct. Found via browser-testing a synthetic paste event, not assumed.
            displayDate: newDate === undefined ? "" : formatValueForHTMLInput(d.format, newDate),
        };
    },
};
