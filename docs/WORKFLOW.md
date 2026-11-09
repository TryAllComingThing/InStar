# 受控工作流

本文件描述 schema 5 的完整 change 生命周期。核心原则是：**每个可审批工件都有内容哈希；每个下游动作都验证上游批准仍然有效；AI 生成的报告不能代替人工决定。**

## 1. 参与者与状态

| 参与者 | 职责 |
| --- | --- |
| 用户/业务方 | 提供目标、范围、验收决策，执行人工审批 |
| 主代理 | 读取状态、选择 Skill、生成/修改工件、记录 trace、调用控制器 |
| Specialist Skill | 负责某一阶段的方法与输出质量 |
| Reviewer Subagent | 只读评审，返回 findings、unverified 和代码引用 |
| 控制器 | 加锁、校验版本/哈希、写状态、阻止跳阶段和 stale 证据 |
| 外部工具/CI | 实际运行 lint、test、build、扫描、浏览器和远端检查 |

主要阶段：

```text
prd → spec → design → tasks → implementation → verification → acceptance → archive
```

状态字段还包括 `status`（`in-progress`、`awaiting-approval`、`blocked`、`waiting-clarification`、`completed`）和 `pendingApproval`。恢复操作前必须读取 `state`，不能根据对话记忆猜测。

## 2. 端到端流程

### 阶段 0：初始化

使用 `initialize-project`：

1. 先以 `preview:true` 检查将创建/冲突的文件。
2. 应用初始化，创建 `planning/`、`docs/prd/`、`.workflow/` 等目录。
3. 按 `stack` 追加受控 `AGENTS.md` 区块，安装适用的工程指引和 Reviewer 模板。
4. 合并 `.codex/config.toml` 中适用的角色（fullstack 7 个、backend 5 个）；不覆盖已有冲突内容。
5. 提醒 Codex 只有信任项目后才加载项目级 `.codex` 配置。

初始化不创建前端/后端脚手架，不安装依赖，也不生成 `.instar-quality.json`。

### 阶段 1：PRD

动作：

```text
start → save-prd → submit-prd → 人工审核
```

要求：

- `start` 必须显式提供 `ui` 布尔值和 `stack`（`frontend`、`backend`、`fullstack`）。
- `start` 可接受 `usageBudget: {maxTokens?, maxApiCalls?, enforce?}`；`enforce: true` 时，超限会阻止下一次受控转换，需用 `set-usage-budget` 调整、关闭强制或清空预算。
- `requirements-workflow` 选择 `write-a-prd` 编写或每轮修订 PRD。
- `submit-prd` 生成 `pendingReview.hash` 并进入 `awaiting-approval`。
- 人类返回 `accept-record`、`accept-no-record` 或 `reject`。
- `reject` 或 `request-changes` 会清除待审批状态；修订后必须重新 `submit-prd`。
- 批准后阶段进入 `spec`。

PRD 修订循环：

```text
awaiting-approval → request-changes → write-a-prd → save-prd → submit-prd
```

不得在一次回复中把“批准旧版本”和“修改内容”混为一次有效审批。

### 阶段 2：Spec

PRD 批准后：

```text
spec-explore（可选，空项目跳过）
  → context（获取 contextHash）
  → spec-propose / create-spec
  → spec-verify / submit-spec
  → 人工审核
```

`create-spec`/`save-spec` 需要最新的 `contextHash`，写入：

- `planning/changes/<changeId>/proposal.md`
- `planning/changes/<changeId>/specs/<capability>/spec.md`

`submit-spec` 会：

1. 运行文档引擎 `runSpecVerifyGate`，检查结构和合并兼容性。
2. 要求已完成的 `spec-reviewer` 评审覆盖 proposal 与 delta Spec，并绑定当前内容哈希。
3. 拒绝 critical/warning findings、unverified 项、缺失或 stale 的评审。
4. 通过后打开人工 Spec 审批。

任何 Spec 修改都需要重新执行 spec-propose、spec-verify、quality-evaluation（建议）和 spec-reviewer。

