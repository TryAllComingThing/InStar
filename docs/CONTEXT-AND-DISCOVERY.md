# 上下文、源码发现与设计提取

## 1. 上下文来源和优先级

InStar 的目标是让模型读取项目已有事实，而不是复制一套新的规则文件。典型来源：

1. 根目录到目标文件目录的 `AGENTS.md`；
2. `.instar-quality.json` 配置的 `context.architecture`、`context.design`、`context.designSystem`、`context.tokens`；
3. 未配置时按常见路径发现架构/设计文档：

```text
ARCHITECTURE.md
docs/engineering/ARCHITECTURE.md
docs/architecture/ARCHITECTURE.md
docs/architecture.md
.context/ARCHITECTURE.md

DESIGN.md
docs/engineering/DESIGN.md
docs/design/DESIGN.md
docs/design.md
.context/DESIGN.md

design-system/{DESIGN.md,README.md,index.md}
docs/design-system/{DESIGN.md,README.md,index.md}
frontend/design-system/{DESIGN.md,README.md,index.md}
frontend/src/design-system/{DESIGN.md,README.md,index.md}
src/design-system/{DESIGN.md,README.md,index.md}
```

已知 design-system 目录存在但没有清单文件时，目录本身会记录为 `projectArchitecture.designSystemDirectory` 并抑制插件视觉参考；建议再通过 `context.designSystem` 指向实际清单，以便 `designCheck` 引用和指纹绑定。

4. 项目 `standards/` 中相关 Markdown/JSON/YAML；
5. 项目 Token 文件；
6. 当前 change 的 PRD、proposal、delta specs、技术设计和任务。

优先级是：用户明确要求 > 项目自有规则和已批准工件 > 插件 `standards/` 与 `design-guidance/` 参考。插件推荐不会自动升级为项目强制规则。

## 2. 上下文边界与指纹

- 上下文读取是只读的，不应逐次请求审批。
- 项目规则、架构/设计、设计系统清单、Token、PRD/Spec 和源码都会进入相应指纹。
- `contextHash` 用于确认生成输入没有在读取和写入之间变化。
- 大文件可能被截断；截断后必须检查相关原文，不能把摘要当成完整规则。
- 符号链接、越界路径、目录当文件、缺失的显式配置会报错而不是静默忽略。
- 空项目不会强迫探索不存在的架构；会记录 `explorationSkipped`。

## 3. Design Token

`context.designSystem` 是可选的 Markdown 清单入口，用于标识项目自有设计系统文档；它不是目录扫描开关，也不替代 `context.design` 或 `context.tokens`。未配置时按 `DESIGN.md`、`README.md`、`index.md` 的固定候选顺序发现清单；已知目录存在但无清单时只作为项目设计系统信号，不读取目录内容。UI 变更应同时读取设计合同、设计系统清单和实际 Token。

术语区分：

| 名称 | 所有者 | 用途 |
| --- | --- | --- |
| 插件 `design-guidance/` | InStar | 项目无设计源时的建议参考和通用审查规则，不是项目事实 |
| `context.design` | 项目 | 项目设计合同或规范入口 |
| `context.designSystem` | 项目 | 项目自有的设计系统 Markdown 清单 |
| `context.tokens` | 项目 | 实际 Token 文件，必须存在且非符号链接 |
| `designCheck.sources[].role=design-system` | 项目 | 仅指项目自有设计系统，不得指向插件 `design-guidance/` 目录 |

`context.tokens` 可配置为路径或路径数组。未配置时自动发现常见文件，例如：

```text
design-tokens.json, tokens.json, tokens.css,
src/tokens.css, src/styles/tokens.css,
src/styles/design-tokens.css, src/design-system/tokens.css,
styles/tokens.css, design-system/tokens.css,
frontend/src/styles/tokens.css, frontend/src/styles/design-tokens.css,
frontend/src/design-system/tokens.css, frontend/design-system/tokens.css
```

显式 Token 来源必须存在、位于工作区、是普通文件且非符号链接。设计检查只映射项目已有 Token；没有匹配 Token 时报告决策缺口，不擅自创建。

## 4. 插件设计参考的注入边界

插件 `design-guidance/` 只用于项目尚无设计源时的启动参考和通用设计质量审查，不是项目设计事实。

- 项目已配置或发现 `context.design`、`context.designSystem`、已知 design-system 目录或 `context.tokens` 时，UI 设计上下文只补充非规定性的可访问性、Token 审查和设计 Review 清单，不注入插件主题、视觉语言示例或示例布局。
- 设计/任务阶段返回 `designReferenceMode`：`bootstrap` 表示无项目设计来源时加载启动建议，`quality` 表示仅加载质量规则，`false` 表示非 UI 或后端变更；用于审计引用策略。
- 已知 design-system 目录存在但没有清单时，UI 上下文同时返回 `designWarnings`，提示配置 `context.designSystem` 或补充 `DESIGN.md`、`README.md`、`index.md`；`doctor` 对此报 `WARN`。
- 项目没有设计源时，才加载核心插件设计参考（视觉语言、组件交互、布局、可访问性、Token 和 Review 清单）作为启动建议。
- 主题规则不默认注入；只有项目明确支持多主题、租户品牌或用户可选外观时，才按需读取 `design-guidance/rules/theming.md`。
- 无论哪种模式，插件示例都不能覆盖项目设计合同、设计系统清单、Token、组件库或用户明确要求。

