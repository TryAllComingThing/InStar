---
name: quality-gate
description: Review software changes across frontend, backend and full-stack code against project architecture, security, correctness and applicable technology-specific rules. Use after local verification and before commits or PRs to produce snapshot-bound evidence; do not use for document-only quality evaluation. 适用于代码审查、质量门禁和提交前证据。
compatibility: Requires the full InStar plugin package; plugin-root standards and design guidance resolve from the installed plugin root.
---

# AI 质量门禁

## 触发与输入契约

本地验证完成后、提交前或 PR 前使用。输入：绝对项目路径、与 baseRef 比较的代码变更（包括未跟踪文件）、适用的 `AGENTS.md`、已配置或发现的项目架构/设计文档、项目 `standards/`、PRD/Spec、`technical-design.md` 和设计约束。阅读 [质量协议](../../docs/QUALITY.md)，调用 snapshot 取得本次检查的 fingerprint。项目上下文文档是可选输入；优先使用项目现有规范，不为满足插件而复制空文件。必须实际阅读变更及相关调用链，不能用工具退出码代替 AI Review。

按变更读取 [InStar review guidance](../../standards/README.md) 中与文件语言和领域匹配的规范；API 变更查阅 API 设计规范，数据库变更查阅数据库设计、查询与迁移规范。UI 变更参考 [design review checklist](../../design-guidance/rules/review-checklist.md)、相关设计规则和已有的 design-check Style Constraints。若没有该产物，按用户/项目规范和代码现状审查，不虚构 Token 门禁。插件规则用于补充审查，不自动升级为项目门禁；项目采用的规则和已配置工具才决定 BLOCK。不要因为项目未采用插件示例而要求引入特定框架、主题系统、Design Token 或样式架构。

Use `schemaVersion:2` for new quality reviews. Every applicable check must include a non-empty `references` array with project-relative `path` and optional 1-based `line`; the controller verifies those files exist. Set `executionMode` to `subagent` only when the named reviewer Agent actually ran, otherwise use `main-agent-fallback`. The required reviewer set for tracked workflows is architect and code-reviewer for implementation; security-reviewer for verification, frontend-reviewer for frontend/fullstack UI, and ui-reviewer for UI. A quality review is not a substitute for those independent role reviews. Reports, traces and fingerprints are local audit records, not cryptographic proof of reviewer identity; team gates must be enforced in remote CI and branch protection.

对所有变更评估正确性、可读性/可维护性和架构；安全与性能按风险触发。安全敏感变更（认证/授权、API 边界、SQL、文件上传、反序列化、秘密、依赖或出站请求）必须审查对应安全控制并引用代码或测试证据。性能重点检查热路径、大数据/列表、渲染、数据库查询或并发行为；无相关风险时标 NA 并解释。不要把“性能审查”机械理解为要求基准测试，也不要把建议性优化当 BLOCK。

## 允许工具与流程

允许本地文件读取、Git 只读命令和质量 CLI；AI Review 由当前已授权的 Codex 会话完成。禁止在本地 Hook 中额外联网调用模型。先检查架构、命名、类型、组件边界、设计一致性，再逐项检查：

| ID | 范围 | 必查内容及适用性 |
| --- | --- | --- |
| correctness | 通用 | 需求/Spec、边界条件、状态与错误路径是否正确；列出可复查证据 |
| maintainability | 通用 | 命名、复杂度、重复、可测试性和项目惯例；避免固定行数等僵硬门槛 |
| architecture | 通用 | 模块职责、接口、依赖方向及既有架构约束 |
| security | 通用 | 安全边界及相应控制；无安全相关变更标 NA 并说明理由 |
| performance | 通用 | 有热路径/数据量/渲染/查询影响时检查风险；否则标 NA 并说明理由 |
| naming | 通用 | 命名是否清楚并符合项目领域词汇和既有约定 |
| types | 通用 | 公共边界类型及不可信数据的运行时验证是否充分 |
| component-boundaries | 通用 | UI 组件或服务模块职责、接口、状态所有权和副作用边界是否清晰；按代码类型选择检查对象 |
| design | 通用（UI 适用） | UI 变更是否符合项目设计说明和已确认的视觉约束；无 UI 变更时标 NA 并说明 |
| accessibility | 通用（UI 适用） | 键盘/焦点、语义、标签、对比度和自动化 axe 结果；无 UI 变更时标 NA 并说明 |
| watch-cleanup | Vue 专项 | watch/watchEffect 创建异步任务、事件或副作用时是否 onCleanup；纯观察且无资源可标 NA |
| v-for-key | Vue 专项 | key 是否唯一、稳定；避免可重排列表使用索引 |
| reactive-destructure | Vue 专项 | 响应式解构是否保留响应性；toRefs/toRef 或已确认 Vue 版本支持的编译器 props 解构均可，不机械强制 toRefs |
| props | Vue 专项 | Props 类型是否明确；可选值是否需要默认值；必填 Prop 不强制多余默认值 |
| computed-purity | Vue 专项 | computed 是否存在写状态、请求等副作用 |
| unmount-cleanup | Vue 专项 | 定时器、事件和资源是否随组件卸载释放 |
| async-component | Vue 专项 | 大型非首屏组件是否适合 defineAsyncComponent；首屏关键组件可说明不适用 |
| lazy-route | Vue 专项 | 路由组件是否合理使用动态 import() |
| api-contract | 后端专项 | API 请求/响应契约、兼容性和错误模型是否明确 |
| input-validation | 后端专项 | 外部输入是否在边界处验证并规范化 |
| authorization | 后端专项 | 认证、授权和资源归属检查是否覆盖所有入口 |
| error-handling | 后端专项 | 错误是否被分类、记录且不泄露敏感信息 |
| data-consistency | 后端专项 | 数据约束、事务边界和并发更新是否保持一致 |
| transactions | 后端专项 | 多步写入是否具备正确的事务与回滚语义 |
| concurrency | 后端专项 | 竞争、幂等、锁和重试行为是否安全 |
| observability | 后端专项 | 日志、指标、追踪和告警是否足以定位失败 |

