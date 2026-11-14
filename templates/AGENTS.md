# InStar development workflow

## Route first

Classify the request before reading workflow documents:

| Path | Use when | Required flow |
| --- | --- | --- |
| `micro` | Documentation, copy or test-only change with explicit user authorization and no executable/production code | Use `micro-change`: no PRD/Spec/Design/Tasks or change brief; implement, run targeted checks and one code review, then one final human acceptance. The controller rechecks the workspace inventory baseline at start and submission. |
| `quick` | Small existing-code feature, no UI/auth/data/API/architecture/dependency/infrastructure impact, at most 10 files and 400 changed lines | Use `quick-change`: one change brief, brief approval, implementation, one code review, acceptance. The controller rechecks changes against the workspace inventory baseline. |
| `tracked` | New product behavior, multiple teams, unclear requirements, or any scope outside `micro`/`quick` | Use `requirements-workflow` and the full lifecycle. |
| `discover` | Reverse-document existing behavior from source | Use `spec-discover`; no PRD or implementation lifecycle. |

Use `micro-change` or `quick-change` only when the user explicitly authorizes that route. If eligibility is uncertain, choose `tracked`. Any UI, authentication, authorization, security, secrets, data, migration, API-contract, architecture, dependency or infrastructure change requires `tracked`. Observed source changes always override a lower declared classification.

## Tracked workflow

Start tracked changes with explicit `ui`, `stack` (`frontend|backend|fullstack`) and risk (`lean|standard|governed`). Route:

`PRD → human PRD review → spec-explore (skip when empty) → spec-propose → spec-verify → spec-reviewer → human Spec review → spec-design → human design review → spec-tasks → human task-list review → implementation → verification → human acceptance → archive`

For every revision repeat the corresponding authoring, verification and review gates. Feedback changing approved scope returns to the earliest affected stage. Technical design and task list are separate approvals; task approval authorizes implementation. Use `write-a-prd` for every PRD revision and announce its use.

Read current controller state before continuing. Do not treat a generated report as human confirmation or bypass a blocked gate. Use `complete-tasks` for task batches and `refresh-evidence` for source-only changes after approval; do not reopen unchanged design/tasks.

## Evidence and review

- Implementation approval requires `.instar-quality.json`, a current `quality-gate` report and the configured `implementation` checks.
- Before implementation approval, run architect/code-reviewer review and `quality-gate`; governed changes also need security review across L1/L2.
- After implementation approval, run the stack verification Skill, security-reviewer, frontend-reviewer for frontend/fullstack UI, ui-reviewer for UI, and the `full` checks.
- Critical and unverified findings always block. An ordinary warning requires a disposition with decision, reason, owner and future expiry.
- Record real code references and reviewer execution mode. Never label a main-agent fallback as a subagent.
- Use `record-usage` when measurable; new tracked workflows default to 6M billable tokens and 1200 API calls.

## Execution rules

- Automatic audit writes (`trace-skill`, `trace-agent`, `record-usage`, controller writes under `planning/reports/logs/.workflow/docs/prd`) need no confirmation.
- Reading project context is read-only. Ask before business source/config edits, deletion, commit/push or deployment.
- UI work runs `design-check`, headless Playwright and axe; include keyboard/focus automation. Do not rerun identical browser evidence for the same source snapshot.
- Read `docs/engineering/testing.md` and applicable stack conventions before implementation. Read canonical design documents and token sources for UI work.
- Reviewer templates live in `.codex/agents/`; reviewers are read-only and never approve. If a reviewer is unavailable, disclose it and record an explicitly labelled main-agent review.
- Use `instar status` or `visualize` to inspect tracked workflow state. Archived workflows are immutable; migrate active legacy workflows explicitly.
