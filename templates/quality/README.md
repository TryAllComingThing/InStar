# Quality check templates

These files are starting points for project-owned quality commands. InStar orchestrates the commands; it does not install scanners or browser dependencies for the project.

## Security

Add `security-check.mjs` to the project, choose a scanner appropriate to the organization, and map it to a `security` check in `.instar-quality.json`. The included `npm audit` template fails on high or critical vulnerabilities and writes `reports/security.json`. Keep generated artifacts under `reports/`; reports are limited to 8 MiB and artifacts to 32 MiB. Do not replace a scanner failure with a manually written PASS.

## Accessibility

Install `playwright` and `@axe-core/playwright`, then run `a11y-check.mjs` after starting the application. Set `A11Y_BASE_URL`, a comma-separated `A11Y_ROUTES` list, and `A11Y_STORAGE_STATE` when protected routes need an authenticated session. The template rejects login redirects for protected routes, writes `reports/accessibility.json`, and fails closed on empty routes, navigation/scan errors and incomplete axe results. It covers axe only; keyboard/focus behavior still requires separate evidence. A smoke script or headed screenshot is not an accessibility pass.

Browser, accessibility and keyboard artifacts are semantic evidence, not marker files. A passing `browser` artifact declares `{kind:"browser",status:"PASS",tool:"playwright",headless:true,journeys:[...]}`. A passing `accessibility` artifact declares `{kind:"accessibility",status:"PASS",tool:"playwright-axe",routesScanned:N,violations:[],incomplete:[]}`. A passing `keyboard` artifact declares `{kind:"keyboard",status:"PASS",journeys:[{route,steps,expectedFocus,actualFocus}]}`. Fake `{status:"passed"}` JSON is rejected.

## Keyboard

Install `playwright`, start the application, then run `keyboard-check.mjs` with `KEYBOARD_JOURNEYS` containing route, keyboard steps and the expected final focus selector, for example:

```sh
KEYBOARD_JOURNEYS='[{"route":"/","steps":["Tab","Tab"],"expectedFocus":"#search"}]' node templates/quality/keyboard-check.mjs
```

Use `KEYBOARD_BASE_URL`, `KEYBOARD_STORAGE_STATE`, `KEYBOARD_READY_SELECTOR` and `KEYBOARD_NAVIGATION_TIMEOUT` as needed. The template writes `reports/keyboard.json` and fails closed when journeys are missing, Playwright or the browser is unavailable, navigation fails, or final focus differs from the expected selector. Axe does not prove keyboard navigation.

## Schema 3 example

```json
{
  "schemaVersion": 3,
  "baseRef": "main",
  "verification": {
    "profiles": {
      "commit": ["lint-check", "typecheck-check", "test-check"],
      "implementation": ["lint-check", "format-check", "typecheck-check", "test-check", "build-check", "browser-check"],
      "full": ["security-check", "a11y-check", "keyboard-check"]
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

The workflow controller uses `implementation` before the implementation approval (lint, format, test; UI also browser) and `full` after approval (security; UI also accessibility and keyboard). `full` is an extension gate, so it should not repeat the same browser check already bound to the approved source. Submitted evidence must reference the matching generated verification report ID and unique artifact hash; artifacts must remain under `reports/` and within the controller limits. Implementation approval always requires `.instar-quality.json` and a current quality-gate report.
