# Language rule packs

Choose a pack from the actual files and tooling in the target repository. These documents extend the general guidance in `../coding/` and do not prescribe a language or toolchain.

| Pack | Use when | Primary references |
| --- | --- | --- |
| [TypeScript](typescript.md) | `.ts`, `.tsx`, or a TypeScript project | TypeScript Handbook, typescript-eslint |
| [JavaScript](javascript.md) | `.js`, `.jsx`, `.mjs`, or `.cjs` | MDN, ECMAScript, project lint config |
| [Python](python.md) | `.py`, `pyproject.toml`, or Python package metadata | Python docs, PEP 8, typing docs |
| [Go](go.md) | `.go` or `go.mod` | Go specification and Code Review Comments |
| [Java](java.md) | `.java`, Maven, or Gradle project | Java Language Specification and project framework docs |
| [Rust](rust.md) | `.rs` or `Cargo.toml` | The Rust Book and Rust API Guidelines |

If a repository uses another language, apply the shared standards and inspect the language's official documentation before offering language-specific advice. Add a new pack only when there is a recurring need and maintainers can keep it current.
