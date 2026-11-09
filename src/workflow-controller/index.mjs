import {fs,safe,identifier,now,requireText,projectRoot,exists,read,json,atomic,putJson,lock,transaction,restore,recoverPending,hash,appendTrace,changeTraces,gcTransactions,pluginRoot,sourceSnapshot} from './files.mjs';
import {readBufferVerified} from '../shared/path-safety.mjs';
import {initialize} from './initialize.mjs';
import {changeDir,prd,specBundle,approvalHash,assertApprovals,generationContext,compatibilityWarnings,taskItems,report} from './documents.mjs';
import * as engine from '../openspec-min/entry.js';
import {evaluate} from './evaluation.mjs';
import {collectVerificationEvidence,assertQualityGateEvidence,assertEvidenceIntegrity,evidencePolicyFor} from './evidence.mjs';
import {renderWorkflow} from './visualize.mjs';
import {redactData,boundedText} from '../shared/redaction.mjs';
import {normalizeUsage,readCodexSessionUsage} from '../shared/usage-telemetry.mjs';
import {requiredWorkflowKinds} from '../shared/profile-contract.mjs';
import {resolveDesignCheckSources} from '../shared/design-sources.mjs';
export {initialize};
const statePath=id=>`planning/workflows/${identifier(id)}.json`;
const requireStage=(s,...stages)=>{if(!stages.includes(s.stage)||s.status==='completed'||s.pendingApproval)throw Error(`Action unavailable in ${s.stage}/${s.status}`);};
async function pending(root,s,kind){await assertUsageBudget(root,s.changeId);s.status='awaiting-approval';s.pendingApproval=kind;s.pendingReview={kind,hash:await approvalHash(root,s,kind)};}
function clearPending(s){s.pendingApproval=null;s.pendingReview=null;s.status='in-progress';}
function packageInput(input){requireText(input.proposal,'proposal');if(!input.specs||typeof input.specs!=='object'||Array.isArray(input.specs)||!Object.keys(input.specs).length)throw Error('specs must be a nonempty mapping');for(const [id,doc] of Object.entries(input.specs)){identifier(id,true);requireText(doc,'spec');}return {proposal:input.proposal,specs:input.specs};}
async function completed(root,s){const items=taskItems(await read(changeDir(root,s.changeId),'tasks.md'));if(items.some(t=>!t.done||!s.taskEvidence[t.id]))throw Error('All tasks need completion evidence');}
async function gate(ref){const result=await engine.runSpecVerifyGate(ref);if(!result.valid)throw Error(result.issues.join('\n'));return result;}
const reviewRoles=new Set(['architect','code-reviewer','security-reviewer','ui-reviewer','frontend-reviewer','spec-reviewer']);
const stageNames=new Set(['prd','spec','design','tasks','implementation','verification','acceptance']);
const strictSchemaVersion=5;
const designConstraintCoverage=['hierarchy','layout','states','tokens','responsive','accessibility'];
function normalizeDesignCoverage(value){
 if(!Array.isArray(value)||!value.length)throw Error(`UI designCheck.coverage must list: ${designConstraintCoverage.join(', ')}`);
 if(value.some(item=>typeof item!=='string'))throw Error('designCheck.coverage entries must be strings');
 const unique=[...new Set(value)];
 if(unique.length!==value.length)throw Error('designCheck.coverage must not contain duplicates');
 const unknown=unique.filter(item=>!designConstraintCoverage.includes(item));
 if(unknown.length)throw Error(`designCheck.coverage contains unknown entries: ${unknown.join(', ')}`);
 const missing=designConstraintCoverage.filter(item=>!unique.includes(item));
 if(missing.length)throw Error(`designCheck.coverage is missing: ${missing.join(', ')}`);
 return designConstraintCoverage.filter(item=>unique.includes(item));
}
async function assertSkillCompleted(root,id,skill,stage){
 const records=(await changeTraces(root,id)).filter(item=>item.type==='skill-invocation'&&item.skill===skill&&item.event==='completed'&&(!stage||item.stage===stage));
 if(!records.length)throw Error(`Completed ${skill} Skill evidence is required${stage?` for ${stage}`:''}; invoke it and record trace-skill started/completed`);
}
function requiredImplementSkills(s){return s.stack==='fullstack'?['frontend-implement','engineering-implement']:s.stack==='frontend'?['frontend-implement']:['engineering-implement'];}
function requiredVerifySkills(s){return s.stack==='fullstack'?['frontend-verify','engineering-verify']:s.stack==='frontend'?['frontend-verify']:['engineering-verify'];}
function requiredImplementationReviewRoles(){return ['architect','code-reviewer'];}
function requiredExtendedReviewRoles(s){return ['security-reviewer',...(s.stack==='frontend'||(s.stack==='fullstack'&&s.ui)?['frontend-reviewer']:[]),...(s.ui?['ui-reviewer']:[])];}
function validateUsageBudget(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('usageBudget must be an object');
 const budget={};
 for(const key of ['maxTokens','maxApiCalls']){
  if(value[key]!==undefined){if(!Number.isInteger(value[key])||value[key]<0)throw Error(`usageBudget.${key} must be a non-negative integer`);budget[key]=value[key];}
 }
 if(value.enforce!==undefined){if(typeof value.enforce!=='boolean')throw Error('usageBudget.enforce must be a boolean');budget.enforce=value.enforce;}
 if(!Object.keys(budget).length)throw Error('usageBudget requires maxTokens or maxApiCalls');
 return budget;
}
async function normalizeDesignReuse(root,value){
 if(value===undefined||value===null)return null;
 if(!Array.isArray(value)||!value.length||value.length>50)throw Error('designReuse must contain 1-50 items');
 const kinds=new Set(['component','token','layout','interaction','pattern']);const seen=new Set();
 return Promise.all(value.map(async (item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`designReuse[${index}] must be an object`);
  const kind=requireText(item.kind,`designReuse[${index}].kind`);if(!kinds.has(kind))throw Error(`designReuse[${index}].kind must be ${[...kinds].join(', ')}`);
  const name=boundedText(requireText(item.name,`designReuse[${index}].name`),200);
  let file=null;if(item.path!==undefined){file=requireText(item.path,`designReuse[${index}].path`);const stat=await fs.lstat(safe(root,file));if(!stat.isFile())throw Error(`designReuse[${index}].path must be a regular file: ${file}`);}
  const note=item.note!==undefined?boundedText(requireText(item.note,`designReuse[${index}].note`),1000):null;
  const key=`${kind}:${name}:${file||''}`;if(seen.has(key))throw Error(`Duplicate designReuse item: ${key}`);seen.add(key);
  const contentHash=file?hash(await readBufferVerified(root,file)):null;
  return {kind,name,...(file?{path:file,contentHash}:{}),...(note?{note}:{})};
 }));
}
function normalizeDesignReuseReason(value){
 if(value===undefined||value===null)return null;
 return boundedText(requireText(value,'designReuseReason'),2000);
}
function requiredImplementationKinds(s){return requiredWorkflowKinds('implementation',s.ui);}
function requiredExtendedKinds(s){return requiredWorkflowKinds('full',s.ui);}
function evidenceSourceHash(record){return record?.sourceHash||(record?.sourceSnapshot?hash(record.sourceSnapshot):null);}
const separateApprovalFlow=s=>s.schemaVersion>=3;
async function assertImplementationApprovals(root,s){return separateApprovalFlow(s)?assertApprovals(root,s,{spec:true,design:true,tasks:true}):assertApprovals(root,s,{spec:true,implementation:true});}
async function assertVerificationApprovals(root,s){return assertApprovals(root,s,{spec:true,design:true,tasks:true,implementation:true});}
function reviewFindings(report){return Array.isArray(report?.findings)?report.findings:[];}
async function assertSpecReview(root,s){
 const bundle=await specBundle(root,s);const artifactHash=hash(bundle);
 const records=(await changeTraces(root,s.changeId)).filter(item=>item.type==='agent-review'&&item.role==='spec-reviewer'&&item.event==='completed'&&item.stage==='spec');
 const latest=records.sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
 if(!latest)throw Error('Completed spec-reviewer review is required before human Spec approval; record trace-agent started/completed for spec-reviewer');
 if(s.schemaVersion>=strictSchemaVersion&&latest.executionMode==='main-agent-fallback'&&!s.reviewerPolicy?.allowMainAgentFallback)throw Error('spec-reviewer must be executed by a subagent; main-agent fallback is disabled for this workflow');
 if(s.schemaVersion>=strictSchemaVersion&&latest.executionMode==='subagent'&&!latest.reviewerSessionId)throw Error('spec-reviewer subagent evidence requires reviewerSessionId');
 if(latest.artifactHash!==artifactHash)throw Error('spec-reviewer review is stale because the proposal or delta specs changed; rerun spec-reviewer');
 let reviewedText,reviewed;try{reviewedText=await read(root,latest.report);reviewed=JSON.parse(reviewedText);}catch(error){if(error.code==='ENOENT')throw Error(`spec-reviewer report is missing: ${latest.report}`);throw error;}
 if(hash(reviewedText)!==latest.reportHash)throw Error('spec-reviewer report changed after it was recorded; rerun the review');
 if(reviewFindings(reviewed).some(item=>item.severity==='critical'||item.severity==='warning'))throw Error('spec-reviewer has unresolved critical or warning findings; revise the documents and rerun spec-reviewer');
 if(Array.isArray(reviewed.unverified)&&reviewed.unverified.length)throw Error('spec-reviewer left applicable checks unverified; resolve them and rerun spec-reviewer');
}
async function rejectPending(root,s,feedback){
 const kind=s.pendingApproval;if(!kind)throw Error('No pending review');clearPending(s);s.stage={prd:'prd',spec:'spec',design:'design',tasks:'tasks',implementation:s.schemaVersion>=5?'implementation':'tasks',acceptance:'implementation'}[kind];s.feedback=feedback;
 const dir=changeDir(root,s.changeId);
 if(kind==='prd'){for(const name of ['proposal.md','technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});s.taskEvidence={};delete s.specReview;delete s.gate;delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;delete s.designReuse;delete s.designReuseReason;delete s.verification;for(const key of ['spec','design','tasks','implementation','acceptance'])delete s.approvals[key];}
 if(kind==='spec'){for(const name of ['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;delete s.designReuse;delete s.designReuseReason;s.taskEvidence={};delete s.verification;for(const key of ['design','tasks','implementation','acceptance'])delete s.approvals[key];}
 if(kind==='design'){for(const name of ['tasks.md','.tasks.json'])await fs.rm(safe(dir,name),{force:true});delete s.designReuse;delete s.designReuseReason;s.taskEvidence={};delete s.verification;for(const key of ['tasks','implementation','acceptance'])delete s.approvals[key];}
 if(kind==='tasks'){for(const name of ['tasks.md','.tasks.json'])await fs.rm(safe(dir,name),{force:true});s.taskEvidence={};delete s.verification;delete s.implementationReview;for(const key of ['tasks','implementation','acceptance'])delete s.approvals[key];}
 if(kind==='implementation'){delete s.verification;delete s.implementationReview;for(const key of ['implementation','acceptance'])delete s.approvals[key];}
 if(kind==='acceptance'){delete s.verification;delete s.implementationReview;delete s.approvals.implementation;delete s.approvals.acceptance;}
}
function freezeAgentReview(record){return {role:record.role,invocationId:record.invocationId,report:record.report,reportHash:record.reportHash,snapshotHash:record.snapshotHash,executionMode:record.executionMode,reviewerSessionId:record.reviewerSessionId,agentConfigHash:record.agentConfigHash,stage:record.stage,at:record.at};}
async function assertAgentReviews(root,s,snapshotHash,roles,stage=null,frozen=null){
 const records=(await changeTraces(root,s.changeId)).filter(item=>item.type==='agent-review'&&item.event==='completed'&&(!stage||item.stage===stage));
 const selected=[];
 for(const role of roles){
  let latest;
  if(frozen){
   const expected=frozen.find(item=>item.role===role);
   if(!expected)throw Error(`Approved ${role} review evidence is not frozen in the current workflow record; resubmit the review evidence`);
   latest=records.find(item=>item.invocationId===expected.invocationId&&item.reportHash===expected.reportHash);
   if(!latest)throw Error(`${role} review record changed after the review was submitted; rerun the review and resubmit`);
  }else latest=records.filter(item=>item.role===role).sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
  if(!latest)throw Error(`Completed ${role} review evidence is required; record trace-agent started/completed with reviewedFiles`);
  if(s.schemaVersion>=strictSchemaVersion&&latest.executionMode==='main-agent-fallback'&&!s.reviewerPolicy?.allowMainAgentFallback)throw Error(`${role} must be executed by a subagent; main-agent fallback is disabled for this workflow`);
  if(s.schemaVersion>=strictSchemaVersion&&latest.executionMode==='subagent'&&!latest.reviewerSessionId)throw Error(`${role} subagent evidence requires reviewerSessionId`);
  if(latest.snapshotHash!==snapshotHash)throw Error(`${role} review is stale because source changed; rerun the review against the final source`);
  let text,reviewed;try{text=await read(root,latest.report);reviewed=JSON.parse(text);}catch(error){if(error.code==='ENOENT')throw Error(`${role} review report is missing: ${latest.report}`);if(error instanceof SyntaxError)throw Error(`${role} review report is invalid JSON: ${latest.report}`);throw error;}
  if(hash(text)!==latest.reportHash)throw Error(`${role} review report changed after it was recorded; rerun the review`);
  if(!Array.isArray(reviewed.findings)||!Array.isArray(reviewed.unverified))throw Error(`${role} review report must contain findings and unverified arrays`);
  if(reviewFindings(reviewed).some(item=>item.severity==='critical'||item.severity==='warning'))throw Error(`${role} has unresolved critical or warning findings; fix them and rerun the review`);
  if(reviewed.unverified.length)throw Error(`${role} left applicable checks unverified; resolve them and rerun the review`);
  selected.push(latest);
 }
 return selected.map(freezeAgentReview);
}
function validateReviewReference(reference,label){
 if(!reference||typeof reference!=='object'||Array.isArray(reference))throw Error(`${label} must be an object`);
 requireText(reference.path,`${label}.path`);if(reference.line!==undefined&&(!Number.isInteger(reference.line)||reference.line<1))throw Error(`${label}.line must be a positive integer`);
 if(reference.note!==undefined)requireText(reference.note,`${label}.note`);
 return reference;
}
async function reviewEvidence(root,input){
 if(!Array.isArray(input.reviewedFiles)||!input.reviewedFiles.length)throw Error('completed trace-agent requires reviewedFiles');
 for(const file of input.reviewedFiles){requireText(file,'reviewedFiles item');const full=safe(root,file);const stat=await fs.lstat(full);if(!stat.isFile())throw Error(`reviewedFiles must reference regular files: ${file}`);}
 if(!Array.isArray(input.findings))throw Error('completed trace-agent requires findings array');
 for(const finding of input.findings){
  if(!finding||typeof finding!=='object'||Array.isArray(finding))throw Error('Invalid review finding');
  if(!['critical','warning','suggestion'].includes(finding.severity))throw Error('Invalid review finding severity');
  requireText(finding.message,'finding.message');
  if(finding.path!==undefined){requireText(finding.path,'finding.path');const stat=await fs.lstat(safe(root,finding.path));if(!stat.isFile())throw Error(`finding.path must be a regular file: ${finding.path}`);if(finding.line!==undefined&&(!Number.isInteger(finding.line)||finding.line<1))throw Error('finding.line must be a positive integer');}
 }
 if(!Array.isArray(input.unverified))throw Error('completed trace-agent requires unverified array');
 for(const reason of input.unverified)requireText(reason,'unverified reason');
}
function applyUsageBudget(report,budget){
 if(budget){
  const exceeded=(budget.maxTokens!==undefined&&report.totals.totalTokens>budget.maxTokens)||(budget.maxApiCalls!==undefined&&report.apiCalls>budget.maxApiCalls);
  report.budget={...budget,status:exceeded?'exceeded':'within',enforced:budget.enforce===true,checkedAt:now()};
 }else delete report.budget;
 return report;
}
async function writeUsageReport(root,id,record){
 const relative=`reports/usage/${id}.json`;let report={schemaVersion:1,changeId:id,records:[],totals:{inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0},apiCalls:0};
 if(await exists(safe(root,relative)))report=await json(root,relative);
 const state=await exists(safe(root,statePath(id)))?await json(root,statePath(id)):null;
 const budget=state?.usageBudget||null;
 const identity=[record.sessionId,record.source,record.invocationId,record.stage,record.skill,record.agent].join('|');
 const existing=report.records.findIndex(item=>[item.sessionId,item.source,item.invocationId,item.stage,item.skill,item.agent].join('|')===identity);
 if(existing>=0)report.records[existing]=record;else report.records.push(record);
 report.totals=report.records.reduce((total,item)=>{for(const key of Object.keys(total))total[key]+=item.usage[key];return total;},{inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0});
 report.apiCalls=report.records.reduce((total,item)=>total+item.apiCalls,0);
 const group=(key,fallback)=>Object.fromEntries(Object.entries(report.records.reduce((result,item)=>{
  const name=item[key]||fallback;result[name]??={inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0,apiCalls:0};
  for(const field of Object.keys(result[name])){if(field==='apiCalls')result[name][field]+=item.apiCalls||0;else result[name][field]+=item.usage?.[field]||0;}
  return result;
 },{})).sort(([a],[b])=>a.localeCompare(b)));
 report.byStage=group('stage','unattributed');
 report.bySkill=group('skill','unattributed');
 report.byAgent=group('agent','unattributed');
 applyUsageBudget(report,budget);
 report.updatedAt=now();
 await putJson(root,relative,report);
 return report;
}
async function recordUsage(root,id,input){
 const stage=input.stage??null;if(stage!==null&&!stageNames.has(stage))throw Error('Invalid usage stage');
 const attribution=input.attribution??(stage?'stage':'session');if(!['stage','session','skill','agent'].includes(attribution))throw Error('Invalid usage attribution');
 if(input.apiCalls!==undefined&&(!Number.isInteger(input.apiCalls)||input.apiCalls<0))throw Error('usage.apiCalls must be a non-negative integer');
 const record={type:'usage-record',changeId:id,stage,attribution,source:requireText(input.source,'usage.source'),model:input.model?boundedText(input.model,200):null,provider:input.provider?boundedText(input.provider,200):null,sessionId:input.sessionId?boundedText(input.sessionId,256):null,invocationId:input.invocationId?boundedText(input.invocationId,128):null,skill:input.skill?requireText(input.skill,'usage.skill'):null,agent:input.agent?requireText(input.agent,'usage.agent'):null,apiCalls:input.apiCalls??1,usage:normalizeUsage(input.usage,'usage.usage'),at:now()};
 await appendTrace(root,id,record);
 const report=await writeUsageReport(root,id,record);
 return {record,report};
}
async function assertUsageBudget(root,id){
 const relative=`reports/usage/${id}.json`;if(!await exists(safe(root,relative)))return;
 const report=await json(root,relative);
 if(report.budget?.enforce&&report.budget.status==='exceeded')throw Error('Usage budget exceeded; call set-usage-budget with a higher limit, disable enforcement, or clear the budget before continuing');
}
async function latestActiveChange(root){
 const dir=safe(root,'planning/workflows');if(!await exists(dir))return null;
 const files=(await fs.readdir(dir)).filter(name=>name.endsWith('.json')).sort();
 let best=null;
 for(const file of files){let state;try{state=await json(root,'planning/workflows',file);}catch{continue;}if(state.status==='completed')continue;const at=state.history?.at(-1)?.at||'';if(!best||at>best.at)best={changeId:state.changeId,at};}
 return best?.changeId||null;
}
export async function run(input){
 if(input.action==='initialize')return initialize(input.project,{preview:input.preview===true,stack:input.stack});
 if(input.action==='import-session-usage'){
  const root=await projectRoot(input.project);
  return lock(root,async()=>{
   const usage=await readCodexSessionUsage(requireText(input.sessionId,'sessionId'),input.sessionsRoot?{sessionsRoot:input.sessionsRoot}:undefined);
   const active=input.changeId?identifier(input.changeId):await latestActiveChange(root);
   if(!usage.available)return {status:'SKIPPED',reason:usage.reason,usage};
   if(!active){const relative=`reports/usage/sessions/${hash(input.sessionId).slice(0,16)}.json`;await putJson(root,relative,usage);return {status:'PASS',changeId:null,report:relative,usage};}
   const recorded=await recordUsage(root,active,{source:'codex-session',sessionId:input.sessionId,apiCalls:usage.apiCalls,usage:usage.usage,model:usage.model,provider:usage.provider,attribution:'session'});
   return {status:'PASS',changeId:active,report:`reports/usage/${active}.json`,usage:recorded.report,telemetry:usage};
  },input.action);
 }
 if(input.action==='gc-transactions'){
  const root=await projectRoot(input.project);
  return lock(root,async()=>gcTransactions(root,{retain:input.retain??50}),input.action);
 }
 const root=await projectRoot(input.project);const id=identifier(input.changeId);const file=statePath(id);const ref={root:safe(root,'planning'),changeId:id};
 if(input.action==='trace-skill')return lock(root,async()=>{
  const known=new Set();async function scan(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const p=safe(dir,item.name);if(item.isDirectory())await scan(p);else if(item.name==='SKILL.md')known.add(p.slice(safe(pluginRoot).length+1).split('/').slice(1,-1).join('/'));}}
  await scan(safe(pluginRoot,'skills'));const skill=requireText(input.skill,'skill');if(!known.has(skill))throw Error(`Unknown Skill: ${skill}`);
  if(!['started','completed','failed'].includes(input.event))throw Error('event must be started, completed or failed');
  const invocationId=boundedText(requireText(input.invocationId,'invocationId'),128);
  if(!invocationId)throw Error('invocationId is empty after normalization');
  const summary=boundedText(requireText(input.summary,'summary'),1000);
  if(!summary)throw Error('summary is empty after normalization');
  if(input.stage!==undefined&&input.stage!==null&&!stageNames.has(input.stage))throw Error('Invalid Skill trace stage');
  const prior=(await changeTraces(root,id)).filter(item=>item.type==='skill-invocation'&&item.invocationId===invocationId);
  if(input.event==='started'&&prior.length)throw Error('Skill invocation already started; reuse only for its completed/failed event');
  if(input.event!=='started'&&!prior.some(item=>item.event==='started'))throw Error('Skill must have a started event before completed/failed');
  if(input.event!=='started'&&prior.some(item=>['completed','failed'].includes(item.event)))throw Error('Skill invocation already reached a terminal event');
  const record={type:'skill-invocation',changeId:id,skill,event:input.event,invocationId,summary,stage:input.stage||null,at:now()};
  if(input.outcome!==undefined){
   if(!['string','number','boolean'].includes(typeof input.outcome)&&(!input.outcome||typeof input.outcome!=='object'||Array.isArray(input.outcome)))throw Error('outcome must be a string, number, boolean or object');
   const serialized=JSON.stringify(input.outcome);if(Buffer.byteLength(serialized)>4096)throw Error('outcome exceeds 4096 byte limit');
   record.outcome=redactData(input.outcome);
  }
  await appendTrace(root,id,record);return record;
 },input.action);
 if(input.action==='trace-agent')return lock(root,async()=>{
  const role=requireText(input.role,'role');if(!reviewRoles.has(role))throw Error(`Unknown reviewer role: ${role}`);
  if(!['started','completed','failed'].includes(input.event))throw Error('event must be started, completed or failed');
  const executionMode=requireText(input.executionMode,'executionMode');if(!['subagent','main-agent-fallback'].includes(executionMode))throw Error('executionMode must be subagent or main-agent-fallback');
  const reviewerSessionId=input.reviewerSessionId?boundedText(requireText(input.reviewerSessionId,'reviewerSessionId'),256):null;
  const fallbackReason=input.fallbackReason?boundedText(requireText(input.fallbackReason,'fallbackReason'),1000):null;
  if(executionMode==='subagent'&&!reviewerSessionId)throw Error('subagent reviewer evidence requires reviewerSessionId');
  if(executionMode==='main-agent-fallback'&&!fallbackReason)throw Error('main-agent fallback requires fallbackReason');
  const invocationId=boundedText(requireText(input.invocationId,'invocationId'),128);
  const summary=boundedText(requireText(input.summary,'summary'),1000);
  if(input.stage!==undefined&&input.stage!==null&&!stageNames.has(input.stage))throw Error('Invalid reviewer stage');
  const prior=(await changeTraces(root,id)).filter(item=>item.type==='agent-review'&&item.invocationId===invocationId);
  if(input.event==='started'&&prior.length)throw Error('Reviewer invocation already started; reuse only for its completed/failed event');
  if(input.event!=='started'&&!prior.some(item=>item.event==='started'))throw Error('Reviewer must have a started event before completed/failed');
  if(input.event!=='started'&&prior.some(item=>['completed','failed'].includes(item.event)))throw Error('Reviewer invocation already reached a terminal event');
  let agentConfigHash=null;
  if(executionMode==='subagent'){
   const state=await json(root,file);
   if(state.mainSessionId&&reviewerSessionId===state.mainSessionId)throw Error('reviewerSessionId must differ from the main workflow session');
   const agentConfig=`.codex/agents/${role}.toml`;
   if(!await exists(safe(root,agentConfig)))throw Error(`Subagent reviewer configuration is missing: ${agentConfig}`);
   agentConfigHash=hash(await read(root,agentConfig));
  }
  const record={type:'agent-review',changeId:id,role,event:input.event,invocationId,summary,stage:input.stage||null,executionMode,reviewerSessionId,fallbackReason,agentConfigHash,at:now()};
  if(input.event==='completed'){
   if(role==='spec-reviewer'){
    if(input.stage!=='spec')throw Error('spec-reviewer must run at the spec stage');
    const state=await json(root,file);if(state.stage!=='spec')throw Error('spec-reviewer must run while the workflow is in the spec stage');
    const proposalPath=`planning/changes/${id}/proposal.md`,specPrefix=`planning/changes/${id}/specs/`;
    if(!input.reviewedFiles.includes(proposalPath))throw Error(`spec-reviewer must review ${proposalPath}`);
    if(!input.reviewedFiles.some(file=>file.startsWith(specPrefix)&&file.endsWith('/spec.md')))throw Error('spec-reviewer must review at least one delta spec');
    record.artifactHash=hash(await specBundle(root,state));
   }
   await reviewEvidence(root,input);
   const snapshot=await sourceSnapshot(root);
   const relative=`reports/reviews/${id}/${role}-${hash(invocationId).slice(0,16)}.json`;
   const findings=redactData(input.findings),unverified=redactData(input.unverified);
   const report={schemaVersion:1,changeId:id,role,reviewer:input.reviewer?requireText(input.reviewer,'reviewer'):role,executionMode,reviewerSessionId,fallbackReason,agentConfigHash,summary,stage:input.stage||null,reviewedFiles:input.reviewedFiles,findings,unverified,snapshot,...(record.artifactHash?{artifactHash:record.artifactHash}:{}),at:now()};
   const text=JSON.stringify(report,null,2)+'\n';await atomic(root,relative,text);
   record.report=relative;record.reportHash=hash(text);record.snapshotHash=snapshot.treeHash;record.reviewedFiles=input.reviewedFiles.length;record.findings=findings.length;
  }
  await appendTrace(root,id,record);return record;
 },input.action);
 if(input.action==='record-usage')return lock(root,async()=>{
  const recorded=await recordUsage(root,id,input);
  return {status:'PASS',changeId:id,report:`reports/usage/${id}.json`,record:recorded.record,totals:recorded.report.totals,apiCalls:recorded.report.apiCalls,budget:recorded.report.budget||null};
 },input.action);
 if(input.action==='visualize'){
  const s=await json(root,file);return renderWorkflow(s,await changeTraces(root,id));
 }
 if(input.action==='state'||input.action==='context'){
  if(await exists(safe(root,'.workflow/pending.json')))throw Error('Recovery required before reading workflow');
  const s=await json(root,file),compatibility=await compatibilityWarnings(root,s);
  return input.action==='state'?{...s,compatibility}:{state:s,compatibility,...await generationContext(root,s)};
 }
 return lock(root,async()=>{
  if(input.action==='evaluate-quality'){
   const s=await json(root,file);if(input.expectedVersion!==s.version)throw Error('Stale expectedVersion; read state again');
   if(s.status==='completed')throw Error('Archived workflow is immutable');
   return evaluate(root,s,input);
  }
  if(input.action==='recover'){
   const record=await json(root,'.workflow/pending.json');if(record.id!==input.transactionId)throw Error('Recovery transaction mismatch');requireText(input.reason,'reason');return recoverPending(root,record,input.reason);
  }
  return transaction(root,async()=>{
   let s;
   if(input.action==='start'){
    if(await exists(safe(root,file))||await exists(changeDir(root,id))||await exists(safe(root,'planning/archive',id))||await exists(safe(root,`docs/prd/${id}.md`)))throw Error('Change already exists');
    if(typeof input.ui!=='boolean')throw Error('start requires ui boolean so design-check and UI reviews can be enforced');
    const stack=input.stack;if(!['frontend','backend','fullstack'].includes(stack))throw Error('start requires stack to be frontend, backend or fullstack');if(stack==='frontend'&&!input.ui)throw Error('frontend stack requires ui: true');
    if(input.allowMainAgentFallback!==undefined&&typeof input.allowMainAgentFallback!=='boolean')throw Error('allowMainAgentFallback must be a boolean');
    if(input.sessionId!==undefined)requireText(input.sessionId,'sessionId');
    s={schemaVersion:strictSchemaVersion,changeId:id,prdPath:`docs/prd/${id}.md`,stage:'prd',status:'in-progress',pendingApproval:null,pendingReview:null,approvals:{},taskEvidence:{},clarifications:[],version:0,history:[],ui:input.ui,stack,designCheck:null,usageBudget:validateUsageBudget(input.usageBudget),mainSessionId:input.sessionId||null,reviewerPolicy:{allowMainAgentFallback:input.allowMainAgentFallback===true},evidencePolicy:await evidencePolicyFor(root)};
    await atomic(root,s.prdPath,requireText(input.document,'document'));
   }else{
    s=await json(root,file);if(input.expectedVersion!==s.version)throw Error('Stale expectedVersion; read state again');
    if(s.schemaVersion<strictSchemaVersion&&input.action!=='migrate')throw Error(`Workflow schemaVersion ${s.schemaVersion} must be migrated before continuing`);
    if(s.status==='completed')throw Error('Archived workflow is immutable');
    if(s.status==='waiting-clarification'&&!['answer-clarification','request-clarification'].includes(input.action))throw Error('Open clarification blocks workflow transitions');
    switch(input.action){
     case 'request-clarification':{
      requireStage(s,'prd');if(!Array.isArray(input.questions)||!input.questions.length||input.questions.length>50)throw Error('questions must contain 1-50 items');
      const existing=new Set((s.clarifications||[]).map(q=>q.id));
      for(const q of input.questions){const id=requireText(q.id,'question id');requireText(q.question,'question');if(existing.has(id))throw Error('Duplicate clarification id');existing.add(id);(s.clarifications??=[]).push({id,question:q.question,answer:null,at:now()});}
      s.status='waiting-clarification';break;
     }
     case 'answer-clarification':{
      if(s.stage!=='prd'||s.status!=='waiting-clarification')throw Error('No pending clarification');
      if(!Array.isArray(input.answers)||!input.answers.length)throw Error('answers required');
      for(const answer of input.answers){const q=(s.clarifications||[]).find(x=>x.id===answer.id);if(!q)throw Error('Unknown clarification id');if(q.answer)throw Error('Clarification already answered');q.answer=requireText(answer.answer,'answer');q.answeredAt=now();}
      if(s.clarifications.every(q=>q.answer))s.status='in-progress';break;
     }
     case 'migrate':{
      requireText(input.reason,'reason');if(s.schemaVersion>=strictSchemaVersion)throw Error(`Workflow already uses schemaVersion ${strictSchemaVersion}`);
      if(typeof input.ui!=='boolean')throw Error('migrate requires ui boolean so design-check and UI reviews can be enforced');
      if(!['frontend','backend','fullstack'].includes(input.stack))throw Error('migrate requires stack to be frontend, backend or fullstack');
      if(input.stack==='frontend'&&!input.ui)throw Error('frontend stack requires ui: true');
      s.ui=input.ui;s.stack=input.stack;
      s.migration={from:s.schemaVersion,to:strictSchemaVersion,at:now(),reason:input.reason,invalidatedApprovals:Object.keys(s.approvals||{})};
      s.schemaVersion=strictSchemaVersion;s.stage='prd';s.approvals={};s.pendingApproval=null;s.pendingReview=null;s.status='in-progress';s.reviewerPolicy={allowMainAgentFallback:false};s.evidencePolicy=await evidencePolicyFor(root);break;
     }
     case 'save-prd':requireStage(s,'prd');await atomic(root,s.prdPath,requireText(input.document,'document'));s.status='in-progress';break;
     case 'set-usage-budget':{s.usageBudget=validateUsageBudget(input.usageBudget);const relative=`reports/usage/${id}.json`;if(await exists(safe(root,relative))){const usage=await json(root,relative);applyUsageBudget(usage,s.usageBudget);await putJson(root,relative,usage);}break;}
     case 'submit-prd':requireStage(s,'prd');await pending(root,s,'prd');break;
     case 'approve':{
      const kind=s.pendingApproval;if(!kind||input.reviewHash!==s.pendingReview.hash||input.reviewHash!==await approvalHash(root,s,kind))throw Error('Review hash missing or stale');
      const decision=input.decision;if(!['accept-record','accept-no-record','reject'].includes(decision))throw Error('decision must be accept-record, accept-no-record or reject');
      if(decision==='reject'){requireText(input.feedback,'feedback');await rejectPending(root,s,input.feedback);break;}
      await assertUsageBudget(root,s.changeId);
      if(decision==='accept-record'){requireText(input.confirmation?.text,'human confirmation text');requireText(input.confirmation?.source,'human confirmation source');}
      if(kind==='spec')await assertSpecReview(root,s);
      if(kind==='implementation')await assertAgentReviews(root,s,(await sourceSnapshot(root)).treeHash,requiredImplementationReviewRoles(),'implementation',s.implementationReview?.agentReviews||null);
      if(kind==='acceptance')await assertAgentReviews(root,s,s.verification?.sourceHash,(requiredExtendedReviewRoles(s)),'verification',s.verification?.agentReviews||null);
      if(kind==='implementation'||kind==='acceptance'){
       await assertEvidenceIntegrity(root,s);
       const record=kind==='implementation'?s.implementationReview:s.verification;
       if(record?.sourceSnapshot&&hash(record.sourceSnapshot)!==hash(await sourceSnapshot(root)))throw Error('Source changed before approval; resubmit current evidence');
      }
      if(kind!=='prd'){
       if(separateApprovalFlow(s))await assertApprovals(root,s,{spec:['design','tasks','implementation','acceptance'].includes(kind),design:['tasks','implementation','acceptance'].includes(kind),tasks:['implementation','acceptance'].includes(kind),implementation:kind==='acceptance'});
       else await assertApprovals(root,s,{spec:kind!=='spec',implementation:kind==='acceptance'});
      }
      if(kind==='spec')await gate(ref);
      s.approvals[kind]={hash:input.reviewHash,decision,recorded:decision==='accept-record',...(decision==='accept-record'?{confirmation:input.confirmation}:{}),at:now()};clearPending(s);
      s.stage={prd:'spec',spec:'design',design:'tasks',tasks:'implementation',implementation:s.schemaVersion>=5?'verification':'implementation',acceptance:'archive'}[kind];break;
     }
     case 'request-changes':{
      requireText(input.feedback,'feedback');await rejectPending(root,s,input.feedback);break;
     }
     case 'create-spec':case 'save-spec':{
      requireStage(s,'spec');await assertApprovals(root,s);const ctx=await generationContext(root,s);if(input.contextHash!==ctx.contextHash)throw Error('Generation context changed');const output=packageInput(input);
      if(input.action==='create-spec')await engine.createSpecChange({...ref,prd:await prd(root,s),generate:async()=>output});
      else{const dir=changeDir(root,id);if(!await exists(dir))throw Error('Create spec first');await atomic(dir,'proposal.md',output.proposal);await fs.rm(safe(dir,'specs'),{recursive:true,force:true});for(const [key,doc] of Object.entries(output.specs))await atomic(dir,`specs/${key}/spec.md`,doc);for(const name of ['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;s.taskEvidence={};}
      s.status='in-progress';break;
     }
     case 'submit-spec':{
      requireStage(s,'spec');await assertApprovals(root,s);const result=await engine.runSpecVerifyGate(ref);s.specReview=report(input.report);s.gate=result;
      if(!result.valid||s.specReview.issues.some(x=>x.severity==='critical')||s.specReview.unverified.length){s.status='blocked';break;}
      await assertSpecReview(root,s);
      await pending(root,s,'spec');break;
     }
     case 'write-design':case 'write-tasks':{
      const stage=input.action==='write-design'?'design':'tasks';requireStage(s,stage);await assertApprovals(root,s,{spec:true,...(stage==='tasks'&&separateApprovalFlow(s)?{design:true}:{})});const ctx=await generationContext(root,s);if(input.contextHash!==ctx.contextHash)throw Error('Generation context changed');requireText(input.document,'document');
      if(stage==='design'){
       if(s.ui){
        await assertSkillCompleted(root,id,'design-check','design');
        if(!input.designCheck||typeof input.designCheck!=='object'||Array.isArray(input.designCheck)||typeof input.designCheck.constraints!=='string'||!input.designCheck.constraints.trim()||!Array.isArray(input.designCheck.sources)||!input.designCheck.sources.length)throw Error('UI design requires designCheck constraints and sources from design-check');
        const coverage=normalizeDesignCoverage(input.designCheck.coverage);
        const sources=await resolveDesignCheckSources(root,input.designCheck.sources,{inferLegacy:true});
        const projectSources=[ctx.context.projectArchitecture?.design,ctx.context.projectArchitecture?.designSystem,...(ctx.context.projectArchitecture?.tokens||[])].filter(Boolean);
        const sourcePaths=new Set(sources.map(source=>source.path));
        const missingProjectSources=projectSources.filter(file=>!sourcePaths.has(file));
        if(missingProjectSources.length)throw Error(`designCheck must include configured project design sources: ${missingProjectSources.join(', ')}`);
        s.designCheck={constraints:boundedText(input.designCheck.constraints,12000),coverage,sources,at:now()};
        const designReuse=await normalizeDesignReuse(root,input.designReuse);
        const designReuseReason=normalizeDesignReuseReason(input.designReuseReason);
        if(!designReuse?.some(item=>item.kind==='component'||item.kind==='pattern')&&!designReuseReason)throw Error('UI design requires designReuse with at least one component or pattern item, or designReuseReason explaining why no reusable component or pattern exists');
        s.designReuse=designReuse;s.designReuseReason=designReuseReason;
       }
       await engine.generateDesignDoc({...ref,specReviewed:true,generate:async()=>input.document});s.designConstraintsHash=hash(ctx.context.projectArchitecture.guidance);s.designStandardsHash=hash(ctx.context.projectArchitecture.standards);s.designInStarReferencesHash=ctx.context.instarReferences.fingerprint;s.stage='tasks';delete s.approvals.design;delete s.approvals.tasks;delete s.approvals.implementation;s.taskEvidence={};for(const name of ['tasks.md','.tasks.json'])await fs.rm(safe(changeDir(root,id),name),{force:true});await pending(root,s,separateApprovalFlow(s)?'design':'implementation');}
      else{if(taskItems(input.document).some(t=>t.done))throw Error('New tasks must be unchecked');await engine.generateTaskList({...ref,generate:async()=>input.document});s.stage='implementation';delete s.approvals.tasks;delete s.approvals.implementation;s.taskEvidence={};await pending(root,s,separateApprovalFlow(s)?'tasks':'implementation');}break;
     }
     case 'complete-task':{
      requireStage(s,'implementation');await assertImplementationApprovals(root,s);
      let evidence=input.evidence;
      if(s.schemaVersion>=2){
       if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw Error('Task evidence must include summary and files for code-level observation');
       requireText(evidence.summary,'evidence.summary');
       if(!Array.isArray(evidence.files)||!evidence.files.length)throw Error('Task evidence.files must contain at least one reviewed source file');
       for(const file of evidence.files){validateReviewReference(file,'evidence.files item');const stat=await fs.lstat(safe(root,file.path));if(!stat.isFile())throw Error(`Task evidence path must be a regular file: ${file.path}`);}
       if(evidence.verification!==undefined)requireText(evidence.verification,'evidence.verification');
      }else requireText(evidence,'evidence');
      const dir=changeDir(root,id),doc=await read(dir,'tasks.md');const task=taskItems(doc).find(x=>x.id===input.taskId);if(!task||task.done)throw Error('Task missing or already complete');const lines=doc.split('\n');lines[task.line]=lines[task.line].replace('- [ ]','- [x]');await atomic(dir,'tasks.md',lines.join('\n'));s.taskEvidence[task.id]={evidence,at:now()};break;
     }
     case 'submit-implementation':{
      requireStage(s,'implementation');await assertImplementationApprovals(root,s);await completed(root,s);
      for(const skill of requiredImplementSkills(s))await assertSkillCompleted(root,id,skill,'implementation');
      await assertSkillCompleted(root,id,'quality-gate','implementation');
      const review=report(input.report);
      if(!Array.isArray(input.checks)||!input.checks.length)throw Error('Implementation readiness checks required');
      for(const check of input.checks){requireText(check.kind,'check.kind');requireText(check.name,'check.name');requireText(check.evidence,'check.evidence');if(!['passed','failed','not-verified'].includes(check.outcome))throw Error('Invalid check outcome');if(typeof check.artifact!=='string'||!check.artifact.trim())throw Error(`check.artifact required: ${check.name}`);}
      const kinds=requiredImplementationKinds(s);const missing=kinds.filter(kind=>!input.checks.some(c=>c.kind===kind));if(missing.length)throw Error(`Implementation readiness checks missing: ${missing.join(', ')}`);
      const evidence=await collectVerificationEvidence(root,s,input,kinds,'implementation');
      if(evidence.mode==='strict')s.evidencePolicy={mode:'strict'};
      if(s.ui&&!s.designCheck)throw Error('UI implementation requires recorded design-check constraints');
      const snapshot=await sourceSnapshot(root);
      const agentReviews=await assertAgentReviews(root,s,snapshot.treeHash,requiredImplementationReviewRoles(),'implementation');
      const qualityGate=await assertQualityGateEvidence(root);
      s.implementationReview={report:review,checks:evidence.checks,evidence:{mode:evidence.mode,reportPath:evidence.reportPath,reportId:evidence.reportId,reportHash:evidence.reportHash,snapshot:evidence.snapshot,sourceHash:evidence.sourceHash,configHash:evidence.configHash},qualityGate,at:now(),reviews:requiredImplementationReviewRoles(),agentReviews,skills:[...requiredImplementSkills(s),'quality-gate'],sourceHash:snapshot.treeHash,sourceSnapshot:snapshot};
      if(review.issues.some(x=>x.severity==='critical')||review.unverified.length||evidence.checks.some(x=>x.outcome!=='passed'))s.status='blocked';else await pending(root,s,'implementation');break;
     }
     case 'submit-verification':{
      requireStage(s,'verification');await assertVerificationApprovals(root,s);await completed(root,s);const review=report(input.report);
      if(!Array.isArray(input.checks)||!input.checks.length)throw Error('Verification checks required');
      for(const check of input.checks){requireText(check.kind,'check.kind');requireText(check.name,'check.name');requireText(check.evidence,'check.evidence');if(!['passed','failed','not-verified'].includes(check.outcome))throw Error('Invalid check outcome');if(typeof check.artifact!=='string'||!check.artifact.trim())throw Error(`check.artifact required: ${check.name}`);}
      const kinds=requiredExtendedKinds(s);const missing=kinds.filter(kind=>!input.checks.some(c=>c.kind===kind));if(missing.length)throw Error(`Verification checks missing: ${missing.join(', ')}`);
      const evidence=await collectVerificationEvidence(root,s,input,kinds,'full');
      if(evidence.mode==='strict')s.evidencePolicy={mode:'strict'};
      if(s.ui&&!s.designCheck)throw Error('UI verification requires recorded design-check constraints');
      for(const skill of requiredVerifySkills(s))await assertSkillCompleted(root,id,skill,'verification');
      const snapshot=await sourceSnapshot(root);
      if(!s.implementationReview||evidenceSourceHash(s.implementationReview)!==snapshot.treeHash)throw Error('Source changed after implementation approval; reopen implementation and approve again');
      if(evidence.reportAt&&s.approvals.implementation?.at&&Date.parse(evidence.reportAt)<Date.parse(s.approvals.implementation.at))throw Error('Full verification report predates implementation approval; rerun full verification');
      const agentReviews=await assertAgentReviews(root,s,snapshot.treeHash,requiredExtendedReviewRoles(s),'verification');
      s.verification={report:review,checks:evidence.checks,evidence:{mode:evidence.mode,reportPath:evidence.reportPath,reportId:evidence.reportId,reportHash:evidence.reportHash,snapshot:evidence.snapshot,sourceHash:evidence.sourceHash,configHash:evidence.configHash},at:now(),reviews:requiredExtendedReviewRoles(s),agentReviews,skills:requiredVerifySkills(s),sourceHash:snapshot.treeHash,sourceSnapshot:snapshot};
      if(review.issues.some(x=>x.severity==='critical')||review.unverified.length||evidence.checks.some(x=>x.outcome!=='passed'))s.status='blocked';else await pending(root,s,'acceptance');break;
     }
     case 'archive':{
      requireStage(s,'archive');await assertUsageBudget(root,s.changeId);await completed(root,s);await assertVerificationApprovals(root,s);if(s.approvals.acceptance?.hash!==await approvalHash(root,s,'acceptance'))throw Error('Acceptance missing or stale');if(!s.verification||evidenceSourceHash(s.verification)!==(await sourceSnapshot(root)).treeHash)throw Error('Source tree changed after verification; reopen implementation and verify again');await assertEvidenceIntegrity(root,s);s.promotion=await engine.promoteToBaseline({...ref,accepted:true});s.status='completed';break;
     }
     case 'reopen':{
      const stage=input.stage;requireText(input.reason,'reason');const order=['prd','spec','design','tasks','implementation','verification','archive'];if(!order.includes(stage)||order.indexOf(stage)>order.indexOf(s.stage)||stage==='archive')throw Error('Invalid reopen stage');
      if(stage!=='prd')await assertApprovals(root,s,{spec:!['prd','spec'].includes(stage),implementation:['implementation','verification'].includes(stage)});
      const keep=separateApprovalFlow(s)?{prd:[],spec:['prd'],design:['prd','spec'],tasks:['prd','spec','design'],implementation:['prd','spec','design','tasks'],verification:['prd','spec','design','tasks','implementation']}[stage]:{prd:[],spec:['prd'],design:['prd','spec'],tasks:['prd','spec'],implementation:['prd','spec','implementation'],verification:['prd','spec','implementation']}[stage];for(const key of Object.keys(s.approvals))if(!keep.includes(key))delete s.approvals[key];
      const dir=changeDir(root,id);if(stage==='prd')await fs.rm(dir,{recursive:true,force:true});
      if(['spec','design','tasks'].includes(stage))for(const name of stage==='tasks'?['tasks.md','.tasks.json']:['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});
      if(['prd','spec','design','tasks'].includes(stage)){s.taskEvidence={};delete s.specReview;delete s.gate;}
      if(['prd','spec','design'].includes(stage)){delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;delete s.designReuse;delete s.designReuseReason;}
      delete s.verification;if(stage!=='verification')delete s.implementationReview;clearPending(s);s.stage=stage;s.reopenReason=input.reason;if(stage==='prd'){s.clarifications=[];s.status='in-progress';}break;
     }
     default:throw Error(`Unknown action: ${input.action}`);
    }
   }
   s.version++;s.history.push({action:input.action,version:s.version,at:now(),stage:s.stage,status:s.status});await putJson(root,file,s);
   await appendTrace(root,id,{type:'workflow-action',changeId:id,action:input.action,version:s.version,stage:s.stage,status:s.status,at:now()});
   if(s.status==='completed')await putJson(root,`planning/archive/${id}/workflow.json`,s);
   return s;
  });
 },input.action);
}
