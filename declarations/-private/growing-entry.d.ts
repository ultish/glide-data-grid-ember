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
export declare class GrowingEntry {
    readonly element: HTMLDivElement;
    private readonly textareaEl;
    private readonly shadowEl;
    private readonly highlight;
    private readonly validatedSelection;
    constructor(options: GrowingEntryOptions);
    /** Current textarea content. */
    get value(): string;
    private syncShadow;
    /** Focuses the textarea and, per `highlight`, either selects all content or places the caret
     * at the end -- mirrors source's mount-time `React.useEffect`. Requires `element` to already
     * be attached to the document (a detached `<textarea>` cannot receive focus), so the overlay
     * host calls this only after appending `element` into the DOM.
     *
     * **Read-only entries are focused too.** This used to bail when the textarea was `disabled`,
     * which it had to -- a disabled element cannot take focus. Under `readOnly` it can, and it must:
     * that focus is what keeps Escape working (see `readOnly` above, upstream #910). */
    focus(): void;
    destroy(): void;
}
//# sourceMappingURL=growing-entry.d.ts.map