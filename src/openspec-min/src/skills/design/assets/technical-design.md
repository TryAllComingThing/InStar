# Technical Design

> This is the implementation plan for one change. Persistent project design rules remain in the project's configured canonical document, if one exists.

## Context

<!-- Current state and constraints that shape the approach. See proposal.md for motivation - don't restate it -->

## Goals / Non-Goals

**Goals:**
<!-- What this design aims to achieve -->

**Non-Goals:**
<!-- What is explicitly out of scope -->

## Requirement Traceability

<!-- Required when the PRD or Spec uses REQ-* / NFR-* IDs, or when a cross-module change needs explicit requirement-to-design mapping. Map every requirement ID once; use planned evidence at design time and replace it with actual verification evidence as tasks complete. -->

| Requirement | Design | Implementation | Verification |
| --- | --- | --- | --- |
| `<REQ-001 or NFR-001>` | Cite the design decision or architecture section | Cite planned modules/files or task IDs | Cite the planned check or actual evidence |

## Decisions

<!-- Key design decisions with rationale and alternatives considered -->

## Project Constraints

<!-- Applicable AGENTS.md rules, architecture guidance, and existing project structure used by this plan -->

## Compliance Matrix

<!-- Required when applicable mandatory project standards exist. Cite every rule ID with its source, status and design/implementation evidence. Use NA only with an applicability reason. -->

| Rule | Source | Status | Evidence |
| --- | --- | --- | --- |
| `<rule-id>` | `<project standard path>` | PASS / WARN / NA | Cite the design decision and implementation evidence |

## Architecture

### Affected Modules

<!-- Existing modules or capabilities affected by this change -->

### Boundaries and Dependencies

<!-- Module/component boundaries, dependency direction, and cross-module calls -->

### Data Flow and State

<!-- Relevant data flow and state ownership; say when not applicable -->

### Cross-Stack Contracts

<!-- For multi-component changes, describe client/API/service/data contracts, request and error semantics, and compatibility. Mark unrelated layers not applicable. -->

### Persistence and Security

<!-- For backend or data changes, cover invariants, authorization/tenant boundaries, migration/backfill safety, secrets and sensitive-data handling. Mark unrelated areas not applicable. -->

### Operations and Observability

<!-- For deployed behavior, specify timeouts, retries, logs/metrics/traces, health signals, alerts and resource limits. Mark local-only changes not applicable. -->

## File Change Plan

<!-- Planned project paths and their responsibilities; follow existing AGENTS.md directory rules -->

## Risks / Trade-offs

<!-- Known risks and trade-offs -->

## Migration Plan

<!-- Application/data migration order, old/new version compatibility, rollout and rollback/forward-fix plan, or explain why no migration is needed -->

## Reuse Decisions

<!-- Map needs to searched scope, candidate capability IDs, reuse/adapt/extend/local-new/extract-shared/defer decisions, reasons, boundaries, consumers and verification. -->
