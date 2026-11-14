# 本地验证与发布测试

本文件说明如何验证 InStar 插件本身。它不替代对目标业务应用的测试。

## 1. 环境

```sh
node --version   # >= 20.19.0
npm --version
codex --version
```

在插件源码目录执行：

```sh
npm ci
npm run build
npm run check
npm run check:templates
```

`npm run check` 校验清单、22 个原生 Skill、4 个运行时内部 Skill、链接、Hook、规范、设计指引和运行时导出。

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
- quality profile、security、axe 和 Review；
- discovery context/capture/preview/update；
- CLI 参数、预览、错误和边界输入；
- portable/release 路径。

### 3.2 全量测试

```sh
npm test
```

这会执行构建、清单/链接检查和全部测试，包含 OpenSpec 文档引擎测试。

迭代修改控制器时先运行快速目标，提交前仍必须运行 `npm test`：

```sh
npm run test:fast
```

`test:fast` 运行契约、CLI、optimization、phase2/3/4 等快速套件（当前约 4 秒），跳过 `workflow`、`quality`、`discovery`、`integration` 四个重测试文件；它不是发布门禁。

### 3.3 发布烟测

```sh
npm run release
npm run test:release
```

`test:release` 在隔离临时目录中搬迁发布包，检查 22 个 Skill、运行时依赖、Agent 模板、来源清单、文档、CLI、工作流初始化和 UTF-8 PRD 审阅路径。

### 3.4 宿主发现烟测

```sh
npm run release
npm run test:host
```

`test:host` 在隔离 `CODEX_HOME` 中通过真实 Codex CLI 安装 `release/`，再经 app-server 校验插件为 installed/enabled、22 个 Skill 和 2 个 Hook 可见，并确认 4 个 `commands/*.md` 被迁移为启用的 `source-command-*` Skill。

### 3.5 Windows 命令烟测

```sh
npm run test:windows
```

## 4. 安装、卸载与重新安装

### 4.1 首次安装

先在插件源码根目录生成发布包，并确认市场清单真实存在：

```sh
cd /absolute/path/to/InStar
npm run release

INSTAR_RELEASE="$PWD/release"
test -f "$INSTAR_RELEASE/.agents/plugins/marketplace.json"
```

`codex plugin marketplace add` 的参数是**市场源路径**，不是市场名。`instar-local` 是发布包 `marketplace.json` 中的市场名，只能在 `plugin add/remove` 的 `@` 选择器中使用，不能传给 `marketplace add`。

使用隔离 `CODEX_HOME`，不要修改正式 Codex：

```sh
INSTAR_RELEASE="$PWD/release"
INSTAR_TEST_HOME="$(mktemp -d /tmp/instar-codex.XXXXXX)"
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace add "$INSTAR_RELEASE" --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin add instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

检查插件状态为 installed/enabled。随后在独立临时项目（无需 Git 仓库）执行 `initialize-project`，按 `templates/quality/README.md` 创建 schema 3 `.instar-quality.json`，再运行 `doctor`、`snapshot` 和工作流最小夹具。项目未被 Codex 信任时，项目级 Hook 和 `.codex/config.toml` 不会加载。

### 4.2 卸载

先移除插件，再移除 marketplace 源：

```sh
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin remove instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace remove instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

期望结果：

- `plugin remove` 卸载插件并删除该插件在 `CODEX_HOME` 下的本地缓存；
- `marketplace remove` 移除 `instar-local` 市场源，之后不应再列出 InStar；
- `plugin list --json` 中不再出现 `instar@instar-local`，也不应存在 installed/enabled 状态。

不要把 `CODEX_HOME` 指向正式 `~/.codex` 执行卸载测试，也不要手工删除正式缓存目录。若隔离测试环境仍残留缓存，先确认路径位于测试 `CODEX_HOME/plugins/cache/instar-local/` 下，再删除该测试目录并重新执行本节流程。

### 4.3 重新安装

重新安装前先重新生成发布包，确保安装的是当前源码：

