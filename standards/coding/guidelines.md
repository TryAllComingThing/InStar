# Language-agnostic coding guidelines

Use these guidelines with the matching language pack. Follow the target project's established conventions before applying a general preference.

## Naming

- Use names that reflect domain behavior and match the vocabulary already used by the project.
- Use predicate names for booleans, such as `isOpen` or `hasError`.
- Avoid unexplained abbreviations. Do not rename public APIs solely to match this recommendation.

## Imports

- Follow the project's configured aliases and import formatting.
- Prefer public module entry points over another module's private implementation files.
- Avoid imports from build output, generated output, test-only modules, and circular dependencies in production code.
- Keep side-effect imports explicit and review their initialization order.

## Error handling

- Handle errors at a boundary that can recover or add useful context.
- Preserve the original cause when translating an error.
- Do not swallow errors in empty catch blocks; explain intentional fallback behavior.
- Do not expose credentials, secrets, or sensitive user data in logs or user-facing messages.
- Make user-facing errors actionable without leaking implementation details.
