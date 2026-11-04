# InStar 开发测试手册

本文面向维护 InStar 插件本身的开发者，说明环境准备、构建、测试分层、故障恢复演练和发布验收。目标项目的接入与日常操作见 [使用说明书](PLUGIN-GUIDE.md)，质量协议见 [质量协议](QUALITY.md)，语义评测见 [评测与验收说明](EVALUATION.md)。

## 1. 测试目标与边界

InStar 的测试主要回答四个问题：

1. **源码与发布运行时是否一致**：`src/` 构建后是否与 `runtime/` 字节一致，发布包是否能在脱离源码仓库和根 `node_modules` 后运行。
2. **状态机与证据边界是否可靠**：审批哈希、版本号、上下文指纹、快照、事务回滚和锁是否按协议工作。
3. **质量与治理是否失败关闭**：缺少配置、证据陈旧、证据被篡改、必需检查失败时，是否返回 `BLOCK` 或非零退出码。
4. **跨栈编排是否可用**：Vue、Python 等不同检查映射是否能经过同一质量控制器完成验证、Review 和 PR 前检查。

测试**不**证明以下事项：

- 真实模型一定执行了某个 Skill，或语义评测结论正确。
- 真实 GitHub 仓库的分支保护、Actions、secret scanning 和 PR 发布已经成功。
- 真实浏览器、E2E、性能、安全扫描器或目标项目业务测试已经通过。
- 项目命令拥有 OS 级沙箱隔离。

这些能力需要在目标项目、真实宿主和 CI 中另行联调。

## 2. 环境准备

### 2.1 必需环境

| 依赖 | 要求 | 用途 |
| --- | --- | --- |
| Node.js | `>=20.19.0` | 构建、CLI 和 `node --test` |
| npm | 随 Node 提供 | 工作区安装、脚本和发布 |
| Git | 可执行 | 质量测试、发布 provenance 和临时仓库初始化 |

当前仓库为 ESM，版本与脚本见 [package.json](../package.json)。Windows、macOS 和 Linux 均可运行；符号链接相关测试在无符号链接权限时会显式跳过，而不是伪装通过。

### 2.2 可选环境

| 依赖 | 何时需要 |
| --- | --- |
| Python 3 | `npm run test:cross-stack` 的 Python 夹具 |
| `gh` 登录态 | 只在进行真实 PR/CI 联调时需要，常规测试不依赖 |
| 语言运行时 | 只在目标项目的 schema 3 `tools.checks` 中按实际命令需要 |

### 2.3 安装依赖

```sh
npm ci
```

仓库包含 `src/openspec-min` 工作区。`npm ci` 会安装根依赖和工作区依赖；`runtime/`、`release/`、`reports/` 和 `logs/` 是生成目录，不应手工维护。

如果依赖已安装且 `node_modules/` 完整，可跳过安装直接构建。不要用 `npm install` 更新锁文件来完成普通测试，除非任务本身就是更新依赖。

## 3. 源码、构建与运行时

### 3.1 必须遵守的规则

- 源码修改只发生在 `src/`、`skills/`、`standards/`、`hooks/`、`commands/`、`scripts/` 等源文件。
- `runtime/` 由构建生成，不能直接编辑。
- 测试导入的是 `runtime/` 中的控制器；修改 `src/` 后不构建，测试可能仍运行旧代码。
- 发布包由 `release/` 生成，不能把 `release/` 当作源目录修改。

### 3.2 构建

```sh
npm run build
```

构建步骤：

1. 构建 `src/openspec-min` 的 TypeScript 工作区，生成 `dist/`。
2. 删除并重建 `runtime/`。
3. 复制 `openspec-min` 的 JavaScript、工件模板、四个控制器目录和 `shared/`。
4. 打包 `zod` 和 `smol-toml`，裁剪 TypeScript 源文件、声明文件和 source map。
5. 写入最小的 `runtime/package.json`。

