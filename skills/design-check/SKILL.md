---
name: design-check
description: Extract change-specific, implementable UI style constraints from a project's design contract, adopted design tokens, and approved high-fidelity references. Use before implementing or reviewing a UI change.
---

# Design Check

## Trigger

Use for a UI change when the user requests design analysis, before producing a UI technical design, or when implementation needs a clear style contract. Skip for changes with no visual or interaction impact.

## Inputs

- Target project root and change ID, when the change is tracked.
- Approved PRD/Spec and relevant `technical-design.md` context.
- Project's configured or discovered canonical design document. Use `.instar-quality.json` `context.design` when set; otherwise follow the context discovery rules in [QUALITY.md](../../docs/QUALITY.md).
- Project Design Token sources. Use `.instar-quality.json` `context.tokens` when supplied, or locate the existing token definitions and usage relevant to the changed UI. The token format and naming are project-owned.
- Approved high-fidelity description: supplied Figma/export notes, screenshot or visual reference, annotated wireframe, or sufficiently detailed written interaction and appearance requirements.
- Existing components and styles in the affected area.

If a source is missing, state that explicitly and continue only from available evidence. Never invent brand, token values, component behavior, or reference details.

## Workflow

1. Read the applicable project `AGENTS.md`, design contract, relevant architecture constraints, and the high-fidelity description. Resolve conflicts by following user requirements first, then project-owned approved rules; report unresolved conflicts.
2. Inspect relevant token definitions and nearby component usage. Confirm each proposed token name exists and matches the intended semantic role. If no token fits, mark the value unresolved; do not add or edit tokens.
3. Compare the reference with the current product patterns. Extract only constraints that matter to this change: layout, hierarchy, typography, spacing, color roles, component states, responsive behavior, accessibility, and interaction feedback.
4. Use only the target project's own design contract, framework theme configuration, component library, token definitions, existing UI patterns, and approved reference. Do not introduce a plugin-provided design system, theme, token naming scheme, or CSS architecture.
5. Return a change-specific `Style Constraints` section for insertion into `planning/changes/<changeId>/technical-design.md`. Keep project-wide `DESIGN.md` and token definitions unchanged; when the user asks for a complete project-level visual design specification, hand off to [extract-design-md](../extract-design-md/SKILL.md).

## Output contract

Return:

- Sources read, with project paths and any missing sources.
- A concise style-constraints section containing visual hierarchy, concrete layout/typography/state behavior, responsive/accessibility constraints, and token mappings supported by actual project sources.
- A token mapping table: UI element or role, existing token name, source path, and intended use. If tokens are absent or not adopted, state that no mapping is required and cite the observed project convention.
- Open decisions and assumptions, clearly separated from approved constraints.
- Reference comparison limits: state whether the source was a screenshot/Figma description/text and whether rendered browser comparison was performed.

The output is an input to the tracked technical design; it is not approval to implement. Do not write directly to project `DESIGN.md`, token files, or review-approved planning artifacts.

## Allowed tools

Read project instructions, source, styles, token definitions, planning artifacts, and user-provided design references; use browser/visual inspection only when available and authorized. Do not install dependencies or contact external design APIs unless explicitly configured and authorized.

## Failure strategy and boundaries

- Missing design source or high-fidelity detail: produce an incomplete/low-confidence result and list the missing decisions; do not fabricate specifics.
- Conflicting project tokens or style rules: cite both sources and leave the mapping unresolved.
- No matching token: report a decision needed; do not create a token or hardcode a value as if approved.
- This Skill coordinates design analysis; it does not implement CSS, define lint rules, run a hidden design scanner, or replace human visual approval.

## Audit

Record source paths, token paths and names actually verified, unresolved items, and visual evidence used. Distinguish project requirements from observed implementation evidence and unresolved design decisions.
