# 参考速查

## 1. Skill 清单

```text
context-optimizer
design-check
engineering-implement
engineering-research
engineering-verify
extract-design-md
frontend-implement
frontend-verify
initialize-project
micro-change
quality-evaluation
quality-gate
quick-change
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
| `start` | 创建 change；需要 `ui`、`stack`、PRD 文档；可传 `risk:{tier,impact,reason}` 与 `usageBudget`（省略时默认 6M billable tokens/1200 calls 且强制） |
| `set-risk` | 在 implementation 前按 impact 重新分级并记录原因；高风险 impact 自动升级 governed |
| `request-clarification` / `answer-clarification` | PRD 阶段阻塞式澄清 |
| `migrate` | 升级 schema 5 到 schema 6；需要 `ui` 与 `stack`，保留正文未变的旧审批 |
| `save-prd` / `submit-prd` | 保存/提交 PRD 审批 |
| `approve` | 用当前 hash 执行 `accept-record`/`accept-no-record`/`reject` |
| `request-changes` | 在待审批状态反馈修改 |
| `create-spec` / `save-spec` | 创建/修订 proposal 与 delta specs |
| `submit-spec` | Spec gate + 强制 spec-reviewer + 人工审批入口 |
| `write-design` / `write-tasks` | 写入设计/任务；需要当前 contextHash |
| `complete-task` | 最后一个任务或旧 schema 的兼容入口；schema 6 仍有多任务时必须用 `complete-tasks` |
| `complete-tasks` | 一次事务批量登记任务证据；任一项失败则整批回滚 |
| `submit-implementation` | 实现证据、Review、quality-gate 和实现审批入口 |
| `submit-verification` | full 证据、验证 Skill、安全/UI Review 和验收入口 |
| `archive` | 最终校验并提升基线 |
| `refresh-evidence` | schema 6：保留文档审批与任务证据，只失效实现/验证/验收证据 |
| `quick` | 低风险小功能快车道；一页 brief、两次人工决定；baseline 工作区变化自动升级 |
| `micro` | 文档/文案/测试微变更；无 brief、一次最终验收；start/submit 自动复检 baseline 与工作区变化 |
| `reopen` | 回到最早受影响阶段 |
| `state` / `context` | 读取状态/生成上下文 |
| `visualize` | 输出阶段图和最近 trace |
| `trace-skill` / `trace-agent` | 记录 Skill/Reviewer 生命周期 |
| `record-usage` / `import-session-usage` | 记录 Token/API 使用 |
| `set-usage-budget` | 更新当前 change 的用量预算；只有显式传 `null` 才清除。放宽、关闭强制或清除必须提供 `reason` 与 `authorization`，并刷新 usage 报告 |
| `evaluate-quality` | 结构化语义评测 |
| `recover` | 恢复已确认的未完成事务 |
| `gc-transactions` | 清理旧的 committed/rolled-back 事务备份；默认保留最近 50 个，可用 `retain` 调整 |

Workflow 请求一般需要 `project`、`changeId`、当前 `expectedVersion`；初始化只要求路径。

### 2.1 轻量路径

| 路径 | 适用 | 人工决定 | 默认上限 | 入口 |
| --- | --- | --- | --- | --- |
| `micro` | 文档、非可执行文案、测试；无生产代码、配置、依赖或基础设施影响 | 最终验收 1 次 | 20 文件 / 800 行 | `node <plugin>/bin/instar.mjs micro -` |
| `quick` | 已有代码中的低风险小功能；不涉及 UI、认证、授权、安全、数据、API 契约、架构、依赖或基础设施 | brief 批准 + 最终验收 | 10 文件 / 400 行 | `node <plugin>/bin/instar.mjs quick -` |

两者都以启动时的工作区 inventory baseline 与当前扫描结果为准，可在开始前用 `classify` 做只读预检。InStar 不调用 Git，`.instarignore` 控制排除项；changedLines 是保守估算，不是精确行 diff。`micro` 不生成 brief、PRD、Spec、Design 或 Tasks；`quick` 只生成 `planning/quick/<changeId>/change-brief.md`。范围、风险或行数超限时控制器拒绝并要求升级到 `requirements-workflow`，不能靠人工声明降级。

UI 变更的 `write-design` 额外要求 `designCheck:{constraints,coverage,sources}`，以及 `designReuse` 中至少一个 `component`/`pattern` 条目或 `designReuseReason`。复用文件内容与理由进入设计与任务审批哈希。

## 3. Quality action

| Action | 作用 |
| --- | --- |
| `doctor` | 配置、上下文、Token、Agent 和依赖诊断 |
| `snapshot` | 生成工作区源码清单指纹 |
| `frontend-verify` / `local-verify` / `engineering-verify` | 运行验证 profile，或传 `layer:L1|L2|L3` 与 `files`；L3 永不使用缓存 |
| `quality-gate` | 写入 AI Review 报告 |
| `session-summary` | 预写会话摘要 |
| `session-close` | 会话审计/上下文经验写入 |

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
| `planning/quick/<changeId>/change-brief.md` | quick 路径的一页变更说明 |
| `planning/archive/<changeId>/` | 归档 |
| `.workflow/quick/<changeId>.json` | quick 路径状态 |
| `.workflow/micro/<changeId>.json` | micro 路径状态 |
| `.workflow/traces/<changeId>.jsonl` | 按 change 分片的操作、Skill、Reviewer、评测、usage |
| `.workflow/traces.jsonl` | 旧版本兼容读取；新写入只进入按 change 分片的 trace |
| `.workflow/transactions/<uuid>/before/` | 事务备份 |
| `.workflow/pending.json` | 未完成事务 |
| `.instar/baselines/<changeId>.json` | change 启动时的源码清单 baseline；内容自哈希并由 change state 交叉绑定 |
| `.instarignore` | 工作区清单排除规则 |
| `reports/engineering-verify-<profile>.json` | schema 3 验证报告 |
| `reports/engineering-verify-L1.json` / `L2` | 分层中间证据报告 |
| `reports/cache/L1|L2/<key>.json` | 通过完整依赖键绑定的中间检查缓存 |
| `reports/frontend-verify-<profile>.json` | 旧版前端验证报告 |
| `reports/quality-gate.json` | AI Review |
| `reports/evidence/<profile>/<reportId>/<checkId>.json` | 自动生成检查 artifact |
| `reports/semantic-quality/<changeId>/<stage>.json` | 语义评测 |
| `reports/usage/<changeId>.json` | Token/API 报告 |
| `logs/` | Hook、doctor、会话审计 |

## 6. 状态字段

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 新工作流为 6；schema 5 继续兼容并可显式迁移 |
| `changeId` | kebab-case change 标识 |
| `stage` | 当前阶段 |
| `status` | 工作流状态 |
| `pendingApproval` / `pendingReview` | 待审批类型和 hash |
| `approvals` | 历史审批、decision、confirmation、时间 |
| `ui` / `stack` | 分类，决定 UI/Review/验证要求 |
| `risk` | `lean|standard|governed` 分级、impact、原因和 L1/L2/L3 计划；governed 要求 security 证据 |
| `verificationPlan` | `state`/`visualize` 派生输出：当前风险的层序列、是否要求 security、缓存与 L3 不缓存策略 |
| `reviewerPolicy.allowMainAgentFallback` | 是否允许主代理 fallback |
| `evidencePolicy.mode` | `strict` 或 `manual`，strict 会单调锁存 |
| `taskEvidence` | 每个任务的代码级证据 |
| `implementationReview` | 实现审批前的验证、Review、快照 |
| `verification` | full 验证、验收前证据 |
| `designCheck` | UI 约束和来源；source 为 `{path, role, type, sha256, bytes}`，内容变化会使设计审批 stale |
| `mainSessionId` | 主会话标识（可选） |
| `usageBudget` | Token/API 预算；新工作流默认强制 6M billable tokens/1200 calls。billable = input - cached input + output |
| `reviewerPolicy.maxRoundsPerRoleStage` | 同一评审目标每角色最多完成轮次，默认 3 |
| `evidenceFreshness` | `state`/`visualize` 输出的证据新鲜度，不写入 workflow |

## 7. 限制

- JSON/stdin 输入：8 MiB。
- 验证报告：8 MiB；check artifact：32 MiB。
- 工作流源码快照：50,000 文件、512 MiB。
- verification inputs：10,000 文件、256 MiB、目录深度 64、最多 10,000 目录。
- 质量策略扫描：最多 20,000 个策略目录条目；doctor/上下文也有各自上限。
- 工作区源码清单：默认最多 10,000 个目录、单目录 10,000 个条目、深度 64。
- command：最多 128 个 args，单 arg 2,048 bytes，总 args 16 KiB，命令 256 bytes。
- timeout：1–600,000 ms。

## 8. 固定约束

- Profile 规范名称：`preflight`、`implementation`、`full`；`preflight` 是显式本地预检，不执行 Git。`commit` 是 deprecated 兼容别名，旧配置和旧报告仍可读取。
- 验证层：`L1` changed-unit、`L2` task-unit、`L3` frozen-full；L1/L2 可缓存，L3 永不缓存。
- 新报告名：`engineering-verify-<profile>.json`；新的预检报告为 `engineering-verify-preflight.json`，旧 `engineering-verify-commit.json` 可兼容读取。
- schema 3 UI：implementation 加 `browser`，full 加 `accessibility` 与 `keyboard`。
- full 所有项目必须包含 `security`。
- 严格报告和 artifact 必须位于 `reports/`，artifact 不得复用、不得等于报告自身。
- POSIX 和 Windows 原生可执行文件直接启动；Windows `.cmd`/`.bat` 经受控 `cmd.exe` 包装并拒绝 shell 元字符；不支持命令拼接。
- 归档流程不可重开或改写。
