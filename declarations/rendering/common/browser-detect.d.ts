declare class Lazy<T> {
    private fn;
    private val;
    constructor(fn: () => T);
    get value(): T;
}
export declare const browserIsFirefox: Lazy<boolean>;
export declare const browserIsSafari: Lazy<boolean>;
export declare const browserIsOSX: Lazy<boolean>;
/**
 * **Not in source.** Added for `@enableChromeRescaling`, this port's extension of source's
 * Firefox/Safari-only scroll-time DPR cap — see `GridHostArgs.enableChromeRescaling`.
 *
 * Deliberately matches Chromium as a family (Edge, Brave, Opera, Arc) rather than Chrome
 * specifically: the reason the cap helps is the canvas fill cost at high `devicePixelRatio`, which
 * every Chromium browser shares. `Chrome` appears in the Edge and Opera user agents too, so the only
 * exclusion needed is Safari, which carries `Safari` but not `Chrome`.
 */
export declare const browserIsChromium: Lazy<boolean>;
export {};
//# sourceMappingURL=browser-detect.d.ts.map