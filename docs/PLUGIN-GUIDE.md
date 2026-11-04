# InStar 使用说明书

本文面向使用 InStar 进行日常开发、需求评审、存量 Spec 建档和质量交付的用户。协议细节见 [质量协议](QUALITY.md)，内部结构见 [架构书](plugin-arch.md)。

## 1. 适用方式

InStar 以 Codex 插件形式运行，主要入口有三类：

1. **Skill**：在 Codex 会话中输入 `$requirements-workflow`、`$spec-discover` 等，由宿主模型按 Skill 指引调用控制器。
2. **快捷 CLI**：适合人工执行诊断、快照、验证、Review 和 CI。
3. **JSON CLI**：适合脚本、宿主适配器或需要完整字段的高级调用。

控制器本身不调用模型。需要生成或评审文档时，由 Codex 模型执行 Skill，再通过 CLI 写入受控文件。

## 2. 前置条件与安装

### 2.1 环境

- Node.js `>=20.19.0`。
- npm（构建、发布和旧版 npm 检查）。
- Git 仓库，且质量命令在仓库根目录运行。
- 可选：`gh` 登录态与远端仓库权限，仅用于 `ci` 集成。
- 可选：Python、Java、Go、Rust 等语言运行时，仅当项目自己的 schema 3 检查需要。

### 2.2 构建发布包

在插件仓库中：

```sh
npm ci
npm run release
```

完成后会生成：

```text
release/
  plugins/instar/
  .agents/plugins/marketplace.json
```

`release/plugins/instar` 包含编译后的 `runtime/`、Skills、规范、Hooks、命令和文档，不依赖仓库根目录的 `node_modules`。

### 2.3 安装到 Codex

```sh
codex plugin marketplace add /absolute/path/to/InStar/release
codex plugin add instar@instar-local
```

如果宿主未发现 `commands/`，仍可直接调用 Skill 或 CLI。插件安装路径以宿主实际展开的目录为准。

## 3. 首次接入目标项目

进入目标 Git 根目录：

```sh
node <plugin>/bin/instar.mjs doctor --project .
node <plugin>/bin/instar.mjs snapshot --project .
```

预期行为：

- 没有 `.instar-quality.json` 时，`doctor` 返回自动发现结果，`snapshot` 仍可生成快照。
- 严格验证、`pre-pr-check` 和 `ci publish` 需要项目显式配置 `.instar-quality.json`。
- `doctor` 会检查项目架构/设计文档、Token 来源、GitHub workflow、可选工具脚本和依赖状态，但不会自动安装工具。

## 4. 选择工作方式

| 场景 | 推荐入口 | 说明 |
| --- | --- | --- |
| 小型已有功能修改 | 直接实现 + `frontend-verify` / `engineering-verify` | 不要为小改强制创建 PRD/Spec |
| 新功能、跨端功能、需要审批的变更 | `requirements-workflow` | PRD → Spec → 设计 → 任务 → 实施 → 验证 → 归档 |
| 已有代码需要当前行为 Spec | `spec-discover` | 独立于新增需求流程，产物是观察结果，不是产品批准 |
| 提取现有 UI 视觉规范 | `extract-design-md` | 写入项目根目录 `./DESIGN.md`，不修改样式 |
| UI 变更前整理约束 | `design-check` | 产出变更级 Style Constraints，供技术设计使用 |
| 实现前查找可复用能力 | `reuse-discover` | 维护能力索引，避免重复实现 |
| 提取工程基线 | `project-discover` | 生成架构、领域、API、数据库、编码、安全六类基线及证据 |
| 调试失败 | `systematic-debugging` | 以复现、证据和最小根因修复为主 |
| 研究未知库/API | `engineering-research` | 优先使用版本化文档和项目现有模式 |

## 5. 22 个 Skill 能力地图

### 5.1 需求与 Spec

