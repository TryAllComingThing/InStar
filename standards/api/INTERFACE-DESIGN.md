# API and interface design

Use this guide for HTTP APIs and other public contracts between modules, services, or UI components. It complements [`DESIGN.md`](DESIGN.md) (HTTP-specific conventions) and [`SECURITY.md`](SECURITY.md).

## Design the contract first

- Identify consumers, use cases, ownership, and compatibility requirements before choosing a shape.
- Define inputs, outputs, invariants, failure modes, ordering, and relevant limits before implementation. A contract includes observable behavior, not just types.
- Keep input models separate from output/domain models when they have different ownership or lifecycle. Do not expose persistence models by default.
- Make interfaces predictable and difficult to misuse. Keep the public surface small and hide implementation choices that consumers do not need.
- For component props and module interfaces, prefer explicit variants (such as discriminated unions) when states have different valid fields; avoid ambiguous combinations of optional flags.

## Validate at trust boundaries

- Validate user input, configuration, webhook payloads, and third-party responses where they enter the system.
- After successful boundary validation, use typed internal values instead of repeatedly revalidating the same data in every helper.
- Reject invalid or unsupported values with actionable, consistent errors. Do not expose internal stack traces or secrets.

## Preserve compatibility

- Treat observable behavior as a potential dependency: response shape, status, error codes, ordering, defaults, and timing can become part of the effective contract.
- Prefer additive, optional extensions when they preserve existing semantics. Do not silently change field meaning or type, remove fields, or narrow accepted inputs.
- Define deprecation and migration steps before removing a public capability. Keep parallel versions only when there is a demonstrated compatibility need and an explicit support plan.
- Make retry and idempotency behavior explicit for operations likely to be retried.

## Make the contract verifiable

- Keep schemas, types, examples, and API documentation alongside implementation and update them together.
- Use contract tests at the public seam. Test representative valid input, malformed input, authorization failures, and compatibility-sensitive behavior.
- Check list limits, pagination, and response size for collection interfaces; choose cursor or offset pagination based on stability and navigation needs.
- Keep naming and error formats consistent within the project. Follow established conventions before introducing new ones.

## Review prompts

- Can a consumer understand how to call this without reading its implementation?
- Does the contract expose any detail that should remain private?
- Are error, validation, authorization, and retry semantics explicit?
- Can the interface be reduced or made harder to misuse?
- Would changing any observable behavior break an existing consumer?

## Source note

These project-specific rules synthesize the contract-first and compatibility guidance in [AAS `api-and-interface-design`](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/api-and-interface-design/SKILL.md), which credits [Addy Osmani's MIT-licensed source skill](https://github.com/addyosmani/agent-skills/tree/main/skills/api-and-interface-design), alongside InStar's existing HTTP API and security guidance. This is an adapted summary, not a copy of the upstream Skill.
