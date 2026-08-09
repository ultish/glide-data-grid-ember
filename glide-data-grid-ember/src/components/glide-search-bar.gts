// `<GlideSearchBar>` -- the opt-in search UI (Phase 9e-c).
//
// **Opt-in is the whole design.** The engine lives in the grid (`GridHostController` +
// `rendering/search.ts`); this component is one way to drive it. A consumer who wants their own UI
// ignores this file entirely, subscribes to `@onSearchStateChange` and calls the same six API
// methods. That split was the open decision in PHASES.md's 9e, settled with the user on 2026-08-08:
// source ships the whole overlay, this port's header-menu precedent ships nothing, and the agreed
// answer is to ship something that works out of the box without making it the only path.
//
// Source's equivalent is fused into `data-grid-search.tsx` as `@linaria/react` JSX. The markup and
// styling are ported faithfully (see `glide-search-bar.css`, which keeps source's literal class
// names); the *state* is not ported at all, because it lives in the controller now.
//
// Unlike the overlay editors -- which are imperative DOM factories because `GridHostController` has
// no Ember context (see `growing-entry.ts`'s header) -- this is a real `.gts` component. It has an
// owner: the consumer renders it themselves, in their own template, alongside the grid.
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { fn } from "@ember/helper";
import { modifier } from "ember-modifier";
import { htmlSafe } from "@ember/template";
// Its own stylesheet, so a consumer who never renders the bar never ships its CSS -- unlike the
// editor sheets, which the grid always needs.
import "./glide-search-bar.css";
import { formatSearchStatus } from "../rendering/search.ts";
import type { GlideDataGridApi } from "./glide-data-grid.gts";
import type { SearchState } from "../-private/grid-host-controller.ts";

// Re-exported so consumers never have to reach into `-private/` for it. `SearchState` is defined
// on the controller because that is what produces it, but it is part of the public contract of
// both this component and `<GlideDataGrid>`'s `@onSearchStateChange`.
export type { SearchState } from "../-private/grid-host-controller.ts";

// Focus the input as soon as it is inserted. The bar is only ever mounted while search is open, so
// "on insert" is exactly "on open" -- no `showSearch` watching needed, unlike source's effect.
const autofocus = modifier((element: HTMLInputElement, [focus]: [(el: HTMLInputElement) => void]) => {
    focus(element);
});

export interface GlideSearchBarSignature {
    Element: HTMLDivElement;
    Args: {
        /**
         * The API object handed to `<GlideDataGrid>`'s `@onReady`. The bar calls
         * `setSearchValue` / `searchNext` / `searchPrev` / `closeSearch` on it.
         *
         * May be `undefined` on the first render, before the grid has built its controller -- the
         * bar renders nothing until it arrives, so a consumer can pass a `@tracked` field directly
         * without guarding.
         */
        api?: GlideDataGridApi;
        /**
         * The most recent `SearchState` from the grid's `@onSearchStateChange`. This is the only
         * input the bar renders from; it holds no search state of its own.
         */
        state?: SearchState;
    };
}

/**
 * Render it in `<GlideDataGrid>`'s block, which puts it inside the grid's own root element:
 *
 * ```hbs
 * <GlideDataGrid @columns={{this.columns}} ... as |grid|>
 *   <GlideSearchBar @api={{grid.api}} @state={{grid.searchState}} />
 * </GlideDataGrid>
 * ```
 *
 * That is the only supported placement, and it is not a style preference: the bar's stylesheet is
 * scoped under `.gdg-root` and its colours come from the `--gdg-*` variables stamped on that same
 * element, so a bar rendered anywhere else gets neither. No wrapper, no `position: relative`, and
 * no `@onReady` plumbing needed -- the block yields both values.
 */
export default class GlideSearchBar extends Component<GlideSearchBarSignature> {
    // Kept only so the bar can animate out rather than vanishing: source does the same, holding the
    // element mounted with an `out` class for the 150ms the keyframes run. Purely presentational --
    // it never gates any behaviour.
    @tracked private isAnimatingOut = false;
    private closeTimer: number | undefined;

    private get state(): SearchState | undefined {
        return this.args.state;
    }

    get isVisible(): boolean {
        const open = this.state?.isOpen === true;
        if (open && this.closeTimer !== undefined) {
            // The close timer must be cancelled when search reopens during its exit animation.
            window.clearTimeout(this.closeTimer);
            // eslint-disable-next-line ember/no-side-effects
            this.closeTimer = undefined;
            // eslint-disable-next-line ember/no-side-effects
            this.isAnimatingOut = false;
        }
        return open || this.isAnimatingOut;
    }

    get isOpen(): boolean {
        return this.state?.isOpen === true;
    }

