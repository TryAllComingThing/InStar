# 使用说明

## 1. 开始前

- Node.js `>= 20.19.0`。
- 目标项目必须是独立 Git 仓库根目录，不能是插件安装目录。
- 目标项目自己维护依赖、质量工具和 `.instar-quality.json`。
- 需要 PR/CI 时准备 `gh` 登录态和目标仓库权限。

## 2. 三种典型入口

### 2.1 修改已有代码

用户明确授权实施后，按项目现有流程编码，完成后：

1. 配置或检查 `.instar-quality.json`。
2. 运行 `doctor`。
3. 运行 `snapshot` 取得 fingerprint。
4. 按 stack 使用 `engineering-verify` 或 `frontend-verify`。
5. 运行 `quality-gate` 并生成 review JSON。
6. 根据用户授权提交、准备 PR 或检查 CI。

小改动不需要强行创建 PRD/Spec；受控流程只用于需要跨阶段审批的变更。

### 2.2 新需求交付

```text
initialize-project
→ requirements-workflow
→ 按阶段调用 PRD/Spec/设计/任务/实现/验证 Skills
→ 每个审批边界等待真实用户确认
→ archive
```

具体阶段和门禁见 [WORKFLOW.md](WORKFLOW.md)。

### 2.3 从存量代码生成 Spec

```sh
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project --scope src/orders
```

阅读返回清单和指令，编写完整 Spec + evidence，先预览，再 capture。详见 [CONTEXT-AND-DISCOVERY.md](CONTEXT-AND-DISCOVERY.md)。

## 3. 人类友好 CLI

从发布包或源码 runtime 运行：

```sh
node <plugin>/bin/instar.mjs doctor --project /absolute/project
node <plugin>/bin/instar.mjs snapshot --project /absolute/project
node <plugin>/bin/instar.mjs verify --project /absolute/project --profile full
node <plugin>/bin/instar.mjs review --project /absolute/project --review-file ./review.json
node <plugin>/bin/instar.mjs ci prepare --project /absolute/project --title "feat: add search"
node <plugin>/bin/instar.mjs ci status --project /absolute/project
node <plugin>/bin/instar.mjs ci publish --project /absolute/project --title "feat: add search" --confirm
node <plugin>/bin/instar.mjs status --project /absolute/project --change add-search
```

参数规则：

- `--project` 可省略，默认当前目录。
- `verify` 快捷入口只接受 `--profile commit|full`；`implementation` 使用 JSON action。
- `review` 必须有 `--review-file`，文件可为 review 对象或 `{review: ...}`。
- `ci prepare/publish` 必须有 title；`publish` 必须有 `--confirm`。
- `ci` 的 phase 可用子命令 `prepare|publish|status` 或 `--phase`。
- 非法选项、缺失值或冲突参数直接报错，不静默忽略。

## 4. JSON CLI

所有控制器都可以接收 JSON 文件或 stdin：

```sh
node <plugin>/runtime/quality-controller/cli.mjs request.json
node <plugin>/runtime/quality-controller/cli.mjs -
node <plugin>/runtime/workflow-controller/cli.mjs request.json
node <plugin>/runtime/discovery-controller/cli.mjs request.json
```

成功输出 JSON；失败输出 JSON 错误并设置非零退出码。stdin/文件输入上限为 8 MiB。

## 5. 常用 JSON 示例

### 5.1 snapshot

```json
{"action":"snapshot","project":"/absolute/project"}
```

### 5.2 开始受控 change

```json
{
  "action": "start",
  "project": "/absolute/project",
  "changeId": "add-search",
  "ui": true,
  "stack": "frontend",
  "document": "# PRD\n..."
}
```

`start` 可传 `usageBudget:{maxTokens,maxApiCalls,enforce}`；超出且 `enforce:true` 时提交、批准和归档会被阻断。运行中用 `set-usage-budget` 调整或清空预算，`reject` 始终允许。

### 5.3 读取工作流上下文

```json
{
  "action": "context",
  "project": "/absolute/project",
  "changeId": "add-search"
}
```

### 5.4 运行质量 Review

```json
{
  "action": "quality-gate",
  "project": "/absolute/project",
  "review": {
    "schemaVersion": 2,
    "reviewer": "code-reviewer",
    "executionMode": "subagent",
    "fingerprint": "<snapshot fingerprint>",
    "checks": [],
    "findings": [],
    "unverified": []
  }
}
```

实际 checks 必须覆盖当前 `reviewItemsFor(config)`，并为适用项提供真实文件和行引用；空数组只用于说明形状，不是可提交的 Review。

## 6. 文档工作流调用节奏

1. `start` 后先读 `state`。
2. 生成/修改文档后传入当前 `contextHash` 和 `expectedVersion`。
3. 进入 `awaiting-approval` 后不要继续生成下游工件。
4. 用户明确批准后，用当前 `reviewHash` 调用 `approve`。
5. 用户要求修改时用 `request-changes`；历史批准可能因此失效。
6. 任何源码变化后检查 `implementationReview`/`verification` 是否 stale。

## 7. 质量配置与执行

最小 schema 3 配置：

```json
{
  "schemaVersion": 3,
  "baseRef": "main",
  "verification": {
    "profiles": {
      "commit": ["lint-check"],
      "implementation": ["lint-check", "format-check", "test-check"],
      "full": ["security-check"]
    }
  },
  "tools": {
    "checks": {
      "lint-check": {"kind": "lint", "command": "npm", "args": ["run", "lint"]},
      "format-check": {"kind": "format", "command": "npm", "args": ["run", "format:check"]},
      "test-check": {"kind": "test", "command": "npm", "args": ["test"]},
      "security-check": {"kind": "security", "command": "node", "args": ["scripts/security-check.mjs"]}
    }
  }
}
```

UI 项目还需在 `implementation` 加 `browser`，在 `full` 加 `accessibility` 与 `keyboard`。实现审批前必须已有 `.instar-quality.json` 和当前 quality-gate 报告；不要重复完全相同的 browser 命令。

## 8. Reviewer 使用

- 受控实现审批前：`architect` + `code-reviewer`。
- 受控验证前：`security-reviewer`；frontend/fullstack UI 加 `frontend-reviewer`；UI 加 `ui-reviewer`。
- Spec 提交前：`spec-reviewer`。
- 所有 Reviewer 用 `trace-agent` 记录真实 `reviewedFiles`、findings、unverified 和 source snapshot。
- Reviewer 只读，不编辑、不批准；主代理负责记录并回应 findings。

## 9. 状态与日志

```sh
node <plugin>/bin/instar.mjs status --project . --json
```

查看：

- 当前 stage/status/version；
- pending approval；
- 已批准阶段；
- 最近 trace。

需要详细证据时读 `.workflow/traces/<changeId>.jsonl`、`.workflow/traces.jsonl` 兼容聚合文件、`reports/` 和 `logs/`。不要修改 `workflow.json` 来“修复”状态；使用 reopen、recover 或重新执行正常动作。

## 10. 常见操作边界

- 不把插件安装目录当项目根目录。
- 不直接写 PRD/Spec/设计/任务绕过控制器。
- 不把 `quality-gate` 报告当人工批准。
- 不把 smoke 当 axe，不把 axe 当键盘/焦点测试。
- 不把本地 Hook 当远端 CI。
- 不把 JSON 确认字段当身份认证。
