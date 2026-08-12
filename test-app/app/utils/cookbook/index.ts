// The cookbook's chapter order. This array *is* the table of contents, and the page numbers
// chapters from their position here — so adding or reordering a chapter is an edit to this file
// only, never a renumbering sweep.
import type { Section } from "./types.ts";
import { renderSection } from "./render.ts";
import { columnsSection } from "./columns.ts";
import { dataSection } from "./data.ts";
import { emberSection } from "./ember.ts";
import { editingSection } from "./editing.ts";
import { selectionSection } from "./selection.ts";
import { dragAndDropSection } from "./drag-and-drop.ts";
import { keyboardSection } from "./keyboard.ts";
import { sortingSection } from "./sorting.ts";
import { composingSection } from "./composing.ts";
import { hoverSection } from "./hover.ts";
import { themingSection } from "./theming.ts";
import { themeReferenceSection } from "./theme-reference.ts";
import { searchSection } from "./search.ts";
import { contextMenusSection } from "./context-menus.ts";
import { customCellsSection } from "./custom-cells.ts";
import { performanceSection } from "./performance.ts";
import { gotchasSection } from "./gotchas.ts";

export const SECTIONS: readonly Section[] = [
    renderSection,
    columnsSection,
    dataSection,
    emberSection,
    editingSection,
    selectionSection,
    dragAndDropSection,
    keyboardSection,
    sortingSection,
    composingSection,
    hoverSection,
    themingSection,
    themeReferenceSection,
    searchSection,
    contextMenusSection,
    customCellsSection,
    performanceSection,
    gotchasSection,
];

export type { Block, Section } from "./types.ts";
