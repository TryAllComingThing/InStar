---
name: engineering-verify
description: Verify authorized software changes across frontend, backend, and full-stack repositories by running the project's configured checks and reporting snapshot-bound evidence.
---

Use after implementation, before commit/PR, or when the user asks to verify a change. Read the current Spec/tasks, applicable `AGENTS.md`, project architecture and standards, then determine the affected components and relevant checks. This skill does not assume npm, a browser, or a particular language.

Read `.instar-quality.json` and run `node <plugin>/bin/instar.mjs verify --project <repo> --profile commit|full` (or the JSON action `engineering-verify`). Schema version 3 projects define named profiles under `verification.profiles` and direct executables under `tools.checks`; each check has `command`, `args`, and optional workspace-relative `cwd` and `timeoutMs`. Commands are launched without a shell and must be existing local tools. Arguments are not persisted in reports; use environment-based local secret stores or CI secrets rather than command-line credentials. The project owner is responsible for command safety and CI-level network isolation. Do not add tools or download dependencies during verification.

Choose checks based on the project and change: lint/static analysis, type checks, unit/integration/contract tests, production build, database migration validation, and configured security checks. A migration check should use the project's documented disposable database or CI service; never point it at production. For UI changes, use actual browser/accessibility/visual evidence when required. If a relevant check is absent or unavailable, report it as Not verified and explain why; do not imply a configured command covers checks it does not run.

The controller records command, exit code, duration, output hash and a source snapshot. An optional `verification.inputs` list adds Git-ignored generated inputs to that snapshot. Any failed command or included source change during checks blocks the report. PASS means the configured commands passed; it does not certify that the profile covers every risk. Reports are written under `reports/engineering-verify-<profile>.json`; legacy frontend configuration continues to use `frontend-verify` behavior. Report remaining risks and hand off to `quality-gate` for review; human acceptance remains separate.
