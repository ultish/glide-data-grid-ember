import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';
// Tailwind 4 + DaisyUI 5 are TEST-APP-ONLY dependencies, demonstrating that a consuming app can
// theme the grid from its own design system. The addon has no knowledge of either and must not
// gain one -- same boundary as `object-scan` (see PHASES.md's Phase 8 brief).
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    classicEmberSupport(),
    ember(),
    // extra plugins here
    babel({
      babelHelpers: 'runtime',
      extensions,
    }),
  ],
});
