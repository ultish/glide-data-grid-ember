// Phase 9p. Deliberately optional, deliberately narrow for now: only the deterministic technique
// (DOM status readouts + canvas pixel-probing via getImageData) is wired up. `toHaveScreenshot()`
// visual-regression tests were considered and dropped for this first landing -- baselines are
// machine-specific (font rasterisation, GPU, dpr) and would need to be generated *on* a CI runner to
// be trustworthy there, which is follow-up work, not part of standing this up. See PORTING-NOTES.md
// "9p -- Playwright" for the full writeup.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // Canvas hit-testing depends on real layout/paint timing; running specs one-at-a-time on CI
    // trades a little wall-clock for not fighting over CPU with the grid's own draw loop.
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: "on-first-retry",
    },
    // The dev server, not `vite build && vite preview` -- every browser check this project has ever
    // done (CLAUDE.md's whole browser-testing section) goes through the dev server, and it turns
    // out that isn't incidental: a served *production* build crashes at boot (`window.require is
    // not a function`, from `/@embroider/virtual/vendor.js`'s non-`type="module"` script tag, which
    // `vite build`'s own warning already names). Nothing had ever loaded that build in a browser to
    // notice -- see PORTING-NOTES.md's "9p -- Playwright" section, filed as a real (if low-severity)
    // defect rather than fixed here.
    webServer: {
        command: `pnpm exec vite --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
