# InStar 质量协议

本文定义 InStar `2.4.0` 的质量控制器协议：项目如何配置检查、控制器如何生成快照、如何提交 Review、如何串联验证报告、如何阻断过期证据，以及如何发布 PR 和读取 CI。实现以 [src/quality-controller](../src/quality-controller/) 为准。

## 1. 质量契约

InStar 只编排和校验项目自己的质量工具：

- 检查命令由项目维护，并由控制器实际执行。
- 通过表示命令退出码为 0；失败表示命令执行失败；`BLOCK` 还可能是命令缺失、超时、启动失败、输入不稳定或策略不允许。
- 质量门禁通过表示结构和证据满足流程要求，**不表示代码没有缺陷**。
- 未配置的扫描器、未运行的测试和没有证据的 Review 不能被报告为通过。
- 本地报告、Review 和授权字段是流程证据，不是不可伪造的合规证明。

## 2. 配置发现

### 2.1 零配置模式

目标项目没有 `.instar-quality.json` 时，控制器生成自动发现配置：

- 识别 Vue 或 Python 项目的基本信息。
- `doctor`、`snapshot` 可运行。
- `verify` 只产生信息性 `WARN`，不执行项目命令。
- 严格质量门禁、`pre-pr-check`、`ci publish` 不能通过。

零配置不会向目标项目写入配置文件。

### 2.2 显式配置

项目在仓库根目录维护 `.instar-quality.json`。支持三种 `schemaVersion`：

| 版本 | 用途 | 能力 |
| --- | --- | --- |
| `1` / `2` | 既有 Vue/npm 兼容模式 | 通过 package scripts 执行 lint、typecheck、test、build 等 |
| `3` | 多语言、跨栈和任意本地命令 | `verification.profiles` + `tools.checks` |

schema 3 禁止使用旧的 `scripts` 和 npm 工具适配字段，必须显式声明检查和 profile。

### 2.3 公共约束

- 项目必须是 Git 仓库根目录，`baseRef` 必须能解析到提交。
- `baseRef` 只能是分支/引用名，不能是绝对路径或父目录路径。
- `context.*`、`verification.inputs`、`riskPolicy.rules` 等路径必须是工作区相对路径。
- 符号链接不会作为配置、基线、Token 或证据源。
- `timeoutMs` 范围为 `1..600000` 毫秒。
- CLI JSON 请求上限为 8 MiB；证据、报告和 Review 文本会被脱敏或截断到规定上限。

### 2.4 项目规范与强制规则

项目规范优先于插件建议。控制器自动发现 `<project>/standards/`，并合并 `.instar-quality.json` 的 `context.standards` 路径：

```json
{
  "context": {
    "standards": ["standards", "docs/engineering"]
  }
}
```

