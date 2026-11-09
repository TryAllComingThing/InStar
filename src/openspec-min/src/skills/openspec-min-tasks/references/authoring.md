Create the task list that breaks down the implementation work.

Before writing tasks, check technical-design.md for Open Questions. If any of them
would change what gets built, resolve them with the user first - do not
bake an unstated assumption into the task list.

**IMPORTANT: Follow the template below for tracked tasks.** This engine accepts
canonical `- [ ] X.Y description` tasks, with `- [x]` or `- [X]` for completion.
Other checkbox markers and spacing are unsupported. A line with no checkbox
is not tracked at all. Generate every task unchecked. The external executor
updates only completion markers; changing task content invalidates its fingerprint.

Guidelines:
- Group related tracked tasks under ## numbered headings
- Each tracked task MUST be a checkbox: `- [ ] X.Y Task description`
- Tasks should be small enough to complete in one session
- Order tasks by dependency (what must be done first?)
- Track implementation and verification work that can be completed before
  archive. If the requested workflow includes archive or work that requires
  this change to be archived, preserve those steps as plain bullets in an
  optional `## Workflow follow-up` section at the end of tasks.md. These
  bullets are reference information outside tracked task progress.
- Each task MUST state how to verify completion (a test, command,
  observable behavior, or delivered artifact). Put the verification in
  that task's checkbox description. Use a separate verification task only
  when it checks broader integration or system behavior that spans
  multiple implementation tasks.
- Each task group MUST land the tests and documentation its own work
  calls for. Do NOT collect testing or documentation into a final group -
  when a late group first exercises work from an early one, the failures
  cascade back through every group in between and force rework. A group
  whose work calls for neither, such as scaffolding or dependency setup,
  carries neither. A final group is for integration checks only, not for
  the tests and docs an earlier group owed.

Example:
```
# Tasks

## 1. Setup

- [ ] 1.1 Create new module structure and verify expected files are present
- [ ] 1.2 Add dependencies to package.json and verify package installation succeeds

## 2. Core Implementation

- [ ] 2.1 Implement data export function and verify the export test passes
- [ ] 2.2 Add CSV formatting utilities and verify unit tests cover quoting and delimiters
- [ ] 2.3 Document the export API in docs/export.md and verify the documented command runs as written
```

When applicable, append workflow follow-up as plain bullets, for example:
```
## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
```

Reference specs for what needs to be built, design for how to build it.
