// Tests for the star cell's click math and its hover preview (added 2026-08-09).
//
// The preview exists because this port replaced source's overlay-of-DOM-stars editor with a single
// canvas click (see the module header), which left the interaction with no affordance at all. The
// property that matters and is pinned here: **the preview is computed by the same function the
// click uses**, so what you see under the cursor is what a click sets.
import { describe, expect, test } from "vitest";
import { starCellRenderer, starRatingForPosX } from "./star-cell.ts";
import { getDataEditorTheme, mergeAndRealizeTheme } from "../theme.ts";

const theme = mergeAndRealizeTheme(getDataEditorTheme());
const padX = theme.cellHorizontalPadding;

/** Centre of the i-th (0-based) star, in cell-relative pixels -- mirrors the renderer's layout. */
const starCentre = (i: number): number => padX + 8 + i * 18;

function starCell(rating: number) {
    return { kind: "Custom", allowOverlay: false, copyData: String(rating), data: { kind: "star-cell", rating } };
}

/** Records enough of a 2D context to count how many stars were filled, and at what alpha. */
function stubCtx() {
    const fills: { stars: number; alpha: number }[] = [];
    let pending = 0;
    return {
        fillStyle: "",
        globalAlpha: 1,
        beginPath() {
            pending = 0;
        },
        // `pathStar` emits exactly one `moveTo` per star, then `lineTo`s and a `closePath`.
        moveTo() {
            pending++;
        },
        lineTo() {},
        closePath() {},
        fill() {
            fills.push({ stars: pending, alpha: this.globalAlpha });
        },
        fills,
    };
}

function draw(rating: number, hoverX: number | undefined) {
    const ctx = stubCtx();
    starCellRenderer.draw(
        {
            ctx,
            theme,
            rect: { x: 0, y: 0, width: 130, height: 34 },
            hoverAmount: 1,
            hoverX,
        } as never,
        starCell(rating) as never
    );
    return ctx.fills;
}

describe("starRatingForPosX", () => {
    test("resolves each star's centre to its own rating", () => {
        for (let i = 0; i < 5; i++) {
            expect(starRatingForPosX(starCentre(i), padX)).toBe(i + 1);
        }
    });

    test("is undefined left of the first star", () => {
        expect(starRatingForPosX(0, padX)).toBeUndefined();
    });

    test("clamps to 5 anywhere right of the last star", () => {
        expect(starRatingForPosX(starCentre(4) + 60, padX)).toBe(5);
    });
});

describe("starCellRenderer.onClick", () => {
    test("sets the rating the pointer is over", () => {
        const result = starCellRenderer.onClick?.({
            cell: starCell(1),
            posX: starCentre(3),
            theme,
        } as never) as { data: { rating: number } } | undefined;
        expect(result?.data.rating).toBe(4);
    });

    test("is a no-op when the rating would not change, and left of the first star", () => {
        expect(starCellRenderer.onClick?.({ cell: starCell(4), posX: starCentre(3), theme } as never)).toBeUndefined();
        expect(starCellRenderer.onClick?.({ cell: starCell(4), posX: 0, theme } as never)).toBeUndefined();
    });
});

describe("starCellRenderer.draw hover preview", () => {
    test("draws only the solid stars when not hovering", () => {
        expect(draw(3, undefined)).toEqual([{ stars: 3, alpha: 1 }]);
    });

    test("previews the extra stars a click would add, faintly", () => {
        // Rating 2, pointer over the 5th star: 2 solid + 3 faint.
        const fills = draw(2, starCentre(4));
        expect(fills[0]).toEqual({ stars: 2, alpha: 1 });
        expect(fills[1]?.stars).toBe(3);
        expect(fills[1]?.alpha).toBeLessThan(0.5);
    });

    test("previews the stars a click would REMOVE, faintly", () => {
        // Rating 5, pointer over the 2nd star: 2 stay solid, 3 go faint.
        const fills = draw(5, starCentre(1));
        expect(fills[0]).toEqual({ stars: 2, alpha: 1 });
        expect(fills[1]?.stars).toBe(3);
    });

    test("hovering left of the first star previews nothing", () => {
        expect(draw(3, 0)).toEqual([{ stars: 3, alpha: 1 }]);
    });

    test("the preview always agrees with what onClick would set", () => {
        for (let x = 0; x < 130; x += 3) {
            const prospective = starRatingForPosX(x, padX);
            const fills = draw(2, x);
            const previewed = fills.reduce((n, f) => n + f.stars, 0);
            expect(previewed).toBe(prospective === undefined ? 2 : Math.max(2, prospective));
        }
    });
});
