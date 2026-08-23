import { expect, test } from "@playwright/test";
import { openDemoTab, sampleGridColors } from "./helpers.ts";

// The smoke test elsewhere in this suite proves every tab switches without a console error, and
// separately that the Full grid demo paints real content. Neither proves the *other* demos actually
// paint anything -- and per CLAUDE.md's rule 5 ("a feature no demo switches on is unverified code"),
// a demo tab that has only ever been checked for "no JS exception" is exactly that kind of gap. One
// pixel-variation check per tab closes it cheaply.
const DEMO_TABS: ReadonlyArray<[name: string, selector: string]> = [
    ["Glide demo grid", "[data-test-show-glide]"],
    ["Tracking proof demo", "[data-test-show-tracking]"],
    ["Streaming updates", "[data-test-show-streaming]"],
    ["Composed hooks", "[data-test-show-composed]"],
    ["Async paging", "[data-test-show-async]"],
    ["Apollo (faked)", "[data-test-show-apollo]"],
    ["DaisyUI theming", "[data-test-show-daisy]"],
    ["Shadow DOM", "[data-test-tab-shadow]"],
];

for (const [name, selector] of DEMO_TABS) {
    test(`"${name}" paints real content, not a blank canvas`, async ({ page }) => {
        const canvas = await openDemoTab(page, selector);
        const box = await canvas.boundingBox();
        if (box === null) throw new Error("canvas has no bounding box");
        // Give demos with their own async/synthetic data setup a beat to populate before sampling.
        await page.waitForTimeout(500);

        // A band that starts past any header/group-header rows and stays within the first handful
        // of data rows even for the sparsest demo (10 rows here) -- dense enough that a plain
        // text-on-white cell's antialiased glyph edges are still virtually guaranteed to show up,
        // which a few hand-picked points are not (see `sampleGridColors`'s own comment).
        const height = Math.max(20, Math.min(180, box.height - 80));
        const distinctColors = await sampleGridColors(canvas, { x: 10, y: 70, width: box.width - 20, height });
        expect(distinctColors.size).toBeGreaterThan(2);
    });
}
