# 评测、轨迹与遥测

## 1. 目的

InStar 区分三类记录：

1. **工作流状态**：权威阶段、审批和 transition；
2. **代理自报轨迹**：Skill/Reviewer 开始、完成、失败；
3. **可测量遥测**：Token/API、耗时和阶段归因。

这些记录的共同目标是可观察性和复核，不是构建不可伪造的身份审计系统。

## 2. Skill 调用轨迹

`trace-skill` 要求：

- 一个已存在的 Skill 路径（必须在插件 `skills/` 下）；
- 同一 `invocationId` 先 `started`，再恰好一次 `completed` 或 `failed`；
- `stage` 属于 `prd|spec|design|tasks|implementation|verification|acceptance`；
- 简短、无秘密的 `summary`；
- 可选 outcome 有长度限制并会脱敏。

示例：

```json
{
  "action": "trace-skill",
  "project": "/absolute/project",
  "changeId": "add-search",
  "skill": "spec-explore",
  "event": "started",
  "invocationId": "add-search-spec-explore-1",
  "stage": "spec",
  "summary": "Inspecting architecture and affected modules"
}
```

完成事件：

```json
{
  "action": "trace-skill",
  "project": "/absolute/project",
  "changeId": "add-search",
  "skill": "spec-explore",
  "event": "completed",
  "invocationId": "add-search-spec-explore-1",
  "stage": "spec",
  "summary": "Exploration finished"
}
```

轨迹按 change 写入 `.workflow/traces/<changeId>.jsonl`，并继续追加到 `.workflow/traces.jsonl` 兼容聚合文件。它是代理自报的，不是模型执行证明；本地维护者可以修改它。

## 3. Reviewer 轨迹

`trace-agent` 要求：

- 角色属于 `architect|code-reviewer|security-reviewer|ui-reviewer|frontend-reviewer|spec-reviewer`；
- 同一 invocation 的生命周期规则；
- `executionMode` 为 `subagent` 或 `main-agent-fallback`；
- subagent 必须有独立的 `reviewerSessionId`，fallback 必须有 `fallbackReason`；
- completed 事件必须有真实 `reviewedFiles`、`findings`、`unverified`、报告文件及其哈希；
- findings 严重级别为 `critical|warning|suggestion`，带路径时必须引用真实普通文件；
- source snapshot 与最终源码一致。

Reviewer 报告只在报告文件未变化且 source snapshot 匹配时有效。Schema 5 默认禁止 main-agent fallback；只有 `start` 时显式设置 `allowMainAgentFallback: true` 才允许，并必须如实标记。

## 4. 语义质量评测

`quality-evaluation` 对 PRD、Spec、技术设计和任务列表进行结构化评估。控制器要求完整 rubric、逐项原因和**原文中真实存在的证据摘录**，并计算结果：

```text
PASS = 1
WARN = 0.5
BLOCK = 0
NA = 不计入分母
```

报告写入：

```text
reports/semantic-quality/<changeId>/<stage>.json
```

### 4.1 Rubric

| Stage | Criterion IDs |
| --- | --- |
| PRD | `problem-outcome`, `scope-boundaries`, `user-journey-states`, `measurable-acceptance`, `risks-dependencies` |
| Spec | `prd-traceability`, `normative-requirements`, `behavior-scenarios`, `baseline-delta`, `architecture-impact` |
| Design | `constraints-and-sources`, `decisions-and-tradeoffs`, `architecture-and-dataflow`, `interfaces-and-state`, `file-plan-and-risks` |
| Tasks | `spec-design-traceability`, `dependency-order`, `task-sized-delivery`, `task-acceptance-evidence`, `verification-coverage` |

### 4.2 判定边界

- `PASS` / `WARN` / `BLOCK` 必须有证据摘录；`NA` 必须说明原因。
- PRD 关注问题、用户结果、范围、旅程、可测验收和风险。
- Spec 关注 PRD 追踪、规范性、场景、ADDED/MODIFIED/REMOVED 基线差异和架构影响。
- Design 关注规则来源、决策/替代方案、模块/数据流、接口/状态和文件计划/风险。
- Tasks 关注 Spec/设计追踪、依赖顺序、任务粒度、验收证据和验证覆盖。

评测报告是辅助信号，不改变 workflow stage，不代替人工审批。任何文档修改都会改变指纹；必须对最新版本重新评测。

## 5. Token/API 遥测

`record-usage` 接受：

```json
{
  "action": "record-usage",
  "project": "/absolute/project",
  "changeId": "add-search",
  "stage": "verification",
  "skill": "engineering-verify",
  "source": "codex-session",
  "apiCalls": 3,
  "usage": {
    "inputTokens": 1200,
    "cachedInputTokens": 300,
    "outputTokens": 450,
    "reasoningOutputTokens": 100,
    "totalTokens": 1650
  }
}
```

要求：

- 数值必须是非负整数；
- `cachedInputTokens` 不超过 input，reasoning output 不超过 output；
- 至少有一项非零；
- 可归因 `stage`、`skill` 或 `agent`；
- 报告写入 `reports/usage/<changeId>.json`，包含 `records`、totals、`byStage`、`bySkill`、`byAgent`。
- `start` 可配置 `usageBudget: {maxTokens?, maxApiCalls?, enforce?}`；报告增加 `budget.status=within|exceeded`。默认只告警；`enforce: true` 时超限会阻断下一次受控转换，可用 `set-usage-budget` 调整或清除。

SessionEnd Hook 会从 Codex session JSONL 查找 `token_usage_record`，按 response id 去重并归一化到 session usage。找不到会话或没有 usage 记录时返回 SKIPPED，绝不估算历史值。Token/API usage 与设计 Token 完全无关，后者是 UI 设计变量。

## 6. 工作流轨迹与状态的关系

- `workflow.json`：权威状态、版本、审批、待审批和当前阶段。
- `.workflow/traces/<changeId>.jsonl`：按 change 分片的操作、Skill、Reviewer、评测和 usage 事件。
- `.workflow/traces.jsonl`：兼容旧读取方的 append-only 聚合轨迹。
- `reports/`：可复核报告和 artifact。
- `logs/`：会话审计、doctor 日志、Hook 摘要。

本地文件可被拥有者编辑，因此这些记录不是密码学证明。需要强共享门禁时，应使用远端 CI、分支保护、制品存储和组织的身份/审计系统。

## 7. 评测与遥测的失败策略

- 缺少 rubric 或证据：拒绝写入评测报告。
- 证据摘录不在当前文档：拒绝。
- Reviewer/Skill 生命周期不完整：拒绝 trace。
- Session usage 找不到：报告不可恢复，不编造。
- 写报告失败：质量控制器尽量写 BLOCK，避免旧 PASS 留在最新位置。
