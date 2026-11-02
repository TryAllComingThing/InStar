# InStar 架构书

本文描述 InStar `2.4.0` 的**实现架构**，以仓库源码、构建脚本、安装清单和测试为事实来源。文中区分：

- **实现事实**：可由代码直接验证的行为。
- **使用约定**：控制器要求调用方遵守、但本身不构成身份认证或语义证明的约定。
- **限制与缺口**：当前实现没有承诺或没有能力验证的部分。

## 1. 定位与边界

InStar 是一个 Codex 软件交付插件，核心职责是**编排与证据绑定**，不是另一个语言工具链：

- 提供 22 个 Skill 入口，覆盖需求、Spec、设计、实现、验证、存量 Spec 发现、工程基线、复用治理与交付。
- 提供 Node.js ESM CLI，执行工作流状态机、质量门禁、快照、文档落盘、事务恢复和 GitHub PR/CI 编排。
- 将阶段、人工审批、检查结果、Review、代码快照和 PR/CI 状态关联起来，在输入变化时阻断旧证据。
- 不内置 ESLint、测试框架、安全扫描器、模型调用、浏览器或 CI 引擎；这些能力由目标项目配置并通过实际命令执行。
- InStar **不会自动创建目标项目的 `.instar-quality.json`**。项目接入必须由项目维护者显式配置。

Node 运行要求为 `>=20.19.0`，包类型为 ESM，见 [package.json](../package.json)。

## 2. 系统上下文

```text
用户 / Codex 会话
    │  $skill、自然语言、commands
    ▼
Skill / Hook 层 ──────────────► 目标项目文件与 Git 仓库
    │                                  │
    │ JSON CLI                         ├─ .instar-quality.json
    ▼                                  ├─ AGENTS.md / 架构 / 设计 / Token
控制器层                               └─ 项目自己的检查命令
  ├─ workflow-controller ──► openspec-min 文档引擎
  ├─ quality-controller  ──► Git / npm / 项目命令
  └─ discovery-controller ─► 源代码扫描与证据校验
    │
    ├─ git（本地）
    ├─ gh（可选，PR / CI）
    └─ 远端 GitHub（仅在显式 ci 配置与授权时）
```

外部依赖只在两个方向出现：

1. **目标项目提供事实**：Git 历史、源码、项目配置、架构/设计文档、Design Token、检查命令。
2. **宿主提供执行环境**：Node、npm、项目语言运行时、`git`、可选的 `gh`、宿主沙箱和网络权限。

插件本身不启动常驻服务，不监听网络端口，也不保存模型凭据。

## 3. 安装与打包结构

| 路径 | 角色 |
| --- | --- |
| `.codex-plugin/plugin.json` | Codex 插件主清单，注册 `skills/` 与 `hooks/hooks.json` |
| `plugin.json` | 插件索引，指向主清单、`commands/` 和 `assets/policy.json` |
| `skills/` | 22 个 Skill 入口及其引用、模板、示例 |
| `commands/` | 轻量命令说明，辅助宿主发现能力 |
| `hooks/` | 本地 PreToolUse / SessionEnd 钩子 |
| `assets/policy.json` | 声明式安全策略；不是执行边界 |
| `standards/` | 通用、语言、API、数据库、测试规范参考 |
| `runtime/` | 构建生成的独立运行目录，不手工编辑 |
| `docs/` | 架构、使用、质量、测试与评测说明 |

发布脚本把插件复制为 `release/plugins/instar`，并生成 `release/.agents/plugins/marketplace.json` 与 `RELEASE-PROVENANCE.json`。发布包不依赖仓库根目录的 `node_modules`。

## 4. 源码、构建与运行时

### 4.1 构建流程

`npm run build` 执行：

1. `src/openspec-min` 的 TypeScript 构建，生成 `dist/`。
2. 删除并重建 `runtime/`。
3. 复制 `dist/`、工件模板、四个控制器目录和 `shared/`。
4. 打包 `zod` 与 `smol-toml` 运行时依赖。
5. 写入最小的 `runtime/package.json`。

`scripts/check.mjs` 会逐字节比较 `src/` 与 `runtime/` 中的对应目录，检测构建漂移。因此：

- **源码只改 `src/`**。
- 修改后必须重新构建；直接编辑 `runtime/` 会在检查中失败。
- `runtime/` 是发布产物，不需要也不应当提交为手工维护源码。

### 4.2 openspec-min

