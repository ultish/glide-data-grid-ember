/** The subset of `Node` this module needs, so a test can pass a plain object. */
export interface FocusContainment {
    contains(other: unknown): boolean;
}
/**
 * Should the overlay host move focus to the container itself?
 *
 * `activeElement` is the focused node **of the container's own root node** -- `document` for an
 * ordinary grid, the `ShadowRoot` for one inside a shadow DOM. Reading `document.activeElement` for a
 * shadow-hosted grid returns the *host* element, which is outside the container and would make this
 * answer `true` on every open; the caller resolves the right root, this decides what to do with it.
 *
 * Returns `true` when focus is nowhere useful: unfocused (`null`, which browsers report as `<body>`
 * having focus in practice, and jsdom as `null`), or focused on something outside the overlay --
 * including the grid canvas itself, which is the case that looks harmless and is not. Returns
 * `false` when the editor successfully focused one of its own controls, which is the common path and
 * must not be disturbed: stealing focus back to the container would drop the caret out of a
 * perfectly good textarea.
 */
export declare function shouldFocusOverlayContainer(container: FocusContainment, activeElement: unknown): boolean;
//# sourceMappingURL=overlay-focus.d.ts.map