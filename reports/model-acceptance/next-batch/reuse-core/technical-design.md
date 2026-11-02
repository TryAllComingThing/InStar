# Order detail and amount reuse design

## Reuse Decisions
Search coverage: every file in src and test, public exports, imports, AGENTS.md and existing test. No detail reader, authorization layer, or export pipeline exists in that scope.

| Need | Candidates | Decision | Rationale and verification |
|---|---|---|---|
| Detail transport | CAP-NETWORK-REQUEST; CAP-ORDERS-LIST | reuse request; local-new order detail wrapper | Follow list's dependency direction via network/index.mjs. Do not call listOrders for detail. Proposed detail wrapper accepts identifier and injected transport. Confirm endpoint, identifier encoding, response schema and authorization contract before implementation; do not infer /orders/:id as an established API. Verify path/header, non-ok, transport rejection, JSON rejection and invalid identifiers once contract is agreed. |
| Detail amount | CAP-BILLING-AMOUNT; CAP-SETTLEMENT-AMOUNT | defer selection | Detail response unit is absent. Select dollar formatter only for confirmed dollars, cents formatter only for confirmed integer cents. Confirm allowed cross-domain consumption and rounding/invalid-input requirements; otherwise keep a local adapter with explicit unit conversion. Test boundary and fractional values after agreement. |
| Unify both formatAmount functions | Both amount capabilities | defer | Their numeric domains differ by 100. Same-name replacement causes monetary error. Shared display primitive would require explicit unit contract, owner and real consumers; no demonstrated benefit justifies extraction now. |
| Import headers directly | private network/internal/headers.mjs | reuse public request instead | AGENTS.md prohibits cross-boundary private imports. Index membership cannot grant access. No need to promote headers. |
| One-off export | No matching implementation in searched src | local-new | Keep export orchestration in owning business module when authorized. Multiple switches add unsupported combinations and lifecycle/ownership costs. Reconsider extraction only with concrete consumers, stable public contract and owner. |

No implementation or public API changes are authorized here. Future tasks should reference CAP-NETWORK-REQUEST and revisit amount selection after the data contract is known. Index is enabled:false, so this document is a discovery/design record, not a workflow approval or enforced reuse plan. Current source hashes and explicit coverage are in index.json.