规范目录通过 `standards/index.json`（或任一被发现的 `index.json`）声明规则：

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "ARCH-001",
      "path": "standards/architecture/module-boundaries.md",
      "title": "Module boundaries",
      "mandatory": true,
      "appliesTo": ["src/**"],
      "summary": "Use public module entry points.",
      "owner": "architecture",
      "version": "1"
    }
  ]
}
```

`mandatory: true` 或 `always: true` 的规则在命中当前 `affectedPaths` 后成为强制规则。`appliesTo` 使用仓库相对 glob；没有 `appliesTo` 的强制规则始终适用。设计阶段必须在 `technical-design.md` 写入 `Compliance Matrix`，Review 阶段必须在 `standardsReferences` 逐条引用。以下情况会阻断：

- 缺少适用强制规则行，或 `Status` 不是 `PASS/WARN/NA`。
- `Source` 无法识别规则文件或规则 ID，或 `Evidence` 为空。
- Review 漏掉任一适用强制规则、引用未知规则、重复引用或证据为空。

规则文件、manifest 和路径都会执行符号链接、越界、大小和数量限制检查。设计失效指纹只包含命中的规则和文档哈希；修改无关规则不会使已批准设计失效。插件 [`standards/`](../standards/README.md) 仍是建议，不会自动成为项目门禁。

manifest 条目还可用 `conflictsWith` 与 `supersedes` 声明规则关系。两者只有当双方都命中当前 `affectedPaths` 时才参与判断。`supersedes` 在冲突中给出明确胜者；没有胜者的显式冲突返回 `HUMAN_DECISION_REQUIRED` 并阻断 `write-design`。未知引用会在加载 manifest 时失败。项目规则优先于插件建议，控制器不会在冲突时静默选择一条规则。`instar find standards` 和 `instar standards check` 会输出冲突状态与解决说明。

## 3. schema 3 推荐配置

以下示例使用 Python，但 `tools.checks` 可以指向任意本项目可执行的命令。命令使用 `spawnSync`，不经过 shell。

```json
{
  "schemaVersion": 3,
  "baseRef": "main",
  "review": { "language": "python", "framework": "none" },
  "verification": {
    "profiles": {
      "commit": ["lint", "typecheck"],
      "full": ["lint", "typecheck", "test", "build", "dependencies", "security"]
    },
    "inputs": ["src", "tests"]
  },
  "tools": {
    "checks": {
      "lint": { "command": "python3", "args": ["-m", "ruff", "check", "."], "timeoutMs": 120000 },
      "typecheck": { "command": "python3", "args": ["-m", "mypy", "src"] },
      "test": { "command": "python3", "args": ["-m", "pytest", "-q"] },
      "build": { "command": "python3", "args": ["-m", "compileall", "src"] },
      "dependencies": { "command": "python3", "args": ["-m", "pip", "check"] },
      "security": { "command": "python3", "args": ["-m", "bandit", "-q", "-r", "src"] }
    }
  },
  "qualityPolicy": {
    "schemaVersion": 1,
    "profiles": {
      "commit": [
        { "category": "Q-01", "checkId": "lint" },
        { "category": "Q-02", "checkId": "typecheck" },
        { "category": "Q-07", "checkId": "evidence-report" }
      ],
      "full": [
        { "category": "Q-01", "checkId": "lint" },
        { "category": "Q-02", "checkId": "typecheck" },
        { "category": "Q-03", "checkId": "test" },
        { "category": "Q-04", "checkId": "build" },
        { "category": "Q-05", "checkId": "dependencies" },
        { "category": "Q-06", "checkId": "security" },
        { "category": "Q-07", "checkId": "evidence-report" }
      ]
    }
  },
  "riskPolicy": {
    "rules": [
      { "riskLevel": "L2", "patterns": ["src/billing/**", "src/contracts/**"] }
    ],
    "l3": {
      "requiredReviewRoles": ["security"],
      "requiredChecks": ["security-scan"],
      "requireHumanApproval": true
    }
  }
}
```

### 3.1 `tools.checks` 约束

每个检查对象必须包含：

- `command`：非空、可直接执行，不能含换行或 NUL；不能包含 shell 拼接。
- `args`：字符串数组，最多 128 项，单参数最多 2048 字节，总参数最多 16384 字节。
- `cwd`（可选）：项目相对目录，不能包含 `..` 或逃出项目。
- `timeoutMs`（可选）：单检查超时。

参数中疑似口令、Token、数据库 URL 等内容会被替换为 `[REDACTED]` 后再持久化；原始输出不写入报告，只记录输出哈希、退出码、信号、耗时和结果分类。

### 3.2 `verification.inputs`

用于把 Git 未跟踪或通常被忽略、但会影响检查结论的输入纳入快照。目录会递归读取，但跳过 `.git`、`node_modules`、`reports`、`logs`、`dist`、`build`、`coverage`。限制为 10,000 个目录、10,000 个文件、256 MiB。

### 3.3 旧版 schema 1/2

旧配置通过 npm scripts 运行：

- `commit` 默认：`lint`、`typecheck`、`dependencies`
- `full` 默认：`lint`、`typecheck`、`test`、`build`、`dependencies`、`vite-build`
- 可额外配置 `tools.architecture`、`tools.contracts`、`tools.migrations`、`tools.security`、`scripts.e2e`、`scripts.visual`
- 旧配置必须显式 `packageManager: "npm"`

`tools.contracts` 只在变更命中 `api/`、`contracts/`、`schemas/`、`proto/`、`graphql/`、`openapi` 或同类契约文件时运行；`tools.migrations` 只在命中 `migrations/`、`alembic/`、`flyway/`、`liquibase/` 或 `.sql` 文件时运行。未命中时记录 `INFO`，不把未执行包装成通过；命中后失败会使 `quality-gate`、`pre-pr-check` 和提交前链路阻断。适配器结果写入既有 quality-gate checks 和 unified report，不另建平行证据文件。schema 3 项目应把对应命令加入 `verification.profiles` 和 `tools.checks`，并显式选择何时运行。

兼容模式只用于既有 Vue/npm 流程；新项目和新语言优先使用 schema 3。

## 4. 快照与失效

快照对象至少包含：

| 字段 | 含义 |
| --- | --- |
| `head` | 当前 Git HEAD |
| `base` / `baseRef` | 基线提交与引用 |
| `tree` | Git `write-tree` 结果 |
| `files` | 文件模式与内容 SHA-256；被删除文件标记为 `deleted` |
| `guidance` | 适用 `AGENTS.md`、规范与策略文件的哈希；AGENTS 受文件数/单文件/总字节预算约束并记录截断与省略元数据 |
| `changed` | 相对 base 的变更路径 |
| `fingerprint` | 上述内容的组合 SHA-256 |
| `configurationSource` | `project` 或 `auto-detected` |

`reports/`、`logs/`、`.workflow/`、`planning/workflows/` 等运行时状态不会进入质量快照；但 `.instar-quality.json`、`package.json`、架构/设计文档、Token 和基线会进入。

工作流源码快照另含 `treeHash` 与逐文件 `manifest`。`node_modules`、虚拟环境、`dist`/`build`、`__pycache__`、pytest/ruff/mypy 缓存、`*.egg-info` 和 `.DS_Store` 等会在任意深度排除；确实被 Git 跟踪的构建目录源码仍会保留。符号链接只记录链接目标哈希，不跟随读取；显式 `verification.inputs` 仍拒绝符号链接。

旧报告缺少 `manifest` 时会被明确标记为 legacy，不能静默放行。快照不匹配时，错误会输出旧/新 `treeHash` 和变化文件分类，便于直接定位实际源码变化；构建和测试产生的依赖/缓存不会反过来使报告失效。

任何源码、配置、Git index、治理文件或基线变化都会使旧 `fingerprint` 失效。

## 5. Action 协议

质量控制器入口：

```sh
node <plugin>/runtime/quality-controller/cli.mjs <request.json|->
```

快捷 CLI 使用 `bin/instar.mjs`，请求仍转换为同一 action。主要 action：

| Action | 作用 | 典型返回 |
| --- | --- | --- |
| `doctor` | 发现配置、上下文、依赖、CI 和可选工具 | 检查列表与 `PASS/WARN/BLOCK` |
| `snapshot` | 生成当前质量快照 | `fingerprint`、`head`、`changed` |
| `frontend-verify` | 运行 Vue/npm 兼容验证 | 验证报告 |
| `engineering-verify` | 运行 schema 3 项目检查 | 验证报告 |
| `local-verify` | 兼容别名，走同一验证路径 | 验证报告 |
| `quality-review-init` | 生成当前快照绑定的待完成 Review 模板 | 模板路径、指纹和 `WARN` 项 |
| `quality-review-repair` | 补齐缺失 Review 项并刷新模板指纹 | 新增项、移除项和待确认项 |
| `quality-gate` | 校验 Review 并执行可选工具适配器 | 稳定的质量门禁报告 |
| `ai-provenance` | 记录 AI 生成标记与会话摘要 | `ai-provenance` 报告 |
| `pre-commit-check` | 提交前的验证、Review、门禁组合检查 | 通过或阻断 |
| `commit` | 在功能分支上执行受控提交 | `commit` 报告 |
| `pre-pr-check` | full 验证 + Review + provenance 的联合检查 | 通过或阻断 |
| `session-summary` | 写入待关闭会话摘要 | `PASS` |
| `session-close` | 关闭会话并可选更新项目上下文 | 会话日志路径 |
| `ci` | `prepare/publish/status` 的 GitHub 编排 | `ci` 报告 |

请求必须包含绝对路径 `project`，例如：

```json
{
  "action": "snapshot",
  "project": "/absolute/path/to/project"
}
```

### 5.1 `verify` 的路由细节

`bin/instar.mjs verify` 在快捷解析层映射为 `frontend-verify`，但控制器在存在 schema 3 `verification.profiles` 时会执行 `engineering-verify` 逻辑并写入 `engineering-verify-<profile>` 报告。因此：

- 旧 Vue/npm 项目：实际执行 `frontend-verify`。
- schema 3 项目：实际执行 `engineering-verify`，即使命令名叫 `verify`。
- 需要明确区分报告类型时，直接使用 JSON action `engineering-verify` 或 `frontend-verify`。

`full` 验证会在没有项目安全扫描器时自动运行本地内置 secret scan，只检查变更源码中的高置信凭据模式，排除依赖、构建、运行态和二进制文件；报告只保存路径、行号和规则，不保存凭据原文。若配置了 `tools.security` 或 schema 3 的安全检查，则优先使用项目扫描器。

前端项目可配置 `scripts.browser` 或沿用 `scripts.e2e`；schema 3 可使用 `browser`、`browser-acceptance`、`e2e` 等检查 id。报告中的 `browserAcceptance` 只会在命令真实执行并通过时显示 `VERIFIED`。未配置返回 `NOT_CONFIGURED`，后端返回 `NOT_APPLICABLE`，不能把源码阅读当作浏览器验收。

## 6. 验证 profile 与 Q-01 到 Q-07

### 6.1 默认策略槽位

策略类别是项目的**声明槽位**，项目通过 `checkId` 或 `checkIds` 把槽位映射到实际检查。推荐语义如下：

| 类别 | 推荐覆盖 |
| --- | --- |
| `Q-01` | 静态分析 / lint |
| `Q-02` | 类型或语法检查 |
| `Q-03` | 自动化测试 |
| `Q-04` | 构建 / 编译 |
| `Q-05` | 依赖完整性 |
| `Q-06` | 安全或运行时专项检查 |
| `Q-07` | 证据完整性（推荐 `checkId: "evidence-report"`） |

策略校验要求：

- `commit` 和 `full` 都必须至少声明一个 `Q-07`。
- `full` 必须显式覆盖全部 `Q-01` 到 `Q-07`。
- 同一 profile 内类别不能重复。
- `checkId` 是兼容的单检查写法；`checkIds` 是数组，同一类别必须所有列出的检查均通过或各自获得豁免。
- 同一检查 id 可以被多个类别复用；豁免仍按 `category + checkId` 分别绑定，不能跨类别自动扩散。
- `evidence-report` 由控制器根据快照是否稳定生成，项目通常不需要在 `tools.checks` 中重复定义。
- `qualityPolicy` 不存在时，验证不能通过严格门禁。

### 6.2 Profile 选择

- `commit`：用于开发过程中的快速检查；高风险变更禁止只使用 commit。
- `full`：提交 PR、发布和 L2/L3 变更的必需 profile。
- `riskLevel` 达到 `L2` 或 `L3` 时，只允许 full。

### 6.3 豁免

豁免条目必须包含：

- `category`：不能是 `Q-07`。
- `checkId`。
- `reason`。
- `approvedBy`。
- `expiresAt`（可解析时间）。
- `scopeFingerprint`：当前快照指纹，或在仅配置/依赖变化时可用 HEAD。
- `compensatingControl`。
- `risk`。

豁免只影响策略覆盖结果，不修改原始命令执行结果；验证报告会保留 `rawStatus`，状态变为 `PASS_WITH_WAIVERS`。使用 `checkIds` 时为每个实际检查分别配置豁免。过期、作用域不匹配或 `Q-07` 豁免都会被拒绝。

## 7. 风险等级

| 等级 | 典型触发 | 要求 |
| --- | --- | --- |
| `L0` | 无风险的文档/只读变更 | 仍受项目配置约束 |
| `L1` | 默认 | 可运行 commit 或 full（受 profile 规则限制） |
| `L2` | `api/`、`routes/`、`database/`、`db/`、`permissions/` 或项目规则 | 结构化 Review 证据；需要 full |
| `L3` | `.github/workflows/`、认证、迁移、支付、基础设施、Terraform 或项目规则 | 结构化 Review + 人工角色审批 + full；接入 CI 时还检查必需 checks |

内置规则和 `riskPolicy.rules` 会自动提升风险；请求的等级不能低于有效等级。变更路径来自相对 `baseRef` 的 Git diff 与未跟踪文件。

### 7.1 L3 审批元数据

`review.approvals` 至少包含配置的每个角色：

```json
{
  "approvals": [
    {
      "role": "security",
      "status": "approved",
      "identity": "reviewer-id",
      "provider": "internal-review-system",
      "approvalId": "approval-123",
      "kind": "human"
    }
  ]
}
```

控制器只校验字段存在和状态，不验证身份、审批系统或签名的真实性。`requireHumanApproval` 默认为 true，除非项目明确关闭。

## 8. Review 格式与检查清单

Review 是质量门禁的核心输入。必须包含 `reviewer`、当前 `fingerprint` 和完整检查项。

### 8.1 检查项组成

`reviewItemsFor` 根据 `review.language` 与 `review.framework` 生成。两者均兼容字符串或数组；数组会合并去重，便于 React + Node、Vue + Python/Java/Go 等跨栈变更获得完整清单：

| 项目类型 | 检查项数量 | 组成 |
| --- | --- | --- |
| 未知（未配置语言/框架） | 6 | `correctness`、`maintainability`、`architecture`、`security`、`performance`、`naming` |
| Vue | 17 | 6 个通用项 + 11 个 Vue 专项项 |
| React | 13 | 6 个通用项 + 7 个 React 专项项 |
| Svelte / Angular | 11 / 12 | 通用项 + 各自组件状态、生命周期、可访问性专项项 |
| Node | 11 | 6 个通用项 + 5 个异步、输入、授权、资源和可观测性专项项 |
| Python / Java / Go | 14 | 6 个通用项 + 8 个后端专项项 |
| Rust | 10 | 6 个通用项 + unsafe、所有权、错误传播、并发安全 |
| .NET / C# | 10 | 6 个通用项 + nullable、async、DI 生命周期、EF migration |
| 多栈 | 合并去重 | 通用项 + 各命中 profile；未知栈不会默认加入 Vue |

Vue 专项项包括：`types`、`component-boundaries`、`design`、`watch-cleanup`、`v-for-key`、`reactive-destructure`、`props`、`computed-purity`、`unmount-cleanup`、`async-component`、`lazy-route`。

后端专项项包括：`api-contract`、`input-validation`、`authorization`、`error-handling`、`data-consistency`、`transactions`、`concurrency`、`observability`。

React 专项项包括：`types`、`component-boundaries`、`hooks-rules`、`state-ownership`、`effect-cleanup`、`memoization`、`accessibility`。Node 专项项包括：`async-errors`、`input-validation`、`authorization`、`resource-cleanup`、`observability`。Rust 与 .NET 使用上表列出的语言专项项；`review.extraChecks` 仍可追加项目自有检查。

### 8.2 L0/L1 证据

低风险 Review 的每个检查项可以使用非空字符串证据：

```json
{
  "reviewer": "team-member",
  "fingerprint": "<snapshot fingerprint>",
  "checks": [
    { "id": "correctness", "status": "PASS", "evidence": "Reviewed changed branches and tests." },
    { "id": "maintainability", "status": "PASS", "evidence": "No duplicated logic found." },
    { "id": "architecture", "status": "PASS", "evidence": "Changes stay within the existing module boundary." },
    { "id": "security", "status": "PASS", "evidence": "No new input or authorization path." },
    { "id": "performance", "status": "PASS", "evidence": "No new hot-path work." },
    { "id": "naming", "status": "PASS", "evidence": "Follows project naming conventions." }
  ]
}
```

### 8.3 L2/L3 结构化证据

L2/L3 的每个检查项必须使用对象证据：

```json
{
  "id": "correctness",
  "status": "PASS",
  "evidence": {
    "type": "test",
    "path": "tests/orders.test.ts",
    "startLine": 10,
    "endLine": 18,
    "excerpt": "it('rejects an invalid limit', async () => {",
    "note": "The test covers the changed validation branch.",
    "snapshotFingerprint": "<snapshot fingerprint>"
  }
}
```

约束：

- `type` 只能是 `source`、`test`、`config`、`design`、`ci`、`decision`、`not-verified`、`not-applicable`。
- `path` 必须是项目相对路径，不能绝对路径或包含 `..`。
- 行号从 1 开始；可以给 `line`，或给 `startLine` / `endLine`。
- `excerpt` 必须是非空、能在行范围内精确找到的文本。
- `snapshotFingerprint` 必须等于 Review 的 `fingerprint`。
- `not-verified` 只能配 `WARN` 或 `BLOCK`；`not-applicable` 只能配 `NA`。
- 证据文件会以禁止符号链接的方式读取。

### 8.4 Review 模板与修复

先用 `review init` 生成当前快照的完整待完成模板，默认写入被快照排除的 `reports/review.json`：

```sh
node <plugin>/bin/instar.mjs review init --project . --reviewer team-member
```

模板项使用 `WARN` + `not-verified`，reviewer 可用 `<reviewer>` 占位，二者都必须由实际 Review 替换；模板本身不是通过证据。源码或配置变化后使用：

```sh
node <plugin>/bin/instar.mjs review repair --project . --review-file reports/review.json
```

`repair` 只补齐缺失项、移除不再适用的旧栈项并刷新模板指纹。已有证据文本会保留；指纹变化时旧 `PASS` 会降为 `WARN`，结构化证据若仍绑定旧指纹则继续阻止门禁，直到重新核实。输出只能位于工作区内的运行时排除路径，路径逃逸和符号链接会被拒绝。

### 8.5 基线引用与复用审查

当项目存在 `docs/project-baseline/rules.json` 时，Review 需要 `ruleReferences`：

- 每个条目包含 `id`、`evidence`、`status`（`PASS/BLOCK/WARN/NA`）。
- 所有 `adopted` 规则必须被引用。
- 任一 `BLOCK` 都会拒绝 Review。

当复用治理启用时，Review 还需要 `reuseReview`，并在受控工作流中包含 `changeId` 和与已批准设计一致的 `planHash`、决策和三个检查项：

- `reuse-existing`
- `duplicate-implementation`
- `shared-capability-design`

### 8.6 项目规范引用

当存在适用的强制项目规范时，Review 需要 `standardsReferences`：

```json
{
  "standardsReferences": [
    {
      "id": "ARCH-001",
      "status": "PASS",
      "evidence": "src/orders/index.ts:12 uses the public module entry point"
    }
  ]
}
```

`review init` 会列出当前适用的强制规则并生成待办引用；`review repair` 会补齐新增规则，同时保留已核实引用。`quality-gate` 会重新计算适用规则并校验完整性，不能依赖模板中的占位状态通过。Review 报告会记录 `standards.status`、`fingerprint`、`required` 和 `present`，便于审计。

## 9. 报告与证据链

### 9.1 报告文件

| 文件 | 内容 |
| --- | --- |
| `reports/doctor.json` | 环境与配置诊断 |
| `reports/frontend-verify-commit.json` / `frontend-verify-full.json` | 旧 Vue 验证 |
| `reports/engineering-verify-commit.json` / `engineering-verify-full.json` | schema 3 验证 |
| `reports/quality-gate.json` | 稳定的 Review 与适配器结果 |
| `reports/unified-quality.json` | 跨 profile、Review、策略和 releaseReady 的统一视图 |
| `reports/unified-quality.md` | 统一报告的人类可读摘要 |
| `reports/review-dossier.json` | 同一快照下验证与 Review 的报告 ID、检查哈希和证据引用；不复制证据正文 |
| `reports/manifest.json` | 报告正文的唯一指针索引：`id + path + hash + status + snapshotFingerprint`；用于去重和追溯，不替代报告校验 |
| `reports/verification-cache-<profile>.json` | 绑定 snapshot、配置、检查集和工具版本的稳定验证缓存 |
| `reports/ai-provenance.json` | AI 生成标记、会话摘要与快照 |
| `reports/pre-pr-check.json` | PR 前联合检查 |
| `reports/commit.json` / `reports/commit-waiver.json` | 提交结果或豁免记录 |
| `reports/ci.json` | CI/PR 状态 |
| `reports/semantic-quality/<changeId>/<stage>.json` | 语义评测报告 |

每个写报告的动作还会生成 `reports/<kind>-<uuid>.json` 与 `logs/<kind>-<uuid>.md`，并以事务替换对应主报告。

### 9.2 报告完整性字段

- `reportHash`：对报告内容（不含 `reportHash` 与 `reportSignature`）的 SHA-256。
- `reportSignature`：配置 `evidenceTrust.hmacEnv` 时，对 `reportHash` 的 HMAC-SHA256。

门禁会重新计算并校验；被编辑、替换或来自其他快照的报告会被拒绝。没有配置 HMAC 时，`reportHash` 只能用于一致性检查，不能防止有意重算。

### 9.3 统一报告

`unified-quality.json` 汇总各 profile 和 Review。`releaseReady` 为 true 需要：

- 存在 full profile。
- full profile 状态为 `PASS` 或 `PASS_WITH_WAIVERS`。
- Review 状态为 `PASS` 或 `WARN`。
- 所有证据属于同一快照。

报告同时给出 `readiness`：`ready`、`partial` 或 `blocked`，并列出 `reasons` 与 `missingEvidence`。`releaseReady` 严格等于 `readiness.status === "ready"`，不接受未完成的 profile、缺失或失败的 Review，也不把 `partial` 当作可发布。

`unified-quality.json` 还通过 `dossierRef` 指向 `reports/review-dossier.json`。dossier 只为每个 verification profile 记录 `reportId`、`checksHash` 与 `reports/<kind>.json#/checks/<id>` 引用，为 Review 记录 `reportId`、checklist/tool checks 哈希以及 `path#Lx` 源码位置。门禁会重新计算 dossier 内容哈希，并与当前 snapshot、Review 报告和统一报告中的 profile 交叉校验；dossier 或源报告任一不一致都会阻断。它减少重复读取和手工复制，但不是独立通过结论，也不能替代报告自身的完整性校验。

