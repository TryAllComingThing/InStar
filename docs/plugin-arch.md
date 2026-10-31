# InStar 插件体系方案

## 一、插件定位

InStar 是面向前后端协同软件交付的 Codex 编排插件，包含 Vue 3 + TypeScript 前端专项能力，以及可配置的跨语言工程验证：

```text
需求理解 → PRD 编写与评审 → Spec 探索、设计与任务拆解
→ 代码实现 → 本地验证 → AI 质量 Review
→ 功能分支提交与 GitHub PR → CI 检查与审计
```

插件负责流程编排、状态管理、质量门禁和交付协调，不实现具体的 ESLint、测试、安全扫描或 CI 引擎。

## 二、核心设计原则

### 1. 插件只做编排

插件负责解析需求、生成计划、编写 PRD、编写和校验 Spec、拆解任务、调用实现流程、按需调研工程方案和系统化调试、调用项目验证脚本、执行 AI Review、准备功能分支和 Pull Request、读取 CI 结果、读取项目规范，以及输出报告和审计日志。

插件不负责实现 ESLint、TypeScript、测试或安全扫描规则，不替代项目 CI，不推送主分支，不自动合并 PR，不部署生产，也不管理生产密钥、SSO 或 GitHub 身份。

### 2. 人工确认优先

PRD、Spec、代码实施和最终产品验收均需要人工确认。PRD、Spec 或上下文发生变化后，旧的批准记录和验证报告自动失效。

### 3. npm 作为唯一包管理器

插件运行时、验证流程和文档统一使用 npm：

