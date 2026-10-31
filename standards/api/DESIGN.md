# HTTP API design

Use for new or changed HTTP APIs. First inspect the existing API style and any published contract. This is advisory guidance; compatibility and product requirements govern.

- Design endpoints around resources and domain actions; use HTTP methods and status codes according to their semantics.
- Define request and response schemas, constraints, authentication, authorization, error behavior, and compatibility expectations before implementation.
- Validate all input server-side. Bound payload size, list size, and computationally expensive filters.
- Return only fields the caller is authorized to see; avoid exposing internal models directly when that couples the public contract to storage.
- Use a consistent, machine-readable error model. Prefer the project's existing convention; for a new HTTP API, consider RFC 9457 Problem Details.
- Paginate collection responses. Use cursor pagination for large or frequently changing collections when stable continuation matters; use offset pagination when arbitrary page navigation and small datasets justify it.
- Make retry behavior explicit. For operations that clients may safely retry, define idempotency and duplicate handling.
- Document the contract in the project's chosen format, such as OpenAPI, and validate generated examples against it.
- Introduce versioning or deprecation only through a documented compatibility policy; do not add URL versioning mechanically to every service.
- Add request correlation, latency, outcome, and safe audit signals without logging secrets or unnecessary personal data.

References: [HTTP Semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [Problem Details, RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [OpenAPI Specification](https://spec.openapis.org/oas/latest.html).
