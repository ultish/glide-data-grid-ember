'use strict';

// Re-exports the repo-root config so there is exactly one source of truth. See that file, and the
// note in `glide-data-grid-ember/.prettierrc.cjs`, for why this must not hold its own values.
//
// NOTE: `.prettierrc.js` beats `.prettierrc.cjs` in prettier's resolution order. This package
// previously had both; the `.cjs` one was never read and has been deleted.
module.exports = require('../.prettierrc.cjs');
