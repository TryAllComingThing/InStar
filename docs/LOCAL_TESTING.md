# InStar 使用与本地测试手册

本手册分为“如何使用插件”和“如何验证插件实现”。自动测试验证插件控制器和发布包；它不代表真实模型、浏览器、外部扫描器或 GitHub 已经完成联调。

## 环境要求

- Node.js >= 20.19
- npm
- Codex CLI（仅安装测试和真实对话需要）
- Git（质量控制器要求目标项目是 Git 仓库根目录）
- `gh` 和已登录 GitHub（仅真实 CI/PR 联调需要）

不要把插件源码目录当作业务项目。所有业务项目都应使用独立临时目录或真实测试仓库。

## 构建和安装插件

```sh
cd /Users/kyle/Desktop/AI-frontend/InStar
node --version
npm --version
npm ci
npm run release
```

发布包位于 `release/plugins/instar/`，本地 marketplace 位于 `release/.agents/plugins/marketplace.json`。

使用隔离的 Codex 配置安装：

```sh
INSTAR_RELEASE="$PWD/release"
INSTAR_TEST_HOME="$(mktemp -d /tmp/instar-codex.XXXXXX)"
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace add "$INSTAR_RELEASE" --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin add instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json
```

预期插件标识为 `instar`，显示名称为 InStar，状态为 installed/enabled。该配置不会修改正式 Codex 配置。

## 使用流程

### 快捷 CLI

发布包提供可直接记忆的命令入口，项目参数默认为当前目录：

```sh
node <plugin>/bin/instar.mjs doctor --project /absolute/project
node <plugin>/bin/instar.mjs snapshot --project /absolute/project
node <plugin>/bin/instar.mjs verify --profile full --project /absolute/project
node <plugin>/bin/instar.mjs review --review-file ./review.json --project /absolute/project
node <plugin>/bin/instar.mjs ci prepare --title "feat: example" --project /absolute/project
node <plugin>/bin/instar.mjs ci status --project /absolute/project
```

`review.json` 需含当前 snapshot 的指纹和完整 Review 证据。`ci publish` 需要标题及显式 `--confirm`，会执行功能分支推送和 PR 创建/更新；仅在专用测试仓库联调时使用。验证参数错误时应得到非零退出码和 JSON 错误，不应静默忽略选项。

### 规范注入检查

在隔离目标项目中准备根目录和子目录 `AGENTS.md`、`docs/engineering/ARCHITECTURE.md`、`docs/design/DESIGN.md` 与 `standards/architecture/*.md`。在 Spec 阶段读取 `context`，确认 `projectArchitecture` 返回这些来源、规范正文和目录树；修改任一约束后重新读取，确认 `contextHash` 改变。用 `.instar-quality.json` 配置自定义文档路径，再验证 configured path 优先；移除所有可选架构/设计文档后，确认插件报告缺失并沿用项目现有模式，不自动套用预设架构。技术方案应包含 Architecture 和 File Change Plan，并引用实际规范。实现阶段确认 Skill 与 reviewer 指令要求再次读取目标路径适用规则。

### Token 来源

对 `.instar-quality.json` 的 `context.tokens` 分别测试有效文件、缺失文件、目录、符号链接和工作区外路径。有效来源应同时出现在 Doctor 和 Spec 上下文；无效路径应在两处一致阻断，且不会读取符号链接目标。未配置路径时测试常见文件名自动发现；没有候选文件时 Doctor 应显示 INFO。修改有效 Token 文件后重新读取上下文，确认 `contextHash` 变化。发布包测试应确认 `smol-toml` 与共享解析模块存在于 runtime，并在隔离搬迁后的目录完成工作流和 Doctor 检查。

项目质量配置测试覆盖 `.instar-quality.json` 的脚本映射、上下文来源、超时和 CI required checks；配置只服务当前仓库，不承担组织策略或身份认证。没有配置文件时应验证零配置 `doctor`、`snapshot` 和 `WARN` 的 `verify` 路径，并确认 `doctor`/`snapshot` 不创建项目配置、报告或日志。不要在项目配置或测试报告中保存访问令牌、密码或私钥。

