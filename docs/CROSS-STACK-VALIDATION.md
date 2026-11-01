# Python 与 Vue 项目初步需求及验证方案

## 1. 目标

验证 InStar 在没有 CI/GitHub 的项目中，能否分别为 Python 后端项目和 Vue 前端项目完成：

1. 项目配置诊断。
2. 当前代码快照生成。
3. full profile 本地验证。
4. 与技术栈匹配的 Review 清单校验。
5. L2 结构化 evidence 校验。
6. AI provenance 记录。
7. 本地 `pre-pr-check` 门禁。

本阶段不验证远端 PR、GitHub required checks、分支保护或真实外部扫描器。

## 2. 初步需求

### REQ-PY-01 Python 项目接入

InStar SHALL 支持 schema 3 Python 项目通过 `tools.checks` 配置本地命令，并按 `verification.profiles.full` 顺序执行检查。

### REQ-PY-02 Python 检查失败阻断

当 Python lint、类型、测试、构建、依赖或安全检查返回非零退出码时，验证 SHALL 返回 BLOCK/FAIL，并不得生成可用于 PR 放行的 PASS 证据。

### REQ-VUE-01 Vue 项目接入

InStar SHALL 支持 schema 2 Vue/npm 项目通过既有 npm scripts 执行 commit/full profile，并按 Vue 技术栈选择 Review 清单。

### REQ-VUE-02 Vue Review 覆盖

Vue Review SHALL 覆盖通用检查和 Vue 专项检查，包括 `v-for-key`、`computed-purity`、`props` 等项目。

### REQ-CROSS-01 快照绑定

验证报告、Review 和 provenance SHALL 绑定同一个 snapshot fingerprint；代码或配置变化后，旧证据 SHALL 失效。

### REQ-CROSS-02 本地优先

没有 `ci` 配置时，项目 SHALL 仍可完成本地 verify、Review、provenance 和 `pre-pr-check`；报告 SHALL 明确远端 CI 未接入。

## 3. 验收标准

| 场景 | 预期结果 |
| --- | --- |
| Python full profile 全部命令成功 | PASS，报告包含 6 个配置检查和 fingerprint |
| Vue full profile 全部 npm scripts 成功 | PASS，报告包含 Vue profile 结果 |
| Python Review 使用 L2 结构化 evidence | PASS，14 项后端/通用检查完整 |
| Vue Review 使用 L2 结构化 evidence | PASS，17 项 Vue/通用检查完整 |
| provenance 与当前 snapshot 一致 | PASS |
| 无 `ci` 配置执行 pre-pr-check | PASS，结果仅代表本地就绪 |
| 任一检查非零退出 | BLOCK/FAIL，不得继续放行 |
| 修改源码后复用旧 Review | BLOCK，提示 stale evidence |

## 4. 执行入口

在仓库根目录执行：

```sh
npm run test:cross-stack
```

脚本创建隔离的临时 Git fixture，不修改当前仓库业务文件；输出 Python 和 Vue 两个项目的关键报告状态。真实项目接入仍需将示例命令替换为项目自己的 lint、类型、测试、构建和安全工具。

## 5. 结论边界

本验证证明 InStar 的跨栈本地编排和证据绑定可运行，不证明：

- Python 或 Vue 代码不存在缺陷。
- 配置的检查覆盖全部业务风险。
- Review 由独立人工完成。
- 安全扫描工具真实存在或覆盖充分。
- 项目具备远端合并门禁。
