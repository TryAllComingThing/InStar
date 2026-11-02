# Project baseline index

Extraction date: 2026-11-02 (session date). Revision not obtained. Scope: all six original files in this isolated project. AGENTS.md and the [existing API contract](../api.md) take precedence. Nothing is automatically adopted.

|Document|Applicable source|When to read|Coverage / unresolved|
|---|---|---|---|
|[architecture](architecture.md)|src/orders/index.mjs|Related design, implementation and review|All inputs read; production guarantees unknown|
|[domain](domain.md)|src/orders/handler.mjs|Related design, implementation and review|All inputs read; production guarantees unknown|
|[api](api.md)|docs/api.md|Related design, implementation and review|All inputs read; contract conflict unresolved|
|[database](database.md)|src/orders/handler.mjs|Related design, implementation and review|All inputs read; production guarantees unknown|
|[coding](coding.md)|test/orders.test.mjs|Related design, implementation and review|All inputs read; production guarantees unknown|
|[security-runtime](security-runtime.md)|src/orders/handler.mjs|Related design, implementation and review|All inputs read; production guarantees unknown|

Spec: domain, api, security-runtime. Design: architecture, api, database. Implementation: coding plus affected domains. Review: relevant IDs and current source. Load evidence per domain on demand. See [collection](collection.md) for audit and checks. No rules.json was requested or generated; no automatic routing, adoption or gate enforcement is asserted.
