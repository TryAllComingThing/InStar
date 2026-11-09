# 参考速查

## 1. Skill 清单

```text
ci
context-optimizer
design-check
engineering-implement
engineering-research
engineering-verify
extract-design-md
frontend-implement
frontend-verify
initialize-project
quality-evaluation
quality-gate
requirements-workflow
spec-design
spec-discover
spec-explore
spec-propose
spec-tasks
spec-verify
systematic-debugging
write-a-prd
```

## 2. Workflow action

| Action | 作用 |
| --- | --- |
| `initialize` | 初始化目标项目；可 `preview`，`stack` 为 frontend/backend/fullstack |
| `start` | 创建 change；需要 `ui`、`stack`、PRD 文档；可传 `usageBudget`（支持 `enforce`） |
| `request-clarification` / `answer-clarification` | PRD 阶段阻塞式澄清 |
| `migrate` | 升级旧 active workflow 到 schema 5；需要 `ui` 与 `stack`，清空旧审批 |
| `save-prd` / `submit-prd` | 保存/提交 PRD 审批 |
| `approve` | 用当前 hash 执行 `accept-record`/`accept-no-record`/`reject` |
| `request-changes` | 在待审批状态反馈修改 |
| `create-spec` / `save-spec` | 创建/修订 proposal 与 delta specs |
| `submit-spec` | Spec gate + 强制 spec-reviewer + 人工审批入口 |
| `write-design` / `write-tasks` | 写入设计/任务；需要当前 contextHash |
| `complete-task` | 记录代码级任务证据并勾选 |
| `submit-implementation` | 实现证据、Review、quality-gate 和实现审批入口 |
| `submit-verification` | full 证据、验证 Skill、安全/UI Review 和验收入口 |
| `archive` | 最终校验并提升基线 |
| `reopen` | 回到最早受影响阶段 |
| `state` / `context` | 读取状态/生成上下文 |
| `visualize` | 输出阶段图和最近 trace |
| `trace-skill` / `trace-agent` | 记录 Skill/Reviewer 生命周期 |
| `record-usage` / `import-session-usage` | 记录 Token/API 使用 |
| `set-usage-budget` | 更新或清除当前 change 的用量预算，并刷新 usage 报告 |
| `evaluate-quality` | 结构化语义评测 |
| `recover` | 恢复已确认的未完成事务 |
| `gc-transactions` | 清理旧的 committed/rolled-back 事务备份；默认保留最近 50 个，可用 `retain` 调整 |

Workflow 请求一般需要 `project`、`changeId`、当前 `expectedVersion`；初始化只要求路径。

## 3. Quality action

| Action | 作用 |
| --- | --- |
| `doctor` | 配置、上下文、Token、Agent、依赖、CI 诊断 |
| `snapshot` | 生成 Git/上下文/工作区指纹 |
| `frontend-verify` / `local-verify` / `engineering-verify` | 运行验证 profile；`local-verify` 是旧别名 |
| `quality-gate` | 写入 AI Review 报告 |
| `pre-commit-check` | 提交前验证 |
| `pre-pr-check` | PR 前验证 + provenance |
| `commit` | 受控提交；需要授权和消息 |
| `ai-provenance` | 记录 AI 生成标记、session 和摘要 |
| `session-summary` | 预写会话摘要 |
| `session-close` | 会话审计/上下文经验写入 |
| `ci` | `prepare`/`publish`/`status` |

## 4. Discovery action

| Action | 作用 |
| --- | --- |
| `context` | 只读源码清单、基线、发现指令和 contextHash |
| `capture` | 校验 evidence 并写入基线/发现报告；可 preview |
| `recover` | 恢复 discovery 中断事务 |

## 5. 关键路径

| 路径 | 说明 |
| --- | --- |
| `docs/prd/<changeId>.md` | PRD |
| `planning/changes/<changeId>/proposal.md` | Spec 提案 |
| `planning/changes/<changeId>/specs/<capability>/spec.md` | delta Spec |
| `planning/changes/<changeId>/technical-design.md` | 技术设计 |
| `planning/changes/<changeId>/tasks.md` | 任务 |
| `planning/specs/<capability>/spec.md` | 基线/发现 Spec |
| `planning/workflows/<changeId>.json` | 工作流状态 |
| `planning/archive/<changeId>/` | 归档 |
| `.workflow/traces/<changeId>.jsonl` | 按 change 分片的操作、Skill、Reviewer、评测、usage |
| `.workflow/traces.jsonl` | 兼容旧读者的 append-only 聚合轨迹 |
| `.workflow/transactions/<uuid>/before/` | 事务备份 |
| `.workflow/pending.json` | 未完成事务 |
| `reports/engineering-verify-<profile>.json` | schema 3 验证报告 |
| `reports/frontend-verify-<profile>.json` | 旧版前端验证报告 |
| `reports/quality-gate.json` | AI Review |
| `reports/evidence/<profile>/<reportId>/<checkId>.json` | 自动生成检查 artifact |
| `reports/semantic-quality/<changeId>/<stage>.json` | 语义评测 |
| `reports/usage/<changeId>.json` | Token/API 报告 |
| `reports/pr-body.md` | PR 预览正文 |
| `reports/ci.json` | CI 编排结果 |
| `logs/` | Hook、doctor、会话审计 |

## 6. 状态字段

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 当前固定 schema 5 |
| `changeId` | kebab-case change 标识 |
| `stage` | 当前阶段 |
| `status` | 工作流状态 |
| `pendingApproval` / `pendingReview` | 待审批类型和 hash |
| `approvals` | 历史审批、decision、confirmation、时间 |
| `ui` / `stack` | 分类，决定 UI/Review/验证要求 |
| `reviewerPolicy.allowMainAgentFallback` | 是否允许主代理 fallback |
| `evidencePolicy.mode` | `strict` 或 `manual`，strict 会单调锁存 |
| `taskEvidence` | 每个任务的代码级证据 |
| `implementationReview` | 实现审批前的验证、Review、快照 |
| `verification` | full 验证、验收前证据 |
| `designCheck` | UI 约束和来源；source 为 `{path, role, type, sha256, bytes}`，内容变化会使设计审批 stale |
| `mainSessionId` | 主会话标识（可选） |

## 7. 限制

- JSON/stdin 输入：8 MiB。
- 验证报告：8 MiB；check artifact：32 MiB。
- 工作流源码快照：50,000 文件、512 MiB。
- verification inputs：10,000 文件、256 MiB、目录深度 64、最多 10,000 目录。
- 质量策略扫描：最多 20,000 个策略目录条目；doctor/上下文也有各自上限。
- command：最多 128 个 args，单 arg 2,048 bytes，总 args 16 KiB，命令 256 bytes。
- timeout：1–600,000 ms。
- CI 读取不无限轮询；单次检查最多等待 10 分钟、间隔不超过 60 秒。

## 8. 固定约束

- Profile 名称：`commit`、`implementation`、`full`。
- 报告名：`engineering-verify-<profile>.json`。
- schema 3 UI：implementation 加 `browser`，full 加 `accessibility` 与 `keyboard`。
- full 所有项目必须包含 `security`。
- 严格报告和 artifact 必须位于 `reports/`，artifact 不得复用、不得等于报告自身。
- POSIX 和 Windows 原生可执行文件直接启动；Windows `.cmd`/`.bat` 经受控 `cmd.exe` 包装并拒绝 shell 元字符；不支持命令拼接。
- 归档流程不可重开或改写。
