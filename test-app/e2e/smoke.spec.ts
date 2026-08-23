import { expect, test } from "@playwright/test";
import { openFullGridDemo, samplePixel } from "./helpers.ts";

test("the app loads and every demo tab switches without a console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => {
        if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.locator("[data-test-show-full-grid]")).toBeVisible();

    const tabs = [
        "[data-test-show-glide]",
        "[data-test-show-full-grid]",
        "[data-test-show-tracking]",
        "[data-test-show-streaming]",
        "[data-test-show-composed]",
        "[data-test-show-async]",
        "[data-test-show-apollo]",
        "[data-test-show-daisy]",
        "[data-test-tab-shadow]",
        "[data-test-show-guide]",
        "[data-test-show-cookbook]",
    ];
    for (const tab of tabs) {
        await page.click(tab);
        // Let each demo's own onReady/data setup settle before moving on.
        await page.waitForTimeout(200);
    }

    expect(errors).toEqual([]);
});

test("the full grid demo paints real content, not a blank canvas", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    // Sample a handful of points across a data row -- if the canvas were blank (the fractional-
    // height bug this demo deliberately keeps exercising, see demo-switcher.gts) every sample would
    // be identical background. Real cell content -- borders, text, row-marker checkboxes, the
    // Employee ID accent colour -- guarantees some variation.
    const y = box.height / 2;
    const samples = await Promise.all([40, 200, 400, 600, 900].map(x => samplePixel(canvas, x, y)));
    const distinctColors = new Set(samples.map(s => `${s.r},${s.g},${s.b}`));
    expect(distinctColors.size).toBeGreaterThan(1);
});
