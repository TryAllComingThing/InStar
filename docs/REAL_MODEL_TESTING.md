# InStar 真实模型本地测试手册

本手册测试“真实 Codex 模型 + 已安装的 InStar + 本地前端项目”的完整行为，不以 npm 单元测试、固定生成函数或模拟浏览器结果代替。测试人员逐轮发送消息，并亲自批准四个业务边界。本手册的创建不表示真实模型闭环已经通过。

## 1. 测试目标与通过标准

检查核心工作流 Skill 能否被发现和正确调用，控制器是否真实持久化状态，以及模型是否能完成 PRD → Spec → 设计/任务 → 实施 → 浏览器验证 → 人工验收 → 归档。同时单独验证 `context-optimizer`、`engineering-research`、`systematic-debugging` 的触发条件和边界；正常任务不应无差别加载这些辅助 Skill。

完整通过必须同时满足：

1. 插件 installed/enabled；目标项目正确初始化且重复初始化无覆盖。
2. PRD、Spec、实施授权、验收四处分别停下等待本轮真实批准。
3. 需求、场景、任务、实现和测试可逐项对应。
4. 产品测试/构建实际运行；浏览器真正打开页面并操作。
5. 归档后状态 completed，基线和归档工件齐全。
6. 记录实际模型、CLI 版本、会话和证据；失败不能被成功重试记录覆盖。

子 reviewer 不可用而主模型明确执行了审阅，可记为“降级通过”，但不能记为“子 reviewer 能力通过”。缺少浏览器能力只能记为“部分完成/阻塞”，不能记完整通过。

## 2. 环境准备

以下命令面向 macOS/zsh；其他机器替换插件源码路径。Node 要求 >=20.19.0。本机已核对 Codex CLI 0.157.1 的 plugin、login、-C、-m、--no-daemon 和 --no-alt-screen 参数；其他版本先查看帮助。

### 2.1 生成最新发布包

```sh
cd /Users/kyle/Desktop/AI-frontend/InStar
node --version
npm --version
codex --version
npm ci
npm run release
```

预期全部自动测试和发布包冒烟通过。这是模型测试的前置条件，不代表模型测试成功。

### 2.2 建立隔离配置与业务项目

以下命令在同一个终端依次执行：

```sh
INSTAR_RELEASE="/Users/kyle/Desktop/AI-frontend/InStar/release"
INSTAR_TEST_HOME="$(mktemp -d /tmp/instar-model-home.XXXXXX)"
INSTAR_PROJECT="$(mktemp -d /tmp/instar-model-project.XXXXXX)"
INSTAR_EVIDENCE="$(mktemp -d /tmp/instar-model-evidence.XXXXXX)"
printf '配置：%s\n项目：%s\n证据：%s\n' "$INSTAR_TEST_HOME" "$INSTAR_PROJECT" "$INSTAR_EVIDENCE"

CODEX_HOME="$INSTAR_TEST_HOME" codex plugin marketplace add "$INSTAR_RELEASE" --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin add instar@instar-local --json
CODEX_HOME="$INSTAR_TEST_HOME" codex plugin list --json > "$INSTAR_EVIDENCE/plugins.json"
cat "$INSTAR_EVIDENCE/plugins.json"
```

预期 instar@instar-local 的 installed/enabled 为 true。记录这三个临时路径；新开终端时需重新赋值为这些已有路径，不要重新 mktemp 后误以为是原会话。

### 2.3 登录与模型

```sh
CODEX_HOME="$INSTAR_TEST_HOME" codex login
CODEX_HOME="$INSTAR_TEST_HOME" codex login status
```

按交互提示完成登录。隔离配置不会自动继承正式配置中的登录、MCP 或浏览器连接。不要把访问令牌、API Key 或 auth.json 放进测试报告。

使用账户可用的真实模型即可；若要比较模型，每个模型使用全新的业务项目，输入相同需求。启动时可指定模型，不在手册中假定某个型号对所有账户开放：

