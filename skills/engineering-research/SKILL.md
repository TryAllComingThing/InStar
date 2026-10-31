---
name: engineering-research
description: Research an unfamiliar library, API, integration, framework capability, or proposed dependency before implementation. Use when existing project patterns or versioned documentation do not answer the engineering question.
---

# Engineering research

Find the smallest reliable evidence needed to make an implementation decision. Research supports the user's task; it does not expand scope or authorize dependency installation, external writes, or service access.

## Workflow

1. Clarify the concrete question and constraints from the request, approved Spec, project rules, and current technical design.
2. Search the repository first: manifests and lockfiles, existing call sites, adapters, tests, architecture docs, and prior decisions. Prefer extending a proven local pattern when it still fits.
3. Identify the exact runtime/library version from the lockfile or project configuration. For version-sensitive behavior, consult official documentation and changelogs for that version. Use authoritative standards for protocols and security requirements.
4. Compare the practical choices: reuse existing code, extend an installed dependency, add a dependency, or implement locally. Consider compatibility, maintenance, security, operational burden, license, and migration cost.
5. Validate claims with a minimal read-only example or existing tests when useful. Do not install packages or run commands that fetch code merely to explore an option.
6. Return a concise recommendation with sources, version assumptions, tradeoffs, and unresolved risks. If no reliable source is available, say what could not be verified.

## Boundaries

- Do not cargo-cult snippets from another repository. Adapt the underlying idea to the target project's conventions and threat model.
- Do not claim that a package, API, or version is current without checking a current source when that matters.
- Separate a standards requirement from a framework recommendation and from a project-specific preference.
- Ask before expanding the task to install a dependency, change credentials, call a live service, or perform an external mutation.
- Hand implementation back to `frontend-implement` after the decision is documented; do not bypass Spec approval or implementation authorization.

## Output

State the decision first, then the evidence and tradeoffs. Link exact source documents and name the version or date inspected where relevant. Include a “reuse / extend / add / build” recommendation so the implementation choice is explicit.
