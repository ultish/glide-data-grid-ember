import { expect, test } from "@playwright/test";

test("each playground and the cookbook has a URL, and the nav writes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-test-show-glide]")).toHaveClass(/btn-active/);

    await page.click("[data-test-show-cookbook]");
    await expect(page).toHaveURL(/\/cookbook\/?$/);
    await expect(page.locator("[data-test-docs-page=cookbook]")).toBeVisible();
    await expect(page.locator("[data-test-show-cookbook]")).toHaveClass(/btn-active/);

    await page.click("text=Filter from outside the grid");
    await expect(page).toHaveURL(/\/cookbook\/filter$/);
    await expect(page.locator(".gdg-cookbook__live-wrap").first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/cookbook\/?$/);
});

test("a cold load of a demo path renders that page, not the landing grid", async ({ page }) => {
    await page.goto("/full-grid");
    await expect(page).toHaveURL(/\/full-grid$/);
    await expect(page.locator("[data-test-show-full-grid]")).toHaveClass(/btn-active/);
    await expect(page.locator(".dvn-underlay canvas").first()).toBeVisible();

    await page.goto("/cookbook/daisy");
    await expect(page.locator("[data-test-docs-page=cookbook]")).toBeVisible();
    await expect(page.locator("[data-test-show-cookbook]")).toHaveClass(/btn-active/);
});

test("old demo-tab URLs redirect into the cookbook", async ({ page }) => {
    await page.goto("/daisy");
    await expect(page).toHaveURL(/\/cookbook\/daisy$/);

    await page.goto("/guide");
    await expect(page).toHaveURL(/\/cookbook\/?$/);
});

test("an unknown path redirects home", async ({ page }) => {
    await page.goto("/does-not-exist");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("[data-test-show-glide]")).toHaveClass(/btn-active/);
});

test("a cookbook chapter hash is now a path, and the live example is on screen", async ({ page }) => {
    await page.goto("/cookbook/filter");
    const live = page.locator(".gdg-cookbook__live-wrap").first();
    await expect(live).toBeVisible();
    await expect(page.locator(".gdg-cookbook__controls input[type='range']")).toBeVisible();
});
