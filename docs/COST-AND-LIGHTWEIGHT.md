# 成本、时长与轻量路径

本文件说明如何在**不降低质量门禁**的前提下减少 InStar 变更的墙钟时间、Token 和重复治理动作，并给出小功能的适用性判断。

## 1. 成本主要来自哪里

以本仓库中 OA 工作流的一次实测为基线（14h15m）：

| 成本项 | 实测 | 主要放大原因 | 当前优化 |
| --- | ---: | --- | --- |
| 设计重开 | 3 次 | 源码文件变化被误认为文档变化 | schema 6 文档审批与源码解耦；源码变化用 `refresh-evidence` |
| 人工审批动作 | 10 次 | 重开后程序性重批 | 源码变化不再重开 design/tasks；审批只针对正文版本 |
| 任务登记 | 19 个任务写入 57 次 | 每任务一次 `complete-task` | schema 6 强制 `complete-tasks` 批量登记，目标 ≤3 次 |
| 源码快照 | 单命令最多 7 次全树扫描 | 每个校验点独立重算 | 请求级 Snapshot Session，同一 action 只扫描一次 |
| Trace 写入 | 分片 + 聚合双写 | 兼容旧的 `.workflow/traces.jsonl` | 新写入只写 `.workflow/traces/<changeId>.jsonl` |
| L1 缓存命中 | 全树指纹，无关文件也失效 | 缓存键绑定整棵源码树 | 只绑定受影响文件内容；无关文件变化仍命中 |
| 测试反馈 | 全量约 42 秒 | 一个进程跑所有重测试 | `npm run test:fast` 约 4 秒；全量仍是发布门禁 |
| 人工等待 | 约 1h16m | 审批与重跑串行 | 减少重开和重复审批，不能也不应消除人工验收 |

不能把墙钟时间全部折算成模型费用。可确认的收益是：同类变更减少 3 次重开、最多 6 次重复审批、54 次任务状态写入，并把 L1 迭代从整树失效改为受影响文件失效。

## 2. 降低 Token 与时长的手段

按优先级执行，不要为了省时间跳过证据：

1. **批量登记任务**：一次 `complete-tasks` 提交所有已完成任务；控制器先校验整批，再一次性写状态和 trace。
2. **源码变化用 `refresh-evidence`**：不要用 `reopen design|tasks` 处理新增源码文件；只失效实现/验证/验收证据，保留四份文档审批和任务证据。
3. **L1 迭代，L2 稳定快照一次，L3 最终一次**：L1/L2 可按受影响文件缓存；L3 永远不缓存，必须在实现审批后运行。
4. **请求级快照**：同一控制器 action 内复用一次源码快照；不要在实现阶段反复调用 `snapshot` 或 `verify`。
5. **用 `test:fast` 做内循环**：提交前仍运行全量测试、`quality-gate` 和配置的 full profile。
6. **warning 分级处置**：`critical`/`unverified` 必须修复；普通 warning 记录 decision、reason、owner 后可放行，避免为单一 warning 重跑整轮 Spec。
7. **记录 usage 并设置预算**：新工作流默认 6M billable tokens / 1200 calls；超限时用带 reason 与 authorization 的 `set-usage-budget` 调整，不能静默关闭。

## 3. 小功能路径矩阵

### 3.1 `micro`（不建立 tracked change）

适用：只改文档、非可执行文案或测试，工作区 baseline 与当前扫描之间的实际差异不含任何可执行/生产代码、配置、依赖或基础设施，且用户明确授权走 `micro-change`。默认上限为 20 个文件、800 行。

可以跳过：

- PRD、Spec、技术设计、任务清单、change brief 和独立 change 归档；
- spec-explore（本来就不启动 Spec 流程）；
- spec-reviewer、架构评审和 L2 中间层；
- 独立的 `quality-gate` 审批动作（仅限本路径的文档/文案/测试范围）。

不能跳过：

- 工作区 baseline 复检、state 绑定校验和范围拒绝；
- 定向测试和一次 `code-review`；
- 最终一次人工验收；
- 提交前的 `preflight`/`full` profile、安全扫描和证据绑定（`commit` 仅为兼容别名）。

一旦实际 Diff 出现可执行/生产代码、UI、认证、授权、数据、API 契约、架构、依赖或基础设施，立即升级为 `quick-change` 或 `requirements-workflow`，不能继续按 `micro` 处理。入口为 `node <plugin>/bin/instar.mjs micro -` 或 `runtime/micro-controller/cli.mjs`。

### 3.2 `lean` tracked change

适用：`documentation`、`copy`、`tests`、`local` impact，且实际 Diff 没有生产代码。UI 不能使用 `lean`。

- 可以跳过 L2 和额外的 security 证据；验证序列为 L1→L3。
- 仍需 PRD、Spec、Design、Tasks 审批，以及实现检查、quality-gate、reviewer 和 full 门禁。
- 如果实际 Diff 出现生产代码或高风险路径，控制器会自动升级到 `standard` 或 `governed`，人工声明不能降级。

### 3.2.1 `quick` tracked change

适用：已有代码中的低风险小功能，不涉及 UI、认证、授权、安全、数据、API 契约、架构、依赖或基础设施；实际 Diff 不超过 10 个文件、400 行，且必须可通过工作区 baseline 独立观测。

- 只生成一页 `planning/quick/<changeId>/change-brief.md`，不再分别生成 PRD、Spec、Design 和 Tasks。
- 人工边界从 6 次降为 2 次：brief 批准后直接开始实现；提交证据后再由人工验收。
- 必须执行定向测试和一次 `code-review`；提交证据前控制器重新扫描工作区，发现高风险、超限或无法与 baseline 独立比较时直接拒绝并要求升级。提交后到最终验收前再次比较源码 fingerprint，期间发生并发修改时必须重新提交证据。
- 不要求 spec-reviewer、架构评审或 L2 中间层；提交前仍执行 `quality-gate` 与项目 `preflight`/`full` 检查，涉及高风险面则升级到 `tracked` 完整流程。
- 使用 `node <plugin>/bin/instar.mjs quick -` 或 `runtime/quick-controller/cli.mjs`。该路径是显式选择，不替代完整的 tracked 流程。

### 3.3 `standard` tracked change

普通功能默认路径。没有必需阶段可以跳过；可以通过 L1→L2→L3、任务批量和 `refresh-evidence` 降低重复工作，但不能减少审批或证据种类。

### 3.4 `governed` tracked change

认证、授权、安全、密钥、数据、数据迁移、API 契约、架构、依赖、基础设施和 UI 变更。不得跳过任何必需阶段；security-reviewer 与 security 证据必须贯穿中间层和 full 验证。

## 4. 不可跳过的清单

无论路径如何，以下内容都不是“可裁剪项”：

- 人工审批的真实性与当前版本绑定；
- `critical` / `unverified` 的阻断；
- `quality-gate` 与 `implementation`/`full` 检查；
- source snapshot、report、artifact 的哈希与新鲜度校验；
- UI 的 design-check、browser、accessibility、keyboard 和 ui-reviewer；
- governed 变更的 security 证据；
- 交付前的显式 `preflight`/`full` profile 门禁（`commit` 仅为兼容别名）。

轻量路径是**适用性判断**，不是关闭门禁的开关。无法确认适用性时，选择更严格的路径。
