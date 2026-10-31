# HTTP API security

Use when designing or reviewing an API, webhook, or service integration.

- Enforce authentication and object-level authorization on every protected request; possession of an identifier is not authorization.
- Validate authorization for the requested action and each referenced object, including nested resources and bulk operations.
- Allowlist writable fields to prevent mass assignment and property-level authorization errors.
- Apply resource limits, pagination caps, timeouts, and rate controls appropriate to the operation and abuse impact.
- Validate webhook authenticity, timestamp/replay constraints, and event idempotency before processing.
- Restrict outbound requests and redirects to reduce SSRF risk; validate resolved destinations and block private or metadata ranges where applicable.
- Use TLS, secure session/token handling, CORS allowlists, and safe error messages according to deployment context.
- Test anonymous, wrong-tenant, wrong-role, expired credential, replay, oversized input, and throttled requests.

References: [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x00-header/), [OWASP API Security Project](https://owasp.org/www-project-api-security/).
