# Architecture review principles

Use these principles when creating, reviewing, or restructuring modules. First inspect the target repository's actual structure and established architecture; this guide does not mandate a framework or layer diagram.

## Module and boundary design

- Give each module a coherent responsibility and a small, stable public interface. Keep implementation details private.
- Discover and respect the repository's package and directory boundaries. Avoid importing another module's private files or using a catch-all shared directory for unrelated code.
- Prefer a module that concentrates behavior behind a simple interface over a pass-through wrapper that adds another concept without removing complexity from its callers.
- Place seams where behavior genuinely varies or needs independent testing. Avoid speculative abstractions with only one known implementation unless a concrete testing or isolation need justifies the seam.
- Co-locate code that changes together. Before adding an abstraction, ask whether removing it would spread complexity into multiple callers or whether the abstraction merely forwards calls.
- Design for testability at the same interface consumers use: pass external dependencies in where appropriate, return values for pure decisions, and isolate side effects at edges.
- Use project vocabulary consistently. When domain terms or relationships are unclear, reconcile them with existing docs and code before encoding them into types or module names.

## Dependency direction

- Describe dependencies in terms of modules that actually exist in this project.
- Keep dependencies acyclic and use documented public module APIs. Record deliberate exceptions where the real architecture requires one.
- When two modules need to communicate, first inspect existing APIs and data flow. Propose a new shared abstraction only when more than one real consumer needs it and ownership is clear.
- Keep project constraints distinct from change-specific design decisions.
- Do not impose Feature-Sliced Design, layer names, package boundaries, or file paths unless project documentation adopts them.
- Record an architecture decision when the choice is hard to reverse, surprising to future maintainers, and made after a meaningful trade-off. Keep a glossary focused on domain language, not implementation notes.

## Review prompts

- What responsibility does this module own, and what does it deliberately not own?
- What must callers know to use the interface correctly, including errors and constraints?
- Is the proposed seam real, or is it an abstraction without a current variation point?
- Does this change improve locality, reduce caller knowledge, or make behavior easier to verify?
- Do the names match the domain language used elsewhere in the project?
- Is every dependency direction explicit, acyclic, and based on a module that exists?

## Optional profile

Use [`fsd-layers.md`](fsd-layers.md) only when the project explicitly adopts Feature-Sliced Design and records that decision.

## Source note

This adaptation draws on Matt Pocock's [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md) (deep modules, small interfaces, real seams, testability) and [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) (precise shared vocabulary, glossaries, and selective ADRs). It is rewritten for InStar's advisory standards and does not reproduce the upstream skill text.
