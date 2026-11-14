# 调试与故障处理

## 1. 先分层定位

```text
安装/发现 → 项目初始化 → 上下文/配置 → workflow 状态
→ 质量命令 → 证据/报告 → Hook/外部门禁 → 业务实现
```

不要一开始就重跑全部命令。先确认失败发生在哪一层，并保存原始错误。

## 2. 基础诊断

```sh
node <plugin>/bin/instar.mjs doctor --project /absolute/project
node <plugin>/bin/instar.mjs snapshot --project /absolute/project
node <plugin>/bin/instar.mjs status --project /absolute/project --json
```

读取：

- `reports/doctor.json`；
- `logs/doctor-*.md`；
- `planning/workflows/<changeId>.json`；
- `.workflow/traces/<changeId>.jsonl`（旧版本的 `.workflow/traces.jsonl` 仍可用于兼容读取）；
- 最新 `reports/` 和失败命令输出。

如果 `status` 没有 active workflow，显式传 `--change <changeId>`。

## 3. 常见状态错误

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `Stale expectedVersion` | 读取后状态已被修改 | 重新读 `state`/`context`，用新版本重试 |
| `Generation context changed` | 源、规范、Token 或基线变化 | 重新读取 context，重新生成当前工件 |
| `approval missing or stale` | 审批不是当前内容 | 重新展示当前版本并取得新审批 |
| `Source changed after implementation approval` | 实现审批后源码变了 | reopen implementation，重新实现/验证/审批 |
| `Full verification report predates implementation approval` | full 报告时序错误 | 实现审批后重新运行 full |
| `Strict verification ... stale` | 报告快照/配置/检查定义已变 | 重新运行对应 profile |
| `artifact changed after evidence was recorded` | artifact 被替换 | 重新生成完整证据，不能只修文件 |
| `Review checklist incomplete` | quality-gate 缺适用检查 | 按 reviewItemsFor 补足并重新评审 |

## 4. 事务与锁

### 4.1 工作流锁

```text
.workflow/controller.lock
planning/.lock        # 文档引擎
logs/.quality.lock    # 质量操作
```

处理顺序：

1. 读取锁文件中的 PID、时间、action 和随机 token；workflow 锁记录 `workflow`，quality 锁记录具体 action。释放锁时控制器会核对 token，不会删除已被替换的新持有者锁。
2. 用 `ps -p <pid>` 确认进程是否仍活着。
3. 只有确认进程不存在、且没有并发操作时，才考虑清理 stale lock。
4. 不要把清理锁当成修复数据；先检查 pending transaction 和文件状态。

### 4.2 中断事务

```sh
cat /absolute/project/.workflow/pending.json
```

检查 `id`、`backup`、`present` 和实际 `planning/`、`docs/prd/`。保留外部编辑，再执行 workflow recovery：

```json
{
  "action": "recover",
  "project": "/absolute/project",
  "changeId": "add-search",
  "transactionId": "<pending id>",
  "reason": "Controller interrupted; verified backup and current files"
}
```

Discovery 恢复使用 discovery controller，不需要 changeId：

```json
{
  "action": "recover",
  "project": "/absolute/project",
  "transactionId": "<pending id>",
  "reason": "Discovery interrupted; verified backup and current files"
}
```

恢复会用快照替换 `planning/` 和 `docs/prd/`，因此先保护快照之后的外部修改。控制器不承诺断电持久性或跨文件系统原子性。

成功事务会自动把 committed/rolled-back 备份收敛到最近 50 个；需要显式清理时调用：

```json
{
  "action": "gc-transactions",
  "project": "/absolute/project",
  "retain": 20
}
```

存在 `.workflow/pending.json` 时拒绝清理，避免删除待恢复快照。没有 `result.json` 的事务目录会保留，供人工排查。

## 5. 质量命令失败