```sh
INSTAR_MODEL="填写你账户可用的实际模型标识"
CODEX_HOME="$INSTAR_TEST_HOME" codex --no-daemon -C "$INSTAR_PROJECT" -m "$INSTAR_MODEL" --sandbox workspace-write --no-alt-screen
```

也可以省略 `-m "$INSTAR_MODEL"` 使用配置默认模型，但必须从客户端记录实际模型。`--no-daemon` 用于避免复用已有后台会话影响隔离。

前端依赖安装和启动服务所需的工具授权，与 InStar 四次业务批准是两回事。允许安装依赖不等于批准 PRD、Spec、实施或验收。

### 2.4 浏览器前置条件

在当前测试配置中提供能访问 localhost 的真实浏览器工具。不同环境可能使用浏览器 MCP、客户端内置浏览器或已连接浏览器插件；以当前会话实际可用工具为准。初始化模板本身不提供浏览器。

若 CLI 测试配置无法提供浏览器，可以改在已有浏览器能力的 Codex 客户端中完成整轮测试，但要在该客户端实际使用的配置里安装本地 marketplace，并重新核对插件与项目路径。不要假定 CLI 的临时配置自动同步到 GUI。

## 3. 用例 A：显式技能完整闭环

每个编号是单独一轮输入。不要一次发送所有提示词，不要提前发送“后续全部批准”。模型提问时按固定需求作答；遇到未定义业务选择，先确定答案并记录。

### A0：确认能力（不实施）

发送：

```text
本次进行 InStar 真实模型验收。请确认当前项目的绝对路径、已发现的 InStar 技能、Node 环境以及可用的浏览器工具。先检查能力，不创建业务实现、不创建或批准工作流。实际不可用的能力请明确说明，不要模拟工具调用。
```

预期：模型核对项目路径和技能来源。当前 21 个 Skill 应包含 initialize-project、requirements-workflow、write-a-prd、spec-explore、spec-discover、spec-propose、spec-verify、spec-design、spec-tasks、engineering-implement、engineering-verify、frontend-implement、frontend-verify、design-check、extract-design-md、quality-gate、quality-evaluation、ci、context-optimizer、engineering-research、systematic-debugging。不要仅凭模型口头说“已安装”判定成功，同时检查 plugins.json 和后续实际调用。

### A1：初始化与幂等性

发送：

```text
使用 initialize-project 初始化当前项目，先检查 preview，再应用初始化，最后重复初始化验证幂等性。只初始化插件项目规则，不创建业务应用。
```

预期：真实调用已安装插件的控制器；生成工作流所需的 `AGENTS.md`、`.instar.json`、项目工程说明、`.codex/config.toml` 中六个角色注册，以及 `.codex/agents/` 下角色配置和 Markdown 契约，并创建 planning、docs/prd、.workflow 目录。重复初始化 created 为空，已有文件不被覆盖。此流程不创建前端工程、复制工程模板或合并应用工程指令。

若当前会话尚未发现新建 reviewer，重新打开此项目会话，再继续后续步骤。记录是子 reviewer 审阅还是主模型降级审阅。

### A2：提出固定需求，等待 PRD 审阅

发送：

```text
使用 requirements-workflow 管理本次变更，changeId 固定为 order-status-filter。

在当前空项目创建一个 Vue 3 + TypeScript + Vite 的订单列表演示页，使用本地固定数据，不接后端、不做登录、不调用远程接口。
固定数据：A001 待付款，A002 已完成，A003 已完成。订单状态选项为：全部、待付款、已完成、已取消。
需求：默认显示全部 3 条；切换状态筛选；显示当前结果数量；已取消显示空结果提示；重置回到全部；筛选与重置支持键盘操作，焦点可见；在 390px 和 1280px 宽度下可用。
测试使用 Vitest，并实际运行生产构建。先完成 PRD 并提交给我审阅，在获得我的确认前不要生成 Spec 或实施。PRD 与说明使用中文。
```

