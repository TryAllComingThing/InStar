# Database design specification

Use this specification when changing persistent data, schema models, ownership boundaries, or database-backed behavior. Query execution belongs in [`query.md`](query.md); rollout mechanics belong in [`MIGRATIONS.md`](MIGRATIONS.md); engine-specific behavior belongs in the matching vendor guide.

## Model domain invariants

- Model important invariants in the schema where practical: primary keys, foreign keys, `NOT NULL`, uniqueness, and check constraints.
- Define table or aggregate ownership and lifecycle before adding fields. Do not mix unrelated entities merely because they are often displayed together.
- Choose types and precision to match domain meaning. Represent timestamps with an explicit timezone policy and monetary values with exact decimal or integer-minor-unit semantics.
- Distinguish required, optional, unknown, and not-applicable states explicitly; avoid encoding different domain states into one overloaded nullable column without a documented meaning.
- Keep derived or cached values tied to clear invalidation and rebuild behavior rather than becoming a second unexplained source of truth.

## Relationships and access boundaries

- Model relationships with explicit referential behavior. Decide and document what happens on parent deletion or ownership transfer.
- Enforce tenant and row access at the server or database boundary. Client-side filtering is not an authorization control.
- Use row-level security, views, or scoped data-access layers when they fit the project's threat model, and test them with the actual runtime role.
- Keep sensitive data classified and minimized. Treat retention, deletion, export, backup, restore, and lower-environment cloning as part of the design.

## Engine and portability

- Do not assume every database supports the same isolation, locking, indexing, JSON, collation, generated-value, or migration behavior. Verify the chosen engine's supported version and official documentation.
- When the project must support multiple engines, isolate unavoidable dialect differences at the data-access boundary rather than spreading conditionals through domain code.

## Review prompts

- Which domain invariant is enforced by the schema, and which is enforced only in application code? Is that split deliberate?
- Can two records represent the same real-world identity or lifecycle state?
- Does every tenant or ownership boundary fail closed for reads, writes, exports, and bulk operations?
- Is sensitive data necessary, retained for a defined period, and removable across live data, indexes, caches, exports, and backups?
- Does the design depend on engine behavior that has not been verified for the supported version?

References: [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html). See [query guidance](query.md), [migration guidance](MIGRATIONS.md), and [PostgreSQL guidance](postgresql.md) when applicable.