| Skill | 用途 |
| --- | --- |
| `requirements-workflow` | 管理 PRD 到归档的受控变更；需要人工审批 |
| `write-a-prd` | 撰写或修订产品 PRD，覆盖范围、状态、验收与风险 |
| `spec-explore` | 在变更初期探索问题、方案和需求边界 |
| `spec-propose` | 从已批准 PRD 生成 proposal 与 delta specs |
| `spec-verify` | 在人工 Spec 评审前执行确定性文档门禁 |
| `spec-design` | 在 Spec 批准后撰写技术设计 |
| `spec-tasks` | 从设计生成可执行、可验证的任务清单 |
| `spec-discover` | 从存量源码和测试生成带证据的现状 Spec |

### 5.2 实现与验证

| Skill | 用途 |
| --- | --- |
| `frontend-implement` | 按已评审任务实施前端改动并做任务级验证 |
| `engineering-implement` | 按已批准计划实施后端或跨栈改动 |
| `frontend-verify` | 用实际代码、测试和浏览器证据验证前端 |
| `engineering-verify` | 用项目配置执行后端/跨栈检查并生成快照证据 |

### 5.3 设计、质量与交付

| Skill | 用途 |
| --- | --- |
| `design-check` | 从设计文档、Token 和高保真参考提取变更级 UI 约束 |
| `extract-design-md` | 从现有前端代码整理完整视觉设计说明到 `DESIGN.md` |
| `quality-gate` | 按项目风险与检查清单生成稳定的 Review 证据 |
| `quality-evaluation` | 对 PRD/Spec/设计/任务做带原文证据的语义评测 |
| `ci` | 推送功能分支、发布 PR 证据并检查指定提交的 CI |

### 5.4 辅助与治理

| Skill | 用途 |
| --- | --- |
| `context-optimizer` | 审计和改善臃肿、冲突、过时或难发现的上下文 |
| `engineering-research` | 研究库、API、集成和版本化文档 |
| `systematic-debugging` | 以证据定位并修复可复现的故障 |
| `project-discover` | 提取工程基线、架构约束与源码证据 |
| `reuse-discover` | 发现现有能力并形成复用/扩展/新建决策 |

## 6. 需求工作流使用

### 6.1 在 Codex 中启动

```text
$requirements-workflow 为订单列表增加按状态筛选和分页，先产出 PRD 并等待我确认。
```

工作流会按阶段生成文档：

```text
docs/prd/<changeId>.md
planning/changes/<changeId>/proposal.md
planning/changes/<changeId>/specs/<capability>/spec.md
planning/changes/<changeId>/technical-design.md
planning/changes/<changeId>/tasks.md
planning/workflows/<changeId>.json
```

### 6.2 人工审批点

必须明确确认的阶段：

1. **PRD**：产品范围、成功标准、状态和边界。
2. **Spec**：需求、场景、基线和影响；Spec 变更会作废旧审批。
3. **实施计划**：技术设计 + 任务 + 项目基线/复用决定。
4. **验收**：实现、验证证据和未验证项。

审批不是“点一下继续”的形式动作：控制器会校验 `reviewHash` 与当前文档和上下文的实际哈希一致，并要求当前 `intentId` 与一次性 `challenge`。intent 有有效期、消费后不可复用；复制旧确认文本不能批准新内容。文档、任务、基线或验证变化后，必须重新评审。

### 6.3 实现阶段

- 任务必须使用数字编号，例如 `1.1`，并在完成后带有证据。
- 全部任务完成后优先用一次 `complete-tasks` 批量提交 `{taskId,evidence}`；控制器会先校验整批再原子写入。`complete-task` 仅保留为单任务兼容入口，不能提前把未完成任务标记完成。
- `submit-implementation` 要求所有任务完成且有证据。
- 进入验证后，先运行一次稳定快照上的 `quality-gate`，用 `reportPath` 绑定评审，再提交工程验证；相同 snapshot/配置/检查集/工具版本的稳定证据可直接复用缓存。统一报告同时写入 `reports/review-dossier.json`，用稳定引用连接验证与 Review 证据；门禁会校验 dossier 与两份源报告的 snapshot、report ID 和 checks 哈希。
- 最终 `archive` 前，验证快照必须仍然匹配当前源码。

### 6.4 修订与回退

- 需要修改上游内容时使用 `reopen`，并给出实际原因。
- `reopen` 会删除下游文档、审批和任务证据，但事务目录保留旧版本。
- 归档后工作流不可变；需要新变更时使用新的 `changeId`。
- PRD 澄清未完成时，其他转换会被阻塞。

