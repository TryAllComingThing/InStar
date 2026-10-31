# Controller protocol

Resolve the plugin directory from this skill's installed path (three levels above this reference folder), not the shell working directory. Run:

```sh
node /absolute/plugin/runtime/workflow-controller/cli.mjs /absolute/request.json
```

The wrapper reads one JSON request and prints JSON. `-` reads stdin. It has no terminal questions. Use structured file writes for JSON; do not interpolate user prose into shell code. Consumers need Node >=20.19; the release already contains compiled JavaScript and dependencies. Source checkout maintainers run npm install and npm run build first.

Every request has `action`, `project` (existing absolute target project path). Except initialize, include kebab-case `changeId`. Every mutation except start, initialize and recover requires `expectedVersion` from the latest state. All paths in state are project-relative except returned engine paths. Planning root is `<project>/planning`.

For `evaluate-quality`, `criteria` must contain every ID in [the stage rubrics](../../../docs/EVALUATION.md), with `{id,status,reason,evidence}`. Status is `PASS`, `WARN`, `BLOCK`, or `NA`; evidence is an array of exact excerpts from the current artifact (NA needs a reason). The controller verifies complete rubric coverage and literal excerpt presence, computes a score and SHA-256 artifact fingerprint. Re-run after edits. Reports are quality signals, not controller gates. For `trace-skill`, use a Skill path present under the plugin's `skills/`, a stable invocation ID for its lifecycle, and short summaries without secrets.

## Actions

| action | Additional fields | Result / prerequisite |
|---|---|---|
| trace-skill | skill, event (`started`/`completed`/`failed`), invocationId, stage, summary | Appends one agent-reported Skill event to `.workflow/traces.jsonl`; does not change workflow version |
| evaluate-quality | expectedVersion, stage (`prd`/`spec`/`design`/`tasks`), evaluator, criteria | Writes a fingerprint-bound report under `reports/semantic-quality/<changeId>/`; does not change workflow version or approve a stage |
| initialize | preview (optional boolean) | Creates missing project guidance, rules, reviewers and directories; preserves conflicts |
| start | document | Starts PRD; unique change ID |
| state | none | Current stage, version, approvals and history |
| save-prd | document | Replaces draft PRD before review |
| submit-prd | none | Awaits human PRD approval |
| approve | reviewHash, confirmation:{text,source} | Records actual user reply for pending review; checks live hash |
| request-changes | feedback | Rejects pending review and returns to editable stage |
| context | none | Fresh context and contextHash for spec/design/tasks generation; includes project `projectArchitecture`, selected nonbinding `instarReferences`, and bounded project tree |
| create-spec | contextHash, proposal, specs:{capability:markdown} | Calls createSpecChange after PRD approval |
| save-spec | contextHash, proposal, specs | Replaces draft spec package before approval |
| submit-spec | report | Calls runSpecVerifyGate; blocks defects or awaits human Spec review |
| write-design | contextHash, document | Calls generateDesignDoc after Spec approval |
| write-tasks | contextHash, document | Calls generateTaskList; opens one implementation-plan review covering both technical-design.md and tasks.md; approval authorizes implementation |
| complete-task | taskId, evidence | Records actual completion and checks canonical numbered task |
| submit-implementation | none | Requires all tasks completed with evidence; enters verification |
| submit-verification | report, checks | Requires test and browser evidence; records a source-tree fingerprint, blocks failures or awaits acceptance |
| archive | none | After human acceptance verifies the source tree still matches the verification fingerprint, then calls promoteToBaseline; archives proposal.md, the delta-specs directory, technical-design.md, tasks.md, and workflow.json. The PRD remains at docs/prd/<changeId>.md. |
| reopen | stage, reason | Invalidates downstream approvals and removes downstream generated artifacts; transaction backup retained |
| recover | transactionId, reason | Explicitly restores interrupted transaction snapshot |

`report` is `{summary:string,source:string,issues:[{severity:"critical"|"warning"|"suggestion",message:string}],unverified:string[]}`. Include paths and evidence in messages. An empty issue list is a substantive reviewer conclusion, not a default. Unverified applicable checks block progression. The controller validates this structure and applies the deterministic Spec gate; it cannot prove that a reviewer Skill ran or that a model's semantic review is complete. Report the actual reviewer or disclose a main-agent fallback.

`checks` is an array of `{name,kind,outcome,evidence}`. Include at least `kind:"test"` and `kind:"browser"`; outcome is `passed`, `failed` or `not-verified`. Evidence identifies the actual command/result or browser journey and artifact. Never fabricate successful evidence. Missing browser capabilities block acceptance rather than pretending source review is a browser check.