### 3.3 构建漂移检查

```sh
npm run check
```

`scripts/check.mjs` 会执行确定性检查，包括：

- 逐字节比较 `src/quality-controller`、`workflow-controller`、`shared`、`discovery-controller` 与 `runtime/` 对应目录。
- 检查打包的 `zod` 体积低于 6 MiB。
- 校验 22 个 Skill 的目录集合、frontmatter 和相对 Markdown 链接。
- 校验主清单、插件索引、Hook 集合、安装路径、模板一致性和五个 `openspec-min` 导出。
- 校验 `docs/plugin-arch.md`、`docs/QUALITY.md`、`docs/LOCAL_TESTING.md` 中相对链接指向的文件存在。
- 校验 `standards/` 关键文档和发现协议资源存在。

`docs/EVALUATION.md` 还会被 `quality-evaluation` 和 `requirements-workflow` 的 Skill 链接引用，并通过发布冒烟检查。缺失时即使个别检查未直接枚举，也会在链接或发布阶段失败。

## 4. 测试分层与文件地图

测试使用 Node 内置 `node:test`，不需要 Jest、Vitest 或测试服务器。每个用例通常创建 `os.tmpdir()` 下的独立临时目录，并在 `t.after` 中清理。

### 4.1 控制器、CLI 与可移植性

| 文件 | 覆盖重点 |
| --- | --- |
| `test/cli.test.mjs` | 非法参数、畸形 JSON、非零退出码、8 MiB 输入上限、最小工作流启动 |
| `test/friendly-cli.test.mjs` | 质量快捷命令参数解析、工作流 `flow/doc/find/standards/cost` 路由、dry-run、Review 文件两种包装形式和发布确认 |
| `test/process-runner.test.mjs` | 不经过 shell 执行命令、原生可执行文件路径 |
| `test/portable.test.mjs` | 迁移到临时目录的 `runtime/` 在无源码树、无外部依赖时可启动工作流 |

### 4.2 工作流与审批

| 文件 | 覆盖重点 |
| --- | --- |
| `test/workflow.test.mjs` | 完整生命周期、语义评测指纹、陈旧质量报告、复用治理、reopen、故障回滚、锁和恢复 |
| `test/p0-03-workflow.test.mjs` | WF-01 至 WF-12：澄清、错误哈希、审批、Spec 阻塞、重启恢复 |
| `test/p0-workflow-acceptance.test.mjs` | WF-13 至 WF-16：重复回答、修改后重新评审、进程重载、未批准变更不得进入开发 |
| `test/p0-03-fault-injection.test.mjs` | FI-01 至 FI-03：等待澄清时重启、审批前重启、状态写入失败原子回滚 |
| `test/recovery-store.test.mjs` | `recovery-status`、`prune-recovery`、备份预算、作用域回滚和中断事务恢复 |
| `test/p0-integration.test.mjs` | 澄清阻塞与跨栈 Review 项路由 |

### 4.3 质量、证据与 CI

| 文件 | 覆盖重点 |
| --- | --- |
| `test/quality.test.mjs` | 快照、验证、Review 证据、风险升级、豁免、报告完整性、Hook、锁、CI 检查评估 |
| `test/p0-contract.test.mjs` | full 策略必须覆盖 Q-01 至 Q-07，Q-07 不可豁免 |
| `test/ci-runtime-state.test.mjs` | `ci prepare` 忽略工作流日志，但拒绝真实源码改动 |

`test/quality.test.mjs` 覆盖的是流程和证据结构，不是目标项目的真实业务质量。测试中的通过命令、Review 和浏览器结果均为夹具，不能作为产品验收结论。

### 4.4 发现、基线与复用