### 6.5 工作流速查命令与 JSON CLI

日常读取和常见转换使用 `bin/instar.mjs` 的便捷入口；控制器仍负责全部状态机、指纹、审批和事务逻辑：

```sh
node <plugin>/bin/instar.mjs flow status --project .
node <plugin>/bin/instar.mjs flow next --project .
node <plugin>/bin/instar.mjs flow context --project . --json
node <plugin>/bin/instar.mjs doc show --project . --kind design
node <plugin>/bin/instar.mjs flow start --project . --change add-order-filter --document ./prd.md --lane quick
node <plugin>/bin/instar.mjs flow action write-tasks --project . --input /tmp/write-tasks.json --dry-run
```

复杂动作、长 Markdown 和自动化仍可使用 JSON 文件或 stdin：

```sh
node <plugin>/runtime/workflow-controller/cli.mjs /tmp/workflow-request.json
cat /tmp/workflow-request.json | node <plugin>/runtime/workflow-controller/cli.mjs -
```

`flow action` 会把 `--input` 请求交给同一控制器；`--dry-run` 只返回将发送的请求，不写入状态。`--json` 输出完整载荷，`--brief` 输出摘要。`doc show` 支持 `prd`、`proposal`、`spec`、`design`、`tasks` 和 `all`。

`submit-quality-review` 可以直接读取工作区内的稳定质量报告，避免手工复制大 JSON：传入 `"reportPath": "reports/quality-gate.json"`（兼容别名 `fromReport`）。报告必须是普通文件、不能是符号链接，且不超过 16 MiB；控制器仍会重新校验完整性、稳定性和当前源码快照。

常用 action：

```text
start, state, context, request-clarification, answer-clarification,
save-prd, submit-prd, approve, request-changes,
create-spec, save-spec, submit-spec, write-design, write-tasks,
complete-tasks, complete-task, submit-implementation, submit-quality-review,
submit-verification, archive, reopen, recover,
trace-skill, list-skills, route-skills, evaluate-quality,
baseline-context, baseline-adopt, baseline-check,
reuse-context, recovery-status, prune-recovery
```

示例：

```json
{
  "action": "start",
  "project": "/absolute/path/to/project",
  "changeId": "add-order-filter",
  "lane": "fast",
  "document": "# PRD\n为订单列表增加状态筛选。",
  "affectedPaths": ["src/orders"]
}
```

`lane` 可为 `micro`、`quick`、`fast`、`standard` 或 `regulated`。省略时控制器按 `affectedPaths` 推荐默认 lane；L0/L1 小范围可显式选择 `micro`（10–20 分钟、12M token）或 `quick`（20–30 分钟、18M token）来减少重复规划和评审开销，`fast` 仍是默认档位。L2 至少 `standard`，L3 使用 `regulated`；显式 lane 不能低于对应风险下限。各 lane 记录响应/工具/浏览器/门禁/语义评测预算，并预留必需质量步骤。`state`、`next` 和 `cost show` 会返回 `efficiency`；终态 `trace-skill` 可附带 `metrics`。时间超限按 `activeMs` 判断，同时返回 `waitMs` 和 `elapsedMs` 以区分人工等待与日历时间。缺失指标保持 `insufficient-telemetry`，这些是 advisory budget 和代理指标，不会在超预算时自动绕过质量门禁。

读取当前状态：

```json
{
  "action": "state",
  "project": "/absolute/path/to/project",
  "changeId": "add-order-filter"
}
```

除 `list-skills`、`route-skills`、`state`、`context` 和部分恢复/基线动作外，变更状态的动作需要 `expectedVersion` 匹配当前版本；提交生成内容还需要 `contextHash`。这两个字段用于防止并发覆盖和基于旧上下文生成。重复读取未变化的 `context` 时可传入上次的 `knownContextHash`；哈希一致时返回 `contextDiff.fullContextOmitted:true`，不重复传输完整上下文，哈希变化时仍返回完整上下文。