For approve, copy `pendingReview.hash` from the current state and provide the actual user's message plus conversation identifier/source. Show documents before requesting review. One reply approves one pending boundary. These records are local workflow evidence, not identity authentication.

Example start request (replace project with the actual target):

```json
{"action":"start","project":"/absolute/project","changeId":"add-search","document":"# Search PRD\n..."}
```

After drafting, submit-prd with current expectedVersion. When approval actually arrives, approve with expectedVersion, reviewHash and confirmation. Read context after approval, including project `projectArchitecture` and advisory `instarReferences`, then generate the complete proposal/specs and send create-spec. The same project and plugin reference context is available at design/tasks stages. Do not persist generated documents independently or directly invoke engine APIs.

## Repeated human review

The controller enforces state/version/hash boundaries; it does not invoke the writing model or prove skill selection. `spec-explore` is a conversational handoff; its decision-relevant architecture summary must be copied into the reviewable proposal's `Impact` section by `spec-propose`, but the controller does not validate that semantic transfer. requirements-workflow selects write-a-prd on every PRD authoring/revision round and spec-propose/spec-verify on every Spec revision round. Keep the same changeId throughout review iterations.

| Current state and reply | Actions and handoff |
|---|---|
| PRD awaiting approval, edits requested | request-changes → write-a-prd → save-prd → submit-prd → show revision and wait |
| PRD editing, further edits requested | write-a-prd → save-prd → submit-prd → show revision and wait |
| PRD awaiting approval, current version explicitly confirmed | approve → spec-explore → spec-propose/create-spec → spec-verify/submit-spec → show Spec and wait |
| Spec awaiting approval, edits within PRD scope | request-changes → fresh context → spec-propose/save-spec → spec-verify/submit-spec → show revision and wait |
| Spec blocked/editing | fresh context → spec-propose/save-spec → spec-verify/submit-spec; fix remaining blockers before human review |
| Approved PRD business scope changes | reopen prd → write-a-prd/save-prd → submit-prd → renewed PRD approval → regenerate Spec and repeat review |
| Approved Spec changes within PRD scope | reopen spec → fresh context → spec-propose/save-spec → spec-verify/submit-spec → renewed Spec review |
| Spec awaiting approval, current version explicitly confirmed | approve → context/write-design → fresh context/write-tasks → show both design and tasks → implementation-plan review/authorization |

Read the latest version after every mutation and context after returning to an editable Spec stage. request-changes clears pending review, so its old hash cannot approve anything; a revised submission requires its new hash. Replies combining assent with edits require revision and renewed review. Questions alone leave pending review unchanged. Repeat review cycles without a fixed limit; never batch a future approval with edits.

## Revisions and recovery

Use reopen at the earliest affected stage: prd drops the active change; spec/design drops design and tasks; tasks drops tasks while preserving the technical design and its architecture/standards fingerprints; implementation/verification preserves planning inputs but invalidates verification/acceptance. If project guidance has changed after design, reopening tasks still detects the stale design and requires reopening design. Earlier approval hashes must still match. Re-author through normal actions. Reopen refuses forward jumps and archived changes; start a new change after archival.

Mutations use a project lock, version checks and a snapshot of planning/ and docs/prd under `.workflow/transactions/<uuid>/before`. Errors restore those document trees. Snapshots remain for review and recovery; they may contain sensitive requirement history. They do not back up application source. Do not externally edit planning/ or docs/prd during controller operations.

If interrupted, inspect `.workflow/pending.json` and its snapshot. Confirm the PID in `.workflow/controller.lock` is no longer running before removing that stale lock; never remove a live process's lock. If an engine `planning/.lock` remains, likewise inspect its owner/process before removing it. Run recover with the exact transactionId and reason. Recovery replaces planning/ and docs/prd with the snapshot; preserve any later external edits separately first. There is no automatic stale-lock deletion or claim of power-loss durability.

The document engine does not scan source, but the workflow controller computes a bounded content fingerprint (up to 50,000 files/512 MiB) at verification and compares it before archive. Planning, PRD, reports, logs, workflow state, dependency/build output directories are excluded; normal project source and configuration files are included. If source changes after verification, archive is blocked and implementation must be reopened and reverified. The fingerprint binds the verification/acceptance window; it does not prove that a test command actually ran or that a human supplied a browser result. The controller also does not semantically verify Architecture sections, File Change Plans, Open Questions, or per-task acceptance evidence; those remain Skill/reviewer responsibilities. State files are local and not a security boundary. Direct engine callers can bypass controller conventions; plugin skills must use the controller.