| 文件 | 覆盖重点 |
| --- | --- |
| `test/discovery.test.mjs` | 预览只读、范围扫描、上下文失效、证据校验、基线更新保护、符号链接、回滚、独立恢复 |
| `test/project-baseline.test.mjs` | glob 语义、规则注册表、采纳、陈旧证据、策略读取边界 |
| `test/code-reuse.test.mjs` | 能力新鲜度、复用决策、内部边界、共享能力提取和 Review 指纹 |
| `test/project-standards.test.mjs` | 项目规范 manifest、glob 适用范围、适用指纹失效、Compliance Matrix、Review `standardsReferences` 和设计期阻断 |

### 4.5 文档引擎

| 文件 | 覆盖重点 |
| --- | --- |
| `src/openspec-min/test/lifecycle.test.mjs` | 五个导出、Spec 门禁、设计/任务失效、重复创建、路径穿越、合并冲突、归档回滚、并发写 |
| `src/openspec-min/test/skill-resources.test.mjs` | 独立部署后仍能加载完整 Skill 资源，不依赖源码树 |

### 4.6 跨栈与发布冒烟

| 脚本 | 覆盖重点 |
| --- | --- |
| `scripts/smoke-cross-stack.mjs` | Python schema 3 与 Vue schema 2 的 full 验证、Review、provenance、PR 前检查 |
| `scripts/smoke-release.mjs` | 发布目录结构、provenance、22 个 Skill、迁移后的 CLI、发现、评测、治理流程和 UTF-8 工件 |
| `test/helpers/governed-flow.mjs` | 供质量测试和发布冒烟复用的基线采纳、复用计划、审批和验收夹具 |

跨栈冒烟中的 Vue npm scripts 是 `node -e "process.exit(0)"` 占位，不是真实 Vue 构建；Python 检查使用 `python3` 的语法和最小执行检查。它验证的是控制器编排，而不是框架本身。

## 5. 命令矩阵

### 5.1 日常开发顺序

```sh
npm run build
npm run check
npm test
```

定向验证：

```sh
node --test test/project-standards.test.mjs
node --test test/friendly-cli.test.mjs
node --test test/efficiency.test.mjs test/quality.test.mjs test/workflow.test.mjs
node bin/instar.mjs explain --json
node bin/instar.mjs cost lanes --json
```

`npm test` 的定义是：

```text
npm run build
npm run check
node --test test/*.test.mjs src/openspec-min/test/*.test.mjs
```

因此它会先重建 `runtime/`，再执行全部单元和集成测试。不要在前一步构建失败后继续把测试结果视为有效。

### 5.2 完整验证命令

| 命令 | 包含内容 | 何时运行 |
| --- | --- | --- |
| `npm run build` | 构建工作区与独立 `runtime/` | 每次修改源码后 |
| `npm run check` | 构建漂移、Skill、链接、清单、导出和模板检查 | 每次提交前 |
| `npm test` | build + check + 全部 Node 测试 | 常规提交和合并前 |
| `npm run test:cross-stack` | build + Python/Vue 跨栈冒烟 | 修改质量控制器、路由、Review 或验证逻辑后 |
| `npm run release` | `npm test` + 生成 `release/` + check + 发布包冒烟 | 发布或需要验证打包隔离时 |
| `npm run test:release` | 自动 build + 重新生成 `release/` + check + 发布包冒烟 | 需要从当前源码复验发布包时 |

`npm run release` 需要 Git 仓库和可解析的 `HEAD`，因为 `RELEASE-PROVENANCE.json` 记录提交、树和源码哈希。工作区未提交时 `dirty: true` 是正常记录，不是构建失败。

### 5.3 定向测试

先构建一次，再运行目标文件：

```sh
npm run build
node --test test/workflow.test.mjs
node --test test/quality.test.mjs
node --test test/discovery.test.mjs
node --test test/recovery-store.test.mjs
node --test src/openspec-min/test/lifecycle.test.mjs
```

同时运行多个文件：

```sh
node --test test/workflow.test.mjs test/p0-03-workflow.test.mjs test/p0-workflow-acceptance.test.mjs
```

按名称筛选（Node 20+）：

