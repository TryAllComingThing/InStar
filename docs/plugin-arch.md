# 插件架构

## 1. 定位

InStar 是 Codex 插件层的软件交付编排器。它把“人类可审批的文档状态机”和“项目自有验证命令”连接起来，不把模型判断包装成不可变事实，也不替代宿主沙箱、外部 VCS/CI 或组织权限系统。

核心原则：

1. **编排而非执行**：质量命令由项目提供，InStar 负责调用、记录和校验。
2. **证据先于结论**：报告绑定源码、配置、文档和 artifact 指纹。
3. **人工审批独立于 AI Review**：Reviewer 发现不能自动转化为批准。
4. **按需加载上下文**：Skill、standards、design-guidance 只在相关任务读取。
5. **失败显式**：缺少证据、stale、BLOCK、锁冲突和事务中断不静默吞掉。

## 2. 目录与职责

```text
InStar/
├── .codex-plugin/plugin.json   # Codex 唯一安装清单
├── plugin.json                 # 工程索引（非安装清单）
├── assets/                     # 维护者声明性策略（不随 release 发布）
├── bin/instar.mjs              # 人类友好 CLI 分派
├── commands/                   # 项目命令提示词
├── skills/                     # 22 个 Skill 入口与引用资源
├── agents/                     # Markdown Reviewer 角色契约
├── templates/                  # 项目初始化模板、Agent TOML、质量模板
├── standards/                  # 工程规范参考
├── design-guidance/            # 设计审查与按需主题参考
├── src/                        # 控制器、共享模块、openspec-min 源码
├── runtime/                    # 构建后可运行 JS 与打包依赖
├── release/                    # 可安装 marketplace 与插件包
├── hooks/                      # SessionEnd Hook
├── test/                       # 控制器、CLI、发现、移植和发布测试
└── docs/                       # 本文档集
```

`.codex-plugin/plugin.json` 才是安装清单；根 `plugin.json` 与 `assets/policy.json` 是仓库维护者索引/声明性策略，不随 release 发布；`release/` 由 `scripts/release.mjs` 生成，不应手工当成源码编辑。

## 3. 分层架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Codex / 用户                                                 │
│ 自然语言、命令、人工审批、授权                                    │
└───────────────┬─────────────────────────────────────────────┘
                │ Skills / Commands / Hooks
┌───────────────▼─────────────────────────────────────────────┐
│ 编排层                                                       │
│ workflow-controller  quality-controller  discovery-controller │
│ status/visualize     evaluation/usage                          │
└───────┬──────────────────────┬──────────────────────┬────────┘
        │                      │                      │
┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
│ 文档引擎        │    │ 共享安全/证据层  │    │ 项目执行环境      │
│ openspec-min   │    │ canonical/hash  │    │ workspace scan   │
│ diff / parser  │    │ redaction       │    │ project commands │
│ schema / lock  │    │ profile contract│    │ reports/ logs/   │
└───────┬────────┘    │ token/usage     │    └────────┬────────┘
        │             └────────┬────────┘    └────────┬────────┘
        └──────────────────────┴──────────────────────┘
                               │
                   目标项目文件系统与审批记录