InStar 不提供新工程脚手架或项目模板。项目模板由团队自行维护；零配置发现只需要 Git 仓库，严格质量门禁再由项目自行准备 `.instar-quality.json`、验证命令、Git 初始提交和 base 分支。

### 1. 需求到实现

推荐顺序：

1. `requirements-workflow` / `write-a-prd`
2. 人工确认当前 PRD
3. `spec-explore` / `spec-propose` / `spec-verify`
4. 人工确认当前 Spec
5. `spec-design` / `spec-tasks`
6. 明确授权后使用 `frontend-implement`
7. 使用 `frontend-verify` 验证实现
8. 使用 `quality-gate` 进行 AI Review
9. 人工验收后再归档或进入 `ci`

PRD 或 Spec 修改后必须重新提交当前版本评审，不能复用旧批准。

### 2. 调用轨迹与语义评测

在独立临时项目中直接开始 PRD 工作流，检查每次成功的控制器操作自动追加一条 `.workflow/traces.jsonl`。分别为 `write-a-prd` 写入 started/completed 事件，确认同一 `invocationId`、Skill 名称、阶段、摘要和时间均可见，且 trace action 不增加工作流 `version`。验证未知 Skill、无效事件和符号链接日志路径会失败。

对 PRD 调用 `evaluate-quality`，提交全部 `problem-outcome`、`scope-boundaries`、`user-journey-states`、`measurable-acceptance`、`risks-dependencies` 评测项。确认报告出现在 `reports/semantic-quality/<changeId>/prd.json`，状态、分数、精确原文证据和 SHA-256 指纹存在；删减量表项、传入不存在的证据、错误版本应被拒绝。修改 PRD 后重新评测，指纹必须变化。对 Spec、technical design、tasks 分别核对量表 ID及产物读取；`BLOCK` 作为评测建议显示，但不绕过已有人工审批。

`npm run test:release` 应在搬迁后的独立发布目录验证新增运行时模块、trace JSONL 和 PRD 评测，不依赖源码树。

### 3. 本地质量验证

```json
{"action":"frontend-verify","project":"/absolute/project","profile":"commit"}
```

```json
{"action":"frontend-verify","project":"/absolute/project","profile":"full"}
```

commit profile 用于提交前；full profile 用于 PR。任一脚本缺失、失败、超时或运行期间代码变化都会 BLOCK。

### 3. AI Review 和溯源

质量 Review 需要覆盖控制器按项目语言、框架和额外检查选择的完整清单；Vue 项目通常为 17 项，后端和未知技术栈不同。完成 Review 后记录 AI 溯源：

```json
{"action":"ai-provenance","project":"/absolute/project","aiGenerated":true,"sessionId":"session-id","summary":"本次会话完成订单筛选实现和验证。"}
```

提交或 PR 前，`quality-gate`、`frontend-verify` 和 provenance 的 fingerprint 必须匹配当前代码。

### 4. PR 和 CI

先准备本地 PR 内容：

```json
{"action":"ci","project":"/absolute/project","phase":"prepare","title":"feat: add order filter","body":"变更说明"}
```

没有 CI/GitHub 时可以跳过本节，只执行本地 `full`、Review、provenance 和 `pre-pr-check`。直接调用 `ci` 会提示未配置而不影响本地流程。只有在已有明确授权、配置了目标仓库和允许 host 后，才执行 publish。publish 只推送功能分支，检查远端 base、HEAD、PR 和 required checks；不推主分支、不 force push、不自动合并。

## 控制器手动冒烟测试

使用发布包中的 CLI：

```sh
INSTAR_PROJECT="$(mktemp -d /tmp/instar-project.XXXXXX)"
INSTAR_CLI="$INSTAR_RELEASE/plugins/instar/runtime/quality-controller/cli.mjs"
git -C "$INSTAR_PROJECT" init -b main
git -C "$INSTAR_PROJECT" config user.email test@example.invalid
git -C "$INSTAR_PROJECT" config user.name InStar-test
```

