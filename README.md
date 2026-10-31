# InStar

InStar 是一个 Codex 软件交付插件，支持前后端协同的需求、Spec、设计、任务与验证流程。前端 Vue 质量门禁是当前成熟的专项能力；后端可复用 API、数据库、安全和多语言规范，并通过 `engineering-verify` 配置项目自己的检查命令。插件只负责编排，不实现 ESLint、测试、安全扫描或 CI 引擎。

Spec 和技术方案阶段会读取项目适用的 `AGENTS.md`、按配置或约定发现的架构/设计文档与可选 `standards/`，并将规则纳入生成上下文。插件内 `standards/` 按通用、语言、API、数据库分层；Skill 根据代码和任务按需加载，不把建议强加给项目。架构规范由项目维护；InStar 不强制采用特定架构模式。

## 能力地图

### 需求与 Spec

需求与实现 Skill：`initialize-project`、`requirements-workflow`、`write-a-prd`、`spec-explore`、`spec-discover`、`spec-propose`、`spec-verify`、`spec-design`、`spec-tasks`、`engineering-implement`、`engineering-verify`、`frontend-implement`、`frontend-verify`。设计、质量与辅助 Skill：`design-check`、`extract-design-md`、`quality-gate`、`quality-evaluation`、`ci`、`context-optimizer`、`engineering-research`、`systematic-debugging`。共 21 个 Skill 入口。

`extract-design-md` 从现有前端代码整理完整的视觉设计说明，涵盖色彩、字体、间距、组件、布局和响应式行为，并按请求写入项目根目录 `DESIGN.md`。它保留源码中的原始值和项目命名，区分观察事实与设计解释，不修改应用样式。

需求流程必须经过 PRD 人工确认，再进入 Spec；Spec 变更会重新验证并等待确认；生成技术设计和任务后，用户需明确批准完整实施计划才能开始实现，最终验收也需单独确认。

工作流控制器会将成功的状态变更写入目标项目 `.workflow/traces.jsonl`；requirements-workflow 按指引登记 specialist Skill 的开始/结束。`quality-evaluation` 为 PRD、Spec、技术设计和任务输出带原文证据及指纹的语义评测报告。评测和 Skill 轨迹是本地可编辑的辅助证据，不替代人工审批或证明模型实际执行。

### 工作流初始化

`initialize-project` 只准备 InStar 需求与 Spec 工作流所需的目录、指令和项目级 Agent 配置，不生成应用代码、质量配置或工程模板。前端工程的创建与依赖配置由团队自己的模板或工程工具负责；接入质量控制时，由项目维护 `.instar-quality.json` 并配置已有 npm 脚本。

### 从现有源码生成 Spec

在目标项目中对 AI 调用：

```text
$spec-discover 分析当前工程，为已有功能生成 Spec。
$spec-discover 分析 src/orders 和相关测试，为订单模块生成现状 Spec。
$spec-discover 根据当前代码更新 orders/search 的现状 Spec，保留其他能力。
```

AI 按移植并改造的 OpenSpec 探索方法阅读源代码，输出
`planning/specs/<capability>/spec.md`，附逐条需求的源码位置和快照指纹。
它独立于新增需求工作流，无需初始化、PRD、proposal 或实施任务。
生成结果描述已观察到的行为，不等同于人工批准的产品要求；缺少证据的行为
列为未知。默认保护已有 Spec，明确要求更新时才替换指定能力并保留事务备份。

终端入口提供源码清单/生成指令，以及对 AI 已编写结果的预览与落盘；终端本身
不调用模型。支持重复 `--scope` 参数。查看 [发现协议](skills/spec-discover/references/protocol.md)
了解 JSON 输入、证据格式、扫描限制和覆盖报告：

```sh
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project --scope src/orders
node <plugin>/bin/instar.mjs spec-discover --input /tmp/discovery-request.json --preview
# 请求中的 preview 改为 false 后落盘：
node <plugin>/bin/instar.mjs spec-discover --input /tmp/discovery-request.json
```

源码分析不会自动执行应用或测试。报告会区分已读文件、未读文件和排除项，
大型项目按模块分批处理。移植来源和改动见 [记录](skills/spec-discover/references/ported-method.md)。
当项目已有 Spec 总量较大时，可在 context 与 capture 请求中同时提供
`baselineCapabilities: ["orders/search"]`，只将相关能力全文加载到分析上下文。

### 质量和交付

- `engineering-verify`：按 schema 3 项目配置执行前后端通用检查，可映射任意本地命令，不要求 npm 或特定框架；旧版配置仍由 `frontend-verify` 兼容执行。
- `frontend-verify`：兼容现有 Vue/npm 工作流，commit profile 运行 lint、typecheck、dependencies；full profile 额外运行 test、build、vite-build，以及项目配置的 E2E/视觉检查。
- `quality-gate`：执行通用 AI Review 和已配置适用的架构/质量适配器；Vue 工具按项目配置启用。后端专项结果依赖项目配置的验证命令和 Review 证据。
- 开发辅助 Skills：`engineering-research` 在新增依赖或不熟悉集成前做证据检索；`systematic-debugging` 用于根因诊断；`context-optimizer` 在上下文膨胀、冲突或过时时审计并改进可发现性。
- `ci`：准备或执行功能分支推送、PR 创建/复用、Review 报告发布、CI 检查读取和失败定位。
- `doctor`：诊断可选项目上下文、依赖、CI 和外部质量脚本。

