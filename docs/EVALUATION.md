# InStar 评测与验收说明

本文说明 InStar 的**语义质量评测 Rubric**、报告格式、评分规则，以及确定性验收和人工验收之间的边界。质量门禁协议见 [质量协议](QUALITY.md)，工作流使用方式见 [使用说明书](PLUGIN-GUIDE.md)，插件自身测试见 [开发测试手册](LOCAL_TESTING.md)。

## 1. 三类判断不要混用

| 判断 | 谁执行 | 证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 确定性工件检查 | 控制器、`scripts/check.mjs`、测试 | 文件结构、哈希、状态、链接、Rubric 覆盖和引文字面存在 | 内容是否真正解决了业务问题 |
| 语义质量评测 | `quality-evaluation` Skill + 宿主模型 | 按 Rubric 给出带原文证据的质量信号 | 评测者身份、独立性、判断正确性 |
| 人工验收 | 产品、架构、安全或业务负责人 | 对当前工件版本作出真实决策 | 不能替代自动化回归或 CI |

`evaluate-quality` 不改变工作流版本，也不自行批准阶段。它生成绑定当前工件指纹的质量报告；当前报告的 `BLOCK` 会阻断 `submit-prd`、`submit-spec`、`write-tasks`、`submit-implementation` 和 `approve`。报告缺失或过期会标记为 `missing`/`stale`，不能被当作 PASS 证据。人工审批仍必须使用当前 `reviewHash`、一次性 `intentId` 和 `challenge` 完成。

## 2. Rubric 契约

### 2.1 四个阶段、二十个检查项

控制器只接受以下四个阶段，每个阶段必须且只能覆盖五项：

| 阶段 | Rubric ID |
| --- | --- |
| PRD | `problem-outcome`、`scope-boundaries`、`user-journey-states`、`measurable-acceptance`、`risks-dependencies` |
| Spec | `prd-traceability`、`normative-requirements`、`behavior-scenarios`、`baseline-delta`、`architecture-impact` |
| Design | `constraints-and-sources`、`decisions-and-tradeoffs`、`architecture-and-dataflow`、`interfaces-and-state`、`file-plan-and-risks` |
| Tasks | `spec-design-traceability`、`dependency-order`、`task-sized-delivery`、`task-acceptance-evidence`、`verification-coverage` |

Rubric 的**结构**由控制器校验；每一项的**语义判定**由评测者和人工复核负责。本文定义判定语义，不能替代模型阅读工件和项目上下文。

### 2.2 状态

| 状态 | 含义 | 证据要求 |
| --- | --- | --- |
| `PASS` | 检查项满足，且没有需要披露的实质缺口 | 至少一条原文摘录 |
| `WARN` | 基本可用，但存在范围、边界、风险或可验证性缺口 | 至少一条原文摘录 |
| `BLOCK` | 存在实质缺陷，建议修复后再进入人工评审 | 至少一条原文摘录 |
| `NA` | 该检查项不适用于当前变更 | 必须说明原因；证据可为空 |

报告状态优先级：

```text
任一 BLOCK → BLOCK
否则任一 WARN 或 NA → WARN
否则 → PASS
```

任何 `BLOCK` 都应先修复并重新评测。`WARN` 和 `NA` 应在人工评审时明确展示，不能静默忽略。

### 2.3 证据规则

1. `PASS`、`WARN`、`BLOCK` 都必须引用**当前工件中的精确原文摘录**。
2. 证据按字面子串匹配，大小写和空白需与工件一致。
3. 不要求摘录很长，但必须足以定位判断依据；报告中的 `reason` 不能代替证据。
4. `NA` 不要求引用工件，但必须给出具体原因。
5. 工件修改后，旧指纹和旧报告失效，必须重新读取并评测。

不同阶段的工件范围：

| 阶段 | 控制器读取的内容 |
| --- | --- |
| `prd` | `state.prdPath` 指向的 PRD |
| `spec` | `proposal.md` 加上 `specs/` 下排序后的全部能力 Spec，包括嵌套能力目录 |
| `design` | `technical-design.md`；旧项目可用 `design.md` |
| `tasks` | `tasks.md` |

因此 Spec 证据可以来自 proposal 或任一能力 Spec，但必须是拼接后工件的精确子串。

## 3. Rubric 判定指南

以下是文档层面的判定语义。实际评测应结合项目 `AGENTS.md`、架构/设计文档、`standards/`、Design Token 和已批准 PRD。

项目 `standards/index.json` 中命中当前路径的 `mandatory`/`always` 规则属于硬约束，不是可选评分项。设计评测应先检查 `Compliance Matrix` 是否逐条引用；Review 评测应检查 `standardsReferences` 是否覆盖同一组规则。评测器仍不能替代控制器的确定性校验：`write-design` 和 `quality-gate` 会再次计算适用规则并阻断缺项。

