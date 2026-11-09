Create the proposal document that establishes WHY this change is needed.

Sections:
- **Why**: 1-2 sentences on the problem or opportunity. What problem does this solve? Why now?
- **What Changes**: Bullet list of changes. Be specific about new capabilities, modifications, or removals. Mark breaking changes with **BREAKING**.
- **Capabilities**: Identify which specs will be created or modified:
  - **New Capabilities**: List capabilities being introduced. Each becomes a new `specs/<capability-path>/spec.md`. Name each capability for a durable system behavior (for example, `user-auth`), not the work in this change (for example, `add-login-endpoint`). Choose a cohesive boundary that can own related requirements as the system evolves; avoid broad catch-all capabilities. Use kebab-case for path segments you introduce (e.g., `user-auth` or `identity/user-auth`) and follow the project's existing spec organization.
  - **Modified Capabilities**: List existing capabilities whose REQUIREMENTS are changing. Only include if spec-level behavior changes (not just implementation details). Each needs a delta spec file. Use the exact existing path under `<root>/specs/`. Leave empty if no requirement changes.
- **Impact**: Affected code, APIs, dependencies, or systems.

IMPORTANT: The Capabilities section is critical. It creates the contract between
proposal and specs phases. Research existing specs before filling this in:
use the capability keys in the generation context's `baseline` as the inventory.
The active change list is not the inventory of what the project already covers.
Read each relevant baseline document in full, including scenarios. Reuse an
existing capability's exact path instead of introducing a near-duplicate name.
Each capability listed here will need a corresponding spec file.

Every change in this fixed pipeline must declare at least one new or modified
capability. If no spec-level behavior changes (pure refactor, tooling, docs),
explain that this pipeline is not applicable. Do not invent a requirement just
to satisfy validation. There is no opt-out marker in openspec-min.

Keep it concise (1-2 pages). Focus on the "why" not the "how" -
implementation details belong in technical-design.md.

This is the foundation - specs, design, and tasks all build on this.

---

Create specification files that define WHAT the system should do.

A spec is a behavior contract, not an implementation plan.

Good spec content:
- Observable behavior users or downstream systems rely on
- Inputs, outputs, and error conditions
- External constraints (security, privacy, reliability, compatibility)
- Scenarios that can be tested or explicitly validated

Avoid in specs:
- Internal class/function names
- Library or framework choices
- Step-by-step implementation details
- Detailed execution plans (those belong in technical-design.md or tasks.md)

Quick test: if the implementation can change without changing externally
visible behavior, it likely does not belong in the spec.

Create one spec file per capability listed in the proposal's Capabilities section.
`<capability-path>` is the spec directory relative to `specs/` (for example,
`user-auth` or `identity/user-auth`). Preserve the full path:
- New capabilities: use the exact path from the proposal at `specs/<capability-path>/spec.md`. Any path segment newly introduced in the proposal must be kebab-case. Follow the project's existing organization; do not add a new domain level when the project uses a flat layout.
- Modified capabilities: use the exact existing capability key in `baseline` when creating the delta at `specs/<capability-path>/spec.md`. A mistyped or invented path targets a capability that does not exist rather than the one you meant. Do not move or rename the capability.

There must be at least one spec file. If the proposal lists no capabilities,
revisit the proposal first; do not fabricate behavior to force it into this pipeline.

Delta operations (use ## headers):
- **ADDED Requirements**: New capabilities
- **MODIFIED Requirements**: Changed behavior - MUST include full updated content
- **REMOVED Requirements**: Deprecated features - MUST include **Reason** and **Migration**
- **RENAMED Requirements**: Name changes only - use FROM:/TO: format

Format requirements:
- Each requirement: `### Requirement: <name>` followed by description
- Use SHALL/MUST for normative requirements (avoid should/may)
- Each scenario: `#### Scenario: <name>` with WHEN/THEN format
- **CRITICAL**: Scenarios MUST use exactly 4 hashtags (`####`). Using 3 hashtags or bullets does not produce a valid scenario.
- Every ADDED or MODIFIED requirement MUST have at least one scenario. REMOVED uses Reason and Migration; a rename-only entry keeps its baseline scenarios.
- Keep each requirement's description (the text between `### Requirement:` and its first scenario) to 500 characters or fewer. This is a retained authoring rule, not a length check currently enforced by runSpecVerifyGate; report violations during document review. When writing a new requirement, state one behavior per requirement: move examples and edge cases into scenarios, and split a requirement that covers several behaviors into separate `### Requirement:` blocks, each with its own scenarios. Under MODIFIED, keep the existing requirement block whole; never split, trim or rewrite existing text just to meet the length. Split an existing long requirement only when the user asks for it, in a change made for that purpose: under MODIFIED, keep its header and every scenario and cut its description down to one behavior without changing its meaning, then add each behavior you removed as its own ADDED requirement with its own scenarios.

New capabilities only: the delta spec's first section is `## Purpose` -
one or two sentences (50+ characters) describing what the capability is for.
Baseline promotion copies it into the main spec it creates. A missing Purpose
is blocked by the document gate; do not leave a placeholder. Do NOT add
`## Purpose` to a delta for an existing capability - that spec already has one
and the delta's is ignored. An existing Purpose correction needs a separately
scoped baseline maintenance action by the caller; this generation callback
must not mutate baseline documents. Such an edit invalidates existing reviews.

MODIFIED requirements workflow:
1. Locate the existing requirement in the full `baseline[capabilityPath]` document (stored at `<root>/specs/<capability-path>/spec.md`)
2. Copy the ENTIRE requirement block (from `### Requirement:` through all scenarios)
3. Paste under `## MODIFIED Requirements` and edit to reflect new behavior
4. Ensure header text matches exactly (whitespace-insensitive)

Common pitfall: Using MODIFIED with partial content loses detail at archive time.
If adding new concerns without changing existing behavior, use ADDED instead.

Example (a new capability, so its first section is `## Purpose`):
```
# Spec Delta

## Purpose

Lets users take their data out of the product in a portable format.

## ADDED Requirements

### Requirement: User can export data
The system SHALL allow users to export their data in CSV format.

#### Scenario: Successful export
- **WHEN** user clicks "Export" button
- **THEN** system downloads a CSV file with all user data

## REMOVED Requirements

### Requirement: Legacy export
**Reason**: Replaced by new export system
**Migration**: Use new export endpoint at /api/v2/export
```

Specs should be testable - each scenario is a potential test case.

For RENAMED Requirements, use complete FROM/TO pairs, for example:
```
## RENAMED Requirements
- FROM: `### Requirement: Old requirement name`
- TO: `### Requirement: New requirement name`
```
A rename alone changes the name, not behavior. If its behavior changes as well,
put the full changed requirement under MODIFIED using the TO name. Removing
the last requirement of a capability is unsupported in this engine; report
that limitation instead of fabricating a replacement requirement.

The example above illustrates delta syntax. In a genuinely new capability,
there is no old requirement to remove: include REMOVED only when baseline
history supports that operation, rather than copying the example blindly.
