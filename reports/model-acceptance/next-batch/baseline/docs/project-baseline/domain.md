# domain

Scope: all six original files in this isolated project. Coverage: all read.

### DOMAIN-001
- Status: observed
- Applies to: src/orders/handler.mjs
- Guidance: The list always contains an empty items array. Missing or null limit defaults to 20 through nullish coalescing; other values use Number conversion. Money, time, order states and entity fields remain unknown. This is not evidence of a complete business model.
- Design/development impact: preserve authoritative contracts; observations are not automatic adoption.
- Source: src/orders/handler.mjs:1; [evidence](evidence/domain.json)
- Verification: source review and local test pass (1/1, default limit only). No HTTP or deployment verification.