### 阶段 3：技术设计

Spec 人工批准后：

```text
context → [UI: design-check] → write-design → 人工审批 → tasks
```

设计要求：

- 读取项目 `AGENTS.md`、架构/设计文档、`standards/`、Token 来源和观察到的项目树。
- `context.emptyProject === true` 时跳过架构/参考探索，并明确记录。
- UI 变更必须完成 `design-check` trace，并将 `constraints`、`coverage`、`sources` 传给 `write-design`。`coverage` 必须覆盖 `hierarchy`、`layout`、`states`、`tokens`、`responsive`、`accessibility`；不适用项也要显式列出。每个 source 使用 `{path, role}`，角色为 `design-contract`、`design-system`、`tokens`、`component` 或 `reference`；旧字符串来源会兼容归一化。
- UI 设计必须提供 `designReuse` 中至少一个 `component` 或 `pattern` 条目，或提供 `designReuseReason` 明确说明为什么没有可复用组件/模式。仅提供 `token`、`layout` 或 `interaction` 条目不满足门禁。复用证据的文件内容与说明都会进入设计与任务审批哈希，内容变化会使审批 stale。
- 控制器拒绝符号链接、敏感/生成路径和角色不匹配的文件类型，并自动记录 `sha256`、`bytes`、`type`。设计审批会重算来源内容指纹，来源变化后设计审批立即 stale。
- 设计写入 `technical-design.md`，绑定设计内容、designCheck、项目指引/标准/InStar 参考指纹。设计上下文同时返回 `designReferenceMode`（`bootstrap`、`quality` 或 `false`）供审计。
- 旧 `design.md` 和旧 workflow schema 仍可被 `state`/`context` 读取，但响应会附加 `compatibility` 告警。告警不写入状态、不改变审批哈希；`design.md` 应迁移到 `technical-design.md`，旧 workflow 必须显式执行 `migrate`。两类兼容支持计划在下一个大版本移除。
- 设计审批与任务审批分开；`write-tasks` 需要设计已批准。

### 阶段 4：任务拆分

```text
context → write-tasks → 人工审批 → implementation
```

任务必须是编号、未勾选的任务，带可观察验收证据；任务文本和编号不可在执行中任意改变。任务审批哈希会忽略 checkbox 完成状态，所以勾选任务不会使审批失效，但改写任务文本会失效。

**任务审批通过才授权实现。** 任务文件本身不是授权。

### 阶段 5：实现

```text
frontend-implement / engineering-implement
  → complete-task（逐项）
  → implementation profile 验证
  → quality-gate
  → architect/code-reviewer
  → submit-implementation
  → 人工确认实现
```

`complete-task` 要求：

- 每个任务只能完成一次；
- 证据是 `{summary, files:[{path,line?,note?}], verification?}`；
- `files` 至少一项且必须是真实普通文件；
- 全部任务完成后才能提交实现。

`submit-implementation` 要求：

- 已完成对应栈的实现 Skill（frontend/backend/fullstack 分别要求）；
- 已完成 `quality-gate`；
- `implementation` profile 覆盖 `lint`、`format`、`test`，UI 再加 `browser`；
- `architect` 和 `code-reviewer` 已完成并通过 source snapshot 校验；
- 生成并绑定实现审批记录。

人工确认后才进入验证阶段。实现审批不是最终验收。

### 阶段 6：验证与验收

```text
frontend-verify / engineering-verify
  → full profile 验证
  → security-reviewer + frontend-reviewer（frontend/fullstack UI）+ ui-reviewer（UI）
  → submit-verification
  → 人工验收
```

要求：

