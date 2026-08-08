import { defineConfig } from "vitest/config";

// Phase 9a. Unit tests for the framework-agnostic layer of this addon -- everything under
// `src/rendering/` and the pure parts of `src/data-source/` is deliberately plain TypeScript with
// zero Ember imports (see PORTING-NOTES.md's Phase 1 notes), so it runs in bare Node and needs no
// browser, no `ember test`, and no build step. That is the whole reason this harness exists
// alongside `test-app`'s QUnit setup rather than instead of it:
//
//   - vitest (here)          -- pure functions, subsecond, run against `src/` directly.
//   - test-app QUnit         -- anything needing a real Ember app or a real canvas. Not built yet;
//                               that is PHASES.md's 9a item 4.
//
// Do NOT add tests here for anything that imports from `ember-source`. Phase 8 already established
// that ember-source's dist cannot execute in bare Node (it needs the `@embroider/macros` babel
// transform); that suite worked around it by substituting a standalone `@glimmer/validator`. If you
// need to test Ember-integrated behaviour, it belongs in `test-app`, not here.
export default defineConfig({
    test: {
        // Colocated: `foo.ts` is tested by `foo.test.ts` next to it. Kept out of the published
        // package by `rollup.config.mjs`'s `publicEntrypoints` exclusion -- if you change this
        // pattern, change that one too, or tests start shipping to consumers in `dist/`.
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
});