```sh
node --test --test-name-pattern="recovery" test/recovery-store.test.mjs
```

定向测试适合快速迭代，但不能替代 `npm test`：后者还包含构建漂移检查、链接检查和其他控制器测试。

## 6. 编写与修改测试

### 6.1 基本约定

- 使用 `node:test`、`node:assert/strict`，不引入新的测试框架。
- 使用 `mkdtemp(path.join(os.tmpdir(), 'instar-...'))` 创建隔离目录，并在 `test.after` 中删除。
- 测试内部需要 Git 时，在临时目录执行 `git init` 并设置局部 `user.email`、`user.name`，不依赖全局配置。
- 测试中不访问网络，不依赖真实模型、真实 GitHub 或外部扫描器。
- 测试夹具中的 `PASS`、Review 文本、浏览器结果必须明确标为夹具，不能暗示真实执行。
- 符号链接能力使用 `test/symlink-support.mjs` 探测；不可用时应跳过并输出原因。
- 新测试应验证失败关闭：不仅验证成功路径，也验证陈旧版本、错误哈希、缺失证据和回滚行为。

### 6.2 新增 Skill 或模板

`scripts/check.mjs` 固定校验 22 个 Skill 名称。新增或删除 Skill 时，必须同步更新：

- `skills/<name>/SKILL.md` 的 frontmatter。
- `scripts/check.mjs` 中的 `names` 列表。
- 受影响的命令、文档和发布冒烟。

新增工件模板时，还要检查 `artifactTemplatePairs` 是否要求多处副本字节一致。

### 6.3 新增文档

如果新增文档被 `docs/plugin-arch.md`、`docs/QUALITY.md` 或 `docs/LOCAL_TESTING.md` 链接，路径必须存在。如果新增文档被发布冒烟要求，还要同步 `scripts/smoke-release.mjs` 的必需文件列表。

### 6.4 修改运行时行为

修改 `src/` 后至少执行：

```sh
npm run build
npm run check
npm test
```

涉及质量路由、跨栈验证或发布路径时，再执行：

```sh
npm run test:cross-stack
npm run release
```

## 7. 故障注入与恢复演练

### 7.1 工作流事务

工作流写入使用项目锁和事务快照：

```text
.workflow/controller.lock
.workflow/pending.json
.workflow/transactions/<uuid>/before/
.workflow/transactions/<uuid>/result.json
```

进程中断后可能留下 `pending.json`。恢复前：

1. 读取 `.workflow/pending.json`，记录 `id`、`backup`、`present` 和作用域。
2. 检查 `.workflow/controller.lock` 中的 PID；**不要删除仍在运行进程的锁**。
3. 确认没有控制器进程活跃后，使用 `pending.json` 中的精确事务 ID 恢复。
4. 恢复会替换事务前的 `planning/` 和 `docs/prd/` 快照；如果中断后有人手工改过这些目录，应先保存其内容。

恢复请求：

```json
{
  "action": "recover",
  "project": "/absolute/project",
  "transactionId": "<pending.json 中的 id>",
  "reason": "Interrupted controller transaction"
}
```

```sh
printf '%s' '{"action":"recover","project":"/absolute/project","transactionId":"<uuid>","reason":"Interrupted controller transaction"}' \
  | node <plugin>/runtime/workflow-controller/cli.mjs -
```

控制器会拒绝事务 ID 不匹配的恢复。恢复完成后，原事务目录保留 `result.json`，状态为 `recovered` 或 `rolled-back`，便于审计。

### 7.2 恢复仓库状态

```json
{
  "action": "recovery-status",
  "project": "/absolute/project"
}
```

该动作不需要 `changeId`。预览清理时使用 `prune-recovery`；真正删除必须同时满足 `preview: false`、`confirm: true` 并显式列出已完成事务 ID。不要在存在 `pending.json` 时清理。

### 7.3 质量写入事务

