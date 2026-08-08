// A fake paged backend for the async data-source demo (`app/components/async-demo.gts`).
//
// Deliberately NOT a real network call: the demo must behave identically offline, in CI, and across
// reloads. What it does simulate faithfully is the part that matters -- a request takes real
// wall-clock time to come back, so rows genuinely arrive after the grid has already painted them as
// `Loading` cells. Without that latency the demo would prove nothing: every page would land before
// the first frame and the async path would never be visible.
//
// Records are generated from a seeded PRNG rather than stored, so a "database" of 100,000 rows costs
// nothing and page N always returns the same rows -- scrolling away and back must not silently
// produce different data, or "did the right page load?" becomes unanswerable.

/** One row of the fake backend. Shaped like something a server would actually return. */
export interface EmployeeRecord {
    readonly id: number;
    name: string;
    readonly email: string;
    readonly team: string;
    readonly score: number;
    readonly startedAt: string;
}

export const ASYNC_DEMO_ROWS = 100_000;

const FIRST_NAMES = [
    "Ada", "Grace", "Alan", "Katherine", "Margaret", "Radia", "Barbara", "Jean",
    "Linus", "Dennis", "Ken", "Bjarne", "Guido", "Anders", "Yukihiro", "Rich",
];
const LAST_NAMES = [
    "Lovelace", "Hopper", "Turing", "Johnson", "Hamilton", "Perlman", "Liskov", "Bartik",
    "Torvalds", "Ritchie", "Thompson", "Stroustrup", "Rossum", "Hejlsberg", "Matsumoto", "Hickey",
];
const TEAMS = ["Platform", "Growth", "Infra", "Design", "Data", "Support", "Security", "Mobile"];

// mulberry32 -- same 5-line seeded PRNG `glide-demo-data.ts` already uses, for the same reason.
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Deterministic: row `n` always generates the same record, no matter when it is requested. */
export function generateRecord(row: number): EmployeeRecord {
    const rand = mulberry32(row + 1);
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)] ?? "Ada";
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)] ?? "Lovelace";
    const team = TEAMS[Math.floor(rand() * TEAMS.length)] ?? "Platform";
    const year = 2015 + Math.floor(rand() * 11);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    return {
        id: row,
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${row}@example.com`,
        team,
        score: Math.floor(rand() * 100),
        startedAt: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
}

export interface FetchResult {
    readonly rows: readonly EmployeeRecord[];
    /** Wall-clock ms this request actually took -- reported on screen so latency isn't a claim. */
    readonly elapsedMs: number;
}

/**
 * Fetches `[start, end)` after a simulated round trip. `latencyMs` is the demo's slider value, so a
 * viewer can crank it up and watch `Loading` cells persist, or drop it and watch them vanish.
 */
export async function fetchPage(start: number, end: number, latencyMs: number): Promise<FetchResult> {
    const began = performance.now();
    // Jitter, so concurrent pages don't all resolve in lockstep -- that's what makes the
    // maxConcurrency queue observable rather than theoretical.
    const jitter = latencyMs * 0.4 * Math.random();
    await new Promise(resolve => setTimeout(resolve, latencyMs + jitter));

    const rows: EmployeeRecord[] = [];
    for (let row = start; row < end; row++) {
        rows.push(generateRecord(row));
    }
    return { rows, elapsedMs: Math.round(performance.now() - began) };
}