### 9.4 验证缓存

验证缓存键包含 profile、风险级别、实际检查集、源码 snapshot、完整配置哈希和质量引擎版本。只有稳定且为 `PASS`、`WARN` 或 `PASS_WITH_WAIVERS` 的结果才写入缓存；源码、配置、检查集或工具版本变化会自动失效。缓存命中时报告返回 `cache:{hit:true,evidenceReportId,key}`，并从缓存中的已签封报告原子恢复原始证据文件；不会因缓存省略证据完整性校验，也不会保留旧 Review。

## 10. CI / GitHub 协议

### 10.1 配置

在 `.instar-quality.json` 中增加：

```json
{
  "ci": {
    "host": "github.com",
    "repo": "owner/repository",
    "remote": "origin",
    "base": "main",
    "allowedHosts": ["github.com"],
    "requiredChecks": ["verify", "security-scan"],
    "secretCheck": "security-scan"
  }
}
```

要求：

- `ci.base` 必须与 `baseRef` 一致。
- `allowedHosts` 必须显式包含 `ci.host`。
- `requiredChecks` 必须非空并包含 `secretCheck`。
- 推送 remote 必须精确匹配 `host/repo`，不能带嵌入凭据。
- 当前分支不能是 main、master 或远端默认分支。

### 10.2 阶段语义

