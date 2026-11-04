---
name: spec-design
description: Write the technical design after human Spec approval.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md) and [ported method](references/ported-method.md).

After human Spec approval, read the fresh technical-design context. The controller includes applicable `AGENTS.md` guidance, configured or discovered project architecture/design documents and Design Token sources, project `standards/` files, selected `instarReferences`, and an observed project tree. For UI changes, invoke [design-check](../design-check/SKILL.md) with the approved high-fidelity description and include its evidence-backed Style Constraints in `technical-design.md`. Follow project rules and cite available sources in Project Constraints, Architecture, File Change Plan, and Style Constraints. When `projectArchitecture.applicableStandards.mandatoryEntries` is non-empty, add a `Compliance Matrix` table with `Rule`, `Source`, `Status` and `Evidence`; include every applicable mandatory rule ID and cite its project path. Use `NA` only with an applicability reason. `write-design` rejects a missing or malformed matrix. When the PRD or Spec contains `REQ-*` / `NFR-*` IDs, add a `Requirement Traceability` table with `Requirement`, `Design`, `Implementation` and `Verification`; map every ID exactly once and do not claim verified evidence before it exists. `write-design` validates this table only when numbered requirements are present. When no architecture/design/token source exists, state that and use repository evidence; do not invent token mappings or create duplicate project policy documents. Do not impose a framework, theme engine, token system, or CSS architecture unless the project defines it. Run [reuse-discover](../reuse-discover/SKILL.md) before write-design. `reuseDecisions` is required even when the capability index is missing or disabled: record the bounded search, why no reusable capability was selected, and choose local-new/defer. The generated artifact is `planning/changes/<changeId>/technical-design.md`, which remains specific to this change. Submit write-design with document, contextHash and reuseDecisions; continue to spec-tasks.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read current dependencies and retain the full authoring rules, delta semantics and examples. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.

When projectBaseline or docs/project-baseline/rules.json exists, follow the [baseline rule protocol](../project-discover/references/baseline-registry.md). Read applicable domain documents on demand, cite rule IDs and provide ruleReferences for planning or Review submissions. Existing verification commands supply actual automated evidence; extracted guidance does not execute itself.

For Code Reuse & Shared Capability Governance, follow [reuse discovery](../reuse-discover/SKILL.md) and its protocol. Search existing capabilities before adding implementations, preserve module boundaries, justify local-new or shared extraction, and review duplication and abstraction costs. Governance is optional and project-owned tests remain required evidence.
