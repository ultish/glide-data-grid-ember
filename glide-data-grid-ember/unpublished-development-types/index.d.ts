// Add any types here that you need for local development only.
// These will *not* be published as part of your addon, so be careful that your published code does not rely on them!

// Glint v2 (2026-08-08). Replaces v1's two ambient environment imports
// (`@glint/environment-ember-loose` + `@glint/environment-ember-template-imports`), both of which
// no longer exist -- v2 dropped the Ember Loose environment entirely and ships a single types entry
// point instead. Harmless here: this addon has no `.hbs` files at all, only `.gts`.
import "@glint/ember-tsc/types";
