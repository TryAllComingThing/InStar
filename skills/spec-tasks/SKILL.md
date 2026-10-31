---
name: spec-tasks
description: Write an actionable, verifiable task list from the reviewed specification and technical design.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md) and [ported method](references/ported-method.md).

Read the fresh `technicalDesign` and `instarReferences` context in the tasks stage. The source artifact is `technical-design.md`. Check that tasks match its Architecture and File Change Plan sections and the project-owned rules cited there. InStar references are advisory only. Author canonical unchecked numbered tasks with acceptance evidence and dependency order. Submit write-tasks with document and contextHash. Show the implementation plan and wait for explicit implementation authorization.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read current dependencies and retain the full authoring rules, delta semantics and examples. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.
