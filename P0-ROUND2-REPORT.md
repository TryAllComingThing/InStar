# InStar V2.4 P0 Round 2 — implementation and verification

Status: PARTIAL / NOT RELEASE READY.

## Changes
- P0-01: Unconfigured review stack now selects universal checks rather than silently assuming Vue. Added Python/Java/Go/Vue selection regression tests.
- P0-02: Legacy missing qualityPolicy can no longer produce PASS from verify or gate. Full policy requires Q-01..Q-07, Q-07 cannot be waived. Waiver requires risk, compensating control, approver, expiration, scope fingerprint; raw failure is retained. Unified JSON/Markdown report is written under reports/.
- P0-03: Duplicate clarification answers rejected; reopening PRD resets clarifications and invalidates downstream approvals using existing reopen mechanism. Added lifecycle integration test.
- 21 Skills and controller architecture retained; source/runtime mirrors synchronized.

## Executed verification
- `node --check src/quality-controller/index.mjs`: PASS
- `node --check src/workflow-controller/index.mjs`: PASS
- `node --check test/p0-integration.test.mjs`: PASS
- `node --test test/p0-contract.test.mjs`: 2/2 PASS
- `node --test test/workflow.test.mjs`: BLOCKED, missing npm dependency `smol-toml` (ERR_MODULE_NOT_FOUND)
- `node --test test/p0-integration.test.mjs`: not executable until dependencies restored.
- Full regression/build/release smoke: NOT RUN.

## Remaining before release
1. Restore lockfile-compatible npm dependency closure; run full tests and release smoke.
2. Exercise unified report and fail-closed gate on real frontend/backend fixtures, inspect report JSON and Markdown consistency.
3. Verify compatibility of existing v1/v2/v3 quality configs and document migration to mandatory policy.
4. Verify review selection with mixed frontend/backend changes and report snapshot invalidation.
5. Verify PRD->SPEC->design and reopening PRD integration test with runtime dependencies present.

No claim of P0 closure or release readiness is made.
