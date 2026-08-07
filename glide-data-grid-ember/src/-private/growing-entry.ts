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
    readonly theme: FullTheme;
    /** `true` = select-all on mount (overwrite-by-typing UX); `false` = caret placed at the end. */
    readonly highlight: boolean;
    readonly disabled?: boolean;
    readonly placeholder?: string;
    /** Extra inline padding on the input box itself -- mirrors source's `text-cell.tsx` passing
     * `style={{padding: "3px 8.5px"}}` when `cell.allowWrapping === true` (the shadow box keeps
     * its own fixed padding regardless, matching source: the `style` prop only ever reached
     * `InputBox`, never `ShadowBox`). */
    readonly padding?: string;
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
        const { theme } = options;
        this.highlight = options.highlight;
        this.validatedSelection = options.validatedSelection;

        this.element = document.createElement("div");
        this.element.className = "gdg-growing-entry";
        Object.assign(this.element.style, {
            position: "relative",
            marginTop: "6px",
        } satisfies Partial<CSSStyleDeclaration>);

        this.shadowEl = document.createElement("div");
        Object.assign(this.shadowEl.style, {
            visibility: "hidden",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            width: "max-content",
            maxWidth: "100%",
            minWidth: "100%",
            fontSize: theme.editorFontSize,
            lineHeight: "16px",
            fontFamily: theme.fontFamily,
            color: theme.textDark,
            padding: "0",
            margin: "0",
            paddingBottom: "2px",
        } satisfies Partial<CSSStyleDeclaration>);

        this.textareaEl = document.createElement("textarea");
        this.textareaEl.className = "gdg-input";
        this.textareaEl.dir = "auto";
        Object.assign(this.textareaEl.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            bottom: "0",
            width: "100%",
            height: "100%",
            borderRadius: "0px",
            resize: "none",
            whiteSpace: "pre-wrap",
            minWidth: "100%",
            overflow: "hidden",
            border: "0",
            outline: "none",
            backgroundColor: "transparent",
            fontSize: theme.editorFontSize,
            lineHeight: "16px",
            fontFamily: theme.fontFamily,
            color: theme.textDark,
            padding: options.padding ?? "0",
            margin: "0",
        } satisfies Partial<CSSStyleDeclaration>);
        if (options.placeholder !== undefined) this.textareaEl.placeholder = options.placeholder;
        if (options.disabled === true) this.textareaEl.disabled = true;

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
     * host calls this only after appending `element` into the DOM. */
    focus(): void {
        if (this.textareaEl.disabled) return;
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
