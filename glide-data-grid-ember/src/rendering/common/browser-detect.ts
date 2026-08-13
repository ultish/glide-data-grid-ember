class Lazy<T> {
    private fn: () => T;
    private val: T | undefined;
    constructor(fn: () => T) {
        this.fn = fn;
    }

    public get value() {
        return this.val ?? (this.val = this.fn());
    }
}

function lazy<T>(fn: () => T) {
    return new Lazy(fn);
}

// next.js apps don't have window available at import time, so this will fail if its not lazy.
export const browserIsFirefox = lazy(() => window.navigator.userAgent.includes("Firefox"));
export const browserIsSafari = lazy(
    () =>
        window.navigator.userAgent.includes("Mac OS") &&
        window.navigator.userAgent.includes("Safari") &&
        !window.navigator.userAgent.includes("Chrome")
);
export const browserIsOSX = lazy(() => window.navigator.platform.toLowerCase().startsWith("mac"));

/**
 * **Not in source.** Added for `@enableChromeRescaling`, this port's extension of source's
 * Firefox/Safari-only scroll-time DPR cap — see `GridHostArgs.enableChromeRescaling`.
 *
 * Deliberately matches Chromium as a family (Edge, Brave, Opera, Arc) rather than Chrome
 * specifically: the reason the cap helps is the canvas fill cost at high `devicePixelRatio`, which
 * every Chromium browser shares. `Chrome` appears in the Edge and Opera user agents too, so the only
 * exclusion needed is Safari, which carries `Safari` but not `Chrome`.
 */
export const browserIsChromium = lazy(
    () => window.navigator.userAgent.includes("Chrome") && !window.navigator.userAgent.includes("Firefox")
);
