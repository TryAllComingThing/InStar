# Workflow trace and semantic evaluation

## Invocation trace

Successful workflow mutations are appended to `.workflow/traces.jsonl` as `workflow-action` events. The writing agent records Skill lifecycle events with `trace-skill` (`started`, `completed`, or `failed`), a stable per-invocation ID, skill path, stage, and short summary. Semantic evaluation also records a `quality-evaluation` event. Use the JSONL file for a chronological audit trail; the existing `workflow.json` history remains the authoritative workflow state history.

Example Skill trace request:

```json
{"action":"trace-skill","project":"/absolute/project","changeId":"add-search","skill":"spec-explore","event":"started","invocationId":"add-search-spec-explore-1","stage":"spec","summary":"Inspecting architecture and affected modules"}
```

Trace records are append-only during normal operation, but project maintainers can edit local files. They are agent-reported and are not cryptographic proof that a model or Skill executed. Do not put secrets, full prompts, or sensitive user data in summaries.

## Semantic quality evaluation

Run `quality-evaluation` after each PRD, Spec, technical design, and task-list draft or revision. The stage rubrics are intentionally stable and cover user outcome/scope, requirement traceability and scenarios, architecture decisions and constraints, and task sequencing/acceptance evidence.

| Stage | Criterion IDs | Evaluation focus |
|---|---|---|
| PRD | `problem-outcome`, `scope-boundaries`, `user-journey-states`, `measurable-acceptance`, `risks-dependencies` | Is the user problem and outcome clear? Are included/excluded scope and important interaction states explicit? Are acceptance conditions testable? Are assumptions and dependencies surfaced? |
| Spec | `prd-traceability`, `normative-requirements`, `behavior-scenarios`, `baseline-delta`, `architecture-impact` | Can requirements be traced to approved PRD scope? Are normative requirements unambiguous? Do scenarios cover expected behavior and edge cases? Are ADDED/MODIFIED/REMOVED deltas valid? Are architecture impacts and exploration findings reflected? |
| Design | `constraints-and-sources`, `decisions-and-tradeoffs`, `architecture-and-dataflow`, `interfaces-and-state`, `file-plan-and-risks` | Does the design cite applicable project rules? Are decisions and alternatives justified? Are module boundaries/data flow clear? Are interfaces and state ownership described? Does the file plan follow repository conventions and include migration/failure risks? |
| Tasks | `spec-design-traceability`, `dependency-order`, `task-sized-delivery`, `task-acceptance-evidence`, `verification-coverage` | Do tasks deliver the Spec and design? Are dependencies sequenced correctly? Are tasks small enough to verify? Does each task have observable completion evidence? Are testing, documentation, and failure paths covered? |

The controller requires all rubric IDs, validates statuses and reasons, confirms every cited excerpt occurs verbatim in the current artifact, computes the artifact fingerprint, calculates a score (PASS=1, WARN=0.5, BLOCK=0; NA excluded), and writes `reports/semantic-quality/<changeId>/<stage>.json`. `PASS` means all applicable criteria passed; `WARN` means at least one criterion is a warning or not applicable; `BLOCK` means at least one criterion is blocked. Reports are overwritten per stage and contain the current evaluation; prior versions can be retained by normal project version control.

This is an AI-assisted semantic assessment with deterministic report-shape, evidence-substring, and fingerprint checks. Those mechanical checks do not independently prove that the reasoning is correct. A report does not alter approvals or replace the existing human review boundary. Any document edit changes its fingerprint, so rerun evaluation before presenting the changed version.
