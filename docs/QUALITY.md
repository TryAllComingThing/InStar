# 质量、证据与安全

## 1. 设计目标

InStar 的质量层解决三个问题：

1. 用统一的配置映射项目已有的 lint、format、test、build、security、browser、accessibility、keyboard 和 dependencies 检查。
2. 把检查结果、代码快照、配置和评审绑定成不可随意复用的证据。
3. 在提交和受控工作流审批前阻止 stale、缺失或未通过的证据。

它不实现扫描规则，也不保证一次 PASS 覆盖所有风险。项目必须自己安装工具、维护脚本和维护 `.instar-quality.json`。

## 2. `.instar-quality.json`

配置文件位于目标项目根目录；不要求 Git 仓库。当前支持：

- `schemaVersion: 1/2`：旧版 npm 前端验证与 npm script 适配器。
- `schemaVersion: 3`：直接执行可配置命令，支持前后端和非 npm 技术栈。

schema 1/2 仍可读取和执行，但 `doctor` 会返回 `quality-config-version` WARN，因为它们不能提供 schema 3 的严格命令证据。应在下一个大版本移除兼容支持前迁移到 schema 3；迁移后重新生成验证报告，不能复用旧证据。

### 2.1 schema 3 示例

```json
{
  "schemaVersion": 3,
  "verification": {
    "runtime": {
      "command": "npm",
      "args": ["run", "preview", "--", "--host", "127.0.0.1", "--port", "{port}"],
      "readyUrl": "http://127.0.0.1:{port}/",
      "timeoutMs": 30000
    },
    "profiles": {
      "preflight": ["lint-check", "format-check", "typecheck-check", "test-check"],
      "implementation": [
        "lint-check",
        "format-check",
        "typecheck-check",
        "test-check",
        "browser-check"
      ],
      "full": ["build-check", "security-check", "a11y-check", "keyboard-check"]
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

### 2.2 分层验证与中间证据缓存

需要减少重复 unit/E2E 执行时，在 `verification` 中配置 L1/L2。L3 不单独配置，始终使用 `verification.profiles.full`：

```json
{
  "verification": {
    "profiles": {
      "preflight": ["lint-check", "test-check"],
      "implementation": ["lint-check", "format-check", "test-check", "browser-check"],
      "full": ["build-check", "security-check", "a11y-check", "keyboard-check"]
    },
    "layers": {
      "L1": ["test-affected"],
      "L2": ["lint-check", "format-check", "test-check", "browser-affected"]
    },
    "cache": {"enabled": true, "buildOutputs": ["dist"]}
  },
  "tools": {
    "checks": {
      "test-affected": {
        "kind": "test", "command": "npm", "args": ["run", "test:affected", "--", "{files}"],
        "toolVersion": "vitest-3"
      },
      "browser-affected": {
        "kind": "browser", "command": "npm", "args": ["run", "test:e2e:affected", "--", "{files}"],
        "toolVersion": "playwright-1.55", "routes": ["/login", "/workbench"], "browserMatrix": ["chromium"]
      }
    }
  }
}
```

- `L1`（changed-unit）只处理本次受影响文件。每个 L1 检查必须使用 `{files}` 占位符，或声明 `incremental:true` 并由项目保证增量执行。
- `L2`（task-unit）必须至少包含一个覆盖全部 unit 的 `test` 检查；若配置了 browser/E2E，必须包含受影响 E2E，并使用 `{files}` 或 `incremental:true`。
- `L3`（frozen-full）只使用 `profiles.full`，在最终冻结源码后执行一次完整 build/browser/a11y/keyboard/security。`profiles.full` 必须包含 `kind:"build"`，且 build 必须位于所有 browser/accessibility/keyboard 检查之前；L3 永不读取 L1/L2 缓存。
- L1/L2 不得配置 `build` 检查；生产 build 只属于 L3，避免中间验证阶段的旧 build 产物污染浏览器证据。
- `lean` 风险只运行 L1→L3；`standard` 运行 L1→L2→L3；`governed` 同样运行三层，并要求 L1/L2 联合证据包含 security。UI 和任何高风险 impact 不得使用 lean。
- 中间层缓存键精确包含：`kind + command + configHash + sourceHash + lockfileHash + toolVersion + buildHash + routes + browserMatrix`。源码、配置、锁文件、工具版本、构建产物、路由或浏览器矩阵任一变化都会 miss。
- 缓存只保存可执行文件、展开参数的 SHA-256、文件哈希和检查身份，不保存原始 `args`；因此带 `--token=...` 的命令不会把秘密写入 `reports/cache`。旧版本残留原始 `args` 的缓存会被 `doctor` 以 `cache-secret-hygiene=BLOCK` 报告，应清理后重跑。
- 缓存中的 UI 检查必须声明 `routes` 与 `browserMatrix`；所有被缓存的检查必须声明 `toolVersion`。缓存的 artifact 每次复用前重新校验存在性和 SHA-256，不匹配则视为 miss。
- 配置了 browser/accessibility/keyboard 检查时，`routes` 与 `browserMatrix` 是必填契约；artifact 必须覆盖全部 route × browser 组合，缺项或伪造组合均 BLOCK。
- 工作流 implementation 审批在启用 layers 时要求 L1+L2 联合证据；governed 风险还要求其中包含 security 证据。只有 L3 可满足最终 full 验证。

### 2.3 检查字段

每个 `tools.checks.<id>` 支持：

| 字段 | 要求 |
| --- | --- |
| `kind` | `lint`、`format`、`typecheck`、`test`、`build`、`security`、`browser`、`accessibility`、`keyboard`、`dependencies` |
| `command` | 工作区相对或 PATH 中已有命令；不接受 shell 拼接 |
| `args` | 字符串数组；总大小和单项大小有上限；不会持久化到报告 |
| `cwd` | 可选工作区相对目录 |
| `timeoutMs` | 1–600000 ms |
| `artifact` | 可选；必须是 `reports/` 下的工作区相对路径 |
| `toolVersion` | 中间层缓存必需；项目工具版本标识，长度不超过 160 |
| `incremental` | 可选布尔值；项目命令自行增量选择检查范围 |
| `routes` | 缓存的 browser/accessibility/keyboard 检查必需；非空字符串数组 |
| `browserMatrix` | 缓存的 browser/accessibility/keyboard 检查必需；非空字符串数组 |

`verification.runtime` 可选，仅用于 UI 检查。控制器会保留一个随机回环端口，在第一个 browser/accessibility/keyboard 检查前启动一次，把 `INSTAR_BASE_URL`、`PLAYWRIGHT_BASE_URL`、`A11Y_BASE_URL`、`KEYBOARD_BASE_URL` 注入各检查，并在 profile 结束后终止服务。`readyUrl` 必须是回环 HTTP(S) URL；不支持远程预览服务。不要同时在 Playwright `webServer` 中重复 build，也不要复用未验证的固定端口。

POSIX 和 Windows 原生可执行文件使用直接 `spawn`；Windows 的 `.cmd`/`.bat`（包括 `npm` 等 shim）需要经 `cmd.exe` 启动，控制器会逐项加引号并拒绝包含 `"`、`%`、`!`、CR/LF/NUL 的命令或参数。这是受控启动，不表示支持管道、重定向、变量展开或命令拼接。环境变量中的常见 Token、密码、DSN、GitHub/AWS/云凭据和注入相关变量会被过滤，但这不是完整的安全隔离；运行不可信项目应使用宿主沙箱或容器。

