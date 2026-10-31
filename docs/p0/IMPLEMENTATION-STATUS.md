# InStar V2.4 P0 整改候选｜首轮执行记录

状态：**PARTIAL / BLOCKED**，不可发布。原始 InStar V2.4 源码未修改，本目录为独立候选副本。

## 已完成代码变更
- P0-01：质量审查清单按 `review.language` 和 `review.framework` 选择；无配置时保留旧 17 项审查以兼容旧项目。新增通用后端审查条目。
- P0-02：新增 `src/quality-controller/policy.mjs`，支持 `qualityPolicy` 强制项、Q-07 不可豁免、过期/提交范围绑定的豁免和 `PASS_WITH_WAIVERS`。`verify` 报告包含策略结果，`gate` 重算策略，commit 接受有效豁免。
- P0-03：工作流增加 `request-clarification`、`answer-clarification`、`waiting-clarification`，未关闭问题阻止进入后续状态；仍使用原有事务/版本机制。

## 重要限制与尚未解决的问题
1. 本轮仅实现基础检查集：`qualityPolicy.profiles` 必须由项目明确配置。**尚未强制要求所有项目配置策略**，旧项目仅有 `NOT_CONFIGURED` 标记，不能称为满足 V1.1 全局强制门禁。
2. 豁免以 `snapshot.head` 绑定 Git 提交，不绑定未提交工作区内容；虽有报告 fingerprint，但还需增加精确的变更范围和批准策略验证。
3. 质量报告尚未形成独立的前后端聚合 Markdown/JSON 报告；当前仅在原验证报告中添加策略对象。
4. 澄清状态尚未覆盖需求编辑后的全部失效传播、重复回答和与 PRD 提交的集成回归。
5. 原源码中 `verify` 失败即停止后续检查；项目若豁免失败检查，仍可能未运行后续必需项，策略会阻断。需要专项集成测试。
6. 未执行既有完整测试集、编译、release smoke：npm 离线安装失败，缺少 `zod@4.6.5` npm 缓存，且 `smol-toml` 也不可用。
7. 未进行 Python/Java/Go 真实工程验收或 GitHub CI/PR 实测。

## 本轮真实验证
- `node --check src/quality-controller/index.mjs`：通过。
- `node --check src/workflow-controller/index.mjs`：通过。
- `node --test test/p0-contract.test.mjs`：2/2 通过（仅策略纯函数测试）。
- `npm ci --offline --ignore-scripts`：失败，`ENOTCACHED`，缺少 `zod-4.6.5.tgz`。

## 后续 P0 验收出口
- 必须定义默认强制检查策略，且缺少项目策略不得静默 PASS。
- 全部强制项/项目豁免执行与审计报告实现，并通过失败/过期/范围不符/未配置/不可豁免用例。
- 审查动态清单通过 Vue、Python、Java、Go 集成测试。
- 澄清状态通过完整 PRD→SPEC→开发审批状态机回归。
- 恢复依赖后执行 `npm test`、release smoke、真实前后端验证；无 P0 缺陷才可发布。
