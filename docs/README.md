# InStar 2.4 技术文档

本文档集面向使用、维护和二次集成 InStar 的工程师，基于插件源码与 `release/` 发布包 v2.4.0 的实际行为整理。插件定位不是代码生成器或质量工具本身，而是运行在 Codex 之上的**需求、Spec、设计、实施、验证与交付编排层**。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [CAPABILITIES.md](CAPABILITIES.md) | 全部 Skill、Command、Reviewer、规范与模板能力 |
| [plugin-arch.md](plugin-arch.md) | 进程、模块、数据与构建架构 |
| [WORKFLOW.md](WORKFLOW.md) | PRD 到归档的完整状态机与人工审批 |
| [QUALITY.md](QUALITY.md) | 质量配置、验证 profile、证据链与 CI 门禁 |
| [EVALUATION.md](EVALUATION.md) | Skill/Reviewer 轨迹、语义评测与 Token/API 遥测 |
| [CONTEXT-AND-DISCOVERY.md](CONTEXT-AND-DISCOVERY.md) | 项目上下文、源码发现、设计提取与 Token 来源 |
| [WORKFLOW-POLICY.md](WORKFLOW-POLICY.md) | 自动执行、授权、审批和只读边界 |
| [USAGE.md](USAGE.md) | 日常使用、CLI、JSON action 与典型场景 |
| [INSTALLATION.md](INSTALLATION.md) | 构建、安装、升级、迁移与卸载 |
| [LOCAL_TESTING.md](LOCAL_TESTING.md) | 本地验证、测试矩阵与发布烟测 |
| [DEBUGGING.md](DEBUGGING.md) | 排障、锁、事务恢复、日志与常见失败 |
| [REFERENCE.md](REFERENCE.md) | action、配置字段、产物路径和限制速查 |
| [PROVENANCE.md](PROVENANCE.md) | 上游来源、适配边界与非目标 |

## 一句话模型

```text
人类目标与审批
      │
      ▼
Codex Skills ──► InStar Controllers ──► 项目文件 / Git / 项目自有命令
      │                  │
      │                  ├─ 工作流状态与人工审批
      │                  ├─ 质量报告与 artifact 哈希
      │                  └─ 源码发现、CI 与审计
      ▼
可复核的 PRD、Spec、设计、任务、代码、验证和 PR 证据
```

## 最小使用路径

```text
初始化项目 → 写 PRD → 人工确认 PRD → 写 Spec → Spec Reviewer + 人工确认
→ 技术设计 → 人工确认 → 任务拆分 → 人工确认/授权
→ 实现 → implementation 验证 + code/architecture Review + quality-gate
→ 人工确认实现 → full 验证 + security/UI Review → 人工验收 → 归档
```

如果只是修改已有代码，不需要强行创建 PRD/change；按用户授权完成实现后，使用项目现有的验证和质量流程。若只是从存量代码反推现状规格，使用独立的 `spec-discover`，不要启动 PRD 流程。

## 重要边界

- InStar 不实现 ESLint、测试框架、SAST/SCA、浏览器或 CI；它调用项目已有命令并检查证据。
- InStar 的本机状态文件是集成数据，不是身份系统或不可篡改审计账本；人工审批仍需真实用户确认。
- Git 提交、推送、PR、依赖安装和生产部署仍需明确授权；Hook 只是本地辅助门禁。
- 质量 PASS 只表示配置的命令通过，不自动证明需求正确、设计合理或人工验收完成。
- `docs/` 中的建议性规范与模板不会自动成为目标项目规则；项目自己的 `AGENTS.md`、架构、设计和 Token 优先。

## 版本与环境

- 插件版本：`2.4.0`
- Node.js：`>= 20.19.0`
- 插件运行时使用 npm workspace 构建；目标项目可以使用自己的技术栈和包管理器。
- 发布入口：`release/plugins/instar/`，本地 marketplace：`release/.agents/plugins/marketplace.json`。

安装和卸载命令见 [INSTALLATION.md](INSTALLATION.md)；发布前检查见 [LOCAL_TESTING.md](LOCAL_TESTING.md)。
