# Controller protocol

Resolve the plugin directory from this skill's installed path (three levels above this reference folder), not the shell working directory. Run:

```sh
node /absolute/plugin/runtime/workflow-controller/cli.mjs /absolute/request.json
```

The wrapper reads one JSON request and prints JSON. `-` reads stdin. It has no terminal questions. Use structured file writes for JSON; do not interpolate user prose into shell code. Consumers need Node >=20.19; the release already contains compiled JavaScript and dependencies. Source checkout maintainers run npm install and npm run build first.

Every request has `action`, `project` (existing absolute target project path). Except initialize, include kebab-case `changeId`. Every mutation except start, initialize and recover requires `expectedVersion` from the latest state. All paths in state are project-relative except returned engine paths. Planning root is `<project>/planning`.

For `evaluate-quality`, `criteria` must contain every ID in [the stage rubrics](../../../docs/EVALUATION.md), with `{id,status,reason,evidence}`. Status is `PASS`, `WARN`, `BLOCK`, or `NA`; evidence is an array of exact excerpts from the current artifact (NA needs a reason). The controller verifies complete rubric coverage and literal excerpt presence, computes a score and SHA-256 artifact fingerprint. Re-run after edits. Reports are quality signals, not controller gates. For `trace-skill`, use a Skill path present under the plugin's `skills/`, one invocation ID with a `started` event followed by exactly one `completed` or `failed` event, and short summaries without secrets. Completed traces are now prerequisites for UI design and implementation/verification transitions.

## Actions

| action | Additional fields | Result / prerequisite |
|---|---|---|
| trace-skill | skill, event (`started`/`completed`/`failed`), invocationId, stage, summary | Enforces one started event followed by one terminal event; appends to `.workflow/traces/<changeId>.jsonl` and the legacy `.workflow/traces.jsonl` aggregate; does not change workflow version |
| trace-agent | role, event, invocationId, stage, summary, executionMode (`subagent`/`main-agent-fallback`), reviewerSessionId for subagent, fallbackReason for fallback, reviewedFiles, findings, unverified | Completed reviews require real project files, file/line findings, and a source snapshot; subagent evidence also records the role configuration hash; writes `reports/reviews/<changeId>/`; does not change workflow version |
| record-usage | stage, source, usage, apiCalls, optional skill/agent/model/provider/sessionId | Appends a token/API usage record and aggregates `reports/usage/<changeId>.json`; does not change workflow version |
| import-session-usage | sessionId, optional changeId/sessionsRoot | Reads Codex session token records and imports them into the active workflow or a session usage report; no prompt content is persisted |
| set-usage-budget | usageBudget:{maxTokens?,maxApiCalls?,enforce?} or null | Updates the current change budget and refreshes the usage report; when enforced and exceeded, controlled transitions are blocked until adjusted |
| evaluate-quality | expectedVersion, stage (`prd`/`spec`/`design`/`tasks`), evaluator, criteria | Writes a fingerprint-bound report under `reports/semantic-quality/<changeId>/`; does not change workflow version or approve a stage |
| initialize | preview (optional boolean) | Creates missing project guidance, rules, reviewers and directories; preserves conflicts |
| start | document, ui (required boolean), stack (`frontend`/`backend`/`fullstack`), optional usageBudget | Starts PRD and records the UI/stack classification that determines mandatory design, implementation, verification and reviewer evidence |
| state | none | Current stage, version, approvals and history |
| save-prd | document | Replaces draft PRD before review |
| submit-prd | none | Awaits human PRD approval |
| approve | reviewHash, decision (`accept-record`/`accept-no-record`/`reject`), confirmation:{text,source} for accept-record, feedback for reject | Advances on accept; stores the human reply only for accept-record; reject returns to the editable stage |
| request-changes | feedback | Rejects pending review and returns to editable stage |
| context | none | Fresh context and contextHash for spec/design/tasks generation; includes project `projectArchitecture`, selected nonbinding `instarReferences`, and bounded project tree; `emptyProject`/`explorationSkipped` suppress exploration for an empty project |
| create-spec | contextHash, proposal, specs:{capability:markdown} | Calls createSpecChange after PRD approval |
| save-spec | contextHash, proposal, specs | Replaces draft spec package before approval |
| submit-spec | report | Calls runSpecVerifyGate; requires a current completed `spec-reviewer` trace bound to the proposal/delta hash; blocks defects or awaits human Spec review |
| write-design | contextHash, document, designCheck:{constraints,coverage,sources} for UI, optional designReuse:[{kind,name,path?,note?}] | Calls generateDesignDoc after Spec approval; requires all six coverage categories; opens a separate `design` approval for technical-design.md; designReuse is bound to design and task approvals |
| write-tasks | contextHash, document | After design approval, calls generateTaskList; opens a separate `tasks` approval for the numbered task list; only task approval authorizes implementation |
| complete-task | taskId, evidence:{summary,files:[{path,line?,note?}],verification?} | Requires code-level file evidence for schema-version-2+ workflows and checks the canonical numbered task |
| submit-implementation | report, checks | Requires all tasks completed, the stack implementation Skill and `quality-gate` at `implementation`, architect/code-reviewer reviews bound to the source snapshot, and the configured `implementation` profile (lint, format, test; UI also browser); opens the `implementation` approval |
| submit-verification | report, checks | Requires the current `implementation` approval and an unchanged source snapshot; runs the stack verify Skill, the `full` extension profile (security; UI also accessibility and keyboard), and security/UI reviewer traces; with a configured profile each check must reference its `checkId`, generated report `reportId`, and real `artifact` |
| archive | none | After human acceptance verifies the source tree still matches the verification fingerprint, then calls promoteToBaseline; archives proposal.md, the delta-specs directory, technical-design.md, tasks.md, and workflow.json. The PRD remains at docs/prd/<changeId>.md. |
| reopen | stage, reason | Invalidates downstream approvals and removes downstream generated artifacts; transaction backup retained |
| recover | transactionId, reason | Explicitly restores interrupted transaction snapshot |

