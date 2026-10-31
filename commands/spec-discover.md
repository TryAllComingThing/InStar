---
description: Explore existing source and generate current-state baseline specs with source evidence.
---

Use `$spec-discover` for the user's target project and optional module scope. Read
source and tests, then capture `planning/specs/<capability>/spec.md` through the
discovery controller. This is independent of PRD and change implementation. A request
to generate specs authorizes capture; protect existing baselines unless updates were
requested. Report coverage and unknowns. The terminal `spec-discover` command returns
context or captures an agent-authored request; it does not run an AI model itself.