### 3.1 PRD

| ID | 检查问题 | PASS 的最低要求 | 常见 WARN / BLOCK |
| --- | --- | --- | --- |
| `problem-outcome` | 是否说明真实问题、受影响用户和期望结果？ | 问题、用户和可观察结果明确，不只是功能罗列 | 只有功能列表 → WARN；没有问题与目标 → BLOCK |
| `scope-boundaries` | 是否说明范围内外、非目标和受影响系统？ | 明确的非目标/排除项和系统边界 | 边界含糊或无限扩张 → WARN；范围冲突 → BLOCK |
| `user-journey-states` | 是否覆盖正常、空、加载、错误、权限、取消等关键状态？ | 至少覆盖主要旅程和重要异常/状态 | 只写成功路径 → WARN；关键安全/失败状态缺失 → BLOCK |
| `measurable-acceptance` | 验收是否可观察、可测量、可复现？ | 有阈值、输入输出或明确行为断言 | “正常工作”等不可验证表述 → WARN；无可验收结果 → BLOCK |
| `risks-dependencies` | 是否披露风险、假设、外部依赖、迁移或回滚？ | 关键风险与依赖有负责人/缓解方向 | 风险笼统 → WARN；高风险迁移无任何应对 → BLOCK |

### 3.2 Spec

| ID | 检查问题 | PASS 的最低要求 | 常见 WARN / BLOCK |
| --- | --- | --- | --- |
| `prd-traceability` | 需求是否可追溯到已批准 PRD，且没有越界新增？ | 每项需求能对应 PRD 目标或明确范围 | 部分需求来源不清 → WARN；引入未批准业务范围 → BLOCK |
| `normative-requirements` | 需求是否规范、原子、无歧义？ | 使用 `SHALL`/`MUST` 等规范语气，一项需求表达一个行为 | 语气含糊或多行为混杂 → WARN；不可测试的表述 → BLOCK |
| `behavior-scenarios` | 是否用场景描述正常、边界和错误行为？ | 至少覆盖主要 `WHEN/THEN` 行为和关键边界 | 只覆盖成功路径 → WARN；场景与需求矛盾 → BLOCK |
| `baseline-delta` | `ADDED/MODIFIED/REMOVED/RENAMED` 是否与基线一致，是否保留既有行为？ | 变更类型、理由、迁移和基线影响一致 | 遗漏迁移说明 → WARN；静默删除/改名或场景丢失 → BLOCK |
| `architecture-impact` | 是否说明 API、数据、安全、兼容性、性能和发布影响？ | 受影响模块、接口/数据变化和兼容策略明确 | 影响面不完整 → WARN；跨栈破坏性变更无方案 → BLOCK |

### 3.3 Design

| ID | 检查问题 | PASS 的最低要求 | 常见 WARN / BLOCK |
| --- | --- | --- | --- |
| `constraints-and-sources` | 是否引用并遵守项目指引、架构、规范、Token 等约束？ | 关键约束有来源，冲突被指出 | 来源不全 → WARN；违反项目明确规则 → BLOCK |
| `decisions-and-tradeoffs` | 是否比较方案并说明选择理由和后果？ | 至少一个真实备选方案、选择依据和代价 | 只列结论 → WARN；关键决策没有依据 → BLOCK |
| `architecture-and-dataflow` | 组件、调用链、数据流、状态和失败路径是否清楚？ | 能据此实现，包含失败/回退路径 | 细节不足 → WARN；数据流或边界自相矛盾 → BLOCK |
| `interfaces-and-state` | API、数据模型、授权、错误、幂等、兼容和状态转换是否定义？ | 接口契约与状态变化可实现、可验证 | 边界条件欠缺 → WARN；授权/迁移/破坏性接口无定义 → BLOCK |
| `file-plan-and-risks` | 文件级改动、验证策略、风险和回滚是否具体？ | 文件计划、测试/验证、迁移和回滚可执行 | 计划粗粒度 → WARN；无验证或高风险无回滚 → BLOCK |

### 3.4 Tasks

