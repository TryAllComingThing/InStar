---
name: quick-change
description: Run a low-risk small change through a two-decision fast path with one change brief, workspace-baseline risk escalation and verifiable acceptance evidence. Use only after explicit user authorization for a small existing-code change; use requirements-workflow for UI, authentication, authorization, data, API, architecture, dependency or infrastructure changes.
compatibility: Requires the full InStar plugin package; the quick controller resolves from the installed plugin runtime.
---

# Quick change

Use this Skill to shorten time-to-first-edit and token use for a small existing-code change. It replaces the separate PRD, Spec, technical design and task-list approvals with one reviewable `change-brief.md` and two human decisions: brief approval, then acceptance. The brief approval authorizes implementation.

Do not use this Skill when the change:

- changes UI, authentication, authorization, security, secrets, data, migrations, API contracts, architecture, dependencies or infrastructure;
- needs product discovery, cross-team coordination or a migration/rollback plan beyond one page;
- cannot be observed because the InStar change baseline is missing or unreadable;
- changes more than 10 files or 400 lines;
- is already represented by a tracked `requirements-workflow` change.

When eligibility is uncertain, use `requirements-workflow`. The controller fails closed and rejects unsafe or oversized changes at submission.

## Entry

Read the current state before acting. Resolve the absolute project path and a stable change ID. Do not infer state from the conversation.

```sh
node <plugin>/runtime/quick-controller/cli.mjs -
```

Send JSON through stdin or a request file. Do not read the full tracked-workflow documentation unless the controller requires an upgrade.

## Flow

1. Inspect the actual repository and write one `change-brief.md` under `planning/quick/<changeId>/`. Keep it to one page and include: outcome, behavior change, non-goals, file plan, design/rollback, acceptance checks.
2. Call `start` with `title`, `stack`, `files`, `brief` and `ui:false`.
3. Show the user the brief path, summary and `pendingReview.hash`. Wait for a real decision. Call `approve` with `reviewHash` and `decision`.
4. After approval, implement the smallest correct change. Use the project's targeted checks; avoid full-suite reruns until the final check. Run one focused code review covering correctness, security-sensitive paths, regressions and missing tests.
5. Call `submit` with a factual summary, real changed-file evidence and checks whose statuses are `passed`. Include one check named `code-review`. The controller derives the actual workspace change again and rejects scope or risk escalation.
6. Present the submitted evidence and the new `pendingReview.hash`. Wait for acceptance. Call `accept` with the matching hash and decision.

## Controller protocol

| Request | Required fields | Result |
| --- | --- | --- |
| `state` | `project`, `changeId` | Current quick state |
| `classify` | `project`, optional `files`, optional `limits` | Read-only workspace-baseline risk and size inspection |
| `start` | `project`, `changeId`, `title`, `stack`, `files`, `brief`, `ui:false` | Writes the brief and opens brief approval |
| `approve` | `expectedVersion`, `reviewHash`, `decision`; `confirmation` for `accept-record`; `feedback` for `reject` | Authorizes implementation or rejects the brief |
| `revise-brief` | `expectedVersion`, `brief`, optional `files` | Rewrites a rejected brief and reopens brief approval |
| `submit` | `expectedVersion`, `summary`, `checks` | Rechecks the workspace change and opens acceptance |
| `accept` | `expectedVersion`, `reviewHash`, `decision` | Completes or rejects acceptance |

Decisions are `accept-record`, `accept-no-record` or `reject`. Never treat generated output or silence as human approval. State writes use the shared InStar lock and `.workflow/quick/<changeId>.json`.

## Non-negotiable checks

- Read the actual files before changing them and run the relevant targeted tests.
- Do not fabricate check results, changed paths or review evidence.
- Do not edit the brief after approval; use `revise-brief` after a rejection, or start a new quick change / migrate when scope changes.
- Do not bypass an upgrade rejection. Preserve the workspace change and migrate the change to the full workflow.
- Ask before commit, push or deployment. This Skill never approves on the user's behalf.

## Output

Report the brief path, implementation summary, actual changed files, checks, review findings, acceptance state and any scope deviation. If the controller upgrades the change, stop and route to `requirements-workflow`.
