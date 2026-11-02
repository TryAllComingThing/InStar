# Development-facing deliverables

## Layout and routing

Default destination is `docs/project-baseline/`; respect an explicit destination.

```text
INDEX.md
rules.json                      # P1 summaries, scopes and adoption metadata
architecture.md
domain.md
api.md
database.md
coding.md
security-runtime.md
modules/<module>/<domain>.md     # only for independently useful module detail
evidence/<domain>.json           # source details, read only for verification
collection.md                   # coverage, conflicts, unknowns and checks run
```

Whole-project extraction produces six concise domain documents. A scoped request
produces only applicable documents and marks unassessed domains in INDEX. Never
replace project-wide coverage with a partial scan. Use NA only when absence is
established; otherwise mark unknown. Do not invent missing policies.

INDEX records extraction date/revision when actually known, scope and precedence.
Include a routing table: document link, applicable source paths, when to read,
coverage status and unresolved decisions. Aim for at most 100 lines. Do not repeat
rules or excerpts. Existing canonical policies remain authoritative; extraction
does not adopt proposals. Link audit detail rather than embedding it.

## Domain document contracts

| File | Content | Development decisions |
| --- | --- | --- |
| architecture.md | Module responsibilities, public entries, dependency direction, data ownership, extension paths, important decisions | Where to implement and which boundaries to preserve |
| domain.md | Vocabulary, states/transitions, invariants, money/time/null semantics | Spec behavior and consistent naming |
| api.md | Inputs/outputs, validation, errors, authorization, pagination, compatibility, idempotency; distinguish HTTP from local/module interfaces | Contract and consumer compatibility |
| database.md | Entities/relationships, constraints, transactions, concurrency, query boundaries, migration compatibility | Persistence and data safety |
| coding.md | Naming, imports, types, error propagation, side effects, resource cleanup, explanatory comments | Readability and implementation consistency |
| security-runtime.md | Trust boundaries, tenant isolation, secrets, timeouts, retries, cancellation, observability | Security controls and failure behavior |

Start each document with scope and coverage. Use concise entries with stable IDs:

```markdown
### ARCH-001 — Order public entry point
- Status: observed
- Applies to: src/orders/** and its callers
- Guidance: Existing callers use src/orders/index.ts; inspect that interface before adding dependencies.
- Design/development impact: Prefer the public entry for consistency; this observation alone is not a prohibition.
- Source: src/orders/index.ts:1-12; evidence/architecture.json#ARCH-001
- Verification: Dependency review; automated boundary check not configured.
```

Use ARCH/DOMAIN/API/DB/CODE/SEC prefixes and discovery status vocabulary. Distinguish
authoritative rules, observations and proposals; IDs do not confer approval.
Include concrete project symbols, locations, relevant checks and minimal examples.
Put conflicts and unknowns next to affected guidance, with detail in collection.md.
Link existing schemas/catalogs instead of copying them. Avoid generic essays.

Aim for 150–250 lines per domain as a context budget, not a software quality gate.
Split earlier when module detail can be consumed independently. Parent documents
keep shared guidance and route to module supplements by path. Do not duplicate
shared rules or silently truncate essential constraints to meet a budget.

## Evidence and audit

Each evidence/<domain>.json uses the discovery findings contract, contains that
domain only, and maps IDs to source positions, exact excerpts, counterexamples,
verification status and computed fingerprints when available. Load relevant entries
for verification or conflict resolution, not all evidence during ordinary coding.
Evidence JSON remains model-authored, not a validated registry or approval record.

collection.md records read/unread/excluded scope, conflicts, risks, unknowns and
actual checks run. It is not a mandatory design input. Test/delivery sources
support individual verification entries; do not generate extra manuals by default.
Route full UI documentation to extract-design-md.

## Consumer reading and refresh

| Stage | Read after INDEX |
| --- | --- |
| Spec | Relevant domain semantics, API compatibility and security constraints |
| Technical design | Relevant architecture, API, database and security/runtime guidance |
| Implementation | Coding plus affected modules and interface/data constraints |
| Review | Applicable IDs, current source and actual check/test evidence |

Read shared guidance then only affected module supplements. These are explicit
reading instructions: Without rules.json the controller does not load the directory, register IDs,
approve policies or enforce workflow gates. With rules.json, follow [P1 integration](baseline-registry.md); document bodies remain on demand.
Users may explicitly request reading INDEX now.

When sources change, recheck affected guidance and disclose unknown freshness.
Preserve IDs for unchanged concepts and record removals/renames. Preserve unrelated
scope and authored content. Refresh does not automatically adopt proposals.

## Delivery validation

Read back Markdown and parse evidence JSON. Check index links, ID-to-evidence
mapping, source excerpts, scope and status consistency. Confirm unrelated domains
can remain unloaded. Report coverage gaps and checks not run. Historical
report.md/findings.json remain audit samples; migrate only when requested.
