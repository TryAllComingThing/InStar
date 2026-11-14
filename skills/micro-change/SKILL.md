---
name: micro-change
description: Run an explicitly authorized documentation, copy or test-only micro change without PRD, Spec, Design, Tasks or a change brief. Use only when the workspace change contains no executable or production code and no UI, security, data, API, architecture, dependency or infrastructure impact; use quick-change for low-risk production code and requirements-workflow for governed work.
compatibility: Requires the full InStar plugin package; the micro controller resolves from the installed plugin runtime.
---

# Micro change

Use this Skill to remove document ceremony from very small changes that cannot affect production behavior. It has one implementation phase and one final human acceptance. The user's explicit request to use this route is the authorization to start; there is no brief approval.

Do not use this Skill when the change:

- modifies executable or production code, configuration, dependencies or infrastructure;
- changes UI, authentication, authorization, security, secrets, data, migrations or API contracts;
- changes architecture or needs design tradeoff, coordination, migration or rollback planning;
- cannot be observed because the InStar change baseline is missing or unreadable;
- changes more than 20 files or 800 lines.

Allowed paths are documentation (`.md`/`.mdx` or `docs/`), non-executable copy under `i18n`/`locales`/`copy`, and tests under `test(s)`/`__tests__` or `*.test.*`/`*.spec.*`. The controller compares `.instar/baselines/<changeId>.json` with the current workspace at start and submission; `.instarignore` controls exclusions and changedLines is a conservative estimate. When scope is uncertain, use `quick-change` or `requirements-workflow`.

## Entry

Read the current state before acting. Resolve the absolute project path and a stable change ID. Do not infer state from the conversation.

```sh
node <plugin>/runtime/micro-controller/cli.mjs -
```

Send JSON through stdin or a request file. Run `classify` first when eligibility is uncertain.

## Flow

1. Call `classify` if needed, then `start` with `title` and the expected `files`. Do not create a PRD, Spec, Design, Tasks or change brief.
2. Implement the smallest documentation, copy or test change. Run the relevant targeted tests. Perform one focused code review covering correctness, clarity, regression risk and missing verification.
3. Call `submit` with a factual `summary`, the actual affected files and only `passed` checks, including exactly one check named `code-review`. The controller derives the workspace change again and rejects scope escalation.
4. Present the submitted evidence and `pendingReview.hash`. Wait for the user's acceptance. Call `accept` with the matching hash and decision.

## Controller protocol

| Request | Required fields | Result |
| --- | --- | --- |
| `state` | `project`, `changeId` | Current micro state |
| `classify` | `project`, optional `files`, optional `limits` | Read-only workspace-baseline eligibility inspection |
| `start` | `project`, `changeId`, `title`, optional `files`, optional `limits` | Opens implementation after eligibility checks |
| `submit` | `expectedVersion`, `summary`, `checks` | Rechecks the real diff and opens acceptance |
| `accept` | `expectedVersion`, `reviewHash`, `decision` | Completes or returns to implementation |

Decisions are `accept-record`, `accept-no-record` or `reject`. State writes use the shared InStar lock and `.workflow/micro/<changeId>.json`. A rejected acceptance preserves the submitted evidence and returns to implementation.

## Non-negotiable checks

- Read the actual files before changing them and run the relevant targeted tests.
- Do not fabricate check results, changed paths or review evidence.
- Do not edit production code or bypass a rejection; preserve the workspace change and route to `quick-change` or `requirements-workflow`.
- Do not treat generated output or silence as human acceptance.
- Ask before commit, push or deployment. This Skill never approves on the user's behalf.

## Output

Report the implementation summary, actual changed files, checks, review findings, acceptance state and any scope deviation. If the controller rejects the scope, stop and route to the appropriate workflow.
