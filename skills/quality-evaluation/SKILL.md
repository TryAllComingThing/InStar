---
name: quality-evaluation
description: Run a structured semantic quality assessment of a tracked PRD, Spec, technical design, or task list, with evidence bound to the exact artifact version.
---

# Quality Evaluation

Use after a tracked artifact is drafted or revised, before presenting it for human review. Read the matching rubric in [evaluation-rubrics.md](../../docs/EVALUATION.md). This Skill produces an AI-assisted quality signal; it does not approve requirements or replace human review.

1. Read the latest workflow `state`, then read the artifact and applicable project instructions/context.
2. Review every criterion for the requested stage. Choose `PASS`, `WARN`, `BLOCK`, or `NA`; explain each judgment. `PASS`, `WARN`, and `BLOCK` require an exact excerpt from the artifact. `NA` requires an explanation.
3. Call `evaluate-quality` with the latest `expectedVersion`, stage, evaluator label, complete criteria array, reasons, and exact evidence excerpts. The controller checks rubric coverage, evidence presence, and binds the report to a SHA-256 fingerprint.
4. If any criterion is `BLOCK`, fix the artifact and rerun the evaluation. Treat `WARN` and `NA` as disclosed risks. Show the resulting report status and path alongside the artifact during review.

## Boundaries

- Do not invent evidence or claim a PASS without an exact source excerpt.
- Evaluation does not change workflow state, approve a stage, or automatically authorize implementation.
- The controller cannot prove the model's semantic judgment or that this Skill actually ran. Skill invocation traces are explicit agent-reported events, not trusted execution attestations.
- Keep reports in `reports/semantic-quality/`; do not embed evaluator prose in product requirements.