`src/openspec-min` 是从 OpenSpec 方法移植、裁剪后的文档引擎。公开 API 固定为五个导出，见 [entry.ts](../src/openspec-min/entry.ts)：

| API | 作用 |
| --- | --- |
| `createSpecChange` | 创建变更包、proposal 与 delta specs |
| `runSpecVerifyGate` | 校验文档结构、需求格式和基线合并兼容性 |
| `generateDesignDoc` | 在 Spec 已评审后生成技术设计 |
| `generateTaskList` | 从已评审设计和 Spec 生成任务 |
| `promoteToBaseline` | 将已完成变更合并到基线并归档 |

它负责文档一致性、合并与归档，不负责业务正确性、模型调用或实现代码生成。详细限制见 [openspec-min README](../src/openspec-min/README.md)。

## 5. 模块与依赖方向

```text
bin/instar.mjs
  ├─ spec-discover ──► runtime/discovery-controller/cli.mjs
  └─ 其他参数 ──────► runtime/quality-controller/cli.mjs

workflow-controller
  ├─ openspec-min
  ├─ shared/project-baseline
  ├─ shared/code-reuse
  ├─ shared/token-sources
  └─ 自有 files / documents / evaluation / recovery / write-set

quality-controller
  ├─ shared/process-runner
  ├─ shared/project-baseline
  ├─ shared/code-reuse
  ├─ shared/token-sources
  ├─ shared/redaction
  └─ workflow-controller/files（复用安全路径与 sourceSnapshot）

discovery-controller
  ├─ workflow-controller/files
  ├─ openspec-min/discovery
  └─ openspec-min/diff/parsers
```

依赖方向总体是“入口 → 控制器 → 共享基础设施 / openspec-min”。共享模块不应反向依赖控制器；新增跨控制器逻辑时优先放入 `src/shared/`。

### 5.1 关键模块

| 模块 | 职责 | 关键文件 |
| --- | --- | --- |
| 入口路由 | 区分存量发现与质量命令 | [bin/instar.mjs](../bin/instar.mjs) |
| 工作流控制器 | PRD 到归档的状态机、审批、上下文、事务 | [src/workflow-controller/index.mjs](../src/workflow-controller/index.mjs) |
| 文档与审批 | 工件读取、任务解析、审批哈希、上下文组装 | [src/workflow-controller/documents.mjs](../src/workflow-controller/documents.mjs) |
| 质量控制器 | 快照、检查、门禁、报告、CI | [src/quality-controller/index.mjs](../src/quality-controller/index.mjs) |
| 质量策略 | Q-01 到 Q-07 覆盖与豁免评估 | [src/quality-controller/policy.mjs](../src/quality-controller/policy.mjs) |
| GitHub/CI 编排 | PR 正文、推送、检查、分支保护 | [src/quality-controller/ci.mjs](../src/quality-controller/ci.mjs) |
| 存量发现 | 源码清单、证据校验、预览与落盘 | [src/discovery-controller/index.mjs](../src/discovery-controller/index.mjs) |
| 项目基线 | 规则注册表、采纳与检查 | [src/shared/project-baseline.mjs](../src/shared/project-baseline.mjs) |
| 复用治理 | 能力索引、复用决策与计划一致性 | [src/shared/code-reuse.mjs](../src/shared/code-reuse.mjs) |
| 安全与边界 | 路径、符号链接、输入上限、脱敏 | [src/shared/](../src/shared/) |

## 6. 工作流状态机

目标项目状态文件为 `planning/workflows/<changeId>.json`。阶段顺序为：

```text
prd → spec → design → tasks → implementation → verification → archive
```

### 6.1 状态与审批

| 状态 | 含义 |
| --- | --- |
| `in-progress` | 当前阶段可编辑或可生成 |
| `waiting-clarification` | PRD 阶段存在未回答问题，阻塞所有其他转换 |
| `awaiting-approval` | 已提交待人工审批 |
| `blocked` | 验证发现 critical、unverified 或适用的失败检查 |
| `completed` | 已归档，状态不可变 |

审批类型包括：

- `prd`：PRD 内容哈希。
- `spec`：PRD、proposal、当前 delta specs 与基线 Spec 的组合哈希。
- `implementation`：技术设计、任务、项目基线、复用决定与复用指纹的组合哈希。
- `acceptance`：计划、任务、验证和任务证据的组合哈希。

