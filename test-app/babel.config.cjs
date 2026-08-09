const { babelCompatSupport, templateCompatSupport } = require("@embroider/compat/babel");

module.exports = {
    plugins: [
        [
            "@babel/plugin-transform-typescript",
            {
                allExtensions: true,
                onlyRemoveTypeImports: true,
                allowDeclareFields: true,
            },
        ],
        [
            "babel-plugin-ember-template-compilation",
            {
                // No `compilerPath`: let the plugin pick the compiler itself. It
                // prefers `ember-source/ember-template-compiler/index.js` and only
                // falls back to the legacy AMD `dist/ember-template-compiler.js`,
                // which ember-source 7 removed.
                enableLegacyModules: [
                    "ember-cli-htmlbars",
                    "ember-cli-htmlbars-inline-precompile",
                    "htmlbars-inline-precompile",
                ],
                transforms: [...templateCompatSupport()],
            },
        ],
        [
            "module:decorator-transforms",
            {
                runtime: {
                    import: require.resolve("decorator-transforms/runtime-esm"),
                },
            },
        ],
        [
            "@babel/plugin-transform-runtime",
            {
                absoluteRuntime: __dirname,
                useESModules: true,
                regenerator: false,
            },
        ],
        ...babelCompatSupport(),
    ],

    generatorOpts: {
        compact: false,
    },
};
