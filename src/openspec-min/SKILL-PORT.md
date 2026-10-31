# 技能移植对照

这次替换的是上一版摘要式技能，不是宣称原文逐字复制。正文以本仓库原版为依据：保留适用规则与示例，替换调用方式，明确记录为固定文档流水线所作的裁剪。原版源文件未修改。

## 来源与落点

| 原版来源（相对 OpenSpec-main） | 移植落点（相对 openspec-min） | 方式 |
|---|---|---|
| `skills/openspec-propose/SKILL.md` | `src/skills/propose/SKILL.md` | 移植请求澄清、上下文约束、依赖重读、工件生成及输出检查流程；按 Spec 评审节点拆分原一键全工件流程 |
| `schemas/spec-driven/schema.yaml` 的 proposal、specs instruction | `src/skills/propose/references/authoring.md` | 从原段落抽取，保留能力划分、行为契约、四种增量、完整 MODIFIED、长度规则、Purpose 和示例 |
| 同文件 design instruction | `src/skills/design/references/authoring.md` | 抽取完整正文，调整可选设计为固定必选、Migration Plan 空场景说明 |
| 同文件 tasks instruction | `src/skills/tasks/references/authoring.md` | 抽取完整正文及两个示例，仅适配当前 API 的严格 checkbox 格式与指纹规则 |
| `skills/openspec-verify-change/SKILL.md` | `src/skills/verify/SKILL.md` | 移植选择、证据处理、报告、优先级和增量操作语义；将检查对象限定为文档 |
| `schemas/spec-driven/templates/*.md` | 各技能的 `assets/*.md` | 使用本包已净化的四份模板副本，使技能目录可以单独携带 |
| `skills/openspec-explore/SKILL.md` | 插件根目录 `skills/spec-explore/SKILL.md` | 保留探索姿态、发现方法、图示、对话示例及捕获授权边界，替换 CLI 集成 |
| 同上完整原版 | 插件根目录 `skills/spec-explore/references/upstream.md` | 逐字保存，仅供来源对照，不作为运行指令 |

原版并不存在独立的 design/tasks SKILL.md。因此这两个技能的入口包装是适配代码，核心写作指令来自原 schema，不能称为复制了不存在的技能文件。

## 逐项保留与裁剪

### propose

- 保留：理解请求；重大歧义先澄清、次要假设记录；项目上下文作为约束而非输出；现状与假设区分；重新读取依赖；按模板填充；创建后核实文件；同名不覆盖；只写规划文档。
- 迁出：源码/测试/配置调查由外部 explore 执行，成果作为生成输入，文档技能不重新扫描代码。
- 替换：CLI root/store/context/status/instructions → 调用方显式 root、生成上下文和五个 API；默认/自定义 DAG → 固定顺序；原全工件循环 → proposal+spec 后门禁和人工评审。
- 删除：多 store、初始化命令、可选 schema、无 Spec 标记、代码执行阶段。
- 工件规则保留：能力命名及完整路径；不要以实现细节代替行为；规范性词与四级场景；500 字符建议及不得为此截断 MODIFIED；完整场景复制；Purpose；Reason/Migration；FROM/TO。
- 适配：原严格验证 CLI 的长度结论改为写作要求，明确当前门禁不检查全部规则；不允许回调直接编辑基线 Purpose。

### design

- 保留所有内容段落：Context、Goals / Non-Goals、Decisions 与替代方案、Risks / Trade-offs、Migration Plan、可延期 Open Questions；不重复 proposal/spec；解释决策理由。
- 原“何时需要设计”的四个条件保留为决定详细程度的依据，不再触发跳过。
- 新入口前置条件：实际人工 Spec 评审；不得用门禁通过代替；使用 API 指纹检查。

### tasks

- 保留全部写作规则和示例：先处理影响交付的 Open Questions；编号分组；小任务；依赖顺序；逐项验收；每组随带测试/文档；最终组仅做跨组集成；归档事项作为非跟踪 follow-up。
- 替换：原宽松 checkbox 识别为当前引擎接受的 `- [ ]`、`- [x]`、`- [X]`；生成时全部未完成。
- 明确：生成技能不执行任务；外部执行只改完成标记，改内容需重新评审/生成。

### verify

| 原验证部分 | 处理 |
|---|---|
| 选择变更，包括无 tasks 的变更 | 保留，改为显式 root 下的目录与会话上下文 |
| status/apply instructions 加载 | 改为读完整文档与调用文档门禁，不加载执行指令 |
| 完整性 / 正确性 / 一致性三维报告 | 保留，证据对象改为文档 |
| Not applicable / Not verified、缺失证据不能算通过 | 保留，并按当前阶段区分设计/任务尚未生成 |
| ADDED/MODIFIED、REMOVED、RENAMED 区分 | 保留文档语义、基线解析及重命名幂等情形 |
| 任务实现完成作为归档前提 | 从 Spec 门禁删除；已有任务只作为文档审查，不证明实现 |
| 实现关键词搜索、实现映射、代码场景覆盖、设计实现一致性、代码风格 | 删除，交由外部执行验证 |
| CRITICAL/WARNING/SUGGESTION、具体路径建议、降低误报、不可声称完全验证 | 保留 |
| Ready for archive 结论 | 改为 Ready for human Spec review，不能暗示人工批准 |

verify 的正文因验证对象改变而做了结构性适配，不是原版实现验证能力的完整保留。保留的是其适用于文档审查的方法和报告纪律。

### explore

原版的 The Stance、Planning a Change、What You Might Do、What You Don't Have To Do、Handling Different Entry Points、Ending Discovery 和探索 guardrails 均保留。CLI/store/动态工件捕获部分改为外部 API 交接。原版全量文本另外逐字保存，因此可核对任何适配。它不进入本包 exports、运行时 prompt 或 npm 文件清单。

## 运行时接入

`src/engine/schema/index.ts` 从技能的完整 authoring 参考和模板加载三个生成指令，不再使用旧摘要。构建将技能资源复制到 `dist/src/skills/`；因此独立部署 dist 时不依赖源码树。生成回调收到工件写作指令，而不是要求再次调用 API 的编排入口，避免持锁期间递归调用。

verify 是调用方执行的文档审查技能，没有假称内置一个模型审查器。其人工/代理检查覆盖范围比 `runSpecVerifyGate` 当前实现更广，报告必须分别呈现二者。

## 安装边界

本次将技能移植到项目交付目录，没有修改用户全局技能目录或自动连接 Superpowers。安装时复制整个技能文件夹（包含 references/assets），按 frontmatter 名称注册，例如 `openspec-min-propose`。外置 explore 单独安装。许可沿用原版 MIT。

## 原版来源指纹

SHA-256 用于确认本次移植依据的原文件版本；不表示适配文件与原文相同。

- `skills/openspec-propose/SKILL.md`: `7848351e7c513a25c32315b466b224ed228ceb43c75b914c145702aa9957ff0b`
- `skills/openspec-verify-change/SKILL.md`: `890fe87bd7cade6490330a2a7a538859d9e1e98b36f8e275f0a99ef1f3a8bd9c`
- `skills/openspec-explore/SKILL.md`: `5bc03c568d0348c61b37f0647167252db5be1775ff5742ca9760b4e03ab9a5ac`
- `schemas/spec-driven/schema.yaml`: `9ce2b94c3d9d7030293ba6964a81d2b2ee4b68b0fb6afd333dcc065134d04bc4`
