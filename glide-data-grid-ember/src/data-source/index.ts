// Public surface of the data-source layer -- composable decorators that sit *above* the grid and
// produce the `columns`/`rows`/`getCellContent` args `<GlideDataGrid>` consumes.
//
// Ported from source's `packages/source` package. Per PHASES.md's Phase 8 scope research, those
// helpers are composable decorators over `getCellContent`, not wrapper components, so everything
// here is a plain function over plain objects and they stack:
//
//     @cached get gridArgs() {
//         const src = recordsSource({ records: this.people, columns: this.columns, toCell });  // 8b
//         return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };                   // 7a
//     }
//
// For `recordsSource` the `@cached` is *not* optional -- it must be called inside a tracking frame,
// because it reads every record's tracked fields eagerly to establish the grid's dependencies (see
// `records-source.ts`'s header). For every other decorator here the `@cached` is belt-and-braces:
// each one is required to be identity-stable across calls with unchanged inputs, because
// `getCellContent` is compared by identity by the render engine's blit fast path. See
// `column-sort.ts`'s header comment.
//
// Coordinate contract shared by everything in this directory (settled in Phase 8a): a decorator that
// remaps the *read* path must remap the *write* path too. So each one takes and returns
// `onCellsEdited` alongside `getCellContent`, and consumers wire the *returned* handler to the grid
// rather than translating row indices by hand.
//
// The one exception to "plain function over plain objects" is `AsyncRecordsSource` (Phase 8c), which
// owns a row buffer and page-loading state and is therefore a class the consumer constructs once --
// its bound instance fields give the same identity stability for free. See its header for why.
//
// Re-read this file before editing if working concurrently with another sub-phase.

// Phase 7a -- column sort
export { withColumnSort, compareSmart, compareRaw } from "./column-sort.ts";
export type { CellEdit, ColumnSort, ColumnSortProps, ColumnSortResult } from "./column-sort.ts";

// Phase 8b -- in-memory records source
export { recordsSource } from "./records-source.ts";
export type { RecordsSourceProps, RecordsSourceResult } from "./records-source.ts";

// Phase 8c -- async paged records source (port of source's `use-async-data-source`)
export { AsyncRecordsSource } from "./async-records-source.ts";
export type { AsyncRecordsSourceOptions, RowRange, UpdateCellsApi } from "./async-records-source.ts";
