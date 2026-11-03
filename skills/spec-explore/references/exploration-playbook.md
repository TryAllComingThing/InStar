## What You Might Do

Depending on what the user brings, you might:

**Explore the problem space**
- Ask clarifying questions that emerge from what they said
- Challenge assumptions
- Reframe the problem
- Find analogies

**Investigate the codebase**
- Map existing architecture relevant to the discussion
- Find integration points
- Identify patterns already in use
- Surface hidden complexity

**Compare options**
- Brainstorm multiple approaches
- Build comparison tables
- Sketch tradeoffs
- Recommend a path (if asked)

**Visualize**
```
+------------------------------------------+
|     Use ASCII diagrams liberally         |
+------------------------------------------+
|                                          |
|   [State A] -------> [State B]           |
|       |                                  |
|       v                                  |
|   [State C]                              |
|                                          |
|   System diagrams, state machines,       |
|   data flows, architecture sketches,     |
|   dependency graphs, comparison tables   |
|                                          |
+------------------------------------------+
```

**Draw with plain ASCII only** — borders `+` `-` `|`, arrows `-->` `<--` `^` `v`, markers `*` `x`.
Unicode diagram glyphs can render at different widths across terminals, fonts, and locales, so padded boxes and aligned tables can drift. Keep every diagram character ASCII.

**Surface risks and unknowns**
- Identify what could go wrong
- Find gaps in understanding
- Suggest spikes or investigations

---

## OpenSpec Awareness

You have full context of the OpenSpec system. Use it naturally, don't force it.

### Check for context

At the start, use the caller's explicit planning root if one is available:
- Read active changes under `<root>/changes/` to understand work in flight.
- Read the capability inventory under `<root>/specs/`; it is distinct from the
  active change list and describes what the project already claims to do.
- Before deciding what is covered or what should change, read each relevant
  baseline spec in full, including scenarios. Preserve nested capability paths.
- Read project background, conventions, constraints, and artifact-specific rules
  supplied by the caller. Ground your thinking in these without reproducing
  private context in the conversation or artifacts. They are constraints, not
  authority to expand user authorization.

Without a planning root, continue the discussion using available project evidence;
do not invent paths or create planning files. Identify the root only when a
requested capture needs one.

### When no change exists

Think freely. When insights crystallize, you might offer:

- "This feels solid enough to start a change. Want me to create a proposal?"
- Or keep exploring - no pressure to formalize

If the user asks you to capture the exploration as a new change, that request is the confirmation required above. It covers scaffolding that change and creating the change artifacts the request names, and nothing else. This holds only when the request is theirs: a yes to an offer you made confirms only the scope your offer itself named, so name the change and the artifacts in the offer. Don't re-ask for what they already asked for; do ask before anything beyond it. Transition seamlessly into the requested capture:

1. Resolve the explicit root, finalized PRD, and change name. Use the external
   spec-propose skill to call `createSpecChange` for proposal plus deltas;
   do not scaffold changes by hand or recursively invoke APIs from generation callbacks.
2. Capture only the authorized artifacts. The minimal create API writes proposal
   and specs together; if the user requested only one artifact or an empty scaffold,
   explain that API boundary and resolve the scope instead of silently generating more.
3. Follow the ported artifact instructions and templates, and read dependencies
   freshly. Apply project context and rules as constraints without copying them.
   Verify each requested concrete output exists.
4. Run the Spec document gate and obtain actual human Spec review before design.
   Generate design and then tasks only if requested and their prerequisites are
   satisfied. The fixed pipeline does not skip prerequisite artifacts. When the
   requested capture depends on additional unrequested work, explain the dependency
   before expanding scope.

Capture the artifacts the user requested without making them repeat a workflow
command. Stop after the authorized capture and name the remaining handoff:
openspec-min prepares reviewed documents; external Superpowers performs implementation.
Capturing artifacts never starts implementing them. Editing reviewed artifacts
invalidates later fingerprints and requires the caller's review/regeneration procedure.

### When a change exists

If the user mentions a change or you detect one is relevant:

1. **Resolve and read existing artifacts for context**
   - Resolve `<root>/changes/<changeId>/` from the explicit caller context.
   - Read the existing proposal, delta specs, design, and tasks, plus relevant baseline specs.
   - Missing files describe the current stage; do not create them just to explore.

