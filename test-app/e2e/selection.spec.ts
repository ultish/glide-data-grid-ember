import { expect, test } from "@playwright/test";
import { openFullGridDemo } from "./helpers.ts";

test("clicking a cell reports it in the status row, and arrow keys move the selection", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    // A click well inside the first data row/column -- comfortably below the header band (whose
    // height varies with theme/toggles) and away from any edge a resize handle could grab instead.
    await page.mouse.click(box.x + 60, box.y + 100);
    await expect(page.locator("[data-test-last-click]")).toHaveText(/^cell \d+,\d+$/);

    const firstClickText = await page.locator("[data-test-last-click]").textContent();
    const [, colStr, rowStr] = /^cell (\d+),(\d+)$/.exec(firstClickText ?? "") ?? [];
    const col = Number(colStr);
    const row = Number(rowStr);

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    await expect(page.locator("[data-test-selection-summary]")).toContainText(`cell ${col + 1},${row}`);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(100);
    await expect(page.locator("[data-test-selection-summary]")).toContainText(`cell ${col + 1},${row + 1}`);
});
