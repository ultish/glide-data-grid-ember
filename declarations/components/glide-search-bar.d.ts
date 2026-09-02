import Component from "@glimmer/component";
import { htmlSafe } from "@ember/template";
import "./glide-search-bar.css";
import type { GlideDataGridApi } from './glide-data-grid';
import type { SearchState } from "../-private/grid-host-controller.ts";
export type { SearchState } from "../-private/grid-host-controller.ts";
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
    private isAnimatingOut;
    private closeTimer;
    private get state();
    get isVisible(): boolean;
    get isOpen(): boolean;
    get value(): string;
    get hasResults(): boolean;
    /** Source shows "Type to search" until the first chunk reports, then the result count --
     *  which is why `SearchState.status` is `undefined` rather than a zeroed object initially. */
    get statusText(): string;
    /** Percentage of the table scanned, as a width. The one value set from JS rather than CSS,
     *  because it is a live measurement rather than an enumerable state (see the 9q rule). */
    get progressStyle(): ReturnType<typeof htmlSafe>;
    private onInput;
    private onKeyDown;
    /** Swallows mouse events so clicking the bar never reaches the grid's hit-testing behind it --
     *  source wires the same four handlers on its wrapper for the same reason. */
    private swallow;
    private close;
    private focusOnOpen;
    private step;
}
//# sourceMappingURL=glide-search-bar.d.ts.map