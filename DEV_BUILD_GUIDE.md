# 🛠️ V2 Addon Development Guide

This repository is structured as a monorepo workspace. Because Ember V2 addons are standard npm packages, changes made to the addon source (`src/`) must be compiled before the `test-app` can consume them.

Follow this workflow to ensure your changes hot-reload in the browser without stale cache issues.

---

## 🚀 Standard Development Workflow

To develop and test changes locally, you must run **two processes simultaneously** from the root of the project.

### 1. Start the Addon Watcher (Terminal 1)
This process monitors the `src/` directory and instantly compiles changes into the `dist/` folder using Rollup.
```bash
pnpm --filter <your-addon-package-name> start
```

### 2. Start the Test App Server (Terminal 2)
This process Boots the Ember development server. Because of pnpm workspaces, it reads the compiled `dist/` folder via a live symlink and auto-refreshes your browser.
```bash
pnpm --filter test-app start
```

---

## ⚡ Pro-Tip: Single Command Execution

If you prefer to run both processes in a single terminal window, use the root shortcut command:
```bash
pnpm start
```
*(This utilizes `concurrently` to multiplex the addon build watcher and the Ember test server together).*

---

## 🔍 Troubleshooting Stale Cache & Missing Files

### Do NOT Delete `node_modules`
Deleting `node_modules` is slow and unnecessary. If you encounter caching issues, use the following workspace-native alternatives.

### Scenario A: You added a brand new file
If you create a completely new file (e.g., `src/components/new-button.gjs`) and the test-app does not register it, the package manager's symlink graph is likely out of sync.
* **Fix:** Keep your terminals running and execute a forced link refresh in a new terminal at the root:
  ```bash
  pnpm install --force
  ```

### Scenario B: Changes are not reflecting in the browser
If code modifications aren't updating, your watcher chain is broken.
1. Check **Terminal 1** to ensure the Rollup build compiler didn't crash on a syntax error.
2. If Rollup is successful but Ember isn't updating, restart the **Test App Server (Terminal 2)** to force Embroider to re-index the workspace.
