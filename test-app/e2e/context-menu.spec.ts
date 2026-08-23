import { expect, test } from "@playwright/test";
import { openFullGridDemo } from "./helpers.ts";

test("right-clicking a cell opens a context menu labelled with that cell, and Close dismisses it", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    await expect(page.locator("[data-test-context-menu]")).toHaveCount(0);

    await page.mouse.click(box.x + 60, box.y + 100, { button: "right" });
    const menu = page.locator("[data-test-context-menu]");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".gdg-demo-sort-menu__title")).toHaveText(/^Cell \d+, \d+$/);

    await menu.getByRole("button", { name: "Close" }).click();
    await expect(menu).toHaveCount(0);
});

test("right-clicking the group header band opens a menu labelled with that column", async ({ page }) => {
    const canvas = await openFullGridDemo(page);
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");

    // `<DemoGrid>` has a *group* header band above the plain per-column one (the "Identity" /
    // "Content" strip). The plain header row underneath it is only a few px tall in this layout and
    // its own boundary proved unstable to target by fixed pixel offset across runs -- the group band
    // is comfortably wide and reliably reachable, and still exercises a distinct callback
    // (`@onGroupHeaderContextMenu`, not `@onHeaderContextMenu`).
    await page.mouse.click(box.x + 60, box.y + 30, { button: "right" });
    const menu = page.locator("[data-test-context-menu]");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".gdg-demo-sort-menu__title")).toHaveText(/^Group header over column \d+$/);
});
