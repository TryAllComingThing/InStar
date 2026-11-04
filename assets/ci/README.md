# InStar CI templates

`github-actions.yml` is a starting point, not an automatic approval. It assumes the plugin runtime is available at the repository variable `INSTAR_PLUGIN_PATH` and that the project owns its verification commands in `.instar-quality.json`.

## Required setup

1. Set repository variable `INSTAR_BOOTSTRAP_COMMAND` to the project's locked dependency bootstrap command. The sample defaults to `npm ci`; Python, Rust, .NET and monorepo users must override it.
2. Check out enough history for `baseRef` to resolve; `fetch-depth: 0` is used by the sample.
3. Generate `reports/review.json` from a current snapshot with `instar review init`, complete the AI/human review evidence, then commit or upload it as a protected artifact according to your policy.
4. Mark the InStar verification/review job as a required check in branch protection when remote enforcement is available.
5. Keep the uploaded `instar-evidence` artifact for review or release audit. Set `INSTAR_PLUGIN_PATH` before running the workflow.

## Non-negotiables

- A missing scanner, missing review file, stale snapshot, or unverified item is not a pass.
- CI cannot replace the Codex review session. It validates the review evidence produced for the same source snapshot.
- If `INSTAR_PLUGIN_PATH` is not configured, fail the job rather than silently skipping InStar.
- Keep secrets out of review evidence; reports are redacted, but source and PR bodies still need human review.
- `instar ci status` reports readiness. Publishing requires an explicit local `instar ci publish --confirm` decision.
