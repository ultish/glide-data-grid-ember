import { expect, test } from "@playwright/test";
import { openFullGridDemo } from "./helpers.ts";

// `cellActivationBehavior` only has an observable difference by actually clicking, which is exactly
// why `<DemoGrid>`'s own comment gives it a cycling toggle instead of a written-down claim.

test("second-click (the default): one click selects, it does not open the editor", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await expect(page.locator("[data-test-activation-behavior-toggle] b")).toHaveText("second-click");

    // Column 1 (Salary, a Number cell with `allowOverlay: true`) -- past the row-marker column and
    // column 0 (a `RowID` cell with `allowOverlay: false`, so it can't stand in for this test).
    await page.mouse.click(box.x + 180, box.y + 100);
    await expect(page.locator("[data-test-last-click]")).toHaveText(/^cell 1,\d+$/);
    await expect(page.locator(".gdg-overlay-editor")).toHaveCount(0);
});

test("single-click: one click both selects and opens the editor", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await page.click("[data-test-activation-behavior-toggle]");
    await expect(page.locator("[data-test-activation-behavior-toggle] b")).toHaveText("single-click");

    await page.mouse.click(box.x + 180, box.y + 100);
    await expect(page.locator("[data-test-last-click]")).toHaveText(/^cell 1,\d+$/);
    await expect(page.locator(".gdg-overlay-editor")).toBeVisible();
});