| 阶段 | 行为 |
| --- | --- |
| `prepare` | 生成 `reports/pr-body.md`，写入验证、Review 和 provenance 证据；不推送 |
| `publish` | 要求 `--confirm` 和标题；推送当前功能分支到显式 ref，创建或更新 PR，然后把 PR、base 和 checks 对齐本地快照 |
| `status` | 读取已有 PR 的 checks 和 Actions；缺失或 pending 不能通过 |

Publish 会在推送前检查远端 base SHA 与本地快照 base 一致；推送后校验远端 head SHA、PR head/base、PR 正文中的证据 payload，并再次检查远端 head 未被并发改写。不会 force push。

### 10.3 L3 与分支保护

L3 变更在接入 CI 时要求：

- `riskPolicy.l3.requiredChecks` 已包含在 `ci.requiredChecks` 中。
- 分支保护的 required contexts 包含所有必需 checks。

控制器读取仓库分支保护信息；它不代替 GitHub 实际执行保护规则。

## 11. Hook 行为

`hooks/quality-hook.mjs` 只处理两个事件：

- `PreToolUse`：当 Bash 命令是独立的 `git commit` 或 `gh pr create` 时，定位包含 `.instar-quality.json` 的项目根目录并运行 `pre-commit-check` 或 `pre-pr-check`。命令链、重定向、子 shell、`--repo`、从子目录执行等会被拒绝。
- `SessionEnd`：只有存在 `logs/pending-session.json` 时才关闭会话并写日志；普通会话不产生空审计文件。

