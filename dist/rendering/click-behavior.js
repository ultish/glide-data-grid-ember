// What counts as a *click* (as opposed to a drag), and when a click activates a cell.
//
// Both rules are ported from source's `onMouseUp`/`handleMaybeClick`
// (`data-editor/data-editor.tsx:2332-2420`) and both live here rather than in
// `GridHostController` for the usual reason: the controller needs a real DOM and a real canvas, so
// vitest cannot import it, and these are exactly the rules that are cheap to get wrong and
// impossible to notice. `isValidClick` in particular is the entire difference between "the consumer's
// row-open handler fires when the user opens a row" and "it also fires every time the user begins a
// drag-selection" -- see `click-behavior.test.ts`.

/**
 * Whether a mouseup should be reported as a click on `up`.
 *
 * Port of source's `isValidClick` (`data-editor.tsx:2368`):
 * `a.isTouch || (lastMouseDownCol === col && lastMouseDownRow === row)`. The same-cell comparison
 * **is** the definition of a click here -- a press on one cell released over another is a drag, and
 * a drag is not a click.
 *
 * `down` is `undefined` when the mousedown never recorded a location, which is how source spells
 * "this gesture did not start as a plain select" (a resize-edge press, a header-menu-glyph press).
 * Those are correctly not clicks.
 *
 * Touch bypasses the check entirely, as in source: a touch "click" has no meaningful drag origin.
 * This port hardcodes `isTouch: false` everywhere (touch is 9c, deferred), so the parameter exists
 * to keep this function a faithful port rather than because anything passes `true` yet.
 */
function isValidClick(down, up, isTouch = false) {
  if (isTouch) return true;
  if (down === undefined) return false;
  return down[0] === up[0] && down[1] === up[1];
}

/** Everything the activation decision reads. All locations are in the same coordinate space. */

/**
 * Whether this click should activate the cell (open its editor, or toggle a boolean).
 *
 * Verbatim port of source's `switch (c.activationBehaviorOverride ?? cellActivationBehavior)`
 * (`data-editor.tsx:2401-2419`), including the part that is easy to get wrong: `"second-click"` and
 * `"double-click"` require the cell to be selected **both now and before the mousedown**. Checking
 * only "is it selected now" would activate on the *first* click, because that click's own mousedown
 * just selected it.
 *
 * `"double-click"` is the same test plus a real double-click; `"second-click"` accepts either (a
 * double-click's second mousedown already satisfies "click on the already-selected cell").
 *
 * **Upstream quirk, reproduced deliberately:** `"single-click"` returns `true` unconditionally, so a
 * drag that ends on a different cell also activates that cell. Source does this (its `single-click`
 * case is a bare `shouldActivate = true`, reached from a `handleMaybeClick` that is *not* gated on
 * `isValidClick`). Diverging here would be second-guessing upstream on a path neither project can
 * test automatically; it is called out so the next reader knows it is copied, not overlooked.
 */
function shouldActivateOnClick(args) {
  const {
    behavior,
    isDoubleClick,
    location,
    currentCell,
    previousCell
  } = args;
  switch (behavior) {
    case "single-click":
      return true;
    case "double-click":
    case "second-click":
      {
        if (previousCell === undefined || currentCell === undefined) return false;
        const isClickOnSelected = location[0] === currentCell[0] && location[0] === previousCell[0] && location[1] === currentCell[1] && location[1] === previousCell[1];
        return isClickOnSelected && (isDoubleClick || behavior === "second-click");
      }
  }
}

/**
 * What to report as `CellActivatedEventArgs.pointerActivation`. Source prefers the *observed*
 * gesture over the configured one when a real double-click happened (`data-editor.tsx:2421-2424`).
 */
function resolvePointerActivation(behavior, isDoubleClick) {
  return isDoubleClick ? "double-click" : behavior;
}

export { isValidClick, resolvePointerActivation, shouldActivateOnClick };
//# sourceMappingURL=click-behavior.js.map
