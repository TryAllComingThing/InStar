# Secure development baseline

Apply security guidance according to the actual trust boundaries and threat model of the project.

- Validate and normalize untrusted input at system boundaries; perform authorization on the server for every protected operation.
- Use parameterized database queries. For dynamic identifiers or sort expressions that cannot be bound as values, select from an explicit allowlist.
- Encode output for its destination context and use framework protections rather than hand-written escaping.
- Keep secrets out of source, logs, error responses, client bundles, and test fixtures. Use the project's secret-management mechanism.
- Apply least privilege to application, database, CI, and service identities.
- Avoid leaking stack traces, SQL details, credentials, or personal data to clients or routine logs.
- Treat dependency updates, deserialization, file uploads, redirects, and outbound network calls as security-sensitive boundaries.
- Record the control and evidence when a security-sensitive behavior changes; use configured scanners and tests as supporting checks.

References: [OWASP Secure Code Review Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html), [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).
