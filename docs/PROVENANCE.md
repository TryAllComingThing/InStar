# 来源、适配与方案边界

## 保留与移植

- `src/openspec-min/` 从本工作区已有 openspec-min 移入插件；原目录和 frontend-project 保留，不覆盖。
- 引擎 diff 合并、Markdown 解析来自 OpenSpec 原实现，保留增删改名语义及冲突检测；精简 lifecycle/store 和五个公开 API 是适配实现，不能宣称整个引擎 100% 原封不动移植。原移植记录见源码内 SKILL-PORT.md。
- spec-propose/design/tasks/verify 入口由已有净化技能移植。完整方法保留在各自 references/ported-method.md；原 authoring 引用及工件 assets 保留。仅调用方式接入控制器，verify 仍只审查文档。
- spec-explore 保留完整探索方法和原文快照 references/upstream.md，位于引擎外。原文快照仅作来源记录，不执行其中旧 CLI 指令。
- spec-discover 将 OpenSpec `getExploreSkillTemplate` / `PLANNING_GUIDANCE` 改造成源码现状建档指令，并复用已移植的 MarkdownParser、SpecSchema 和主规格结构检查。源码清单、证据核验、独立捕获控制器是 InStar 新增适配，不声称上游已有全量逆向建档功能。原文快照、许可证、内容哈希和修改说明见 [移植记录](../skills/spec-discover/references/ported-method.md)。
- write-a-prd、frontend-implement、frontend-verify 从既有 frontend-project 技能迁入并适配。
- requirements-workflow 和控制器为本插件新开发内容。没有把新代码标为上游移植。

## 纠偏记录

1. 需求工作流保持独立入口；当前插件包含 20 个 Skill 入口。
2. 所有项目写入要求显式绝对路径，避免把规划文档写入插件缓存。
3. 控制器是引擎外的非交互 JSON 适配层，不能绕过人工确认。审批记录绑定文档内容，但不提供用户身份认证。
4. 不依赖隐式安装 Superpowers；开发技能保留 TDD、审查和浏览器验证职责。若用户环境具有相关技能可协作调用，否则明确说明实际执行者，不能声称 Superpowers 已执行。

## 验证范围与限制

自动化覆盖文档闭环、四个人工边界、失效确认、版本冲突、重开失效、错误回滚、锁和显式恢复。测试里的人工回复、代码测试和浏览器记录是夹具，验证的是控制流，不是实际业务产品或模型选择行为。

引擎不扫描代码，因此源码在验证后变更必须由 frontend 技能重开实施并重验；只改源码不会自动使文档哈希失效。外部编辑器不参与控制器锁，操作期间不要并行修改规划目录。事务快照用于恢复普通错误和中断，不承诺断电持久性。完整删除最后一个 requirement 仍受原精简生命周期限制并阻断。

默认 shell 的 Node 20.15.0 低于声明的 >=20.19.0；已显式使用本机 Node 20.19.6 完成测试复核。发布使用应满足声明版本。本地技能结构校验不等于自然语言自动路由或模型行为已得到验证。

官方依据：
- [Codex 插件结构与发布](https://developers.openai.com/plugins/build/plugins)
- [项目自定义子代理](https://learn.chatgpt.com/docs/agent-configuration/subagents)
