# InStar v2.4 质量编排协议

InStar 将需求/Spec 文档引擎、项目上下文治理和质量/交付编排分层。插件调用项目已有脚本和外部工具，不实现 ESLint、测试、安全扫描或 CI 引擎。

## 项目配置

InStar 不创建前后端工程、不分发工程模板，也不向项目写入 `.instar-quality.json`。项目可以自行维护该文件，以固定检查命令、质量策略和长期门禁；没有该文件时，InStar 使用零配置发现模式，仅诊断项目上下文并生成带限制说明的本地验证报告。

## 质量动作

| Action | 作用 |
| --- | --- |
| `engineering-verify` | schema 3 项目按配置运行任意本地前后端检查；没有配置时执行零配置发现并返回 `WARN`，不猜测或执行未声明命令 |
| `frontend-verify` | schema 1/2 兼容入口：commit profile 执行 lint/typecheck/dependencies；full profile 额外执行 test/build/vite-build，以及已配置的安全扫描、E2E 和视觉回归 |
| `quality-gate` | 按项目语言、框架和 `review.extraChecks` 动态选择 AI Review 清单（Vue 项目通常为 17 项）；已配置的 Vue 工具才执行，其他专项适配器可选 |
| `ai-provenance` | 绑定 HEAD、sessionId、summary 和 aiGenerated |
| `pre-commit-check` | 校验 commit profile 与 Review |
| `pre-pr-check` | 只接受 full profile、最新 Review 和 provenance |
| `ci` | 准备或执行功能分支推送、PR 和 CI 查询 |
| `doctor` | 诊断上下文、依赖、CI 目录和质量配置；没有配置时报告自动识别结果，不创建配置文件 |

Review 必须覆盖控制器依据项目语言、框架和 `review.extraChecks` 动态选择的完整检查清单；Vue 项目通常为 17 项，后端和未知技术栈使用不同清单。显式项目配置时，外部工具由 `.instar-quality.json` 映射到项目脚本，脚本缺失或非零退出即 BLOCK；无配置模式不执行猜测的检查命令。安全与性能维度按变更风险评估；不适用时记录 NA 和原因。退出码是基础门禁；L2/L3 变更还必须提供可验证的结构化 Review evidence。

### 变更风险与 Review 证据

质量命令可以通过 `riskLevel` 标记变更风险：`L0`、`L1`、`L2` 或 `L3`。控制器会根据内置敏感路径规则和 `.instar-quality.json` 的 `riskPolicy.rules` 自动提升风险等级，调用方不能把已识别的高风险变更降级为 L1。L2/L3 变更必须使用 `full` profile；L2/L3 的 Review evidence 必须是结构化对象，包含证据类型、相对文件路径、单行 `line` 或闭合范围 `startLine`/`endLine`、当前源码摘录、说明和与 Review fingerprint 一致的 `snapshotFingerprint`。InStar 会校验引用文件、声明行范围和摘录是否匹配当前工作区，摘录存在于其他行不能通过。

结构化 evidence 的状态语义也受门禁约束：`type: "not-verified"` 只能配合 `WARN` 或 `BLOCK`，`type: "not-applicable"` 只能配合 `NA`；不能用 `PASS` 掩盖未验证或不适用的检查。报告写入采用事务暂存目录，成功后才更新历史报告、日志和 canonical 报告；失败会清理已移动文件并恢复已备份的旧报告。

L3 至少必须在 `riskPolicy.l3` 中配置必需的人工 Reviewer 角色；`requiredChecks` 是可选的，只有项目已经接入 CI/GitHub 时才配置。没有 `ci` 配置时，L3 仍可在本地完成 full verify、结构化 Review 和人工审批，但报告应被理解为“本地完成、远端未接入”，不能作为远端合并或生产发布证明。配置 `requiredChecks` 和 `ci` 后，CI publish/status 会校验这些检查确实属于 base 分支的 required status checks。审批字段只是外部身份系统的引用，不是 InStar 自己完成的身份认证。

CI/GitHub 是可选交付适配器，不是本地质量门禁的前置条件：没有 `ci` 时，`doctor`、`snapshot`、`verify`、`quality-gate`、`ai-provenance`、`pre-commit-check` 和 `pre-pr-check` 仍可使用；直接调用 `ci prepare|publish|status` 会返回 WARN 并说明未配置，而不会阻断本地验证流程。团队可先采用本地模式，后续仅增加 `ci` 配置即可接入远端门禁。

该机制提升证据关联性，但不证明 Review 独立完成、检查覆盖充分或代码没有缺陷。人工 Reviewer、CI required checks、分支保护和 CODEOWNERS 仍是最终质量与权限边界。

## 上下文

项目规范由项目维护，InStar 负责发现、注入、校验新鲜度和汇总检查结果，不强制项目采用 FSD 或特定模块架构。插件 `standards/` 是 Skill 可按任务引用的工程建议，不是项目事实源，也不自动成为 BLOCK 门禁。UI 设计规则、主题、组件库和 Token 均由目标项目维护。InStar 不安装主题实现、视觉快照或架构扫描器。规则来源职责如下：