`route-skills` 不要求目标项目路径，只接收 `{context, stage}`，从 `skills/index.json` 返回最多 4 个紧凑 Skill 入口。结果先按阶段过滤，再要求至少达到 `minTriggerHits`；没有高置信匹配时返回 `confidence:low`，不会把明显无关的 Skill 当作强匹配。结果包含触发命中数、阶段匹配、输入输出、`entryBytes`、`referenceBytes`、参考文件列表和 `detailLoaded:false`；`skills/references.json` 作为二级索引提供每个参考文件的摘要、适用阶段、`loadWhen`、权威级别和风险，不复制正文。调用方应只加载被选中的 `SKILL.md`，再选择 `loadWhen` 成立的参考文件；不适用或归档引用进入 `referenceOmitted`。`stage` 可为 `prd`、`spec`、`design`、`tasks`、`implementation`、`verification` 或 `acceptance`。

## 7. 质量验证与 Review

### 7.1 快捷命令

```sh
node <plugin>/bin/instar.mjs doctor
node <plugin>/bin/instar.mjs snapshot --project .
node <plugin>/bin/instar.mjs verify --profile full
node <plugin>/bin/instar.mjs review --project . --review-file ./review.json
```

`verify` 默认 profile 为 `full`，也支持 `commit`。高风险变更只允许 `full`。

### 7.2 项目配置

项目自行创建 `.instar-quality.json`。完整字段见 [质量协议](QUALITY.md)。最小的 Vue 兼容配置示例：

```json
{
  "schemaVersion": 2,
  "packageManager": "npm",
  "baseRef": "main",
  "review": { "language": "typescript", "framework": "vue" },
  "qualityPolicy": {
    "schemaVersion": 1,
    "profiles": {
      "commit": [
        { "category": "Q-01", "checkId": "lint" },
        { "category": "Q-02", "checkId": "typecheck" },
        { "category": "Q-07", "checkId": "evidence-report" }
      ],
      "full": [
        { "category": "Q-01", "checkId": "lint" },
        { "category": "Q-02", "checkId": "typecheck" },
        { "category": "Q-03", "checkId": "test" },
        { "category": "Q-04", "checkId": "build" },
        { "category": "Q-05", "checkId": "dependencies" },
        { "category": "Q-06", "checkId": "vite-build" },
        { "category": "Q-07", "checkId": "evidence-report" }
      ]
    }
  },
  "tools": { "dependencies": "quality:dependencies", "vite-build": "quality:vite-build" }
}
```

旧配置默认执行 npm scripts；缺少 script 会使对应检查 `BLOCK`。新项目建议使用 schema 3，把 `tools.checks` 映射到实际命令。

`qualityPolicy` 的每个类别可使用兼容的 `checkId`，或使用 `checkIds` 要求多个检查。同一检查也可被多个类别复用；豁免仍按 `category + checkId` 隔离。跨栈项目可把 `review.language` / `review.framework` 写为数组，例如 `"language": ["typescript", "python"]`、`"framework": ["vue", "none"]`，Review 清单会合并前端和后端项目。

支持的 Review profile 包括 Vue、React、Svelte、Angular、Node、Python/Java/Go 后端、Rust 和 .NET。控制器按 `language`/`framework` 合并专项项，未知栈只保留通用项，绝不默认假设 Vue。`review init` 会按当前栈生成完整清单。