| ID | 检查问题 | PASS 的最低要求 | 常见 WARN / BLOCK |
| --- | --- | --- | --- |
| `spec-design-traceability` | 任务是否映射到 Spec 需求和设计决策？ | 每个任务能定位到需求/设计依据 | 少量映射缺失 → WARN；任务与设计冲突 → BLOCK |
| `dependency-order` | 任务顺序、依赖和可并行项是否清楚？ | 依赖关系和执行顺序明确 | 顺序可推断但未写明 → WARN；存在循环或错误前置 → BLOCK |
| `task-sized-delivery` | 任务是否可独立交付、独立验证？ | 单项任务边界清晰，可增量验收 | 粒度偏大 → WARN；一个任务同时跨多个不可验证目标 → BLOCK |
| `task-acceptance-evidence` | 每项任务是否有验收条件和完成证据？ | 编号任务含 acceptance，并能说明证据形式 | 部分任务缺验收 → WARN；全部任务只写“完成” → BLOCK |
| `verification-coverage` | 是否覆盖测试、静态检查、构建、安全、浏览器/E2E、CI 等适用验证？ | 适用层次和负向用例明确，不适用项有理由 | 覆盖不完整 → WARN；关键高风险路径完全未验证 → BLOCK |

## 4. 报告格式与评分

### 4.1 调用

```json
{
  "action": "evaluate-quality",
  "project": "/absolute/project",
  "changeId": "add-order-filter",
  "expectedVersion": 4,
  "stage": "prd",
  "evaluator": "quality-evaluation fixture",
  "criteria": [
    {
      "id": "problem-outcome",
      "status": "PASS",
      "reason": "PRD 说明了订单审核员需要在大量订单中定位特定状态的问题。",
      "evidence": ["<当前 PRD 中的精确原文>"]
    }
  ]
}
```

实际调用必须提供全部五项，不能只交一个示例项。示例中的 `<当前 PRD 中的精确原文>` 不是有效证据，需要替换为当前工件的真实摘录。

```sh
node <plugin>/runtime/workflow-controller/cli.mjs /tmp/evaluation.json
```

`expectedVersion` 必须等于最新 `state` 的版本。工件编辑后重新读取状态并重新评测。

### 4.2 报告字段

控制器写入：

```text
reports/semantic-quality/<changeId>/<stage>.json
```

报告结构：

| 字段 | 说明 |
| --- | --- |
| `schemaVersion` | 当前为 `1` |
| `changeId` | 变更标识 |
| `stage` | `prd`、`spec`、`design` 或 `tasks` |
| `evaluator` | 调用方提供的评测者标签；不是身份证明 |
| `artifact` | 被评测工件的逻辑路径 |
| `fingerprint` | 工件拼接内容的 SHA-256 |
| `score` | 适用检查项的加权得分，0–100 或 `null` |
| `criteria` | 每项的 `id`、`status`、`reason`、`evidence` |
| `status` | `PASS`、`WARN` 或 `BLOCK` |
| `at` | 生成时间 |
| `limitations` | 语义判断不被独立证明的说明 |

控制器还会向 `.workflow/traces.jsonl` 追加 `quality-evaluation` 轨迹。

### 4.3 评分

- `PASS` 计 1。
- `WARN` 计 0.5。
- `BLOCK` 计 0。
- `NA` 从分母中排除。
- 得分 = 适用项加权和 / 适用项数量 × 100，四舍五入。
- 全部为 `NA` 时 `score` 为 `null`。

得分只是 Rubric 覆盖程度的摘要，不是产品成熟度、代码质量或上线风险评分。一个 100 分报告仍可能遗漏未写入 Rubric 的业务风险。

## 5. 推荐执行流程

### 5.1 由 Skill 执行

在受控工作流中：

1. 读取最新 `state`。
2. 读取当前阶段工件、已批准 PRD、项目指引和相关上下文。
3. 按阶段 Rubric 逐项判断，不能用同一段证据机械填充所有项。
4. 为每个非 `NA` 项复制精确原文。
5. 调用 `evaluate-quality`。
6. 若出现 `BLOCK`，修订工件并重新评测；若只有 `WARN`/`NA`，在人工评审时披露。
7. 展示工件、报告路径、状态、得分和指纹。
8. 评测完成后仍按正常流程提交人工审批。

`quality-evaluation` Skill 的职责是执行上述流程，不是代替 `requirements-workflow` 的审批循环。

### 5.2 评测与审批的关系

```text
PRD 草稿 → 语义评测 → 人工 PRD 审批
Spec 草稿 → 确定性 Spec 门禁 → 语义评测 → 人工 Spec 审批
设计/任务草稿 → 语义评测 → 人工实施计划审批
实现完成 → 质量门禁/工程验证 → 人工验收
```

语义评测报告不进入 `approvalHash` 的计算，但当前工件指纹对应的 `BLOCK` 是工作流门禁，会阻断 `submit-prd`、`submit-spec`、`write-tasks`、`submit-implementation` 和 `approve`。`WARN`/`NA` 会保留为显式信号；缺失或过期报告显示为 `missing`/`stale`，不得冒充 PASS。

