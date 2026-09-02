import { expect, test } from "@playwright/test";
import { openPath, sampleGridColors } from "./helpers.ts";

// One pixel-variation check per live cookbook example (and the landing Glide demo). Per CLAUDE.md
// rule 5, a demo that has only ever been checked for "no JS exception" is unverified code.
const DEMO_PAGES: ReadonlyArray<[name: string, path: string]> = [
    ["Glide demo grid", "/"],
    ["Tracking proof", "/cookbook/reactivity"],
    ["Streaming updates", "/cookbook/streaming"],
    ["Async paging", "/cookbook/async"],
    ["Apollo (faked)", "/cookbook/apollo"],
    ["DaisyUI theming", "/cookbook/daisy"],
    ["Select, edit, add, delete", "/cookbook/interactions"],
    ["Filter from outside", "/cookbook/filter"],
];

for (const [name, path] of DEMO_PAGES) {
    test(`"${name}" paints real content, not a blank canvas`, async ({ page }) => {
        const canvas = await openPath(page, path);
        const box = await canvas.boundingBox();
        if (box === null) throw new Error("canvas has no bounding box");
        await page.waitForTimeout(500);

        const height = Math.max(20, Math.min(180, box.height - 80));
        const distinctColors = await sampleGridColors(canvas, { x: 10, y: 70, width: box.width - 20, height });
        expect(distinctColors.size).toBeGreaterThan(2);
    });
}
