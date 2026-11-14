# Quality check templates

These files are starting points for project-owned quality commands. InStar orchestrates the commands; it does not install scanners or browser dependencies for the project.

## Security

Add `security-check.mjs` to the project, choose a scanner appropriate to the organization, and map it to a `security` check in `.instar-quality.json`. The included `npm audit` template fails on high or critical vulnerabilities and writes `reports/security.json`. Keep generated artifacts under `reports/`; reports are limited to 8 MiB and artifacts to 32 MiB. Do not replace a scanner failure with a manually written PASS.

## Accessibility

Install `playwright` and `@axe-core/playwright`, confirm the installed Playwright version, and ensure the Chromium browser cache exists before running `a11y-check.mjs`. Prefer configuring `verification.runtime` in `.instar-quality.json`; the controller then starts one random-port preview and injects `A11Y_BASE_URL`. Otherwise set `A11Y_BASE_URL` yourself. Set a comma-separated `A11Y_ROUTES` list and `A11Y_STORAGE_STATE` when protected routes need an authenticated session. The template rejects login redirects for protected routes, writes `reports/accessibility.json`, and fails closed on empty routes, navigation/scan errors and incomplete axe results. It covers axe only; keyboard/focus behavior still requires separate evidence. A smoke script or headed screenshot is not an accessibility pass.

Browser, accessibility and keyboard artifacts are semantic evidence, not marker files. Every passing artifact needs `generatedAt`, `headless:true`, `kind` and `status:"PASS"`. A passing `browser` artifact declares `{tool:"playwright",journeys:[{route,status:"PASS"}]}`. A passing `accessibility` artifact declares `{tool:"playwright-axe",routesScanned:N,violations:[],incomplete:[],results:[{route,status:"PASS",violations:[],incomplete:[]}]}` with exactly `N` results. A passing `keyboard` artifact declares `{tool:"playwright",journeys:[{route,status:"PASS",steps,expectedFocus,actualFocus}]}` where the two focus values are equal. When a check configures `routes` or `browserMatrix`, the artifact must cover every configured value; matrix values can appear at the artifact top level or on journeys/results through `browser`, `project` or `browserMatrix`. Fake `{status:"passed"}` JSON or an exit code without a valid artifact is rejected.

## Keyboard

Install `playwright`, start the application once (or use `verification.runtime`), then run `keyboard-check.mjs` with `KEYBOARD_JOURNEYS` containing route, keyboard steps and the expected final focus selector, for example:

```sh
KEYBOARD_JOURNEYS='[{"route":"/","steps":["Tab","Tab"],"expectedFocus":"#search"}]' node templates/quality/keyboard-check.mjs
```

Use `KEYBOARD_BASE_URL`, `KEYBOARD_STORAGE_STATE`, `KEYBOARD_READY_SELECTOR` and `KEYBOARD_NAVIGATION_TIMEOUT` as needed. The template writes `reports/keyboard.json` and fails closed when journeys are missing, Playwright or the browser is unavailable, navigation fails, or final focus differs from the expected selector. Axe does not prove keyboard navigation.

Do not run the production build from Playwright `webServer` when the quality profile already has a build check. Reusing build output through one shared preview avoids three builds, three dev servers and stale evidence from a fixed `4173` port.

## Schema 3 example

```json
{
  "schemaVersion": 3,
  "verification": {
    "profiles": {
      "preflight": ["lint-check", "typecheck-check", "test-check"],
      "implementation": ["lint-check", "format-check", "typecheck-check", "test-check", "build-check", "browser-check"],
      "full": ["build-check", "security-check", "a11y-check", "keyboard-check"]
    }
  },
  "tools": {
    "checks": {
      "lint-check": {"kind": "lint", "command": "npm", "args": ["run", "lint"]},
      "format-check": {"kind": "format", "command": "npm", "args": ["run", "format:check"]},
      "typecheck-check": {"kind": "typecheck", "command": "npm", "args": ["run", "typecheck"]},
      "test-check": {"kind": "test", "command": "npm", "args": ["test"]},
      "build-check": {"kind": "build", "command": "npm", "args": ["run", "build"]},
      "security-check": {"kind": "security", "command": "node", "args": ["templates/quality/security-check.mjs"]},
      "browser-check": {"kind": "browser", "command": "npm", "args": ["run", "test:browser"]},
      "a11y-check": {"kind": "accessibility", "command": "node", "args": ["templates/quality/a11y-check.mjs"]},
      "keyboard-check": {"kind": "keyboard", "command": "node", "args": ["templates/quality/keyboard-check.mjs"]}
    }
  }
}
```

This example includes project-selected `typecheck` and `build` checks; the workflow minimum remains `lint`, `format` and `test` (UI also `browser`).

## Layered verification and cache

For projects that repeatedly run unit/E2E checks, configure L1/L2 under `verification.layers`; L3 always uses `profiles.full` and cannot be configured separately:

```json
{
  "verification": {
    "layers": {
      "L1": ["test-affected"],
      "L2": ["lint-check", "format-check", "test-check", "browser-affected"]
    },
    "cache": {"enabled": true, "buildOutputs": ["dist"]}
  },
  "tools": {
    "checks": {
      "test-affected": {
        "kind": "test", "command": "npm", "args": ["run", "test:affected", "--", "{files}"],
        "toolVersion": "vitest-3"
      },
      "browser-affected": {
        "kind": "browser", "command": "npm", "args": ["run", "test:e2e:affected", "--", "{files}"],
        "toolVersion": "playwright-1.55", "routes": ["/login"], "browserMatrix": ["chromium"]
      }
    }
  }
}
```

Run `verify --layer L1 --files <changed files>` during task iteration, `L2` once on the stable implementation snapshot, and `L3` once after implementation approval. Each L1 check must use `{files}` or `incremental:true`; L2 must include an all-unit `test` and affected browser/E2E when browser checks are configured. `profiles.full` must include a `build` check before every browser/accessibility/keyboard check, so L3 tests the production build rather than an earlier artifact. Intermediate cache keys include kind, executable, argument hash, file hash, config/source/lockfile/build hashes, tool version, routes and browser matrix; raw arguments are never persisted. Cached UI checks must declare non-empty `routes` and `browserMatrix`, and their artifacts must cover every configured route × browser pair. Every cached check must declare `toolVersion`. Never cache L3 or treat a cache hit as final acceptance evidence.

The workflow controller uses `implementation` before the implementation approval (lint, format, test; UI also browser) and `full` after approval (build and security; UI also accessibility and keyboard). `full` must include build even when intermediate layers are absent, and build must run before UI evidence. It is an extension gate, so it should not repeat the same browser check already bound to the approved source. Submitted evidence must reference the matching generated verification report ID and unique artifact hash; artifacts must remain under `reports/` and within the controller limits. Implementation approval always requires `.instar-quality.json` and a current quality-gate report.
