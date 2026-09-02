import { expect, test } from "@playwright/test";
import { openFullGridDemo, samplePixel } from "./helpers.ts";

test("the app loads and every nav target switches without a console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => {
        if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.locator("[data-test-show-full-grid]")).toBeVisible();

    const tabs = ["[data-test-show-glide]", "[data-test-show-full-grid]", "[data-test-show-cookbook]"];
    for (const tab of tabs) {
        await page.click(tab);
        await page.waitForTimeout(200);
    }

    await page.goto("/cookbook/first-grid");
    await page.waitForTimeout(200);
    await page.goto("/cookbook/filter");
    await page.waitForTimeout(200);
    await page.goto("/cookbook/daisy");
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
});

test("the full grid demo paints real content, not a blank canvas", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    const y = box.height / 2;
    const samples = await Promise.all([40, 200, 400, 600, 900].map(x => samplePixel(canvas, x, y)));
    const distinctColors = new Set(samples.map(s => `${s.r},${s.g},${s.b}`));
    expect(distinctColors.size).toBeGreaterThan(1);
});
