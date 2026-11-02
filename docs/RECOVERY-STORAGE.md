# Recovery storage and budgets

Workflow and discovery controllers now declare scoped write sets. Workflow saves
the current workflow state, PRD, change/archive directories and (on promotion) only
affected baseline capabilities. Discovery saves only target Spec files and its
new report. Unrelated planning history is not copied or rolled back.

Version 2 journals record writePaths, presence and originally missing parent
directories before mutation. Shared atomic/JSONL writes reject undeclared targets;
engine direct writes are covered by the controller's declared directories. Restore
validates every target/backup before replacing targets, then removes only newly
created empty parents. Original legacy whole-tree journals remain recoverable.
The low-level transaction helper retains full-tree fallback when no scope is
supplied; controller entry points supply scopes explicitly.

Before copying the selected write set, the controller checks a default
256 MiB / 50,000-file backup budget. Project configuration
may set workflowRecovery.maxBackupBytes (1 through 1 GiB) and maxBackupFiles
(1 through 100,000) in .instar-quality.json. Exceeding the budget stops before
mutation; increasing it is a project decision, not an automatic fallback.

Workflow CLI actions require an absolute project and no changeId:

```json
{"action":"recovery-status","project":"/absolute/project"}
```

Inspect completed journal IDs and sizes. Preview cleanup:

```json
{"action":"prune-recovery","project":"/absolute/project","ids":["completed-UUID-from-status"]}
```

Only explicit preview:false plus confirm:true performs cleanup. Pending recovery
blocks deletion, unfinished journals are never eligible, and paths/symlinks are
checked. Deletion removes rollback history; archive or retain required evidence
before confirming. InStar does not automatically prune old project backups.

Scopes are file/directory-level, not filesystem interception: new controller/engine
mutations must be added to the write set and covered by rollback tests. Journal
metadata is local recovery evidence, not authenticated approval. Crashed process
lock files require operator inspection; the controller does not steal unknown locks.
