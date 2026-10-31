# openspec-min

面向 Superpowers 的文档流水线库。唯一公开入口为 `entry.ts`，只导出五个运行时函数。

## 范围与移植结论

目标清单中的 `src/engine`、`src/store`、`src/diff` 在原仓库并不存在，属于本包重新划分的边界。原版合并来自 `src/core/specs-apply.ts`，不是 CLI，也不是模型生成代码的功能。本包抽取其中 `buildUpdatedSpec`、解析器及相关辅助函数，保留新增、修改、删除、重命名、重复冲突、场景丢失保护和 Purpose 合并规则；删除终端输出和原来的文件写入、能力退役函数。上游原始来源与抽取边界记录在 [`spec-explore` 的 upstream 说明](../../skills/spec-explore/references/upstream.md)。

原版整个归档实现包含交互和复杂存储逻辑，因此本包重新实现单根目录的创建与归档。不能将整个生命周期称作“100% 原版”。空能力退役目前拒绝，不能删除最后一个 requirement 后直接归档。

本目录为独立交付包。原仓库仅作移植对照，未原地删除。包内没有 CLI、终端询问、代码执行器、代码扫描、视图、多存储选择、外置 explore 指令或模型服务依赖。只保留实际使用的 utils，不整体复制原 utils 目录。`artifact-templates/` 保留四份工件 Markdown 模板；固定流水线在 `src/engine/schema/`，验证数据结构位于 `src/engine/artifacts/`。

## 使用

```sh
npm install
npm test
```

```ts
import {
  createSpecChange, runSpecVerifyGate, generateDesignDoc,
  generateTaskList, promoteToBaseline,
} from 'openspec-min';

const ref = { root: '/absolute/path/planning', changeId: 'add-login' };
await createSpecChange({
  ...ref, prd: finalizedPrd,
  generate: async (context) => superpowers.propose(context),
  // 回调返回 { proposal: string, specs: { 'user-auth': deltaMarkdown } }
});
const report = await runSpecVerifyGate(ref);
if (!report.valid) throw new Error(report.issues.join('\n'));
// 在调用方完成真实的人工 Spec 评审后：
await generateDesignDoc({ ...ref, specReviewed: true,
  generate: async (context) => superpowers.design(context) });
await generateTaskList({ ...ref,
  generate: async (context) => superpowers.tasks(context) });
// Superpowers 实施、测试与评审；将 tasks.md 完成标记改成 [x]。
// 在调用方完成真实的人工验收后：
await promoteToBaseline({ ...ref, accepted: true });
```

上面的 `superpowers` 是调用方适配器示意，不是本包内置 SDK 或已建立的服务连接。回调接收净化指令、全部基线及当前工件；返回文档，不产生业务源码。PRD、模型凭据和模型调用均由外部系统管理。四个可安装技能位于 `src/skills/*/SKILL.md`，完整写作指令及示例位于各自的 `references/authoring.md`，模板位于 `assets/`。安装需携带整个技能目录。生成回调的 instruction 直接加载这些完整写作规则和模板。探索 Skill 由插件根目录的 `skills/spec-explore/` 提供；上游原文及许可保存在该技能目录，适配后的工作流位于 `SKILL-PORT.md`。来源、保留项和裁剪项见 [技能移植对照](SKILL-PORT.md)。

所有 API 返回 Promise。`root` 是唯一规划目录，运行时布局：

```text
planning/
  specs/<capability>/spec.md
  changes/<change-id>/proposal.md
  changes/<change-id>/specs/<capability>/spec.md
  changes/<change-id>/technical-design.md
  changes/<change-id>/tasks.md
  archive/<change-id>/...全部变更文件
```

Spec 门禁返回 `{valid, issues}`；其他 API 遇到阻断抛错。创建允许写入尚未合格的草稿，后续设计和归档必须通过门禁。ID 使用 kebab-case，能力允许 `/` 分层。

## 一致性与限制

- 人工评审后记录 proposal、specs、baseline、technical-design 指纹；后续变动阻断任务生成或归档。旧变更仅有 `design.md` 时仍可读取；新生成统一写 `technical-design.md`。`specReviewed` 和 `accepted` 是调用方的明确声明，不是身份认证或评审系统。
- tasks 内容记录指纹，执行方只修改完成标记。变更任务内容或设计需要重新走评审流程；当前生成 API 不覆盖已有工件，需要调用方先备份并移走要重建的工件及其 `.review.json`、`.tasks.json` 记录。
- 同一根目录的 API 调用由排他锁串行化，包括生成回调。回调不要递归调用本包 API。已有变更与归档不覆盖；符号链接拒绝。
- 合并先完整预检，再写入基线并移动变更包。普通异常尝试恢复原有文件内容。不是跨文件系统的原子事务：进程被强制终止、断电、外部编辑器同时写入可能留下中间状态。进程异常退出留下 `.lock` 时，先核对基线与归档，再人工恢复锁和文件。重要规划目录应由调用方备份或版本管理。
- 门禁检查结构和合并兼容性，不判断业务完整性、设计优劣、任务验收证据真实性；需要人工评审。当前一次报告首个阻断问题。
- 不支持多存储、能力退役、无 Spec 的变更和自定义 DAG；这些是明确裁剪的范围。

原源码按 MIT 许可移植，保留 LICENSE。本实现尚未接入真实 Superpowers 模型服务，测试通过注入回调验证调用契约。