质量报告通过 `.instar/quality-transactions/<uuid>/` 暂存并替换。测试 `report transactions clean up after success and preserve existing targets on failure` 覆盖成功清理和失败保留。质量操作锁位于 `logs/.quality.lock`；只有在确认对应进程不存在时才处理残留锁。

### 7.4 已有故障注入测试

```sh
npm run build
node --test test/p0-03-fault-injection.test.mjs
node --test test/recovery-store.test.mjs
node --test test/discovery.test.mjs
```

这些测试会通过 `process.exit()`、替换 `fs.rename` 和手工构造 `pending.json` 触发中断；它们不依赖真实断电，也不证明断电级持久性。

## 8. 发布验收

### 8.1 生成发布包

```sh
npm run release
```

该命令依次执行：

1. `npm test`。
2. `scripts/release.mjs`：复制插件文件到 `release/plugins/instar`，生成 `release/.agents/plugins/marketplace.json` 和 `RELEASE-PROVENANCE.json`。
3. `scripts/check.mjs` 与 `scripts/smoke-release.mjs`：检查源码/运行时一致性，再验证发布包隔离与冒烟流程。

发布包包含 `runtime/`、`skills/`、`standards/`、`docs/`、`hooks/`、`commands/`、`assets/`、`bin/`、README、许可证和第三方声明。它不包含根 `node_modules`。

### 8.2 发布冒烟检查

`scripts/smoke-release.mjs` 会把发布包复制到临时目录，并验证：

- marketplace 指向 `instar`，安装路径正确。
- 发布目录与源目录逐字节一致。
- provenance 中的版本、提交、运行时哈希和发布哈希有效。
- 发布 CLI 在设置 `NODE_PATH=` 后仍可运行。
- 工作流、质量门禁、provenance、PR 前检查、发现、语义评测和治理流程可用。
- 中文 PRD 以 UTF-8 读写。

它**不会**执行 `codex plugin add`，也不会访问真实 GitHub。宿主安装和远端联调仍需单独验收。

### 8.3 宿主安装验收

发布冒烟不修改 Codex 配置。需要验证本地 marketplace 和 CLI 安装链时，使用隔离的 `CODEX_HOME`，避免污染日常配置：

```sh
tmp_home=$(mktemp -d /tmp/instar-codex-home.XXXXXX)
CODEX_HOME="$tmp_home" codex plugin marketplace add "$PWD/release" --json
CODEX_HOME="$tmp_home" codex plugin add instar@instar-local --json
CODEX_HOME="$tmp_home" codex plugin list
```

预期结果是 marketplace 名称为 `instar-local`，插件为 `instar@instar-local`，版本与 `plugin.json` 一致，状态为 installed/enabled。该检查证明本地 marketplace 清单和 CLI 安装链可用，**不证明**交互式宿主 UI、真实会话中的 Skill/Hook 加载、命令面板展示或 marketplace 页面渲染。验收后可删除临时 `CODEX_HOME`。

### 8.4 单独复验发布包

```sh
npm run test:release
```

该命令会先执行 `sync-release`，把当前源码构建到 `runtime/` 并重新生成 `release/`，再运行 check 和发布包冒烟；不会复用旧发布包。

## 9. 完成标准

一次插件维护任务至少满足：

| 检查 | 通过标准 |
| --- | --- |
| 构建 | `npm run build` 退出码为 0，无 TypeScript 或复制错误 |
| 静态检查 | `npm run check` 输出 `Validated 22 skills...` |
| 单元/集成测试 | `npm test` 退出码为 0，无失败、无未处理异常 |
| 跨栈冒烟 | `npm run test:cross-stack` 输出 `status: PASS`，Python 14 项、Vue 17 项 |
| 发布 | `npm run release` 退出码为 0，发布冒烟输出 `PASS` |
| 文档 | 主文档和配套文档链接均可解析，不引用不存在的示例目录 |
| 证据 | 最终报告记录实际执行的命令、环境、时间和失败项，不把未执行项目写成通过 |

