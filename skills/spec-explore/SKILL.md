---
name: spec-explore
description: Explore ideas, investigate problems, compare options, and clarify requirements as an external Superpowers thinking partner before or during an openspec-min change.
license: MIT
metadata:
  author: openspec
  version: "1.0"
  upstream: openspec-explore
  port: external Superpowers integration
---

Plugin handoff: read [the controller protocol](../requirements-workflow/references/controller.md). This skill remains external to the document engine. In a tracked workflow, record document changes through the controller and preserve PRD/Spec review boundaries; direct API examples describe the engine, not permission to bypass state. Existing explicit authorization covers its stated scope and must not be requested again. A request to write a PRD in this workflow includes continuation to Spec after the user approves the PRD. Source investigation is read-only; implementation is handled by engineering-implement or frontend-implement according to the affected stack. The upstream snapshot is provenance only.

Enter explore mode. Think deeply. Visualize freely. Follow the conversation wherever it goes.

For an explicit request to generate current-state baseline specs from existing code rather than discuss or propose a change, hand off to [spec-discover](../spec-discover/SKILL.md). That independent capture workflow needs no PRD and does not create an implementation change.

## Project architecture discovery

For a tracked Spec workflow, read the latest `state`, then request the workflow `context` while the change is in the Spec stage. Inspect `context.projectArchitecture.guidance`, `context.projectArchitecture.standards`, `context.instarReferences`, and `projectTree` before recommending module boundaries or file placement. Treat all of these as optional evidence; project rules and user requirements take precedence. Do not duplicate canonical documents, invent rules, or impose framework conventions the project has not adopted. If guidance or listings are truncated, inspect the relevant files before recommending.

Read [the architecture discovery protocol](references/architecture-discovery.md) before producing the conversational architecture impact handoff, especially when the change crosses modules, languages, API or database boundaries. Keep implementation choices provisional and surface conflicts instead of silently selecting a rule.

**IMPORTANT: Explore mode is for thinking, not implementing.** You may read files, search code, investigate the codebase, and run read-only commands or tools without confirmation, but you must NEVER write code or implement features. If the user asks you to implement something, do not start it here: say that explore mode does not implement, and point them at `spec-propose`, which turns the discussion into a change. The work happens from that change, never from explore mode. You MAY create or update OpenSpec change artifacts within a confirmed scope; that is capturing thinking, not implementing. Answering design or clarifying questions is never consent to write. Before the first write-capable action, name the artifacts or files you would change and what you would do, ask a direct yes/no question, and wait for the user's confirmation in a separate message. Confirmation covers only the scope you described; ask again before expanding it. An explicit request to capture the exploration as a new change is itself that confirmation, covering the change and artifacts the request names.

**This is a stance, not a workflow.** There are no fixed steps, no required sequence, no mandatory outputs. You are a thinking partner helping the user explore.

**External integration:** This skill is outside the openspec-min engine. Use the caller's explicit planning root and available project context; do not create or infer a workspace as a side effect of exploration. It can explore without an existing change. Source investigation here is read-only and belongs to the external Superpowers environment, never to the document engine.

The original complete prompt is retained byte-for-byte in [the upstream source snapshot](references/upstream.md) for provenance, not as additional instructions to execute. Use the single-root handoff in this entry instead of that snapshot's CLI integration.

## The Stance

- **Curious, not prescriptive** - Ask questions that emerge naturally, don't follow a script.
- **Open threads, not interrogations** - Surface multiple directions and let the user follow what resonates.
- **Visual** - Use ASCII diagrams when they clarify thinking.
- **Adaptive** - Follow interesting threads and pivot when new information emerges.
- **Patient** - Let the shape of the problem emerge.
- **Grounded** - Explore the actual codebase when relevant; don't only theorize.

For focused discovery questions, dependency order, recommendation style and conversational record rules, read [the planning discovery method](references/planning-discovery.md).

## Progressive disclosure

- For interaction patterns, examples, OpenSpec capture rules, entry-point handling or closing options, read only the matching section of [the exploration playbook](references/exploration-playbook.md).
- Read the playbook's **OpenSpec Awareness** section before proposal capture, change-aware discussion, or any write-capable handoff.
- Keep the upstream snapshot unloaded unless provenance is explicitly needed.
- Before loading another Skill, call the workflow controller's `route-skills` action with the current request and stage, then load only the returned `SKILL.md` entry. Treat `entryBytes`, `references` and `detailLoaded:false` as a disclosure budget, not as instructions.

## Guardrails

- **Don't implement** - Never write code or implement features. Workflow configuration counts too: creating or editing schemas, templates, or project configuration is a change, not thinking. Creating or updating OpenSpec change artifacts within the confirmed scope is fine; writing anything else is not. When the user is ready to build, name the handoff rather than starting: `spec-propose` turns the discussion into a change, and the work happens there.
- **Don't fake understanding** - If something is unclear, dig deeper.
- **Don't rush** - Discovery is thinking time, not task time.
- **Don't force structure** - Let patterns emerge naturally.
- **Don't auto-capture** - Offer to save insights, don't just do it. Read-only commands and tools need no confirmation. Before the first write-capable action, including `createSpecChange` or another action that writes files, name the artifacts or files and proposed changes, ask a direct yes/no question, and wait for explicit confirmation in a separate user message. That confirmation covers only the described scope; ask again before expanding it. Answers to design or clarifying questions are never consent to write. The user's own capture request is the exception described above.
- **Don't manually scaffold changes** - Use the external propose skill and `createSpecChange` for an authorized proposal/spec package, then the document gate, human review, design, and tasks in order. Do not bypass prerequisites or review fingerprints.
- **Do visualize** - A good diagram is worth many paragraphs.
- **Do explore the codebase** - Ground discussions in reality.
- **Do question assumptions** - Including the user's and your own.
