# InStar engineering references

This directory contains plugin-side reference material for Skills. It is not copied into target repositories and does not automatically become project policy.

## Project-owned standards

Target projects may maintain their own `standards/` directory or configure extra roots with `.instar-quality.json` `context.standards`. A project rule becomes enforceable only when its `standards/index.json` entry is marked `mandatory: true` (or `always: true`) and its `appliesTo` glob matches the current `affectedPaths`. Applicable mandatory rules must be cited in the technical design `Compliance Matrix` and in Review `standardsReferences`; plugin references remain advisory.

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "ARCH-001",
      "path": "standards/architecture/module-boundaries.md",
      "mandatory": true,
      "appliesTo": ["src/**"],
      "summary": "Use public module entry points.",
      "conflictsWith": ["ARCH-002"],
      "supersedes": ["ARCH-000"]
    }
  ]
}
```

`conflictsWith` and `supersedes` are optional rule-ID edges. They are evaluated only when both rules apply to the current paths. A declared `supersedes` edge resolves the conflict in favor of the newer rule; an unresolved conflict returns `HUMAN_DECISION_REQUIRED` and blocks `write-design` rather than letting the agent choose silently. Project-owned rules always take precedence over InStar advisory references. Unknown conflict references fail manifest loading.

The design fingerprint covers only matching rules, including their conflict metadata. Editing an unrelated standards document does not reopen the design, but editing an applicable rule document or its manifest entry does. Use `instar find standards --path <path> [--changed]` to inspect applicability and conflicts, and `instar standards check --document <file>` to validate a design matrix before submission.

## Structure

- `architecture/`: architecture and module-boundary guidance, including [`design-principles.md`](architecture/design-principles.md).
- `coding/`: language-agnostic coding, naming, import, and error-handling guidance.
- `testing/`: test design by level.
- `languages/`: language-specific rules, selected only when the repository uses that language.
- `api/`: HTTP API, interface contract, and security guidance; start with [`INTERFACE-DESIGN.md`](api/INTERFACE-DESIGN.md) for cross-boundary contracts.
- `database/`: database design, migrations, and PostgreSQL-specific notes.
- `common/`: cross-cutting security and testing rules.

## Rule selection and precedence

Use the ECC-inspired layered approach: shared guidance supplies a baseline; a matching language or domain guide adds details and may override general advice where that language or domain requires it. Select only the files relevant to the changed code. Do not load every language guide for every task.

`standards/index.json` is the routing index; it does not inline rule bodies. Selected cards expose compact `sections` metadata with a stable anchor, heading, start/end line, byte count and SHA-256 hash, plus `ruleRefs` that point to real sections. Read a referenced section only when the card is ambiguous, needs an example, or conflicts with another source. Small single-section documents use a whole-document reference instead of inventing extra headings.

The selector first filters by `appliesTo` and affected paths. Cards marked `always`, plus the architecture and testing baselines, are selected before optional cards and are not removed by the inline-byte budget. Optional cards are evicted only with an explicit `omitted` reason. The default compact pack is six cards and 6 KB; it is an index, not a replacement for the source rule.

The user's request and the target project's applicable `AGENTS.md`, configured or discovered context/architecture/design documents, `standards/`, and existing code patterns take precedence. InStar references fill gaps and remain advisory. A deviation is not a BLOCK unless the target project adopted that rule, the user explicitly required it, or a configured automated check enforces it.

Skills should identify technologies from manifests, source files, API contracts, migrations, and existing project documentation before selecting a pack. If the stack is unclear, follow repository patterns and state the uncertainty rather than guessing.

For UI-specific guidance, read the target project's own design document, framework configuration, component library, and token sources.