项目规范通过 `.instar-quality.json` 的 `context.standards` 或仓库 `standards/` 发现。`standards/index.json` 示例：

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "ARCH-001",
      "path": "standards/architecture/module-boundaries.md",
      "mandatory": true,
      "appliesTo": ["src/**"],
      "summary": "Use public module entry points."
    }
  ]
}
```

`mandatory`/`always` 且命中当前 `affectedPaths` 的规则必须写入设计 `Compliance Matrix`，并在 Review 的 `standardsReferences` 中逐条提供状态和证据。建议性规则不会单独阻断；无关规则变化不会使当前设计指纹失效。

### 7.3 Review 文件

`review --review-file` 可以读取直接 Review 对象，也可以读取 `{ "review": { ... } }` 包装对象。每次 Review 必须使用当前 `snapshot` 的 `fingerprint`，并覆盖当前技术栈的完整检查清单。先用 `review init` 生成模板，比手工拼写更不容易漏项：

```sh
node <plugin>/bin/instar.mjs review init --project . --reviewer team-member
```

模板中的 `WARN` + `not-verified` 只是待办，不是通过证据。检查项或栈配置变化后使用 `review repair --review-file reports/review.json` 补齐缺失项并刷新指纹；旧 `PASS` 不会被 repair 自动标记为新快照通过。

低风险示例：

```json
{
  "reviewer": "team-member",
  "fingerprint": "<snapshot fingerprint>",
  "checks": [
    { "id": "correctness", "status": "PASS", "evidence": "Reviewed changed branch and tests." },
    { "id": "maintainability", "status": "PASS", "evidence": "No new duplication." },
    { "id": "architecture", "status": "PASS", "evidence": "Follows existing module boundary." },
    { "id": "security", "status": "PASS", "evidence": "No new input path." },
    { "id": "performance", "status": "PASS", "evidence": "No hot-path change." },
    { "id": "naming", "status": "PASS", "evidence": "Follows project naming." }
  ]
}
```

高风险 Review 的证据必须包含源码位置、精确摘录和当前快照指纹；检查项数量由 `review init` 按当前语言、框架和 `extraChecks` 生成，不再假设固定 Vue 清单。存在适用强制项目规范时，Review 还必须包含：

```json
"standardsReferences": [
  {
    "id": "ARCH-001",
    "status": "PASS",
    "evidence": "src/orders/index.ts:12 uses the public module entry point"
  }
]
```

详见 [质量协议](QUALITY.md)。

### 7.4 提交前与 PR 前

推荐顺序：

```sh
# 1. 获取快照
node <plugin>/bin/instar.mjs snapshot --project .

# 2. 执行完整验证
node <plugin>/bin/instar.mjs verify --project . --profile full

# 3. 生成当前快照的 Review 模板并完成实际检查
node <plugin>/bin/instar.mjs review init --project . --reviewer team-member
# 编辑 reports/review.json 填入真实证据；栈或指纹变化后可运行 review repair
node <plugin>/bin/instar.mjs review --project . --review-file ./reports/review.json

# 4. 记录 AI 溯源（JSON action）
cat /tmp/provenance.json | node <plugin>/runtime/quality-controller/cli.mjs -

# 5. PR 前联合检查
cat /tmp/pre-pr.json | node <plugin>/runtime/quality-controller/cli.mjs -

# 6. 生成 PR 正文
node <plugin>/bin/instar.mjs ci prepare --project . --title "feat: add order filtering"

# 7. 用户明确确认后推送并创建/更新 PR
node <plugin>/bin/instar.mjs ci publish --project . --title "feat: add order filtering" --confirm

