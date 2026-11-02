"""Generate and verify the scoped InStar P0 sample report from exact source evidence."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'reports/project-discovery/instar-core'
out.mkdir(parents=True, exist_ok=True)
items = [
 ('ARCH-001','architecture','observed','Spec、技术设计和任务上下文由工作流控制器组织，并绑定上下文指纹。','src/workflow-controller/documents.mjs','contextHash:hash','上下文一致性检查不能证明设计语义正确。'),
 ('ARCH-002','architecture','observed','技术设计之后项目指导文档变化，会阻止继续生成任务并要求重审设计。','src/workflow-controller/documents.mjs','Project architecture guidance changed','维护设计与规范版本的一致性。'),
 ('POLICY-001','coding','adopted','项目规则优先于插件参考；插件建议未经采纳不得直接成为阻断条件。','standards/README.md',"The user’s request" ,'该规则来自插件维护文档，约束插件如何使用参考材料。'),
 ('BUILD-001','delivery','adopted','运行环境声明 Node.js >=20.19.0，项目采用 ESM。','package.json','"node":','来自项目包清单；未验证所有环境组合。'),
 ('TEST-001','testing','observed','npm test 顺序执行构建、静态检查和 Node 测试。','package.json','"test":','命令存在不代表执行成功。'),
 ('API-001','api','observed','质量控制器的 Review 输入要求 reviewer、fingerprint 和完整检查清单。','src/quality-controller/index.mjs','Review requires reviewer','这里的接口是本地控制器协议，不是 HTTP API。'),
 ('REVIEW-001','security/runtime','observed','质量门禁拒绝与当前代码快照不一致的 Review。','src/quality-controller/index.mjs',"throw Error('Review is stale')",'指纹可检测过期，不能证明审查独立或结论正确。'),
 ('RISK-001','architecture','proposed','建议使架构适配器执行条件区分未配置 INFO 与实际失败，避免漏执行已配置检查。','src/quality-controller/index.mjs',"checks.every(check=>check.status==='PASS')",'当前条件要求所有前置项均为 PASS；需补专项行为测试再修改。'),
 ('QUALITY-001','testing','observed','强制质量策略要求 full profile 显式覆盖 Q-01 到 Q-07，证据完整性 Q-07 不可豁免。','src/quality-controller/policy.mjs',"Full profile must explicitly cover",'这是控制器校验行为，不表示项目配置已全部满足。'),
 ('RELEASE-001','delivery','observed','发布脚本复制 runtime、skills、standards 等目录，并记录发布来源和内容哈希。','scripts/release.mjs',"const files=",'本次未构建和验证新发布包。'),
]
findings=[]
for ident,domain,status,statement,file,needle,rationale in items:
    if ident == 'POLICY-001':
        needle = "The user's request"
    raw=(root/file).read_bytes()
    lines=raw.decode('utf-8-sig').splitlines()
    n=next(i for i,line in enumerate(lines,1) if needle in line)
    findings.append(dict(id=ident,domain=domain,status=status,statement=statement,
      scope=[file],sources=[dict(path=file,startLine=n,endLine=n,excerpt=lines[n-1],sha256=hashlib.sha256(raw).hexdigest())],
      counterexamples=[],confidence='high',rationale=rationale,
      verification=dict(method='static-source-review',command=None,result='source-matched-not-runtime-verified')))
report=dict(schemaVersion=1,scope=['InStar core engineering baseline (sample)'],
 coverage=dict(read=sorted({x[4] for x in items}),unread=['其他控制器与工具函数未逐文件审查','全部测试和全部语言规范未逐项审查','目标业务项目未采集'],excluded=['node_modules/','runtime/','release/','.git/'],limitations=['局部静态分析样例，不是全项目审计','未进行独立人工规范采纳','报告生成不代表 P0 行为验收通过']),
 domains=[dict(name=n,status=s,reason=r) for n,s,r in [
 ('architecture','partial','已检查上下文与版本约束，未完成依赖图分析'),('api','partial','仅检查本地 Review 协议'),('coding','partial','仅提取显式优先级与运行配置'),('database','unknown','本次未检查是否存在应用持久化 schema 或迁移'),('security/runtime','partial','仅检查快照与质量策略'),('testing/delivery','partial','读取脚本与本次测试日志'),('UI','NA','本次范围为插件控制器，未分析目标应用 UI'),('domain','partial','仅覆盖设计上下文和证据生命周期')]],findings=findings)
(out/'findings.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
text=['# InStar P0 工程基线提取报告（局部实测样例）','','本报告展示 project-discover 的实际输出。范围为插件核心规范、上下文、Review 和交付脚本；不是全仓库提取完成声明，也不代表 P0 已通过验收。','','## 来源与覆盖范围','']
for file in report['coverage']['read']: text.append(f'- `{file}`')
text += ['','排除生成产物与第三方依赖；未读范围和领域覆盖详见同目录 findings.json。未发现反例的条目也不表示已完成全仓库反例搜索。','','## 已明确声明的规则','']
for status,title in [('adopted',None),('observed','观察到的实现事实'),('proposed','建议与风险')]:
 if title: text += ['',f'## {title}','']
 for f in findings:
  if f['status']==status:
   src=f['sources'][0]
   text += [f"### {f['id']}：{f['statement']}",'',f"来源：`{src['path']}:{src['startLine']}`。{f['rationale']}",'']
text += ['## 冲突与未知项','','- 本次没有完成文档与全部实现的冲突核查，不能宣称无冲突。','- 数据库、完整依赖边界、命名惯例、业务状态机及 UI 体系尚无充分证据。','- 不把插件给目标项目提供的数据库/API建议，误写成 InStar 自身存在数据库或 HTTP 服务。','','## 验证结果','','- 本次提取对全部条目核对来源行号、摘录和 SHA-256。','- 前序构建与静态检查通过，静态检查识别 21 个 Skill。','- 前序完整测试日志记录：113 项，46 通过、67 失败；包含权限与质量配置相关错误。未完成失败归因。','- 未执行新发布包、真实模型、浏览器或 GitHub 验收。','','## 后续步骤','','先排查测试失败并完成 P0 行为验证，再进入 P1。P1 的规则注册、采纳和工作流强制引用尚未实现。']
(out/'report.md').write_text('\n'.join(text)+'\n',encoding='utf-8')
saved=json.loads((out/'findings.json').read_text(encoding='utf-8'))
for f in saved['findings']:
 for s in f['sources']:
  raw=(root/s['path']).read_bytes()
  assert hashlib.sha256(raw).hexdigest()==s['sha256']
  assert raw.decode('utf-8-sig').splitlines()[s['startLine']-1]==s['excerpt']
assert (out/'report.md').read_text(encoding='utf-8').startswith('# InStar')
print(f'Validated {len(findings)} findings and both output documents: {out}')