`report` is `{summary:string,source:string,issues:[{severity:"critical"|"warning"|"suggestion",message:string}],unverified:string[]}`. Include paths and evidence in messages. An empty issue list is a substantive reviewer conclusion, not a default. Unverified applicable checks block progression. The controller validates this structure and applies the deterministic Spec gate; it cannot prove that a reviewer Skill ran or that a model's semantic review is complete. Report the actual reviewer or disclose a main-agent fallback.

`checks` is an array of `{name,kind,outcome,evidence,artifact}`. Implementation readiness requires `lint`, `format`, `test` (UI also `browser`); extended verification requires `security` (UI also `accessibility` and `keyboard`). Implementation approval always requires `.instar-quality.json` and current quality-gate evidence. `full` is an extension gate, not a mandatory duplicate of every implementation check. When `.instar-quality.json` has the matching profile, add `checkId` and `reportId`; schema 1/2 evidence must add `source:"manual"` and `manualReason`. The report must be generated against the current source and configuration, and the controller verifies report, definition and artifact hashes. `artifact` must identify an existing report; UI browser/accessibility/keyboard artifacts must follow the semantic JSON schemas in `docs/QUALITY.md`. Outcome is `passed`, `failed` or `not-verified`. Never fabricate successful evidence.

Completed `trace-agent` records require `reviewedFiles` containing real project files, `findings` with optional `path`/`line`, and `unverified`. The reviewer report is bound to the final source snapshot; code changes after review require a fresh review. Schema 5 defaults to `executionMode:"subagent"` with a distinct `reviewerSessionId`; only start with `allowMainAgentFallback:true` when independent reviewers are unavailable, then disclose `main-agent-fallback` and a reason.

Token/API usage is recorded separately from design tokens. `record-usage` accepts non-negative `{inputTokens,cachedInputTokens,outputTokens,reasoningOutputTokens,totalTokens}` and `apiCalls`; `import-session-usage` extracts only numeric usage records from the Codex session JSONL. `usageBudget.enforce:true` blocks controlled transitions after an exceeded budget; use `set-usage-budget` to raise, disable or clear it. The SessionEnd Hook attempts usage import automatically when the project is InStar-initialized. Historical sessions without usage records remain explicitly unavailable rather than estimated.

