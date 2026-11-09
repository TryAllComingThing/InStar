---
name: spec-tasks
description: Write an actionable, verifiable task list from the reviewed specification and technical design. Use after technical-design approval to produce numbered implementation tasks with acceptance evidence; do not use for design authoring or implementation. 适用于从已审批设计生成可执行任务清单。
compatibility: Requires the full InStar plugin package; sibling Skills and plugin-root references resolve from the installed plugin root.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar
---

Read the [controller protocol](../requirements-workflow/references/controller.md), [ported method](references/ported-method.md), [authoring rules](references/authoring.md), and [tasks template](assets/tasks.md).

Read the fresh `technicalDesign` and `instarReferences` context in the tasks stage after the technical design has been approved. The source artifact is `technical-design.md`. Check that tasks match its Architecture and File Change Plan sections and the project-owned rules cited there. InStar references are advisory only. Author canonical unchecked numbered tasks with acceptance evidence and dependency order. Submit write-tasks with document and contextHash. Show the complete numbered task list and wait for its separate `tasks` approval; only that approval authorizes implementation.

Plugin integration takes precedence over API invocation examples in the ported method: use workflow-controller, with an explicit absolute project path and current state version. The controller calls the five engine APIs. Do not call them directly to bypass review state or write tracked artifacts by hand. The planning root in the method is `<project>/planning`.

Read the authoring rules and template before drafting. Never infer approval from a document or reviewer report. Implementation belongs to engineering-implement or frontend-implement according to the affected stack, outside the document engine.
