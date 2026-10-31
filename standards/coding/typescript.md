# TypeScript

- Follow the project's TypeScript version and compiler options.
- Prefer explicit domain types at public boundaries and inference for straightforward local expressions.
- Avoid `any`; use `unknown` and narrow values when input is not trusted.
- Validate data from external boundaries at runtime when correctness depends on its shape.
- Do not use assertions to hide uncertainty; explain unavoidable assertions at a boundary.