- `AGENTS.md`：适用目录内的工作指令；越靠近目标目录的规则越具体。
- 架构与设计文档是项目所有的可选输入。通过 `.instar-quality.json` 的 `context.architecture`、`context.design` 配置；未配置或设为 `null` 时依次发现根目录、`docs/engineering/`、`docs/architecture/` 或 `docs/design/` 中的文档，最后兼容旧 `.context/ARCHITECTURE.md`、`.context/DESIGN.md`。
- Design Token 来源也是可选项目输入，可通过 `context.tokens` 配置一个相对路径或路径数组；未配置时只发现常见 Token 文件名。Doctor 与 Spec 上下文共用安全解析：缺失、符号链接、目录或工作区外路径均不能作为有效来源，配置路径无效会阻断检查；没有配置且未发现时报告 INFO。`design-check` 按需读取并映射实际存在的 Token，不会强制引入 Token 体系。
- 会话状态与教训默认关闭。需要持久化时，可将 `context.sessionState`、`context.lessons` 指向项目内的 Markdown 文件；SessionEnd 只追加本次明确提供的摘要/有证据教训，不生成占位文字。

例如，项目已有自己的规范目录时只需映射路径，不必复制文档：

```json
{
  "context": {
    "architecture": "docs/architecture/system-overview.md",
    "design": "product/design-guidelines.md",
    "tokens": ["src/styles/tokens.css"],
    "sessionState": null,
    "lessons": null
  }
}
```
- `standards/`：项目可选的工程标准。技术方案和 Spec 阶段读取 Markdown、JSON、YAML 文档，并纳入上下文指纹。

### 项目质量配置

`.instar-quality.json` 是单仓库的可选质量工具配置，用于映射项目检查命令、基础分支、上下文文档、超时和 CI 检查。schema 1/2 使用 npm scripts；schema 3 可用直接命令适配多语言工具链。它不是组织策略服务，也不提供身份认证或组织级策略继承。配置属于项目本身，质量结果会绑定相关配置和规范文件的快照指纹。

没有配置文件时，`doctor` 和 `snapshot` 不写入项目配置、报告或日志；`verify` 才会生成 `WARN` 的自动发现报告，记录识别到的技术栈和未执行的检查。该报告不能满足 `pre-pr-check`，也不能作为远端 CI、合并或发布证明。若需要严格且可重复的本地门禁，项目应自行维护配置文件。

当前解析器兼容 `schemaVersion` 1、2 和 3；不会自动改写项目配置。1/2 为 npm 前端验证格式。3 必须定义 commit/full profiles 和 `tools.checks`，并可通过 `verification.inputs` 声明 Git 忽略但影响检查的本地输入。每条检查提供直接命令及参数；命令不经 shell 启动，不支持命令拼接。配置命令及参数由项目维护者负责审查，只使用项目已有本地工具。环境变量敏感项过滤是启发式规则，不是完整 allowlist 或安全隔离，宿主 OS 沙盒才是执行边界。旧配置可继续使用，未知/不完整版本会明确报错。

示例（后端仓库可将 `go`、`pytest`、`mvn`、`cargo` 等项目已有命令配置在此；示例仅展示 Go）：

```json
{
  "schemaVersion": 3,
  "baseRef": "main",
  "verification": {
    "profiles": {
      "commit": ["go-vet"],
      "full": ["go-vet", "go-test", "migration-check"]
    },
    "inputs": [".local-generation/openapi.yaml"]
  },
  "tools": {
    "checks": {
      "go-vet": { "command": "go", "args": ["vet", "./..."] },
      "go-test": { "command": "go", "args": ["test", "./..."] },
      "migration-check": { "command": "./scripts/check-migrations", "args": [], "timeoutMs": 180000 }
    }
  }
}
```

项目可调用 `engineering-verify` Skill 或执行 `node <plugin>/bin/instar.mjs verify --project <repo> --profile full`。自定义 profile 的必需检查均失败即 BLOCK，且源码在验证期间改变也会 BLOCK。数据库迁移命令必须指向项目提供的 disposable/CI 数据库，不得连生产环境。后端仓库如需 PR 自动门禁，还需将真实 CI check 配置到分支保护；本地验证不能替代远端检查。

`verification.inputs` 用于把 Git 忽略但会影响构建/测试的本地生成输入纳入源码快照；目录会递归纳入，拒绝符号链接、敏感路径以及超过 10,000 文件或 256 MiB 的输入。不要将密钥文件作为验证输入。未显式列出的 Git 忽略文件不在快照内。验证报告记录已通过的检查 ID 和“配置检查通过”的范围说明；PASS 不证明项目维护者选取的检查覆盖了所有风险。

团队的 GitHub 身份、仓库权限和合并门禁由 GitHub/`gh`、CI 与分支保护提供；InStar 只要求外部提交/PR 操作有明确的用户授权，并编排、检查和汇总结果。普通团队无需配置组织公钥、签名策略或身份服务。

