# 安装、升级与卸载

## 1. 前置条件

| 条件 | 用途 |
| --- | --- |
| Node.js `>= 20.19.0` | 构建、运行控制器和发布烟测 |
| npm | 安装插件构建依赖；插件运行时自带打包依赖 |
| Codex CLI | 注册 marketplace、安装/卸载插件 |
目标项目不需要安装 InStar 的 npm 依赖或 Git；但需要有自己的工程依赖和质量工具（例如 lint、测试、Playwright、扫描器）。InStar 使用工作区源码清单和 `.instarignore`，不执行提交、分支、推送、PR 或 CI 操作。

## 2. 从源码构建发布包

```sh
cd /absolute/path/InStar-v2.4
npm ci
npm run build
npm test
npm run release
npm run test:release
```

产物：

```text
release/
├── .agents/plugins/marketplace.json   # marketplace: instar-local
└── plugins/instar/                    # 可安装插件包
```

`release/` 由 `scripts/release.mjs` 生成，不应在里面修改源码。发布包包含 `runtime/`、`skills/`、`hooks/`、`commands/`、`templates/`、`standards/`、`design-guidance/`、`docs/`、`agents/` 和 `bin/`。

## 3. 安装到 Codex

### 3.1 注册本地 marketplace

```sh
codex plugin marketplace add /absolute/path/InStar-v2.4/release --json
```

marketplace 名称由 `release/.agents/plugins/marketplace.json` 决定，当前为 `instar-local`。

### 3.2 安装插件

```sh
codex plugin add instar@instar-local --json
codex plugin list --json
codex plugin list --available --json
```

安装后可以在 Codex 中使用 InStar 的 Skills、Commands 和 Hook。插件名是 `instar`，显示名为 `InStar`。

### 3.3 隔离安装（推荐用于测试）

不要污染正式 `~/.codex`：