可设置 `INSTAR_HOOK_ALLOWED_COMMANDS=npm,node` 对质量命令的可执行文件做 allowlist。设置后，未列出的可执行文件会返回 `BLOCK ECOMMANDNOTALLOWED`；按 basename 比较并忽略 Windows 的 `.exe`/`.cmd`/`.bat`/`.com` 后缀。还可设置 `INSTAR_HOOK_ALLOWED_CHECKS=lint,test,build`，只允许指定检查 ID 或 npm script；未列出的检查返回 `BLOCK ECHECKNOTALLOWED`。这些变量只能限制可执行文件和检查名，不能证明 npm script 或参数内容安全，也不能替代宿主沙箱与项目信任。

### 2.3 上下文字段

- `context.architecture`、`context.design`：项目已有规范路径。
- `context.designSystem`：可选的项目设计系统 Markdown 清单（`DESIGN.md`、`README.md` 或 `index.md`）；未配置时按固定候选发现。已知 design-system 目录存在但没有清单时，只作为项目设计系统信号，不读取目录内容；此时 `doctor` 报 `WARN` 并提示配置 `context.designSystem` 或补充清单。
- `context.tokens`：字符串或字符串数组；缺失、目录、符号链接或越界路径会报错。
- `context.sessionState`、`context.lessons`：可选的 Markdown 会话/经验文件。
- `qualityPolicy`：旧版可选强制检查覆盖与 waiver；`Q-07 evidence integrity` 不可豁免。

