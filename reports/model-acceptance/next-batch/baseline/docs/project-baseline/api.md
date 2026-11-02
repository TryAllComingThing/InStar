# api

Scope: all six original files in this isolated project. Coverage: all read.

### API-001
- Status: conflict
- Applies to: docs/api.md
- Guidance: The authoritative API document specifies GET /orders returning {items, limit}, an integer limit from 1 to 100, and INVALID_LIMIT for invalid values. The implementation only converts with Number: direct calls accept 0, 101, 1.5 and NaN. This is a contract conflict. HTTP routing, status codes, authorization and service integration remain unknown. Proposed follow-up: define error mapping, then implement validation and tests; no implementation is changed here.
- Design/development impact: preserve authoritative contracts; observations are not automatic adoption.
- Source: docs/api.md:2; src/orders/handler.mjs:1; [evidence](evidence/api.json)
- Verification: source review and local test pass (1/1, default limit only). No HTTP or deployment verification.
