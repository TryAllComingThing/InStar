# Database query specification

Use this specification for SQL, ORM queries, database-backed reads and writes, and query performance review. Schema invariants belong in [`schema.md`](schema.md); rollout mechanics belong in [`MIGRATIONS.md`](MIGRATIONS.md).

## Query construction and bounds

- Parameterize values. Never concatenate untrusted input into SQL or ORM query fragments.
- For dynamic identifiers, sort expressions, or operators that cannot be bound as values, select from an explicit allowlist.
- Select only required fields, bound collection sizes and expensive filters, and avoid loading unbounded result sets into application memory.
- Avoid N+1 access patterns. Fetch related data with an appropriate join, batched query, prefetch, or dataloader when the access pattern requires it.
- Keep list responses deterministic with an explicit ordering and stable pagination boundary.
- Keep ORM escape hatches reviewed and parameterized; do not hide unbounded queries behind generic repository helpers.

## Plans, indexes, and hot paths

- Measure query count and inspect plans for hot paths rather than adding indexes speculatively.
- Add indexes for demonstrated predicates, ordering, joins, and uniqueness needs. Verify their write and storage cost, and index foreign keys when access patterns and engine behavior justify it.
- Consider composite-index column order and covering behavior against actual queries rather than column lists alone.
- Use `EXPLAIN` as analysis, not production load. Queries using `ANALYZE` execute the statement and must run only against safe representative data.
- Define acceptable latency and result-size expectations for critical queries when the project has performance requirements.

## Transactions, consistency, and concurrency

- Use transactions to preserve multi-step invariants. Keep transaction scope short and avoid external network calls while holding a transaction.
- Choose isolation and locking based on the invariant being protected; do not assume the default isolation level is sufficient or free.
- Define retry behavior for deadlocks and serialization failures, and make retried operations idempotent where necessary.
- When using replicas, caches, or asynchronous projections, document staleness and read-after-write expectations for user-visible flows.

## Resource and access boundaries

- Enforce tenant, ownership, and row-level authorization in the query or database boundary, not only in the client or presentation layer.
- Make connection pooling, statement or query timeouts, cancellation, and resource cleanup explicit for the deployment topology.
- Bound concurrency where a query or batch can exhaust connections, locks, memory, or downstream capacity.
- Treat exported, cached, and derived query results with the same authorization and retention rules as the source data.

## Verification

- Test authorization boundaries with anonymous, wrong-tenant, and wrong-role access.
- Exercise empty, large, filtered, paginated, and concurrent paths where relevant.
- Verify expected query counts or plans for critical paths without freezing fragile implementation details into every test.

References: [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), [PostgreSQL query plans](https://www.postgresql.org/docs/current/using-explain.html). See [PostgreSQL guidance](postgresql.md) when applicable.
