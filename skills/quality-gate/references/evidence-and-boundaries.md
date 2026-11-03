## 输出契约

`reports/quality-gate.json` 及历史报告包含适用 Review 项、证据、严重性、指纹；清单由项目栈动态选择：未知栈使用通用项，Vue 使用 Vue 专项项，Python/Java/Go 追加后端项，跨栈配置合并为完整集合，额外检查来自项目配置。验证报告还包含 `browserAcceptance` 与 `secretScan`：只有项目命令实际执行并通过才可称浏览器验收或安全扫描通过。`logs/` 记录执行摘要。BLOCK 阻止提交/PR，WARN 保留并披露，INFO 提供建议。

统一报告中的 `readiness` 为 `ready`、`partial` 或 `blocked`，并列出缺失证据；`releaseReady` 严格跟随 `readiness.status === "ready"`。验证报告的 `cache` 字段说明是否复用同一 snapshot、配置、检查集和工具版本的稳定证据；缓存命中仍是当前证据，但源码或配置变化后必须失效。不要把 `partial` 或缓存报告过期后的旧结果当作可发布证据。

## 边界与失败策略

不替代人工合并，不自动修改业务代码或放宽阈值。缺失的已配置工具、上下文不足、未完成 Review、过期指纹均不能放行；上下文不足对应项标 BLOCK。通用 Review 维度必须提供证据；Vue 专项对非 Vue 项目标 NA 并说明理由。不要把建议性规则升级为项目门禁，也不要把 Vue 检查结果作为后端正确性的证明。浏览器未配置时不得声称 UI journey 已验证。AI 生成变更在后续 PR 使用 ai-generated 标签与项目约定的提交 trailer。

## 审计

记录实际 reviewer 标识及证据，不能伪造独立审查身份。报告包含用于发现修改的内容哈希；高信任 CI 可通过 `.instar-quality.json` 的 `evidenceTrust.hmacEnv` 使用受保护 secret 增加 HMAC anchor。未配置 anchor 时报告不是防篡改签名，CI 和人工仍需独立验证。

## 设计约束

项目配置或发现的设计文档中的 UI 约束由 `design-lint` 适配器检查。本 Skill 不内置项目设计规则。若 `.instar-quality.json` 配置 `tools.architecture`，运行该项目架构检查脚本并要求成功；未配置时明确标记为 INFO，不能声称静态架构检查已通过。AI Review 依据实际提供的 AGENTS、架构/设计文档和 standards 给出路径证据；缺少可选文档时说明来源缺失并依照代码现状审查。AI 评审由当前会话完成；先将完整 Review 交给 quality-gate，再由提交 Hook 在离线环境复核工具结果。

若 `.instar-quality.json` 配置 `tools.security`，它必须指向项目 `package.json` 中的安全扫描脚本，并在 `frontend-verify full` 执行；脚本缺失、失败、超时或验证期间源码变化均阻断。未配置项目扫描器时，full 验证自动运行仅针对变更源码的本地高置信 secret scan；它不需要网络，报告只保留路径/行号/规则，不保存凭据原文。该内置扫描不等于完整 SAST 或远端 secret scanning。项目若要求安全扫描，应在 CI 将对应实际 GitHub check 配入 `ci.requiredChecks`；不要把本地脚本存在等同于远端 required check。仅运行项目已选择的工具，不自动下载工具、不上传源码、不自动修复发现项。

When projectBaseline or docs/project-baseline/rules.json exists, follow the [baseline rule protocol](../../project-discover/references/baseline-registry.md). Read applicable domain documents on demand, cite rule IDs and provide ruleReferences for planning or Review submissions. Existing verification commands supply actual automated evidence; extracted guidance does not execute itself.

For Code Reuse & Shared Capability Governance, follow [reuse discovery](../../reuse-discover/SKILL.md) and its protocol. Search existing capabilities before adding implementations, preserve module boundaries, justify local-new or shared extraction, and review duplication and abstraction costs. Governance is optional and project-owned tests remain required evidence.