## 3. 固定 profile

规范名称为 `preflight`、`implementation`、`full`。`preflight` 是提交前或交付前的显式本地预检，不执行 Git，也不读取暂存区。新报告名固定为：

```text
reports/engineering-verify-<profile>.json
```

`commit` 是兼容旧项目的 deprecated alias：命令行仍接受它，旧配置 `verification.profiles.commit` 和旧报告 `reports/engineering-verify-commit.json` 仍可读取，但新运行统一写入 canonical `preflight` 配置和 `reports/engineering-verify-preflight.json`。应在下一个 major 版本前迁移。

工作流要求：

| Profile | 时序 | 必需 kind |
| --- | --- | --- |
| `implementation` | 实现审批前 | `lint`、`format`、`test`；UI 加 `browser` |
| `full` | 实现审批后、验收前 | `build`、`security`；UI 加 `accessibility`、`keyboard` |
| `preflight` | 显式提交前/交付前预检 | 项目配置；工作流本身不要求验收 |

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

UI artifact 还必须是可解析且语义有效的 JSON，并包含有效 `generatedAt`：`browser` 声明 `kind:"browser"`、`status:"PASS"`、`tool:"playwright"`、`headless:true` 和非空 journeys，且每个 journey 为 `status:"PASS"`；`accessibility` 声明 `kind:"accessibility"`、`tool:"playwright-axe"`、`headless:true`、`routesScanned>=1`，violations/incomplete 为空，`results` 数量等于 `routesScanned`，每条 result 的 `status` 为 PASS 且自身无违规；`keyboard` 声明 `kind:"keyboard"`、`tool:"playwright"`、`headless:true` 和非空 journey（含 route、非空 steps、expectedFocus、actualFocus），且 PASS 要求 `actualFocus===expectedFocus`。配置了 `routes` 或 `browserMatrix` 的检查还必须声明并覆盖全部配置值；矩阵值可来自 artifact 顶层或 journey/result 的 `browser`、`project`、`browserMatrix`。命令退出码为 0 但 artifact 不满足这些契约时，检查仍为 BLOCK。`{status:"passed"}`、自相矛盾的键盘 PASS 或只截图不算通过。

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

