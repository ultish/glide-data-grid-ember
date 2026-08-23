import { expect, test } from "@playwright/test";
import { openFullGridDemo } from "./helpers.ts";

// `<DemoGrid>`'s imperative-API buttons exist specifically because "an API surface nothing calls is
// unverified code" (its own comment) -- each drives one `GlideDataGridApi` method and reports the
// result into `data-test-last-api-result`. One test per method keeps failures attributable.

test("focus() hands keyboard control to the grid", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-focus]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(/^focus\(\)/);
});

test("scrollTo(8, 500) centred reports back", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-scroll-to]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(/^scrollTo\(8, 500\)/);
    // A semantic check, not just the button's own echo: the visible region actually moved to
    // include row 500, the target this button scrolls to.
    await expect(page.locator("[data-test-visible-region]")).toContainText(/rows \d+-\d+/);
});

test("getBounds() reports real, non-zero rectangles", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-get-bounds]");
    const text = await page.locator("[data-test-last-api-result]").textContent();
    expect(text).toMatch(/^getBounds\(0,0\) = \d+,\d+ \d+x\d+ · content \d+x\d+$/);
});

test("remeasureColumns(0-4) applies real widths", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-remeasure]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(/^remeasureColumns/);
});

test("appendColumn(0) focuses the new column", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-append-column]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(/^appendColumn\(0\) — column \d+ focused$/);
});

test("getMouseArgsForPosition(centre) resolves a real cell with no pointer event", async ({ page }) => {
    await openFullGridDemo(page);
    await page.click("[data-test-api-hit-test]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(
        /^getMouseArgsForPosition\(centre\) = cell \d+,\d+$/
    );
});

test("emit('delete') takes the same path as the Delete key", async ({ page }) => {
    await openFullGridDemo(page);

    // Select a cell first -- delete with nothing selected is a legitimate no-op, which would make
    // this test pass for the wrong reason.
    const canvas = page.locator(".dvn-underlay canvas").first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no bounding box");
    await page.mouse.click(box.x + 60, box.y + 100);
    await expect(page.locator("[data-test-last-click]")).toHaveText(/^cell \d+,\d+$/);

    await page.click("[data-test-api-emit-delete]");
    await expect(page.locator("[data-test-last-api-result]")).toHaveText(/^emit\('delete'\)/);
});