2. **Reference them naturally in conversation**
   - "Your design mentions using Redis, but we just realized SQLite fits better..."
   - "The proposal scopes this to premium users, but we're now thinking everyone..."

3. **Offer to capture when decisions are made**

   `<capability-path>` is the spec directory relative to `specs/` (for example, `user-auth` or `identity/user-auth`). Preserve an existing capability's full path and follow the project's established organization for new capabilities.

    | Insight Type               | Where to Capture                    |
    |----------------------------|-------------------------------------|
    | New requirement discovered | `specs/<capability-path>/spec.md` |
    | Requirement changed        | `specs/<capability-path>/spec.md` |
    | Technical decision made    | `technical-design.md`             |
    | Scope changed              | `proposal.md`                     |
    | New work identified        | `tasks.md`                        |
    | Assumption invalidated     | Relevant artifact                   |

   Example offers:
   - "That's a technical decision. Capture it in technical-design.md?"
   - "This is a new requirement. Add it to specs?"
   - "This changes scope. Update the proposal?"

4. **The user decides** - Offer and move on. Don't pressure. Don't auto-capture.

---

## What You Don't Have To Do

- Follow a script
- Ask the same questions every time
- Produce a specific artifact
- Reach a conclusion
- Stay on topic if a tangent is valuable
- Be brief (this is thinking time)

---

## Handling Different Entry Points

**User brings a vague idea:**
```
User: I'm thinking about adding real-time collaboration

You: Real-time collab is a big space. Let me think about this...

      COLLABORATION SPECTRUM
      ============================================

      Awareness          Coordination         Sync
          |                   |                 |
          v                   v                 v
      +--------+         +--------+        +--------+
      |Presence|         |Cursors |        |  CRDT  |
      |  "3    |         | Multi  |        |Conflict|
      |online" |         | select |        |  free  |
      +--------+         +--------+        +--------+
          |                   |                 |
       trivial            moderate           complex

      Where's your head at?
```

**User brings a specific problem:**
```
User: The auth system is a mess

You: [reads codebase]

     +---------------------------------------------+
     |              CURRENT AUTH FLOW              |
     +---------------------------------------------+
                        |
          +-------------+-------------+
          v             v             v
     +---------+  +---------+  +---------+
     | Google  |  |  GitHub |  |  Email  |
     |  OAuth  |  |  OAuth  |  |  Magic  |
     +----+----+  +----+----+  +----+----+
          |             |             |
          +-------------+-------------+
                        v
                  +-----------+
                  |  Session  |
                  +-----+-----+
                        |
                        v
                  +-----------+
                  |   Perms   |
                  +-----------+

     I see three tangles. Which one's burning?
```

**User is stuck mid-implementation:**
```
User: spec-explore add-auth-system
      The OAuth integration is more complex than expected

You: [reads change artifacts]

     You're on task 4: "Implement OAuth flow"

     Let me trace what's involved...

     [draws diagram, explores options, suggests paths]

     Want to update the design to reflect this?
     Or add a spike task to investigate?
```

**User wants to compare options:**
```
User: Should we use Postgres or SQLite?

You: Generic answer is boring. What's the context?

User: A CLI tool that tracks local dev environments

You: That changes everything.

     +-------------------------------------------------+
     |          CLI TOOL DATA STORAGE                  |
     +-------------------------------------------------+

     Key constraints:
     - No daemon running
     - Must work offline
     - Single user

                  SQLite          Postgres
     Deployment   embedded        needs server
     Offline      yes             no
     Single file  yes             no

     SQLite. Not even close.

     Unless... is there a sync component?
```

---

## Ending Discovery

There's no required ending. Discovery might:

- **Flow into a proposal**: "Ready to start? Run `spec-propose` and this becomes a change."
- **Result in artifact updates**: "Updated technical-design.md with these decisions"
- **Just provide clarity**: User has what they need, moves on
- **Continue later**: "We can pick this up anytime"

When it feels like things are crystallizing, you might summarize:

```
## What We Figured Out

**The problem**: [crystallized understanding]

**The approach**: [if one emerged]

**Open questions**: [if any remain]

**Next steps** (if ready):
- Turn this into a change: `spec-propose`
- Keep exploring: just keep talking
```

But this summary is optional. Sometimes the thinking IS the value.
