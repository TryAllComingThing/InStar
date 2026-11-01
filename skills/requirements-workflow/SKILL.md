---
name: requirements-workflow
description: Manage a software change from PRD through human reviews, specification, implementation, verification and archive across frontend, backend and full-stack projects. Use for 撰写需求, 写 PRD, new product requirements, or continuing an existing tracked change.
---

Read the [controller protocol](references/controller.md). Resolve the explicit project path and change ID. The workflow operates directly in the target project without creating project setup files, agent configuration, or engineering templates. Before resuming, read state; never infer the stage from conversation memory or file names.

Requests to reverse-document existing behavior from source use [spec-discover](../spec-discover/SKILL.md) instead. They need no synthetic PRD or implementation lifecycle; do not route them into start/approve/archive. New behavior changes still use this workflow.

For each specialist Skill invocation in a tracked change, record `trace-skill` events with one stable `invocationId`: `started` before applying it, followed by `completed` or `failed`. Include the current stage and a brief non-sensitive summary. This is an agent-reported audit trail, not proof of execution.

## PRD review loop

Use [write-a-prd](../write-a-prd/SKILL.md) for initial authoring and **every round of PRD revision**, including follow-up messages such as “补充需求”, “修改 PRD”, “还需要调整” and “按审核意见修改”. Announce its use for each authoring/revision round. Load its instructions if not already available; reusing loaded instructions is valid, but merely calling save-prd is not evidence that the writing skill was used.

1. For a new change, use write-a-prd to author and persist the PRD with start, run quality-evaluation at stage `prd`, then submit-prd. Show the document, evaluation status/report, assumptions, unresolved decisions and current review hash. Stop at this boundary.
2. For revision feedback while pendingApproval=prd, record request-changes with the actual feedback. Read the current PRD and feedback, use write-a-prd to revise it, save-prd with the latest version, rerun quality-evaluation at stage `prd`, then submit-prd again. Show the revised document, evaluation, changes made, remaining questions and new review hash. Wait for a fresh approval of that version. Repeat this loop as often as requested; do not create a new change for each round.
3. If already editing PRD, continue with write-a-prd and save-prd without request-changes. If the PRD was approved and later business feedback changes it, reopen prd with the actual reason, use write-a-prd, and repeat its review. This invalidates downstream approvals and generated plans.
4. Only explicit approval of the shown, unchanged PRD permits approve with its current hash and the actual reply/source. Then use spec-explore, spec-propose and spec-verify. If exploration changes business requirements, return to the PRD loop.

## Spec review loop

1. From the approved PRD, use spec-propose for proposal and complete delta specs, then spec-verify and quality-evaluation at stage `spec`. Correct blocked findings through spec-propose and rerun both evaluations. A passing gate permits human review, not design generation.
2. Show proposal, delta specs, findings and current review hash. Stop at the human Spec boundary.
3. For Spec revision feedback within the approved PRD scope, use request-changes when pendingApproval=spec, then spec-propose with fresh context and save-spec, followed by spec-verify, quality-evaluation at stage `spec`, and submit-spec. Show the revised package, evaluation, changes and new hash; repeat human review until explicitly approved. If already blocked/editing, revise without request-changes. Feedback that changes PRD business scope returns to write-a-prd through reopen prd and requires renewed PRD approval before regenerating Spec.
4. Only explicit approval of the shown, unchanged Spec permits approve and handoff to spec-design, then spec-tasks. Run quality-evaluation at stage `design` after `technical-design.md` and at stage `tasks` after `tasks.md`. If a previously approved Spec needs revision, reopen spec and repeat its loop. After tasks are generated, show both documents and evaluation reports; the controller's single implementation-plan approval covers both and also authorizes implementation. Do not treat Spec approval as implementation authorization.

## Interpreting review replies

Questions or requests to explain a document do not approve or reject it; answer while preserving pending review. A reply such as “可以，但补充……” that requests document changes is revision feedback, not approval of the resulting unseen version. Never use approval of an earlier version, silence, a passing report, or “继续修改” to cross a review boundary. If the intended decision is genuinely unclear, clarify while retaining the current pending review.

## Implementation and acceptance

After explicit implementation-plan approval, select `engineering-implement` for backend/cross-stack work or `frontend-implement` when UI/Vue conventions are central. Select `engineering-verify` for backend/cross-stack checks; use `frontend-verify` for the established Vue/npm workflow and browser evidence. Block on failed/unverified applicable checks; correct and recheck. The controller records a bounded source-tree fingerprint at verification and blocks archive if included source/config files changed afterward. Show verified behavior and evidence for human acceptance. Record actual acceptance, then archive and verify the four archived artifact groups: proposal, all delta specs, technical design, and task list. The PRD stays at `docs/prd/<changeId>.md`; `workflow.json` is archived alongside those groups.

Keep workflow and specialist skills as separate entrypoints. Use engineering-research before unfamiliar integrations, systematic-debugging for unexplained failures, and context-optimizer only when context quality is a demonstrated blocker. The main agent orchestrates; reviewers are read-only and do not approve. Use spec-reviewer and the relevant frontend/backend code reviewer when available; explicitly disclose fallback to main-agent review. Do not claim a missing reviewer ran. No automatic approval, approval from silence, or bypass of a blocked gate.

A user’s confirmation applies only to the artifact version shown. Record their actual response and conversation source; never fabricate either. Controller hashes detect reviewed document changes and the source fingerprint detects source changes after verification, but neither authenticates human identity or proves checks ran. For changes to reviewed inputs use reopen at the earliest affected stage. For implementation edits after verification, reopen implementation and verify again. Preserve failures and report concrete deviations before continuing dependent work.
