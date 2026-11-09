---
name: spec-design
description: Create the technical design and file-change plan after human Spec approval. Use when converting an approved proposal and delta specs into architecture, project constraints, risks, migration steps and UI style constraints; do not use for PRD or Spec authoring, implementation, or task generation. 适用于技术设计、架构方案和实施设计。
compatibility: Requires the full InStar plugin package; sibling Skills and plugin-root references resolve from the installed plugin root.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md), [ported method](references/ported-method.md), [authoring rules](references/authoring.md), and [technical design template](assets/technical-design.md).

After human Spec approval, read the fresh technical-design context. The controller includes applicable `AGENTS.md` guidance, configured or discovered project architecture/design documents and Design Token sources, project `standards/` files, selected `instarReferences`, and an observed project tree. If `context.emptyProject` is true, skip architecture/reference exploration and state that no implementation exists yet. For UI changes, invoke [design-check](../design-check/SKILL.md) with the approved high-fidelity description and include its evidence-backed Style Constraints in `technical-design.md`. Identify reused components, tokens, layout and interaction patterns, and explain any deliberate deviation instead of inventing a parallel pattern; optionally pass structured `designReuse` items so they bind to design and task approvals. Treat plugin design references as advisory. Follow project rules and cite available sources in Project Constraints, Architecture, File Change Plan, and Style Constraints. When no architecture/design/token source exists, state that and use repository evidence; do not invent token mappings or create duplicate project policy documents. Do not turn plugin recommendations into project mandates or require FSD unless the project defines it. The generated artifact is `planning/changes/<changeId>/technical-design.md`, which remains specific to this change. Submit write-design with document and contextHash; show the technical design and wait for its separate `design` approval before spec-tasks.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read the authoring rules and template before drafting; follow the ported method for engine semantics. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.
