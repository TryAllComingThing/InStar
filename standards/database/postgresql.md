# PostgreSQL-specific guidance

Apply only when PostgreSQL is the actual target. Verify advice against the project's supported major version and current official documentation.

- Use `timestamptz` for instants and define an application-level timezone policy; use `date` or `timestamp` only when the domain represents those concepts.
- Use exact `numeric` or integer minor units for money; do not use binary floating-point for financial values.
- Choose indexes from real predicates, ordering, and query plans. Consider composite index order and write amplification rather than adding indexes speculatively.
- Use `EXPLAIN (ANALYZE, BUFFERS)` carefully on safe representative workloads; `ANALYZE` executes the query.
- Keep transactions short. Choose isolation and row/advisory locks based on invariants; define bounded retry for retryable serialization failures or deadlocks.
- For large production tables, evaluate lock behavior and use concurrent index operations where appropriate; account for their transaction limitations.
- Consider row-level security for multi-tenant or user-owned data only with policies that fail closed and are tested under the actual application role.
- Use `jsonb` for appropriate semi-structured data, not as a substitute for relational constraints or frequently queried relational fields.
- Configure connection pooling and statement/idle-transaction timeouts according to workload and deployment topology.

References: [PostgreSQL current documentation](https://www.postgresql.org/docs/current/), [Indexes](https://www.postgresql.org/docs/current/indexes.html), [Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
