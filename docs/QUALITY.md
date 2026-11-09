# 质量、证据与安全

## 1. 设计目标

InStar 的质量层解决三个问题：

1. 用统一的配置映射项目已有的 lint、format、test、build、security、browser、accessibility、keyboard 和 dependencies 检查。
2. 把检查结果、代码快照、配置和评审绑定成不可随意复用的证据。
3. 在提交、PR 和受控工作流审批前阻止 stale、缺失或未通过的证据。

它不实现扫描规则，也不保证一次 PASS 覆盖所有风险。项目必须自己安装工具、维护脚本和维护 `.instar-quality.json`。

## 2. `.instar-quality.json`

配置文件位于目标项目根目录，必须是 Git 仓库根目录。当前支持：

- `schemaVersion: 1/2`：旧版 npm 前端验证与 npm script 适配器。
- `schemaVersion: 3`：直接执行可配置命令，支持前后端和非 npm 技术栈。

schema 1/2 仍可读取和执行，但 `doctor` 会返回 `quality-config-version` WARN，因为它们不能提供 schema 3 的严格命令证据。应在下一个大版本移除兼容支持前迁移到 schema 3；迁移后重新生成验证报告，不能复用旧证据。

### 2.1 schema 3 示例

```json
{
  "schemaVersion": 3,
  "baseRef": "main",
  "verification": {
    "profiles": {
      "commit": ["lint-check", "format-check", "typecheck-check", "test-check"],
      "implementation": [
        "lint-check",
        "format-check",
        "typecheck-check",
        "test-check",
        "browser-check"
      ],
      "full": ["security-check", "a11y-check", "keyboard-check"]
    }
  },
  "tools": {
    "checks": {
      "lint-check": {"kind": "lint", "command": "npm", "args": ["run", "lint"]},
      "format-check": {"kind": "format", "command": "npm", "args": ["run", "format:check"]},
      "typecheck-check": {"kind": "typecheck", "command": "npm", "args": ["run", "typecheck"]},
      "test-check": {"kind": "test", "command": "npm", "args": ["test"]},
      "browser-check": {"kind": "browser", "command": "npm", "args": ["run", "test:browser"]},
      "security-check": {"kind": "security", "command": "node", "args": ["scripts/security-check.mjs"]},
      "a11y-check": {"kind": "accessibility", "command": "node", "args": ["scripts/a11y-check.mjs"]},
      "keyboard-check": {"kind": "keyboard", "command": "node", "args": ["scripts/keyboard-check.mjs"]}
    }
  },
  "review": {"framework": "vue", "language": "typescript"},
  "context": {
    "architecture": "docs/engineering/ARCHITECTURE.md",
    "design": "docs/design/DESIGN.md",
    "designSystem": "design-system/DESIGN.md",
    "tokens": ["src/styles/tokens.css"]
  }
}
```

示例中的 `typecheck-check` 是项目扩展检查；工作流最小必需集仍是 `lint`、`format`、`test`（UI 加 `browser`），见下表。

### 2.2 检查字段

每个 `tools.checks.<id>` 支持：

| 字段 | 要求 |
| --- | --- |
| `kind` | `lint`、`format`、`typecheck`、`test`、`build`、`security`、`browser`、`accessibility`、`keyboard`、`dependencies` |
| `command` | 工作区相对或 PATH 中已有命令；不接受 shell 拼接 |
| `args` | 字符串数组；总大小和单项大小有上限；不会持久化到报告 |
| `cwd` | 可选工作区相对目录 |
| `timeoutMs` | 1–600000 ms |
| `artifact` | 可选；必须是 `reports/` 下的工作区相对路径 |

POSIX 和 Windows 原生可执行文件使用直接 `spawn`；Windows 的 `.cmd`/`.bat`（包括 `npm` 等 shim）需要经 `cmd.exe` 启动，控制器会逐项加引号并拒绝包含 `"`、`%`、`!`、CR/LF/NUL 的命令或参数。这是受控启动，不表示支持管道、重定向、变量展开或命令拼接。环境变量中的常见 Token、密码、DSN、GitHub/AWS/云凭据和注入相关变量会被过滤，但这不是完整的安全隔离；运行不可信项目应使用宿主沙箱或容器。

