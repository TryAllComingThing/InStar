---
name: spec-propose
description: Generate or revise proposal and delta specs from a human-approved PRD, including repeated human Spec review feedback in the InStar workflow.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md) and [ported method](references/ported-method.md).

Read fresh context in the spec stage, including `projectArchitecture.guidance`, `projectArchitecture.standards`, `instarReferences`, and the project tree. If any context is marked truncated, inspect relevant source documents before relying on it. Carry forward the architecture impact summary from `spec-explore` into `proposal.md` under `## Impact` as a concise `### Architecture impact (exploration)` subsection: cite project rule paths read, affected modules, relevant dependency direction/cross-module constraints, and conflicts or unknowns. These are review context and provisional impact findings, not final implementation decisions. Also include project rules in delta requirements only when they change observable behavior or acceptance; do not turn technical implementation preferences into business requirements. If no project architecture rules exist, state that and note that design will follow observed repository patterns without assuming a specific architecture. Treat InStar references as nonbinding guidance; project rules and user requirements take precedence. Author proposal and complete delta specs using the ported method and templates. Submit create-spec (or save-spec for a revision) with the fresh contextHash, proposal and specs mapping. Then hand off to spec-verify.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read current dependencies and retain the full authoring rules, delta semantics and examples. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.

## Revisions after human Spec review

Use this skill for every Spec revision round and announce the handoff. Read state, current PRD/proposal/specs, baseline and actual feedback. If pendingApproval=spec, use request-changes before requesting fresh context; if already blocked/editing, proceed with fresh context. For an already-approved Spec, use requirements-workflow to reopen spec first. Submit the complete revised package via save-spec, preserving unaffected requirements and baseline semantics, then use spec-verify again. Present changed requirements/scenarios, findings and the new review hash; wait for renewed human Spec approval. Repeat as often as needed; neither a passing gate nor a request for edits authorizes design/tasks.

If feedback changes the approved PRD's scope or acceptance criteria, return to requirements-workflow and write-a-prd via reopen prd. After renewed PRD approval, regenerate the Spec with create-spec and repeat its review. Do not hide new business requirements in Spec or design. Explanation-only questions leave review pending; approval mixed with requested edits requires renewed review of the edited package.
