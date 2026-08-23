import { expect, test } from "@playwright/test";
import { openFullGridDemo } from "./helpers.ts";

// CLAUDE.md records that raw DOM-dispatched keydown/paste events (the claude-in-chrome harness's
// technique) reach the controller but don't land a write, and that this is a harness artifact rather
// than a regression. Playwright drives real input through the browser's own input pipeline (CDP for
// Chromium), which is a materially different mechanism -- this test exists specifically to settle
// whether an edit committed through Playwright actually sticks, which is one of the evidence gaps
// 9p was proposed to close (see PHASES.md's 9p section).
test("typing into an opened cell editor and pressing Enter commits the edit", async ({ page }) => {
    await openFullGridDemo(page);

    // `apiAppendRow` (`data-test-api-append-row`) calls `gridApi.appendRow(1)`, which appends a row
    // and focuses column 1's editor -- sidesteps computing canvas-relative pixel coordinates for an
    // arbitrary column entirely, since the grid does that part itself.
    await page.click("[data-test-api-append-row]");
    await expect(page.locator("[data-test-last-api-result]")).toContainText("editor open");

    const editorInput = page.locator(".gdg-overlay-editor textarea.gdg-input").first();
    await expect(editorInput).toBeVisible();
    await editorInput.fill("");
    await editorInput.type("123456");
    await page.keyboard.press("Enter");

    await expect(page.locator("[data-test-last-edit-finish]")).toHaveText(/^committed,/);
});

test("Escape cancels an open editor without committing", async ({ page }) => {
    await openFullGridDemo(page);

    await page.click("[data-test-api-append-row]");
    await expect(page.locator("[data-test-last-api-result]")).toContainText("editor open");

    const editorInput = page.locator(".gdg-overlay-editor textarea.gdg-input").first();
    await expect(editorInput).toBeVisible();
    await editorInput.type("999999");
    await page.keyboard.press("Escape");

    await expect(page.locator("[data-test-last-edit-finish]")).toHaveText(/^cancelled,/);
});
