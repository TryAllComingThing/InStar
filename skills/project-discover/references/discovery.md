# P0 discovery protocol

## Sources and coverage

Inventory configured architecture/design/token paths in `.instar-quality.json`,
applicable AGENTS.md, project standards, manifests, formatter/lint/type settings,
dependency boundaries, API schemas, routes, handlers, services, database schema,
migrations, representative tests and CI/deployment configuration. Respect workspace
boundaries; do not follow symlinks outside the project or reproduce secrets.
Exclude third-party, generated and build output; record exclusions. For large
projects work module by module and report unread scope, not whole-project coverage.

For each domain inspect explicit declarations and representative implementations:

| Domain | Extract |
| --- | --- |
| Architecture | Responsibilities, public entry points, dependency direction, cycles, data ownership, extension seams and important decisions |
| Domain | Vocabulary, state transitions, invariants, money/time/null semantics |
| API | Consumers, schemas, validation, errors, authorization, pagination, compatibility and idempotency |
| Database | Relationships, constraints, transactions, concurrency, query limits, migration and recovery compatibility |
| Coding | Naming, imports, types, error propagation, side effects, cleanup, comments and representative examples |
| Security/runtime | Trust boundaries, tenant isolation, secret handling, timeouts, retries, cancellation, resource limits and observability |
| Testing/delivery | Test layers, fixtures, mock boundaries, real commands, CI gates, build/deployment ordering |
| UI | Existing component/theme/token sources, states, responsive/accessibility conventions; use extract-design-md for a full visual specification |

Do not infer production guarantees from code alone. Inspect counterexamples across
modules. Conflicting documentation and implementation remain a conflict, even when
one pattern is more common. Existing unsafe patterns become risks, not standards.

## Evidence contract

Read [the deliverable contract](deliverables.md) for the output layout. The JSON
shape below applies separately to each `evidence/<domain>.json`. Design and coding
normally load INDEX.md plus relevant domain documents, not the complete evidence.

Evidence JSON is model-authored, not a runtime-validated registry:

```json
{
  "schemaVersion": 1,
  "scope": ["src/orders"],
  "coverage": {"read": [], "unread": [], "excluded": [], "limitations": []},
  "domains": [{"name": "database", "status": "unknown", "reason": "Schema unavailable"}],
  "findings": [{
    "id": "ARCH-001",
    "domain": "architecture",
    "status": "observed",
    "statement": "Order callers use the public module entry point",
    "scope": ["src/orders/**"],
    "sources": [{"path": "src/orders/index.ts", "startLine": 1, "endLine": 3, "excerpt": "exact source text"}],
    "counterexamples": [],
    "confidence": "medium",
    "rationale": "Observed implementation; not a team-approved dependency rule",
    "verification": {"method": "review", "command": null, "result": "not-run"}
  }]
}
```

Use `observed`, `proposed`, `adopted`, `conflict`, or `deprecated` per finding.
`adopted` requires an explicit authoritative source and its scope; a recommendation,
test presence or majority pattern alone does not establish adoption. Do not claim
an external approval identity from locally editable metadata. Confidence measures
evidence sufficiency, not correctness. Every finding needs source evidence; a
proposal cites the gap it addresses. Conflicts include both sides. Missing facts
belong in unknowns, not invented findings. Use project-relative source paths and
real line ranges/excerpts. Record content fingerprints when actually computed;
never fabricate hashes. Discovery does not execute arbitrary configured commands.

`collection.md` summarizes source inventory, domain coverage, findings grouped by
status, conflicts/risks, unknowns and proposed next steps. Keep existing policy
separate from suggested changes. Avoid enforcing arbitrary line counts, new
frameworks or speculative abstractions. Read back JSON and report before delivery.
