# Orders

CAP-ORDER-QUERY retains its identity after the implementation rename. Its public entry is `src/orders/index.mjs`, which reexports `searchOrders` from `src/orders/search.mjs`. The old `src/orders/query.mjs` is missing and is replaced in the index; it is not a supported compatibility entry.

`searchOrders(orders, q)` filters by `order.name.includes(q)`, returning a new array with matching object references in original order. Matching is case-sensitive substring matching; an empty string matches every string name. No explicit validation, authorization, tenant filtering, state changes, transactions or external resources exist. Invalid inputs can throw native errors. Callers must provide an authorized collection and compatible names; this is not a tenant-safe repository query.

The barrel is the public contract source and the implementation is explicitly tracked in `sourceHashes`; hashes cover actual file bytes (these sources are UTF-8). No separate contract specification, manifest, consumers or tests were supplied. Ownership is not documented; permitted use follows the public module entry, with no evidence for broader cross-domain extraction.

## Update and reuse recommendation

Read scope: all supplied project files, the existing index and date guide. Retained CAP-ORDER-QUERY and CAP-DATE IDs, the entire unrelated date entry, and authored date notes. Updated only order metadata and declared both reexport and implementation freshness sources. Governance stays disabled.

Reuse `searchOrders` through the barrel for the exact in-memory case-sensitive name-filter contract. CAP-DATE was considered unrelated to order search. Extend only after defining requirements for normalization, validation or authorization; current behavior does not supply them. No shared extraction is justified by the supplied consumer evidence.

Verification: manually reread the barrel and implementation; calculated SHA-256 from both actual sources. No configured test command or tests exist in the supplied isolated project, so no test suite was run. These findings establish discovery evidence, not runtime or compatibility test approval.
