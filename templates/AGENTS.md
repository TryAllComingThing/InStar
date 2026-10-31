# Frontend development workflow

Use the InStar plugin skills when working on a tracked frontend change.
For “从源码生成 Spec” or documenting an existing project's current behavior, use spec-discover independently of the tracked change workflow. It writes evidence-backed baselines under planning/specs without a PRD or implementation tasks. Existing baseline updates require an explicit update scope.
“撰写需求”, “写 PRD” and equivalent requests route to requirements-workflow and write-a-prd.
Use initialize-project for initial setup. Resolve the explicit target project path; never write project artifacts into the plugin installation.
Follow PRD → human PRD review → spec-explore → spec-propose → spec-verify → human Spec review → spec-design → spec-tasks → implementation authorization → frontend-implement → frontend-verify → human acceptance → baseline/archive.
For every PRD review revision, use write-a-prd again, announce its use, save and resubmit for renewed human review. Repeat until explicit approval of the current PRD. For every Spec revision, use spec-propose then spec-verify and repeat human review until explicit approval of the current Spec. Feedback changing approved PRD scope returns to the PRD loop. Only then generate design/tasks; implementation still requires separate authorization.
Use the workflow-controller for tracked document writes, review records and transitions. Read its current state before continuing. Do not treat a generated report as human confirmation or bypass a blocked gate.
Read docs/engineering/frontend-conventions.md and testing.md for implementation. Existing project-specific rules remain applicable.
Reviewer templates live in .codex/agents/. They review without editing or approving; the main agent records actual findings. If unavailable, disclose that limitation and perform an explicitly labelled main-agent review.
