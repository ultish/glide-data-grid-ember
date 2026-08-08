// Which DOM nodes inside the grid's root count as "the grid surface" for pointer dispatch.
//
// WHY THIS EXISTS. `GridHostController` attaches its `mousedown`/`contextmenu` listeners to
// `this.root`, but `root` does not contain only the grid's own scaffolding: the overlay editor's
// container is appended to it (`openOverlay`), and so is whatever the consumer renders in
// `<GlideDataGrid>`'s yielded block (`<GlideSearchBar>`, a toolbar, a menu...). Without a guard,
// every mousedown *inside an open cell editor* bubbles up to `root` and is processed as an
// ordinary grid click on whatever cell happens to be under the pointer -- which, because the
// editor sits over its own (already-selected) cell, means `dispatchCellMouseDown` re-activates
// that cell, and `openOverlay` tears the live editor down and builds a fresh one.
//
// That is not a cosmetic problem. Any editor state that lives in the editor factory's own closure
// rather than in the cell value is destroyed by the rebuild -- the markdown editor's
// preview/edit-mode toggle is the clearest case: clicking its edit-pencil rebuilt the overlay back
// into preview mode, so markdown cells read as "not editable at all". Every other overlay editor
// was quietly being rebuilt mid-interaction too.
//
// Source has the same listener-above-the-editor arrangement and guards it explicitly, at
// `internal/data-grid/data-grid.tsx:1076-1080`:
//
//     const onPointerDown = React.useCallback((ev: PointerEvent) => {
//         const canvas = ref.current;
//         const eventTarget = eventTargetRef?.current;
//         if (canvas === null || (ev.target !== canvas && ev.target !== eventTarget)) return;
//
// i.e. an *identity* allow-list of exactly two nodes, not a `contains()` subtree test. This port
// needs the same rule over its own node set (`root`, the two canvases and their underlay, and the
// four scroll-scaffolding divs) -- identity, deliberately, because a `contains()` check on `root`
// is precisely what fails here: the editor IS inside `root`.
//
// Kept in its own module, and taking the node list as a plain array, so the rule is unit-testable
// in bare Node (the vitest suite has no DOM).

/**
 * `true` when `target` is one of the grid's own surface nodes, i.e. an event that originated on the
 * grid itself rather than on an overlay editor or consumer-rendered chrome living inside the same
 * root element.
 */
export function isGridSurfaceTarget(target: EventTarget | null | undefined, surfaces: readonly unknown[]): boolean {
    if (target === null || target === undefined) return false;
    for (const surface of surfaces) {
        if (surface === target) return true;
    }
    return false;
}
