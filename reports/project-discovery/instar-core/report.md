# InStar P0 工程基线提取报告（局部实测样例）

本报告展示 project-discover 的实际输出。范围为插件核心规范、上下文、Review 和交付脚本；不是全仓库提取完成声明，也不代表 P0 已通过验收。

## 来源与覆盖范围

- `package.json`
- `scripts/release.mjs`
- `src/quality-controller/index.mjs`
- `src/quality-controller/policy.mjs`
- `src/workflow-controller/documents.mjs`
- `standards/README.md`

排除生成产物与第三方依赖；未读范围和领域覆盖详见同目录 findings.json。未发现反例的条目也不表示已完成全仓库反例搜索。

## 已明确声明的规则

### POLICY-001：项目规则优先于插件参考；插件建议未经采纳不得直接成为阻断条件。

来源：`standards/README.md:19`。该规则来自插件维护文档，约束插件如何使用参考材料。

### BUILD-001：运行环境声明 Node.js >=20.19.0，项目采用 ESM。

来源：`package.json:10`。来自项目包清单；未验证所有环境组合。


## 观察到的实现事实

### ARCH-001：Spec、技术设计和任务上下文由工作流控制器组织，并绑定上下文指纹。

来源：`src/workflow-controller/documents.mjs:47`。上下文一致性检查不能证明设计语义正确。

### ARCH-002：技术设计之后项目指导文档变化，会阻止继续生成任务并要求重审设计。

来源：`src/workflow-controller/documents.mjs:42`。维护设计与规范版本的一致性。

### TEST-001：npm test 顺序执行构建、静态检查和 Node 测试。

来源：`package.json:16`。命令存在不代表执行成功。

### API-001：质量控制器的 Review 输入要求 reviewer、fingerprint 和完整检查清单。

来源：`src/quality-controller/index.mjs:404`。这里的接口是本地控制器协议，不是 HTTP API。

### REVIEW-001：质量门禁拒绝与当前代码快照不一致的 Review。

来源：`src/quality-controller/index.mjs:438`。指纹可检测过期，不能证明审查独立或结论正确。

### QUALITY-001：强制质量策略要求 full profile 显式覆盖 Q-01 到 Q-07，证据完整性 Q-07 不可豁免。

来源：`src/quality-controller/policy.mjs:9`。这是控制器校验行为，不表示项目配置已全部满足。

### RELEASE-001：发布脚本复制 runtime、skills、standards 等目录，并记录发布来源和内容哈希。

来源：`scripts/release.mjs:11`。本次未构建和验证新发布包。


## 建议与风险

### RISK-001：建议使架构适配器执行条件区分未配置 INFO 与实际失败，避免漏执行已配置检查。

来源：`src/quality-controller/index.mjs:445`。当前条件要求所有前置项均为 PASS；需补专项行为测试再修改。

## 冲突与未知项

- 本次没有完成文档与全部实现的冲突核查，不能宣称无冲突。
- 数据库、完整依赖边界、命名惯例、业务状态机及 UI 体系尚无充分证据。
- 不把插件给目标项目提供的数据库/API建议，误写成 InStar 自身存在数据库或 HTTP 服务。

## 验证结果

- 本次提取对全部条目核对来源行号、摘录和 SHA-256。
- 前序构建与静态检查通过，静态检查识别 21 个 Skill。
- 前序完整测试日志记录：113 项，46 通过、67 失败；包含权限与质量配置相关错误。未完成失败归因。
- 未执行新发布包、真实模型、浏览器或 GitHub 验收。

## 后续步骤

先排查测试失败并完成 P0 行为验证，再进入 P1。P1 的规则注册、采纳和工作流强制引用尚未实现。
