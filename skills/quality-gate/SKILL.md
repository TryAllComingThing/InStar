---
name: quality-gate
description: Review software changes across frontend, backend and full-stack code against project architecture, security, correctness and applicable technology-specific rules; produce snapshot-bound evidence before commits and PRs.
---

# AI 质量门禁

## 触发与输入契约

本地验证完成后、提交前或 PR 前使用。输入：绝对项目路径、与 baseRef 比较的代码变更（包括未跟踪文件）、可选 `riskLevel`（`L0`–`L3`，默认 `L1`）、适用的 `AGENTS.md`、已配置或发现的项目架构/设计文档、项目 `standards/`、PRD/Spec、`technical-design.md` 和设计约束。阅读 [质量协议](../../docs/QUALITY.md)，调用 snapshot 取得本次检查的 fingerprint。项目上下文文档是可选输入；优先使用项目现有规范，不为满足插件而复制空文件。必须实际阅读变更及相关调用链，不能用工具退出码代替 AI Review。L2/L3 Review 必须使用与当前 snapshot fingerprint 一致的结构化 evidence；L0/L1 可保留兼容的字符串 evidence。

按变更读取 [InStar review guidance](../../standards/README.md) 中与文件语言和领域匹配的规范；API 变更查阅 API 设计/安全规则，数据库变更查阅数据库设计/迁移规则。UI 变更读取项目自己的设计文档、框架主题配置、组件库、Token 来源、现有模式和已生成的 design-check Style Constraints。若没有这些产物，按项目用户规范和代码现状审查，不虚构 Token 门禁。项目规则和已配置工具决定 BLOCK；不要因为项目未采用某种框架、主题系统、Design Token 或样式架构而要求引入它。

对所有变更评估正确性、可读性/可维护性和架构；安全与性能按风险触发。安全敏感变更（认证/授权、API 边界、SQL、文件上传、反序列化、秘密、依赖或出站请求）必须审查对应安全控制并引用代码或测试证据。性能重点检查热路径、大数据/列表、渲染、数据库查询或并发行为；无相关风险时标 NA 并解释。不要把“性能审查”机械理解为要求基准测试，也不要把建议性优化当 BLOCK。

## 允许工具与流程

允许本地文件读取、Git 只读命令和质量 CLI；AI Review 由当前已授权的 Codex 会话完成。禁止在本地 Hook 中额外联网调用模型。先检查架构、命名、类型、组件边界、设计一致性，再逐项检查：

| ID | 必查内容及适用性 |
| --- | --- |
| correctness | 需求/Spec、边界条件、状态与错误路径是否正确；列出可复查证据 |
| maintainability | 命名、复杂度、重复、可测试性和项目惯例；避免固定行数等僵硬门槛 |
| architecture | 模块职责、接口、依赖方向及既有架构约束 |
| security | 安全边界及相应控制；无安全相关变更标 NA 并说明理由 |
| performance | 有热路径/数据量/渲染/查询影响时检查风险；否则标 NA 并说明理由 |
| naming | 命名是否清楚并符合项目领域词汇和既有约定 |
| types | 公共边界类型及不可信数据的运行时验证是否充分 |
| component-boundaries | UI 组件或服务模块职责、接口、状态所有权和副作用边界是否清晰；按代码类型选择检查对象 |
| design | UI 变更是否符合项目设计说明和已确认的视觉约束；纯后端标 NA 并说明 |
| watch-cleanup | watch/watchEffect 创建异步任务、事件或副作用时是否 onCleanup；纯观察且无资源可标 NA |
| v-for-key | key 是否唯一、稳定；避免可重排列表使用索引 |
| reactive-destructure | 响应式解构是否保留响应性；toRefs/toRef 或已确认 Vue 版本支持的编译器 props 解构均可，不机械强制 toRefs |
| props | Props 类型是否明确；可选值是否需要默认值；必填 Prop 不强制多余默认值 |
| computed-purity | computed 是否存在写状态、请求等副作用 |
| unmount-cleanup | 定时器、事件和资源是否随组件卸载释放 |
| async-component | 大型非首屏组件是否适合 defineAsyncComponent；首屏关键组件可说明不适用 |
| lazy-route | 路由组件是否合理使用动态 import() |

