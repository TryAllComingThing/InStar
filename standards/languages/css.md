# CSS

Apply this guide to stylesheet authoring and follow the project's existing styling approach, preprocessor, and naming convention.

- Prefer the project's established approach: CSS Modules, scoped styles, utility classes, BEM, or another documented system. Do not introduce a competing architecture for a small change.
- Keep selectors scoped to the component or feature that owns the responsibility; avoid broad global leakage and unexplained `!important`.
- If the project uses BEM, use `block__element--modifier` and keep each selector within its block's responsibility.
- Use the project's semantic design tokens or variables rather than duplicating theme-specific values in feature styles.
- Keep responsive behavior and supported interaction states in the same ownership boundary as the component styles.

This reference does not require BEM or any particular CSS architecture when the project documents and consistently uses another approach.
