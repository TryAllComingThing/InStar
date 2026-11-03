## Project architecture discovery

For a tracked Spec workflow, first read the latest `state`, then request the workflow `context` while the change is in the Spec stage. Inspect `context.projectArchitecture.guidance`, `context.projectArchitecture.standards`, `context.instarReferences`, and `projectTree` before recommending module boundaries or file placement. The project context includes applicable `AGENTS.md` files, configured architecture/design paths from `.instar-quality.json`, or discovered documents in `docs/engineering/`, `docs/architecture/`, `docs/design/` and legacy `.context/`, plus supported documents under the project's `standards/` directory. These documents are optional; missing sources are reported as absent. Do not duplicate existing canonical documents, invent rules, or impose FSD, component layers, or framework conventions the project has not adopted. Treat `instarReferences` as optional guidance; user instructions and project-owned rules take precedence.

For architecture analysis, also consult the relevant plugin references in [InStar standards](../../../standards/README.md), especially [architecture review principles](../../../standards/architecture/overview.md). These are recommendations only; explicit user and project rules take precedence.
When the request crosses language or domain boundaries, use only the matching pack from [language references](../../../standards/languages/README.md), [API guidance](../../../standards/api/DESIGN.md), or [database guidance](../../../standards/database/DESIGN.md). Treat these as recommendations and record project-specific constraints separately.
If repository instructions are contradictory, stale, or too broad to determine the applicable constraints, use [context-optimizer](../../context-optimizer/SKILL.md) to map the source-of-truth documents before concluding the architecture analysis.

Include an architecture impact summary in the exploration handoff using this shape:

```json
{
  "sourcesRead": ["docs/engineering/ARCHITECTURE.md", "standards/architecture/module-boundaries.md"],
  "affectedModules": [],
  "dependencyDirection": [],
  "crossModuleCalls": [],
  "plannedPaths": [],
  "conflicts": [],
  "unknowns": []
}
```

This summary is a conversational handoff to `spec-propose`, not a separate persisted artifact. `spec-propose` must carry its decision-relevant findings into the `Impact` section of the reviewable `proposal.md`: cite the project rule paths read, affected modules, any applicable dependency direction, and conflicts or unknowns. Keep implementation choices provisional there; the technical design resolves them after Spec approval. If a rule or relevant directory listing was truncated, inspect the applicable files before making a recommendation. Surface conflicting instructions instead of selecting one silently.
