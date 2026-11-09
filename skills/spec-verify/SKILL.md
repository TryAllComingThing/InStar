---
name: spec-verify
description: Review specification documents and run the deterministic document gate before human Spec review. Use for proposal and delta-spec completeness, correctness and baseline compatibility; do not use for code verification or implementation. 适用于 Spec 文档质量校验与人工评审前门禁。
compatibility: Requires the full InStar plugin package; sibling Skills and plugin-root references resolve from the installed plugin root.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md) and [ported method](references/ported-method.md).

Read fresh workflow context, the PRD, proposal, delta specs, baseline, and `projectArchitecture` guidance/standards. If `context.emptyProject` is true, skip architecture/reference exploration and state that the project has no implementation to inspect. If any input is marked truncated, inspect relevant source documents before relying on it. Apply the complete ported document-review method. Check whether the proposal's Architecture impact subsection preserves the relevant exploration sources, affected modules, and conflicts/unknowns; check whether the proposal/Spec conflicts with explicit project architecture constraints, citing the source path and rule. Do not require a `technical-design.md` Architecture section at this stage because that document is generated after human Spec approval. Run `spec-reviewer` as a mandatory independent read-only review and record it with `trace-agent` at the Spec stage, including the proposal and delta-spec files in `reviewedFiles`. Submit submit-spec with a truthful report; this action invokes runSpecVerifyGate and rejects a missing, stale, critical or unverified spec-reviewer result. A blocked result requires correction and a fresh review. Show the passing report and documents for human Spec review; do not approve them yourself.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read current dependencies and retain the full authoring rules, delta semantics and examples. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.
