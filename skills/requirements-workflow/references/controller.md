# Controller protocol

## Optional governance contracts

`recovery-status` reports recovery storage; `prune-recovery` previews explicit
completed IDs and requires preview:false/confirm:true to remove them. Both omit
changeId. See [recovery storage](../../../docs/LOCAL_TESTING.md#7-故障注入与恢复演练).

`baseline-context`, `baseline-adopt`, `baseline-check` and `reuse-context` use an
absolute project but no changeId. Adoption uses explicit confirmation and a fresh
fingerprint. See [baseline registry](../../project-discover/references/baseline-registry.md).
Start may include `lane` and affectedPaths; enabled baseline Spec/design submissions require
ruleReferences. Enabled reuse design requires reuseDecisions; Review requires
changeId/planHash and current result evidence. See [reuse protocol](../../reuse-discover/references/protocol.md).
submit-quality-review now validates report integrity, project and current source;
regenerate old reports rather than constructing acceptance-time fingerprints.

Resolve the plugin directory from this skill's installed path (three levels above this reference folder), not the shell working directory. Run:

```sh
node /absolute/plugin/runtime/workflow-controller/cli.mjs /absolute/request.json
```

The wrapper reads one JSON request and prints JSON. `-` reads stdin. It has no terminal questions. Use structured file writes for JSON; do not interpolate user prose into shell code. Consumers need Node >=20.19; the release already contains compiled JavaScript and dependencies. Source checkout maintainers run npm install and npm run build first.

Every request has `action`, `project` (existing absolute target project path), and a kebab-case `changeId` for change lifecycle actions. Project-level governance/storage actions listed above and recover omit changeId; they use their own confirmation/fingerprint contracts. Change mutations except start and recover require `expectedVersion` from the latest state. All paths in state are project-relative except returned engine paths. Planning root is `<project>/planning`.

For `evaluate-quality`, `criteria` must contain every ID in [the stage rubrics](../../../docs/EVALUATION.md), with `{id,status,reason,evidence}`. Status is `PASS`, `WARN`, `BLOCK`, or `NA`; evidence is an array of exact excerpts from the current artifact (NA needs a reason). The controller verifies complete rubric coverage and literal excerpt presence, computes a score and SHA-256 artifact fingerprint. Re-run after edits. Reports are quality signals, not controller gates. For `trace-skill`, use the canonical Skill name or a path form such as `skills/spec-explore` or `/absolute/plugin/skills/spec-explore/SKILL.md`; each invocation must have exactly one `started` event followed by one `completed` or `failed` event.

## Actions

| action | Additional fields | Result / prerequisite |
|---|---|---|
| list-skills | none | Lists canonical Skill names discovered under the installed plugin |
| route-skills | context, stage | Returns up to four compact Skill routes from `skills/index.json`, filtered by stage and `minTriggerHits`; includes trigger hits, stage match, confidence, body/metadata byte sizes and `detailLoaded:false`. `skills/references.json` supplies deferred summaries, stages, `loadWhen`, authority and risk; only applicable `referenceDetails` should be opened, while `referenceOmitted` records archived or stage-inapplicable files. Load only the selected `SKILL.md` entry |
| trace-skill | skill, event (`started`/`completed`/`failed`), invocationId, stage, summary, optional metrics | Appends one agent-reported Skill lifecycle event to `.workflow/traces.jsonl`; terminal events may carry measured counts; accepts canonical names and path forms; does not change workflow version |
| evaluate-quality | expectedVersion, stage (`prd`/`spec`/`design`/`tasks`), evaluator, criteria | Writes a fingerprint-bound report under `reports/semantic-quality/<changeId>/`; does not change workflow version or approve a stage |
| start | document, lane (`fast`/`standard`/`regulated`), affectedPaths | Starts PRD with an efficiency budget; unique change ID; `affectedPaths` is a bounded workspace-relative list |
| state | none | Current stage, version, approvals, history and efficiency summary |
| save-prd | document | Replaces draft PRD before review |
| submit-prd | none | Awaits human PRD approval |
| approve | reviewHash, confirmation:{text,source} | Records actual user reply for pending review; checks live hash |
| request-changes | feedback | Rejects pending review and returns to editable stage |
| context | optional knownContextHash | Fresh context and contextHash for spec/design/tasks generation; includes project `projectArchitecture` with bounded `guidanceBudget`, selected compact Policy Pack references, and bounded project tree. When knownContextHash still matches, returns a compact unchanged `contextDiff` without repeating full context |
| create-spec | contextHash, proposal, specs:{capability:markdown} | Calls createSpecChange after PRD approval |
| save-spec | contextHash, proposal, specs | Replaces draft spec package before approval |
| submit-spec | report | Calls runSpecVerifyGate; blocks defects or awaits human Spec review |
| write-design | contextHash, document | Calls generateDesignDoc after Spec approval |
| write-tasks | contextHash, document | Calls generateTaskList; opens one implementation-plan review covering both technical-design.md and tasks.md; approval authorizes implementation |
| complete-tasks | tasks:[{taskId,evidence}] | Atomically validates and records one batch of completed canonical tasks; preferred |
| complete-task | taskId, evidence | Compatibility wrapper for one task; retained for older callers |
| submit-implementation | none | Requires all tasks completed with evidence; enters verification |
| submit-quality-review | report or reportPath | Records a current stable `quality-gate` report and binds it to the current source snapshot; `reportPath:"reports/quality-gate.json"` avoids copying the report into the request; required before verification |
| submit-verification | report, checks | Requires a current quality-gate review and at least one applicable check; records a source-tree fingerprint, blocks failed or unverified applicable checks or awaits acceptance |
| archive | none | After human acceptance verifies the source tree still matches the verification fingerprint, then calls promoteToBaseline; archives proposal.md, the delta-specs directory, technical-design.md, tasks.md, and workflow.json. The PRD remains at docs/prd/<changeId>.md. |
| reopen | stage, reason | Invalidates downstream approvals and removes downstream generated artifacts; transaction backup retained |
| recover | transactionId, reason | Explicitly restores interrupted transaction snapshot |

`report` is `{summary:string,source:string,issues:[{severity:"critical"|"warning"|"suggestion",message:string}],unverified:string[]}`. Include paths and evidence in messages. An empty issue list is a substantive reviewer conclusion, not a default. Unverified applicable checks block progression. The controller validates this structure and applies the deterministic Spec gate; it cannot prove that a reviewer Skill ran or that a model's semantic review is complete. Report the actual reviewer or disclose a main-agent fallback.

`metrics` accepts non-negative integer counts for `modelResponses`, `toolCalls`, `browserActions`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`, `qualityGateRuns`, `semanticEvaluations` and `evidenceReused`, plus `durationMs`. Attach them to the terminal event only. Efficiency summaries derive `totalTokens` from input plus output when it is absent, aggregate only terminal invocations, and warn when a lane budget is exceeded; they do not hard-block. Time usage reports `activeMs` (summed terminal `durationMs`), `waitMs` and calendar `elapsedMs`; only `activeMs` drives the time warning. Every lane budgets four required stage semantic evaluations. `status` and `next` expose the summary and recommend `complete-tasks`.

`checks` is an array of `{name,kind,outcome,evidence,applicable?}`. Applicable checks use `passed`, `failed` or `not-verified`; non-applicable checks use `not-applicable` or `not-verified` and must explain why. Do not require browser evidence for CLI or backend-only changes that have no browser surface. Failed or unverified applicable checks block acceptance. Evidence identifies the actual command/result or browser journey and artifact. `quality-gate` verification reports expose `browserAcceptance` (`VERIFIED`, `FAILED`, `NOT_CONFIGURED`, `NOT_APPLICABLE`, `NOT_RUN`) and `secretScan`; only `VERIFIED` means the project-owned command actually ran and passed. Never fabricate successful evidence.

For approve, copy `pendingReview.hash` from the current state and provide the actual user's message plus conversation identifier/source. Show documents before requesting review. One reply approves one pending boundary. These records are local workflow evidence, not identity authentication.

Example start request (replace project with the actual target):

```json
{"action":"start","project":"/absolute/project","changeId":"add-search","lane":"fast","affectedPaths":["src/search"],"document":"# Search PRD\n..."}
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
