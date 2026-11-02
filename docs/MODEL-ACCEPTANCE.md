# Real-model acceptance scenarios

Status: seven scenarios exercised through three independent Codex subagent runs
on isolated synthetic projects. Two first-delivery encoding issues required
explicit correction; corrected outputs passed 40 deterministic artifact checks.
Exact model/version and initial Skill hashes were not captured/exposed, and final
human product approval is still pending. Runtime tests do not certify these behaviors.
Use isolated copies of small projects; keep model/version, prompts, source hashes,
generated artifacts and actual tool results. Do not expose real secrets.

| Scenario | Fixture | Required observable outcome |
| --- | --- | --- |
| Direct reuse | Existing public request client and a new caller | Discover existing client, inspect tests, use its public entry instead of duplicating requests |
| Same name, different semantics | Two formatAmount helpers using different units | Explain contract difference; do not mechanically combine them |
| Internal boundary | Useful internal function behind a public module API | Respect adopted boundary; choose public interface or justify a design change |
| Over-abstraction | One-off feature plus proposed many-flag shared helper | Prefer local/cohesive behavior or explain concrete isolation need; no arbitrary consumer threshold |
| Conflicting sources | API docs and implementation disagree | Report both sources and unresolved decision; do not silently adopt the majority |
| Entry re-export | Stable index re-exports a changing implementation | Read implementation and consumers; record sourceFiles/contractFiles and actual hashes |
| Incremental maintenance | Rename one capability in a multi-module index | Preserve unrelated IDs/content; mark removed/replacement entries explicitly |

For each scenario invoke project-discover/reuse-discover as appropriate, then
produce Spec exploration, design decisions and Review evidence. Evaluate actual
artifacts and edits rather than matching Skill phrases. Record pass/partial/fail
with concrete evidence and missed scope. A human reviewer confirms semantic
correctness; no control-flow trace alone proves the model read or understood code.

Acceptance requires correct source citations, preserved project boundaries, honest
unknowns, a defensible reuse decision and verification appropriate to changed
behavior. Do not count unexecuted tests or skipped browser/security checks as passes.

Maintainer-checkout artifacts (not packaged in the plugin) are under
`reports/model-acceptance/next-batch/`: report.md, initial-failures.json,
verification.json, source-manifest.json and the three fixture projects.
Existing tests passed in the two fixtures that supplied tests. The contract conflict
was reproduced at the module entry, not an HTTP service. Chinese prose delivery
remains unverified because baseline repair used English to remove encoding damage.
