// Public surface of the data-source layer -- composable decorators that sit *above* the grid and
// produce the `columns`/`rows`/`getCellContent` args `<GlideDataGrid>` consumes.
//
// Ported from source's `packages/source` package. Per PHASES.md's Phase 8 scope research, those
// helpers are composable decorators over `getCellContent`, not wrapper components, so everything
// here is a plain function over plain objects and they stack:
//
//     @cached get gridArgs() {
//         const src = recordsSource({ records: this.people, columns: this.columns });  // Phase 8
//         return { ...src, ...withColumnSort({ ...src, sort: this.sort }) };           // Phase 7a
//     }
//
// The `@cached` is belt-and-braces, not load-bearing: every decorator here is required to be
// identity-stable across calls with unchanged inputs, because `getCellContent` is compared by
// identity by the render engine's blit fast path. See `column-sort.ts`'s header comment.
//
// Phase 8 will add `recordsSource` (and possibly an async paged variant) alongside `withColumnSort`.
// Re-read this file before editing if working concurrently with another sub-phase.

// Phase 7a -- column sort
export { withColumnSort, compareSmart, compareRaw } from "./column-sort.ts";
export type { ColumnSort, ColumnSortProps, ColumnSortResult } from "./column-sort.ts";
