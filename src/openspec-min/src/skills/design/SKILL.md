---
name: openspec-min-design
description: Write the technical design for an openspec-min change after the Spec document gate and human Spec review. Use for the design stage, before task generation.
license: MIT
metadata:
  author: openspec
  upstream: spec-driven design instruction
  port: openspec-min
---

Create the design document that explains HOW to implement the change.

The original design instruction lives in the spec-driven schema, not in a
standalone design skill. Read its [ported full instruction](references/authoring.md)
and the [technical design template](assets/technical-design.md) before drafting. Keep its decisions,
alternatives, risks, migration guidance, and Open Questions rules intact.

## Workflow

1. Resolve the caller's `root` and `changeId`. Require a passing
   `runSpecVerifyGate` and actual human Spec review. A gate result alone is not
   review approval; do not supply `specReviewed: true` on the user's behalf.
2. The caller invokes `generateDesignDoc({root, changeId, specReviewed: true,
   generate})`. Inside the callback, use the freshly supplied proposal, delta
   specs, and full baseline documents. Return a Markdown string; the API persists
   it. Do not call lifecycle APIs recursively from the callback.
3. Read completed dependencies before writing, even if already discussed. Apply
   caller-supplied project context and rules as constraints, without copying them
   into the document. Ground technical decisions in external exploration findings;
   ask for missing facts that would change the approach rather than inventing them.
4. Follow every section and authoring rule in the reference. Unlike the original
   optional design artifact, this pipeline requires technical-design.md for every change. This is distinct from any optional project-owned persistent design guidance.
   Scale its detail to complexity. Retain Migration Plan and explain when no
   migration is needed. Do not rewrite the proposal's motivation or the specs.
5. Resolve questions that would change the specs, chosen approach, or task
   breakdown before completion. If the Spec must change, return to the Spec gate
   and human review instead of hiding the change inside the design.
6. Use the supplied `projectArchitecture` context, including applicable AGENTS.md guidance and the observed project tree. After the call succeeds, verify technical-design.md exists and report its location,
   principal decisions, and genuinely deferrable questions. Continue to task
   generation only within the caller's authorized workflow.

## Failure handling and boundary

The API records reviewed Spec/baseline and design fingerprints. Changed documents,
existing output files, missing approval, or failed validation are blocking errors,
not instructions to overwrite files or manipulate review records. Report the
specific error and use the caller's reviewed regeneration procedure when needed.

Produce documentation only. Do not implement features, execute tests, scan source,
or declare the implementation correct. External Superpowers owns implementation
and its validation after tasks have been generated.
