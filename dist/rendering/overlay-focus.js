// The rule that keeps an open overlay editor reachable by the keyboard.
//
// Framework-agnostic and DOM-free (it takes the two nodes as an interface, not as `HTMLElement`),
// which is the only reason it can be unit-tested here: `GridHostController` cannot be imported by
// vitest, so anything that needs a test has to be extracted into `rendering/` first.
//
// **Why this exists.** The overlay host registers its Escape/Enter/Tab `keydown` listener on the
// overlay *container*, so those keys only work while focus is somewhere inside it. Every editor is
// trusted to put focus somewhere via `CellEditorHandle.focus()` -- and some cannot:
//
//   - an editor whose only control is `disabled` (a `<select disabled>` in `dropdown-cell`, a
//     `<input disabled>` in `range-cell`) cannot take focus at all, and clicking it moves focus to
//     `<body>`;
//   - an editor with no focusable element whatsoever (a custom renderer that draws a read-only
//     preview) never had focus to begin with.
//
// In both cases Escape then reaches nobody: the grid's own `onKeyDown` early-returns while an
// overlay is open, precisely because the overlay is supposed to be handling those keys. The user is
// stranded in an editor with no keyboard way out. That is upstream
// [#910](https://github.com/glideapps/glide-data-grid/issues/910).
//
// Upstream's own unmerged fix ([PR #915](https://github.com/glideapps/glide-data-grid/pull/915))
// has two halves: swap `disabled` for `readOnly` on native inputs (done here in `GrowingEntry`), and
// make the overlay element itself focusable as a backstop. This is the backstop half, and it is the
// more valuable one -- `readOnly` only helps the editors that have a native text control to put it
// on, while this covers every editor kind including ones a *consumer* wrote.

/** The subset of `Node` this module needs, so a test can pass a plain object. */

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
function shouldFocusOverlayContainer(container, activeElement) {
  if (activeElement === null || activeElement === undefined) return true;
  return !container.contains(activeElement);
}

export { shouldFocusOverlayContainer };
//# sourceMappingURL=overlay-focus.js.map
