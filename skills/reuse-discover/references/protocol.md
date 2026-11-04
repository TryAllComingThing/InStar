# Reuse protocol (optional project integration)

## Capability inventory

Create only when requested:

```text
docs/project-baseline/capabilities/INDEX.md
docs/project-baseline/capabilities/index.json
docs/project-baseline/capabilities/<module>.md
```

INDEX routes needs to module summaries, no source bodies. Module guides explain
contracts, errors, side effects, ownership, allowed consumers, tests and real usage.
Do not inventory every private helper. Prioritize stable public and relevant domain
capabilities, including already adopted libraries/wrappers. Split large inventories
by scope; first version supports at most 500 entries and a 512 KiB index.

```json
{"schemaVersion":1,"enabled":false,"capabilities":[{"id":"CAP-ORDERS-QUERY","name":"Order query","summary":"Queries orders for an authorized tenant","entry":"src/orders/index.ts","visibility":"public","status":"active","sourceHash":"computed SHA-256 of UTF-8 source text","owner":"orders","tests":["test/orders.test.ts"],"consumers":["src/reports/orders.ts"]}]}
```

`enabled:true` is an explicit project opt-in, not inferred from index existence.
Visibility is public/internal/unknown; lifecycle is active/deprecated/missing.
Compute hashes from actual text, never placeholders. Source freshness covers the
entry plus explicitly declared files: manually reread implementation, reexports,
callers and tests; this version is not an inferred dependency graph. Missing sources are
reported, unsafe paths/symlinks rejected. Index cannot override project boundaries.

For reexports and contract-sensitive capabilities, declare sourceFiles and
contractFiles arrays (at most 64 combined paths), with actual UTF-8 SHA-256 values
in sourceHashes keyed by each declared path. All declared files participate in
freshness and context fingerprints. Missing hashes/files mark the capability stale.
This is explicit dependency coverage, not an inferred transitive call graph.

## Context and design

Workflow JSON CLI accepts `{"action":"reuse-context","project":"/absolute/project"}`
without changeId. It returns bounded summaries, current hashes and freshness, not
source bodies. Generation context includes `codeReuse`. First version returns the
bounded index, not semantic search results; use rg and module routing for discovery.

Every write-design requires `reuseDecisions`, including when the capability index is missing or disabled:

```json
[{"need":"Query orders","searched":["src/orders","src/shared"],"candidates":["CAP-ORDERS-QUERY"],"decision":"reuse","selected":"CAP-ORDERS-QUERY","sourceHash":"current source hash","reason":"Contract matches and dependency direction is allowed","verification":"Run order contract and report integration tests"}]
```

Allowed decisions: reuse/adapt/extend/local-new/extract-shared/defer. With a missing or
disabled index, only local-new/defer are legal; they must still record a bounded
`searched` receipt, reason and verification so the skip is auditable. With an enabled
index, for selected
reuse/adapt/extend, entry must exist, be active and fresh. Internal/unknown entries
also require boundaryEvidence. This is evidence, not automated boundary proof.
Shared extraction requires owner, consumers and publicContract strings. A no-op
change may use defer with a clear reason. Document rejected candidates/reasons in
the design; no-candidate claims must state search coverage.

Include a Reuse Decisions section in technical-design.md and reference IDs in tasks.
Controller stores decisions in workflow state; no separate file is necessary.
Spec/proposal records discovery and gaps without binding business requirements to
implementation symbols. Source/index changes invalidate task generation after
design before implementation. Implementation approval binds the design-time reuse
snapshot and decisions, permitting planned source edits and index refresh. Current
result sources are validated at Review. The enabled discovery index remains bounded
and global; unrelated index changes before task generation can require refresh.
Missing or disabled inventories no longer bypass design governance. They retain their
state (`missing`/`disabled`) for audit, require a search receipt and local-new/defer
decision, and do not invalidate task generation after that decision is approved.

## Review and real verification

When enabled, quality-gate review adds `reuseReview` with fresh context fingerprint,
`decisions` in the above shape and `checks` containing exactly one of each:

- reuse-existing
- duplicate-implementation
- shared-capability-design

Also include workflow `changeId` and `planHash` (SHA-256 of JSON.stringify of the
approved reuseDecisions array, or use reusePlanHash from the runtime helper).
Review must preserve approved need/decision/selected/candidates/shared contract;
current sourceHash and verification results may change after planned implementation.
Decision deviations require reopening design. Workflow submit-quality-review checks
the same binding. Local workflow metadata remains editable, not authenticated identity.

Each has status PASS/WARN/NA and evidence. BLOCK or missing evidence is rejected.
Review actual imports and both implementations, not only the author's decision.
Explain NA. No reuse or a single consumer alone is never a blocking condition.
Block adopted-boundary violations, real security/business divergence or missing
required compatibility evidence. Warn on uncertain duplication or abstraction cost.
Run only project-configured real checks; do not claim static analysis proves tests.

Review fingerprint is bound through the quality snapshot and rechecked before PR.
WARN remains visible in reuseReview and propagates to the parent quality status.
Metadata validation does not prove semantic correctness.
Without enabled governance, existing review and workflow contracts are unchanged.

## Incremental maintenance and limits

Use Git changes and source searches to identify affected entries, update selected
hashes only after rereading contracts, and preserve unrelated entries. Do not
silently refresh hashes to hide changes. Deleted/renamed symbols need explicit
status or replacement. Maintenance is model-directed, not a background scanner.
Project owns public structure, dependencies, consumers and tests; InStar owns
discovery guidance, decision records and review evidence. No AST engine, automatic
semantic duplicate detection, automatic API promotion or approval UI is implied.
