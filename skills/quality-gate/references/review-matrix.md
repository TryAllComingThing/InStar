## 允许工具与流程

允许本地文件读取、Git 只读命令和质量 CLI；AI Review 由当前已授权的 Codex 会话完成。禁止在本地 Hook 中额外联网调用模型。先检查架构、命名、类型、组件边界、设计一致性，再逐项检查：

| ID | 必查内容及适用性 |
| --- | --- |
| correctness | 需求/Spec、边界条件、状态与错误路径是否正确；列出可复查证据 |
| maintainability | 命名、复杂度、重复、可测试性和项目惯例；避免固定行数等僵硬门槛 |
| architecture | 模块职责、接口、依赖方向及既有架构约束 |
| security | 安全边界及相应控制；无安全相关变更标 NA 并说明理由 |
| performance | 有热路径/数据量/渲染/查询影响时检查风险；否则标 NA 并说明理由 |
| naming | 命名是否清楚并符合项目领域词汇和既有约定 |
| types | 公共边界类型及不可信数据的运行时验证是否充分 |
| component-boundaries | UI 组件或服务模块职责、接口、状态所有权和副作用边界是否清晰；按代码类型选择检查对象 |
| design | UI 变更是否符合项目设计说明和已确认的视觉约束；纯后端标 NA 并说明 |
| watch-cleanup | watch/watchEffect 创建异步任务、事件或副作用时是否 onCleanup；纯观察且无资源可标 NA |
| v-for-key | key 是否唯一、稳定；避免可重排列表使用索引 |
| reactive-destructure | 响应式解构是否保留响应性；toRefs/toRef 或已确认 Vue 版本支持的编译器 props 解构均可，不机械强制 toRefs |
| props | Props 类型是否明确；可选值是否需要默认值；必填 Prop 不强制多余默认值 |
| computed-purity | computed 是否存在写状态、请求等副作用 |
| unmount-cleanup | 定时器、事件和资源是否随组件卸载释放 |
| async-component | 大型非首屏组件是否适合 defineAsyncComponent；首屏关键组件可说明不适用 |
| lazy-route | 路由组件是否合理使用动态 import() |

每项 PASS/BLOCK/WARN/INFO/NA 均提供文件、行号或可复查证据；L2/L3 的 evidence 还必须包含证据类型、相对路径、单行 `line` 或 `startLine`/`endLine` 范围、当前源码摘录、说明和 `snapshotFingerprint`，控制器会校验摘录确实位于声明行范围。`not-verified` 只能配合 WARN/BLOCK，`not-applicable` 只能配合 NA，不能用 PASS 替代验证或适用性判断。NA 必须解释适用性。UI 或 Vue 专项项只在对应技术栈/变更存在时评估，否则标 NA 并解释；后端变更应将安全、API、数据库迁移、并发和可观测性作为适用风险检查。

L3 变更还必须满足项目 `riskPolicy.l3` 的人工 Reviewer 角色要求；`review.approvals` 中的每个批准项必须包含角色、外部身份标识、身份提供方、批准 ID 和 `approved` 状态。CI/GitHub 是可选的：没有远端基础设施时仍可完成本地 full verify、Review 和人工审批，但必须披露远端未接入；接入后才由 CI、分支保护和 CODEOWNERS 提供远端门禁。控制器只校验元数据格式和完整性，不伪造或替代外部身份认证。

纯后端改动时，下列 Vue 专项使用 `NA`，并在 evidence 写明“本次变更不包含 Vue/UI 文件，依据变更路径与仓库技术栈判定不适用”：`watch-cleanup`、`v-for-key`、`reactive-destructure`、`props`、`computed-purity`、`unmount-cleanup`、`async-component`、`lazy-route`。`component-boundaries` 仍需检查服务/模块边界；`design` 可 NA。若任务同时改 UI，则不能套用该 NA 说明，需审查对应的前端项。跨栈项目应配置 `review.language` / `review.framework` 数组，让清单同时包含 Vue 与后端专项项，不能只审一侧。
