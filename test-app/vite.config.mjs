import { defineConfig } from "vite";
import { extensions, classicEmberSupport, ember } from "@embroider/vite";
import { babel } from "@rollup/plugin-babel";
// Tailwind 4 + DaisyUI 5 are TEST-APP-ONLY dependencies, demonstrating that a consuming app can
// theme the grid from its own design system. The addon has no knowledge of either and must not
// gain one -- same boundary as `object-scan` (see PHASES.md's Phase 8 brief).
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    // GitHub Pages project sites are served from `https://<owner>.github.io/<repo>/`, not from the
    // domain root, so every emitted asset URL needs that prefix.
    //
    // **`ROOT_URL` alone is not enough, and this was wrong until it was actually tested (2026-08-09).**
    // `config/environment.js` feeds `ROOT_URL` into `ENV.rootURL`, which is an *Ember* setting: it
    // tells the router what to strip from the path. Vite's `base` is a separate knob that governs the
    // `src`/`href` attributes written into `index.html` and the chunk URLs inside the bundle. With
    // only the first set, a Pages build produced an `index.html` that referenced `/assets/main-*.js`
    // — absolute from the domain root — so the page loaded and then 404'd on its own JavaScript. A
    // blank screen, and nothing in the build output hinting at it.
    //
    // The workflow (`.github/workflows/pages.yml`) sets `ROOT_URL=/<repo>/`; local `vite build` and
    // `vite dev` leave it unset and keep `/`.
    base: process.env.ROOT_URL ?? "/",

    plugins: [
        tailwindcss(),
        classicEmberSupport(),
        ember(),
        // extra plugins here
        babel({
            babelHelpers: "runtime",
            extensions,
        }),
    ],
});
