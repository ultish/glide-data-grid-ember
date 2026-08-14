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
import type { FullTheme } from "../rendering/theme.ts";
import type { SelectionRange } from "../rendering/data-grid-types.ts";

export interface GrowingEntryOptions {
    readonly value: string;
    /** No longer read by `GrowingEntry` itself: since the stylesheet migration its font/colour come
     * from the `--gdg-*` custom properties the overlay container stamps, exactly as source's
     * `growing-entry-style.tsx` does. Retained because every caller already has it to hand and
     * because a themed variant may want it again; nothing depends on it today. */
    readonly theme: FullTheme;
    /** `true` = select-all on mount (overwrite-by-typing UX); `false` = caret placed at the end. */
    readonly highlight: boolean;
    /**
     * Render the value but refuse edits -- what a `readonly` cell wants.
     *
     * **This sets the textarea's `readOnly` attribute, not `disabled`, and the difference is a bug
     * fix rather than a preference.** A `disabled` textarea cannot be focused, so clicking one moves
     * focus to `<body>`; the overlay host's `keydown` listener is on the overlay *container*, so it
     * then never fires, and Escape stops closing the editor -- stranding the user in an editor with
     * no keyboard way out. That is upstream
     * [#910](https://github.com/glideapps/glide-data-grid/issues/910), whose own unmerged fix
     * ([PR #915](https://github.com/glideapps/glide-data-grid/pull/915)) reaches for `readOnly` for
     * exactly this reason. `readOnly` keeps the element focusable and its text selectable -- so a
     * read-only cell's contents can now also be selected and copied, which `disabled` prevented.
     *
     * Was named `disabled` (after the attribute it used to set) until 2026-08-14.
     */
    readonly readOnly?: boolean;
    readonly placeholder?: string;
    /** Adds the `gdg-input-wrapping` class to the input box, which pads it -- mirrors source's
     * `text-cell.tsx` passing `style={{padding: "3px 8.5px"}}` when `cell.allowWrapping === true`
     * (the shadow box keeps its own fixed padding regardless, matching source: the `style` prop
     * only ever reached `InputBox`, never `ShadowBox`). Was a free-form `padding` string until the
     * stylesheet migration; a boolean + class is the same two states, restylable by a consumer. */
    readonly wrapping?: boolean;
    /** Shift+Enter inserts a literal newline instead of being forwarded to `onKeyDown` -- mirrors
     * source's `altNewline` prop (`text-cell.tsx` passes `true`; number/row-id don't). */
    readonly altNewline?: boolean;
    readonly validatedSelection?: SelectionRange;
    readonly onChange: (value: string) => void;
    /** Forwarded from the textarea's own `keydown`, after the `altNewline` shift+Enter carve-out
     * above -- the overlay host uses this for Escape/Enter/Tab commit-or-cancel handling. */
    readonly onKeyDown?: (ev: KeyboardEvent) => void;
}

/** @category Renderers */
export class GrowingEntry {
    readonly element: HTMLDivElement;
    private readonly textareaEl: HTMLTextAreaElement;
    private readonly shadowEl: HTMLDivElement;
    private readonly highlight: boolean;
    private readonly validatedSelection: SelectionRange | undefined;

    constructor(options: GrowingEntryOptions) {
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
    get value(): string {
        return this.textareaEl.value;
    }

    private syncShadow(): void {
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
    focus(): void {
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

    destroy(): void {
        this.element.remove();
    }
}
