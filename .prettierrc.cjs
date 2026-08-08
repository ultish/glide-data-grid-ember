'use strict';

// Mirrors the UPSTREAM glide-data-grid repo's own `.prettierrc` (`/Users/jxhui/Developer/
// glide-data-grid/.prettierrc`), deliberately, and this is load-bearing -- do not "fix" it back to
// the Ember blueprint defaults.
//
// WHY: most of `glide-data-grid-ember/src/rendering/` is a near-verbatim port of upstream's
// TypeScript, and this project's core workflow is diffing a ported file against its source
// counterpart -- to confirm a port is faithful, to decide whether a surprising behaviour is an
// upstream bug we must preserve or a port defect we must fix, and to re-sync when upstream moves.
// Formatting the port differently from its source breaks that comparison on every single line.
//
// The blueprint originally shipped `{ singleQuote: true }` with prettier's 2-space/80-column
// defaults, which never matched a single ported file. Measured 2026-08-08: under the blueprint
// config 59 of ~60 files in `src/rendering/` were non-conforming; under these values it is 19,
// i.e. roughly two-thirds of the ported engine is already byte-exact upstream prettier output.
// `trailingComma: "es5"` is the load-bearing one -- prettier 3's default of "all" alone takes that
// 19 back up to 42.
//
// Non-ported code (test-app demos, Ember glue) follows the same style purely for consistency; it
// has no upstream counterpart, so nothing is lost by it. The known cost of this choice is that the
// repo is not in the Ember ecosystem's conventional 2-space/single-quote style. That was weighed
// and accepted: upstream diffability matters more here. If that ever needs revisiting, prefer an
// `overrides` block for the Ember-facing files over changing these defaults.
// THIS FILE IS THE SINGLE SOURCE OF TRUTH. `glide-data-grid-ember/.prettierrc.cjs` and
// `test-app/.prettierrc.js` both just re-export it. Prettier resolves config per-FILE by walking up
// from that file, so a package-level config silently wins over this one for everything in that
// package -- which is exactly what happened before 2026-08-08: the blueprint left a
// `{ singleQuote: true }` config in each package, so editing the root file appeared to do nothing.
// (test-app also had BOTH a `.prettierrc.js` and a `.prettierrc.cjs`; `.js` wins the resolution
// order, so the `.cjs` one was dead code that had never taken effect. It has been deleted.)
module.exports = {
  plugins: ['prettier-plugin-ember-template-tag'],

  // Ember-specific, not from upstream (upstream has no templates): keep double quotes inside
  // `<template>` blocks too, consistent with `singleQuote: false` below.
  templateSingleQuote: false,

  // --- upstream's values, verbatim ---------------------------------------------------------
  tabWidth: 4,
  printWidth: 120,
  semi: true,
  arrowParens: 'avoid',
  bracketSpacing: true,
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'css',
  proseWrap: 'preserve',
  quoteProps: 'as-needed',
  singleQuote: false,
  trailingComma: 'es5',
  useTabs: false,
};
