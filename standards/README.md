# InStar engineering references

This directory contains plugin-side advisory references for Skills. It is not copied into target repositories and does not automatically become project policy.

## Structure

- `architecture/`: the default [architecture baseline](architecture/overview.md) and an optional [Feature-Sliced Design profile](architecture/fsd-layers.md).
- `api/`: the [API design specification](api/api.md), covering contract shape, security, compatibility, and verification.
- `coding/`: language-agnostic [naming, import, and error-handling guidance](coding/guidelines.md).
- `common/`: cross-cutting [security](common/security.md) and [testing](common/testing.md) baselines.
- `database/`: the [database design specification](database/schema.md), [query specification](database/query.md), [migrations](database/MIGRATIONS.md), and [PostgreSQL guidance](database/postgresql.md).
- `languages/`: language-specific rule packs, including [CSS](languages/css.md), selected only when the repository uses that language. See the [language index](languages/README.md).

## Controller-selected references

For a non-empty project, the workflow controller selects references from the project tree and stable change-owned source text only: the PRD and current proposal/delta specs. It does not scan generation instructions, plugin reference text, the later technical design, or unrelated baseline specs for keywords. An empty project gets no automatic reference set.

These files remain advisory and are not copied into target repositories.

| Trigger | References |
| --- | --- |
| Every non-empty project | [`standards/README.md`](README.md), [`standards/architecture/overview.md`](architecture/overview.md) |
| UI work in a frontend or fullstack project without project-owned design sources | [`DESIGN.md`](../design-guidance/DESIGN.md), [`visual-language.md`](../design-guidance/rules/visual-language.md), [`components-and-interaction.md`](../design-guidance/rules/components-and-interaction.md), [`layout-and-responsive.md`](../design-guidance/rules/layout-and-responsive.md), [`accessibility.md`](../design-guidance/rules/accessibility.md), [`tokens.md`](../design-guidance/rules/tokens.md), [`review-checklist.md`](../design-guidance/rules/review-checklist.md) |
| UI work in a frontend or fullstack project with project-owned design sources | [`accessibility.md`](../design-guidance/rules/accessibility.md), [`tokens.md`](../design-guidance/rules/tokens.md), [`review-checklist.md`](../design-guidance/rules/review-checklist.md) |
| TypeScript source or project tooling | [`languages/typescript.md`](languages/typescript.md) |
| JavaScript source or Node.js project | [`languages/javascript.md`](languages/javascript.md) |
| Python source or Python package metadata | [`languages/python.md`](languages/python.md) |
| Go source or `go.mod` | [`languages/go.md`](languages/go.md) |
| Java source, Maven, or Gradle | [`languages/java.md`](languages/java.md) |
| Rust source or `Cargo.toml` | [`languages/rust.md`](languages/rust.md) |
| `.vue` source or explicit Vue 3 signals | [`languages/vue3.md`](languages/vue3.md) |
| CSS, SCSS, Sass, or Less source | [`languages/css.md`](languages/css.md) |
| API, HTTP, endpoint, OpenAPI, Swagger, or webhook signals | [`api/api.md`](api/api.md) |
| Database, SQL, ORM, migration, or persistence signals | [`database/schema.md`](database/schema.md), [`database/query.md`](database/query.md), [`database/MIGRATIONS.md`](database/MIGRATIONS.md) |
| PostgreSQL signals | [`database/postgresql.md`](database/postgresql.md) |
| Authentication, authorization, credentials, permissions, sessions, tenancy, or security signals | [`common/security.md`](common/security.md) |
| Test paths, testing, coverage, or acceptance-test signals | [`common/testing.md`](common/testing.md) |

Selection uses path segments and whole words. For example, `capital`, `trust`, and `latest` do not select the API, Rust, or testing packs.

## Load-on-demand references

The following references are not auto-injected. Read them when the changed code or approved design makes them relevant:

- [`architecture/fsd-layers.md`](architecture/fsd-layers.md) only when the project explicitly adopts Feature-Sliced Design.
- [`design-guidance/rules/theming.md`](../design-guidance/rules/theming.md) only when the project explicitly supports multiple themes, tenant branding, or user-selectable appearance.
- [`coding/guidelines.md`](coding/guidelines.md) for language-agnostic naming, imports, and error handling.
- [`languages/README.md`](languages/README.md) when identifying the applicable language pack or an unsupported language.

## Rule selection and precedence

Shared guidance supplies a baseline; a matching language or domain guide adds details and may override general advice where that language or domain requires it. Select only the files relevant to the changed code. Do not load every language guide for every task.

The user's request and the target project's applicable `AGENTS.md`, configured or discovered context/architecture/design documents, `standards/`, and existing code patterns take precedence. InStar references fill gaps and remain advisory. A deviation is not a BLOCK unless the target project adopted that rule, the user explicitly required it, or a configured automated check enforces it.

Skills should identify technologies from manifests, source files, API contracts, migrations, and existing project documentation before selecting a pack. If the stack is unclear, follow repository patterns and state the uncertainty rather than guessing.

For UI-specific design guidance, use [`design-guidance/DESIGN.md`](../design-guidance/DESIGN.md).