```text
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## 三、插件目录结构

```text
InStar/
├── .codex-plugin/plugin.json       # 唯一安装清单
├── plugin.json                     # 团队工程索引
├── bin/instar.mjs                  # 人类友好 CLI
├── skills/                         # 需求、Spec、实现和质量技能
├── commands/                       # /doctor、/design-check
├── hooks/                          # hooks.json 和质量 Hook
├── assets/                         # 插件策略元数据
├── agents/                         # Subagent 角色契约（Markdown）
├── templates/agents/               # 项目级 Codex Subagent TOML 注册配置
├── design-system/                  # Skills 使用的设计规则与主题参考
├── src/                            # 源码
├── runtime/                        # 构建运行时
├── docs/                           # 使用、测试和架构文档
├── logs/                           # 审计日志目录
└── test/                           # 自动化测试
```

`.codex-plugin/plugin.json` 是唯一安装清单，根目录 `plugin.json` 仅作为工程索引。

## 四、Skill 能力体系

### 1. 需求与上下文

- `initialize-project`：初始化项目工作流目录和审查角色；不强制创建重复的架构、设计、状态或经验文件。
- `requirements-workflow`：整理需求目标、范围、约束、依赖、风险和反馈。
- `write-a-prd`：生成目标、场景、范围、验收标准、边界和风险组成的 PRD。

### 2. Spec 工作流

- `spec-explore`：分析现有代码、影响范围、技术路径和风险。
- `spec-discover`：独立探索存量工程，生成带源码证据的 `planning/specs/<capability>/spec.md`，支持指定模块及显式更新；不要求 PRD 或实施流程。宿主模型负责语义分析，`discovery-controller` 负责清单、指纹、预览、证据校验和事务捕获，文档引擎复用 OpenSpec 主规格解析与校验。
- `spec-propose`：将需求转换为可执行 Spec 和场景。
- `spec-verify`：校验 Spec 结构、需求覆盖、场景和验收标准。
- `spec-design`：生成模块边界、数据流、组件关系和接口设计。
- `spec-tasks`：按依赖拆分实施任务并关联验收条件。

### 3. 实现与质量

- `engineering-implement`：在授权后按确认的 PRD、Spec 和任务实现后端及跨栈代码。
- `frontend-implement`：在授权后按确认的 PRD、Spec 和任务实现 UI/Vue 代码。
- `design-check`：读取项目设计规范、真实 Token 来源和获批的高保真说明，为当前 UI 变更生成可执行的 Style Constraints 与有来源的 Token 映射；不改写项目长期设计文档或 Token。
- `engineering-verify`：按 schema 3 配置直接运行项目已有的前后端检查命令。
- `frontend-verify`：兼容旧项目并调用 npm lint、typecheck、test、build、Vite 检查、依赖检查和可选 E2E/视觉回归。
- `quality-gate`：执行架构、类型、组件边界、Vue 反模式、设计约束和 AI 代码 Review。
- `context-optimizer`：按需审计和改善项目指令与工程上下文。
- `engineering-research`：实现前核对现有方案、锁定版本和官方资料。
- `systematic-debugging`：按证据复现、定位并修复故障。
- `ci`：准备功能分支、推送、创建或复用 PR、读取 CI、上传 Review 报告并定位失败原因。

本次变更的技术方案存放在 `planning/changes/<changeId>/technical-design.md`；项目长期设计规范由项目选择自己的规范路径。Spec 和技术方案上下文会读取适用的 `AGENTS.md`、配置或发现的架构/设计文档、项目 `standards/` 文档和目录概览，并将这些输入纳入上下文指纹。可在 `.instar-quality.json` 的 `context.architecture`、`context.design` 中指定路径；未配置时按 `docs/engineering/`、`docs/architecture/`、`docs/design/`、旧 `.context/` 顺序发现。缺少这些文档不会阻断工作；项目自行维护架构规则，InStar 不强制采用特定架构模式。

`design-check` 面向单次变更，结合项目设计文档、已有 Token、PRD/Spec 和人工确认的高保真参考，输出 `technical-design.md` 的 Style Constraints。`extract-design-md` 面向整个已有前端项目，归纳色彩、字体、间距、组件、布局和响应式行为，按请求更新项目根目录 `DESIGN.md`，保留人工内容并标注源码证据与解释。插件内 `design-system/`（含企业、批发、深色主题说明）是可选建议材料，不会复制成目标项目设计系统或引入主题引擎。`initialize-project` 可将四个角色契约安装为项目 `.codex/agents/*.md`，并在保留现有 TOML 内容的前提下追加缺失的 `.codex/config.toml` 注册项；损坏配置或角色名冲突会报告，不静默覆盖。Codex 只在受信任项目加载该配置。Doctor 会检查 TOML 解析、注册项和角色文件，但不能判断宿主信任状态。Token 来源解析由质量检查与 Spec 上下文共用，缺失、链接或非普通文件均会一致报错。

插件只调用外部质量工具，不实现这些工具本身。

## 五、项目边界

InStar 不生成 Vue/后端工程、脚手架、工程模板或质量配置，也不向目标仓库复制 `assets/`、`standards/` 或 `design-system/` 内容。团队通过自己的项目模板与工程工具创建仓库；项目需自行维护 `.instar-quality.json`，schema 3 可映射任意本地可执行验证命令。`initialize-project` 仅初始化需求与 Spec 工作流目录、规则和 Agent 配置。

## 六、人类友好 CLI

日常使用不需要记忆 JSON：

```sh
node <plugin>/bin/instar.mjs doctor
node <plugin>/bin/instar.mjs snapshot
node <plugin>/bin/instar.mjs verify --profile full
node <plugin>/bin/instar.mjs review --review-file ./review.json
node <plugin>/bin/instar.mjs ci prepare --title "feat: example"
node <plugin>/bin/instar.mjs ci status
```

`ci publish --title "..." --confirm` 才会推送功能分支并创建或更新 PR。Review 文件必须匹配 `snapshot` 输出的指纹。

可使用 `--project` 指定项目目录；不传时默认使用当前目录。底层 JSON CLI 保留给自动化、CI、测试和 IDE 集成。

## 七、Command 与 Hook

`/doctor` 用于检查已配置或发现的项目上下文、npm 依赖、项目脚本、锁文件、CI 配置和外部质量脚本。上下文文档缺省时显示 INFO。

Hook 配置固定在 `hooks/hooks.json`：

- `pre-commit-check`：提交前验证和 Review，失败默认阻止提交。
- `session-close`：生成 `logs/` 会话审计日志；只有显式配置并提供真实摘要时才更新项目状态或经验文件。
- `pre-pr-check`：创建 PR 前检查完整验证、最新 Review 和 AI 溯源。

Hook 不主动调用网络或 AI。

## 八、上下文与产物契约

```text
AGENTS.md                         项目指令入口（项目拥有）
项目架构与设计文档                 项目自行维护和配置
.instar-quality.json               路径映射与质量工具配置
reports/                           验证、Review、CI 和设计检查报告
logs/                              执行日志、Hook 审计和会话摘要
```

上下文文件可以留在项目已有位置；InStar 优先读取配置路径，其次发现常用文档路径，并兼容旧 `.context/`。会话状态与经验默认不持久化到项目规范文件；需要时可显式设置 `context.sessionState`、`context.lessons`，仅记录本次提供的内容。

报告绑定 Git HEAD、base 分支、工作区、暂存区和项目上下文指纹。代码或上下文变化后，旧报告自动失效。

## 九、安全与 GitHub 边界

插件运行在 `workspace-write` 沙盒中，禁止修改 `~/.ssh`、`~/.aws`、`.env.production`、SSO 配置和生产密钥。

CI 允许功能分支推送、Pull Request 创建、CI 状态读取和 Review 报告上传；禁止推送主分支、Force Push、自动合并和生产部署。认证由 GitHub/宿主环境负责，插件不保存凭据。

发现密钥泄露时，CI 直接返回 BLOCK。

## 十、发布和验证

维护者使用：

```sh
npm ci
npm test
npm run release
npm run test:release
```

验证覆盖 Skill、资源链接、清单、Hook、CLI、运行时、发布包、工作流初始化、失败路径和安全边界。

完整交付闭环为：

```text
需求 → PRD → Spec → technical-design.md + tasks.md 实施计划评审/授权 → 代码实现
→ npm 本地验证 → AI Review → 功能分支推送
→ Pull Request → CI 检查 → 审计归档
```

InStar 面向小团队的开发质量工作流，不提供组织身份治理、签名策略分发或集中审计服务。GitHub/`gh` 负责认证和仓库权限，CI 与分支保护负责共享合并门禁；InStar 负责执行本地检查、汇总证据和提示用户授权外部操作。

主分支合并和生产部署由人工及组织级 CI/分支保护完成。