1. 解析配置并读取工作区、上下文和 `.instarignore`；不调用 Git，也不检查暂存区。
2. 生成工作区源码清单 snapshot；配置中的 `verification.inputs` 可加入通常被排除但影响检查的输入。`.instarignore` 的内容哈希、规则数量和风险摘要也进入 fingerprint；隐藏整个工作区的 `*`/`**` 规则直接 BLOCK，过宽的源码根目录规则标记 WARN。
3. 按 profile 顺序运行检查；失败、超时或检查期间源码变化立即 BLOCK。超时会终止检查的整个进程组，不只终止直接子进程。配置 `verification.runtime` 时，browser/accessibility/keyboard 共享一个随机端口 preview，并在 profile 结束时清理。
4. 指定 `layer:L1|L2` 时只运行 `verification.layers` 中的检查，展开 `{files}` 并注入 `INSTAR_CHANGED_FILES`/`INSTAR_VERIFICATION_LAYER`；L1/L2 的通过结果可按完整证据键复用。`layer:L3` 等价于 full profile 的无缓存执行。
5. 为 schema 3 检查生成 `reports/evidence/<profile>/<reportId>/<checkId>.json`，或在项目指定 `artifact` 时使用项目路径。项目指定的 artifact 会在命令启动前删除，命令必须重新生成它，避免旧 PASS 文件被复用。UI artifact 在绑定哈希前即执行语义校验。
6. 保存报告；失败重跑会用 BLOCK 覆盖此前的 PASS，避免旧结果被误认为最新。活动工作流预算已超限时，在启动验证或 quality-gate 前直接阻断。

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

- 工作区源码清单中的路径、内容哈希、大小、行数和 binary 标记；
- `.instarignore` 内容哈希、规则摘要、风险与内置排除规则；
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

这里的 fingerprint 是本地变化检测，不是签名：它证明当前工作区内容与该次报告/审批的绑定关系，不能证明执行者身份，也不能抵御同时修改源码、baseline 和状态文件的同权限攻击者。

## 8. 浏览器与可访问性

| 证据 | 作用 | 门禁 |
| --- | --- | --- |
| Headless Playwright 功能旅程 | 关键流程回归 | UI implementation 必需 |
| Playwright + axe-core | 自动化可访问性扫描 | UI full 必需 |
| 键盘/焦点旅程 | 可访问性人工或自动化补充 | 不能由 axe 自动替代 |
| Headed Chrome | 人工视觉/交互检查 | 可选 |
| Page-load smoke | 快速反馈 | 可选，不替代上两项 |

`templates/quality/a11y-check.mjs` 对空路由、导航异常、登录重定向和 axe `incomplete` 都 fail-closed；它只覆盖 axe。`templates/quality/keyboard-check.mjs` 按 route、按键步骤和预期焦点选择器生成独立的 keyboard artifact，焦点不匹配或缺少 Playwright 时失败。浏览器、可访问性与键盘 artifact 必须分开。同一 source snapshot、配置和检查定义已覆盖的 browser 旅程不应在 full 原样重跑；复用证据仍必须绑定当前快照，源码变化后自动失效。运行前确认 Playwright 版本和浏览器缓存；缺少 Chromium 时应显式安装到项目或外部流水线缓存，而不是让长流程在最后一个 UI 检查才失败。`doctor` 会以 WARN 报告 implementation 与 full 重复配置的 browser check。

工作流 `state`/`visualize` 会报告实现、验证和 quality-gate 证据的 `current|stale|missing|unknown`。源码变化后使用 schema 6 `refresh-evidence`，不要为了新增源码文件重开 design/tasks。

### Warning 分级处置

`critical` 与 `unverified` 始终阻断。普通 `warning` 可以在 finding 上记录显式处置后放行：

```json
{
  "severity": "warning",
  "message": "Missing empty state for the secondary panel",
  "disposition": {
    "decision": "accepted",
    "reason": "Covered by the existing backlog item UI-142",
    "owner": "product-owner",
    "expiresAt": "2026-12-31"
  }
}
```

`decision` 为 `accepted|mitigated|deferred`，`reason`、`owner` 和未来的 `expiresAt` 必填；过期处置视为未解决，`critical` 即使带处置也继续阻断。未处置或已过期 warning 仍按原规则阻断，quality-gate 报告状态记为 `WARN` 而不是 `PASS`，便于审计。

## 9. 显式质量门禁与外部 VCS

InStar 不注册提交 Hook，也不提供 `pre-commit-check` 或 Git `commit` action。`preflight` 只是显式本地验证 profile，不代表 InStar 会执行提交；`commit` 仅是其兼容别名。没有 Git 的普通目录、导出包或由其他版本系统管理的仓库同样可以使用工作区快照和验证流程。

