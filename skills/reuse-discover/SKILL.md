---
name: reuse-discover
description: Discover existing functions, components and modules before implementation, compare reuse candidates, and maintain a shared capability index; use for 代码复用、公共能力治理 and reuse discovery.
---

# Code Reuse & Shared Capability Governance

Write JSON metadata as UTF-8 without BOM and parse it with the runtime before
delivery. Read back non-ASCII documentation; successful shell writes do not prove
characters survived encoding conversion.

Use before technical design or implementation, or when asked to inventory reusable
capabilities. Read [the protocol](references/protocol.md) for artifacts and requests.
Respect applicable AGENTS.md, module boundaries and project-owned test commands.

1. Translate the request into semantic needs. Inspect existing public exports,
   module documentation, manifests, imports, consumers and tests using read-only
   search. Read capability summaries, then only relevant source and module detail.
   Index membership never grants public API status.
2. Compare behavior, validation, errors, authorization, state, transactions and
   resource lifecycle. Record searched scope and rejected candidates. Text or name
   similarity is only a lead. Never claim no candidate exists beyond read scope.
3. Choose reuse, adapt, extend, local-new, extract-shared or defer with reasons and
   verification. Preserve business locality unless sharing has demonstrated value.
   Shared extraction needs ownership, real consumers and a stable contract; no
   mandatory consumer-count threshold or speculative framework abstractions.
4. If inventory generation was requested, create the small index and module guides
   in the protocol, preserving unrelated/authored content. Compute actual source
   hashes. Do not enable governance without an explicit project request. Do not
   change application code or make internal functions public during discovery.
5. Before implementation reread selected code and callers. After an authorized
   implementation, refresh only affected entries, preserving IDs; mark removals,
   deprecated entries and unresolved contract changes. Record actual tests run.

Spec exploration records existing business capabilities and gaps, not mandatory
internal function names. Technical design owns reuse decisions. Review checks both
duplicate implementation and over-abstraction. Project architecture and real checks
remain authoritative; do not enforce reuse ratios or create catch-all utils/shared
directories. Reuse may be inappropriate across different domain semantics.
