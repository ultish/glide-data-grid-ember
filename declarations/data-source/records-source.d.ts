import { type GridCell, type GridColumn, type Item } from "../rendering/data-grid-types.ts";
import type { CellEdit } from "./column-sort.ts";
/** Input to {@link recordsSource}. */
export interface RecordsSourceProps<T> {
    /**
     * The records, one per row, in the order they should be displayed *before* any sort decorator.
     *
     * Treated as immutable: replace the array when rows are added, removed or reordered. Mutating
     * the tracked fields *inside* a record is the supported way to change data, and is what the
     * per-row memoization is built around.
     */
    readonly records: readonly T[];
    readonly columns: readonly GridColumn[];
    /**
     * Projects one record + one column index into a cell. A plain accessor function, deliberately
     * not a path string: no traversal library, no parsing, nothing to compile. Do all formatting and
     * nested-data digging here -- it runs once per record, memoized -- never in `getCellContent`,
     * which is on the paint path.
     *
     * Must be identity-stable (a class field, an `@action`, or a module-scope function -- not an
     * arrow allocated inline in the getter), because the per-row caches close over it and a new
     * identity rebuilds all of them.
     */
    readonly toCell: (record: T, col: number) => GridCell;
    /**
     * Applies one committed edit to one record. Optional; omit for a read-only grid.
     *
     * `record` is the actual object at the edited row, so the usual implementation is a single
     * tracked-field assignment -- which invalidates exactly that record's cache and repaints exactly
     * that row.
     *
     * **Composition note:** when this source is wrapped in `withColumnSort`, the row indices reaching
     * the returned `onCellsEdited` have already been translated back to *original* row space by the
     * sort decorator, so the record handed here is always the right one. That is the whole point of
     * both halves implementing the same coordinate contract; see `column-sort.ts`.
     */
    readonly onCellEdited?: (record: T, col: number, value: GridCell) => void;
}
/**
 * Output of {@link recordsSource}.
 *
 * The field names are deliberately exactly those `<GlideDataGrid>` and `withColumnSort` expect, so
 * the two compose by spreading:
 *
 * ```ts
 * @cached get gridArgs() {
 *     const src = recordsSource({ records: this.people, columns: this.columns, toCell });
 *     return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
 * }
 * ```
 */
export interface RecordsSourceResult {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    /** O(1) array lookup -- no work on the paint path. Identity-stable while no row changed. */
    readonly getCellContent: (cell: Item) => GridCell;
    /** `undefined` if and only if no `onCellEdited` was supplied. Identity-stable. */
    readonly onCellsEdited?: (edits: readonly CellEdit[]) => void;
}
/**
 * Turns an in-memory array of records into the `columns` / `rows` / `getCellContent` /
 * `onCellsEdited` args `<GlideDataGrid>` consumes, with per-row memoization and correct autotracking
 * handled internally.
 *
 * Call it from inside a tracked computation (a `@cached` getter is the idiomatic place) -- it reads
 * every record's tracked fields during the call, and that is what registers them as dependencies of
 * the frame that will re-run and repaint the grid. See this file's header for the full mechanism.
 *
 * ```ts
 * const toCell = (p: Person, col: number): GridCell =>
 *     col === 0
 *         ? { kind: GridCellKind.Text, allowOverlay: true, data: p.name, displayData: p.name }
 *         : { kind: GridCellKind.Number, allowOverlay: true, data: p.age, displayData: String(p.age) };
 *
 * @cached get gridArgs() {
 *     const src = recordsSource({
 *         records: this.people,
 *         columns: this.columns,
 *         toCell,
 *         onCellEdited: (person, col, value) => { ... },
 *     });
 *     return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };
 * }
 * ```
 */
export declare function recordsSource<T extends object>(p: RecordsSourceProps<T>): RecordsSourceResult;
//# sourceMappingURL=records-source.d.ts.map