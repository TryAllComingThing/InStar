# Components and interaction

- Reuse an existing component when its behavior and semantics match the requirement; avoid creating near-duplicates.
- Keep each component's responsibility clear. Separate reusable presentation from product-specific orchestration where the codebase already follows that pattern.
- Define visible states for loading, empty, error, disabled, selected, and success cases when they apply.
- Give actions clear labels and feedback. Destructive or consequential actions should communicate their effect and provide the project's expected confirmation or recovery path.
- Preserve native semantics and keyboard behavior. Use the existing component library rather than recreating controls from generic elements when appropriate.
- Avoid adding abstraction solely for hypothetical reuse; base it on actual repeated use or a stable product concept.