# 8. 读取 CI 状态
node <plugin>/bin/instar.mjs ci status --project .
```

`provenance.json` 示例：

```json
{
  "action": "ai-provenance",
  "project": "/absolute/path/to/project",
  "aiGenerated": true,
  "sessionId": "session-2026-11-02",
  "summary": "Implemented order filtering with tests and reviewed the diff."
}
```

`pre-pr.json` 示例：

```json
{ "action": "pre-pr-check", "project": "/absolute/path/to/project" }
```

`ci prepare` 只生成 `reports/pr-body.md`，不会推送。`ci publish` 需要项目配置 `ci` 字段，并且要求 full 验证、Review、provenance 与当前提交一致。

### 7.5 提交与 Hook

- 提交前应暂存所有预期改动；`commit` 会拒绝工作区与索引不一致。
- 只能使用功能分支；main、master、baseRef 和远端默认分支会被拒绝。
- Hook 只接受独立的 `git commit` 或 `gh pr create`，不支持命令链、管道、重定向或 `--repo`。
- Hook 检查失败时会拒绝工具调用；它不会自动调用模型或联网。

## 8. 存量 Spec 发现

### 8.1 读取上下文

```sh
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project --scope src/orders --scope tests/orders
```

该命令返回只读的 `context`，包含文件清单、行数、哈希、基线索引、活动工作流摘要、排除项和 `contextHash`。它不会自动执行应用或测试。

### 8.2 编写 capture 请求

由模型阅读源码与测试后，生成完整 Spec。请求文件应放在目标项目之外，避免改变源码清单：

```json
{
  "action": "capture",
  "project": "/absolute/project",
  "scopes": ["src/orders", "tests/orders"],
  "contextHash": "<from context>",
  "preview": true,
  "specs": {
    "orders/search": "# Orders search\n\n## Requirements\n\n### Requirement: Search orders\n..."
  },
  "evidence": {
    "orders/search": [
      {
        "requirement": "Search orders",
        "path": "src/orders/search.ts",
        "startLine": 12,
        "endLine": 18,
        "excerpt": "export function searchOrders"
      }
    ]
  },
  "reviewedFiles": ["src/orders/search.ts", "tests/orders/search.test.ts"],
  "limitations": ["Remote service behavior is outside this repository"],
  "update": []
}
```

要求：

- `contextHash` 必须来自同一批扫描。
- 每条需求至少有一条源码证据；证据必须引用已审查文件。
- 行号从 1 开始，`excerpt` 必须能在指定范围内精确找到。
- `reviewedFiles` 不能为空；未读文件会列入覆盖报告。
- 已有能力默认受保护；只有明确列入 `update` 才会替换。
- 预览不写文件；将 `preview` 改为 `false` 或省略后才落盘。

### 8.3 扫描限制

- 最多 30,000 个 entry。
- 最多 10,000 个文本文件。
- 单文件最多 1 MiB。
- 总扫描最多 64 MiB。
- 基线全文默认最多约 4 MiB；大项目可用 `baselineCapabilities` 只加载相关能力。
- 符号链接、依赖目录、生成目录、凭据文件和隐藏源文件会被拒绝或排除。

发现产物写入 `planning/specs/<capability>/spec.md` 和 `planning/discovery/<uuid>.json`，不会创建 PRD、proposal、任务或虚假审批。它描述的是当前实现，不应当被当作产品需求。

## 9. 会话与上下文

- 会话摘要通过 JSON action `session-summary` 写入 `logs/pending-session.json`。
- `SessionEnd` 只有在存在待关闭摘要时才执行 `session-close`。
- 配置 `context.sessionState`、`context.lessons` 时，关闭会话可以把用户提供的摘要/教训追加到项目 Markdown 文件。
- 控制器不会在每个普通会话结束时自动写审计文件。

## 10. 命令速查

| 目标 | 命令 |
| --- | --- |
| 帮助 | `node <plugin>/bin/instar.mjs help` |
| 工作流状态 | `node <plugin>/bin/instar.mjs status --project . [--change <id>]` |
| 下一动作 | `node <plugin>/bin/instar.mjs next --project . [--change <id>]` |
| 工作流上下文 | `node <plugin>/bin/instar.mjs flow context --project . [--json]` |
| 启动工作流 | `node <plugin>/bin/instar.mjs flow start --change <id> --document <file> [--lane <lane>]` |
| 通用工作流动作 | `node <plugin>/bin/instar.mjs flow action <action> --input <request.json> [--dry-run]` |
| 查看文档 | `node <plugin>/bin/instar.mjs doc show --project . [--kind design|tasks|all]` |
| 复用发现 | `node <plugin>/bin/instar.mjs find reuse --query "订单筛选" --json` |
| 规范发现 | `node <plugin>/bin/instar.mjs find standards --path src/orders [--changed]` |
| 架构/基线发现 | `node <plugin>/bin/instar.mjs find architecture --json` |
| 规范合规检查 | `node <plugin>/bin/instar.mjs standards check --document ./technical-design.md` |
| 成本与缺失指标 | `node <plugin>/bin/instar.mjs cost show --project .` |
| 成本档位说明 | `node <plugin>/bin/instar.mjs cost lanes --json` |
| 设计理念说明 | `node <plugin>/bin/instar.mjs explain` |
| 诊断 | `node <plugin>/bin/instar.mjs doctor` |
| 快照 | `node <plugin>/bin/instar.mjs snapshot --project .` |
| 完整验证 | `node <plugin>/bin/instar.mjs verify --profile full` |
| 快速验证 | `node <plugin>/bin/instar.mjs verify --profile commit` |
| Review 模板 | `node <plugin>/bin/instar.mjs review init --reviewer team-member` |
| 修复 Review 模板 | `node <plugin>/bin/instar.mjs review repair --review-file reports/review.json` |
| 质量门禁 | `node <plugin>/bin/instar.mjs review --review-file ./reports/review.json` |
| 生成 PR 正文 | `node <plugin>/bin/instar.mjs ci prepare --title "..."` |
| 发布 PR | `node <plugin>/bin/instar.mjs ci publish --title "..." --confirm` |
| 查询 CI | `node <plugin>/bin/instar.mjs ci status` |
| 存量发现上下文 | `node <plugin>/bin/instar.mjs spec-discover --project /abs/path` |
| 存量发现预览 | `node <plugin>/bin/instar.mjs spec-discover --input /tmp/capture.json --preview` |
| 工作流 JSON | `node <plugin>/runtime/workflow-controller/cli.mjs /tmp/request.json` |
| 质量 JSON | `node <plugin>/runtime/quality-controller/cli.mjs /tmp/request.json` |

## 11. 故障排查

| 症状 | 检查 |
| --- | --- |
| `project must be an absolute path` | JSON 请求使用绝对路径；快捷 CLI 可用 `--project .` |
| `project must be the Git repository root` | 在仓库根目录执行，或传入根目录 |
| `Invalid quality configuration` | 检查 schemaVersion、baseRef、profiles、tools.checks 字段 |
| `Missing verification report` | 先运行匹配 profile 的 verify |
| `Review is stale` / `Quality review report is stale` | 错误会列出旧/新 treeHash 和变化文件；生成依赖、构建物与缓存已自动排除。确认源码变化后重新 Review 和 quality-gate |
| `Review checklist incomplete or duplicated` | 按语言/框架生成完整清单，不能只交部分项 |
| `Review file already exists` | 使用 `review repair`，或明确执行 `review init --force` |
| `Review evidence does not match current source` | 重新读取文件并修正路径、行号、摘录 |
| `Review template must be under an excluded runtime path` | `--output` 使用 `reports/` 等不会改变自身快照的路径 |
| `Potential credentials found` | 内置 secret scan 命中；轮换并移除凭据后重新验证 |
| `Mandatory qualityPolicy missing` | 添加 qualityPolicy，full 覆盖 Q-01 到 Q-07 |
| `Q-07 evidence integrity` | full 策略必须包含 Q-07，推荐映射 `evidence-report` |
| `Quality operation already running` | 检查 `logs/.quality.lock` 和残留进程 |
| `Interrupted transaction exists` | 查看 `.workflow/pending.json`，使用 `recover` |
| `CI host is not explicitly allowed` | `ci.allowedHosts` 必须包含 `ci.host` |
| `Remote base changed` | 拉取/变基后重新快照、验证和 Review |
| `No matching open PR` | 先 `ci publish`，或确认已有 PR 的 head/base |
| `Command failed` / `SPAWN_ERROR` | 在项目根目录手动运行 `tools.checks` 命令 |

## 12. 能力边界

- InStar 不自动创建质量配置，不自动安装扫描器，不修复项目代码。
- `doctor` 的 `PASS` 不表示所有工具已配置；未配置工具通常显示 `INFO`。
- `verify` 的 `PASS` 只表示项目命令成功，不表示代码正确。
- `quality-gate` 的 `PASS` 只表示 Review 结构和证据满足要求，不替代人工评审。
- `spec-discover` 的产物是源码观察，不是业务批准。
- 本地报告、Skill 轨迹和授权字段不是不可伪造的身份证明。
- Hook 不替代 CI、分支保护或 CODEOWNERS。

## 13. 延伸阅读

- [架构书](plugin-arch.md)
- [质量协议](QUALITY.md)
- [开发测试手册](LOCAL_TESTING.md)
- [评测与验收说明](EVALUATION.md)
- [需求控制器协议](../skills/requirements-workflow/references/controller.md)
- [存量发现协议](../skills/spec-discover/references/protocol.md)
