# InStar engineering references

This directory contains plugin-side reference material for Skills. It is not copied into target repositories and does not automatically become project policy.

## Structure

- `architecture/`: architecture and module-boundary guidance, including [`design-principles.md`](architecture/design-principles.md).
- `coding/`: language-agnostic coding, naming, import, and error-handling guidance.
- `css/`: styling and theming guidance.
- `testing/`: test design by level.
- `languages/`: language-specific rules, selected only when the repository uses that language.
- `api/`: HTTP API, interface contract, and security guidance; start with [`INTERFACE-DESIGN.md`](api/INTERFACE-DESIGN.md) for cross-boundary contracts.
- `database/`: database design, migrations, and PostgreSQL-specific notes.
- `common/`: cross-cutting security and testing rules.

## Rule selection and precedence

Use the ECC-inspired layered approach: shared guidance supplies a baseline; a matching language or domain guide adds details and may override general advice where that language or domain requires it. Select only the files relevant to the changed code. Do not load every language guide for every task.

The user's request and the target project's applicable `AGENTS.md`, configured or discovered context/architecture/design documents, `standards/`, and existing code patterns take precedence. InStar references fill gaps and remain advisory. A deviation is not a BLOCK unless the target project adopted that rule, the user explicitly required it, or a configured automated check enforces it.

Skills should identify technologies from manifests, source files, API contracts, migrations, and existing project documentation before selecting a pack. If the stack is unclear, follow repository patterns and state the uncertainty rather than guessing.

For UI-specific design guidance, use [`design-system/DESIGN.md`](../design-system/DESIGN.md).
