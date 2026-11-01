# InStar v2.4 插件使用手册

## 1. 插件定位

InStar 是面向 Codex 和 AI 辅助研发团队的软件交付编排插件。它把需求、Spec、设计、任务、实现、验证、Review 以及可选的 Pull Request/CI 连接成一条可追溯流程。

它不实现 ESLint、测试框架、安全扫描器或 CI 引擎，而是调用目标项目已有的命令并记录结果。项目仍然拥有自己的架构规范、设计规范、测试工具和发布权限。

项目接入模板见 [`examples/quality/`](../examples/quality/)，包含 schema 3 配置、commit/full profile、Q-01 至 Q-07 映射以及 L0–L3 风险路由示例。

## 2. 能力地图

### 需求和规划

- `requirements-workflow`：管理 PRD、Spec、设计、任务、实施、验证和验收阶段。
- `write-a-prd`：编写用户目标、范围、场景和验收标准。
- `spec-explore`：探索技术问题、影响范围和方案选项。
- `spec-propose`：从已确认需求生成提案和 delta Spec。
- `spec-verify`：检查 Spec 结构、覆盖和场景。
- `spec-design`：生成技术设计、模块边界、数据流和接口方案。
- `spec-tasks`：将设计拆成有依赖顺序的实施任务。

### 存量系统建档

- `spec-discover`：从现有代码生成带源码证据的当前状态 Spec。
- 支持项目级、目录级和能力级范围。
- 记录已读文件、未覆盖文件、排除项、源码哈希和未知行为。
- 不把代码现状自动当成业务需求。

### 实现和验证

- `engineering-implement`：后端和跨栈实现指导。
- `frontend-implement`：Vue/TypeScript 前端实现指导。
- `engineering-verify`：按 schema 3 配置运行任意本地工程检查。
- `frontend-verify`：兼容旧版 Vue/npm 项目的验证流程。
- `quality-gate`：执行通用和技术栈相关的 AI 辅助 Review。
- `quality-evaluation`：评估 PRD、Spec、技术设计和任务清单的完整性。

### 设计和研发辅助

- `design-check`：为单次 UI 变更提取项目设计约束和 Token 映射。
- `extract-design-md`：从现有前端代码生成或更新 `DESIGN.md`。
- `engineering-research`：在新增依赖或陌生集成前进行证据调研。
- `systematic-debugging`：按复现、假设、根因和回归验证处理问题。
- `context-optimizer`：整理项目规则、架构文档和设计上下文。

### PR、CI 和审计（可选）

- `ci`：在项目已接入 GitHub/CI 时准备和发布功能分支、创建或更新 PR、读取 CI 状态；未接入时不影响本地流程。
- Hook：在提交和创建 PR 前检查本地证据。
- `reports/`：保存验证、Review、CI 和设计检查报告。
- `logs/`：保存执行摘要和会话审计信息。
- `.workflow/`：保存工作流状态、事务和轨迹。

## 3. 推荐使用路径

### 小改动或 Bug 修复

```text
doctor
→ snapshot
→ verify --profile commit
→ quality-gate
→ git commit
```

如果项目没有 CI/GitHub，提交前完成本地闭环即可：

```text
verify --profile full
→ quality-gate
→ ai-provenance
→ pre-pr-check
```

如果项目已接入 CI/GitHub，再追加远端交付闭环：

```text
verify --profile full
→ quality-gate
→ ai-provenance
→ ci prepare
→ ci publish
→ ci status
```

### 新功能或跨端变更

```text
PRD
→ PRD 人工确认
→ Spec
→ Spec 人工确认
→ technical-design.md
→ tasks.md
→ 实施授权
→ 代码实现
→ full verify
→ quality-gate
→ 人工验收
→ PR/CI
```

### 遗留系统建档

```text
spec-discover context
→ 阅读源码和测试
→ 生成带证据的 Spec
→ preview
→ capture
→ 审阅 coverage 和 limitations
```

示例命令：

```sh
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project --scope src/orders
node <plugin>/bin/instar.mjs spec-discover --input /tmp/discovery-request.json --preview
```

## 4. 按风险选择流程

| 变更 | 建议入口 | 必需证据 |
| --- | --- | --- |
| 文案、注释、格式 | 普通 Git/PR | 基本 Review |
| 单模块 Bug 或 UI 调整 | `systematic-debugging`、`frontend-verify` 或 `engineering-verify` | 测试/构建结果、Review |
| 跨模块或跨前后端功能 | `requirements-workflow` | PRD、Spec、设计、任务、full verify；CI 可选 |
| API、权限、数据库迁移 | 完整工作流 + 安全/架构评审 | API、数据、授权、迁移和回滚证据 |
| 支付、认证、敏感数据、基础设施 | L3 受控流程 | 多角色审批、full verify、人工验收和发布方案；CI 可选增强 |

