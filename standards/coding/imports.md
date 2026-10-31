# Imports

- Follow the project's configured aliases and import formatting.
- Prefer public module entry points over another module's private implementation files.
- Avoid imports from build output, generated output, test-only modules, and circular dependencies in production code.
- Keep side-effect imports explicit and review their initialization order.