    get value(): string {
        return this.state?.value ?? "";
    }

    get hasResults(): boolean {
        return (this.state?.results.length ?? 0) > 0;
    }

    /** Source shows "Type to search" until the first chunk reports, then the result count --
     *  which is why `SearchState.status` is `undefined` rather than a zeroed object initially. */
    get statusText(): string {
        const state = this.state;
        if (state?.status === undefined) return "Type to search";
        return formatSearchStatus(state.status, state.selectedIndex);
    }

    /** Percentage of the table scanned, as a width. The one value set from JS rather than CSS,
     *  because it is a live measurement rather than an enumerable state (see the 9q rule). */
    get progressStyle(): ReturnType<typeof htmlSafe> {
        const state = this.state;
        const percent =
            state === undefined || state.rows === 0 ? 0 : Math.floor((state.rowsSearched / state.rows) * 100);
        // `htmlSafe` on a string this function itself built from a clamped integer -- no consumer
        // input reaches it.
        return htmlSafe(`width: ${percent}%`);
    }

    private onInput = (ev: Event): void => {
        this.args.api?.setSearchValue((ev.target as HTMLInputElement).value);
    };

    private onKeyDown = (ev: KeyboardEvent): void => {
        // Enter / Shift+Enter step through results; Escape closes. Everything else is left to the
        // input. `stopPropagation` matters: without it these would also reach the grid's own
        // `keydown` handler and be reinterpreted as cell navigation.
        if (ev.key === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.shiftKey) this.args.api?.searchPrev();
            else this.args.api?.searchNext();
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            this.close();
        }
    };

    /** Swallows mouse events so clicking the bar never reaches the grid's hit-testing behind it --
     *  source wires the same four handlers on its wrapper for the same reason. */
    private swallow = (ev: Event): void => {
        ev.stopPropagation();
    };

    private close = (): void => {
        this.isAnimatingOut = true;
        this.closeTimer = window.setTimeout(() => {
            this.isAnimatingOut = false;
            this.closeTimer = undefined;
        }, 150);
        this.args.api?.closeSearch();
    };

    private focusOnOpen = (element: HTMLInputElement): void => {
        // `preventScroll` matters on a virtualized grid: without it, focusing an element positioned
        // over a tall scroll container can jump the scroll position. Source passes it too.
        element.focus({ preventScroll: true });
    };

    private step = (direction: "next" | "prev"): void => {
        if (direction === "next") this.args.api?.searchNext();
        else this.args.api?.searchPrev();
    };

    <template>
        {{#if this.isVisible}}
            {{! template-lint-disable no-invalid-interactive no-pointer-down-event-binding }}
            <div
                class="gdg-search-bar {{unless this.isOpen 'gdg-search-out'}}"
                {{on "mousedown" this.swallow}}
                {{on "mouseup" this.swallow}}
                {{on "mousemove" this.swallow}}
                {{on "click" this.swallow}}
                ...attributes
            >
                <div class="gdg-search-bar-inner">
                    <input
                        type="text"
                        aria-label="Search"
                        aria-hidden="{{unless this.isOpen 'true'}}"
                        tabindex={{unless this.isOpen "-1"}}
                        value={{this.value}}
                        {{on "input" this.onInput}}
                        {{on "keydown" this.onKeyDown}}
                        {{autofocus this.focusOnOpen}}
                    />
                    <button
                        type="button"
                        aria-label="Previous result"
                        disabled={{unless this.hasResults "disabled"}}
                        {{on "click" (fn this.step "prev")}}
                    >
                        {{! Source's `upArrow` glyph, verbatim }}
                        <svg class="gdg-search-icon" viewBox="0 0 512 512">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="48"
                                d="M112 244l144-144 144 144M256 120v292"
                            />
                        </svg>
                    </button>
                    <button
                        type="button"
                        aria-label="Next result"
                        disabled={{unless this.hasResults "disabled"}}
                        {{on "click" (fn this.step "next")}}
                    >
                        {{! Source's `downArrow` glyph, verbatim }}
                        <svg class="gdg-search-icon" viewBox="0 0 512 512">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="48"
                                d="M112 268l144 144 144-144M256 392V100"
                            />
                        </svg>
                    </button>
                    <button class="btn btn-xs" type="button" aria-label="Close search" {{on "click" this.close}}>
                        {{! Source's `closeX` glyph, verbatim }}
                        <svg class="gdg-search-icon" viewBox="0 0 512 512">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="32"
                                d="M368 368L144 144M368 144L144 368"
                            />
                        </svg>
                    </button>
                </div>
                <div class="gdg-search-status">{{this.statusText}}</div>
                <div class="gdg-search-progress" style={{this.progressStyle}}></div>
            </div>
        {{/if}}
    </template>
}