控制器会对常见认证、授权、迁移、支付、基础设施和 `.github/workflows/` 路径自动提升风险等级；项目可在 `.instar-quality.json` 的 `riskPolicy.rules` 中补充路径规则。L3 必须配置人工 Reviewer 角色、人工审批和人工验收；`requiredChecks` 仅在项目已接入 CI/GitHub 时配置。没有远端基础设施时，L3 仍可通过本地 `full verify`、结构化 Review 和人工审批完成，但报告必须披露“远端未接入”。

## 5. 项目接入要求

目标项目需要自行提供：

- Git 仓库和稳定的 base 分支。
- 项目已有的 lint、类型检查、测试、构建和安全检查命令（零配置发现不会猜测或执行这些命令）。
- 需要时提供 E2E、视觉回归和数据库迁移检查。
- 项目架构、设计和 Token 文档。

`.instar-quality.json` 是可选的项目质量门禁配置：需要可重复的 full verify、Review 证据和 `pre-pr-check` 时由项目自行维护；只做 `doctor`、`snapshot` 或首次零配置诊断时不需要创建它。

以下属于可选的远端增强条件，而不是本地质量流程前置条件：

- GitHub CLI 登录态、功能分支、Pull Request 和 required checks。
- CI workflow、分支保护、CODEOWNERS 和远端审计存储。

InStar 不会自动生成工程脚手架、质量配置或测试工具。首次接入建议先运行：

```sh
node <plugin>/bin/instar.mjs doctor
node <plugin>/bin/instar.mjs snapshot --project .
```

## 6. 主要产物

| 路径 | 内容 |
| --- | --- |
| `planning/changes/` | PRD、Spec、技术设计和任务清单 |
| `planning/specs/` | 存量系统的当前状态 Spec |
| `reports/` | 验证、Review、CI 和设计检查报告 |
| `logs/` | 命令摘要、会话摘要和审计日志 |
| `.workflow/` | 工作流状态、事务备份和轨迹 |
| `DESIGN.md` | 按请求生成的前端视觉设计说明 |
| `reports/pr-body.md` | 待发布到 PR 的验证和 Review 摘要 |

报告通常绑定 Git HEAD、base、工作树和项目上下文指纹。代码或上下文变化后，应重新验证，不要复用旧报告。

## 7. 角色分工建议

- 产品负责人：确认 PRD、范围和用户验收标准。
- 技术负责人：确认 Spec、架构影响、接口、数据和迁移设计。
- 开发者：按任务实现并提供任务完成证据。
- 测试负责人：确认测试策略、异常路径和浏览器证据。
- 设计负责人：确认 UI 规范、Token 和视觉验收。
- 安全/数据负责人：参与权限、敏感数据、迁移和并发相关变更。
- 代码 Reviewer：进行独立人工评审，AI Review 只能作为补充。
- 发布负责人：在项目启用远端交付时维护 CI、分支保护、required checks 和豁免记录；本地项目仍需维护验证配置和人工审批记录。

## 8. 能力边界

### 可以承诺

- 将流程阶段、审批和实施授权显式化。
- 将验证结果绑定到特定代码快照。
- 在代码变化、报告过期或已配置的远端 SHA 不一致时阻断流程。
- 编排项目已有的验证命令，以及项目已接入时的 GitHub PR/CI 操作。
- 生成存量代码的带证据现状 Spec。

### 不能承诺

- 不保证代码没有 Bug 或安全漏洞。
- 不保证 AI Review 真实、独立或语义正确。
- 不保证项目配置覆盖所有风险。
- 不替代人工验收和代码 Review；在项目接入 CI/GitHub 时，也不替代 CI、分支保护和 CODEOWNERS。
- 不提供组织级身份治理、不可抵赖审计或生产部署控制。

对不可信仓库运行检查命令时，仍必须使用宿主沙盒或容器。项目配置命令具有项目代码权限，InStar 不是 OS 级安全沙盒。

## 9. 推荐试点方式

第一阶段只读基线：运行 `doctor`、`snapshot` 和 `spec-discover`，不启用强阻断。

第二阶段证据辅助：在已有测试的项目中启用验证、Review 和本地证据；项目已有 CI 时再纳入 PR 证据。

第三阶段风险门禁：对 L2/L3 变更启用 full verify、结构化 Review 和人工角色审批；已接入 CI/GitHub 的项目再启用 required checks 和分支保护。

第四阶段团队推广：固化项目模板、配置基线、指标和升级策略。

成功标准应关注返工、逃逸缺陷、过期证据、验证耗时和开发者接受度，而不只是报告数量或 AI Review 通过率。
