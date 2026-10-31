# Module design principles

Use these principles when creating or restructuring modules. First inspect the target repository's actual structure and established architecture; this guide does not mandate a framework or layer diagram.

- Give each module a coherent responsibility and a small, stable public interface. Keep implementation details private.
- Prefer a module that concentrates behavior behind a simple interface over a pass-through wrapper that adds another concept without removing complexity from its callers.
- Place seams where behavior genuinely varies or needs independent testing. Avoid speculative abstractions with only one known implementation unless a concrete testing or isolation need justifies the seam.
- Keep dependencies acyclic and use documented public interfaces. Co-locate code that changes together; avoid unrelated catch-all shared modules.
- Design for testability at the same interface consumers use: pass external dependencies in where appropriate, return values for pure decisions, and isolate side effects at edges.
- Before adding an abstraction, ask whether removing it would make complexity spread into multiple callers or whether the abstraction merely forwards calls.
- Use project vocabulary consistently. When domain terms or relationships are unclear, reconcile them with existing docs and code before encoding them into types or module names.
- Record an architecture decision when the choice is hard to reverse, surprising to future maintainers, and made after a meaningful trade-off. Keep a glossary focused on domain language, not implementation notes.

## Review prompts

- What responsibility does this module own, and what does it deliberately not own?
- What must callers know to use the interface correctly, including errors and constraints?
- Is the proposed seam real, or is it an abstraction without a current variation point?
- Does this change improve locality, reduce caller knowledge, or make behavior easier to verify?
- Do the names match the domain language used elsewhere in the project?

## Source note

This adaptation draws on Matt Pocock's [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md) (deep modules, small interfaces, real seams, testability) and [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) (precise shared vocabulary, glossaries, and selective ADRs). It is rewritten for InStar's advisory standards and does not reproduce the upstream skill text.
