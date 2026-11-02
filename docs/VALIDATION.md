# Current validation status

InStar exposes 22 Skills. Historical failure counts in old logs do not describe
the current source. The previous Windows repair completed 120 tests: 111 passed,
zero failed and nine symlink-dependent skips.

Latest next-batch regression completed: 141 tests, 132 passed, zero failed,
nine symlink-dependent skips (`next-batch-regression.log`). It includes scoped
write-set rollback/crash recovery and enabled baseline/reuse integration,
planned extension, approval-bound Review, disabled mode, glob and file-type checks.
After further splitting mixed tests, the affected cases were independently rerun;
ordinary assertions execute even when their symlink subtests are skipped.
The relocated release smoke now includes the same governed extension scenario;
its latest execution result is recorded in next-batch-release.log. No skipped security
check or real-model acceptance is represented as a pass.

Independent model behavior scenarios have now been exercised on three isolated
fixtures, with first-run encoding failures and corrective follow-ups recorded.
Broader stacks, Chinese output fidelity and human confirmation remain pending.
Runtime tests verify deterministic
contracts, not that a model obeyed every Skill instruction. Symbolic-link security
branches require a capable CI host. No production deployment is performed.

Batch 1 validates original quality report integrity/project/current sources,
standalone Hook command identity and common CI runtime-state classification.
Batch 2 covers nested Spec evaluation, WARN propagation, real npm provenance and
stack-specific Skill routing. Batch 3 adds explicit capability source/contract
fingerprints and recovery budgets/inventory/confirmed retention controls.
Controller transactions now use scoped write sets; legacy whole-tree logs remain
recoverable and the low-level helper retains a full-scope compatibility fallback.
See MODEL-ACCEPTANCE.md for executed scenarios and their actual limitations.
