import type { GridColumn } from "./data-grid-types.ts";
/** Either a column index or one of the objects from `columns`. Source's own union. */
export type NewRowTarget = number | GridColumn;
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
export declare function resolveNewRowTarget(columns: readonly GridColumn[], gridTarget: NewRowTarget | undefined, clickedIndex: number): number;
//# sourceMappingURL=new-row-target.d.ts.map