报告写入目标项目 `reports/`，执行摘要写入 `logs/`。报告绑定 Git HEAD、base、暂存区和工作区指纹，代码变化后旧报告不能继续用于 PR。

### Hook

`hooks/hooks.json` 使用 `PreToolUse` 和 `SessionEnd`：提交/PR 前校验本地证据，会话结束时写入 `logs/` 审计摘要；仅在 `.instar-quality.json` 显式配置时才更新项目状态或经验文件，且不自动推断空白内容。Hook 是 Codex 工具调用的辅助门禁，最终约束由 CI 和分支保护执行。

## 安装

维护者构建发布包：

```sh
npm ci
npm run release
```

本地 marketplace 位于 `release/`。使用 Codex CLI 安装：

```sh
codex plugin marketplace add /absolute/path/to/InStar/release
codex plugin add instar@instar-local
```

插件运行时不需要使用者安装 npm 依赖；目标项目需要自行安装其工程依赖和外部质量工具。
运行时依赖及许可证见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 快速开始

- **修改已有功能**：按用户授权和项目现有流程实施，完成后按项目配置调用验证：schema 3 后端/跨栈项目使用 `engineering-verify`，旧 Vue/npm 项目使用 `frontend-verify`；只有需要受控 PRD/Spec 与实施审批的变更才走 `requirements-workflow`，不要为小改动强制创建 PRD/Spec。
- **提取现有 UI 视觉规范**：调用 `extract-design-md`，审阅源码依据后写入项目根目录 `./DESIGN.md`。
- **从存量代码探索 Spec**：调用 `spec-discover` 分析指定目录或模块；预览覆盖与证据后生成或更新 `planning/specs/`，无需启动新增需求流程。

需要规划新功能时使用 `requirements-workflow`，由它按阶段调用 PRD、Spec、设计、任务、实施与验收 Skills。跨端变更应在技术设计中明确 API 合约、数据模型/迁移、授权边界、前后端兼容与部署顺序。API、安全、数据库、浏览器验证等专项规则按实际改动触发。`spec-discover` 可探索多种技术栈；后端质量深度取决于项目配置的实际工具和检查命令，插件不会把未运行的检查报告为通过。

## 日常命令

发布包提供无需记忆 JSON 的快捷入口：

```sh
node <plugin>/bin/instar.mjs doctor
node <plugin>/bin/instar.mjs snapshot --project .
node <plugin>/bin/instar.mjs verify --profile full
node <plugin>/bin/instar.mjs review --project . --review-file ./review.json
node <plugin>/bin/instar.mjs ci prepare --project . --title "feat: add order filtering"
node <plugin>/bin/instar.mjs ci status --project .
# Publishing pushes the reviewed feature branch and creates or updates a PR.
node <plugin>/bin/instar.mjs ci publish --project . --title "feat: add order filtering" --confirm
```

先用 `snapshot` 获取当前变更指纹，再由 Review 产出完整 `review.json`；文件需包含 `reviewer`、该 `fingerprint` 和 17 项检查证据，格式见[质量协议](docs/QUALITY.md)。`ci publish` 的 `--confirm` 是明确授权提示；实际认证仍由 `gh` 登录态和仓库权限承担。`ci prepare` 只生成 PR 正文。未传 `--project` 时使用当前目录。插件内的 `design-system/DESIGN.md` 和规则文件由 Skills 按需引用，不复制到项目。

## JSON CLI

发布包中的质量控制器入口：

```sh
node <plugin>/runtime/quality-controller/cli.mjs <request.json|->
```

质量控制器不提供项目初始化 action。目标项目需自行准备 `.instar-quality.json`、npm scripts 和 Git 仓库；完整 action、配置、报告和 GitHub 边界见 [质量协议](docs/QUALITY.md)。

## 安全边界

插件禁止写入 `~/.ssh`、`~/.aws`、`.env.production`、SSO 配置和生产凭据；不推送主分支、不 force push、不自动合并、不部署生产。质量验证会运行项目 `.instar-quality.json` 指定的 npm scripts；这些脚本是项目代码，环境变量过滤和 npm 离线参数不构成 OS 级沙箱。对不可信仓库运行时应使用宿主沙箱或容器。提交或 PR 操作需要当前会话中的明确用户授权；JSON 确认字段仅供流程审计，不能证明用户身份。GitHub 身份认证由 `gh` 登录态、分支保护和 CI 负责。Hook 是最佳努力的本地反馈，不可替代远端 required checks；Hook 本身不主动联网调用模型。

## 测试

```sh
npm test
npm run release
```

详细步骤见 [使用与本地测试手册](docs/LOCAL_TESTING.md)。真实 GitHub、真实外部扫描器、真实模型和浏览器验收需要目标项目单独联调，插件自动测试不伪造这些结果。