审批记录同时保存 `reviewHash`、人工确认文本和来源。文档、任务、设计、基线或验证内容发生变化都会使旧审批失效。`approve` 还要求提交时的待审批哈希与当前重新计算值一致。

### 6.2 主要转换

| 动作 | 前置条件 | 结果 |
| --- | --- | --- |
| `start` | 目标项目为 Git 根目录；changeId 尚不存在 | 创建 PRD 与工作流状态 |
| `submit-prd` | PRD 阶段，澄清问题已关闭 | 等待 PRD 审批 |
| `approve(prd)` | 待审批哈希匹配 | 进入 `spec` |
| `create-spec` / `save-spec` | Spec 阶段；上下文未变化 | 写入 proposal 与 delta specs |
| `submit-spec` | 文档结构通过 OpenSpec 门禁 | 等待 Spec 审批 |
| `approve(spec)` | 当前 Spec 门禁仍通过 | 进入 `design` |
| `write-design` | Spec 审批有效，上下文哈希匹配 | 写入 `technical-design.md`，进入 `tasks` |
| `write-tasks` | 设计上下文指纹仍匹配 | 写入任务，等待实施计划审批 |
| `approve(implementation)` | Spec 审批、设计与任务内容未变 | 进入实施阶段 |
| `complete-task` | 已有实施审批 | 为任务记录完成证据 |
| `submit-implementation` | 所有任务已完成且有证据 | 进入 `verification` |
| `submit-quality-review` | 已通过质量门禁且报告稳定 | 绑定质量评审快照 |
| `submit-verification` | 质量评审仍匹配当前源码 | 记录验证结果；通过后等待验收 |
| `approve(acceptance)` | 验收哈希匹配 | 进入 `archive` |
| `archive` | 验证快照未变化，验收审批有效 | 合并基线、写归档、`completed` |
| `reopen` | 目标阶段早于当前阶段 | 删除下游工件与审批，保留事务备份 |

`reopen` 只允许回到已有阶段，不能直接回到 `archive`。归档后状态不可回退。

### 6.3 上下文指纹

生成设计、任务和 Spec 时，控制器组装项目上下文并计算 `contextHash`，包括适用指引、架构/设计文档、Token、项目树和当前工件版本。调用方提交生成结果时必须带回该哈希；上下文变化或版本过期会被拒绝。该机制保证“生成时看到的输入”和“写入时的项目状态”一致，**不证明生成内容的语义质量**。

## 7. 质量与证据链

### 7.1 快照

质量快照至少绑定：

- Git `HEAD`、`baseRef` 解析后的提交、暂存区 `write-tree`。
- 工作区与暂存区文件哈希、Git index、被跟踪和未跟踪文件清单。
- `.instar-quality.json`、`package.json`、`AGENTS.md`、架构/设计文档、Token 文件和项目基线指纹。
- 复用能力索引指纹。
- 项目策略扫描结果。

任何参与指纹的输入变化都会使旧 Review、验证和统一报告过期。

### 7.2 验证与门禁

1. `snapshot` 获取当前指纹。
2. `verify` 执行配置的 `commit` 或 `full` profile。
3. 调用方提交 `review`，其中每个检查项必须有当前快照的证据。
4. `quality-gate` 校验 Review 结构、证据位置、基线引用、复用审查、风险等级和可选工具适配器。
5. `ai-provenance` 记录 AI 生成标记与会话摘要。
6. `pre-pr-check` 要求 full 验证、质量门禁和 provenance 都属于同一快照。
7. `ci prepare/status/publish` 把本地证据写入 PR 正文，并把远端 SHA/Check 与本地 SHA 对齐。

报告链由 `reports/<verify-kind>.json`、`reports/quality-gate.json`、`reports/unified-quality.json` 和证据路径共同组成。`validateEvidenceChain` 会校验报告 ID、状态、检查列表、快照指纹、Git HEAD、策略条目和每个证据文件。

### 7.3 报告完整性

每个报告包含 `reportHash`，用于检测内容被改写。配置 `evidenceTrust.hmacEnv=INSTAR_*` 时，还会附加 `reportSignature`。这只说明报告与指定密钥持有者生成的版本一致，**不是身份认证、用户授权或合规证明**。

## 8. 存量 Spec 发现

发现控制器独立于 PRD 工作流：