Hook 是本地反馈门禁，不主动联网、不调用模型，不能替代 CI、分支保护和 CODEOWNERS。

## 12. 失败、恢复与常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Missing verification report` | 未运行 full/commit 对应验证 | 先执行匹配 profile 的 `verify` |
| `Quality review report is stale` | 源码、配置或基线在 Review 后改变；错误会列出变化文件 | 确认列出的源码变化后重新 Review、`quality-gate`，再用 `reportPath` 绑定新报告 |
| `Review is stale` | Review 指纹不是当前快照 | 使用新指纹重交 Review |
| `Mandatory qualityPolicy missing` | 旧版验证或无严格策略 | 增加 `qualityPolicy` 并重新验证 |
| `Q-07 evidence integrity must be configured` | full 策略未覆盖 Q-07 | 为 Q-07 映射 `evidence-report` |
| `L3 Review missing approved role` | 缺少角色或人工审批元数据 | 增加 `review.approvals` 并确认真实性 |
| `Quality operation already running` | `logs/.quality.lock` 被占用 | 先确认没有活跃进程，再按锁内容处理 |
| `Interrupted transaction exists` | 工作流/发现事务未清理 | 读取 `.workflow/pending.json`，使用 `recover` |
| `SPAWN_ERROR` / `TIMEOUT` | 命令不可执行或超时 | 修正 `tools.checks` 或超时，检查宿主环境 |
| `Review evidence does not match current source` | 摘录与当前文件不一致 | 重新读取文件，修正行号或摘录 |
| `Review file already exists` | 已存在旧模板 | 使用 `review repair`，或明确 `review init --force` |
| `excluded runtime path` | Review 模板会改变自身快照 | 使用 `reports/review.json` 等运行时排除路径 |
| `Potential credentials found` | 内置 secret scan 发现高置信凭据 | 轮换并移除凭据，再重新验证；不要只删除报告 |