For approve, copy `pendingReview.hash` from the current state and choose `decision`. `accept-record` requires the actual user's message plus conversation identifier/source and stores them. `accept-no-record` advances without storing the reply text. `reject` requires feedback and returns to the editable stage without creating an approval. Show documents before requesting review. One reply approves one pending boundary. These records are local workflow evidence, not identity authentication.

The default approval sequence is PRD → Spec → technical design → task list → implementation readiness → acceptance. `design` and `tasks` are distinct hashes: editing either document invalidates its approval and downstream implementation. A task-list approval hash ignores checkbox completion so checking tasks during implementation does not make the approval stale. Implementation readiness is a separate post-code approval; it gates the extended quality profile and is not final acceptance.

Example start request (replace project with the actual target):

```json
{"action":"start","project":"/absolute/project","changeId":"add-search","ui":true,"stack":"frontend","document":"# Search PRD\n..."}
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
| Spec awaiting approval, current version explicitly confirmed | approve → context/write-design → show technical design → design approval → fresh context/write-tasks → show numbered tasks → tasks approval → implementation |

Read the latest version after every mutation and context after returning to an editable Spec stage. request-changes clears pending review, so its old hash cannot approve anything; a revised submission requires its new hash. Replies combining assent with edits require revision and renewed review. Questions alone leave pending review unchanged. Repeat review cycles without a fixed limit; never batch a future approval with edits.

## Revisions and recovery

Schema 5 workflows use strict verification evidence. If an active workflow predates schema 5, use `migrate` with `expectedVersion`, `reason`, explicit `ui` and `stack`; migration invalidates old approvals and requires fresh reviews. Use `visualize` (or `instar status`) to inspect stage, approvals and recent traces without mutating state.

Use reopen at the earliest affected stage: prd drops the active change; spec/design drops design and tasks; tasks drops tasks while preserving the technical design and its architecture/standards fingerprints; implementation/verification preserves planning inputs but invalidates verification/acceptance. If project guidance has changed after design, reopening tasks still detects the stale design and requires reopening design. Earlier approval hashes must still match. Re-author through normal actions. Reopen refuses forward jumps and archived changes; start a new change after archival.

Mutations use a project lock, version checks and a snapshot of planning/ and docs/prd under `.workflow/transactions/<uuid>/before`. Errors restore those document trees. Successful transactions retain the most recent 50 committed/rolled-back snapshots; `gc-transactions` can lower the retention and refuses to run while `.workflow/pending.json` exists. Snapshots may contain sensitive requirement history and do not back up application source. Do not externally edit planning/ or docs/prd during controller operations.

If interrupted, inspect `.workflow/pending.json` and its snapshot. Confirm the PID in `.workflow/controller.lock` is no longer running before removing that stale lock; never remove a live process's lock. If an engine `planning/.lock` remains, likewise inspect its owner/process before removing it. Run recover with the exact transactionId and reason. Recovery replaces planning/ and docs/prd with the snapshot; preserve any later external edits separately first. There is no automatic stale-lock deletion or claim of power-loss durability.

The document engine does not scan source, but the workflow controller computes one bounded content fingerprint (up to 50,000 files/512 MiB) at verification and compares it before archive. It does not snapshot after every task. Planning, PRD, reports, logs, workflow state, dependency/build output directories are excluded; normal project source and configuration files are included. If source changes after verification, archive is blocked and implementation must be reopened and reverified. The fingerprint binds the verification/acceptance window; it does not prove that a test command actually ran or that a human supplied a browser result. The controller also does not semantically verify Architecture sections, File Change Plans, Open Questions, or per-task acceptance evidence; those remain Skill/reviewer responsibilities. State files are local and not a security boundary. Direct engine callers can bypass controller conventions; plugin skills must use the controller.