## 6. 与质量门禁的区别

| 维度 | `quality-evaluation` | `quality-gate` |
| --- | --- | --- |
| 对象 | PRD、Spec、设计、任务文档 | 当前代码快照和 Review |
| 判断 | Rubric 语义信号 | 验证报告、Review 结构、证据位置、风险策略 |
| 证据 | 工件原文摘录 | 源码/测试/配置/CI 位置与摘录 |
| 是否改变工作流 | 否 | 通过 `submit-quality-review` 绑定到验证阶段 |
| 是否人工审批 | 否 | 否；最终仍需人工验收 |
| 是否证明真实执行 | 否 | 否；命令和 Review 的真实性由执行环境和人工流程负责 |

两者可以同时使用：先用语义评测改善文档质量，再用质量门禁绑定代码证据，最后由人工验收。

## 7. 模型验收夹具

仓库提供两个辅助脚本，用于人工组织模型级验收。它们不在 `npm test` 中自动运行，结果写入被忽略的 `reports/`。

### 7.1 准备夹具

```sh
node scripts/prepare-model-acceptance.mjs
```

脚本在 `reports/model-acceptance/next-batch/` 下创建三个合成项目：

| 项目 | 目的 |
| --- | --- |
| `reuse-core` | 复用治理、内部边界、重复实现和共享能力建议 |
| `baseline` | 六类工程基线、证据摘录和契约冲突 |
| `incremental` | 能力索引增量更新、旧入口处理、无关能力和人工说明保留 |

脚本使用 `writeFile(..., {flag: 'wx'})`，目标已存在时会失败，避免覆盖上一轮结果。需要重跑时，先确认旧结果不再需要，再在受控环境中清理该生成目录；不要把清理命令写成无条件破坏性脚本。

### 7.2 执行与校验

由真实代理或维护者按各项目 `TASK.md` 完成任务后执行：

```sh
node scripts/verify-model-acceptance.mjs
```

脚本检查：

- 原始夹具源文件哈希未被修改。
- 禁用治理时能力索引仍有效且哈希新鲜。
- 无关能力 `CAP-DATE` 被保留。
- 六类基线文档可读，证据摘录能在指定源码行范围内精确找到。
- 既有夹具测试仍通过。
- `baseline` 的公开入口能复现契约冲突。
- 工件哈希和 Skill 快照被记录。

输出为 `reports/model-acceptance/next-batch/verification.json`。该文件是确定性工件校验结果，不是语义评审结论，也不是人工产品验收。

### 7.3 必须人工检查的内容

脚本不会判断：

- 模型是否选择了正确 Skill。
- 复用建议是否合理，是否错误地建议合并不同语义的 `formatAmount`。
- 是否正确拒绝直接访问 `network/internal`。
- 基线未知项是否诚实，建议是否可执行。
- 增量更新是否保留了人工说明和无关能力。
- 语义评测报告是否逐项有依据。

这些内容需要维护者阅读模型产出和报告，并在验收记录中写明判断依据。

## 8. 评测不能证明什么

1. **不能证明模型身份或版本**：`evaluator` 是标签，不是认证。
2. **不能证明独立评审**：同一模型可以生成并评测自己的工件。
3. **不能证明引文代表完整语义**：控制器只检查摘录存在，不检查它是否支持结论。
4. **不能证明 Rubric 外风险已被覆盖**：业务、安全、合规和架构判断仍需人工。
5. **不能证明命令、浏览器或外部扫描器真实执行**：这些必须由质量门禁、日志、CI 和人工验收补充。
6. **不能让旧报告继续有效**：工件改动后指纹变化，必须重新评测。

## 9. 变更验收清单

对一个受控变更，建议至少保留以下证据：

- [ ] PRD 的语义评测报告，且人工审批绑定了当前哈希。
- [ ] Spec 通过确定性门禁，并有当前语义评测报告。
- [ ] 技术设计和任务有当前语义评测报告，且实施计划已人工批准。
- [ ] 每项任务有完成证据，所有任务已完成。
- [ ] 当前代码快照通过项目配置的验证命令。
- [ ] `quality-gate` 报告稳定，Review 证据与快照匹配，适用的强制项目规范已逐条引用。
- [ ] 适用的失败、未验证和高风险项已披露，并有人工结论。
- [ ] 验收针对当前验证快照，源码未在验收后变化。
- [ ] 归档后检查 proposal、全部 delta specs、技术设计、任务和 `workflow.json` 完整。

相关文档：[架构书](plugin-arch.md)、[使用说明书](PLUGIN-GUIDE.md)、[质量协议](QUALITY.md)、[开发测试手册](LOCAL_TESTING.md)。
