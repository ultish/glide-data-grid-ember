import { expect, test } from "@playwright/test";
import { openFullGridDemo, PRIMARY } from "./helpers.ts";

test("Escape clears the selection and fires onSelectionCleared", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await page.mouse.click(box.x + 60, box.y + 100);
    await expect(page.locator("[data-test-last-click]")).toHaveText(/^cell \d+,\d+$/);

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-test-selection-summary]")).toHaveText("none");
    await expect(page.locator("[data-test-selection-cleared]")).not.toHaveText("—");
});

test("Tab and Shift+Tab move the selection by one column", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await page.mouse.click(box.x + 60, box.y + 100);
    const startText = await page.locator("[data-test-last-click]").textContent();
    const [, colStr, rowStr] = /^cell (\d+),(\d+)$/.exec(startText ?? "") ?? [];
    const col = Number(colStr);
    const row = Number(rowStr);

    await page.keyboard.press("Tab");
    await expect(page.locator("[data-test-selection-summary]")).toContainText(`cell ${col + 1},${row}`);

    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("[data-test-selection-summary]")).toContainText(`cell ${col},${row}`);
});

test(`${PRIMARY}+A selects the whole grid`, async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await page.mouse.click(box.x + 60, box.y + 100);
    await page.keyboard.down(PRIMARY);
    await page.keyboard.press("a");
    await page.keyboard.up(PRIMARY);

    // A single cell's selection reads "cell x,y"; selecting everything produces a multi-row,
    // multi-column range instead -- the shape of the summary is itself the assertion.
    await expect(page.locator("[data-test-selection-summary]")).toContainText(/^range \d+x\d+/);
});

test("shift+click extends the selection into a range", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await page.mouse.click(box.x + 60, box.y + 100);
    await page.keyboard.down("Shift");
    await page.mouse.click(box.x + 60, box.y + 160);
    await page.keyboard.up("Shift");

    await expect(page.locator("[data-test-selection-summary]")).toContainText(/^range \d+x\d+ at/);
});
