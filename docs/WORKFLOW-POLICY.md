# 工作流授权策略

## 1. 总原则

InStar 将操作分为只读、受控审计写入、业务修改和外部副作用四类。人工审批是改变需求、设计、实现和验收结论的边界；JSON 中的 authorization/confirmation 是审计输入，不是密码学身份证明。

## 2. 无需逐次确认的操作

- 读取项目上下文：`AGENTS.md`、架构/设计文档、`standards/`、Token、PRD/Spec、源码、测试、配置和已有报告。
- InStar 受控审计写入：`planning/`、`docs/prd/`、`reports/`、`logs/`、`.workflow/` 中的控制器产物。
- `trace-skill`、`trace-agent`、`record-usage`、`evaluate-quality` 等审计记录。
- 以 `preview` 方式生成只读预览。
- 通过 `status`/`visualize` 查看工作流状态。

读取项目上下文通常不需要确认；读取项目外部文件、联网或访问宿主敏感区域仍受宿主批准策略约束。

## 3. 需要明确授权的操作

- 修改业务源码、配置、锁文件或依赖。
- 删除业务文件、重置分支或执行可能破坏用户数据的命令。
- `git commit`、push、创建/更新 PR、依赖联网安装和生产部署。
- 修改项目级架构、设计、Token 或安全策略。
- 在工作流之外手工改写 planning、PRD 或审批状态。

初始化、受控文档写入和用户明确要求的验证属于已授权工作流范围，不应每一步重复询问。

## 4. 人工审批

受控 change 的阶段审批包括：

```text
PRD → Spec → technical design → task list → implementation readiness → acceptance
```

用户可回复：

- `accept-record`：接受并保留审批信息；
- `accept-no-record`：接受但不保留 confirmation 文本；
- `reject`：拒绝并要求反馈修改。

`approve` 必须显式传入其中一个 `decision`；缺失不能按默认通过处理。

批准只对当前显示且未变化的版本有效。内容、上下文或源码变化后必须重新生成/评审。AI 不能代用户批准；生成报告、Reviewer 结论和测试通过都不能替代人工确认。

## 5. Spec Reviewer

`submit-spec` 前必须有当前 proposal + delta specs 的 `spec-reviewer` completed trace，且：

- 覆盖 proposal 与 delta specs；
- 绑定当前内容哈希；
- 无 critical/warning findings 和 unverified 项；
- Spec 修改后重新评审。

Subagent 评审默认要求独立 reviewer session 和配置哈希；不可用时只有在 workflow 显式 `allowMainAgentFallback: true` 才可标记 `main-agent-fallback`。

## 6. 实现与验证边界

任务审批通过才授权实现。实现审批前必须完成：

- 对应实现 Skill；
- `implementation` profile 检查；
- `quality-gate`；
- `architect` + `code-reviewer` 评审。

实现审批后必须完成：

- 对应验证 Skill；
- `full` profile 检查（含 security；UI 含 accessibility 和 keyboard）；
- `security-reviewer`（frontend/fullstack UI 加 `frontend-reviewer`；UI 加 `ui-reviewer`）；
- 与当前源码快照一致的证据。

`full` 报告必须晚于实现审批；验证后源码变化会阻止归档。质量检查和 Reviewer 结果不等于最终验收。

## 7. 空项目

空项目的 `context.emptyProject` 为 true 时跳过架构/参考探索，但仍要求：

- `ui`/`stack` 分类；
- PRD/Spec 门禁；
- Spec Reviewer 和人工审批；
- 设计与任务审批；
- 实现/验证和人工验收。

不得凭空编造既有模块或源码引用。

## 8. 源码快照

控制器在实现审批和验证时计算有界源码树指纹，不每个任务都拍快照。规划和报告目录被排除；普通源码与配置被纳入。它用于阻止版本 A 的 PASS 被用于版本 B，但不证明测试实际执行或人工证据真实。

## 9. 浏览器验证

- 无头 Playwright 功能旅程：UI 实现的必需项。
- axe：UI full 的独立可访问性门禁；键盘/焦点由独立 `keyboard` artifact 证明。
- 有头 Chrome：可选人工视觉证据。
- smoke：快速反馈，不替代功能旅程或 axe。

同一源码快照下不重复完全相同的 browser 命令。`browser`、`accessibility` 和 `keyboard` 必须保留不同 artifact；fake JSON 或纯截图不通过语义校验。

## 10. Token/API 遥测

使用 `record-usage` 记录实测 token 与 API 调用；SessionEnd Hook 可导入 Codex session 的数值记录并归因到当前 change。历史未记录值必须标记不可恢复，禁止估算。Token/API usage 与设计 Token 是不同概念。

## 11. 失败与回退

- 锁冲突：先检查 PID 和持有者，不抢占或删除活跃锁。
- 事务中断：检查 `.workflow/pending.json`、transactionId、备份和实际文件；使用 recover，不手工猜测。
- 验证失败：保留实际失败证据；不能关闭检查、伪造 PASS 或把未配置的扫描写成通过。
- CI 失败：读取 job/step 链接并修复；不 force push、不绕过 required checks。