推荐顺序：

```text
verify --profile preflight|implementation|full
→ quality-gate
→ 人工确认并显式授权外部 VCS 提交/推送
```

分支、暂存、提交、合并、PR/MR、CI、分支保护和远端 required checks 都由外部 VCS/平台负责。InStar 不调用 Git、不读取暂存区、不创建或更新 PR，也不读取外部流水线状态。单机开发不要求 Git；组织级可信交付仍需要外部 VCS/平台提供身份、权限、审计和远端门禁。

组织级交付至少应在外部平台配置 PR/MR、CODEOWNERS 或等价评审规则、branch protection、required status checks、受控提交身份和服务器端审计。需要强保证时，外部 CI 必须对精确 commit SHA 重新运行检查并校验 required check、reviewer 身份与 artifact 来源。PR、CODEOWNERS 和代码审查是流程门禁，不是 OS 沙箱边界。

## 10. 证据信任边界

- `trace-skill`、`trace-agent`、Review 报告、usage 和 workflow 审批状态都是本地可审计记录；哈希证明内容与绑定关系一致，不证明执行者身份或审批人身份。
- `reviewerSessionId`、`executionMode`、Gateway/宿主日志能提高可追溯性，但仍可能由本地维护者修改。它们是流程证据，不是加密签名。
- 团队级门禁必须由外部 VCS 的分支保护、Code Review、CI、artifact 存储和组织身份/权限系统承担。
- 需要强保证时，应在外部 CI 对精确 commit SHA 重新运行检查，并验证 required check、reviewer 身份和 artifact 来源。
- InStar 会为 baseline 计算内容哈希，并由对应 change state 保存 `fingerprint + baselineHash` 交叉绑定。普通删除、替换单侧篡改或在验收前发生的并发修改会被拒绝；但具有同一文件系统权限、能够同时改写 baseline 与 state 的人仍可伪造证据，因此本地记录不提供可信签名或不可抵赖保证。
- 项目验证命令是项目代码，过滤环境变量、禁止 shell 和 allowlist 都不是 OS 沙箱。对不可信仓库或不可信 `.instar-quality.json` 执行验证时，必须使用 container、devcontainer、VM 或隔离 CI runner；不要让宿主上的明文凭据、SSH agent、云实例身份或生产网络进入执行环境。

### 10.1 已知剩余风险

- Node 没有跨平台 `openat`，路径解析与最终文件系统调用之间仍存在 TOCTOU 窗口；现有父子目录身份校验能发现多种替换，但不能提供内核级原子保证。
- 事务和报告写入在进程崩溃、断电或文件系统故障的特定时点仍可能留下部分状态；恢复流程会拒绝无法确认的 pending journal，但不能消除所有崩溃一致性风险。
- 本地 SHA-256、snapshot fingerprint、`reviewerSessionId` 和审批记录只提供变化检测与流程审计，不是加密签名，不能提供不可抵赖身份认证。
- 宿主机上的同权限攻击者若能在流程外同时改写源码、配置、报告和状态，仍可能伪造自洽的本地证据；高保证场景必须把执行与证据存储移到受控远端系统。

## 11. Hook 边界

`hooks/hooks.json` 只注册：

- `SessionEnd`（当前 10 秒超时）：写会话审计并导入可用 Token/API usage；只有显式配置并提供真实摘要/经验时才更新项目上下文。宿主可能在超时后终止它，不能把耗时操作或唯一证据写入放在这里。

项目必须先被 Codex 信任，项目级配置和 Hook 才会加载。质量命令由显式 `verify`/`review` 调用，不由提交工具触发。需要额外限制质量命令的可执行文件时，可在宿主环境设置 `INSTAR_HOOK_ALLOWED_COMMANDS`。Hook 不主动联网调用模型，也不能替代外部 CI、分支保护或组织身份系统。
