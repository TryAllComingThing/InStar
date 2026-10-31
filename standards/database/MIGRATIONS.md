# Database migrations

- Treat schema and data migrations as production code: review locking, duration, storage growth, compatibility, and rollback or forward-fix strategy.
- Prefer expand-and-contract for changes that must coexist with old and new application versions: add compatible schema, deploy code, backfill safely, then remove obsolete schema in a later release.
- Keep migrations deterministic, ordered, and safe to rerun only when the framework explicitly supports that behavior.
- Separate large backfills from short schema changes; process bounded batches and expose progress and failure recovery.
- Avoid destructive changes in the same release that first stops using the affected schema.
- Test migrations against representative schema/data and the actual database engine/version. Verify both upgrade and recovery procedures where supported.
- Never edit an already-applied migration unless the project's migration system explicitly requires it; add a forward migration instead.
- Document operational prerequisites, expected duration, locks, rollout order, and rollback limitations for high-risk changes.
