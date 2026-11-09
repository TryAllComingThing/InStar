# Design Token Review Guidance

Design tokens are project-owned inputs. This guide does not prescribe a token library, naming scheme, palette, spacing scale, or CSS architecture.

## Source discovery

Use the token source paths supplied for the project first. If none are configured, inspect the project's design-system documentation and existing CSS/SCSS/JSON/TypeScript sources for established token definitions and usage. Do not treat similarly named plugin files as project tokens.

## Constraint extraction

For each visual choice in the approved design, identify the closest existing project token and its semantic purpose. Prefer semantic aliases when the project defines them. Record the actual token name and source path; do not invent a token or claim a mapping that is not supported by the repository.

If a required visual value has no matching token, state that it is unresolved and ask the project owner whether to use an existing value, introduce a project token, or make a documented one-off exception. Do not edit token definitions during design review.

## Review

- Check that selected tokens exist and represent the intended role.
- Check that component styles use the project's adopted token layer rather than bypassing it with primitives or literal values when project rules prohibit that.
- Preserve documented exceptions and component-specific tokens.
- Treat token mismatch as blocking only when an explicit project rule or approved design decision requires it; otherwise report a warning or suggestion with evidence.
