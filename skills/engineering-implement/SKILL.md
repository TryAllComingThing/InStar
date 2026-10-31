---
name: engineering-implement
description: Implement an authorized backend or cross-stack engineering plan using project conventions, focused tests, and relevant API, database, security, and language guidance.
---

Use after the implementation plan has been explicitly approved, or when an existing project workflow clearly authorizes the stated change. Read applicable `AGENTS.md`, project architecture and standards, current Spec, technical design and tasks. Inspect manifests and source to identify the actual languages, frameworks, service boundaries, persistence layer and available test commands. Project rules and existing patterns take precedence over InStar references.

Load only relevant references from `standards/`: language guidance for changed files; API design/security for contract or endpoint changes; database design/migrations and the matching database guide for persistence changes; common security/testing for cross-cutting risks. For cross-stack work, preserve API contracts and error semantics, authentication/authorization boundaries, data invariants, rollout compatibility and deployment order across client, service and database.

Implement tasks in dependency order. For behavior changes, add or update a focused test when the project has a suitable test harness; verify invalid inputs, authorization failures, failure/retry behavior, compatibility and migration safety as applicable. Do not assume UI-only validation covers server behavior. Do not introduce frameworks, persistence abstractions, dependencies or deployment changes unless required by the approved design.

Record task completion only after its acceptance evidence exists. If implementation reveals a business or architecture decision outside the approved plan, return to the appropriate review boundary. Use `engineering-verify` for backend or cross-stack changes and `frontend-verify` for the existing Vue-specific workflow. Report completed tasks, actual commands and results, unverified checks, migration/deployment risks and remaining blockers. Never claim human acceptance.
