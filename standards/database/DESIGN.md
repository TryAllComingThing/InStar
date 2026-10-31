# Database design and query guidance

Use when changing persistent data, SQL, ORM models, or database-backed behavior. Database-specific behavior belongs in a vendor-specific guide.

- Model domain invariants in the schema where practical: primary keys, foreign keys, `NOT NULL`, uniqueness, and check constraints.
- Choose types and precision to match domain meaning; represent timestamps with an explicit timezone policy and monetary values with exact decimal/integer semantics.
- Keep queries bounded and select only required fields. Inspect query count and plan for hot paths; avoid N+1 access patterns.
- Add indexes for demonstrated query patterns and verify their write/storage cost. Index foreign keys when access patterns and engine behavior justify it.
- Use transactions to preserve multi-step invariants. Keep transaction scope short and define retry behavior for deadlocks or serialization failures.
- Parameterize values. Never concatenate untrusted input into SQL or ORM query fragments.
- Enforce tenant and row access on the server/database boundary. Client-side filtering is not an authorization control.
- Make connection pooling, query timeouts, cancellation, and resource cleanup explicit.
- Treat data deletion, retention, privacy, backup, and restore requirements as part of the design.
- Do not assume every database supports the same isolation, locking, indexing, JSON, or migration behavior; verify the chosen engine's official documentation.

References: [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html). See [migration guidance](MIGRATIONS.md) and [PostgreSQL guidance](postgresql.md) when applicable.