1. 确认 `.instar-quality.json` 是有效 JSON，`schemaVersion`、profile 和检查定义正确。
2. `doctor` 检查配置/工具存在性，并会运行已配置的 optional adapters；它不等于已经运行 verification profile 的全部命令。
3. 在受控终端手工运行失败的原始命令，检查退出码、超时和依赖。控制器超时会终止整个进程组；若后台进程仍存活，按报告中的 PID/进程树人工检查。出现 `EPATHCHANGED` 表示受控文件路径在打开期间被替换；停止并检查父目录、符号链接和并发进程，不要在未确认前重试或清理。
4. 检查 profile 是否包含必需 kind（implementation：lint/format/test；UI 加 browser；full：build/security；UI 加 accessibility 与 keyboard）。
5. 重新生成报告，不要修改旧 artifact 或伪造 PASS。
6. 若检查期间源码/worktree 改变，停止并发编辑并重跑。

如果报 `Quality operation already running`，检查 `logs/.quality.lock` 和 PID；不要盲目删除。

## 6. 提交时没有自动质量门禁

InStar 不注册 `PreToolUse`，也不执行 Git commit、分支、push、PR 或 CI 操作。准备提交前必须显式完成：

1. 运行与变更匹配的 `verify` profile（规范预检名为 `preflight`；`commit` 仅为兼容别名）；
2. 运行 `quality-gate` 并确保报告对应当前工作区快照；
3. 把提交、CODEOWNERS/Review、分支保护、required checks、远端审计、PR/MR 和 CI 交给外部 VCS/平台；
4. 源码在验证后变化时重新验证，不能复用旧报告；
5. 不要把本地报告或 `SessionEnd` Hook 当成远端仓库门禁的替代。

InStar 的本地证据不是远端门禁。项目验证命令本身是项目代码；环境变量过滤、命令 allowlist 和禁止 shell 都不构成 OS 沙箱。对不可信仓库必须使用 container、devcontainer、VM 或隔离 CI runner。PR、CODEOWNERS 和 Review 不能防止恶意验证命令访问宿主机，也不能替代沙箱。

## 7. 安装/插件发现问题

```sh
codex plugin marketplace list --json
codex plugin list --available --json
codex plugin list --json
```

检查：

- marketplace 路径是否为绝对路径且存在 `.agents/plugins/marketplace.json`；
- 名称是否为 `instar-local`，插件选择器是否为 `instar@instar-local`；
- 版本与 `release/plugins/instar/.codex-plugin/plugin.json` 是否一致；
- 项目是否受 Codex 信任，是否加载 `.codex/config.toml`；
- 是否需要隔离 `CODEX_HOME` 做安装对照测试。

## 8. 浏览器和可访问性

- `A11Y_ROUTES` 为空：模板会立即 BLOCK。
- 受保护路由跳转登录：设置 `A11Y_STORAGE_STATE` 或登录流程。
- 页面未稳定：设置 `A11Y_READY_SELECTOR`、超时并等待 DOM/双 rAF。
- axe `incomplete`：按模板视为 BLOCK；不能当成通过。
- axe 只覆盖自动扫描；键盘、焦点顺序和可见焦点仍需单独验证。
- 浏览器版本、axe 版本和路由扫描数应出现在报告中。

## 9. Token/API 遥测

- 找不到 Codex session 或 usage 记录：报告 SKIPPED/不可恢复，不估算。
- `cachedInputTokens > inputTokens` 或 reasoning > output：配置错误。
- 想看阶段归因：传 `stage`、`skill` 或 `agent`，并读 `reports/usage/<changeId>.json`。
- `budget.status=exceeded` 表示配置的 `usageBudget` 已超出；默认是成本告警，`enforce: true` 时会阻断转换。用 `set-usage-budget` 提高上限、关闭强制或清空预算后重试。
- 设计 Token 读取失败不是 usage 问题；检查 `context.tokens`、符号链接和文件存在性。

## 10. 调试后的最低验证

```sh
npm run check
node --test test/workflow.test.mjs test/quality.test.mjs
npm test
npm run release
npm run test:release
npm run test:host
```

业务修复后在目标项目另行运行项目自己的测试、验证 profile 和必要浏览器检查；插件测试不能证明目标产品正确。
