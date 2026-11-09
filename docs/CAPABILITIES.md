# 能力地图

InStar v2.4 包含 21 个原生 Skill、4 个兼容命令入口（1 个独立诊断命令 + 3 个原生 Skill 的薄委托）、7 个角色资产（1 个实现角色 + 6 个 Reviewer）、一个内嵌 OpenSpec 文档引擎，以及可选的工程规范、设计指引和质量模板。能力按“按需加载”设计，普通任务不应加载全部上下文。

## 1. 总览

| 能力域 | 主要入口 | 结果 |
| --- | --- | --- |
| 项目初始化 | `initialize-project` | 规划目录、AGENTS 指引、项目级 Reviewer 配置 |
| 受控需求交付 | `requirements-workflow` | PRD → Spec → 设计 → 任务 → 实施 → 验收 → 归档 |
| 需求与文档 | `write-a-prd`、`spec-explore`、`spec-propose`、`spec-verify`、`spec-design`、`spec-tasks` | 可审批的需求和规划工件 |
| 存量源码建档 | `spec-discover` | `planning/specs/<capability>/spec.md` 与证据报告 |
| 实现与验证 | `frontend-implement`、`engineering-implement`、`frontend-verify`、`engineering-verify` | 代码、任务证据、验证报告 |
| 质量与评审 | `quality-gate`、`quality-evaluation`、Reviewer 角色 | 代码/架构/安全/UI Review，语义质量报告 |
| 设计能力 | `design-check`、`extract-design-md` | 变更级样式约束，或项目级 `DESIGN.md` |
| 工程辅助 | `engineering-research`、`systematic-debugging`、`context-optimizer` | 调研、根因修复、上下文优化 |
| 交付编排 | `ci` | 功能分支、PR、CI 状态和证据上传 |

## 2. 全部 Skill

### 2.1 工作流与需求

| Skill | 作用 | 关键输入/输出 | 重要边界 |
| --- | --- | --- | --- |
| `initialize-project` | 初始化 InStar 项目集成 | 绝对目标路径、`stack`；`AGENTS.md` 标记块、规划目录、`.codex/agents/`、`.instar.json` | 不生成应用脚手架，不覆盖已有文件，不修改工程依赖；前端资产按 stack 安装 |
| `requirements-workflow` | 管理受控 change 的状态机 | 绝对项目路径、change ID、`ui`/`stack` 分类；阶段与审批 | 必须读控制器状态，不凭对话记忆判断阶段 |
| `write-a-prd` | 编写或修订产品 PRD | 用户问题、范围、旅程、验收标准、风险；`docs/prd/<changeId>.md` | 不写技术方案，不把文件标签当成审批 |
| `spec-explore` | 在需求受控阶段探索问题、架构、方案与风险 | 需求与项目上下文；探索结论 | 探索不是批准；业务范围变化要回到 PRD |
| `spec-propose` | 从已批准 PRD 生成 proposal 与 delta Spec | 新 contextHash、proposal、specs；调用 `create-spec`/`save-spec` | 不直接调用底层引擎绕过控制器 |
| `spec-verify` | 文档结构、合并兼容性、场景与证据审查 | proposal + delta specs；`runSpecVerifyGate` 与 `spec-reviewer` | 不能代替人工 Spec 审批，也不证明实现正确 |
| `spec-design` | 在 Spec 人工批准后编写技术设计 | `technical-design.md`、`contextHash` | UI 变更必须已有 `design-check` 约束；设计单独审批 |
| `spec-tasks` | 从已审批设计和 Spec 生成可执行任务 | 未勾选、编号、带验收证据的 `tasks.md` | 任务审批后才授权实现；不能改已审任务文本 |

### 2.2 实现与验证

