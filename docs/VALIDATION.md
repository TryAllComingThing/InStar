# 校验记录

## spec-discover 存量源码建档（2026-10-09）

- `npm run release`：构建、21 个 Skill 和资源链接检查通过，69 项测试及发布冒烟测试通过。
- 新增 `test/discovery.test.mjs` 的 11 项测试：无初始化建档、只读预览、模块范围/排除项、源码与基线失效、证据拒绝、显式更新及备份、主规格格式、路径保护、失败回滚、无初始化恢复、后续 MODIFIED 兼容、迁移 CLI（部分场景合并于同一测试）。最后的上下文映射调整后，11 项专项测试再次通过。
- `/usr/bin/python3 .../skill-creator/scripts/quick_validate.py skills/spec-discover`：通过。默认 `python3` 缺少 PyYAML，使用已具备依赖的系统解释器完成校验。
- `npm run check`：最终源码构建后再次通过。
- `node scripts/release.mjs` 与 `npm run test:release`：发布包生成，独立 Spec 建档、初始化及原有 PRD 冒烟通过；新入口在迁移目录中使用内置依赖运行。
- OpenSpec 探索原文件、MIT 许可、快照哈希及适配范围见 [移植记录](../skills/spec-discover/references/ported-method.md)。
- 测试中的规格内容由夹具提供，验证的是程序行为及格式/证据边界；没有宣称已验证真实宿主模型的业务理解或全工程提取完整性。未修改目标应用源码，未安装更新宿主插件缓存。

日期：2026-10-06。

本文是该日期的验证快照，技能数量、测试数量与目录名均记录当时状态；当前结构以源码、`npm run check` 和最新版本地测试手册为准。

## PRD / Spec 多轮人工审阅更新

- 技能路由明确每轮 PRD 修订再次使用 write-a-prd，并宣布本轮使用；Spec 每轮使用 spec-propose + spec-verify。沿用已加载指引不必重复读取，但控制器记录本身不证明选技。
- `npm test`：24 项测试全部通过，包含新增的 PRD/Spec 各连续三轮修订、旧 hash 和旧 context 拒绝、未批准禁止生成下游，以及设计后返回 PRD 重新审批和生成。
- `node scripts/release.mjs` 和 `npm run test:release`：发布包生成及隔离冒烟通过。
- 本轮默认 Node 20.15.0 可完成上述检查，但低于项目声明的 >=20.19.0，不据此降低环境要求。
- skill-creator quick_validate.py 因当前 Python 缺少 PyYAML 未运行成功；项目 npm check 的技能名称、frontmatter 基础检查和资源链接检查通过。
- 新增真实模型测试 A3 多轮 PRD 修订与 A4b 多轮 Spec 修订，尚未执行这套更新后的人工多轮模型验收。自动测试验证控制器边界，不证明模型每轮实际选择技能。
- 本次不修改已存在业务项目的 PRD/Spec/审批记录，也不自动重装用户已安装的插件；使用新发布包更新插件后开展行为验收。

## 此前本地测试补充

- 环境：Node 22.22.0、npm 11.10.1、Codex CLI 0.157.1。
- `npm run release`：22 项测试全部通过；新增 CLI 输入/错误契约和无写入预览测试。
- `npm run test:release`：实际 release 复制到临时目录后，marketplace、十个技能目录、随包 zod、schemas、初始化、中文 PRD 提交审阅均通过。
- 临时 CODEX_HOME 中执行 marketplace add / plugin add / plugin list 成功，installed 和 enabled 均为 true；未更改正式 Codex 配置。
- 新增详细步骤见 [本地测试手册](LOCAL_TESTING.md)。本轮没有重新验证最低 Node 版本、官方技能校验器或真实模型/浏览器闭环；下列 20 项记录为此前验证记录。

## 此前验证记录

- `npm test`：构建成功、十个正式技能及资源引用校验通过、五个公开 API 导出准确，20 个测试全部通过。
- Node 20.19.6 显式执行同一套 20 个测试全部通过，覆盖声明的 Node 运行版本。默认 shell 的 Node 20.15 会产生 engines 警告，使用时请切换版本。
- 官方 skill-creator quick_validate：十个技能全部通过。
- Python tomllib：spec-reviewer、frontend-reviewer 两份只读角色配置可解析。
- Codex CLI 0.157.1：在临时 CODEX_HOME 下注册本地 marketplace、安装 InStar（instar）、列出 installed/enabled 全部成功；不修改用户正式 Codex 配置。
- 可移动运行时：复制到独立临时目录，无源码或开发依赖，初始化、创建 PRD、提交人工审阅成功；四个 Markdown 工件模板齐全（当时的发布目录名为 `schemas/`）。
- 核心测试覆盖完整归档、四个审批边界、合并冲突、场景丢失、任务修改、版本过期、指纹失效、重开、错误回滚、并发锁及中断恢复。

测试中的审批和浏览器证据为控制流夹具，不代表已开发并验证真实前端应用。尚未运行真实模型的自然语言技能选择或 Codex GUI 对话闭环；安装成功和静态校验不能替代这两项行为验收。
