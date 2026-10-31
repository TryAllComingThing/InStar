# InStar UI design guidance

This file is a plugin-side reference for Skills and developers. It is not a project design contract and is never copied into a target repository. A project's own `DESIGN.md`, `AGENTS.md`, component library, product requirements, and accessibility requirements take precedence.

Use the relevant linked rules during exploration, technical design, implementation, and review. Treat them as advisory defaults. Record project-specific decisions in the target project's canonical design document, if it has one; record decisions for one change in `planning/changes/<id>/technical-design.md`. Do not create duplicate project design documents solely to adopt these references.

## Design principles

- Understand the existing product, visual language, component library, and interaction patterns before proposing changes.
- Preserve established patterns unless the requirement calls for a deliberate change.
- Separate product-specific choices—brand, tone, information density, and typography—from reusable interaction and accessibility practices.
- Prefer the simplest solution that fits the product and existing codebase. Do not introduce a theme engine, styling framework, or design-system architecture without a concrete need.
- Make design decisions explicit in the technical design when they affect component boundaries, user flows, responsive behavior, or accessibility.

## Applicable rules

- [Visual language](rules/visual-language.md): hierarchy, color use, typography, spacing, and consistency.
- [Components and interaction](rules/components-and-interaction.md): component responsibility, states, feedback, and reuse.
- [Layout and responsive behavior](rules/layout-and-responsive.md): page structure, content density, and viewport adaptation.
- [Accessibility](rules/accessibility.md): keyboard use, focus, semantics, contrast, and motion.
- [Theming](rules/theming.md): use only when a project needs multiple themes or branded variants.
- [Design Token review](rules/tokens.md): verify a project's existing token definitions and mappings without prescribing its token system.
- [Design review checklist](rules/review-checklist.md): evidence-based review questions for implementation and PRs.

Optional product-context references:

- [Enterprise](themes/enterprise.md)
- [Wholesale](themes/wholesale.md)
- [Dark theme](themes/dark.md)

## How to apply

1. Read the target project's applicable instructions and design documents first.
2. Select only the rules relevant to the changed UI; do not treat omitted sections as requirements.
3. Inspect nearby screens and components before proposing a new pattern.
4. Explain deviations from existing project patterns in the technical design or review report.
5. Do not report a violation of this guidance as a blocking issue unless the project has adopted the rule or the user explicitly requested it.

For high-fidelity UI work, use the `design-check` Skill to translate approved references and project-owned tokens into change-specific style constraints. The theme notes are examples for matching an explicitly identified product context, not ready-made project themes.