| Skill | 作用 | 关键输入/输出 | 重要边界 |
| --- | --- | --- | --- |
| `frontend-implement` | 实现已授权的 UI/前端任务 | 规范、设计、任务、现有代码；代码、任务证据 | 不自行扩大授权；需求冲突回计划阶段 |
| `engineering-implement` | 实现已授权的后端或跨栈任务 | 同上，按语言/API/数据库/安全规则 | 不引入未采用框架，不吞掉失败测试 |
| `frontend-verify` | 前端行为、测试、构建和浏览器证据验证 | Spec/任务、项目命令；报告与 artifact | 浏览器 smoke 不等于 axe；不能伪造真实运行 |
| `engineering-verify` | 前后端/跨栈的配置化验证 | `.instar-quality.json`、profile；命令报告 | 插件不安装工具；命令由项目负责 |
| `quality-gate` | 独立 AI Review，检查正确性、维护性、架构、安全、性能、命名、类型、边界、设计、可访问性 | 变更、上下文、`review.json`；快照绑定报告 | Review 不等于自动批准；必须读代码，不只看退出码 |
| `quality-evaluation` | 对 PRD/Spec/设计/任务做结构化语义评测 | 阶段 rubric、逐项证据、原文指纹 | 机械检查证据形状，不证明语义判断绝对正确 |

### 2.3 设计与工程辅助

| Skill | 作用 | 关键输入/输出 | 重要边界 |
| --- | --- | --- | --- |
| `design-check` | 从项目设计契约、Token 和高保真说明提取当前变更的 Style Constraints | 约束、来源、Token 映射、组件/模式复用证据；供技术设计与实现使用 | 不改项目级 `DESIGN.md`，不凭空造 Token；UI 设计必须有 component/pattern 复用证据或显式无复用理由 |
| `extract-design-md` | 从现有前端源码提取完整设计系统 | 分析组件、CSS、Tailwind、主题、Token；项目根 `DESIGN.md` | 保留既有人工章节；不修改应用样式 |
| `engineering-research` | 在新增依赖或陌生 API 前做证据化调研 | 仓库现状、锁定版本、官方文档、替代方案 | 不为了研究而联网或安装依赖 |
| `systematic-debugging` | 复现、定位最早失败边界并做最小根因修复 | 复现、证据、修复、回归测试 | 不关闭检查、不吞错误、不盲目重试 |
| `context-optimizer` | 审计和改进 AGENTS/上下文的可发现性与信噪比 | 来源映射、重复/冲突/陈旧项、最小修订 | 审计默认只报告；不能仅为缩短而删规则 |
| `ci` | 功能分支提交、PR、Review 证据和 CI 检查编排 | 绝对项目路径、分支、`.instar-quality.json` 的 CI 配置 | 不推主分支、不 force push、不自动合并或部署 |

### 2.4 存量发现

| Skill | 作用 | 关键输入/输出 | 重要边界 |
| --- | --- | --- | --- |
| `spec-discover` | 从源码和测试生成现状基线 Spec | context → 人工/代理分析 → preview → capture；`planning/specs/` | 不做 PRD，不执行应用，不把清单当语义证据 |

## 3. 项目命令

| 宿主发现名称 | 入口文件 | 作用 | 备注 |
| --- | --- | --- | --- |
| `instar:source-command-doctor` | `commands/doctor.md` | 检查项目配置、上下文、Token、Agent、依赖、CI 和质量工具 | 生成 `reports/doctor.json`；不自动修复 |
| `instar:source-command-design-check` | `commands/design-check.md` | 为当前 UI 变更提取样式约束 | 返回 Style Constraints 与来源，不写项目设计文件 |
| `instar:source-command-extract-design-md` | `commands/extract-design-md.md` | 从现有前端源码提取项目级设计说明 | 写入项目根 `DESIGN.md`，保留人工内容 |
| `instar:source-command-spec-discover` | `commands/spec-discover.md` | 为已有代码生成现状 Spec | 独立于 PRD 和 change 流程 |

