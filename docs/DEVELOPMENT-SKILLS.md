# 开发辅助 Skill 与 Context 管理

InStar 提供 `engineering-implement`、`engineering-verify`，以及兼容既有 Vue 流程的 `frontend-implement`、`frontend-verify`，并共用 `quality-gate` 和 Spec 流程。新增开发 Skill 只覆盖缺失的可复用过程，不另造一套实现审批、测试验证或代码评审流程。

## Context 优化

`context-optimizer` 面向上下文过大、规则冲突、文档过时或反复重新发现项目事实的场景。它先核实源文件和消费者，再提出最小修订；审计请求只报告建议，明确要求优化时才在授权范围内改文件。它不宣称无法实际测量的模型 Token 数，也不会仅为缩短而删除必要约束。

设计依据是“地图优先、按需展开”：保留简洁、可信的项目入口，具体规范拆为有范围的参考文件，代理按任务即时检索。OpenAI 的 Codex 工程实践指出，超长单一 `AGENTS.md` 容易挤压任务上下文、降低规则信噪比并快速过时；渐进披露要求从小而稳定的入口开始，再导航到需要的资料。[OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

## 实现前调研

`engineering-research` 用于新增依赖、未知 API 或集成、以及可能已有通用实现的辅助工具。工作顺序是先查目标仓库现状和锁定版本，再查对应版本的官方文档、标准或安全指南，比较复用/扩展/新增/自建，并交代证据和维护成本。它吸收 ECC `search-first` 的先检索后编码、`api-design` 和 `postgres-patterns` 的领域分拆；不要求无关联网、安装依赖或复制外部实现。[ECC search-first](https://github.com/affaan-m/ECC/blob/main/skills/search-first/SKILL.md) [ECC API design](https://github.com/affaan-m/ECC/blob/main/skills/api-design/SKILL.md) [ECC PostgreSQL patterns](https://github.com/affaan-m/ECC/blob/main/skills/postgres-patterns/SKILL.md)

## 系统化调试

`systematic-debugging` 用于复现失败、检查证据、区分假设、定位最早出错的边界、做最小根因修复并补回归测试。它不能用跳过测试、吞掉错误、扩大重试或关闭检查来制造“通过”。实现结束回到 `engineering-verify` 做后端/跨栈验证，或使用 `frontend-verify` 验证成熟的 Vue/npm 工作流。

## 与既有能力的边界

| 场景 | 使用能力 |
| --- | --- |
| 工作内容、架构影响和项目现状不清 | `spec-explore` |
| Context 文件过长、冲突、陈旧、重复 | `context-optimizer` |
| 新依赖、陌生 API/集成、版本行为不确定 | `engineering-research` |
| Bug、测试、构建或运行失败 | `systematic-debugging` |
| 授权后的后端或跨栈任务 | `engineering-implement`，内部遵循项目支持的 TDD |
| 授权后的 UI/Vue 任务 | `frontend-implement` |
| 本地脚本验证和门禁 | `engineering-verify` 或 `frontend-verify`、`quality-gate`、`ci` |

两个实现 Skill 按需路由到调研或调试 Skill；正常任务不加载 Context 审计，也不把可选研究流程变成每次工作的固定开销。Skill 本身保持简洁，详细领域知识留在 `standards/` 或对应引用文件，符合 OpenAI Skill 文档强调的模块化和按需加载方式。[OpenAI Skills](https://developers.openai.com/api/docs/guides/tools-skills) [OpenAI Plugin Skills](https://developers.openai.com/plugins/concepts/skills)
