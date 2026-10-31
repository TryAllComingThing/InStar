---
name: spec-discover
description: Explore an existing codebase and generate evidence-backed current-state baseline specs, for whole-project documentation, a selected module, or an explicitly requested update. Use for 从源码生成Spec、存量工程建档、逆向规格 and spec-discover; new feature proposals use requirements-workflow.
license: MIT
metadata:
  upstream: OpenSpec
  port: InStar current-state discovery
---

Use this independent workflow for documenting existing behavior. It needs neither
project initialization nor a PRD/change ID. Read [the protocol](references/protocol.md)
for controller requests and [the baseline template](assets/spec.md) when authoring.
The [port record](references/ported-method.md) distinguishes OpenSpec code from the
InStar adaptation; its upstream snapshot is provenance, not executable instructions.

1. Resolve the existing absolute project root and requested scope. Obtain `context`
   from `<plugin>/runtime/discovery-controller/cli.mjs` or the `spec-discover` CLI.
   Read the returned `instruction`, source inventory, omissions, `activeChanges`,
   `baselineIndex`, and loaded baseline specs. If a relevant full baseline is not
   loaded, request fresh context with `baselineCapabilities` and include the same
   option in capture. Reading the listed file is useful for review but does not load
   it into the controller's update context.
   Follow applicable project instructions. The controller inventories files and
   fingerprints them; YOU read and interpret source using read-only tools.
2. Follow the returned OpenSpec-derived discovery method. Map routes/entry points to
   business capabilities, trace their implementation and tests, then write current
   behavior with scenarios and source evidence. Read full relevant baselines before
   authoring. Never turn the task into a proposed feature or manufacture a PRD.
3. Submit a `capture` request with `preview:true`, the fresh `contextHash`, complete
   specs, per-requirement evidence, `reviewedFiles` and `limitations`. Review the
   preview's documents and coverage against code. Fix semantic or structural issues.
   A literal citation match is not proof that its interpretation is correct.
4. Apply the same request without preview when generation was requested. That request
   already authorizes creation; do not insert another approval step. For an existing
   capability, populate `update` only when the user requested updating that scope.
   Compare requirement additions, removals and modifications and the separate
   `scenarios.added/removed/modified` lists with the baseline; explain removals and implementation conflicts. Preserve unrelated
   content and retain unknowns explicitly.
5. Read the written `planning/specs/<capability>/spec.md` files and discovery report.
   Report capabilities, source coverage, omissions, limitations and update backups.
   No source implementation or regular workflow approval is recorded by discovery.

For a large project, work capability-by-capability with fresh context between
captures. Continue until the requested scope is covered, or identify the concrete
inaccessible evidence. `unreviewedFiles` and exclusions are coverage limits, never
proof of whole-project completion. Model-authored analysis is not automated runtime
verification; do not claim tests or browser journeys ran unless they actually did.

Use `spec-explore` for discussion-only investigation. Route proposed behavior changes
to `requirements-workflow`; baseline updates invalidate fingerprints of existing
tracked changes, whose reviews must be renewed through the normal workflow.
