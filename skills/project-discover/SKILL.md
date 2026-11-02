---
name: project-discover
description: Extract evidence-backed architecture, API, coding, database and engineering constraints from an existing project; use for 项目规范提取、工程基线采集 and project-discover. Existing behavior specs use spec-discover; complete visual design extraction uses extract-design-md.
---

# Project engineering discovery

Resolve the target root and requested scope. Read applicable AGENTS.md first, then
follow [the discovery protocol](references/discovery.md). This is source analysis,
not an automatic scanner, approval workflow, or implementation task.

Read explicit project policy and tool configuration before inferring conventions.
Trace representative entry points through modules, public contracts, persistence
and tests. Search for counterexamples. Separate observed facts, explicitly adopted
rules, proposed improvements and conflicts. Existing code frequency is not approval.

Cover architecture, business invariants, API, database, coding, security, runtime,
testing and delivery; include UI when applicable. Mark absent domains NA with
reasons and inaccessible or unread domains unknown. Do not invent missing policy.
Use plugin standards only as advisory gap-analysis guidance; project rules prevail.

Return conclusions in conversation for analysis-only requests. For generation,
write a small `docs/project-baseline/INDEX.md` and separately loadable domain
documents using [the deliverable contract](references/deliverables.md). Respect a
user-selected destination. Put collection history and source excerpts in separate
audit/evidence files, not the normal development context. Preserve existing authored
content and unrelated scope. Do not modify code, schemas, AGENTS.md, canonical
standards or quality configuration. Test/delivery sources support verification;
full UI documentation uses extract-design-md instead of duplicating its output.

Recheck cited source content before finalizing. Report coverage, conflicts, unknowns,
actual checks run and next actions. A matching excerpt is evidence of location,
not proof of interpretation. Never claim runtime, browser or CI verification from
static analysis. No baseline is adopted merely because a report was generated.

Preserve UTF-8 end to end when writing documents. Read back non-ASCII paragraphs;
JSON parsing alone does not catch text replaced by question marks during shell piping.

For machine-readable routing and explicit adoption, follow the
[P1 registry protocol](references/baseline-registry.md). Generate rules.json alongside
domain documents when requested; never silently adopt extracted observations.