预期：docs/prd/order-status-filter.md 存在；工作流 stage=prd、status=awaiting-approval、pendingApproval=prd。PRD 要包含固定数据、边界和可验证的验收标准；模型显示当前文档、待确认项和 review hash。此时不得已有业务实现或 Spec 包。

### A3：测试拒绝/修改分支

发送：

```text
当前 PRD 暂不批准。请补充：筛选不改变原始订单顺序；重复点击当前筛选项时，列表与数量保持稳定。更新 PRD 后重新展示给我审阅。
```

预期：明确宣布本轮使用 write-a-prd 修订，使用 request-changes 返回编辑阶段，经 write-a-prd 修订后通过 save-prd、submit-prd 重新提交；展示修改摘要，版本增加、review hash 更新。不得把这条修改意见记录为批准。已加载的技能无需重复读取，但本轮必须实际应用其指引；仅有 save-prd 记录不能证明选技。

再次发送：“还需补充：重置筛选不得修改底层订单数据，请再次修订 PRD 后让我审核。”预期再次使用 write-a-prd，完整重复修订/提交/人工审阅，仍无 Spec。另用一轮“可以，但请把空态文案明确为暂无符合条件的订单”，验证含肯定措辞的修改要求仍不被当成批准。保存每轮对话、修改前后文档、state 和 review hash。

最后发送“解释一下重复点击的验收标准，先不修改”，预期只解释，状态和 review hash 不变。

### A4：批准 PRD，生成并审阅 Spec

先阅读当前 PRD，确认修改已纳入，再发送：

```text
确认刚刚展示的当前版本 PRD。请记录这次确认，继续生成 proposal 和 delta specs，完成 Spec 校验并展示结果，停在 Spec 人工审阅边界。
```

预期：approvals.prd 有本次真实回复；planning/changes/order-status-filter 下存在 proposal.md、specs/<capability>/spec.md；校验实际运行；场景涵盖筛选、空结果、重置、顺序稳定、重复点击、键盘与响应式要求。proposal 的 Impact 中应记录探索读取的项目规范路径、受影响模块、适用依赖约束及未决冲突/未知项；若无项目架构规则，应如实说明。pendingApproval=spec。尚未生成 design/tasks 或实施。

### A4b：多轮 Spec 审阅与修订

逐轮发送以下消息，每轮检查产物后再发下一条：

1. “Spec 暂不批准，请将当前 PRD 已规定的重复筛选行为写成独立场景，再提交评审。”
2. “还需把当前 PRD 的重置不改变底层数据明确成场景，再次修改并校验。”
3. “可以，但请明确零条结果时数量为0，再让我评审。”

预期每轮明确使用 spec-propose 修订，经 request-changes、fresh context、save-spec、spec-verify/submit-spec 后重新展示文档和 hash；PRD 批准保持有效，Spec 批准不存在，没有 design/tasks。门禁失败须修复并重跑，不得将通过报告替代人工批准。技能使用证据记录每轮实际对话与工具操作，控制器单元测试不能证明真实模型选技。

在独立测试变更中，再提出超出 PRD 的业务要求（例如增加搜索）：预期 reopen prd，重新使用 write-a-prd，先完成 PRD 多轮审阅与确认，再重新生成和评审 Spec，不能直接塞入 design。

### A5：批准 Spec，生成设计和任务

审阅实际 Spec 后发送：

```text
确认刚刚展示的当前版本 Spec。请记录批准，生成技术设计和任务，展示两份文档、测试方案和任务验收条件。它们共同构成实施计划评审；先停下来，等待我明确批准实施计划后再写代码。
```

预期：technical-design.md、tasks.md 存在；技术方案遵循适用的 AGENTS.md 目录规则，并记录项目约束和文件变更计划；任务编号唯一且未勾选；方案与 PRD/Spec 一致；pendingApproval=implementation。仅生成文档不构成批准；用户明确批准这份包含技术设计和任务的实施计划，才授权开始实现。

### A6：授权实施

阅读任务后发送：