`design-check` 在 UI 变更需要落地样式约束时读取项目设计文档、框架主题配置、组件库、配置或发现的 Token 来源，以及经确认的高保真说明/参考；输出本次变更的 Style Constraints 和带来源的 Token 映射。它不提供或引入插件级设计系统、主题实现或 Token 定义。

`extract-design-md` 用于从已有前端实现整理完整的视觉设计说明，并按请求写入项目根目录 `DESIGN.md`。它保留人工章节和源码命名，区分可观察事实、设计解释与未确认内容，不修改应用代码。

插件侧的工程参考遵循通用规则 + 按需扩展的组织方式：`standards/languages/` 按仓库实际语言选择；`standards/api/` 覆盖 HTTP API 设计与安全；`standards/database/` 覆盖数据建模、迁移和 PostgreSQL 注意事项。它们依据 ECC 的分层规则思路整理，并以语言官方资料、OpenAPI、IETF HTTP RFC 和 OWASP 指引作为外部参考；它们是可供 Skill 使用的建议，不替代项目约定或自动化工具。

规范冲突必须显式报告，不静默选择。缺少可选来源时沿用项目现有代码模式并说明未定义项。文档被截断时必须检查相关原文后再确定路径或约束。SessionEnd 只有在存在显式 `session-summary` 待处理摘要时才写入 `logs/` 审计摘要；只有配置 `context.sessionState` 或 `context.lessons` 且本次提供了真实摘要/有证据教训时，才追加到项目文档。Session summary 不应包含密钥、内部凭据或未经审查的外部文本。

Spec 阶段审查需求与显式架构规则是否冲突；技术方案阶段生成 `technical-design.md` 的 Architecture、Project Constraints 和 File Change Plan；实现前再次读取目标路径适用规范。项目长期设计文档不会被每次变更自动改写。

旧版 npm 项目可选择配置架构检查适配器：在 `.instar-quality.json` 设置 `tools.architecture` 为 `package.json` 中的 npm script 名称。schema 3 项目可将架构检查直接列入 `tools.checks` 和适用 profile。已配置的脚本必须成功，才可通过质量门禁；未配置时仅标记 INFO。InStar 不实现架构扫描规则。例如：

```json
{
  "tools": {
    "architecture": "quality:architecture"
  }
}
```

同时在项目 `package.json` 中定义该脚本，并让它调用项目选择的检查器。`doctor` 会报告脚本是否可运行。

旧版 npm 项目可选配置安全扫描适配器：在 `.instar-quality.json` 设置 `tools.security` 为 `package.json` 中已存在的扫描脚本名称。它只在 `frontend-verify full` 运行；缺失脚本、非零退出、超时或检查期间源码变化都会阻断该次验证。schema 3 项目将安全扫描作为命名检查放入 `tools.checks` 并列入 `verification.profiles.full`。命令参数会运行但不会写入报告；不要把密码、DSN 或带凭据 URL 放在命令参数中。没有配置时 `doctor` 仅报告 INFO，不能把人工 Review 描述为 SAST/SCA 已通过。例如：

```json
{
  "tools": {
    "security": "quality:security"
  }
}
```

项目在 `package.json` 自行实现 `quality:security`，选择工具和范围；InStar 不安装扫描器、不上传源码、不提供扫描规则。脚本应在本地可用、离线执行并以非零退出表示扫描失败。若安全扫描是 CI 合并要求，还须将其真实 GitHub check 名称列入 `ci.requiredChecks`；`tools.security` 本身不声明远端必需检查。误报应在项目工具配置/策略中有审查记录，不能吞掉扫描错误以制造通过结果。


## GitHub 边界

`ci` 只允许功能分支，检查远端 URL、base、HEAD、PR head/base 和项目配置的 required checks；禁止主分支推送、force push、自动合并和生产部署。执行提交、推送或创建 PR 仍需用户明确授权；身份和仓库权限由 GitHub/`gh` 认证提供，InStar 不建立团队身份系统。发布报告前应脱敏并限制长度；真实 GitHub 联调需要项目配置仓库、认证和允许的 host。

Hook 使用官方 `PreToolUse` 与 `SessionEnd`，作为本地质量反馈辅助；PreToolUse 对普通 Bash 调用快速返回，SessionEnd 没有待处理摘要时不产生文件。它不是不可绕过的安全边界。团队共享门禁应由 CI 和分支保护执行。Hook 不主动联网调用 AI。

## 清单和发布

`.codex-plugin/plugin.json` 是唯一安装清单；根 `plugin.json` 是工程索引。Hook 路径为 `hooks/hooks.json`。设计 Skill 包括 `design-check`（单次变更样式约束）和 `extract-design-md`（完整项目视觉设计说明）。`runtime/` 与 `release/` 是构建产物，发布前必须通过 source/runtime/release 一致性检查，并确认 TOML 解析器随运行时打包。

发布包包含 `RELEASE-PROVENANCE.json`，记录插件版本、源提交、构建 Node 版本、运行时哈希和发布包哈希。正式发布仍应在干净提交上执行 `npm run release`，并将 provenance 与外部制品存储或签名系统关联；本地 provenance 不等同于不可抵赖签名。
