// Shared fixture primitives for the demos: generated images, a colour palette, and name/title
// pools.
//
// Extracted 2026-08-08. `glide-demo-data.ts` grew these first and carried a "keep the two copies in
// sync" note about its fallback PNG; `demo-data.ts` then needed the same thing to stop looking like
// a smoke test. Two copies of a sync-hazard is one too many, so they live here now.
//
// Two constraints both demos share:
//   - **Zero network requests.** Every image is a `data:` URI drawn on an offscreen canvas at
//     runtime, memoized. That keeps thumbnails visually distinct per row without shipping N base64
//     blobs or making browser tests depend on the network.
//   - **Deterministic.** No `Math.random()` anywhere. A demo whose contents change on reload makes
//     "did the sort actually reorder the rows?" unanswerable.

// Tiny 8x8 solid PNG. Only reached when there is no DOM (SSR / build-time evaluation).
//
// FIXED 2026-08-08: the constant this replaced was a CORRUPT PNG -- valid 8x8 RGBA `IHDR`, but a
// truncated `IDAT` zlib stream with a failing CRC and no terminating `IEND`. Chrome partially
// decodes such a file rather than rejecting it, so it rendered as a couple of thin horizontal bars
// and looked like a renderer bug in the port. Verified valid this time: all three chunks CRC-check
// and the IDAT stream round-trips.
export const FALLBACK_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAE0lEQVR42mPwXf39Pz7MMDIUAABoaLuBoJ3iNwAAAABJRU5ErkJggg==";

export function makeCanvasDataUrl(size: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
    if (typeof document === "undefined") return FALLBACK_PNG;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return FALLBACK_PNG;
    paint(ctx);
    return canvas.toDataURL("image/png");
}

/** `[accent, tint]` pairs. The accent is the strong colour, the tint the light companion. */
export const PHOTO_PALETTE: readonly (readonly [string, string])[] = [
    ["#f97362", "#ffe3de"],
    ["#4dabf7", "#dbeeff"],
    ["#69db7c", "#e0f8e4"],
    ["#da77f2", "#f7e2ff"],
    ["#ffa94d", "#ffeedd"],
    ["#4c6ef5", "#dfe5ff"],
    ["#20c997", "#dcf7ee"],
    ["#f06595", "#ffe0eb"],
    ["#845ef7", "#e8e0ff"],
    ["#fcc419", "#fff5d6"],
    ["#15aabf", "#d9f4f8"],
    ["#ff8787", "#ffe5e5"],
];

// A simple "portrait" glyph -- tinted background plus a lighter head-and-shoulders silhouette.
// Enough for each row's thumbnail to be obviously a distinct image rather than N copies of one
// swatch, which is the thing that made the earlier fixtures look like placeholder art.
function makePhotoDataUrl(bg: string, fg: string): string {
    return makeCanvasDataUrl(48, ctx => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 48, 48);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(24, 18, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(24, 46, 16, Math.PI, Math.PI * 2);
        ctx.fill();
    });
}

/** A round initials chip, for avatars on drilldown chips and user-profile cells. */
export function makeAvatarDataUrl(bg: string, initials: string): string {
    return makeCanvasDataUrl(32, ctx => {
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(16, 16, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials, 16, 17);
    });
}

// Lazily built on first use: canvas generation needs a DOM, and these modules are imported (but not
// exercised) during the build. Memoized, so it happens once per page load.
let photoUrls: readonly string[] | undefined;
export function photoUrl(index: number): string {
    photoUrls ??= PHOTO_PALETTE.map(([bg, fg]) => makePhotoDataUrl(bg, fg));
    return photoUrls[index % photoUrls.length]!;
}

const avatarCache = new Map<string, string>();
/** Memoized on `initials + index`, since both demos ask for the same handful repeatedly. */
export function avatarUrl(initials: string, index: number): string {
    const key = `${initials}:${index}`;
    const hit = avatarCache.get(key);
    if (hit !== undefined) return hit;
    const [bg] = PHOTO_PALETTE[index % PHOTO_PALETTE.length]!;
    const url = makeAvatarDataUrl(bg, initials);
    avatarCache.set(key, url);
    return url;
}

// --- name / title pools -------------------------------------------------------------------------

export const FIRST_NAMES = [
    "Ada", "Grace", "Alan", "Katherine", "Margaret", "Linus", "Barbara", "Edsger", "Radia", "Ken",
    "Anita", "Donald", "Frances", "Tim", "Shafi", "Vint", "Jean", "Dennis", "Sophie", "Guido",
    "Leslie", "Hedy", "Bjarne", "Carol", "Niklaus", "Adele", "Marvin", "Evelyn", "Alonzo", "Ida",
] as const;

export const LAST_NAMES = [
    "Lovelace", "Hopper", "Turing", "Johnson", "Hamilton", "Torvalds", "Liskov", "Dijkstra",
    "Perlman", "Thompson", "Borg", "Knuth", "Allen", "Berners-Lee", "Goldwasser", "Cerf",
    "Bartik", "Ritchie", "Wilson", "Rossum", "Lamport", "Lamarr", "Stroustrup", "Shaw",
    "Wirth", "Goldberg", "Minsky", "Boyd", "Church", "Rhodes",
] as const;

/**
 * A cheap integer hash. Lets a `getCellContent` that must stay a **pure function of `[col, row]`**
 * still produce fields that vary independently per row -- no PRNG state, nothing materialized, and
 * identical output on every reload. `salt` separates one field from another.
 */
export function fieldHash(row: number, salt: number): number {
    let h = Math.imul(row + 1, 0x9e_37_79_b1) + Math.imul(salt + 1, 0x85_eb_ca_6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c_1b_3c_6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x29_7a_2d_39);
    h ^= h >>> 15;
    return h >>> 0;
}

/** Deterministic pick from a pool, varying independently per `salt`. */
export function pickFrom<T>(pool: readonly T[], row: number, salt: number): T {
    return pool[fieldHash(row, salt) % pool.length]!;
}
