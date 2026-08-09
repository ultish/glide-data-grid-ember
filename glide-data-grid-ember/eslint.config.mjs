/**
 * Debugging:
 *   https://eslint.org/docs/latest/use/configure/debug
 *  ----------------------------------------------------
 *
 *   Print a file's calculated configuration
 *
 *     npx eslint --print-config path/to/file.js
 *
 *   Inspecting the config
 *
 *     npx eslint --inspect-config
 *
 */
import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import ember from "eslint-plugin-ember/recommended";
import importPlugin from "eslint-plugin-import";
import n from "eslint-plugin-n";
import globals from "globals";
import ts from "typescript-eslint";

const parserOptions = {
    esm: {
        js: {
            ecmaFeatures: { modules: true },
            ecmaVersion: "latest",
        },
        ts: {
            // NOTE: do NOT also set `project: true` here. `projectService` supersedes it, and setting
            // both makes typescript-eslint fail EVERY file with "Enabling 'project' does nothing when
            // 'projectService' is enabled." The addon blueprint shipped both, so `lint:js` had been
            // failing on all 71 files since Phase 0 without ever actually linting anything. test-app's
            // config never had the duplicate, which is why only the addon was affected.
            //
            // `vitest.config.ts` sits at the package root, outside `tsconfig.json`'s `src`-only
            // `include`/`rootDir`; adding it there would break `rootDir: "./src"`, which the declaration
            // emit depends on. So it is linted against the default project. The colocated `*.test.ts`
            // files have the same problem for a different reason (they are `exclude`d from
            // `tsconfig.json` so the declaration emit doesn't ship `.d.ts` for them) but cannot be listed
            // here -- `allowDefaultProject` rejects globs containing `**` -- so they get their own config
            // block further down, pointed at `tsconfig.test.json`.
            projectService: {
                allowDefaultProject: ["vitest.config.ts"],
            },
            tsconfigRootDir: import.meta.dirname,
        },
    },
};

export default ts.config(
    js.configs.recommended,
    ember.configs.base,
    ember.configs.gjs,
    ember.configs.gts,
    prettier,
    /**
     * Ignores must be in their own object
     * https://eslint.org/docs/latest/use/configure/ignore
     */
    {
        ignores: ["dist/", "declarations/", "node_modules/", "coverage/", "!**/.*"],
    },
    /**
     * https://eslint.org/docs/latest/use/configure/configuration-files#configuring-linter-options
     */
    {
        linterOptions: {
            reportUnusedDisableDirectives: "error",
        },
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            parser: babelParser,
        },
    },
    {
        files: ["**/*.{js,gjs}"],
        languageOptions: {
            parserOptions: parserOptions.esm.js,
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ["**/*.{ts,gts}"],
        languageOptions: {
            parser: ember.parser,
            parserOptions: parserOptions.esm.ts,
        },
        extends: [...ts.configs.recommendedTypeChecked, ember.configs.gts],
    },
    {
        files: ["src/**/*"],
        plugins: {
            import: importPlugin,
        },
        rules: {
            // require relative imports use full extensions
            "import/extensions": ["error", "always", { ignorePackages: true }],
        },
    },
    {
        // Phase 9a: colocated vitest files. They are deliberately `exclude`d from `tsconfig.json` (so
        // `addon.declarations()` doesn't emit `.d.ts` for them into the published package), which means
        // the project service above cannot resolve them. `tsconfig.test.json` is the project that does
        // cover them, so point typed linting at it explicitly here rather than via `projectService`.
        files: ["src/**/*.test.ts"],
        languageOptions: {
            parserOptions: {
                // `projectService: false` is required, not redundant: flat config MERGES
                // `languageOptions` from the earlier `**/*.{ts,gts}` block, so the service would still be
                // enabled here and `project` alongside it re-triggers the very "Enabling 'project' does
                // nothing when 'projectService' is enabled" error this config exists to avoid.
                projectService: false,
                project: ["./tsconfig.test.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    /**
     * CJS node files
     */
    {
        files: ["**/*.cjs", ".prettierrc.js", ".stylelintrc.js", ".template-lintrc.js", "addon-main.cjs"],
        plugins: {
            n,
        },

        languageOptions: {
            sourceType: "script",
            ecmaVersion: "latest",
            globals: {
                ...globals.node,
            },
        },
    },
    /**
     * ESM node files
     */
    {
        files: ["**/*.mjs"],
        plugins: {
            n,
        },

        languageOptions: {
            sourceType: "module",
            ecmaVersion: "latest",
            parserOptions: parserOptions.esm.js,
            globals: {
                ...globals.node,
            },
        },
    }
);
