# 本地验证与发布测试

本文件说明如何验证 InStar 插件本身。它不替代对目标业务应用的测试。

## 1. 环境

```sh
node --version   # >= 20.19.0
npm --version
git --version
codex --version
```

在插件源码目录执行：

```sh
npm ci
npm run build
npm run check
npm run check:templates
```

`npm run check` 校验清单、21 个原生 Skill、4 个运行时内部 Skill、链接、Hook、规范、设计指引和运行时导出。

## 2. 模板与来源维护

`skills/spec-propose/assets/`、`skills/spec-tasks/assets/` 和 `skills/spec-design/assets/` 是工件模板的唯一编辑源。运行时和 `openspec-min` 目录中的副本只供打包使用，不要直接编辑。

```sh
npm run sync:templates   # 从唯一源同步副本
npm run check:templates  # 只检查漂移，不写文件
```

`skills/spec-explore/assets/provenance.json` 和 `skills/spec-discover/assets/provenance.json` 记录上游来源、许可、检索证据与快照 SHA-256。`npm run check` 会重新计算快照哈希；更新快照或来源记录时，必须把二者作为一次可审查的来源更新提交。

## 3. 分层测试

### 3.1 定向测试

```sh
node --test test/workflow.test.mjs test/quality.test.mjs
node --test test/discovery.test.mjs test/cli.test.mjs
```

覆盖：

- workflow 审批、stale hash、reopen、source snapshot；
- strict/manual evidence、report/artifact 绑定；
- quality profile、security、axe、Review、CI；
- discovery context/capture/preview/update；
- CLI 参数、预览、错误和边界输入；
- portable/release 路径。

### 3.2 全量测试

```sh
npm test
```

这会执行构建、清单/链接检查和全部测试，包含 OpenSpec 文档引擎测试。

### 3.3 发布烟测

```sh
npm run release
npm run test:release
```

`test:release` 在隔离临时目录中搬迁发布包，检查 21 个 Skill、运行时依赖、Agent 模板、来源清单、文档、CLI、工作流初始化和 UTF-8 PRD 审阅路径。

### 3.4 宿主发现烟测

```sh
npm run release
npm run test:host
```

`test:host` 在隔离 `CODEX_HOME` 中通过真实 Codex CLI 安装 `release/`，再经 app-server 校验插件为 installed/enabled、21 个 Skill 和 2 个 Hook 可见，并确认 4 个 `commands/*.md` 被迁移为启用的 `source-command-*` Skill。

### 3.5 Windows 命令烟测

```sh
npm run test:windows
```

该命令仅在 Windows 执行，验证 `.cmd` 启动、`npm` shim、shell 元字符拒绝和超时进程树终止；非 Windows 主机输出 SKIP。仓库的 GitHub Actions 会在 `windows-latest` 上执行同一入口，作为真实 Windows 回归。

## 4. 安装烟测

使用隔离 `CODEX_HOME`，不要修改正式 Codex：

```sh
INSTAR_RELEASE="$PWD/release"
INSTAR_TEST_HOME="$(mktemp -d /tmp/instar-codex.XXXXXX)"
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace add "$INSTAR_RELEASE" --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin add instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

检查插件状态为 installed/enabled。随后在独立临时 Git 项目执行 `initialize-project`，按 `templates/quality/README.md` 创建 schema 3 `.instar-quality.json`，再运行 `doctor`、`snapshot` 和工作流最小夹具。项目未被 Codex 信任时，项目级 Hook 和 `.codex/config.toml` 不会加载。

## 5. 目标项目联调清单

1. 初始化一个独立项目，确认文件创建与冲突报告。
2. 检查 `.codex/config.toml`、7 个角色、项目信任提示。
3. 创建 `.instar-quality.json`，分别验证 schema 3 `commit`/`implementation`/`full`。
4. 配置已有命令，确认失败、超时、命令缺失、工作区变化均 BLOCK。
5. 检查 `reports/engineering-verify-*.json`、artifact 哈希和报告路径。
6. 运行 `quality-gate`，确认 schema 2 references 和 execution mode。
7. UI 项目验证 headless Playwright、axe、键盘/焦点和浏览器版本记录。
8. 走一遍 PRD → 审批 → Spec → 设计 → 任务 → 实现 → 验证 → 验收 → archive 的夹具流程。
9. 测试过期 hash、源码变化、重复提交、锁冲突和中断恢复。
10. 在测试仓库验证 commit/PR；不要向正式主分支推送。

## 6. 真实环境联调

以下能力不会被自动测试伪造：

- 真实模型是否能正确选择 Skill；
- 真实浏览器/axe 扫描；
- 真实 SAST/SCA 或依赖扫描；
- 真实 GitHub authentication、branch protection、required checks；
- 组织级身份、审计和网络策略。

需要分别准备外部服务和授权后联调。

## 7. 常见测试失败

| 错误 | 原因/处理 |
| --- | --- |
| Node 版本不满足 | 切换到 `>= 20.19`；旧 shell 版本会产生 engines/测试异常 |
| 链接校验失败 | 检查 `docs/plugin-arch.md`、`QUALITY.md`、`LOCAL_TESTING.md` 的相对链接目标 |
| release 文件缺失 | 先 `npm run release`；不要直接编辑 `release/` |
| 插件安装后仍有旧版本 | 移除插件并重新添加，检查缓存路径和 manifest 版本 |
| 目标项目测试通过但 Smoke 失败 | 两类测试对象不同；检查目标项目依赖、网络和浏览器 |

## 8. 测试边界

测试夹具中的审批、浏览器和 Token 记录验证的是控制流，不是真实业务验收。不要把夹具 PASS 当成产品、模型或外部服务已经完成联调。
