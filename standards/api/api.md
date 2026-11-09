# API design specification

Use this specification for HTTP APIs and other public contracts between modules, services, or UI components. Treat it as advisory unless the target project adopts it. First inspect the existing API style, security model, and published contract; compatibility and product requirements govern.

## Contract-first design

- Identify consumers, use cases, ownership, and compatibility requirements before choosing a shape.
- Define inputs, outputs, invariants, failure modes, ordering, authorization rules, and relevant limits before implementation. A contract includes observable behavior, not just types.
- Design HTTP endpoints around resources and domain actions; use methods and status codes according to their semantics.
- Keep request, response, and domain models separate when they have different ownership or lifecycle. Do not expose persistence models by default.
- Make interfaces predictable and difficult to misuse. Keep the public surface small and hide implementation choices consumers do not need.
- For component props and module interfaces, prefer explicit variants such as discriminated unions when states have different valid fields; avoid ambiguous combinations of optional flags.
- Keep naming, error shapes, and success conventions consistent within the project. Follow established conventions before introducing new ones.

## Validation and error behavior

- Validate user input, configuration, webhook payloads, and third-party responses where they enter the system.
- Validate every input server-side. Bound payload size, collection size, string length, and computationally expensive filters.
- After successful boundary validation, use typed internal values instead of repeatedly revalidating the same data in every helper.
- Reject invalid or unsupported values with actionable, consistent errors. Do not expose internal stack traces, persistence details, secrets, or fields the caller is not authorized to see.
- Use a consistent, machine-readable error model. Prefer the project's existing convention; for a new HTTP API, consider RFC 9457 Problem Details.

## Security and authorization

- Enforce authentication and object-level authorization on every protected request; possession of an identifier is not authorization.
- Validate authorization for the requested action and each referenced object, including nested resources, bulk operations, and exported or derived data.
- Allowlist writable fields to prevent mass assignment and property-level authorization errors.
- Apply resource limits, pagination caps, timeouts, and rate controls appropriate to the operation and abuse impact.
- Validate webhook authenticity, timestamp and replay constraints, and event idempotency before processing.
- Restrict outbound requests and redirects to reduce SSRF risk; validate resolved destinations and block private or metadata ranges where applicable.
- Use TLS, secure session and token handling, CORS allowlists, and safe error messages according to the deployment context.
- Test anonymous, wrong-tenant, wrong-role, expired-credential, replay, oversized-input, and throttled requests.

## Compatibility and evolution

- Treat observable behavior as a potential dependency: response shape, status, error codes, ordering, defaults, and timing can become part of the effective contract.
- Prefer additive, optional extensions when they preserve existing semantics. Do not silently change field meaning or type, remove fields, or narrow accepted inputs.
- Define deprecation and migration steps before removing a public capability. Keep parallel versions only when there is a demonstrated compatibility need and an explicit support plan.
- Introduce versioning or deprecation only through that documented compatibility policy; do not add URL versioning mechanically to every service.
- Make retry and idempotency behavior explicit for operations likely to be retried, including duplicate handling where applicable.

## Collections, operations, and observability

- Paginate collection responses. Use cursor pagination for large or frequently changing collections when stable continuation matters; use offset pagination when arbitrary page navigation and small datasets justify it.
- Check list limits, pagination caps, and response size for collection interfaces.
- Make transaction boundaries and partial-failure behavior visible where an API operation spans multiple resources.
- Add request correlation, latency, outcome, and safe audit signals without logging secrets or unnecessary personal data.

## Make the contract verifiable

- Document the contract in the project's chosen format, such as OpenAPI, and validate generated examples against it.
- Keep schemas, types, examples, and API documentation alongside implementation and update them together.
- Use contract tests at the public seam. Test representative valid input, malformed input, authorization failures, size limits, and compatibility-sensitive behavior.
- Verify security cases from the section above and record which controls were tested versus reviewed manually.

## Review prompts

- Can a consumer understand how to call this without reading its implementation?
- Does the contract expose any private detail, persistence shape, or unauthorized field?
- Are error, validation, authorization, replay, rate-limit, and retry semantics explicit?
- Can the interface be reduced or made harder to misuse?
- Would changing any observable behavior break an existing consumer?

References: [HTTP Semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [Problem Details, RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [OpenAPI Specification](https://spec.openapis.org/oas/latest.html), [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x00-header/).

Source note: this specification synthesizes InStar's HTTP API, contract, compatibility, and security guidance with the contract-first guidance from [AAS `api-and-interface-design`](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/api-and-interface-design/SKILL.md), which credits [Addy Osmani's MIT-licensed source skill](https://github.com/addyosmani/agent-skills/tree/main/skills/api-and-interface-design). It is an adapted summary, not a copy of the upstream Skill.