报告失败时，控制器会尽量把对应最新报告改为 `BLOCK`，避免旧的 `PASS` 被误读。恢复事务必须校验事务 ID，不应手工删除活跃锁或随意编辑 `pending.json`。

## 13. 能力边界

- 项目配置可执行任意本地命令；环境过滤和 npm 离线参数**不是** OS 级网络或权限隔离。
- 内置 secret scan 只覆盖变更源码中的高置信模式，不等同于完整 SAST、依赖扫描或远端 secret scanning。
- 未配置浏览器验收命令时，验证报告只标记 `NOT_CONFIGURED`，不生成浏览器通过证据。
- 控制器不能证明项目配置覆盖了全部风险，也不能证明测试断言有效。
- Review 结构校验不等于人工代码评审。
- `reportHash`/HMAC 只证明一致性和密钥持有关系，不证明报告作者身份。
- 远端 CI 状态取决于 GitHub 权限、工作流和保护规则；InStar 只读取并比对结果。
- 任何本地证据都应由目标项目的版本控制、CI 日志和人工审批流程补充。

相关文档：[架构书](plugin-arch.md)、[使用说明书](PLUGIN-GUIDE.md)、[开发测试手册](LOCAL_TESTING.md)、[评测与验收说明](EVALUATION.md)。