可设置 `INSTAR_HOOK_ALLOWED_COMMANDS=npm,node` 对质量命令的可执行文件做 allowlist。设置后，未列出的可执行文件会返回 `BLOCK ECOMMANDNOTALLOWED`；按 basename 比较并忽略 Windows 的 `.exe`/`.cmd`/`.bat`/`.com` 后缀。还可设置 `INSTAR_HOOK_ALLOWED_CHECKS=lint,test,build`，只允许指定检查 ID 或 npm script；未列出的检查返回 `BLOCK ECHECKNOTALLOWED`。这些变量只能限制可执行文件和检查名，不能证明 npm script 或参数内容安全，也不能替代宿主沙箱与项目信任。

### 2.3 上下文与 CI 字段

- `context.architecture`、`context.design`：项目已有规范路径。
- `context.designSystem`：可选的项目设计系统 Markdown 清单（`DESIGN.md`、`README.md` 或 `index.md`）；未配置时按固定候选发现。已知 design-system 目录存在但没有清单时，只作为项目设计系统信号，不读取目录内容；此时 `doctor` 报 `WARN` 并提示配置 `context.designSystem` 或补充清单。
- `context.tokens`：字符串或字符串数组；缺失、目录、符号链接或越界路径会报错。
- `context.sessionState`、`context.lessons`：可选的 Markdown 会话/经验文件。
- `ci.repo`、`ci.host`、`ci.remote`、`ci.base`、`ci.allowedHosts`、`ci.requiredChecks`：PR 发布和检查所需。
- `qualityPolicy`：旧版可选强制检查覆盖与 waiver；`Q-07 evidence integrity` 不可豁免。

## 3. 三个固定 profile

命名固定为 `commit`、`implementation`、`full`，报告名固定：

```text
reports/engineering-verify-<profile>.json
```

工作流要求：

| Profile | 时序 | 必需 kind |
| --- | --- | --- |
| `implementation` | 实现审批前 | `lint`、`format`、`test`；UI 加 `browser` |
| `full` | 实现审批后、验收前 | `security`；UI 加 `accessibility`、`keyboard` |
| `commit` | 提交前 | 项目配置；工作流本身不要求验收 |

`full` 是扩展门，不是整个 implementation 的重复超集。同一源码和检查定义已覆盖的 browser 不必在 full 原样重复；新增发布构建、跨浏览器或不同旅程时可以新增检查。

## 4. 严格证据与 manual 证据

### 4.1 schema 3 strict

当项目存在 schema 3 配置并定义对应 profile 时：

- 必须有稳定的 PASS/PASS_WITH_WAIVERS 报告；
- `kind`、`profile`、报告 ID、时间戳必须匹配；
- `snapshot.fingerprint` 必须匹配当前源码/配置/上下文；
- `configHash`、`checkDefinitions` 必须匹配；
- 每个 profile check 必须有唯一 `reports/` artifact 和 64 位 SHA-256；
- 提交的 `checkId`、`kind`、`reportId`、`artifact` 必须与报告一致；
- artifact 重新哈希必须一致，不能复用或替换；
- 报告上限 8 MiB，artifact 上限 32 MiB。

UI artifact 还必须是可解析且语义有效的 JSON：`browser` 声明 `kind:"browser"`、`status:"PASS"`、`tool:"playwright"`、`headless:true` 和非空 journeys，且每个 journey 为 `status:"PASS"`；`accessibility` 声明 `kind:"accessibility"`、`tool:"playwright-axe"`、`routesScanned>=1`，violations/incomplete 为空，并包含至少同等数量的无违规 `results`；`keyboard` 声明 `kind:"keyboard"` 和非空 journey（含 route、非空 steps、expectedFocus、actualFocus），且 PASS 要求 `actualFocus===expectedFocus`。`{status:"passed"}`、自相矛盾的键盘 PASS 或只截图不算通过。

