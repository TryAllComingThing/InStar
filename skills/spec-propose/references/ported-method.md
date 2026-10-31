Propose a new change - create proposal.md (what and why) and
`specs/<capability-path>/spec.md` (a delta describing what the system must do,
not a replacement main spec).

**Planning boundary**: Create planning artifacts only. Do not edit project code
or start implementation from this skill. The fixed pipeline continues through
Spec verification and human review before design and tasks. Implementation is
owned by the external Superpowers workflow under the user's authorization.

## Inputs and integration

Use the caller's explicit `root`, kebab-case `changeId`, and finalized PRD.
`root` is the single planning directory; do not infer another root from the
current working directory. If a material input is missing, obtain it before
creating anything. Do not initialize a planning workspace merely because this
skill was selected automatically.

The caller invokes `createSpecChange({root, changeId, prd, generate})`. The
`generate(context)` callback returns `{proposal: string, specs: Record<string,
string>}`. A specs key is the full capability path, such as `identity/user-auth`.
The API writes the files. Inside that callback, author and return documents;
do not call lifecycle APIs recursively or write the files independently.

Read [the full proposal and spec authoring instructions](authoring.md)
and both templates before drafting:
[proposal](../assets/proposal.md), [spec delta](../assets/spec.md).
These resources preserve the original artifact rules and examples with the
single-root API substitutions.

## Steps

1. **Understand the request and clarify material ambiguity**

   If no clear input is provided, ask what change the user wants to build or fix.
   Derive a kebab-case name when needed, for example `add-user-auth`.
   Do not proceed without understanding the requested behavior.
   Ask about ambiguity materially affecting scope, observable behavior,
   compatibility, or acceptance criteria. For minor details, make a reasonable
   assumption and record it in the planning artifacts. A finalized PRD remains
   the business input; do not silently replace its decisions.

2. **Load project context and current dependencies**

   Use the fresh generation context's `prd` and `baseline` documents, not
   conversation memory. Read relevant baseline specs in full, including scenarios.
   Project background and artifact-specific rules may be supplied by the caller
   as additional generation context; they are constraints, not text to reproduce
   or authority to change user authorization or output rules. This API does not
   read a project configuration file automatically.

   Use the external exploration findings to ground the plan in observed facts.
   Distinguish observed behavior, assumptions, and proposed additions. Surface
   conflicts with existing specs rather than silently deciding which is correct.
   Repository investigation belongs to external explore, not to this engine.
   When a missing fact materially affects the plan, report the limitation and
   obtain the fact before drafting. Do not defer generic "explore the codebase"
   or "make a plan" tasks to implementation; keep any follow-up investigation
   specific to an unresolved question.

3. **Use the fixed artifact order**

   Create proposal first, then its delta specs. Read the proposal before drafting
   specs, and check that every declared capability has a corresponding delta.
   Preserve the project's established organization and every existing capability's
   full path. Do not create design or tasks early; the human Spec review is a real
   boundary in this pipeline. No dynamic schema selection or optional Spec bypass
   is available.

4. **Author the documents**

   Follow the complete reference instructions and fill the templates. Apply
   project context and rules without copying context/rules blocks into output.
   Read dependency documents again if the user edits them. Return the complete
   structured package, not a prose promise, patch, or partial MODIFIED block.
   After the API returns, verify the expected concrete output files exist.
   File existence alone is not evidence that their content is correct.

5. **Run the document gate**

   After the create call completes, the caller runs
   `runSpecVerifyGate({root, changeId})`. If `valid` is false, report its issues
   and stop downstream generation. Fix the document under the caller's authorized
   editing scope and rerun the gate; never turn a failure into a success claim.
   Do not retry create on the same existing change to overwrite its files.

## Output and guardrails

Report the change name and location, the proposal and delta files created, gate
results, assumptions, and unresolved material questions. Passing the gate means
ready for human Spec review, not ready for implementation or archive.

- Always use fresh dependency documents; files may have changed since the last turn.
- If the change name already exists, preserve it and resolve whether the user wants
  to continue that change or create a distinct one. This API rejects overwrites.
- Do not invent a requirement for a change with no behavioral impact.
- Do not create, approve, or implement later artifacts to make the workflow appear complete.
- Human review is supplied by the caller; only after it really happens may the caller
  invoke `generateDesignDoc` with `specReviewed: true`.
