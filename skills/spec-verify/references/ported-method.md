Verify planning documents and delta compatibility with the baseline. This ports
the original verification skill's change selection, evidence discipline, delta
operation distinctions, prioritized findings, and report structure. Implementation
mapping, code searches, test coverage, and code-pattern checks are outside this skill.

## 1. Select the change

If a name is provided, use it. Otherwise infer from conversation context when clear,
or select the sole active change under the caller's explicit `<root>/changes/`.
If ambiguous, list available active change directories and ask the user to select.
Include changes with no tasks: this gate normally runs before design or tasks exist.
Do not create a workspace, select a different root, or inspect archived changes
as though they were active. Announce the selected `root` and `changeId` and let the
user identify a different one.

## 2. Load planning context and artifacts

Read fresh workflow context, proposal.md and every `specs/<capability-path>/spec.md`
in the selected change, and the corresponding complete baseline specs under
`<root>/specs/`. Preserve nested capability paths. Review the supplied
`projectArchitecture.guidance` and `projectArchitecture.standards` against the
proposal and delta specs. Read technical-design.md and tasks.md only if already
present. If architecture context is truncated, inspect the relevant original files.
Use current files, not cached conversation text. File existence is not a verdict.

Invoke `runSpecVerifyGate({root, changeId})` and retain its exact `{valid, issues}`
result. An exception, lock conflict, or unreadable input means the gate did not
complete; it is not a passing verdict. The current API reports the first blocking
issue, so fix-and-rerun may reveal more issues. This skill reports findings and
never implements tasks, edits review records, merges baseline specs, or archives.

## 3. Prepare the report

Retain the original three dimensions, scoped to document evidence:

- **Completeness**: Proposal sections, declared capabilities, and delta documents.
- **Correctness**: Requirement/scenario structure and baseline merge compatibility.
- **Coherence**: Consistency between proposal and specs, and with design/tasks when present.

Each dimension can have CRITICAL, WARNING, or SUGGESTION issues.
Distinguish the deterministic API gate result from agent document-review findings;
the API does not enforce every authoring rule below. Never state that a manual
check is implemented by runSpecVerifyGate merely because this skill performs it.

Use **Not applicable** for checks outside the current pipeline stage, such as
checking a design that has not been generated yet. Use **Not verified** for an
applicable check with missing or unusable evidence, with its specific reason.
Never score a skipped or partially verified check as passing. Continue the checks
supported by remaining evidence. No spec opt-out exists in this fixed pipeline.

## 4. Verify Completeness

- Confirm usable Why, What Changes, Capabilities, and Impact sections in proposal.md.
- Compare every new/modified capability named in the proposal with the delta file
  inventory. Report missing deltas and unexplained deltas with concrete paths.
- Preserve exact baseline capability paths. A similar-sounding new path is not
  proof that the intended existing capability was modified.
- If specs are missing or contain no usable operations, report CRITICAL and mark
  dependent reviews Not verified. Do not invent requirements to obtain a clean report.
- Missing design/tasks before those stages are Not applicable, not a Spec failure.
  Existing tasks may be counted as document checklist information only: incomplete
  tasks do not block the pre-implementation Spec gate, and checked boxes do not
  prove that any implementation exists or works.

## 5. Verify Correctness by delta operation

Extract canonical `### Requirement:` blocks and complete FROM/TO rename pairs.
Record the section each belongs to; the operation determines the check.
Ignore syntax inside fenced examples when reviewing authored document structure.

**ADDED and MODIFIED**

- Read the delta text, not the old baseline wording, for intended behavior.
- Require a normative SHALL/MUST statement in the body, and at least one
  `#### Scenario: <name>` containing meaningful WHEN/THEN conditions and outcomes.
- Reject placeholder-only prose, empty scenarios, malformed headings, duplicate
  operations, and requirements outside recognized delta sections.
- A MODIFIED block replaces the entire requirement. Compare against the complete
  baseline block; preserve all existing scenarios and content not intentionally
  changed. Partial fragments are not a patch. Report missing scenarios rather than
  silently approving their deletion.
- Keep new requirement descriptions to 500 characters or fewer; move examples and
  edge cases into scenarios and split independent behaviors. This retained writing
  rule is a document-review warning, not an API-enforced length check. Do not trim
  or split an existing MODIFIED requirement solely to satisfy this limit.
