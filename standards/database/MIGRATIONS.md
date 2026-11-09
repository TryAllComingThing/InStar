# Database migrations

- Treat schema and data migrations as production code: review locking, duration, storage growth, compatibility, and rollback or forward-fix strategy.
- Prefer expand-and-contract for changes that must coexist with old and new application versions: add compatible schema, deploy code, backfill safely, then remove obsolete schema in a later release.
- Keep migrations deterministic, ordered, and safe to rerun only when the framework explicitly supports that behavior.
- Separate large backfills from short schema changes; process bounded batches and expose progress and failure recovery.
- Avoid destructive changes in the same release that first stops using the affected schema.
- Test migrations against representative schema/data and the actual database engine/version. Verify both upgrade and recovery procedures where supported.
- Never edit an already-applied migration unless the project's migration system explicitly requires it; add a forward migration instead.
- Document operational prerequisites, expected duration, locks, rollout order, and rollback limitations for high-risk changes.
- Run migrations with a dedicated identity limited to the required schema and data operations; do not use a runtime superuser or credentials with unrelated production access.
- For PII or regulated-data backfills, minimize copied data, avoid exposing rows in logs, temporary files, or lower environments, and define retention and access controls for intermediate datasets.
- Change grants, row-level-security policies, and application roles through the same reviewed rollout plan; verify the new boundary with the actual runtime role and keep it fail-closed during the transition.
- Treat backups, snapshots, and restored clones as production data: preserve equivalent access controls, encryption, retention, and deletion requirements.