```sh
INSTAR_RELEASE="$PWD/release"
INSTAR_TEST_HOME="$(mktemp -d /tmp/instar-codex.XXXXXX)"

CODEX_HOME="$INSTAR_TEST_HOME" \
  codex plugin marketplace add "$INSTAR_RELEASE" --json

CODEX_HOME="$INSTAR_TEST_HOME" \
  codex plugin add instar@instar-local --json

CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

测试结束后删除临时目录即可；不要将测试 home 与正式 home 混用。

## 4. 升级

### 本地 release

```sh
cd /absolute/path/InStar-v2.4
npm run release
codex plugin remove instar@instar-local --json
codex plugin add instar@instar-local --json
codex plugin list --json
```

也可以移除并重新添加本地 marketplace；以当前 Codex CLI 行为为准。重新构建后应确认 `.codex-plugin/plugin.json` 的版本和安装缓存版本一致。

### Git marketplace

```sh
codex plugin marketplace upgrade instar-local --json
codex plugin add instar@instar-local --json
```

`marketplace upgrade` 只刷新 Git marketplace 快照；本地路径 marketplace 应重新注册或重新安装。

## 5. 卸载

### 5.1 删除插件

```sh
codex plugin remove instar@instar-local --json
```

这会卸载插件并移除其本地插件缓存。不会自动删除目标项目中的规则、规划文档、报告、日志或外部 VCS 历史。

### 5.2 删除 marketplace（可选）

```sh
codex plugin marketplace remove instar-local --json
```

若仍需要从同一 release 重新安装，保留 marketplace 更省步骤。

### 5.3 清理目标项目集成（可选、需人工确认）

卸载插件不会自动撤销项目初始化。需要项目维护者在备份后人工审查并处理：

```text
AGENTS.md 中 <!-- instar:start --> ... <!-- instar:end --> 区块
.instar.json
.instar-quality.json
.codex/agents/*.toml 和相邻 Markdown 角色文件
.codex/config.toml 中的 agents.* 注册
planning/specs、planning/changes、planning/archive、planning/workflows
docs/prd
reports、logs、.workflow
```

不要直接批量删除 `.codex/config.toml` 或其他项目自定义配置；先合并/备份。规划目录和备份可能包含敏感需求历史。

## 6. 项目初始化

安装插件后，对目标项目执行 `initialize-project`（先 preview，再应用）。选择安装 `stack`（`frontend`、`backend` 或 `fullstack`；省略时兼容为 `fullstack`）。它表示项目资产安装范围，不是单个 change 的实现分类；`start` 的 `stack` 仍是工作流分类。初始化会：

- 创建 `planning/specs`、`planning/changes`、`planning/archive`、`planning/workflows`、`docs/prd`、`.workflow`；
- 安装 `docs/engineering/testing.md`；`frontend` / `fullstack` 额外安装 `docs/engineering/frontend-conventions.md`；
- 安装通用 Reviewer；`frontend` / `fullstack` 额外安装 `ui-reviewer` 和 `frontend-reviewer`，并在 `.codex/config.toml` 中注册；frontend/fullstack UI 验证会强制要求 `frontend-reviewer`，UI 另要求 `ui-reviewer`；
- 在 `AGENTS.md` 维护受控标记块；旧 InStar 受管块可安全升级，本地编辑或标记不完整时保留为 conflict。
- 将受管文件哈希写入 `.instar.json.managed`，并用 `installationScope`（兼容旧的 `stack` 字段）记录当前安装范围。
- 缩小安装范围并移除未修改的受管文件后，只清理因此变空的父目录；非空目录和本地文件始终保留。

重跑初始化或切换安装范围时：

- 仍适用且未修改的受管文件保持 `unchanged`；插件模板升级且本地未修改时更新。
- 不再适用且本地未修改的受管文件被移除；本地修改过的文件保留并报告 conflict。
- `.codex/config.toml` 只增删 InStar 受管的角色注册；自定义注册、无效 TOML 和其他设置不被覆盖。
- `AGENTS.md` 受控块仅在标记唯一且可确认由 InStar 管理时升级；本地编辑不会被覆盖。

目标项目必须先用 Codex 信任，项目级 `.codex` 配置和项目级 Hook 才会加载。初始化结果中的 `agents.status`、`registered`、`missing`、`conflicts` 需要人工检查。

## 7. 首次检查

```sh
node <plugin>/bin/instar.mjs doctor --project /absolute/project
node <plugin>/bin/instar.mjs snapshot --project /absolute/project
```

`doctor` 和 `snapshot` 都需要项目根目录的 `.instar-quality.json`。初始化不会自动创建该文件；从 `templates/quality/README.md` 的 schema 3 示例开始，映射项目已有命令后再运行。缺少配置时 `doctor` 会返回结构化 BLOCK 和 `nextSteps`，这是预期行为，不是安装失败，也不能当成 PASS。

`doctor` 生成 `reports/doctor.json` 和 `logs/doctor-*.md`。若输出 BLOCK，先修复配置、脚本、上下文或 Agent 注册，再运行验证。验证和 Review 必须由工作流显式调用 `verify` 与 `review`，不会在提交时自动触发。如需限制质量命令的可执行文件和检查名，可在宿主环境设置 `INSTAR_HOOK_ALLOWED_COMMANDS=npm,node` 与 `INSTAR_HOOK_ALLOWED_CHECKS=lint,test`；它们不能限制脚本的实际内容。`SessionEnd` 受宿主约 10 秒超时限制，不应依赖它完成耗时任务。

## 8. 安装故障速查

| 现象 | 处理 |
| --- | --- |
| `marketplace` 找不到 | 确认路径指向包含 `.agents/plugins/marketplace.json` 的 `release/`，使用绝对路径 |
| `plugin add` 找不到 `instar@instar-local` | `codex plugin list --available --json` 检查 marketplace 名称和条目 |
| 目标项目看不到 Reviewer | 检查 `.codex/config.toml`、角色文件和项目信任状态 |
| `SessionEnd` 不执行 | 确认项目已被 Codex 信任、插件启用，并检查 `hooks/hooks.json` 与宿主 Hook 支持；InStar 不再提供提交时 `PreToolUse` 门禁 |
| 初始化冲突 | 不要覆盖项目文件；按 `conflicts` 人工合并后重跑 preview |
| `doctor` 通过但验证失败 | `doctor` 只做配置/可运行性检查，不代表已运行目标项目的完整验证 |

更完整的运行故障见 [DEBUGGING.md](DEBUGGING.md)。