```text
批准刚刚展示的当前任务，授权开始实施。请使用 frontend-implement，运行真实产品测试和构建；完成后使用 frontend-verify 做真实浏览器验证，提供证据并等待我的最终验收。不要自行批准验收或归档。
```

预期：安装必要依赖、开发真实应用、运行 Vitest 与构建；任务完成有具体证据。若测试失败，修复后重跑并保留失败记录。插件自己的 npm test 不能替代目标前端应用测试。

### A7：实际浏览器验证

若上一轮尚未完成验证，发送：

```text
请继续 frontend-verify。启动实际开发服务并报告 URL，使用可用浏览器逐项操作：默认全部 3 条；待付款只显示 A001、数量 1；已完成显示 A002/A003、数量 2；已取消数量 0 且有空提示；重置恢复 3 条；重复点击与原始顺序稳定；用 Tab 和 Enter/Space 操作并检查可见焦点；检查 390px 和 1280px 宽度。记录实际操作、结果、测试/构建命令与截图路径。不可用或失败的项如实记录，不能模拟 passed。
```

预期：证据对应真实页面和当前代码；适用检查全部通过后 pendingApproval=acceptance，尚未归档。若无浏览器，记录阻塞；配置好能力后重试，不通过修改状态 JSON 绕过。

### A8：人工验收与归档

测试人员自行打开模型报告的实际 URL，至少复查筛选、空态、重置、键盘操作。确实通过后发送：

```text
我已实际查看并操作当前页面，确认本次实现及刚刚展示的验证结果，验收通过。请记录本次确认，合并基线并归档 order-status-filter，列出归档结果。
```

预期：status=completed；四类批准记录均存在；planning/specs/<capability>/spec.md 有基线；planning/archive/order-status-filter 下保留 proposal.md、specs、technical-design.md、tasks.md、workflow.json；PRD 仍保存在 docs/prd/order-status-filter.md。这里的四类归档产物是 proposal、delta specs 集合、technical design、tasks，workflow.json 是附带状态记录。只说“完成了”但没有控制器结果和文件证据不算通过。

## 4. 独立读取状态与留证

在第二个终端把下面变量替换为步骤 2 实际打印的路径。用于读取，不要用脚本替模型推进或批准流程。

```sh
INSTAR_PROJECT="替换为本轮业务项目绝对路径"
INSTAR_EVIDENCE="替换为本轮证据目录绝对路径"
INSTAR_CLI="/Users/kyle/Desktop/AI-frontend/InStar/release/plugins/instar/runtime/workflow-controller/cli.mjs"
node -e 'console.log(JSON.stringify({action:"state",project:process.argv[1],changeId:"order-status-filter"}))' "$INSTAR_PROJECT" | node "$INSTAR_CLI" -
```

模型每次停在审批边界后，在其空闲时保存一次状态快照，修改文件名为相应阶段：

```sh
cp "$INSTAR_PROJECT/planning/workflows/order-status-filter.json" "$INSTAR_EVIDENCE/A2-prd-state.json"
```

记录 A2/A3/A4/A5/A7/A8 的不同快照；保存当时展示的文档、模型对话、测试输出和浏览器截图。不要在控制器写入过程中外部修改 planning 或 docs/prd。

## 5. 用例 B：自然语言触发

新建独立项目并初始化，保留同一插件版本和模型。仅发送：

```text
撰写需求：为订单列表增加状态筛选、结果数量和空结果提示。请先整理需求给我审阅。
```

预期自然选中 requirements-workflow 或 write-a-prd，并真实使用控制器持久化 PRD，停在 PRD 审阅。只在聊天里输出 PRD、没有状态文件，判定失败。

另建一次新项目，测试从未初始化项目直接发送同样的需求，预期先初始化后进入 PRD。每个场景建议重复 3 次新会话，分别记录结果，不用挑选的一次成功替代稳定性结论。

## 6. 用例 C：恢复、失效与故障分支

每项使用单独测试项目或单独变更，不破坏已经通过的 A 用例。

