import { GridCellKind } from '../data-grid-types.js';
import { measureTextCached, roundedRect, getMiddleCenterBias } from '../render/data-grid-lib.js';

// Ported from `packages/cells/src/cells/tags-cell.tsx` (Phase 5b of the Ember port). Unlike
// `bubble-cell.ts` (Phase 4c, read-only chip list), this cell IS editable -- but source's own
// editor is *already* a plain checkbox list (no `react-select` involved at all for this
// particular cell, unlike dropdown/multi-select below), so this is a near-verbatim port, not a
// simplification. Draw reuses the same already-ported `roundedRect`/`measureTextCached`/
// `getMiddleCenterBias` primitives `bubble-cell.ts`/`drilldown-cell.ts` already established.
//
// This is a `CustomRenderer<CustomCell<Props>>` (see PORTING-NOTES.md's Phase 5 research section
// for why -- source's `packages/cells` package registers cells via `CustomRenderer`/`isMatch`,
// not a new `GridCellKind` enum member like Phase 4's built-ins).
/** Toggles `tag` in `tags`, returning a new array either way (never mutates `tags`). Pulled out of
 *  `buildTagsEditor` purely so the one piece of real logic in this file -- as opposed to DOM
 *  wiring, which cannot be unit-tested here (the controller cannot be imported by vitest) -- has a
 *  test next to it. See `tags-cell.test.ts`. */
function toggleTag(tags, tag) {
  return tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
}
const tagsCellRenderer = {
  kind: GridCellKind.Custom,
  isMatch: c => c.data.kind === "tags-cell",
  draw: (args, cell) => {
    const {
      ctx,
      theme,
      rect
    } = args;
    const {
      possibleTags,
      tags
    } = cell.data;
    const drawArea = {
      x: rect.x + theme.cellHorizontalPadding,
      y: rect.y + theme.cellVerticalPadding,
      width: rect.width - 2 * theme.cellHorizontalPadding,
      height: rect.height - 2 * theme.cellVerticalPadding
    };
    const tagHeight = theme.bubbleHeight;
    const innerPad = theme.bubblePadding;
    const rows = Math.max(1, Math.floor(drawArea.height / (tagHeight + innerPad)));
    let x = drawArea.x;
    let row = 1;
    let y = drawArea.y + (drawArea.height - rows * tagHeight - (rows - 1) * innerPad) / 2;
    for (const tag of tags) {
      const color = possibleTags.find(t => t.tag === tag)?.color ?? theme.bgBubble;
      ctx.font = `12px ${theme.fontFamily}`;
      const metrics = measureTextCached(tag, ctx, `12px ${theme.fontFamily}`);
      const width = metrics.width + innerPad * 2;
      const textY = tagHeight / 2;
      if (x !== drawArea.x && x + width > drawArea.x + drawArea.width && row < rows) {
        row++;
        y += tagHeight + innerPad;
        x = drawArea.x;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      roundedRect(ctx, x, y, width, tagHeight, theme.roundingRadius ?? tagHeight / 2);
      ctx.fill();
      ctx.fillStyle = theme.textDark;
      ctx.fillText(tag, x + innerPad, y + textY + getMiddleCenterBias(ctx, `12px ${theme.fontFamily}`));
      x += width + 8;
      if (x > drawArea.x + drawArea.width && row >= rows) break;
    }
    return true;
  },
  provideEditor: () => p => buildTagsEditor(p),
  onPaste: (v, d) => ({
    ...d,
    tags: d.possibleTags.map(x => x.tag).filter(x => v.split(",").map(s => s.trim()).includes(x))
  })
};

// Port of source's `EditorWrap` checkbox-list editor as a plain stateful DOM factory instead of a
// `styled.div` + React component -- same `CellEditorProps`/`CellEditorHandle` contract every other
// editor in this port uses (see `data-grid-types.ts`'s doc comments, PORTING-NOTES.md's Phase 4a
// section). No `react-select` dependency needed here since source itself never used one for this
// cell. Source's `EditorWrap` Linaria block is ported as plain CSS in
// `src/components/glide-data-grid-extra-cell-editors.css`, keeping source's own
// `gdg-pill`/`gdg-selected`/`gdg-unselected`/`gdg-readonly` class names.
function buildTagsEditor(p) {
  const readonly = p.value.readonly === true;
  const {
    possibleTags
  } = p.value.data;
  const container = document.createElement("div");
  // `gdg-readonly` is source's own marker class; it is what switches the rows' cursor off.
  container.className = readonly ? "gdg-tags-editor gdg-readonly" : "gdg-tags-editor";

  // The editor's working copy of the cell's tags. **Must NOT be read back through `p.value`** --
  // same rule as `links-cell.ts`'s `currentValue`, and the same defect for not following it: the
  // overlay host builds the editor-props object once (`openOverlay` in `grid-host-controller.ts`)
  // and `onChange` only ever writes the host's own `state.currentCell`, so `p.value` stays frozen
  // at whatever the cell held when the editor opened. Checking a *second* box used to read
  // `p.value.data.tags` fresh -- still the frozen original -- so the second toggle was computed
  // against the pre-edit list and silently discarded the first: check `bug` then `feature` and the
  // commit was `["urgent", "feature"]`, not `["urgent", "bug", "feature"]`.
  //
  // Source does not have this bug: its editor is a React component re-rendered by `useState` on
  // every `onChange` (`data-grid-overlay-editor.tsx:78-118`), so each checkbox's closure captures
  // a fresh `tags` on every render. This port's one-shot imperative DOM factory has no equivalent
  // and needs the working copy explicitly -- exactly the case `links-cell.ts`'s comment already
  // named ("any stateful editor that re-renders itself needs this same working copy") and this
  // file hadn't followed. Browser-confirmed 2026-08-14: reproduced with the sequence above, fixed
  // with this copy, re-verified the same sequence commits all three tags.
  let currentTags = [...p.value.data.tags];
  let firstInput;
  for (const t of possibleTags) {
    const label = document.createElement("label");
    const pill = document.createElement("div");
    pill.textContent = t.tag;

    // Reflects `currentTags`, not the tag's state when the editor opened -- a second bug this
    // port also had: the pill's own selected/color styling was computed once at build time and
    // never updated after a toggle, so the DOM checkbox and the pill it sits beside visibly
    // disagreed the moment you checked a second box.
    const syncPill = () => {
      const selected = currentTags.includes(t.tag);
      pill.className = selected ? "gdg-pill gdg-selected" : "gdg-pill gdg-unselected";
      // The ONE thing here CSS cannot express: a selected pill is painted in the colour
      // carried by the cell's own `possibleTags[].color` data, not by anything in the theme.
      // The unselected colour (`--gdg-bg-bubble`) and the 0.8 dimming both live in the
      // stylesheet.
      pill.style.backgroundColor = selected ? t.color : "";
    };
    syncPill();
    if (!readonly) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = currentTags.includes(t.tag);
      input.addEventListener("change", () => {
        currentTags = toggleTag(currentTags, t.tag);
        syncPill();
        p.onChange({
          ...p.value,
          data: {
            ...p.value.data,
            tags: currentTags
          }
        });
      });
      label.appendChild(input);
      if (firstInput === undefined) firstInput = input;
    }
    label.appendChild(pill);
    container.appendChild(label);
  }
  return {
    element: container,
    focus: () => firstInput?.focus(),
    destroy: () => container.remove()
  };
}

export { tagsCellRenderer, toggleTag };
//# sourceMappingURL=tags-cell.js.map
