// Phase 9 (DaisyUI/Tailwind theming). Builds a grid `Theme` out of CSS custom properties resolved
// off a real DOM element, and keeps it in sync when the page's theme changes underneath it.
//
// **The addon knows nothing about DaisyUI**, and must not: this is a generic
// "resolve these CSS expressions into these theme fields" bridge. DaisyUI is a *consumer* choice
// and lives in `test-app` only, exactly as `object-scan` does (see PHASES.md's Phase 8 brief for
// that precedent). What makes DaisyUI work here is not special-casing but two ordinary facts:
// its palette is exposed as inheritable custom properties, and since the OKLCH fix in
// `color-parser.ts` the grid can parse the `oklch()` values it stores in them.
//
// WHY THIS LIVES IN THE ADDON AT ALL, rather than being consumer boilerplate: the identity rule
// below is not discoverable from outside. `theme` is one of `computeCanBlit`'s ~18
// identity-compared `DrawGridArg` fields, so a consumer who re-derives their theme object on every
// `MutationObserver` callback -- the obvious implementation -- silently disables the scroll blit
// fast path with no error and no visual difference. That is the single defect class this project
// has proven it cannot catch by looking (undetected Phase 2 -> Phase 6). Encoding the rule once,
// here, is much cheaper than every consumer rediscovering it.
import type { Theme } from "./theme.ts";

/**
 * Which `Theme` fields a CSS mapping may target: the ones whose values are colour strings.
 *
 * Deliberately not every `string` field -- `fontFamily`, `headerFontStyle` and friends are strings
 * too, but they are not colours and resolving them through a colour probe would silently yield
 * black. Keeping the type honest means a typo lands as a type error rather than a black grid.
 */
export type ThemeColorKey =
    | "accentColor"
    | "accentFg"
    | "accentLight"
    | "textDark"
    | "textMedium"
    | "textLight"
    | "textBubble"
    | "bgIconHeader"
    | "fgIconHeader"
    | "textHeader"
    | "textGroupHeader"
    | "bgGroupHeader"
    | "bgGroupHeaderHovered"
    | "textHeaderSelected"
    | "bgCell"
    | "bgCellMedium"
    | "bgHeader"
    | "bgHeaderHasFocus"
    | "bgHeaderHovered"
    | "bgBubble"
    | "bgBubbleSelected"
    | "bgSearchResult"
    | "borderColor"
    | "horizontalBorderColor"
    | "drilldownBorder"
    | "linkColor"
    | "headerBottomBorderColor"
    | "resizeIndicatorColor";

/**
 * Theme field -> CSS expression, e.g. `{ accentColor: "var(--color-primary)" }`.
 *
 * The expression is anything valid in a `color:` declaration, so `var(--x)`,
 * `var(--x, fallback)`, a literal `oklch(...)`, or `color-mix(...)` all work.
 */
export type CssThemeMapping = Partial<Record<ThemeColorKey, string>>;

/**
 * Resolves a CSS colour expression against `element`'s cascade and returns a concrete colour
 * string (whatever the browser computes -- typically `rgb(...)`, but `oklch(...)` in Chrome).
 *
 * Returns `undefined` when the expression does not resolve to a usable colour, which is the case
 * that matters: an unset custom property must not quietly become black. Callers skip the field
 * instead, leaving the base theme's value in place.
 *
 * The probe is appended **inside `element`** rather than to `<body>`, because custom properties
 * are inherited -- a `[data-theme]` attribute set on a subtree is only visible to a probe within
 * that subtree.
 */
export function resolveCssColor(element: HTMLElement, expression: string): string | undefined {
    const probe = document.createElement("span");
    probe.style.display = "none";
    // Two-pass validity check, the same technique `parseToRgba` uses: set a known colour first, then
    // the expression. If the computed value is unchanged from a *different* starting colour, the
    // expression did not resolve to anything and the browser kept the inherited value.
    element.appendChild(probe);
    try {
        probe.style.color = "rgb(0, 0, 0)";
        probe.style.color = expression;
        const first = getComputedStyle(probe).color;

        probe.style.color = "rgb(255, 255, 255)";
        probe.style.color = expression;
        const second = getComputedStyle(probe).color;

        if (first !== second) return undefined;
        return first;
    } finally {
        probe.remove();
    }
}

