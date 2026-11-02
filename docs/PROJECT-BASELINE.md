# Project baseline integration (P1)

Project discovery produces six domain documents and a small INDEX under
`docs/project-baseline/`. Optional `rules.json` enables controller integration.
See the [registry protocol](../skills/project-discover/references/baseline-registry.md)
for request examples and the [deliverable contract](../skills/project-discover/references/deliverables.md)
for document scope and reading budgets.

Implemented:

- Workflow `baseline-context`: all summaries or path-filtered rules; document bodies stay on demand.
- Workflow `baseline-adopt`: explicit confirmation, actor/reason, fresh fingerprint and serialized write.
- Spec/design submissions: references to adopted rules with evidence; unrelated rules can be NA with reasons.
- Task generation and implementation approval: baseline version binding.
- Review/pre-PR: changed-path rule coverage and current snapshot binding.
- Existing verification commands remain the source of executable checks; discovery never executes extracted command text.

Adoption metadata is local and editable. It is not authentication or a cryptographic
approval. Rule-reference checks validate structure, coverage and freshness; they
do not prove semantic compliance. Markdown and registry status must be kept in
sync by the author/reviewer; read-only baseline-check verifies IDs, INDEX links and
optional structured evidence mappings. Workflow affectedPaths selects planning
rules and their document fingerprints. Exceptions, expiry automation and approval UI are
not implemented. Projects without rules.json need not migrate.

## Validation

See [current validation status](VALIDATION.md). Historical failure logs are superseded by the Windows repair.
