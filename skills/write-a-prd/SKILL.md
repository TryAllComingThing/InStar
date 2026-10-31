---
name: write-a-prd
description: Draft or revise a product PRD with user outcomes, scope, system behavior and acceptance criteria before specification authoring across frontend, backend and full-stack changes.
---

Read the request, available product context, and relevant existing requirements. Separate confirmed decisions, assumptions, and unresolved questions. Ask only for missing decisions that materially affect scope or acceptance; do not ask users to repeat available facts.

Create or revise `docs/prd/<changeId>.md` through the controller within the authorized scope. Include:
- Problem, intended users, and observable success criteria.
- In scope and out of scope behavior.
- User journeys and applicable loading, empty, error, permission, and responsive states.
- Inputs/outputs, business validation, and relevant accessibility or compatibility constraints.
- Numbered acceptance criteria, dependencies, and unresolved material decisions.

Do not substitute a technical design for business requirements or invent a framework requirement. Keep architecture choices for design. Record the actual user review in the conversation; a file labelled final is not proof of approval. When the PRD is settled, hand off to external exploration and then spec-propose. Do not automatically implement a feature from a PRD-only request.

Read the [workspace workflow guide](../requirements-workflow/references/controller.md) for storage and adapter boundaries.

For tracked changes, use controller start or save-prd to persist the PRD, then submit-prd. Show its path, assumptions, acceptance criteria and review hash; wait for the user’s actual PRD approval. requirements-workflow records approval and continues through exploration and spec authoring. Do not write tracked PRDs directly.

## Revisions after human review

Use this skill again for each PRD revision round; announce “使用 write-a-prd 修订 PRD” so the handoff is visible. Reuse its loaded instructions within the same context; read them again when unavailable. Read controller state, the current PRD and the actual review feedback before editing. Preserve still-valid requirements and acceptance criteria, incorporate requested changes, and update affected journeys, constraints and acceptance criteria together.

If awaiting PRD approval, call request-changes before save-prd; if already editing, save directly. If approved inputs must change, return through requirements-workflow and reopen prd first. Keep the existing changeId. Persist the complete revised PRD through save-prd, then submit-prd using the latest state version. Present the updated path, a concise change summary, unresolved decisions and current review hash, and wait for approval of this revision. Repeat without a fixed round limit until the user approves. Do not generate Spec or infer approval from feedback such as “修改后继续”.

An explanation-only question leaves the pending review intact. A reply combining approval with requested changes must first produce a revised PRD for renewed review. Skill selection and document quality are agent responsibilities; controller actions alone do not attest that this skill ran.