/**
 * Resolves every entry in `mapping` against `element` and returns the theme overlay.
 *
 * Unresolvable entries are omitted rather than defaulted, so a partial or misspelled mapping
 * degrades to "that field keeps its built-in value" instead of to black.
 */
export function themeFromCss(element: HTMLElement, mapping: CssThemeMapping): Partial<Theme> {
    const out: Record<string, string> = {};
    for (const [key, expression] of Object.entries(mapping)) {
        if (expression === undefined) continue;
        const resolved = resolveCssColor(element, expression);
        if (resolved !== undefined) out[key] = resolved;
    }
    return out;
}

/**
 * Shallow structural comparison of two theme overlays.
 *
 * Pure and exported so it can be unit-tested in bare Node -- it is the part of this module that
 * carries the actual correctness requirement, since it decides whether a *new* object identity is
 * published. Everything else here touches the DOM and cannot be tested that way.
 */
export function themeOverlaysEqual(a: Partial<Theme>, b: Partial<Theme>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if (a[key as keyof Theme] !== b[key as keyof Theme]) return false;
    }
    return true;
}

export interface CssThemeWatcherOptions {
    /** The element whose cascade the mapping resolves against, and whose attribute is watched.
     *  For DaisyUI this is usually `document.documentElement`. */
    readonly element: HTMLElement;
    /** Theme field -> CSS expression. */
    readonly mapping: CssThemeMapping;
    /** Fired **only when a resolved value actually changed** -- see the class doc. */
    readonly onChange: (theme: Partial<Theme>) => void;
    /** Attribute to watch on `element`. Defaults to `data-theme`, which is what DaisyUI and most
     *  theme switchers toggle. Pass `[]` to watch nothing and drive `refresh()` yourself. */
    readonly attributes?: readonly string[];
}

/**
 * Keeps a theme overlay in sync with the page's CSS, and **publishes a new object identity only
 * when something genuinely changed**.
 *
 * That last part is the whole reason this class exists rather than being three lines of consumer
 * code. `theme` is identity-compared by `computeCanBlit`; emitting a fresh object on every
 * `MutationObserver` callback would defeat the scroll blit fast path permanently, invisibly, and
 * for as long as the app runs. Here, an attribute mutation that does not change any resolved
 * colour -- toggling `data-theme` between two values with the same palette, or any unrelated
 * attribute write -- produces no callback at all.
 *
 * ```ts
 * const watcher = new CssThemeWatcher({
 *     element: document.documentElement,
 *     mapping: { accentColor: "var(--color-primary)", bgCell: "var(--color-base-100)" },
 *     onChange: theme => (this.theme = theme),
 * });
 * this.theme = watcher.theme;   // initial value
 * // ...and `watcher.destroy()` on teardown.
 * ```
 */
export class CssThemeWatcher {
    private current: Partial<Theme>;
    private readonly observer: MutationObserver | undefined;
    private readonly options: CssThemeWatcherOptions;
    private destroyed = false;

    constructor(options: CssThemeWatcherOptions) {
        this.options = options;
        this.current = themeFromCss(options.element, options.mapping);

        const attributes = options.attributes ?? ["data-theme"];
        if (attributes.length > 0) {
            this.observer = new MutationObserver(() => this.refresh());
            this.observer.observe(options.element, {
                attributes: true,
                attributeFilter: [...attributes],
            });
        }
    }

    /** The current overlay. Stable by identity until a real change occurs. */
    get theme(): Partial<Theme> {
        return this.current;
    }

    /**
     * Re-resolves the mapping now. Call it after changing the page's theme by some route the
     * watched attributes don't cover (swapping a stylesheet, say). Returns `true` if the theme
     * actually changed, which is also when `onChange` fires.
     */
    refresh(): boolean {
        if (this.destroyed) return false;
        const next = themeFromCss(this.options.element, this.options.mapping);
        if (themeOverlaysEqual(this.current, next)) return false;
        this.current = next;
        this.options.onChange(next);
        return true;
    }

    destroy(): void {
        this.destroyed = true;
        this.observer?.disconnect();
    }
}
