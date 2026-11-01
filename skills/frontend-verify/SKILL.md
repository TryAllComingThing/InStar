---
name: frontend-verify
description: Verify a frontend implementation against its specs, task acceptance criteria and UI requirements using actual code, tests and browser evidence. Separate this from document-only Spec verification.
---

Read the current change artifacts and applicable project testing guidance, including `standards/common/testing.md` and the relevant `standards/testing/` level guide. Identify the implementation under review and the real available commands before testing. Plugin tooling tests do not validate the target product.

Map applicable requirements and scenarios to implementation evidence and tests. For removed behavior, check that it is gone; for renamed requirements, do not demand renaming code symbols. Check task acceptance criteria against actual evidence rather than trusting checkboxes.

Run checks proportionate to the change: configured types/static checks, relevant unit/component tests, production build, and critical browser journeys. Inspect applicable loading, empty, error, responsive, keyboard and focus behavior. Record commands, observed results and relevant screenshots or paths. Do not claim a browser check when only source inspection was possible.

Report blocking defects with reproduction steps and concrete source references. Distinguish warnings from confirmed failures. Mark unavailable checks Not verified with a reason, not passing. Product corrections can continue within the user's authorized scope; requirement/design changes return to the planning workflow.

Summarize verified behavior and remaining limits for human acceptance. Never set `accepted: true` from your own assessment. After real acceptance the caller can use the promotion adapter described in the [workflow guide](../requirements-workflow/references/controller.md).

Use submit-verification with the structured report and actual test and browser checks from the controller protocol. Failed or unverified applicable checks block acceptance. Ask for human acceptance only after checks pass. requirements-workflow records that reply and archives. If code changes after verification, reopen implementation and invalidate the previous verification before rechecking; code evidence is not automatically fingerprinted by the document engine.

## 触发与输入契约

提交前、PR 前或用户要求验证时调用。输入：目标仓库根目录、.instar-quality.json、profile commit/full。commit profile 完成 lint、typecheck、dependencies；full profile 额外完成 test、build、vite-build，以及配置的安全扫描、E2E 和视觉回归。CLI action 为 frontend-verify，local-verify 仅为旧调用兼容别名。

## 工具与执行

阅读 [质量协议](../../docs/QUALITY.md)。允许本地文件/Git 读取和受宿主沙盒约束的 npm scripts。使用质量 CLI，不用 npx 自动下载工具。Vite 检查复核已完成 build 的 manifest，不重复构建；依赖检查使用锁文件和已安装依赖。若 `.instar-quality.json` 设置 `tools.security`，它必须映射到项目 `package.json` 中的脚本，并仅在 full profile 执行；该脚本负责调用项目已选扫描器、返回非零表示失败。检查项目 scripts，并在 workspace-write、无网络环境执行；offline 参数不能替代宿主禁网，也不应配置要求外网下载/上传代码的脚本。若未配置，报告中不声称安全扫描已通过。若项目自行在配置中指定视觉回归脚本，full profile 会运行该脚本；首次快照由项目维护者生成、检查并提交。

## 输出与失败策略

reports/frontend-verify-<profile>.json 与历史报告记录命令摘要、耗时、退出码、结果分类、HEAD/base、工作树/暂存区指纹。命令正常执行但返回非零时报告为 FAIL；命令缺失、启动失败、超时、信号终止或检查期间文件变化时报告为 BLOCK，停止后续执行。插件测试不能替代目标项目测试。修改代码或提交后须重新验证。

## 边界与审计

不实现检查规则，不自动批准验收。保留上文产品/浏览器验证和人工审批职责。logs/ 记录每次运行摘要，原始输出不持久化；定位失败需在受控终端运行对应脚本。后续使用 [quality-gate](../quality-gate/SKILL.md) 和 [ci](../ci/SKILL.md)。
