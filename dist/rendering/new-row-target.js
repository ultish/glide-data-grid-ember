// `trailingRowOptions.targetColumn` resolution (9f). Framework-agnostic port of source's
// `getCustomNewRowTargetColumn` (`packages/core/src/data-editor/data-editor.tsx:1795-1815`).
//
// Extracted from `GridHostController` so it can be tested: the object-identity branch below is
// exactly the kind of thing that silently never fires (a consumer passing a *copy* of a column gets
// the fallback and no error), and there is no way to notice that from the outside.

/** Either a column index or one of the objects from `columns`. Source's own union. */

/**
 * Which column the trailing blank row should focus when activated at `clickedIndex`.
 *
 * All indices are **consumer space**. Source resolves this in mangled space and adds the row-marker
 * offset itself (`:1802`); this port converts at the controller boundary instead, so that every
 * column index a consumer writes in `trailingRowOptions` means the same thing as everywhere else.
 *
 * Precedence, matching source: the clicked column's own `trailingRowOptions.targetColumn`, then the
 * grid-level one, then the clicked column itself.
 */
function resolveNewRowTarget(columns, gridTarget, clickedIndex) {
  const target = columns[clickedIndex]?.trailingRowOptions?.targetColumn ?? gridTarget;
  if (typeof target === "number") return target;
  if (typeof target === "object") {
    // Identity, not equality -- source uses `indexOf` too. A consumer passing a structurally
    // equal copy silently gets the fallback, which is why this has a test.
    const index = columns.indexOf(target);
    if (index >= 0) return index;
  }
  return clickedIndex;
}

export { resolveNewRowTarget };
//# sourceMappingURL=new-row-target.js.map
