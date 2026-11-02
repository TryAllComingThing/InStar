# Code Reuse & Shared Capability Governance

InStar discovers and reviews reuse choices; each project owns its module structure,
dependency policy, public contracts and real tests. Use the
[reuse-discover Skill](../skills/reuse-discover/SKILL.md) and
[request protocol](../skills/reuse-discover/references/protocol.md).

## Start

In the target project ask:

```text
$reuse-discover 分析订单和公共请求模块，生成公共能力索引与模块说明。
区分公共入口、内部实现和弃用能力，先保持治理未启用。
```

After reviewing coverage and index entries, explicitly choose whether to enable
governance by setting enabled:true in the project-owned capabilities/index.json.
Then query the workflow CLI with a JSON request:

```json
{"action":"reuse-context","project":"/absolute/project"}
```

Normal flow: discover candidates during proposal exploration; explain decisions in
technical design; reread source and consumers before implementation; review actual
reuse/duplication/abstraction; refresh affected index entries after changes.
Decision data is stored in workflow state with write-design, while human-readable
design uses the Reuse Decisions section. No duplicated decision JSON is required.

## Implemented checks

- Optional bounded capability registry; safe source reading reuses project-baseline helpers.
- Entry-file freshness and selected capability state/hash validation.
- Boundary evidence for internal/unknown candidates.
- Owner, consumers and public contract for shared extraction.
- Reuse decisions in design; index/source binding in task context and implementation approval.
- Reuse Review completeness, source freshness and pre-PR revalidation; warnings propagate.
- Discovery and design template guidance preserve existing modules and avoid utils growth.

The index is model-authored from source searches, not an AST scanner. Internal
visibility is never automatically promoted. Boundary evidence is not executable
dependency proof. Fingerprints cover entry files, not a transitive dependency graph;
the enabled bounded index participates in pre-implementation freshness checks.
Implementation approval binds the design-time snapshot and decisions, while Review
binds current result sources and the approved plan hash. Disabled inventories do
not invalidate governance approvals. Real compatibility,
authorization, integration and UI checks remain project responsibilities. Explicit
local-new decisions are allowed; no fixed reuse ratio or abstraction threshold.

## Validation

See [current validation status](VALIDATION.md). Earlier failure counts are historical and superseded by the Windows regression repair.
