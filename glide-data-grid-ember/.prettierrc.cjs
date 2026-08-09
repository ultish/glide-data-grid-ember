"use strict";

// Re-exports the repo-root config so there is exactly one source of truth.
//
// This file must exist and must NOT hold its own values: prettier resolves config per-file by
// walking UP from the file, so anything here silently overrides the root config for the entire
// addon. The blueprint's original `{ singleQuote: true }` did exactly that -- it is why the ported
// engine's 4-space/double-quote style was reported as 59-of-60 files "failing", and why editing
// the root config alone appeared to have no effect. See the root file for why the style is
// upstream glide-data-grid's rather than the Ember default.
module.exports = require("../.prettierrc.cjs");
