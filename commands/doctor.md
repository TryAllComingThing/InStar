---
description: Diagnose frontend quality context, design contract, dependency state, CI configuration and Vue health.
---

在明确的目标项目中运行质量 CLI，输入 {"action":"doctor","project":"<absolute-project-root>"}。
先阅读 ../docs/QUALITY.md；检查项目 scripts 和可选 `standards/` 规范目录，再在无网络宿主沙盒运行。若配置 `tools.architecture`，确认对应 npm script 存在并报告实际执行结果；未配置时报告为 INFO，不宣称架构工具检查通过。若项目自行配置 `scripts.visual`，确认脚本存在并检查视觉基线；InStar 默认模板不附带视觉测试配置。
报告配置或发现的项目架构/设计文档、Design Token 文件、Subagent 注册、锁文件/依赖目录、设计 lint、依赖和 CI 配置验证、vue-doctor。已配置的 Token 文件缺失、为目录或符号链接时为 BLOCK；未配置且未发现时为 INFO。检查 `.codex/config.toml` 的 TOML、角色注册和角色配置文件；Codex 只在信任项目后加载项目级配置，Doctor 不能代替宿主确认信任状态。
输出 reports/doctor.json 和 logs/doctor-*.md；解释失败原因及需配置的脚本，不安装工具、不修复业务代码。
若宿主不发现 commands/，直接按上述 JSON CLI 调用或让 $frontend-verify 执行诊断。
