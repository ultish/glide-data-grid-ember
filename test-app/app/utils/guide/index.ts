// The guide's chapter order. This array *is* the table of contents, and the page numbers chapters
// from their position here — so adding or reordering a chapter is an edit to this file only, never a
// renumbering sweep. Same convention as `app/utils/cookbook/index.ts`, and the same `Section`/`Block`
// content model (imported from there rather than duplicated).
//
// The arc is deliberate and is not a list of features:
//
//   1-2  what the grid IS (a pull API), and the one rule that follows from it
//   3    the reactivity model — the highest-value chapter, and the only genuinely Ember-specific one
//   4-6  wiring real data: the packaged pattern, where records come from, how to flatten them
//   7-8  writing back, and the one case the packaged pattern does not cover
//   9    the identity rules — placed AFTER everything they apply to, and BEFORE theming, which is
//        itself two identity-compared args
//   10-11 theming in one screen, then the hand-off into the task-indexed cookbook
import type { Section } from "../cookbook/types.ts";
import { installSection } from "./install.ts";
import { pullModelSection } from "./pull-model.ts";
import { reactivitySection } from "./reactivity.ts";
import { recordsSourceSection } from "./records-source.ts";
import { storesSection } from "./stores.ts";
import { flatteningSection } from "./flattening.ts";
import { editingSection } from "./editing.ts";
import { asyncSection } from "./async.ts";
import { identitySection } from "./identity.ts";
import { themingSection } from "./theming.ts";
import { nextSection } from "./next.ts";

export const GUIDE_SECTIONS: readonly Section[] = [
    installSection,
    pullModelSection,
    reactivitySection,
    recordsSourceSection,
    storesSection,
    flatteningSection,
    editingSection,
    asyncSection,
    identitySection,
    themingSection,
    nextSection,
];

export type { Block, Section } from "../cookbook/types.ts";