每项 PASS/BLOCK/WARN/INFO/NA 均提供文件、行号或可复查证据；L2/L3 的 evidence 还必须包含证据类型、相对路径、单行 `line` 或 `startLine`/`endLine` 范围、当前源码摘录、说明和 `snapshotFingerprint`，控制器会校验摘录确实位于声明行范围。`not-verified` 只能配合 WARN/BLOCK，`not-applicable` 只能配合 NA，不能用 PASS 替代验证或适用性判断。NA 必须解释适用性。UI 或 Vue 专项项只在对应技术栈/变更存在时评估，否则标 NA 并解释；后端变更应将安全、API、数据库迁移、并发和可观测性作为适用风险检查。

L3 变更还必须满足项目 `riskPolicy.l3` 的人工 Reviewer 角色要求；`review.approvals` 中的每个批准项必须包含角色、外部身份标识、身份提供方、批准 ID 和 `approved` 状态。CI/GitHub 是可选的：没有远端基础设施时仍可完成本地 full verify、Review 和人工审批，但必须披露远端未接入；接入后才由 CI、分支保护和 CODEOWNERS 提供远端门禁。控制器只校验元数据格式和完整性，不伪造或替代外部身份认证。

纯后端改动时，下列 Vue 专项使用 `NA`，并在 evidence 写明“本次变更不包含 Vue/UI 文件，依据变更路径与仓库技术栈判定不适用”：`watch-cleanup`、`v-for-key`、`reactive-destructure`、`props`、`computed-purity`、`unmount-cleanup`、`async-component`、`lazy-route`。`component-boundaries` 仍需检查服务/模块边界；`design` 可 NA。若任务同时改 UI，则不能套用该 NA 说明，需审查对应的前端项。

调用 `quality-gate`，传入 reviewer、fingerprint、完整 checks；运行时只执行已配置的项目适配器。旧 npm 项目可调用 design-lint、Vue Doctor、Vue AI Sanitizer 和 ai-code-gate。先核实项目安装版本及接口；不得猜造工具参数或把插件名称直接当 CLI。项目适配脚本负责把评分阈值/策略违规转换为非零退出码。完成 Review 后，必须通过 workflow controller 的 `submit-quality-review` 绑定当前源代码快照，再进入 `submit-verification`；源代码变化后必须重新执行质量评审。

## 输出契约

`reports/quality-gate.json` 及历史报告包含适用 Review 项、证据、严重性、指纹；清单由项目栈动态选择：未知栈使用通用项，Vue 使用 Vue 专项项，Python/Java/Go 追加后端项，额外检查来自项目配置。`logs/` 记录执行摘要。BLOCK 阻止提交/PR，WARN 保留并披露，INFO 提供建议。

## 边界与失败策略

不实现扫描规则、不替代人工合并；不自动修改业务代码或放宽阈值。缺失的已配置工具、上下文不足、未完成 Review、过期指纹均不能放行；上下文不足对应项标 BLOCK。通用 Review 维度必须提供证据；Vue 专项对非 Vue 项目标 NA 并说明理由。不要把建议性规则升级为项目门禁，也不要把 Vue 检查结果作为后端正确性的证明。AI 生成变更在后续 PR 使用 ai-generated 标签与项目约定的提交 trailer。

## 审计

记录实际 reviewer 标识及证据，不能伪造独立审查身份。报告包含用于发现修改的内容哈希；高信任 CI 可通过 `.instar-quality.json` 的 `evidenceTrust.hmacEnv` 使用受保护 secret 增加 HMAC anchor。未配置 anchor 时报告不是防篡改签名，CI 和人工仍需独立验证。

## 设计约束

项目配置或发现的设计文档中的 UI 约束由 `design-lint` 适配器检查。本 Skill 不内置项目设计规则。若 `.instar-quality.json` 配置 `tools.architecture`，运行该项目架构检查脚本并要求成功；未配置时明确标记为 INFO，不能声称静态架构检查已通过。AI Review 依据实际提供的 AGENTS、架构/设计文档和 standards 给出路径证据；缺少可选文档时说明来源缺失并依照代码现状审查。AI 评审由当前会话完成；先将完整 Review 交给 quality-gate，再由提交 Hook 在离线环境复核工具结果。

若 `.instar-quality.json` 配置 `tools.security`，它必须指向项目 `package.json` 中的安全扫描脚本，并在 `frontend-verify full` 执行；脚本缺失、失败、超时或验证期间源码变化均阻断。未配置时 `doctor` 报 INFO，不声称扫描通过。项目若要求安全扫描，应在 CI 将对应实际 GitHub check 配入 `ci.requiredChecks`；不要把本地脚本存在等同于远端 required check。仅运行项目已选择的工具，不自动下载工具、不上传源码、不自动修复发现项。
