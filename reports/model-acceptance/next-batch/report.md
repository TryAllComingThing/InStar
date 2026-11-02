# Independent model forward-test report

Three fresh independent Codex subagent invocations executed the actual Skill
instructions on isolated synthetic projects. They received their TASK.md, source
and Skill paths, not the evaluator's expected outcomes. Exact model/version and
sampling settings are not exposed to this evaluator and are not invented here.
The verifier records current Skill hashes at evaluation time; exact initial
invocation hashes were not captured before corrective guidance was added.

This is model-assisted engineering acceptance evidence, not human product approval
or proof that all projects/languages behave the same way.

| Scenario | Observed outcome | Assessment |
| --- | --- | --- |
| Direct reuse | Detail transport follows public network request entry; no duplicate client introduced | Observed pass |
| Same-name functions | Dollars and cents remain distinct; missing detail units explicitly deferred | Observed pass |
| Private boundary | Direct internal headers import rejected; public request selected | Observed pass |
| Over-abstraction | One-off export kept local; no speculative many-switch shared pipeline | Observed pass |
| Contract conflict | API document and handler disagreement reported, no silent policy adoption | Semantics observed; initial delivery encoding failed, corrected output passes artifact checks |
| Re-export dependency | Public barrel and implementation both indexed with actual hashes | Observed pass after index BOM correction |
| Incremental preservation | Existing IDs retained, CAP-DATE and authored date note preserved, governance disabled | Observed pass after index BOM correction |

## Independent checks

`verification.json` records 40 passing source-preservation, index freshness,
evidence, readability, existing-test and conflict-reproduction checks, together
with output and artifact hashes. Two existing Node tests passed (one per supplied
test project). The incremental project had no supplied tests, so the execution
agent did not claim any. The evaluator reproduced invalid limit values 0, 101,
1.5 and NaN through the actual module entry; this is not HTTP verification.

All original source, tests and canonical API documentation are unchanged. The
incremental capability registry is the requested mutable artifact; unrelated date
metadata and authored notes are checked separately.

## First-run failures and limits

See initial-failures.json: the baseline outputs were initially unreadable due to
question-mark encoding loss; the incremental registry initially had an incompatible
BOM. Corrective follow-ups were required and are not hidden. Baseline repair used
English prose, so consistent Chinese deliverables remain an unverified behavior.
The Skill now instructs UTF-8 readback and runtime metadata parsing before delivery.

No implementation of the proposed new detail endpoint, real CI, browser, production
database or external service was tested. No workflow approval identity is inferred
from these reports. Human confirmation and broader-stack repetitions remain needed.