schema 3 strict 一旦被 workflow 接受，后续删除配置会阻断，防止降级规避。

### 4.2 schema 1/2 manual

旧版 npm 配置（schema 1/2）仍可用于 `frontend-verify` 命令，但受控工作流的严格证据不成立。此时检查必须显式标注：

```json
{
  "source": "manual",
  "manualReason": "external evidence checked by the human reviewer",
  "artifact": "reports/manual/test-result.json"
}
```

实现审批始终要求存在 `.instar-quality.json` 和当前快照的 `reports/quality-gate.json`；没有配置不会降级为“无需质量门”。schema 1/2 配置下的检查使用带原因的 manual 绑定。manual artifact 仍必须位于 `reports/`、是普通非空文件、每个检查唯一。manual 不表示工具未运行，只表示控制器没有 schema 3 报告可供强绑定；不能把它描述成自动化 PASS。strict 模式开始后删除或降级配置会阻断。

## 5. 验证执行语义

`engineering-verify`/`frontend-verify` 会：

1. 解析配置并检查 Git 根目录、baseRef、工作区、暂存区和上下文。
2. 生成 snapshot；配置中的 `verification.inputs` 可加入被 Git 忽略但影响检查的输入。
3. 按 profile 顺序运行检查；失败、超时或检查期间源码变化立即 BLOCK。超时会终止检查的整个进程组，不只终止直接子进程。
4. 为 schema 3 检查生成 `reports/evidence/<profile>/<reportId>/<checkId>.json`，或在项目指定 `artifact` 时使用项目路径。项目指定的 artifact 会在命令启动前删除，命令必须重新生成它，避免旧 PASS 文件被复用。
5. 保存报告；失败重跑会用 BLOCK 覆盖此前的 PASS，避免旧结果被误认为最新。

报告记录命令、退出码、耗时、输出哈希、快照和检查定义，不持久化完整输出和参数。Vite 旧流程可能复核 build manifest；依赖检查使用锁文件和已安装依赖。受控文件读写会对最终文件使用 no-follow 句柄，并比较打开前后的父目录 `dev/ino` 与打开文件身份；发现替换会以 `EPATHCHANGED` 失败，写入内容和重命名只在验证通过后继续。Node 没有跨平台 `openat` 接口，无法把目录解析与最后一次系统调用合并为不可分割操作；针对恶意并发目录替换的绝对保证仍需宿主沙箱或容器。

## 6. AI 质量 Review

`quality-gate` 的新评审使用 `schemaVersion: 2`，必须提供：

- `reviewer`；
- 当前 snapshot 的 `fingerprint`；
- `executionMode: subagent` 或 `main-agent-fallback`（fallback 还需原因）；
- 本次适用检查的完整 `checks`；
- 每项 `status`、`evidence` 和适用时的文件/行 `references`；
- findings 与 unverified 项。

通用检查：

```text
correctness, maintainability, architecture, security, performance,
naming, types, component-boundaries, design, accessibility
```

`review.framework: vue` 会追加 `watch-cleanup`、`v-for-key`、响应性解构、props、computed 纯度、卸载清理、异步组件、懒加载路由等专项；`review.language: python|java|go` 会追加 API 契约、输入验证、授权、错误处理、数据一致性、事务、并发、可观测性等后端专项。

Review 必须阅读实际变更与调用链；工具退出码不能替代审查。适用检查缺失、BLOCK、引用文件不存在或报告 stale 都会阻止门禁。Review 不是 architect/code-reviewer/security-reviewer/frontend-reviewer/ui-reviewer 的替代品。设计和 Review 证据应说明是否复用了已有组件、Token、布局和交互模式，以及偏离原因；控制器只能证明来源与指纹，不能替代这项判断。

## 7. 快照与证据指纹

质量快照至少组合：

- Git HEAD/base、索引、工作区和未跟踪源文件；
- `.instar-quality.json`、`package.json`；
- 实际读取的 `AGENTS.md`、架构/设计文档、Token 来源；
- 项目策略/标准指纹；
- 配置中的额外 verification inputs。

编排层再绑定：

