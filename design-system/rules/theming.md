# Theming

Use this guidance only when the product needs multiple themes, tenant branding, or user-selectable appearance.

- First inspect the project's existing styling and theme mechanism. Extend it instead of introducing a parallel system.
- Define which visual properties vary by theme and which remain stable; keep theme-specific values centralized in the project's chosen mechanism.
- Components should consume the project's established theme interface rather than branching on individual theme names throughout the UI.
- Ensure all supported themes provide readable text, visible controls, clear status, and consistent focus treatment.
- Persist a user preference only when the product requires persistence, and handle unavailable storage or server rendering safely.
- Add visual regression coverage for representative screens and states where the project has that infrastructure. Baselines must be generated and reviewed by maintainers.
- Do not add a theme engine or prescribe CSS architecture or a particular library as a default plugin requirement.
