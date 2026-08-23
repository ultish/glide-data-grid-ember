import { expect, test } from "@playwright/test";
import { openFullGridDemo, PRIMARY } from "./helpers.ts";

test(`${PRIMARY}+F opens the search bar, finds results, and Escape closes it`, async ({ page }) => {
    const canvas = await openFullGridDemo(page);

    const searchInput = page.getByLabel("Search", { exact: true });
    await expect(searchInput).toBeHidden();

    // The grid's own keydown listener lives on its root element, which needs real DOM focus first --
    // otherwise the primary+F keydown never reaches it at all (nothing else in this demo would have
    // focus yet on a fresh page load).
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");
    await page.mouse.click(box.x + 60, box.y + 100);

    await page.keyboard.down(PRIMARY);
    await page.keyboard.press("f");
    await page.keyboard.up(PRIMARY);
    await expect(searchInput).toBeFocused();
    await expect(page.locator(".gdg-search-status")).toHaveText("Type to search");

    // "March" appears throughout the Notes column's filler text ("Renewal due in **March**"), so
    // this is guaranteed to produce results without depending on any specific row.
    await searchInput.fill("March");
    await expect(page.locator(".gdg-search-status")).not.toHaveText("Type to search");
    await expect(page.locator(".gdg-search-status")).toHaveText(/result/);
    await expect(page.getByLabel("Next result")).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(searchInput).toBeHidden();
});