严格质量验证前，项目需要存在 `package.json` 或对应语言的工程文件、`.instar-quality.json`、初始 commit 和 `main` base。没有配置文件时，控制器应返回零配置 `WARN`，而不是假装完成了项目检查；没有初始 commit 或 base 时，快照操作应返回结构化 BLOCK。

`.instar-quality.json`、项目 scripts 和 Git 初始状态由项目自身维护。

测试 JSON 错误：

```sh
printf '%s' '{broken' | node "$INSTAR_CLI" -
test "$?" -ne 0
```

测试旧报告失效：先运行 full verify 和 quality-gate，再修改一个受检文件，重新执行 `pre-pr-check`；预期返回 BLOCK。

## 自动测试命令

存量 Spec 建档：在目标项目调用 `$spec-discover`。终端可通过
`node <plugin>/bin/instar.mjs spec-discover --project /absolute/project` 读取清单和移植后的分析指令，
通过 `--input /tmp/discovery-request.json --preview` 验证模型生成的文档包。
详见 [发现协议](../skills/spec-discover/references/protocol.md)。`test/discovery.test.mjs`
覆盖独立建档、模块范围、证据失败、源码失效、已有基线保护、更新备份、恢复及迁移运行时。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 构建 openspec runtime 和 quality runtime |
| `npm run check` | 检查技能、资源链接、唯一安装清单、Hook 和运行时产物 |
| `npm test` | 构建、静态检查并运行自动化测试 |
| `npm run release` | 完整测试、生成 release 并执行发布包冒烟测试 |
| `npm run test:release` | 只验证已有发布包 |

自动测试覆盖审批边界、失败短路、报告过期、暂存区变化、Hook 的提交/PR 拦截与普通调用快速返回、空 SessionEnd、显式 session-summary 收尾、符号链接、并发锁、CI check 评估和发布包搬迁。工程模板由项目侧单独维护与验收。

在隔离目标项目中设置自有 `AGENTS.md`、设计文档、框架主题配置、组件库和 Token 来源，配置对应路径，确认这些项目规则被设计检查和技术设计读取；规范变化会使未完成的技术设计过期并要求重审。测试旧 `.context/` 文档发现兼容，并确认未配置 session destinations 时 SessionEnd 不生成项目状态或经验文件。

对规范选择做静态/手工核对：包含 TypeScript/Vue 的项目上下文应选择对应语言规则；需求涉及 API 时包含 `standards/api/DESIGN.md` 与 `SECURITY.md`；涉及数据库迁移时包含通用数据库设计、迁移规则，并仅在 PostgreSQL 项目加载其专属指南。确认不同语言的规则不会无差别全部加载，且对应引用内容变化会更新技术方案上下文指纹。

本插件没有模板复制功能；具体工程模板和依赖安装由项目模板仓库负责。

## 安全和失败验收

必须验证：

- `.ssh`、`.aws`、`.env.production` 和插件安装目录不能写入。
- 复合 shell 命令、`git -C` 和非项目根目录提交被 Hook 拒绝。
- 缺少质量脚本、Review、provenance 或 required check 时阻断。
- CI pending、cancelled、skipped、missing 和 failure 都不能视为通过。
- SessionEnd 写入失败只告警，不伪造完成状态。
- 用户授权文本不会作为身份凭证使用；GitHub/`gh` 登录态和仓库权限承担实际认证。

## 真实模型和 GitHub 验收

真实模型多轮 PRD/Spec、浏览器交互和人工验收见 [REAL_MODEL_TESTING.md](REAL_MODEL_TESTING.md)。真实 GitHub 验收需要专用测试仓库、功能分支、GitHub Actions workflow、`gh auth status` 和明确允许的 API host。没有这些条件时只测试 `ci prepare`、mock check assessment 和安全阻断，不执行真实推送。

测试结束后可以删除本次创建的临时项目和隔离配置，但不要删除正式 Codex 配置、真实业务目录或未知进程持有的锁文件。保存 Node/npm/Codex 版本、命令输出、报告 JSON、安装结果和真实对话/浏览器证据。
