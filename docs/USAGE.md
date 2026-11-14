# 使用说明

## 1. 开始前

- Node.js `>= 20.19.0`。
- 目标项目必须是显式绝对路径且不能是插件安装目录。InStar 不要求 Git；启动 change 时写入 `.instar/baselines/<changeId>.json`，之后直接扫描工作区并按路径/内容哈希比较。`.instarignore` 控制排除项；baseline 缺失时 fail-closed。
- 目标项目自己维护依赖、质量工具和 `.instar-quality.json`。

## 2. 四类典型入口

### 2.1 文档、文案或测试微变更

仅修改文档、非可执行文案或测试时，可使用 `micro-change`：不生成 PRD、Spec、Design、Tasks 或 change brief；启动后直接实现，提交时复检 baseline 与当前工作区变化，最终只做一次人工验收。

```sh
node <plugin>/bin/instar.mjs micro
```

控制器只接受文档、`i18n`/`locales`/`copy` 下的非可执行文案和测试路径；实际变化路径不得超过 20 个文件，changedLines 保守估算不得超过 800 行。出现生产代码、配置、UI、认证、授权、数据、API、架构、依赖或基础设施时直接拒绝。

### 2.2 修改已有代码

低风险小功能可使用 `quick-change`：只写一页 change brief，brief 批准后开始实现，提交后人工验收。使用前必须确认不涉及 UI、认证、授权、数据、API、架构、依赖或基础设施，且实际工作区变化不超过 10 个文件、400 行。控制器会重新比较 baseline；不满足条件时拒绝并要求升级到 `requirements-workflow`。

```sh
node <plugin>/bin/instar.mjs quick
```

其他已有代码小改：

用户明确授权实施后，按项目现有流程编码，完成后：

1. 配置或检查 `.instar-quality.json`。
2. 运行 `doctor`。
3. 运行 `snapshot` 取得 fingerprint。
4. 按 stack 使用 `engineering-verify` 或 `frontend-verify`。
5. 运行 `quality-gate` 并生成 review JSON。
6. 根据用户授权提交。

小改动不需要强行创建 PRD/Spec；受控流程只用于需要跨阶段审批的变更。

### 2.3 新需求交付

```text
initialize-project
→ requirements-workflow
→ 按阶段调用 PRD/Spec/设计/任务/实现/验证 Skills
→ 每个审批边界等待真实用户确认
→ archive
```

具体阶段和门禁见 [WORKFLOW.md](WORKFLOW.md)。

### 2.4 从存量代码生成 Spec

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
node <plugin>/bin/instar.mjs verify --project /absolute/project --layer L1 --files src/login.ts,src/workbench.ts
node <plugin>/bin/instar.mjs verify --project /absolute/project --layer L2
node <plugin>/bin/instar.mjs verify --project /absolute/project --layer L3
node <plugin>/bin/instar.mjs review --project /absolute/project --review-file ./review.json
node <plugin>/bin/instar.mjs status --project /absolute/project --change add-search
node <plugin>/bin/instar.mjs quick
node <plugin>/bin/instar.mjs micro
```

参数规则：

- `--project` 可省略，默认当前目录。
- `verify` 接受 `--profile preflight|implementation|full`，以及 `--layer L1|L2|L3`；`commit` 是 deprecated 兼容别名，会被规范化为 `preflight`。`--files` 用于传入受影响文件；`--no-cache` 强制 L1/L2 重新执行。L3 始终是 full 且永不使用中间缓存。
- `review` 必须有 `--review-file`，文件可为 review 对象或 `{review: ...}`。
- 非法选项、缺失值或冲突参数直接报错，不静默忽略。

## 4. JSON CLI

所有控制器都可以接收 JSON 文件或 stdin：

```sh
node <plugin>/runtime/quality-controller/cli.mjs request.json
node <plugin>/runtime/quality-controller/cli.mjs -
node <plugin>/runtime/workflow-controller/cli.mjs request.json
node <plugin>/runtime/quick-controller/cli.mjs request.json
node <plugin>/runtime/micro-controller/cli.mjs request.json
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

`start` 可传 `usageBudget:{maxBillableTokens,maxApiCalls,enforce}`；省略时默认 `{maxBillableTokens:6000000,maxApiCalls:1200,enforce:true}`。计费口径为 `inputTokens - cachedInputTokens + outputTokens`，`totalTokens` 只表示上下文处理量。超出且 `enforce:true` 时，Skill/Reviewer trace、质量验证、提交、批准和归档会在执行前被阻断。调整预算、关闭强制或清除预算必须使用 `set-usage-budget` 并提供 `reason` 与 `authorization`；只有显式传 `usageBudget:null` 才清除预算。`reject` 始终允许。

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
6. `state`/`visualize` 显示 `evidenceFreshness`；源码变化后用 `refresh-evidence`，不要 `reopen design/tasks`。

## 7. 质量配置与执行

最小 schema 3 配置：

```json
{
  "schemaVersion": 3,
  "verification": {
    "profiles": {
      "preflight": ["lint-check"],
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

UI 检查可在 `verification.runtime` 配置一个共享 preview 服务。控制器为每次 profile 分配随机回环端口，只启动一次，并把 `INSTAR_BASE_URL`、`PLAYWRIGHT_BASE_URL`、`A11Y_BASE_URL`、`KEYBOARD_BASE_URL` 注入 browser/accessibility/keyboard 检查：

```json
{
  "verification": {
    "runtime": {
      "command": "npm",
      "args": ["run", "preview", "--", "--host", "127.0.0.1", "--port", "{port}"],
      "readyUrl": "http://127.0.0.1:{port}/",
      "timeoutMs": 30000
    }
  }
}
```

不要在这些检查中再次 build，也不要在 Playwright `webServer` 中重复执行 build；使用已生成的 build/preview。固定 `4173` 端口和复用未校验的旧服务会造成错误证据。

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

需要详细证据时读 `.workflow/traces/<changeId>.jsonl`、`reports/` 和 `logs/`。旧版本的 `.workflow/traces.jsonl` 仍可读取，但新写入只进入按 change 分片的 trace。不要修改 `workflow.json` 来“修复”状态；使用 reopen、recover 或重新执行正常动作。

## 10. 常见操作边界

- 不把插件安装目录当项目根目录。
- 不直接写 PRD/Spec/设计/任务绕过控制器。
- 不把 `quality-gate` 报告当人工批准。
- 不把 smoke 当 axe，不把 axe 当键盘/焦点测试。
- 不把本地报告或 `SessionEnd` Hook 当远端 CI；InStar 不执行 Git 提交、PR 或 CI。
- 不把 JSON 确认字段当身份认证。