```text
report id + report hash + config hash + check definition hash
+ artifact hash + source tree hash + review fingerprint
```

源码、上下文、配置或证据发生变化后，旧报告和审批不能复用。

## 8. 浏览器与可访问性

| 证据 | 作用 | 门禁 |
| --- | --- | --- |
| Headless Playwright 功能旅程 | 关键流程回归 | UI implementation 必需 |
| Playwright + axe-core | 自动化可访问性扫描 | UI full 必需 |
| 键盘/焦点旅程 | 可访问性人工或自动化补充 | 不能由 axe 自动替代 |
| Headed Chrome | 人工视觉/交互检查 | 可选 |
| Page-load smoke | 快速反馈 | 可选，不替代上两项 |

`templates/quality/a11y-check.mjs` 对空路由、导航异常、登录重定向和 axe `incomplete` 都 fail-closed；它只覆盖 axe。`templates/quality/keyboard-check.mjs` 按 route、按键步骤和预期焦点选择器生成独立的 keyboard artifact，焦点不匹配或缺少 Playwright 时失败。浏览器、可访问性与键盘 artifact 必须分开。同一 source snapshot、配置和检查定义已覆盖的 browser 旅程不应在 full 原样重跑；复用证据仍必须绑定当前快照，源码变化后自动失效。`doctor` 会以 WARN 报告 implementation 与 full 重复配置的 browser check。

## 9. 提交、PR 与 CI

- `pre-commit-check`：检查暂存一致性、commit profile、最新 quality-gate 和报告。
- `pre-pr-check`：要求 full gate、最新 Review、AI provenance 和当前快照。
- `commit`：要求功能分支、授权、消息、暂存一致；默认不推主分支；`force:true` 只能豁免本地验证失败，不能绕过 PR。
- `ci prepare`：不联网，生成可审阅的 PR 正文。
- `ci publish`：要求 `--confirm`、合法 repo/host/remote/base、允许 host、匹配的 review/provenance；推送功能分支并创建或复用 PR。
- `ci status`：只认精确 PR head/base；required check 缺失/重复/pending/失败分别为 BLOCK/PENDING/BLOCK；不无限轮询。

认证由 `gh`、Git 和分支保护负责；InStar 不保存凭据。required check 名称必须与真实 GitHub check 一致。

## 10. 证据信任边界

- `trace-skill`、`trace-agent`、Review 报告、usage 和 workflow 审批状态都是本地可审计记录；哈希证明内容与绑定关系一致，不证明执行者身份或审批人身份。
- `reviewerSessionId`、`executionMode`、Gateway/宿主日志能提高可追溯性，但仍可能由本地维护者修改。它们是流程证据，不是加密签名。
- 团队级门禁必须由远端 CI、分支保护、artifact 存储和组织身份/权限系统承担；本地 Hook 只做辅助阻断。
- 需要强保证时，应在 CI 对精确 commit SHA 重新运行检查，并验证远端 required check、 reviewer 身份和 artifact 来源。

## 11. Hook 边界

`hooks/hooks.json` 注册：

- `PreToolUse`（当前 1800 秒超时）：只在可识别的独立 `git commit` 或 `gh pr create` 前调用质量检查；复杂 shell、管道、`cd`、`git -C`、`--repo` 等组合会拒绝。检查会执行 `.instar-quality.json` 配置的项目命令，因此属于项目代码执行，不是 OS 沙箱。
- `SessionEnd`（当前 10 秒超时）：并发写会话审计和导入可用 Token/API usage，避免一个慢路径阻塞另一个；只有显式配置并提供真实摘要/经验时才更新项目上下文。宿主可能在超时后终止它，不能把耗时操作或唯一证据写入放在这里。

项目必须先被 Codex 信任，项目级配置和 Hook 才会加载。需要额外限制 `PreToolUse` 执行的可执行文件时，可在宿主环境设置 `INSTAR_HOOK_ALLOWED_COMMANDS`。Hook 不主动联网调用模型。它是最佳努力的本地辅助门禁，不能替代远端 CI、分支保护或组织身份系统。
