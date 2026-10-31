Create the technical design document that explains HOW to implement the change. Save it as `technical-design.md`; any persistent design rules remain in the project's configured canonical document, if one exists.

This fixed pipeline always includes technical-design.md. The following original criteria
identify when it needs a fuller treatment; for a small change keep it concise:
- Cross-cutting change (multiple services/modules) or new architectural pattern
- New external dependency or significant data model changes
- Security, performance, or migration complexity
- Ambiguity that benefits from technical decisions before coding

Sections:
- **Context**: Only the current state and constraints needed to explain the approach. Reference the proposal for motivation instead of restating it (e.g., "See proposal.md - Why").
- **Goals / Non-Goals**: What this design achieves and explicitly excludes. Don't restate the proposal's scope - add only design-level boundaries.
- **Decisions**: Key technical choices with rationale (why X over Y?). Include alternatives considered for each decision.
- **Project Constraints**: Applicable `AGENTS.md` rules, available project architecture/design guidance, and existing project structure that constrain the implementation.
- **Architecture**: Affected modules, module/component boundaries, dependency direction, cross-module calls, data flow and state ownership. Cite applicable project rules; state when a topic does not apply. Do not impose an architecture profile absent from project guidance.
- **File Change Plan**: Planned paths and responsibilities. Follow `AGENTS.md`; reuse the current structure and explain any necessary deviation.
- **Risks / Trade-offs**: Known limitations, things that could go wrong. Format: [Risk] → Mitigation
- **Migration Plan**: Steps to deploy, rollback strategy (if applicable); retain this section and explain when no migration is needed
- **Open Questions**: Unknowns that can safely be answered later without
  changing the specs, the approach, or the task breakdown. Omit if none.

Open questions are for genuinely deferrable unknowns, not decisions you
skipped. If a question would change the specs, the chosen approach, or
the task breakdown, resolve it now - ask the user instead of guessing.

Use the controller's `projectArchitecture.guidance` and `projectArchitecture.projectTree`. Follow applicable `AGENTS.md` directory rules. If instructions conflict, state the conflict for resolution; do not silently choose. Do not propose paths outside the observed project layout without explaining the reason.

Focus on architecture and approach, not line-by-line implementation.
The proposal covers why and what; design covers how. Reference the
proposal for motivation and, once written, the specs for requirements -
if a section would only restate them, point to them instead.

Good design docs explain the "why" behind technical decisions.