## 5. `spec-discover`：从现有源码生成基线 Spec

### 5.1 适用与不适用

适用：

- 已有工程需要逆向规格、模块建档或更新现状 Spec；
- 用户要求“从源码生成 Spec”。

不适用：

- 新功能提案；
- 需要 PRD → Spec → 实施审批的变更；
- 把未读源码或测试的猜测写成现状。

`spec-discover` 不需要 PRD、changeId 或初始化。

### 5.2 两步流程

**Context（只读）**

```sh
node <plugin>/bin/instar.mjs spec-discover \
  --project /absolute/project \
  --scope src/orders \
  --scope tests/orders
```

返回：

- `instruction`：适配的 OpenSpec 发现方法；
- `inventory`：文件、行数、SHA-256；
- `omitted`：未纳入或超限的条目；
- `baselineIndex` / `baseline`：已有 Spec 索引和已加载全文；
- `activeChanges`：当前活跃 change 的只读摘要；
- `contextHash`。

**Capture**

先在项目外写请求 JSON，`preview:true` 检查，再去掉 preview 应用：

```json
{
  "action": "capture",
  "project": "/absolute/project",
  "scopes": ["src/orders", "tests/orders"],
  "contextHash": "<from context>",
  "preview": true,
  "specs": {"orders/search": "<complete Markdown>"},
  "evidence": {
    "orders/search": [{
      "requirement": "Search orders",
      "path": "src/orders/search.ts",
      "startLine": 12,
      "endLine": 20,
      "excerpt": "exact text inside the cited lines"
    }]
  },
  "reviewedFiles": ["src/orders/search.ts", "tests/orders/search.test.ts"],
  "limitations": ["Remote service is outside this repository"],
  "update": []
}
```

每个 requirement 必须有证据，引用文件必须在 inventory 且出现在 `reviewedFiles`；行号合法、摘录精确匹配。控制器只持久化位置和哈希，不保存源码摘录。

### 5.3 输出与更新保护

输出：

```text
planning/specs/<capability>/spec.md
planning/discovery/<uuid>.json
```

已有 capability 默认受保护；更新必须显式放入 `update` 并提供完整修订文档。报告会比较 requirement 和 scenario 的 added/removed/modified，场景级变化也要审查。

### 5.4 限制

- 不运行应用、测试或模型；模型由宿主代理执行。
- 默认不读依赖、生成物、隐藏文件、规划工件、符号链接和已知凭据文件。
- 单文件超过 1 MiB、二进制或不支持格式会被列为 omitted。
- 总量受限：30,000 访问项、10,000 文本文件/64 MiB；超出应缩小 scope。
- “清单完整”不等于“语义覆盖完整”；必须报告未读文件和 limitations。
- 预览不写文件；capture 使用锁和事务，普通错误可回滚。

## 6. `design-check` 与 `extract-design-md`

### Design Check（变更级）

输入：项目设计契约、Token、批准的高保真说明/截图/交互描述、相关组件。

输出：

- 当前变更可执行的 Style Constraints；
- 现有 Token 名称、来源和用途映射；
- 响应式、交互、状态、可访问性约束；
- 未决项和参考比较限制。

它不修改项目级 `DESIGN.md` 或 Token。UI 受控工作流需要 `design-check` trace，并把 constraints/sources 传入 `write-design`。技术设计和 Review 必须说明复用了哪些现有组件、Token、布局与交互模式，以及偏离原因；同时传入结构化 `designReuse: [{kind, name, path?, note?}]`，kind 为 `component|token|layout|interaction|pattern`。其中至少需要一个 `component` 或 `pattern` 条目；确实没有可复用组件/模式时，必须提供 `designReuseReason` 说明原因。复用文件内容与理由都会绑定设计/任务审批。

### Extract DESIGN.md（项目级）

用于一次性提取整个前端的视觉语言：主题氛围、色彩角色、字体层级、组件状态、布局/间距、响应式、主题和可选的 Stitch 生成说明。它读取实际源码并保留原始值和既有命名，区分观察事实与解释；不修改应用样式。

当用户要“完整设计系统说明”时用 `extract-design-md`；当用户要“当前 UI 变更如何实现”时用 `design-check`。

## 7. 上下文优化

`context-optimizer` 只在项目指令臃肿、冲突、陈旧、难以发现或反复重新发现时使用。它先核实源文件和消费者，再建议最小修改，不把“缩短文件”作为唯一目标，也不伪造上下文质量分数。