- `full` profile 必须包含 `security`；UI 变更必须包含 `accessibility` 和 `keyboard`。
- frontend/fullstack UI 变更必须完成 `frontend-reviewer`；UI 变更还必须完成 `ui-reviewer`。
- 不要求重复 implementation 已覆盖的相同 browser 检查；同一 source snapshot 和检查定义已覆盖的旅程应复用证据，只有新增语义才另设检查。
- full 报告必须在 implementation 审批后生成。
- 验证证据绑定源码快照、报告哈希、配置和 artifact。
- severe/critical findings、unverified 项或 failed/not-verified 检查会阻塞。
- 人类验收是独立步骤；`approve` acceptance 后才进入 archive。

### 阶段 7：归档

`archive` 再次检查：

- 所有任务有完成证据；
- 所有必需审批仍然有效；
- verifier、acceptance 与 evidence 绑定当前源码快照；
- artifact 和报告未被替换；

通过后调用 `promoteToBaseline`，将变更合并到基线并复制归档状态。归档 workflow 不可修改；后续改动应新建 change。

### 轻量路径

已有代码的小改动不强制创建 PRD、Spec、Design 和 Tasks。用户明确授权后，直接执行对应实现 Skill、`quality-gate`、`implementation` 检查和 `architect`/`code-reviewer` 评审；需要提交或 PR 时再执行 `commit`/`full` profile。涉及需求变化、外部契约、架构边界、UI 设计或高风险安全面时，仍应走完整受控流程。轻量路径是适用性判断，不是降低现有门禁的开关。

## 3. 人工审批语义

`approve` 必须提供当前 `reviewHash`，并选择：

| Decision | 记录内容 | 效果 |
| --- | --- | --- |
| `accept-record` | 记录 hash、confirmation、时间 | 接受并保留审批信息 |
| `accept-no-record` | 记录 decision、hash、`recorded:false` | 接受但不保留 confirmation 文本 |
| `reject` | 要求 feedback；清除待审批 | 回到可编辑阶段，要求修订 |

任何内容变化都会使旧 hash 失效。`accept-no-record` 仍是一次明确决定，不是“未审批”。

## 4. 修订与重开

- `request-changes`：在待审批阶段反馈修改，不推导新审批。
- `reopen`：回到最早受影响的阶段。PRD 重开会清理下游规划；Spec 重开会清理设计/任务；实现/验证重开会使验证和验收证据失效。
- `reopen` 不能向前跳阶段，也不能重开已归档 change。
- `migrate`：将旧 active workflow 升级到 schema 5，必须显式提供 `ui` 和 `stack`；迁移会清空旧审批并要求重新评审，归档流程不可迁移。

## 5. 源码快照与时序

工作流在实现审批和验证时生成有界源码快照（最多 50,000 文件/512 MiB），排除 `.git`、依赖、构建输出、报告、日志、规划和 PRD 目录。它会比较：

- implementationReview 的 `sourceHash`；
- verification 的 `sourceHash`；
- archive 时的当前 treeHash。

因此，源码在实现审批后改变、验证后改变，或 full 报告早于实现审批，都会被拒绝。

## 6. 空项目行为

当 `context.emptyProject` 为 true：

- `context.explorationSkipped = true`；
- `instarReferences` 为空；
- 不要求已有的架构、模块或源码引用；
- 仍需保留 `ui`/`stack` 分类、PRD/Spec 门禁、设计和人工审批。

空项目不等于可以跳过验证或伪造实现证据。

## 7. 可观察性

```sh
node <plugin>/bin/instar.mjs status --project /absolute/project
node <plugin>/bin/instar.mjs status --project /absolute/project --change add-login --json
```

或以 JSON 调用 `visualize`。输出包含阶段图、status、pending approval、审批列表和最近 trace。查看状态不会修改项目。

## 8. 工作流失败原则

- 任一必需审批缺失/stale：停止，不自动补批。
- `expectedVersion` 不匹配：重新读取 state。
- contextHash 变化：重新读取 context 并重新生成当前阶段工件。
- Reviewer/trace 缺失：先执行评审，不把报告当人工确认。
- 验证报告/artifact 变化：重跑检查，不复用旧 PASS。
- 锁或事务失败：按 [DEBUGGING.md](DEBUGGING.md) 处理，不删除活跃锁。
