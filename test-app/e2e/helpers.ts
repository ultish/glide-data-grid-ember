import type { Locator, Page } from "@playwright/test";

/** `primary+...` keybindings (`rendering/keybindings.ts`) resolve to Meta on macOS and Control
 *  everywhere else, read from the real host platform the way the grid itself does (`navigator
 *  .platform` inside the browser) -- so tests are correct both on a macOS dev machine and on CI's
 *  Linux runner without hardcoding either. */
export const PRIMARY = process.platform === "darwin" ? "Meta" : "Control";

/** Navigates to a path and waits for its grid's canvas to have real size. A freshly-navigated
 *  page can report a 0x0 canvas for a beat -- see CLAUDE.md's occlusion-trap note -- so this waits
 *  on the canvas gaining size rather than a fixed timeout. Playwright's CSS locators pierce open
 *  shadow roots by default. */
export async function openPath(page: Page, path: string): Promise<Locator> {
    await page.goto(path);
    const canvas = page.locator(".dvn-underlay canvas").first();
    await canvas.waitFor({ state: "visible" });
    await expectNonZeroSize(canvas);
    return canvas;
}

/** Switches to a demo tab (by its `data-test-show-*` selector) and waits for its grid's canvas. */
export async function openDemoTab(page: Page, tabSelector: string): Promise<Locator> {
    await page.goto("/");
    await page.click(tabSelector);
    const canvas = page.locator(".dvn-underlay canvas").first();
    await canvas.waitFor({ state: "visible" });
    await expectNonZeroSize(canvas);
    return canvas;
}

/** The "Full grid demo" tab (`<DemoGrid>`) specifically -- the tab every other spec in this suite
 *  exercises, since it is the one demo with every arg wired in (see CLAUDE.md's Phase 10 note). */
export async function openFullGridDemo(page: Page): Promise<Locator> {
    return openDemoTab(page, "[data-test-show-full-grid]");
}

async function expectNonZeroSize(canvas: Locator): Promise<void> {
    await canvas.evaluate(async (el: HTMLCanvasElement) => {
        const start = Date.now();
        while ((el.width === 0 || el.height === 0) && Date.now() - start < 5000) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        if (el.width === 0 || el.height === 0) {
            throw new Error(`canvas never gained real size (width=${el.width}, height=${el.height})`);
        }
    });
}

/** Samples one backing-store pixel at the given *CSS* offset from the canvas's top-left, correcting
 *  for `devicePixelRatio` -- the addon's canvas backing store is DPR-scaled (see PORTING-NOTES.md's
 *  Chrome scroll-time DPR-capping section), so a naive 1:1 read samples the wrong texel on any
 *  non-1x display. */
export async function samplePixel(
    canvas: Locator,
    cssX: number,
    cssY: number
): Promise<{ r: number; g: number; b: number; a: number }> {
    return canvas.evaluate(
        (el: HTMLCanvasElement, point: { x: number; y: number }) => {
            const dpr = window.devicePixelRatio || 1;
            const ctx = el.getContext("2d");
            if (ctx === null) throw new Error("canvas has no 2d context");
            const data = ctx.getImageData(Math.floor(point.x * dpr), Math.floor(point.y * dpr), 1, 1).data;
            return { r: data[0], g: data[1], b: data[2], a: data[3] };
        },
        { x: cssX, y: cssY }
    );
}

/** Samples a dense grid of pixels within a *CSS* rectangle and returns the set of distinct colours
 *  seen. A handful of hand-picked sample points (`samplePixel`) can miss real content on a demo with
 *  plain text-on-white cells -- glyphs are thin strokes, and an unlucky point lands on background far
 *  more often than ink. A dense grid is all but guaranteed to cross a glyph's antialiased edge or a
 *  gridline if the region has any content at all, without needing to know that demo's exact layout. */
export async function sampleGridColors(
    canvas: Locator,
    rect: { x: number; y: number; width: number; height: number },
    step = 6
): Promise<Set<string>> {
    const colors = await canvas.evaluate(
        (
            el: HTMLCanvasElement,
            args: { rect: { x: number; y: number; width: number; height: number }; step: number }
        ) => {
            const dpr = window.devicePixelRatio || 1;
            const ctx = el.getContext("2d");
            if (ctx === null) throw new Error("canvas has no 2d context");
            const seen = new Set<string>();
            for (let y = args.rect.y; y < args.rect.y + args.rect.height; y += args.step) {
                for (let x = args.rect.x; x < args.rect.x + args.rect.width; x += args.step) {
                    const d = ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data;
                    seen.add(`${d[0]},${d[1]},${d[2]}`);
                }
            }
            return [...seen];
        },
        { rect, step }
    );
    return new Set(colors);
}
