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
import globals from "globals";
import js from "@eslint/js";

import ts from "typescript-eslint";

import ember from "eslint-plugin-ember/recommended";

import eslintConfigPrettier from "eslint-config-prettier";
import qunit from "eslint-plugin-qunit";
import n from "eslint-plugin-n";

import babelParser from "@babel/eslint-parser";

const parserOptions = {
    esm: {
        js: {
            ecmaFeatures: { modules: true },
            ecmaVersion: "latest",
        },
        ts: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },
};

export default ts.config(
    js.configs.recommended,
    ember.configs.base,
    ember.configs.gjs,
    ember.configs.gts,
    eslintConfigPrettier,
    /**
     * Ignores must be in their own object
     * https://eslint.org/docs/latest/use/configure/ignore
     */
    {
        ignores: [
            "dist/",
            "node_modules/",
            "coverage/",
            "!**/.*",
            // ember-eslint-parser currently crashes while transforming this large GTS template
            // (Invalid count value: -13); template-lint and TypeScript still validate it.
            "app/components/demo-grid.gts",
            // 9p: Playwright is deliberately kept out of the app's own tsconfig/Glint project (it
            // is plain Node/browser TS, no Ember types) -- see `e2e/tsconfig.json` and the
            // `lint:types:e2e` script, which typecheck it instead. Without this, typescript-eslint's
            // `projectService` can't place these files in any project and errors on every run.
            "playwright.config.ts",
            "e2e/",
        ],
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
            parserOptions: {
                // Do NOT load `babel.config.cjs` to lint plain `.js` files.
                // babel-plugin-ember-template-compilation v3+ resolves the template
                // compiler asynchronously, and @babel/eslint-parser drives Babel
                // synchronously -- loading the app config here fails with
                // "You appear to be using an async plugin/preset, but Babel has been
                // called synchronously". None of the `.js` files in this app need the
                // app's transforms to be *parsed*; the build still applies them.
                requireConfigFile: false,
                babelOptions: { configFile: false, babelrc: false },
            },
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
        files: ["tests/**/*-test.{js,gjs,ts,gts}"],
        plugins: {
            qunit,
        },
    },
    /**
     * CJS node files
     */
    {
        files: [
            "**/*.cjs",
            "config/**/*.js",
            "testem.js",
            "testem*.js",
            ".prettierrc.js",
            ".stylelintrc.js",
            ".template-lintrc.js",
            "ember-cli-build.js",
        ],
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