```

### 3.1 Skills 层

Skill 是给模型的操作协议：读取什么、何时调用控制器、如何评审、如何报告。它们不包含业务工具实现，也不能替代控制器门禁。Skill 通过 `trace-skill` 记录开始/结束；完成 trace 是 UI 设计、实现/验证时序等门禁的输入之一，但仍是代理自报证据。

### 3.2 控制器层

- `workflow-controller`：change 状态、阶段、审批、人工反馈、任务证据、Reviewer/Skill trace、源码快照、归档。
- `quality-controller`：配置解析、snapshot、验证命令、Review、doctor 和提交前检查。
- `discovery-controller`：源码清单、上下文哈希、证据校验、预览/捕获、基线更新和事务。

### 3.3 文档引擎

`openspec-min` 是一个独立 npm workspace，构建为 `runtime/openspec-min/`。它只处理规划文档：

- Markdown 解析、代码围栏屏蔽、需求/场景识别。
- ADDED/MODIFIED/REMOVED/RENAMED 合并与冲突拒绝。
- 五个固定 API 和规划根目录布局。
- 排他锁和事务快照，不执行应用代码。

### 3.4 共享模块

| 模块 | 职责 |
| --- | --- |
| `canonical.mjs` | 稳定序列化哈希、文件流式 SHA-256、大小限制 |
| `profile-contract.mjs` | 固定 `preflight`/`implementation`/`full`、`commit` 兼容别名与报告名 |
| `redaction.mjs` | 报告写入前的常见秘密脱敏与长度边界 |
| `bounded-input.mjs` | CLI JSON/stdin 8 MiB 上限 |
| `token-sources.mjs` | 设计 Token 路径校验与发现 |
| `agent-config.mjs` | 项目 TOML Agent 注册的安全合并 |
| `usage-telemetry.mjs` | Codex session JSONL 的 Token/API 读取 |

## 4. 关键数据流

### 4.1 受控工作流

```text
Skill 读取 state/context
  → 人类或 Skill 生成文档
  → controller 写入规划目录（锁 + 事务）
  → pendingReview.hash 绑定当前内容
  → 人类提供 reviewHash + decision
  → 下一阶段；任何文档/源码变化使旧审批失效
```

状态保存在 `planning/workflows/<changeId>.json`；每次成功变更单写到 `.workflow/traces/<changeId>.jsonl`，旧 `.workflow/traces.jsonl` 只用于兼容读取；完成后的状态副本写入 `planning/archive/<changeId>/workflow.json`。

### 4.2 质量验证

```text
snapshot → 运行项目 profile 命令
  → 每个 check 生成/绑定 artifact
  → 报告写入 reports/engineering-verify-<profile>.json
  → workflow 校验报告 id、configHash、snapshot、checkDefinitions、artifactHash
  → 质量检查与 Review 绑定最终 sourceHash
```

控制器只保存命令摘要、退出码、耗时、输出哈希和 artifact 位置，不持久化完整命令参数和原始输出，避免秘密扩散。

### 4.3 源码发现

```text
context（只读清单 + baseline + instruction）
  → 代理阅读源码/测试
  → capture preview（校验证据行、摘录、reviewedFiles）
  → capture 应用（事务写入 planning/specs + discovery report）
```

清单是覆盖范围提示，不是语义证明。超过预算时显式失败或要求缩小 scope。

### 4.4 工作区快照与外部提交

```text
change start → workspace inventory baseline
  → implementation + verification + quality-gate
  → 比较当前工作区与 state 绑定的 baseline，失效陈旧证据
  → quick/micro 在 submit 与 accept 之间再次比较源码 fingerprint
  → 提交、分支、合并、推送、PR/CI 交给外部 VCS/平台