1. `context` 扫描指定 `scopes`，生成文件清单、行数、SHA-256、基线索引、活动工作流摘要和 `contextHash`。
2. 宿主中的 AI 阅读源码和测试，编写完整现状 Spec 与逐需求证据。
3. `capture --preview` 只校验并返回差异，不写文件。
4. `capture` 在锁内重新扫描，确认 `contextHash` 和证据源未变化后，以事务写入 `planning/specs/...` 与 `planning/discovery/<uuid>.json`。

扫描上限为 30,000 个 entry、10,000 个文本文件、单文件 1 MiB、总量 64 MiB；基线全文默认最多约 4 MiB，可用 `baselineCapabilities` 限定。已有 Spec 默认受保护，只有显式列入 `update` 才会被替换。产物标记为 `not-human-reviewed`，描述的是**观察到的当前行为**。

## 9. 存储与恢复

目标项目可能产生以下状态目录：

```text
docs/prd/
planning/
  workflows/
  changes/<changeId>/
    proposal.md
    specs/<capability>/spec.md
    technical-design.md
    tasks.md
  specs/<capability>/spec.md
  archive/<changeId>/
  discovery/<uuid>.json
.workflow/
  controller.lock
  pending.json
  traces.jsonl
  transactions/<uuid>/{before,result.json}
reports/
logs/
.instar/quality-transactions/<uuid>/
```

### 9.1 事务模型

- 工作流与发现共用 `.workflow/controller.lock`，同一项目的控制器写入串行化。
- 事务先把受影响的 `planning/`、`docs/prd/` 或发现目标复制到 `.workflow/transactions/<uuid>/before`。
- `.workflow/pending.json` 记录事务身份、写入集合、缺失父目录和备份位置。
- 正常异常触发回滚；进程中断可能留下 `pending.json`，必须使用 `recover` 校验事务 ID 后恢复。
- 工作流、发现和报告写入分别位于不同事务层；报告使用 `.instar/quality-transactions/` 暂存并替换。
- 这不是跨文件系统的分布式原子事务；强制断电、外部编辑器并发写入或恢复失败仍可能留下中间态。

### 9.2 轨迹

成功的控制器动作追加到 `.workflow/traces.jsonl`。`trace-skill` 记录 Skill 生命周期；`quality-evaluation` 追加语义评测记录。轨迹是本地辅助证据，可由项目编辑，不能单独证明 Skill 或模型真实执行。

## 10. 安全模型

### 10.1 路径与输入

- 项目必须是显式绝对路径，且不能位于插件安装目录内。
- 写入路径拒绝 `..`、绝对路径、反斜杠、符号链接和不安全父目录。
- 证据文件以 `O_NOFOLLOW` 打开，避免通过链接替换证据。
- CLI JSON 输入上限为 8 MiB；文本字段和扫描结果另有长度限制。
- 敏感路径（`.ssh`、`.aws`、`.env*` 等）在快照与证据阶段被拒绝或排除。

### 10.2 命令执行

schema 3 的 `tools.checks` 直接 `spawnSync` 项目命令；schema 1/2 通过 npm 执行项目 scripts。执行时过滤敏感环境变量、设置超时和输出字节上限，并禁止 shell 拼接。项目命令本身仍是项目代码，**不是 OS 级沙箱**；运行不可信仓库时应使用宿主沙箱或容器。

### 10.3 Git / GitHub

- 质量控制器只读取 Git 状态、写报告和提交；不支持 force push、主分支推送、自动合并或生产部署。
- Hook 仅拦截**独立的** `git commit` 与 `gh pr create`，不支持命令链、shell 重定向、仓库参数覆盖或从子目录执行。
- `ci publish` 要求显式 `--confirm`、匹配的 remote/repo/host、远端 base SHA、必需的 checks 和 `secretCheck`；L3 还会检查分支保护。
- 认证完全依赖 `gh` 登录态和远端仓库权限；JSON 授权字段只用于流程审计。

`assets/policy.json` 是声明式策略，真正的执行边界仍由宿主沙箱、CI、分支保护和 CODEOWNERS 承担。

## 11. 扩展点

