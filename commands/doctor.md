---
description: Diagnose project quality context, design contract, dependency state and configured stack tooling.
---

在明确的目标项目中运行质量 CLI，输入 {"action":"doctor","project":"<absolute-project-root>"}。
先阅读插件包根目录的 `docs/QUALITY.md`；若当前上下文无法定位插件根目录，按下方检查项继续，不要因找不到文档跳过诊断。检查项目 scripts 和可选 `standards/` 规范目录，再在无网络宿主沙盒运行。schema 1/2 若配置 `tools.architecture`，确认对应 npm script 存在并报告实际执行结果；未配置时报告为 INFO，不宣称架构工具检查通过。schema 3 使用 `tools.checks` 和 `verification.profiles`，不配置独立 architecture adapter；架构判断由项目文档、AI Review 和已配置检查共同承担。若项目自行配置 `scripts.visual`，确认脚本存在并检查视觉基线；InStar 默认模板不附带视觉测试配置。
报告配置或发现的项目架构/设计文档、Design Token 文件、Subagent 注册、锁文件/依赖目录、设计 lint、依赖验证，以及项目显式配置的 stack 工具（包括 Vue 项目适用时的 vue-doctor）。已配置的 Token 文件缺失、为目录或符号链接时为 BLOCK；未配置且未发现时为 INFO。检查 `.codex/config.toml` 的 TOML、角色注册（含 security-reviewer，frontend/fullstack 含 frontend-reviewer 和 ui-reviewer）和角色配置文件；检查 implementation 与 full 是否重复配置 browser check，重复时 WARN 并建议复用证据或删除重复项。Codex 只在信任项目后加载项目级配置，Doctor 不能代替宿主确认信任状态。Token/API usage 与 Design Token 无关，Doctor 不推断缺失的历史用量。
输出 reports/doctor.json 和 logs/doctor-*.md；解释失败原因及需配置的脚本，不安装工具、不修复业务代码。
Codex 宿主会把 `commands/*.md` 迁移为对应的 `source-command-*` Skill；旧宿主若不发现 commands/，直接按上述 JSON CLI 调用，或让对应 stack 的 `frontend-verify`/`engineering-verify` 执行诊断。