```

InStar 不调用 Git，也不提供提交动作。`.instarignore` 控制工作区清单排除项，其内容哈希和风险规则也会进入 fingerprint；隐藏整个工作区的规则 fail-closed。每个 change 的 baseline 保存在 `.instar/baselines/`，change state 保存 baseline 的 `fingerprint + baselineHash` 交叉绑定，用于发现普通删除、替换和单侧篡改。本地哈希只用于变化检测和证据绑定，不是可信签名；同权限同时改写 baseline 与 state 不在本地防护范围内。

## 5. 状态与存储

| 路径 | 所有者 | 作用 |
| --- | --- | --- |
| `.instar.json` | 目标项目 | 初始化版本、安装 `stack` 与 managed 文件记录 |
| `.instar-quality.json` | 目标项目 | 质量命令、上下文和验证配置 |
| `AGENTS.md` | 目标项目 | 项目规则；初始化仅追加受控标记块 |
| `.codex/config.toml` 与 `.codex/agents/` | 目标项目 | 项目级 Reviewer 注册与配置 |
| `planning/specs/` | 文档引擎 | 基线 Spec |
| `planning/changes/<id>/` | 文档引擎 | proposal、delta specs、设计、任务 |
| `planning/workflows/` | 工作流控制器 | change 状态 |
| `planning/archive/` | 文档引擎 | 已归档 change 和状态 |
| `docs/prd/` | 工作流控制器 | PRD 文件 |
| `reports/`、`logs/` | 各控制器 | 验证、Review、语义评测、会话审计 |
| `.workflow/` | 控制器 | 锁、journal、事务快照、trace、usage |
| `.instar/baselines/` | 控制器 | 每个 change 的工作区清单基线；由 change state 交叉绑定 |
| `.instarignore` | 目标项目 | 工作区清单排除规则，替代 `.gitignore` 的扫描职责 |

目标项目是唯一业务产物存放处；插件安装目录不能被当作项目根目录。

## 6. 并发、事务与恢复

- 工作流和发现操作使用 `.workflow/controller.lock` 排他锁。
- 质量操作使用 `logs/.quality.lock` 排他锁。
- 文档引擎自身使用 `planning/.lock`。
- 工作流写入前把 `planning/` 与 `docs/prd/` 备份到 `.workflow/transactions/<uuid>/before`，并通过 `.workflow/pending.json` 记录未完成事务。
- 普通异常尝试回滚；进程崩溃、断电和外部编辑器并发写入不承诺原子恢复。
- 恢复必须核对 transactionId、reason 和锁 PID；不得删除活跃进程的锁。

## 7. 构建与发布

```text
src/*.mjs ──npm run build──► runtime/*.mjs
src/openspec-min/*.ts ─────► runtime/openspec-min/*.js + 依赖
skills/templates/... ──────► runtime assets / release
release.mjs ──────────────► release/plugins/instar + marketplace.json
```

`npm test` 先构建，再执行 `scripts/check.mjs` 和测试；`npm run release` 还会复制发布包并执行隔离搬迁 smoke test。`release/` 不应回写到源码。

## 8. 安全与信任边界

- 文件操作限制在目标项目根目录内，拒绝符号链接和路径穿越。
- 质量命令对 POSIX 和 Windows 原生可执行文件使用直接 `spawn`；Windows `.cmd`/`.bat` 经受控 `cmd.exe` 包装并拒绝 shell 元字符。命令参数不持久化；敏感环境变量会被过滤；可选 allowlist 限制可执行文件。
- 输入 JSON、报告、artifact 和快照有大小/数量上限。
- 报告持久化前进行常见 secret redaction，但不是完整 DLP。
- `SessionEnd` Hook 只做会话审计；提交、PR、CI 和分支保护门禁由外部 VCS/平台承担。
- Reviewer trace、审批记录和 provenance 是本地可编辑状态，不提供身份认证或加密证明。
- baseline 自哈希和 state 交叉绑定只能发现普通误删、替换和单侧篡改；同时改写两者的同权限攻击者仍需外部服务端签名、受控存储或 CI 复核。

## 9. 设计取舍

| 取舍 | 原因 | 代价 |
| --- | --- | --- |
| 固定三个 profile | 统一门禁命名，减少 DSL 扩散 | 不支持任意 profile 继承 |
| 报告与 artifact 强绑定 | 防止复用旧 PASS、替换证据 | 报告变多，旧严格报告会失效 |
| 工作区清单 + baseline | 不依赖 VCS，可离线检测源码变化并用 state 交叉绑定发现普通篡改 | 同权限同时改写 state/baseline 仍不可防；changedLines 只是保守估算 |
| 事务快照 | 控制器错误可恢复 | 备份可能包含敏感规划内容 |
| Skill 自报 trace | 可观察模型实际流程 | 不是密码学执行证明 |
| 项目自有命令 | 跨语言、离线、可移植 | 项目必须自己安装和维护工具 |
