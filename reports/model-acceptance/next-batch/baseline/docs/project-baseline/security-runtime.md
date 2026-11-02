# security-runtime

Scope: all six original files in this isolated project. Coverage: all read.

### SEC-001
- Status: observed
- Applies to: src/orders/handler.mjs
- Guidance: query.limit crosses an external-input boundary without contract validation. A null or undefined query causes property-access failure. No networking, secrets, tenancy, timeouts, retries, cancellation, logs or deployment configuration is visible; runtime guarantees are unknown. UI is NA in this isolated project because no views or components exist.
- Design/development impact: preserve authoritative contracts; observations are not automatic adoption.
- Source: src/orders/handler.mjs:1; [evidence](evidence/security-runtime.json)
- Verification: source review and local test pass (1/1, default limit only). No HTTP or deployment verification.