| 用例 | 真实模型操作 | 预期 |
| --- | --- | --- |
| 跨会话恢复 | 在 Spec 待审阅时退出，重新打开同一项目，发送“继续 order-status-filter，先读取状态并告诉我下一步” | 读取 state，仍等 Spec 批准；不靠会话记忆推进 |
| 不授权实施 | 在任务待授权时发送“请解释第一个任务，暂不批准实施” | 只解释，不记批准，不开始编码 |
| 缺浏览器 | 在未配置浏览器的会话要求 frontend-verify | 明确 Not verified/阻塞，不能声称成功、请求最终验收或归档 |
| 文档变更 | PRD 待审批时，在模型空闲期间人为修改 PRD，再让模型检查当前审批是否仍有效 | 识别旧 hash 失效，重新展示并提交，重新等待批准 |
| 验证后改代码 | acceptance 待批准时要求修改按钮文案，但暂不验收 | reopen implementation，失效旧验证并重新验证，再等待验收 |
| 归档后新需求 | completed 后提出新增排序功能 | 新建变更，不改写已归档流程 |
| 初始化冲突 | 修改 docs/engineering/testing.md 的测试副本，再要求初始化 | 保留修改、报告 conflicts，不静默覆盖 |

文档变更用例不要把“批准旧版本”用于推进当前版本；测试人员先核对模型是否展示了实际新文档。恢复与中断的底层事务覆盖已由自动测试执行，这里无需杀死真实写入进程。

## 7. 测试报告模板

### 存量工程 Spec 建档补充用例

在没有 `.instar.json` 或 planning 目录的真实项目副本中请求：
`$spec-discover 分析当前工程，为已有功能生成 Spec，不修改应用代码。`
核对模型确实读取入口、实现和相关测试，先预览再捕获；产物为主规格而不是
ADDED delta，且没有虚构 PRD、proposal、任务或批准。逐条抽查源码引用及行为
语义，检查遗漏报告；仅有前端调用时不得声称验证了服务端行为。
再明确请求更新一个已存在的能力，核对其他能力不变和旧文档备份可读。
此用例需要真实宿主模型运行，控制器自动测试不替代它。

每次模型测试填写一份，放在证据目录中：

```text
测试日期：
测试人员：
插件版本 / 源码版本或副本标识：
Node / npm / Codex 版本：
客户端：CLI 或桌面端
实际模型标识 / 推理设置（如可见）：
项目绝对路径：
隔离配置路径：
会话标识或对话导出位置：
浏览器工具与版本（如可见）：
reviewer：子 reviewer / 主模型降级；实际调用证据：

A0 能力：通过 / 失败 / 阻塞
A1 初始化：
A2 PRD：
A3 PRD 多轮修改（每轮 write-a-prd 证据）：
A4 Spec：
A4b Spec 多轮修改（每轮 spec-propose/spec-verify 证据）：
A5 设计与任务：
A6 实施：
A7 测试和浏览器：
A8 验收归档：
B 自然语言触发：通过次数 / 总次数
C 异常用例：逐项结果

四次人工批准对应的对话与状态快照：
实际产品测试命令、退出码和输出位置：
实际构建命令、退出码和输出位置：
浏览器操作与截图：
失败、重试和剩余未验证项：
最终结论：完整通过 / 降级通过 / 部分完成 / 失败
```

如失败，先保存当前 state、相关工件和完整报错，再定位是模型选技、插件流程、开发实现、环境/权限还是浏览器能力问题。修改插件后重新 release、在新隔离配置中安装，重跑失败用例及受影响的后续阶段。

## 8. 相关文档

- [本地测试与自动检查](LOCAL_TESTING.md)
- [控制器动作、审批 hash 与恢复协议](../skills/requirements-workflow/references/controller.md)

本文的 CLI 命令来自本机 0.157.1 帮助，插件行为标准来自当前源码和技能协议。此文不声称其他版本界面或模型能力完全相同。
