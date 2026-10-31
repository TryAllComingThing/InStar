---
name: spec-design
description: Write the technical design after human Spec approval.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md) and [ported method](references/ported-method.md).

After human Spec approval, read the fresh technical-design context. The controller includes applicable `AGENTS.md` guidance, configured or discovered project architecture/design documents and Design Token sources, project `standards/` files, selected `instarReferences`, and an observed project tree. For UI changes, invoke [design-check](../design-check/SKILL.md) with the approved high-fidelity description and include its evidence-backed Style Constraints in `technical-design.md`. Treat plugin design and theme references as advisory. Follow project rules and cite available sources in Project Constraints, Architecture, File Change Plan, and Style Constraints. When no architecture/design/token source exists, state that and use repository evidence; do not invent token mappings or create duplicate project policy documents. Do not turn plugin recommendations into project mandates or require FSD unless the project defines it. The generated artifact is `planning/changes/<changeId>/technical-design.md`, which remains specific to this change. Submit write-design with document and contextHash; continue to spec-tasks.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read current dependencies and retain the full authoring rules, delta semantics and examples. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.
