'use strict';

const getChannelURL = require('ember-source-channel-url');
const { embroiderSafe, embroiderOptimized } = require('@embroider/test-setup');

/**
 * Peer: ember-source >= 6.0.0
 * CI matrix must use a single ember-source per scenario (no nested addon copy).
 */
module.exports = async function () {
  return {
    usePnpm: true,
    scenarios: [
      {
        name: 'ember-lts-6.4',
        npm: {
          devDependencies: {
            'ember-source': '~6.4.0',
          },
        },
      },
      {
        name: 'ember-lts-6.8',
        npm: {
          devDependencies: {
            'ember-source': '~6.8.0',
          },
        },
      },
      // test-app default ~6.12 covered by main Tests job
      {
        name: 'ember-release',
        npm: {
          devDependencies: {
            'ember-source': await getChannelURL('release'),
          },
        },
      },
      {
        name: 'ember-beta',
        npm: {
          devDependencies: {
            'ember-source': await getChannelURL('beta'),
          },
        },
      },
      {
        name: 'ember-canary',
        npm: {
          devDependencies: {
            'ember-source': await getChannelURL('canary'),
          },
        },
      },
      embroiderSafe(),
      embroiderOptimized(),
    ],
  };
};
