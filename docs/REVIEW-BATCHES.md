# Review follow-up batches

Historical three-batch notes below are followed by the next batch: controller
write-set journals now replace whole-history copying, and independent model
scenarios have been executed with recorded corrective follow-ups. Current results
are in [VALIDATION.md](VALIDATION.md) and [MODEL-ACCEPTANCE.md](MODEL-ACCEPTANCE.md).

## Batch 1 — gate reliability

- Workflow accepts only integrity-checked quality reports for the same project and
  current snapshot; it retains the report's original workflow source snapshot.
- Hooks reject prefixed/alternate-repository commit and PR creation commands even
  when the current project has valid quality evidence.
- CI and quality snapshots share runtime-state classification; real source changes
  still require a commit before remote operations.
- Negative and positive tests passed before proceeding to batch 2.

## Batch 2 — accuracy and integration

- Nested capabilities use existing discoverSpecFiles in semantic evaluation.
- Standard, rule and reuse Review WARN survive quality/unified aggregation.
- Release provenance records real npm version, dirty flag, working-source hash and
  explicit hash scope, retaining existing package/runtime fingerprints.
- Research/debugging route by stack; task authoring carries relevant reuse/rule IDs;
  main controller protocol lists conditional governance fields and storage actions.
- Focused tests and relocated release smoke passed before batch 3.

## Batch 3 — long-term maintenance foundation

- Optional sourceFiles/contractFiles/sourceHashes protect explicitly associated
  implementations and contracts, without claiming automatic dependency discovery.
- Recovery snapshots have configurable byte/file budgets and read-only inventory.
  Cleanup previews explicit completed IDs, requires confirmation and refuses pending
  or incomplete recovery data. No existing user backup was pruned by this change.
- Model acceptance scenarios are specified, not reported as executed.
- Full-tree copying remains for existing rollback guarantees; a future write-set
  journal requires separate recovery/performance validation.

## Combined verification

139 tests: 130 passed, zero failed, nine symlink-dependent skips. Build/static
validation passed. Final release smoke outcome: batch-final-release.log.
Skipped security branches need a capable CI environment; no external GitHub or
production actions were performed.

Old quality reports lacking projectRoot/workflowSourceSnapshot must be regenerated.
They cannot be upgraded by replacing their source fingerprint at acceptance time.
