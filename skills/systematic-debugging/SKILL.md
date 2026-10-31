---
name: systematic-debugging
description: Diagnose a reproducible or unexplained bug, failing test, build error, or runtime failure using evidence and a minimal root-cause fix. Use for debugging, not for planned feature design or routine successful verification.
---

# Systematic debugging

Find and correct the cause of a failure without hiding it, weakening the requirement, or accumulating speculative changes.

## Workflow

1. Capture the exact symptom, expected behavior, actual behavior, environment/version, and the smallest reproduction available.
2. Read relevant project instructions and inspect the failing test, logs, stack trace, changed files, and nearby call path. Keep secrets and personal data out of copied output.
3. Reproduce with the narrowest safe command. If it cannot be reproduced, record what was attempted and what environmental evidence is missing.
4. Form a short list of hypotheses tied to evidence. Choose a low-cost observation that distinguishes them; change one causal variable at a time.
5. Trace data and control flow to the earliest incorrect assumption or state transition. Check boundary inputs, ordering, concurrency, cleanup, retries, and version/config differences when relevant.
6. Make the smallest root-cause fix. Add or update a regression test that fails before the fix and passes after it when the project supports a suitable test.
7. Rerun the focused reproduction and affected checks. Then hand broader verification to `frontend-verify`; do not claim checks that were not run.

## Guardrails

- Do not delete, skip, loosen, or rewrite a failing test solely to make the suite green. Change a test only when evidence shows its expectation is wrong, and explain why.
- Do not mask the symptom with retries, broad catches, default values, disabled lint/type checks, or suppressed errors unless that is the intended domain behavior.
- Avoid unrelated refactors while the failure is unresolved.
- Preserve logs and observations needed to explain the root cause, but do not expose credentials or sensitive payloads.

## Output

Report the reproduction, root cause, evidence, fix, regression coverage, checks actually run, and remaining uncertainty. If evidence is insufficient, provide the next diagnostic experiment rather than presenting a guess as fact.
