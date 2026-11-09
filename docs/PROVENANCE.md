# 来源、适配与边界

## 1. 来源概述

InStar 包含自行开发的编排层、从既有工程经验整理的规范/设计参考，以及从 OpenSpec/Superpowers 方向移植并适配的文档能力。来源记录用于解释设计取舍，不代表上游项目对本插件的背书。

## 2. 文档引擎

- `src/openspec-min/` 是从既有 openspec-min 工作区移入并构建的裁剪运行时。
- Markdown 解析、Spec 合并和场景保护来自 OpenSpec 相关实现。
- lifecycle/store、固定五 API、根目录布局和控制器接入是 InStar 适配实现，不能称为整个上游原样移植。
- 原版来源、哈希、裁剪项和差异记录保留在 `src/openspec-min/SKILL-PORT.md`、各 Skill 的 `references/ported-method.md` 和 `assets/upstream.md`。

## 3. Skills

- `write-a-prd`、`frontend-implement`、`frontend-verify` 来自既有前端项目Skill并做了 InStar 适配。
- `spec-propose`、`spec-design`、`spec-tasks`、`spec-verify` 保留 OpenSpec 方法、模板和作者规则，但接入 InStar 控制器。
- `spec-explore` 保留探索方法和上游快照；快照不是可执行指令。
- `spec-discover` 复用 OpenSpec 的解析/规格结构思路，但源码清单、证据校验、预览/捕获和独立控制器是 InStar 新增适配。
- `spec-explore` 与 `spec-discover` 的 `assets/provenance.json` 记录上游仓库、路径、许可、检索证据和快照 SHA-256；`npm run check` 会验证记录与快照一致。
- `initialize-project`、`requirements-workflow`、控制器、质量门禁、Reviewer 模板和发布流程为本插件实现。
- InStar 原创代码采用 MIT；OpenSpec-min 派生部分沿用上游 MIT 许可，许可证保留在 `src/openspec-min/LICENSE`。由 OpenSpec 方法派生的 `spec-explore`、`spec-discover`、`spec-propose`、`spec-design`、`spec-tasks`、`spec-verify` 目录也各自保留许可证副本。

## 4. 规范与设计参考

`standards/`、`design-guidance/` 和未被初始化选中的 `templates/` 资产是建议性参考，除非目标项目明确采用，否则不构成强制规则。`standards/`、`design-guidance/` 不会自动复制；`templates/` 只按 `initialize-project` 的受管安装清单复制 `templates/engineering/testing.md`、`frontend-conventions.md` 和 Reviewer Agent TOML/契约，其余模板不会被整体复制。

## 5. 验证范围

自动化测试覆盖：

- 文档状态机、审批 hash、重开、归档和恢复；
- schema 1/2/3 质量配置和失败路径；
- strict report/artifact 绑定、源码快照和改包检测；
- discovery context/capture/preview/update/recover；
- CLI 解析、边界输入、发布包搬迁和烟测；
- Skill/Reviewer trace、语义评测和 usage 记录。

测试中的审批、浏览器、Token 与 Review 可能是夹具，不代表真实产品行为。真实模型路由、外部扫描器、浏览器和 GitHub 仍需目标环境联调。

## 6. 非目标与已知限制

- 不提供组织身份、SSO、签名策略、集中审计或多租户权限。
- 不做不可绕过的本地安全沙箱；宿主 OS 沙箱和远端分支保护才是执行边界。
- 不承诺控制器状态和 trace 的密码学不可篡改。
- 不承诺进程崩溃、断电或外部并发写入下的完整原子性。
- 不自动证明 Reviewer 的语义判断、测试是否真实执行或人工证据真实性。
- 不支持任意 profile DSL、多仓库聚合、Merkle 证据树或 CI 签名证据；这些不属于 v2.4 范围。

## 7. 维护原则

修改插件时优先修正根因、保持命名/路径/门禁契约一致，并同步相关文档和测试。不要为了缩短文档删除必要安全约束，也不要把建议性规范升级成未获项目批准的门禁。
