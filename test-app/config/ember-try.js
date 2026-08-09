"use strict";

const getChannelURL = require("ember-source-channel-url");

/**
 * Peer: ember-source >= 6.0.0
 * CI matrix must use a single ember-source per scenario (no nested addon copy).
 *
 * No `embroiderSafe()` / `embroiderOptimized()` scenarios: those come from
 * `@embroider/test-setup`, which only exists to flip a *classic* ember-cli app
 * over to the Embroider+webpack pipeline via `maybeEmbroider()` in
 * `ember-cli-build.js`. This test-app is already a v2 app built by
 * `@embroider/vite` (`compatBuild(app, buildOnce)`), so those scenarios set an
 * env var nothing reads while downgrading `@embroider/core`/`compat` to v3 and
 * installing `@embroider/webpack` — which just breaks the build. There is only
 * one build pipeline here, and every scenario exercises it.
 */
module.exports = async function () {
    return {
        usePnpm: true,
        scenarios: [
            {
                name: "ember-lts-6.4",
                npm: {
                    devDependencies: {
                        "ember-source": "~6.4.0",
                    },
                },
            },
            {
                name: "ember-lts-6.8",
                npm: {
                    devDependencies: {
                        "ember-source": "~6.8.0",
                    },
                },
            },
            // test-app default ~6.12 covered by main Tests job
            {
                name: "ember-release",
                npm: {
                    devDependencies: {
                        "ember-source": await getChannelURL("release"),
                    },
                },
            },
            {
                name: "ember-beta",
                npm: {
                    devDependencies: {
                        "ember-source": await getChannelURL("beta"),
                    },
                },
            },
            {
                name: "ember-canary",
                npm: {
                    devDependencies: {
                        "ember-source": await getChannelURL("canary"),
                    },
                },
            },
        ],
    };
};
