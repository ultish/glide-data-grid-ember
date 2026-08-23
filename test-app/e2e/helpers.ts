import type { Locator, Page } from "@playwright/test";

/** Switches to the "Full grid demo" tab (`<DemoGrid>`) and waits for its canvas to have real size.
 *  A freshly-navigated/backgrounded tab can report a 0x0 canvas for a beat -- see CLAUDE.md's
 *  occlusion-trap note -- so this waits on the bounding box rather than a fixed timeout. */
export async function openFullGridDemo(page: Page): Promise<Locator> {
    await page.goto("/");
    await page.click("[data-test-show-full-grid]");
    const canvas = page.locator(".dvn-underlay canvas").first();
    await canvas.waitFor({ state: "visible" });
    await expectNonZeroSize(canvas);
    return canvas;
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
