// Plain-DOM port of `packages/core/src/internal/growing-entry/growing-entry.tsx` +
// `growing-entry-style.tsx` (Phase 4a of the Ember port) -- the autosize-textarea "shadow box"
// trick used by the text/number/row-id cell overlay editors.
//
// Deliberately NOT an Ember `.gts` component (see PORTING-NOTES.md's Phase 4a section for the
// full rationale): the overlay host that consumes this (`GridHostController`'s `openOverlay`,
// same file directory) is itself plain imperative DOM/TS code with no Ember rendering context
// available at the point it needs to build an editor -- there's no React-portal equivalent to
// reach for either (per this port's existing "imperative controller" precedent, same as
// selection/hover/scroll state). `GrowingEntry`'s own behavior -- the shadow-box autosize trick,
// controlled value/onChange, focus+select-on-mount -- is pure DOM manipulation with no framework
// reactivity involved even in the source (React only owned the value/onChange wiring, which this
// class replaces with plain callbacks), so a plain class is a faithful, lower-risk port.

/** @category Renderers */
class GrowingEntry {
  element;
  textareaEl;
  shadowEl;
  highlight;
  validatedSelection;
  constructor(options) {
    this.highlight = options.highlight;
    this.validatedSelection = options.validatedSelection;

    // All three elements' styling lives in `components/glide-data-grid-editors.css` under these
    // class names -- including the font metrics, which come from the `--gdg-*` custom
    // properties the overlay container stamps for this cell's fully-merged theme. Source's own
    // `growing-entry-style.tsx` is written against the same variables, so this is the faithful
    // shape rather than a port-specific one.
    this.element = document.createElement("div");
    this.element.className = "gdg-growing-entry";
    this.shadowEl = document.createElement("div");
    this.shadowEl.className = "gdg-shadow-box";
    this.textareaEl = document.createElement("textarea");
    this.textareaEl.className = options.wrapping === true ? "gdg-input gdg-input-wrapping" : "gdg-input";
    this.textareaEl.dir = "auto";
    if (options.placeholder !== undefined) this.textareaEl.placeholder = options.placeholder;
    if (options.readOnly === true) this.textareaEl.readOnly = true;
    this.textareaEl.value = options.value;
    this.syncShadow();
    this.textareaEl.addEventListener("input", () => {
      this.syncShadow();
      options.onChange(this.textareaEl.value);
    });
    this.textareaEl.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.shiftKey && options.altNewline === true) {
        return;
      }
      options.onKeyDown?.(ev);
    });
    this.element.append(this.shadowEl, this.textareaEl);
  }

  /** Current textarea content. */
  get value() {
    return this.textareaEl.value;
  }
  syncShadow() {
    // The trailing "\n" (matches source exactly) guarantees the shadow box always reserves
    // room for a line beyond the last one, so the caret never sits flush against the bottom
    // edge on the last line.
    this.shadowEl.textContent = this.textareaEl.value + "\n";
  }

  /** Focuses the textarea and, per `highlight`, either selects all content or places the caret
   * at the end -- mirrors source's mount-time `React.useEffect`. Requires `element` to already
   * be attached to the document (a detached `<textarea>` cannot receive focus), so the overlay
   * host calls this only after appending `element` into the DOM.
   *
   * **Read-only entries are focused too.** This used to bail when the textarea was `disabled`,
   * which it had to -- a disabled element cannot take focus. Under `readOnly` it can, and it must:
   * that focus is what keeps Escape working (see `readOnly` above, upstream #910). */
  focus() {
    this.textareaEl.focus();
    const length = this.textareaEl.value.length;
    if (this.validatedSelection !== undefined) {
      const range = this.validatedSelection;
      const [start, end] = typeof range === "number" ? [range, length] : range;
      this.textareaEl.setSelectionRange(start, end);
    } else {
      this.textareaEl.setSelectionRange(this.highlight ? 0 : length, length);
    }
  }
  destroy() {
    this.element.remove();
  }
}

export { GrowingEntry };
//# sourceMappingURL=growing-entry.js.map