| 扩展 | 位置 | 约束 |
| --- | --- | --- |
| 新 Skill | `skills/<name>/SKILL.md` 与引用资源 | frontmatter 必须是 `name`/`description`；相对链接必须可解析 |
| 项目专用检查 | `.instar-quality.json` 的 `verification.profiles` + `tools.checks` | 必须使用 schema 3；命令、参数、cwd、超时受校验 |
| 风险规则 | `riskPolicy.rules` | 模式必须是项目相对路径，不能降低自动推断出的等级 |
| L3 人工角色 | `riskPolicy.l3.requiredReviewRoles` | 需要外部审批元数据和可选的 required checks |
| 质量策略 | `qualityPolicy.profiles` / `waivers` | full 必须覆盖 Q-01 到 Q-07；Q-07 不可豁免 |
| 项目上下文 | `context.architecture`、`context.design`、`context.tokens` | 路径必须位于项目内、非敏感、无符号链接 |
| 工程基线 | `docs/project-baseline/rules.json` | 规则需有 scope、document 和采纳元数据 |
| 复用能力 | `docs/project-baseline/capabilities/index.json` | 能力源哈希和可见性决定是否可复用 |
| 文档模板 | `skills/spec-*/assets/` 与 `src/openspec-min/artifact-templates/` | `check.mjs` 要求多处模板字节一致 |
| 质量适配器 | schema 1/2 的 `tools.*` npm scripts | 仅用于兼容既有 Vue/npm 流程 |

新增控制器动作时，必须同步更新参数校验、事务写入集合、恢复逻辑、测试和文档；不要只增加分支而绕过写入边界。

## 12. 已知限制与风险

1. **流程正确性不等于产品正确性**：InStar 能证明某个快照上执行了什么、绑定了什么证据，不能证明代码无缺陷、测试充分、AI Review 独立或人工审批真实。
2. **本地报告可编辑**：`reportHash` 只能检测意外改写；没有配置 HMAC 时不能防止有意伪造。
3. **命令执行不是沙箱**：项目检查拥有调用者权限；必须依赖宿主隔离不可信项目。
4. **Hook 是辅助门禁**：只在独立命令和明确项目根目录下工作，最终门禁依赖 CI 与分支保护。
5. **模型不内置**：Skills 需要宿主模型执行；控制器只提供协议、校验和落盘，无法证明模型实际读取了哪些文件。
6. **语义评测有限**：`quality-evaluation` 检查评分项、引文和工件指纹，不能替代人工的产品、架构和安全判断。
7. **零配置能力有限**：没有 `.instar-quality.json` 时，`doctor` 和 `snapshot` 可用；严格门禁和 PR 发布不能通过。
8. **存量发现是观察而非批准**：证据校验只能证明摘录在指定源码范围内，不能证明需求解释或业务语义正确。
9. **事务非绝对原子**：断电、外部并发编辑和恢复失败可能保留中间态；需要备份或版本管理。
10. **openspec-min 有裁剪范围**：不支持多存储、能力退役、无 Spec 变更和自定义 DAG；空能力退役也会被拒绝。

## 13. 代码地图

| 需求 | 起点 |
| --- | --- |
| 改 CLI 参数或路由 | [bin/instar.mjs](../bin/instar.mjs)、[src/quality-controller/friendly-cli.mjs](../src/quality-controller/friendly-cli.mjs)、[src/discovery-controller/cli.mjs](../src/discovery-controller/cli.mjs) |
| 改工作流阶段 | [src/workflow-controller/index.mjs](../src/workflow-controller/index.mjs)、[src/workflow-controller/write-set.mjs](../src/workflow-controller/write-set.mjs) |
| 改审批哈希或上下文 | [src/workflow-controller/documents.mjs](../src/workflow-controller/documents.mjs) |
| 改质量检查或报告 | [src/quality-controller/index.mjs](../src/quality-controller/index.mjs)、[src/quality-controller/policy.mjs](../src/quality-controller/policy.mjs) |
| 改 PR/CI 行为 | [src/quality-controller/ci.mjs](../src/quality-controller/ci.mjs) |
| 改存量发现 | [src/discovery-controller/index.mjs](../src/discovery-controller/index.mjs)、[src/discovery-controller/context.mjs](../src/discovery-controller/context.mjs) |
| 改安全路径/输入 | [src/shared/](../src/shared/) |
| 改构建或发布 | [scripts/build.mjs](../scripts/build.mjs)、[scripts/check.mjs](../scripts/check.mjs)、[scripts/release.mjs](../scripts/release.mjs) |
| 改 Hook | [hooks/quality-hook.mjs](../hooks/quality-hook.mjs) |

相关文档：[使用说明书](PLUGIN-GUIDE.md)、[质量协议](QUALITY.md)、[开发测试手册](LOCAL_TESTING.md)、[评测与验收说明](EVALUATION.md)。