建议记录模板：

```text
日期：
Node / npm / Git / Python：
提交或工作树状态：
npm run build：通过/失败（摘要）
npm run check：通过/失败（摘要）
npm test：通过/失败（用例数、失败项）
npm run test:cross-stack：通过/失败（摘要）
npm run release：通过/失败（摘要）
未执行或需目标项目联调：
```

## 10. 已知覆盖缺口

1. **无真实模型验收**：测试只验证报告结构、Rubric 覆盖、证据字面存在和指纹，不证明模型判断正确。
2. **无真实 GitHub 联调**：CI 检查评估使用夹具；`ci publish` 的分支保护、Actions 和 secret scanning 需真实仓库验证。
3. **无真实浏览器/E2E**：前端测试中的浏览器结果来自夹具；真实浏览器验收需目标项目执行。
4. **跨栈命令是占位**：Vue npm scripts 不执行真实构建，Python 只做最小语法和运行检查。
5. **无 OS 矩阵**：当前宿主只验证一个操作系统；符号链接不可用时会跳过相关安全用例。
6. **无大规模性能测试**：项目树上下文有 2,000 个 entry、深度 8、250 行展示等上限，但没有大仓库吞吐和内存基准。
7. **无断电级耐久证明**：事务恢复测试模拟异常和进程退出，不证明强制断电或文件系统崩溃下的绝对原子性。
8. **无交互式宿主验收**：发布冒烟不调用 Codex 插件安装器；CLI 安装链可在隔离 `CODEX_HOME` 中单独验证，但不证明交互式 UI、真实会话中的 Skill/Hook 加载、命令发现或 marketplace 展示。
9. **无外部扫描器验收**：只有项目配置并实际运行扫描器时，才能声称对应安全检查通过。
10. **无身份认证**：审批、Skill trace、报告 HMAC 和 `--confirm` 都不是不可伪造的身份或授权证明。

## 11. 故障排查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `runtime/... content drift` | 修改了 `src/` 但未构建，或直接编辑了 `runtime/` | 重新 `npm run build`；只改 `src/` |
| `Bundled Zod runtime exceeded 6 MiB` | 构建裁剪规则失效或打包了开发文件 | 检查 `scripts/build.mjs` 的 `filter` |
| `Validated 22 skills` 前失败 | Skill 目录、frontmatter 或链接不一致 | 检查 `skills/<name>/SKILL.md` 和相对链接 |
| `ENOENT` 指向 `docs/LOCAL_TESTING.md` | 必需文档缺失 | 恢复该文档后重跑 `npm run check` |
| `ENOENT` 指向 `docs/EVALUATION.md` | Skill 链接或发布冒烟缺文档 | 恢复评测文档 |
| 定向测试仍使用旧行为 | 未先构建 | `npm run build` 后重跑 |
| `project must be the Git repository root` | 临时项目未初始化 Git 或路径不是根 | 在夹具中 `git init`，使用仓库根目录 |
| provenance 提交为空或发布失败 | 发布仓库没有提交 | 先创建提交；发布 `dirty` 可为 true |
| Python 跨栈失败 | 没有 `python3` 或版本不兼容 | 安装 Python 3，或在无 Python 环境跳过该冒烟并如实记录 |
| 符号链接测试被跳过 | 宿主无符号链接权限 | 在支持符号链接的 CI worker 上补跑 |
| `Interrupted transaction exists` | 存在 `pending.json` | 读取事务 ID，确认锁进程已退出后 `recover` |
| `Quality operation already running` | `logs/.quality.lock` 被活跃进程持有 | 等待或排查进程；不要删除活锁 |

相关文档：[架构书](plugin-arch.md)、[使用说明书](PLUGIN-GUIDE.md)、[质量协议](QUALITY.md)、[评测与验收说明](EVALUATION.md)。
