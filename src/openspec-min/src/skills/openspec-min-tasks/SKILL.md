---
name: openspec-min-tasks
description: Derive an ordered, verifiable development task checklist from reviewed openspec-min specs and technical design. Use after technical design and before external implementation.
license: MIT
metadata:
  author: openspec
  upstream: spec-driven tasks instruction
  port: openspec-min
---

Create the task list that breaks down implementation work.

Read the [ported full tasks instruction and examples](references/authoring.md)
and the [tasks template](assets/tasks.md) before drafting. Preserve the original
rules about dependency order, per-task acceptance evidence, local testing and
documentation, and untracked post-archive follow-up.

## Workflow

1. Resolve the caller's `root` and `changeId`. Read fresh proposal, delta specs,
   baseline specs, and technicalDesign. Do not infer completed prerequisites merely because
   a tasks.md file exists. The fixed order is proposal, specs, gate, human Spec
   review, technical design, then tasks.
2. Check technicalDesign (stored in technical-design.md) for Open Questions. Resolve anything that would change what
   gets built before writing tasks. Do not bake an unstated assumption into the
   checklist. Refer to specs for WHAT and technicalDesign for HOW.
3. The caller invokes `generateTaskList({root, changeId, generate})`. Its callback
   receives fresh documents including `technicalDesign`. Return the complete tasks Markdown
   string. The API writes tasks.md. Do not call lifecycle APIs recursively or
   independently persist task/review files inside the callback.
4. Use numbered groups and `- [ ] X.Y description` for each task. Start all tasks
   unchecked. Each includes how completion will be verified: a test, command,
   observable behavior, or delivered artifact. Use the complete reference for
   examples and for distinguishing task-specific verification from integration.
5. Keep implementation and verification that must finish before archive in tracked
   tasks. Archive and work requiring an already archived change go in plain bullets
   under Workflow follow-up, never in a checkbox that would deadlock promotion.
6. After success, verify the concrete tasks.md exists. Report the artifact location,
   task groups, acceptance approach, and any constraints for the external executor.
   Do not mark tasks complete merely because the checklist was generated.

## External execution and failure handling

Superpowers performs implementation, TDD, and reviews under the user's authorization.
This skill generates their plan; it does not perform those activities or inspect code.
The executor changes only canonical completion markers to `[x]` or `[X]` as work
finishes. The current engine accepts these exact markers, not the original engine's
more permissive checkbox spacing.

The API checks reviewed document fingerprints. If specs, baseline, design, or task
content changes, stop and use the caller's regeneration/review procedure; do not
rewrite fingerprint files or bypass the error. Existing outputs are not overwritten.

After execution and actual human acceptance, the caller may invoke
`promoteToBaseline({root, changeId, accepted: true})`; this merges delta specs and
archives the complete change. This skill never infers acceptance from task checkboxes.
