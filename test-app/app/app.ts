import Application from '@ember/application';
import compatModules from '@embroider/virtual/compat-modules';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
// Tailwind 4 + DaisyUI 5, test-app only. Imported here rather than from `app/styles/app.css`
// because Embroider virtualises that file past `@tailwindcss/vite` -- see `styles/tailwind.css`.
import './styles/tailwind.css';

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver.withModules(compatModules);
}

loadInitializers(App, config.modulePrefix, compatModules);
