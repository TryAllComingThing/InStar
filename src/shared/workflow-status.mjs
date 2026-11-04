import {promises as fs} from 'node:fs';
import path from 'node:path';
import {sourceSnapshot,snapshotIdentity} from './source-snapshot.mjs';
import {summarizeEfficiency} from './efficiency.mjs';

const workflowDir='planning/workflows';
const nextStages={prd:'submit-prd',spec:'submit-spec',design:'write-design',tasks:'write-tasks',implementation:'submit-implementation',verification:'submit-verification',archive:'archive'};

async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function exists(file){try{await fs.lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function stateFiles(root){const dir=path.join(root,workflowDir);if(!await exists(dir))return [];return (await fs.readdir(dir,{withFileTypes:true})).filter(item=>item.isFile()&&item.name.endsWith('.json')).map(item=>path.join(dir,item.name));}
async function taskSummary(root,changeId){
 const target=path.join(root,'planning/changes',changeId,'tasks.md');
 if(!await exists(target))return {total:0,completed:0,next:null};
 const text=await fs.readFile(target,'utf8'),items=[...text.matchAll(/^- \[( |x|X)\]\s+(\d+\.\d+)\s+(.+)$/gm)].map(match=>({id:match[2],done:match[1].toLowerCase()==='x',text:`${match[2]} ${match[3].trim()}`}));
 const remaining=items.filter(item=>!item.done).slice(0,20).map(item=>({id:item.id,text:item.text}));
 return {total:items.length,completed:items.filter(item=>item.done).length,next:items.find(item=>!item.done)?.text||null,remaining};
}
async function traceSummary(root,changeId){
 const file=path.join(root,'.workflow/traces.jsonl');if(!await exists(file))return {open:[],all:[]};
 const records=(await fs.readFile(file,'utf8')).split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 const relevant=records.filter(record=>record.changeId===changeId),open=new Map();
 for(const record of relevant){
  if(record.type!=='skill-invocation')continue;
  if(record.event==='started')open.set(record.invocationId,record);
  else if(['completed','failed'].includes(record.event))open.delete(record.invocationId);
 }
 return {open:[...open.values()].slice(-20),all:relevant};
}
function requestFor(state,action,extra={}){
 return {controller:'workflow',project:undefined,changeId:state.changeId,action,expectedVersion:state.version,...extra};
}
function nextAction(state,tasks,quality,verification,efficiency=null){
 if(!state)return {action:'start',reason:'No tracked workflow exists',request:{controller:'workflow',action:'start',requiredInput:['project','changeId','document']}};
 if(state.status==='completed')return {action:null,reason:'Workflow is archived and immutable',request:null};
 if(state.pendingApproval){
  const request=requestFor(state,'approve',{reviewHash:state.pendingReview?.hash,intentId:state.pendingReview?.intentId,challenge:state.pendingReview?.challenge,subjectHash:state.pendingReview?.subjectHash});
  return {action:'approve',reason:`Awaiting human ${state.pendingApproval} review`,request};
 }
 if(state.status==='waiting-clarification')return {action:'answer-clarification',reason:'Open clarification blocks transitions',request:requestFor(state,'answer-clarification',{requiredInput:['answers']})};
 if(state.stage==='implementation'){
  if(tasks.total&&tasks.completed<tasks.total)return {action:'complete-tasks',reason:`${tasks.total-tasks.completed} task(s) still need evidence; submit them in one batch`,request:requestFor(state,'complete-tasks',{requiredInput:['tasks'],remainingTaskIds:(tasks.remaining||[]).map(item=>item.id)})};
  return {action:'submit-implementation',reason:'Implementation tasks are complete',request:requestFor(state,'submit-implementation')};
 }
 if(state.stage==='verification'){
  if(!quality||quality.stale)return {action:'quality-gate',reason:quality?.stale?'Quality review source is stale':'No current quality-gate review is bound',request:{controller:'quality',project:undefined,action:'quality-gate',changeId:state.changeId,requiredInput:['review'] }};
  if(!verification)return {action:'submit-verification',reason:'Quality review is current; verification evidence is missing',request:requestFor(state,'submit-verification',{requiredInput:['report','checks']})};
  return {action:'submit-verification',reason:'Verification is blocked; resolve failed or unverified checks and submit fresh evidence',request:requestFor(state,'submit-verification',{requiredInput:['report','checks']})};
 }
 if(state.stage==='archive')return {action:'archive',reason:'Acceptance is approved; archive the workflow',request:requestFor(state,'archive')};
 const action=nextStages[state.stage];
 const next={action,reason:`Continue the ${state.stage} stage`,request:requestFor(state,action)};
 if(efficiency?.status==='over-budget')next.warning={code:'EFFICIENCY_BUDGET_EXCEEDED',message:'The workflow exceeded its lane budget. Finish the current path without adding duplicate reviews or rerunning cached evidence.',exceeded:efficiency.exceeded};
 return next;
}

export async function inspectWorkflow(root,{changeId=null}={}){
 const files=[];
 for(const file of await stateFiles(root)){
  try{files.push({file,state:await readJson(file),mtime:(await fs.stat(file)).mtimeMs});}catch(error){throw Error(`Invalid workflow state ${path.basename(file)}: ${error.message}`);}
 }
 const selected=changeId?files.find(item=>item.state.changeId===changeId):files.sort((left,right)=>right.mtime-left.mtime)[0];
 if(changeId&&!selected)throw Error(`Unknown workflow change: ${changeId}`);
 const state=selected?.state||null,currentSource=await sourceSnapshot(root);
 if(!state)return {status:'PASS',changes:[],change:null,next:nextAction(null,{total:0,completed:0,next:null},null,null),source:{treeHash:snapshotIdentity(currentSource)}};
 const tasks=await taskSummary(root,state.changeId),traces=await traceSummary(root,state.changeId),efficiency=summarizeEfficiency({state,traces:traces.all});
 const quality=state.qualityReview?{reportId:state.qualityReview.reportId||null,status:state.qualityReview.status,snapshotFingerprint:state.qualityReview.snapshotFingerprint||null,stale:snapshotIdentity(state.qualityReview.sourceSnapshot)!==snapshotIdentity(currentSource)}:null;
 const verification=state.verification?{at:state.verification.at||null,status:state.verification.report?.status||null,checks:(state.verification.checks||[]).map(check=>({name:check.name,kind:check.kind,outcome:check.outcome,applicable:check.applicable}))}:null;
 const next=nextAction(state,tasks,quality,verification,efficiency);
 if(efficiency?.status==='over-budget'&&!next.warning)next.warning={code:'EFFICIENCY_BUDGET_EXCEEDED',message:'The workflow exceeded its lane budget. Finish the current path without adding duplicate reviews or rerunning cached evidence.',exceeded:efficiency.exceeded};
 if(efficiency?.status==='insufficient-telemetry'&&!next.warning)next.warning={code:'EFFICIENCY_TELEMETRY_MISSING',message:'Efficiency telemetry is incomplete; do not treat missing values as zero usage or within-budget.',missingMetrics:efficiency.missingMetrics};
 if(next.request&&next.request.project===undefined)next.request.project=root;
 return {
  status:'PASS',
  change:{changeId:state.changeId,stage:state.stage,status:state.status,version:state.version,pendingApproval:state.pendingApproval||null,pendingReview:state.pendingReview||null,risk:state.risk||null,governance:{lineageId:state.lineageId||null,evidenceEpoch:state.evidenceEpoch||null,generationId:state.generationId||null,baselineHash:state.designBaselineHash||null,reuseHash:state.designReuseHash||null,contextManifestHash:state.designContextManifestHash||null,evidenceGraph:state.evidenceGraph||null}},
  changes:files.map(item=>({changeId:item.state.changeId,stage:item.state.stage,status:item.state.status,version:item.state.version})).sort((left,right)=>left.changeId.localeCompare(right.changeId)),
  tasks,quality,verification,efficiency,openTraces:traces.open,source:{treeHash:snapshotIdentity(currentSource)},next
 };
}

export async function helpInfo(pluginRoot){
 let version='unknown';
 try{version=(await readJson(path.join(pluginRoot,'.codex-plugin/plugin.json'))).version||version;}catch{}
 return {
  status:'PASS',version,
  commands:[
   {command:'instar status [--project <path>] [--change <id>]',purpose:'Show workflow stage, review bindings, tasks and open traces'},
   {command:'instar next [--project <path>] [--change <id>]',purpose:'Show the next legal workflow action and request payload'},
   {command:'instar flow context [--change <id>] [--json]',purpose:'Show fresh workflow context, applicable standards and reuse/baseline inputs'},
   {command:'instar flow start --change <id> --document <file|-> [--lane micro|quick|fast|standard|regulated]',purpose:'Start a workflow with a risk-aware cost lane'},
   {command:'instar flow action <action> [--input <request.json>] [--dry-run]',purpose:'Run any workflow action through the friendly command layer'},
   {command:'instar doc show [--kind prd|proposal|spec|design|tasks|all]',purpose:'Read the current or selected workflow document'},
   {command:'instar find reuse|standards|architecture|spec [options]',purpose:'Discover reusable capabilities, project standards, architecture context or existing specs'},
   {command:'instar standards context|check [options]',purpose:'Inspect applicable standards or validate a design Compliance Matrix'},
   {command:'instar cost show|lanes [--json]',purpose:'Show lane budgets, observed usage and missing telemetry'},
   {command:'instar explain',purpose:'Explain standards precedence, cost lanes and convenience commands'},
   {command:'instar snapshot [--project <path>]',purpose:'Print the current repository snapshot'},
   {command:'instar verify [--profile commit|full] [--risk L0-L3] [--project <path>]',purpose:'Run configured verification'},
   {command:'instar review init [--output reports/review.json] [--reviewer <id>] [--force]',purpose:'Create a pending snapshot-bound review template without inventing PASS evidence'},
   {command:'instar review repair --review-file reports/review.json [--reviewer <id>]',purpose:'Add missing review items, refresh the template fingerprint and downgrade stale PASS placeholders'},
   {command:'instar review --review-file <path> [--project <path>]',purpose:'Submit a quality review against the current snapshot'},
   {command:'instar ci prepare|publish|status [options]',purpose:'Prepare, publish or inspect CI and PR evidence'}
  ]
 };
}