以上名称已在 Codex CLI `0.157.1` 的真实 app-server 中验证。`commands/*.md` 会被宿主迁移为对应的 `source-command-*` Skill；其中 `design-check`、`extract-design-md` 和 `spec-discover` 只是原生 Skill 的薄委托，应优先使用同名原生 Skill；`doctor` 是唯一没有同名原生 Skill 的独立命令。不支持迁移的旧宿主应使用 `bin/instar.mjs` 的 JSON/CLI 入口。

## 4. Reviewer 与人工职责

项目初始化会在 `.codex/config.toml` 注册 7 个角色：

- `architect`：架构与边界分析，只读。
- `developer`：已授权任务实现；不自行绕过评审。
- `ui-reviewer`：视觉、交互、响应式与可访问性证据。
- `code-reviewer`：正确性、回归、安全、维护性和测试覆盖。
- `security-reviewer`：认证、授权、输入、秘密、注入和数据边界。
- `spec-reviewer`：proposal/delta specs 与 PRD、基线和项目规则的一致性。
- `frontend-reviewer`：前端实现、设计和验证证据的一致性。

Reviewer 只提供发现与证据，不编辑文件、不代替人工审批。主代理通过 `trace-agent` 记录实际执行者、`reviewedFiles`、findings、`executionMode` 和报告指纹。Subagent 不可用时，必须在显式允许的 workflow 中标记 `main-agent-fallback`，不能伪装成独立 Subagent。

强制矩阵：实现审批前要求 `architect` + `code-reviewer`；Spec 提交前要求 `spec-reviewer`；验证前要求 `security-reviewer`，frontend/fullstack UI 再加 `frontend-reviewer`，UI 再加 `ui-reviewer`。`developer` 是实现角色资产，不是独立门禁 Reviewer。

## 5. 内置知识资产

### 5.1 工程规范

`standards/` 提供按需参考，不是自动项目政策：

- `architecture/`：架构基线（模块边界、依赖方向、设计原则）与可选 FSD 参考。
- `coding/`：语言无关的命名、导入、错误处理。
- `api/`：API 设计规范，覆盖契约、安全、兼容性与验证。
- `database/`：数据库设计规范、查询规范、迁移、PostgreSQL。
- `languages/`：TypeScript、JavaScript、Python、Go、Java、Rust、Vue 3、CSS。
- `common/`：跨领域安全与测试基线，覆盖单元、组件、集成和 E2E 规则。

### 5.2 设计系统

`design-guidance/` 包含视觉审查、组件与交互审查、布局与响应式审查、可访问性、主题、Token 和 Review 清单。主题规则按需读取；不会自动复制到目标项目或强制采用，也不提供产品专属主题或配色。

### 5.3 模板

- `templates/AGENTS.md`：项目工作流指引。
- `templates/agents/`：7 个角色资产的 TOML 注册与角色指令。
- `templates/engineering/`：前端约定与测试指引。
- `templates/quality/`：`npm audit` 安全模板、Playwright + axe 可访问性模板和 schema 3 配置示例。

## 6. 内嵌文档引擎

`src/openspec-min/` 是裁剪后的 OpenSpec 派生运行时，公开 5 个 API：

1. `createSpecChange`
2. `runSpecVerifyGate`
3. `generateDesignDoc`
4. `generateTaskList`
5. `promoteToBaseline`

它负责 proposal/delta Spec 结构校验、ADDED/MODIFIED/REMOVED/RENAMED 合并、设计/任务工件生成和基线归档，不扫描业务源码、不执行测试、不调用模型。完整控制器状态、审批和证据绑定在 `workflow-controller` 中，直接调用引擎会绕过这些门禁，不应作为正常使用方式。

## 7. 明确不包含

- 不生成 Vue/React/后端项目脚手架。
- 不安装或内置 ESLint、Playwright、axe、SAST/SCA、数据库或 CI 引擎。
- 不提供组织身份、SSO、签名策略、集中审计或多租户权限系统。
- 不自动批准 PRD/Spec/设计/任务/验收，也不自动合并或部署。
- 不承诺所有检查都已被执行；缺少证据必须报告为未验证。
