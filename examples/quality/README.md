# InStar 项目接入模板

将适合项目技术栈的示例复制到目标项目根目录并重命名为 `.instar-quality.json`，再按项目实际情况修改命令和检查范围：

- `.instar-quality.schema3.example.json`：TypeScript/Vue 或 npm 项目。
- `.instar-quality.schema3.backend.example.json`：Python 后端或跨栈项目；可将命令替换为项目实际工具。
- `.instar-quality.schema3.local.example.json`：不依赖 CI/GitHub 的本地优先项目。

## 接入步骤

1. 确认 `baseRef` 与项目默认基线一致。
2. 为所选模板提供配置中声明的本地命令；npm 项目可在 `package.json` 中提供对应脚本，Python/其他语言项目应替换为实际可执行工具。不适用的检查应替换为真实命令，而不是保留空脚本。
3. 确认 `commit` profile 只用于开发过程，Pull Request 使用 `full` profile。
4. 按项目风险配置 API、数据库、权限、E2E、迁移和视觉回归检查。
5. CI/GitHub 是可选项：没有远端基础设施时，先使用本地 `full` profile、结构化 Review、人工审批和 `pre-pr-check`；接入 CI 后再配置 `ci` 和真实 required check 名称，并在 CI 中重新执行 full profile。
6. 对 L2/L3 变更执行：

   ```sh
   node <plugin>/bin/instar.mjs verify --profile full --risk L2
   node <plugin>/bin/instar.mjs review --review-file ./review.json --risk L2
   ```

可复制的 Review 和 provenance 输入见 `review.vue.l2.example.json` 与 `ai-provenance.example.json`。先运行 `snapshot`，将输出的 fingerprint 替换示例中的占位符，并按实际路径、行号和源码摘录修改每项证据；示例不能直接作为真实项目的通过证明。

`ai-provenance` 当前通过 JSON CLI 执行：

```sh
node <plugin>/runtime/quality-controller/cli.mjs examples/quality/ai-provenance.example.json
```

发布闭环为 `ci prepare` → 人工确认并执行 `ci publish --confirm` → `ci status`。`ci publish/status` 仍依赖本地 full verify、最新 Review、provenance、干净工作区和真实远端分支保护；配置文件中的 required check 名称不能替代服务端保护规则。

## 质量策略映射

模板中的 Q-01 至 Q-07 是示例映射，不代表所有项目的完整风险覆盖：

- `Q-01`：代码或静态检查。
- `Q-02`：类型或接口检查。
- `Q-03`：测试。
- `Q-04`：构建或制品检查。
- `Q-05`：依赖检查。
- `Q-06`：安全检查。
- `Q-07`：验证报告完整性，由 InStar 自动生成。

项目负责人必须确认每个检查实际覆盖的风险。命令退出成功只证明该命令成功，不证明检查范围充分。

## 风险等级

- `L0`：文档或非行为性变更。
- `L1`：局部低风险代码变更。
- `L2`：跨模块、公开 API、权限或重要用户流程。
- `L3`：支付、认证、敏感数据、数据库迁移、并发或基础设施。

L2/L3 必须使用 `full` profile；L2/L3 Review 还必须提供带路径、`line` 或 `startLine`/`endLine`、代码摘录和当前快照指纹的结构化证据。摘录必须匹配声明的行范围；`not-verified` 只能是 WARN/BLOCK，`not-applicable` 只能是 NA。AI Review 不能替代人工评审、CI 或分支保护。

控制器会对 `.github/workflows/`、认证/授权、迁移、支付、基础设施等内置敏感路径自动提升风险；项目可通过 `riskPolicy.rules` 增加路径规则。L3 必须配置 `riskPolicy.l3.requiredReviewRoles`；`requiredChecks`、`ci` 和 `requireHumanApproval` 按项目能力选择。没有 CI 时只能声明本地完成，不能声称远端检查或分支保护已生效。

## CI 配置（可选）

没有 CI/GitHub 时可以完全删除模板中的 `ci` 块，并保留本地验证流程。项目接入 `ci` 前必须自行确认：

- `ci.host`、`ci.repo`、`ci.remote` 和 `ci.base`。
- `ci.allowedHosts` 只包含允许的代码托管域名。
- `ci.requiredChecks` 与远端实际 check 名称完全一致。
- `ci.secretCheck` 包含在 required checks 中。
- 分支保护、CODEOWNERS 和发布审批由代码托管平台执行。
