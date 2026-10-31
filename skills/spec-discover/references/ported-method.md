# OpenSpec source and InStar adaptation

Source: [Fission-AI/OpenSpec explore workflow](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/templates/workflows/explore.ts),
downloaded 2026-10-09 from the official raw endpoint. The unmodified source is
retained as [upstream-explore.ts](upstream-explore.ts), SHA-256
`41f98bbf9e139d270d0e7bf4364feff264680ca253b32bf11032db4b12c2117d`.
The upstream HEAD observed during retrieval was `9111a7654d7800391459431fff4eaf66e33a3d2e`;
the commit-pinned download timed out, so the snapshot's content hash is the exact
provenance identifier. The [MIT license](../LICENSE) is included unchanged.

Adapted executable module: `src/openspec-min/src/discovery/instructions.ts`.
Its `getDiscoveryInstructions()` derives from `getExploreSkillTemplate()` and
`PLANNING_GUIDANCE`: investigate actual source before asking factual questions,
map architecture and dependencies, distinguish baseline capabilities from active
changes, read full existing specs, and capture findings without implementing code.
The discovery controller returns this method in its context for the host agent.

InStar changes the purpose from open-ended change exploration to current-state
baseline authoring. It replaces OpenSpec CLI scaffolding and proposal/apply handoffs
with its standalone context/preview/capture protocol; PRD, proposal, tasks and
implementation approval are not fabricated. It adds source evidence, scoped coverage,
fingerprint checks, explicit updates and transactional writes/recovery.

`src/openspec-min/src/discovery/validate.ts` reuses the already-ported OpenSpec
`MarkdownParser`, `SpecSchema`, `findMainSpecStructureIssues` and shared normative
body reader. The adapter validates main-spec structure and WHEN/THEN scenarios;
it rejects delta sections and duplicate requirements. The five change-lifecycle
exports remain unchanged. Source scanning and evidence checks live in the external
`src/discovery-controller/`, keeping the document engine independent of source code.

The upstream [existing-project guide](https://github.com/Fission-AI/OpenSpec/blob/main/docs/existing-projects.md)
primarily documents gradual, change-driven adoption. Whole-project reverse
documentation is an InStar extension, not an upstream feature copied unchanged.
The upstream snapshot is provenance only; do not execute its imports or follow
its old CLI commands as part of spec-discover.
