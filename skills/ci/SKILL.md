---
name: ci
description: Push a verified feature branch to GitHub, create or update its PR, publish Review evidence and inspect CI for the exact reviewed commit, without pushing the default branch or deploying production.
---

# GitHub 交付编排

## 触发与输入契约

用户要求提交/推送功能分支、创建 PR 或检查 CI 时使用。阅读 [质量协议](../../docs/QUALITY.md)。输入为绝对项目路径、.instar-quality.json 的 ci 配置、当前功能分支、已通过的最终提交验证、Review、AI 溯源及用户授权范围。单纯质量检查不授权发送 PR；明确授权交付 PR 已涵盖必要功能分支推送，不重复索要同一授权。

## 允许工具与执行

允许质量 CLI、Git 功能分支提交/非强制推送、已有 gh 认证；宿主须允许配置的精确 GitHub/企业 GitHub 域名。只做编排，不管理凭据或 SSO。

1. 将本次范围内改动暂存；检查工作树与暂存内容一致。需要提交时使用 action commit，提供 message、authorization 确认字段、aiGenerated。按项目 schema 运行完整的配置验证（schema 3 使用 engineering-verify；旧 Vue/npm 项目使用 frontend-verify）和 quality-gate。显式要求豁免时才设置 force:true 和 reason；豁免仅对应本次本地提交，不能通过 PR 门禁。authorization 是用户确认输入，不是身份凭证；GitHub 身份由 gh 登录态验证。
2. 最终提交后重新运行配置的 full 验证、quality-gate，并记录 ai-provenance（aiGenerated、sessionId、summary）。报告绑定 HEAD/base/工作树/暂存区。不得把提交前报告直接用于提交后的 PR。
3. action ci / phase prepare 生成可审阅的 reports/pr-body.md。检查标题、影响范围、会话摘要和报告是否可公开；这一步不联网。
4. 用户明确授权后 phase publish，传 title、body 和 authorization 确认字段。适配器检查远端/默认分支/基线后推送精确 SHA 到功能分支，创建或复用相同 head/base 的 PR；AI 生成变更须有 ai-generated 标签。缺少仓库标签时报告问题，不擅自修改标签策略。实际身份与仓库权限由 GitHub/gh 处理。
5. Review 与验证 JSON 通过 PR 正文上传，reportUrl 是真实 PR 链接；模板 CI 从正文提取匹配 HEAD/base 的报告，再上传 artifact。不是把本地路径冒充远端 artifact。正文超长即停止。
6. phase status 读取确切 PR 的 CI 检查与 run；未完成返回 PENDING，缺少/取消/跳过/失败为 BLOCK。按报告链接定位失败 job/step。最多观察 10 分钟，每次间隔不超过 60 秒；到期交还状态，不无限轮询。

## 输出契约

reports/ci.json 及历史报告包含 PREPARED/PENDING/PASS/BLOCK、head/base、分支、PR/report URL、CI runs、失败步骤。logs/ 记录执行摘要；发布前 ci-intent 记录授权来源。第一次创建后响应失败，重试先查询已有 PR，避免重复创建。

## 边界与失败策略

禁止推 main/master、远端默认分支和目标分支；禁止 force push、自动合并和生产部署。远端基线改变或 SHA 不一致必须停止并重新验证。secretCheck 必须属于 requiredChecks；泄露或扫描失败 BLOCK。若项目将 SAST/SCA 等安全扫描设为 CI 必需项，对应实际 GitHub check 名称必须加入 `ci.requiredChecks`，缺失/失败/pending 按 CI 检查状态处理。未配置的可选扫描器不能伪装成通过，也不能仅因未配置就阻断所有项目。宿主/CI 分支保护才是权限执行边界，JSON 授权字段只是审计，不是认证。

## 审计与会话

上传前脱敏，不读取 ~/.ssh、~/.aws、.env.production、SSO 配置或生产密钥。使用 session-summary 提前写入实际进展/教训和 sessionId，SessionEnd 只负责追加与审计。不要修改未经批准的架构决策。保留原 PRD/Spec 的人工验收流程。
