---
name: quality-gate
description: Review software changes across frontend, backend and full-stack code against project architecture, security, correctness and applicable technology-specific rules; produce snapshot-bound evidence before commits and PRs.
---

# AI 质量门禁

## 触发与输入契约

本地验证完成后、提交前或 PR 前使用。输入：绝对项目路径、与 baseRef 比较的代码变更（包括未跟踪文件）、可选 `riskLevel`（`L0`–`L3`，默认 `L1`）、适用的 `AGENTS.md`、已配置或发现的项目架构/设计文档、项目 `standards/`、PRD/Spec、`technical-design.md` 和设计约束。阅读 [质量协议](../../docs/QUALITY.md)，调用 snapshot 取得本次检查的 fingerprint。项目上下文文档是可选输入；优先使用项目现有规范，不为满足插件而复制空文件。必须实际阅读变更及相关调用链，不能用工具退出码代替 AI Review。L2/L3 Review 必须使用与当前 snapshot fingerprint 一致的结构化 evidence；L0/L1 可保留兼容的字符串 evidence。

按变更读取 [InStar review guidance](../../standards/README.md) 中与文件语言和领域匹配的规范；API 变更查阅 API 设计/安全规则，数据库变更查阅数据库设计/迁移规则。UI 变更读取项目自己的设计文档、框架主题配置、组件库、Token 来源、现有模式和已生成的 design-check Style Constraints。若没有这些产物，按项目用户规范和代码现状审查，不虚构 Token 门禁。项目规则和已配置工具决定 BLOCK；不要因为项目未采用某种框架、主题系统、Design Token 或样式架构而要求引入它。

项目 `standards/index.json` 中 `mandatory`/`always` 且命中当前变更路径的规则是强制规范。Review 必须提供 `standardsReferences`，逐条包含规则 ID、`PASS/WARN/NA` 和实现证据；缺少任一条、引用未知规则或证据为空都会阻断。设计阶段还必须在 `Compliance Matrix` 引用同一组规则。插件 `standards/` 只作建议，不会自动升级为项目门禁。需求/技术/代码探查优先使用 `instar find standards|architecture|reuse`，并遵循项目既有架构和规范，而不是套用插件偏好。

优先使用上下文中的紧凑 Policy Pack：它只包含最多 6 张适用规则卡、真实章节 `ruleRefs`、`sections`（锚点/行区间/哈希）和文件哈希。仅当某条规则有歧义、需要完整示例或冲突时才读取对应章节或原规范，不要先加载整个 `standards/` 目录。实现和验证稳定后，只做一次聚焦 Review；先完成全部源码/调用链阅读，再一次性填写完整证据，不要为每个检查项重复启动同一 Review、重复运行已缓存的验证或重复提交相同报告。

## 渐进式披露

- 开始评审前读取 [Review 矩阵](references/review-matrix.md)，只加载与本次变更技术栈和风险匹配的检查项；不要为了完整性读取无关技术栈说明。
- 生成报告、处理失败、声明审计或设计约束时读取 [证据与边界契约](references/evidence-and-boundaries.md)。
- `review init` 生成的 `WARN + not-verified` 只是待办。快照变化后旧 `PASS` 必须降级并重新确认，不能通过 repair 自动恢复为通过。
- 验证报告、Review 与统一报告通过 `reports/review-dossier.json` 共享稳定证据引用；读取 dossier 后仍须校验 snapshot、report id 和 checks 哈希，不能把引用本身当作通过证据。
- 需要路由到其他 Skill 时，先调用 workflow controller 的 `route-skills`，再加载返回的单个 `SKILL.md` 入口；参考文件按需打开。

## 提交与工具流程

先用 `instar review init --reviewer <actual-id>` 在当前快照上生成完整模板；`WARN` + `not-verified` 只是待办，必须逐项读取代码、完成实际审查并替换证据。模板会同时列出当前适用的强制项目规范，不能只填通用 checks。栈配置或快照变化后可运行 `instar review repair --review-file reports/review.json` 补齐缺失项；repair 会保留已有证据并把旧 `PASS` 降为待确认，不会自动制造通过结论。调用 `quality-gate`，传入 reviewer、fingerprint、完整 checks 和必需的 `standardsReferences`；运行时只执行已配置的项目适配器。旧 npm 项目可调用 design-lint、Vue Doctor、Vue AI Sanitizer 和 ai-code-gate。先核实项目安装版本及接口；不得猜造工具参数或把插件名称直接当 CLI。项目适配脚本负责把评分阈值/策略违规转换为非零退出码。完成 Review 后，必须通过 workflow controller 的 `submit-quality-review` 绑定当前源代码快照，再用 `reportPath:"reports/quality-gate.json"` 提交，避免手工复制报告；随后进入 `submit-verification`。可用 `instar status` / `instar next` / `instar cost show` 查看当前阶段、下一合法动作和成本/缺失指标。源代码变化后必须重新执行质量评审；错误会列出变化文件，依赖、构建物和缓存已自动排除。

## 必然边界

不替代人工合并，不自动修改业务代码或放宽阈值。缺失的已配置工具、上下文不足、未完成 Review、过期指纹均不能放行；上下文不足对应项标 BLOCK。通用 Review 维度必须提供证据；Vue/React/Svelte/Angular 专项对不匹配项目标 NA 并说明理由，Node/Rust/.NET 同理。不要把建议性规则升级为项目门禁，也不要把某一栈的检查结果作为另一栈正确性的证明。浏览器未配置时不得声称 UI journey 已验证。AI 生成变更在后续 PR 使用 ai-generated 标签与项目约定的提交 trailer。
