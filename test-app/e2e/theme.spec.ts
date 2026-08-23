import { expect, test } from "@playwright/test";
import { openFullGridDemo, samplePixel } from "./helpers.ts";

test("toggling light/dark theme actually changes the painted background colour", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    // A point inside an even-numbered data row, away from any row's red cell-level theme override
    // (`row % 10 === 0` in demo-data.ts) and away from the alternating-row shading some columns use.
    const x = box.width / 2;
    const y = 60;

    const before = await samplePixel(canvas, x, y);
    await page.click("[data-test-theme-toggle]");
    // The toggle flips a `@tracked` and the grid repaints on the next frame; give it one.
    await page.waitForTimeout(200);
    const after = await samplePixel(canvas, x, y);

    expect(`${after.r},${after.g},${after.b}`).not.toBe(`${before.r},${before.g},${before.b}`);
});
