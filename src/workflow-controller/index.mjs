import {fs,safe,identifier,now,requireText,projectRoot,exists,read,json,atomic,putJson,lock,transaction,restore,hash,appendJsonl,pluginRoot,sourceSnapshot} from './files.mjs';
import {changeDir,prd,approvalHash,assertApprovals,generationContext,taskItems,report} from './documents.mjs';
import * as engine from '../openspec-min/entry.js';
import {evaluate} from './evaluation.mjs';
import {redactData,boundedText} from '../shared/redaction.mjs';
import {baselineContext,adoptRules,validateRuleReferences,baselineCheck} from '../shared/project-baseline.mjs';
import {reuseContext,validateReuseDecisions,validateReuseReview,validateReusePlan} from '../shared/code-reuse.mjs';
import {workflowWritePaths} from './write-set.mjs';
import {describeSnapshotDrift,snapshotIdentity} from '../shared/source-snapshot.mjs';
import {initialEfficiency,laneAtLeast,normalizeLane,recommendedLane,summarizeEfficiency,validateMetrics} from '../shared/efficiency.mjs';
import {selectSkills} from '../shared/skills-index.mjs';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
const statePath=id=>`planning/workflows/${identifier(id)}.json`;
const requireStage=(s,...stages)=>{if(!stages.includes(s.stage)||s.status==='completed'||s.pendingApproval)throw Error(`Action unavailable in ${s.stage}/${s.status}`);};
async function projectRiskPolicy(root){
 if(!await exists(safe(root,'.instar-quality.json')))return null;
 let config;
 try{config=await json(root,'.instar-quality.json');}catch(error){throw Error(`Unable to read .instar-quality.json for risk-aware lane selection: ${error.message}`);}
 if(config?.riskPolicy===undefined)return null;
 if(!config.riskPolicy||typeof config.riskPolicy!=='object'||Array.isArray(config.riskPolicy))throw Error('Invalid riskPolicy configuration');
 return config.riskPolicy;
}
async function pending(root,s,kind){s.status='awaiting-approval';s.pendingApproval=kind;s.pendingReview={kind,hash:await approvalHash(root,s,kind)};}
function clearPending(s){s.pendingApproval=null;s.pendingReview=null;s.status='in-progress';}
function packageInput(input){requireText(input.proposal,'proposal');if(!input.specs||typeof input.specs!=='object'||Array.isArray(input.specs)||!Object.keys(input.specs).length)throw Error('specs must be a nonempty mapping');for(const [id,doc] of Object.entries(input.specs)){identifier(id,true);requireText(doc,'spec');}return {proposal:input.proposal,specs:input.specs};}
function affectedPaths(value=[]){if(!Array.isArray(value)||value.length>50||value.some(p=>typeof p!=='string'||!p||p.includes('..')||p.includes('\\')||p.startsWith('/')))throw Error('Invalid affectedPaths');return value;}
async function completed(root,s){const items=taskItems(await read(changeDir(root,s.changeId),'tasks.md'));if(items.some(t=>!t.done||!s.taskEvidence[t.id]))throw Error('All tasks need completion evidence');}
async function completeTasks(root,s,inputTasks){
 requireStage(s,'implementation');await assertApprovals(root,s,{spec:true,implementation:true});
 if(!Array.isArray(inputTasks)||!inputTasks.length||inputTasks.length>100)throw Error('tasks must contain 1-100 completion records');
 const dir=changeDir(root,s.changeId),doc=await read(dir,'tasks.md'),items=taskItems(doc),byId=new Map(items.map(item=>[item.id,item])),seen=new Set(),completions=[];
 for(const input of inputTasks){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Each task completion must be an object');
  const taskId=requireText(input.taskId,'taskId'),evidence=requireText(input.evidence,'evidence');
  if(seen.has(taskId))throw Error(`Duplicate completed task: ${taskId}`);seen.add(taskId);
  const item=byId.get(taskId);if(!item||item.done)throw Error(`Task missing or already complete: ${taskId}`);
  completions.push({taskId,evidence,line:item.line});
 }
 const lines=doc.split('\n');for(const item of completions)lines[item.line]=lines[item.line].replace('- [ ]','- [x]');
 await atomic(dir,'tasks.md',lines.join('\n'));
 for(const item of completions)s.taskEvidence[item.taskId]={evidence:item.evidence,at:now()};
 return completions.length;
}
async function gate(ref){const result=await engine.runSpecVerifyGate(ref);if(!result.valid)throw Error(result.issues.join('\n'));return result;}
function normalizeSkillName(value){
 const raw=requireText(value,'skill').replaceAll('\\','/');
 const marker='/skills/';
 const markerIndex=raw.indexOf(marker);
 const normalized=markerIndex>=0?raw.slice(markerIndex+marker.length):raw.replace(/^skills\//,'');
 return normalized.replace(/\/SKILL\.md$/,'').replace(/^\/+|\/+$/g,'');
}
async function availableSkills(){
 const skills=[];
 async function scan(dir,relative=''){
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
   const current=relative?`${relative}/${item.name}`:item.name;
   const full=safe(dir,item.name);
   if(item.isDirectory())await scan(full,current);
   else if(item.name==='SKILL.md')skills.push(current.slice(0,-'/SKILL.md'.length));
  }
 }
 await scan(safe(pluginRoot,'skills'));return skills.sort();
}
async function traceRecords(root){
 const file=safe(root,'.workflow','traces.jsonl');if(!await exists(file))return [];
 return (await fs.readFile(file,'utf8')).split('\n').filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch(error){throw Error(`Invalid trace record at line ${index+1}: ${error.message}`);}});
}
async function recordSkillTrace(root,input){
 const skill=normalizeSkillName(input.skill),known=await availableSkills();
 if(!known.includes(skill))throw Error(`Unknown Skill: ${input.skill}. Use one of: ${known.join(', ')}`);
 if(!['started','completed','failed'].includes(input.event))throw Error('event must be started, completed or failed');
 const invocationId=boundedText(requireText(input.invocationId,'invocationId'),128);if(!invocationId)throw Error('invocationId is empty after normalization');
 const summary=boundedText(requireText(input.summary,'summary'),1000);if(!summary)throw Error('summary is empty after normalization');
 const stages=new Set(['prd','spec','design','tasks','implementation','verification','acceptance']);
 if(input.stage!==undefined&&input.stage!==null&&!stages.has(input.stage))throw Error('Invalid Skill trace stage');
 const same=(await traceRecords(root)).filter(record=>record.type==='skill-invocation'&&record.invocationId===invocationId);
 if(input.event==='started'&&same.length)throw Error(`Skill invocation already exists: ${invocationId}`);
 if(['completed','failed'].includes(input.event)&&(!same.some(record=>record.event==='started')||same.some(record=>['completed','failed'].includes(record.event))))throw Error(`Skill invocation must have exactly one open lifecycle: ${invocationId}`);
 const record={type:'skill-invocation',changeId:input.changeId,skill,event:input.event,invocationId,summary,stage:input.stage||null,at:now()};
 if(input.metrics!==undefined)record.metrics=validateMetrics(input.metrics);
 if(input.outcome!==undefined){
  if(!['string','number','boolean'].includes(typeof input.outcome)&&(!input.outcome||typeof input.outcome!=='object'||Array.isArray(input.outcome)))throw Error('outcome must be a string, number, boolean or object');
  const serialized=JSON.stringify(input.outcome);if(Buffer.byteLength(serialized)>4096)throw Error('outcome exceeds 4096 byte limit');record.outcome=redactData(input.outcome);
 }
 await appendJsonl(root,'.workflow/traces.jsonl',record);return record;
}
function checkRecord(input){
 requireText(input.name,'check.name');requireText(input.evidence,'check.evidence');
 if(typeof input.kind!=='string'||!input.kind.trim())throw Error('check.kind must be a nonempty string');
 const applicable=input.applicable!==false;
 const allowed=applicable?['passed','failed','not-verified']:['not-applicable','not-verified'];
 if(!allowed.includes(input.outcome))throw Error(`Invalid check outcome for ${input.name}; expected ${allowed.join(' or ')}`);
 return {...input,applicable};
}
function assertCurrentSnapshot(previous,current,label){
 const before=snapshotIdentity(previous),after=snapshotIdentity(current);
 if(!before||before!==after)throw Error((label==='Verification evidence'?'Source tree changed after verification; ':'')+label+' is stale. '+describeSnapshotDrift(previous,current)+' Recovery: run quality-gate against the current tree, bind the new reports/quality-gate.json with submit-quality-review, then submit verification evidence again.');
}
async function readWorkspaceJson(root,relative,label){
 if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error(label+' must be a workspace-relative JSON path');
 const file=safe(root,relative),stat=await fs.lstat(file);
 if(stat.isSymbolicLink()||!stat.isFile())throw Error(label+' must be a regular workspace file');
 if(stat.size>16*1024*1024)throw Error(label+' exceeds the 16 MiB report limit');
 const real=await fs.realpath(file);
 if(real!==root&&!real.startsWith(root+path.sep))throw Error(label+' must stay inside the workspace');
 let handle,text;
 try{
  handle=await fs.open(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
  const opened=await handle.stat();
  if(!opened.isFile())throw Error(label+' must be a regular workspace file');
  if(opened.size>16*1024*1024)throw Error(label+' exceeds the 16 MiB report limit');
  text=await handle.readFile('utf8');
 }catch(error){if(String(error.message).startsWith(label))throw error;throw Error(`Unable to read ${label}: ${error.message}`);}
 finally{if(handle)await handle.close();}
 try{return JSON.parse(text);}catch(error){throw Error(label+' is not valid JSON: '+error.message);}
}
export async function run(input){
 if(input.action==='list-skills')return {skills:await availableSkills()};
 if(input.action==='route-skills')return selectSkills({context:input.context||'',stage:input.stage||null});
 if(['recovery-status','prune-recovery'].includes(input.action)){const root=await projectRoot(input.project);const {recoveryStore}=await import('./recovery.mjs');return lock(root,()=>recoveryStore(root,input));}
 if(input.action==='baseline-check')return baselineCheck(await projectRoot(input.project));
 if(input.action==='reuse-context')return reuseContext(await projectRoot(input.project));
 if(['baseline-context','baseline-adopt'].includes(input.action)){
  const root=await projectRoot(input.project);
  return input.action==='baseline-context'?baselineContext(root,input.paths||[]):lock(root,()=>adoptRules(root,input));
 }
 const root=await projectRoot(input.project);const id=identifier(input.changeId);const file=statePath(id);const ref={root:safe(root,'planning'),changeId:id};
 if(input.action==='trace-skill')return lock(root,()=>recordSkillTrace(root,{...input,changeId:id}));
 if(input.action==='state'||input.action==='context'){
  if(await exists(safe(root,'.workflow/pending.json')))throw Error('Recovery required before reading workflow');
  const s=await json(root,file),efficiencySummary=summarizeEfficiency({state:s,traces:await traceRecords(root)});
  return input.action==='state'?{...s,efficiencySummary}:{state:s,efficiencySummary,...await generationContext(root,s,{knownContextHash:input.knownContextHash})};
 }
 return lock(root,async()=>{
  if(input.action==='evaluate-quality'){
   const s=await json(root,file);if(input.expectedVersion!==s.version)throw Error('Stale expectedVersion; read state again');
   if(s.status==='completed')throw Error('Archived workflow is immutable');
   return evaluate(root,s,input);
  }
  if(input.action==='recover'){
   const record=await json(root,'.workflow/pending.json');if(record.id!==input.transactionId)throw Error('Recovery transaction mismatch');requireText(input.reason,'reason');await restore(root,record);await putJson(root,`${record.backup}/result.json`,{...record,status:'recovered',reason:input.reason});await fs.unlink(safe(root,'.workflow/pending.json'));return {recovered:record.id};
  }
  return transaction(root,async()=>{
   let s;
   if(input.action==='start'){
    if(await exists(safe(root,file))||await exists(changeDir(root,id))||await exists(safe(root,'planning/archive',id))||await exists(safe(root,`docs/prd/${id}.md`)))throw Error('Change already exists');
    const paths=input.affectedPaths===undefined?[]:affectedPaths(input.affectedPaths),minimumLane=recommendedLane({affectedPaths:paths,riskPolicy:await projectRiskPolicy(root)}),lane=normalizeLane(input.lane??minimumLane);
    if(!laneAtLeast(lane,minimumLane))throw Error(`lane ${lane} is below the risk-aware minimum ${minimumLane}; choose ${minimumLane} or a stricter lane`);
    s={schemaVersion:1,changeId:id,prdPath:`docs/prd/${id}.md`,stage:'prd',status:'in-progress',pendingApproval:null,pendingReview:null,approvals:{},taskEvidence:{},clarifications:[],version:0,history:[],affectedPaths:paths,efficiency:initialEfficiency({lane,affectedPaths:paths,minimumLane,startedAt:now()})};
    await atomic(root,s.prdPath,requireText(input.document,'document'));
   }else{
    s=await json(root,file);if(input.expectedVersion!==s.version)throw Error('Stale expectedVersion; read state again');
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
     case 'save-prd':requireStage(s,'prd');if(input.affectedPaths!==undefined)s.affectedPaths=affectedPaths(input.affectedPaths);
    await atomic(root,s.prdPath,requireText(input.document,'document'));s.status='in-progress';break;
     case 'submit-prd':requireStage(s,'prd');await pending(root,s,'prd');break;
     case 'approve':{
      const kind=s.pendingApproval;if(!kind||input.reviewHash!==s.pendingReview.hash||input.reviewHash!==await approvalHash(root,s,kind))throw Error('Review hash missing or stale');
      requireText(input.confirmation?.text,'human confirmation text');requireText(input.confirmation?.source,'human confirmation source');
      if(kind!=='prd')await assertApprovals(root,s,{spec:kind!=='spec',implementation:kind==='acceptance'});
      if(kind==='spec')await gate(ref);
      s.approvals[kind]={hash:input.reviewHash,confirmation:input.confirmation,at:now()};clearPending(s);
      s.stage={prd:'spec',spec:'design',implementation:'implementation',acceptance:'archive'}[kind];break;
     }
     case 'request-changes':{
      requireText(input.feedback,'feedback');if(!s.pendingApproval)throw Error('No pending review');
      const kind=s.pendingApproval;clearPending(s);s.stage={prd:'prd',spec:'spec',implementation:'tasks',acceptance:'implementation'}[kind];s.feedback=input.feedback;
      if(kind==='implementation'){await fs.rm(safe(changeDir(root,id),'tasks.md'),{force:true});await fs.rm(safe(changeDir(root,id),'.tasks.json'),{force:true});}
      if(kind==='spec'){const dir=changeDir(root,id);for(const name of ['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;s.taskEvidence={};delete s.approvals.implementation;}
      delete s.verification;delete s.qualityReview;delete s.approvals.acceptance;break;
     }
     case 'create-spec':case 'save-spec':{
      validateRuleReferences(await baselineContext(root,s.affectedPaths||[]),input.ruleReferences);
      requireStage(s,'spec');await assertApprovals(root,s);const ctx=await generationContext(root,s);if(input.contextHash!==ctx.contextHash)throw Error('Generation context changed');const output=packageInput(input);
      if(input.action==='create-spec')await engine.createSpecChange({...ref,prd:await prd(root,s),generate:async()=>output});
      else{const dir=changeDir(root,id);if(!await exists(dir))throw Error('Create spec first');await atomic(dir,'proposal.md',output.proposal);await fs.rm(safe(dir,'specs'),{recursive:true,force:true});for(const [key,doc] of Object.entries(output.specs))await atomic(dir,`specs/${key}/spec.md`,doc);for(const name of ['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;s.taskEvidence={};}
      s.status='in-progress';break;
     }
     case 'submit-spec':{
      requireStage(s,'spec');await assertApprovals(root,s);const result=await engine.runSpecVerifyGate(ref);s.specReview=report(input.report);s.gate=result;
      if(!result.valid||s.specReview.issues.some(x=>x.severity==='critical')||s.specReview.unverified.length){s.status='blocked';break;}
      await pending(root,s,'spec');break;
     }
     case 'write-design':case 'write-tasks':{
      if(input.action==='write-design'){const reuse=await reuseContext(root);validateReuseDecisions(reuse,input.reuseDecisions);s.designReuseHash=reuse.fingerprint;s.reuseDecisions=input.reuseDecisions||[];}
      const baseline=await baselineContext(root,s.affectedPaths||[]);
      if(input.action==='write-design'){validateRuleReferences(baseline,input.ruleReferences);s.designBaselineHash=baseline.fingerprint;}
      const stage=input.action==='write-design'?'design':'tasks';requireStage(s,stage);await assertApprovals(root,s,{spec:true});const ctx=await generationContext(root,s);if(input.contextHash!==ctx.contextHash)throw Error('Generation context changed');requireText(input.document,'document');
      if(stage==='design'){await engine.generateDesignDoc({...ref,specReviewed:true,generate:async()=>input.document});s.designConstraintsHash=ctx.context.projectArchitecture.guidanceFingerprint;s.designStandardsHash=hash(ctx.context.projectArchitecture.standards);s.designInStarReferencesHash=ctx.context.instarReferences.fingerprint;s.stage='tasks';}
      else{if(taskItems(input.document).some(t=>t.done))throw Error('New tasks must be unchecked');await engine.generateTaskList({...ref,generate:async()=>input.document});s.stage='implementation';await pending(root,s,'implementation');}break;
     }
     case 'complete-task':{await completeTasks(root,s,[{taskId:input.taskId,evidence:input.evidence}]);break;}
     case 'complete-tasks':{await completeTasks(root,s,input.tasks);break;}
     case 'submit-implementation':{
      requireStage(s,'implementation');await assertApprovals(root,s,{spec:true,implementation:true});const items=taskItems(await read(changeDir(root,id),'tasks.md'));if(items.some(t=>!t.done||!s.taskEvidence[t.id]))throw Error('All tasks need completion evidence');s.stage='verification';s.status='in-progress';break;
     }
     case 'submit-quality-review':{
      requireStage(s,'verification');await assertApprovals(root,s,{spec:true,implementation:true});
      const reportPath=input.reportPath||input.fromReport;
      const qualityReview=input.report||(reportPath?await readWorkspaceJson(root,reportPath,'review report'):null);
      if(!qualityReview||typeof qualityReview!=='object'||!['PASS','WARN','PASS_WITH_WAIVERS'].includes(qualityReview.status))throw Error('A current PASS, WARN or PASS_WITH_WAIVERS quality-gate report is required');
      if(qualityReview.kind!=='quality-gate'||qualityReview.stable!==true||typeof qualityReview.snapshot?.fingerprint!=='string'||!qualityReview.snapshot.fingerprint.trim())throw Error('Quality-gate report must be stable and include a snapshot fingerprint');
      const reuse=await reuseContext(root);validateReuseReview(reuse,qualityReview.review?.reuseReview);await validateReusePlan(root,reuse,qualityReview.review?.reuseReview);
      const {validateQualityReviewReport}=await import('../quality-controller/index.mjs');
      const reviewedSource=await validateQualityReviewReport(root,qualityReview);
      s.qualityReview={reportId:qualityReview.id||qualityReview.reportId||null,status:qualityReview.status,snapshotFingerprint:qualityReview.snapshot.fingerprint,sourceSnapshot:reviewedSource,at:now()};
      break;
     }
     case 'submit-verification':{
      requireStage(s,'verification');await assertApprovals(root,s,{spec:true,implementation:true});await completed(root,s);const review=report(input.report);
      if(!Array.isArray(input.checks)||!input.checks.length)throw Error('Verification checks required');
      const checks=input.checks.map(checkRecord);
      if(!checks.some(check=>check.applicable))throw Error('At least one applicable verification check is required');
      if(!s.qualityReview)throw Error('Current quality-gate review is required before verification');
      const currentSource=await sourceSnapshot(root);
      assertCurrentSnapshot(s.qualityReview.sourceSnapshot,currentSource,'Quality-gate review');
      s.verification={report:review,checks,at:now()};
      s.verification.sourceSnapshot=currentSource;
      if(review.issues.some(x=>x.severity==='critical')||review.unverified.length||checks.some(x=>x.applicable&&x.outcome!=='passed'))s.status='blocked';else await pending(root,s,'acceptance');break;
     }
     case 'archive':{
      requireStage(s,'archive');await completed(root,s);await assertApprovals(root,s,{spec:true,implementation:true});if(s.approvals.acceptance?.hash!==await approvalHash(root,s,'acceptance'))throw Error('Acceptance missing or stale');if(!s.verification?.sourceSnapshot)throw Error('Verification source snapshot is missing; reopen implementation and verify again');
      const archiveSource=await sourceSnapshot(root);assertCurrentSnapshot(s.verification.sourceSnapshot,archiveSource,'Verification evidence');s.promotion=await engine.promoteToBaseline({...ref,accepted:true});s.status='completed';break;
     }
     case 'reopen':{
      const stage=input.stage;requireText(input.reason,'reason');const order=['prd','spec','design','tasks','implementation','verification','archive'];if(!order.includes(stage)||order.indexOf(stage)>order.indexOf(s.stage)||stage==='archive')throw Error('Invalid reopen stage');
      if(stage!=='prd')await assertApprovals(root,s,{spec:!['prd','spec'].includes(stage),implementation:['implementation','verification'].includes(stage)});
      const keep={prd:[],spec:['prd'],design:['prd','spec'],tasks:['prd','spec'],implementation:['prd','spec','implementation'],verification:['prd','spec','implementation']}[stage];for(const key of Object.keys(s.approvals))if(!keep.includes(key))delete s.approvals[key];
      const dir=changeDir(root,id);if(stage==='prd')await fs.rm(dir,{recursive:true,force:true});
      if(['spec','design','tasks'].includes(stage))for(const name of stage==='tasks'?['tasks.md','.tasks.json']:['technical-design.md','design.md','tasks.md','.review.json','.tasks.json'])await fs.rm(safe(dir,name),{force:true});
      if(['prd','spec','design','tasks'].includes(stage)){s.taskEvidence={};delete s.specReview;delete s.gate;}
      if(['prd','spec','design'].includes(stage)){delete s.designConstraintsHash;delete s.designStandardsHash;delete s.designInStarReferencesHash;}
      delete s.verification;delete s.qualityReview;clearPending(s);s.stage=stage;s.reopenReason=input.reason;if(stage==='prd'){s.clarifications=[];s.status='in-progress';}break;
     }
     default:throw Error(`Unknown action: ${input.action}`);
    }
   }
   s.version++;s.history.push({action:input.action,version:s.version,at:now(),stage:s.stage,status:s.status});await putJson(root,file,s);
   await appendJsonl(root,'.workflow/traces.jsonl',{type:'workflow-action',changeId:id,action:input.action,version:s.version,stage:s.stage,status:s.status,at:now()});
   if(s.status==='completed')await putJson(root,`planning/archive/${id}/workflow.json`,s);
   return s;
  },{writePaths:await workflowWritePaths(root,id,input.action)});
 });
}