每项 PASS/BLOCK/WARN/INFO/NA 均提供文件、行号或可复查证据；NA 必须解释适用性。默认清单只包含通用项，不根据仓库中的 Vue 文件或框架痕迹推断技术栈。项目需在 `.instar-quality.json` 中显式声明 `review.framework` 或 `review.language` 才会加入对应专项；Vue 仅在 `framework: "vue"` 时加入 Vue 项，Python/Java/Go 可加入后端项，其他技术栈保留通用项并可通过 `review.extraChecks` 补充。非适用专项标 NA 并说明理由。

调用 `quality-gate`，传入 reviewer、fingerprint、executionMode 和本次选择清单的完整 checks；每项适用检查都带代码引用。运行时只执行已配置的项目适配器。Vue Doctor、Vue AI Sanitizer 等工具只在项目显式配置时运行。先核实项目安装版本及接口；不得猜造工具参数或把插件名称直接当 CLI。项目适配脚本负责把评分阈值/策略违规转换为非零退出码。

## 输出契约

`reports/quality-gate.json` 及历史报告包含工具检查、本次所选 Review 项、证据、严重性、指纹；`logs/` 记录执行摘要。BLOCK 阻止提交/PR，WARN 保留并披露，INFO 提供建议。

## 边界与失败策略

不实现扫描规则、不替代人工合并；不自动修改业务代码或放宽阈值。缺失的已配置工具、上下文不足、未完成 Review、过期指纹均不能放行；上下文不足对应项标 BLOCK。通用 Review 维度必须提供证据；未声明或不适用的技术栈专项标 NA 并说明理由。不要把建议性规则升级为项目门禁，也不要把某一技术栈的检查结果作为其他技术栈正确性的证明。AI 生成变更在后续 PR 使用 ai-generated 标签与项目约定的提交 trailer。

## 审计

记录实际 reviewer 标识、`executionMode`、代码引用和证据，不能伪造独立审查身份。报告是可审阅工件，不是防篡改签名；CI 和人工仍需独立验证。设计和 Review 证据应说明复用了哪些现有组件、Token、布局和交互模式，以及必要的偏离理由；控制器只能校验来源指纹。完成质量门禁后，用 `record-usage` 记录可测量的 Token/API 消耗；SessionEnd Hook 会尝试从 Codex 会话导入，历史缺失值不得估算。

## 设计约束

项目配置或发现的设计文档中的 UI 约束由 `design-lint` 适配器检查。本 Skill 不内置项目设计规则。schema 1/2 若 `.instar-quality.json` 配置 `tools.architecture`，运行该项目架构检查脚本并要求成功；未配置时明确标记为 INFO。schema 3 使用 `tools.checks` 与 `verification.profiles`，没有独立 architecture adapter，应运行 profile 中的项目检查并把架构判断作为 AI Review 的一部分。两种情况都不能声称未运行的静态架构检查已通过。AI Review 依据实际提供的 AGENTS、架构/设计文档和 standards 给出路径证据；缺少可选文档时说明来源缺失并依照代码现状审查。AI 评审由当前会话完成；先将完整 Review 交给 quality-gate，再由提交 Hook 在离线环境复核工具结果。

若 `.instar-quality.json` 配置 `tools.security`，它必须指向项目 `package.json` 中的安全扫描脚本，并在对应的 `full` 验证流程执行（schema 3 使用 `engineering-verify`，legacy npm/Vite 使用 `frontend-verify`）；脚本缺失、失败、超时或验证期间源码变化均阻断。未配置时 `doctor` 报 INFO，不声称扫描通过。项目若要求安全扫描，应在 CI 将对应实际 GitHub check 配入 `ci.requiredChecks`；不要把本地脚本存在等同于远端 required check。仅运行项目已选择的工具，不自动下载工具、不上传源码、不自动修复发现项。