```sh
npm run release

INSTAR_RELEASE="$PWD/release"
test -f "$INSTAR_RELEASE/.agents/plugins/marketplace.json"
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace add "$INSTAR_RELEASE" --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin add instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

本地市场不支持 `codex plugin marketplace upgrade instar-local`；该命令只适用于 Git 市场。更新本地发布包时，重新执行 `npm run release`，完成 4.2 卸载后再按本节重新添加市场并安装。

验证版本与缓存路径：

```sh
INSTAR_VERSION="$(node -p "require('./package.json').version")"
test -d "$INSTAR_TEST_HOME/plugins/cache/instar-local/instar/$INSTAR_VERSION"
find "$INSTAR_TEST_HOME/plugins/cache/instar-local/instar" -maxdepth 1 -mindepth 1 -type d
```

期望结果：

- 插件重新显示为 installed/enabled；
- `plugin list --json` 报告的版本与 `package.json` 一致；
- 缓存目录包含本次 `$INSTAR_VERSION`；
- 升级测试中若旧版本目录仍存在，应视为异常残留，回到 4.2 完整卸载后重装，不要直接在旧缓存上覆盖测试。

## 5. 目标项目联调清单

1. 初始化一个独立项目，确认文件创建与冲突报告。
2. 检查 `.codex/config.toml`、7 个角色、项目信任提示。
3. 创建 `.instar-quality.json`，分别验证 schema 3 `preflight`/`implementation`/`full`；再用旧 `commit` 配置和旧报告做一次兼容读取。
4. 配置已有命令，确认失败、超时、命令缺失、工作区变化均 BLOCK。
5. 检查 `reports/engineering-verify-*.json`、artifact 哈希和报告路径。
6. 运行 `quality-gate`，确认 schema 2 references 和 execution mode。
7. UI 项目验证 headless Playwright、axe、键盘/焦点和浏览器版本记录。
8. 走一遍 PRD → 审批 → Spec → 设计 → 任务 → 实现 → 验证 → 验收 → archive 的夹具流程。
9. 测试过期 hash、源码变化、重复提交、锁冲突和中断恢复。
10. 在测试项目验证工作区 baseline、快照和显式 `preflight`/`full` profile；如使用外部 VCS，未获授权时不要推送或合并。

## 6. 真实环境联调

以下能力不会被自动测试伪造：

- 真实模型是否能正确选择 Skill；
- 真实浏览器/axe 扫描；
- 真实 SAST/SCA 或依赖扫描；
- 组织级身份、审计和网络策略。

需要分别准备外部服务和授权后联调。

## 7. 常见测试失败

| 错误 | 原因/处理 |
| --- | --- |
| Node 版本不满足 | 切换到 `>= 20.19`；旧 shell 版本会产生 engines/测试异常 |
| 链接校验失败 | 检查 `docs/plugin-arch.md`、`QUALITY.md`、`LOCAL_TESTING.md` 的相对链接目标 |
| release 文件缺失 | 先 `npm run release`；不要直接编辑 `release/` |
| 插件安装后仍有旧版本 | 按 4.2 完整卸载，再按 4.3 重新安装；检查缓存路径、marketplace 源和 manifest 版本 |
| `invalid marketplace source format` | 把市场名当成了源。`marketplace add` 应传 `release/` 路径、`owner/repo` 或 Git URL，不能传 `instar-local` |
| `failed to resolve local marketplace source path` | `INSTAR_RELEASE` 指向的目录不存在。在插件源码根目录执行 `npm run release`，再用绝对路径 `$PWD/release` |
| `plugin instar was not found in marketplace instar-local` | 市场源尚未成功添加，或版本/市场名不匹配。先确认 `marketplace add` 成功，再执行 `plugin add instar@instar-local` |
| `marketplace ... is not configured as a Git marketplace` | `marketplace upgrade` 只适用于 Git 市场；本地 `release/` 请重新添加或卸载后重装 |
| 目标项目测试通过但 Smoke 失败 | 两类测试对象不同；检查目标项目依赖、网络和浏览器 |

## 8. 测试边界

测试夹具中的审批、浏览器和 Token 记录验证的是控制流，不是真实业务验收。不要把夹具 PASS 当成产品、模型或外部服务已经完成联调。
