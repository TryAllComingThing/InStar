---
description: Legacy slash-command entry for the native spec-discover Skill; use the native Skill unless the user explicitly invokes this command.
---

Delegate to the native `$spec-discover` Skill for the user's target project and optional
module scope. This workflow is independent of PRD and change implementation; preserve
existing baselines unless updates were explicitly requested, and report coverage and
unknowns. The terminal `spec-discover` command returns context or captures an
agent-authored request; it does not run an AI model itself.