- A new capability needs a meaningful first `## Purpose` section, preferably one
  or two sentences of at least 50 characters. A delta Purpose for an existing
  capability is ignored by the merger; report that it does not change the baseline.

**REMOVED**

- The change requests removal. Never report a removed requirement as a missing
  addition or recommend implementing it.
- Require Reason and Migration. Compare with baseline and inspect the API's
  merge verdict; an already-removed requirement can be an idempotent operation,
  so do not invent a conflict merely because its old name is absent.
- Scenarios for behavior being removed are not required. Removing the last
  requirement is unsupported by the current lifecycle and must remain blocked.

**RENAMED**

- Require a complete FROM followed by TO pair. A rename changes the name, not behavior;
  do not require implementation symbols, filenames, or capability paths to change.
- Read the baseline FROM block, or the TO block when FROM is absent because the
  baseline was already synchronized. Its full body and scenarios are the behavior
  being preserved. An unreadable or missing baseline is not passing evidence.
- If TO also appears under MODIFIED, review its new behavior in that MODIFIED block.
  Otherwise verify that the rename does not introduce a behavior change.

For a change with REMOVED/RENAMED operations but no ADDED/MODIFIED requirements,
new delta scenario checks are **Not applicable**, not a missing-scenario failure.
Keep removal and rename checks active. A file with no parseable operations is
unusable evidence, not a removal-only change.

The API performs a merge preflight without promoting the baseline. Preserve its
conflict verdict. Manual document review does not override it. A passing merge
preflight also does not establish business completeness or implementation correctness.

## 6. Verify Coherence

- Compare the proposal's scope and capabilities with the specs' observable behavior.
- Check each explicit architecture constraint that affects the changed capability. Cite the source path and explain any conflict or missing requirement-level behavior. Do not impose an architecture convention absent from project guidance. Architecture choices that belong to implementation design are deferred to technical-design.md and must not block Spec solely because that later artifact does not exist.
- If design exists, extract its key decisions and compare them with the specs.
  Report contradictions and questions that would change the scope, approach, or
  task breakdown. Do not turn a review into an implementation inspection.
- If tasks exist, check canonical numbering/checkboxes, dependency order, per-task
  acceptance evidence, and that each task group's own tests/docs are included
  there. Archive-dependent follow-up belongs outside tracked checkboxes.
- Missing or unreadable applicable evidence is Not verified with its reason.
  Design/tasks not yet due at this stage remain Not applicable.

## 7. Generate Verification Report

Use the original scorecard and prioritized findings, with document-specific evidence:

```markdown
## Verification Report: <change-name>

API gate: PASS / BLOCKED / NOT RUN (reason)

| Dimension | Status |
|-----------|--------|
| Completeness | Capability/delta coverage; omitted checks and reasons |
| Correctness | ADDED/MODIFIED reviewed; removals and renames separately |
| Coherence | Document consistency; omitted checks and reasons |

### CRITICAL
- <file:line>: <document defect>. Recommendation: <specific correction>.

### WARNING
- <file:line>: <uncertainty or writing-rule violation>. Recommendation: <action>.

### SUGGESTION
- <file:line>: <minor improvement>. Recommendation: <action>.
```

Report results of checks that ran and every Not verified check with its reason.
Count ADDED/MODIFIED requirements separately from REMOVED/RENAMED operations.
Do not count Not applicable checks as skipped applicable checks.

Final assessment:
- If the API gate fails or a CRITICAL document defect exists: block progression
  and list concrete fixes. Name any additional checks not verified.
- If applicable evidence is missing: say no critical issue was found in the checks
  that ran, but name unverified checks; do not claim complete verification.
- If all applicable checks pass: report readiness for **human Spec review**, with
  warning/suggestion counts when present. Never claim readiness for archive,
  completed implementation, or actual human approval from this document report.

## Verification heuristics

- **Completeness**: Focus on objective checklist items and requirement inventories.
- **Correctness**: Use document text and baseline evidence; distinguish inference
  from a deterministic gate result.
- **Coherence**: Look for material inconsistencies, not stylistic preferences.
- **False Positives**: When uncertain, prefer SUGGESTION over WARNING, WARNING over
  CRITICAL. Do not downgrade a known API gate failure.
- **Actionability**: Every issue needs a specific recommendation with a document
  path/line reference where possible. Avoid vague suggestions like "consider reviewing".
