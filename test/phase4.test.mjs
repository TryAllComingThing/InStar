import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run as workflowRun} from '../runtime/workflow-controller/index.mjs';
import {sourceSnapshot,withSnapshotSession} from '../runtime/workflow-controller/files.mjs';
import {approvalHash} from '../runtime/workflow-controller/documents.mjs';
import {run as qualityRun} from '../runtime/quality-controller/index.mjs';
import {hasUnresolvedFindings,validateReviewFinding} from '../runtime/shared/review-findings.mjs';

const changeId='phase4-change';
async function project(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'instar-phase4-')));
 await mkdir(path.join(root,'src'),{recursive:true});
 await mkdir(path.join(root,'planning/workflows'),{recursive:true});
 await mkdir(path.join(root,'planning/changes',changeId,'specs/search'),{recursive:true});
 await mkdir(path.join(root,'planning/specs'),{recursive:true});
 await mkdir(path.join(root,'docs/prd'),{recursive:true});
 await writeFile(path.join(root,'.instar.json'),JSON.stringify({schemaVersion:1},null,2)+'\n');
 await writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{}},null,2)+'\n');
 await writeFile(path.join(root,'src/app.js'),'export const value = 1;\n');
 return root;
}

async function approveDocuments(root,state){
 await writeFile(path.join(root,'docs/prd',`${changeId}.md`),'# PRD\nApproved outcome.\n');
 await writeFile(path.join(root,'planning/changes',changeId,'proposal.md'),'## Why\nApproved outcome.\n');
 await writeFile(path.join(root,'planning/changes',changeId,'specs/search/spec.md'),'## Requirements\nApproved behavior.\n');
 await writeFile(path.join(root,'planning/changes',changeId,'technical-design.md'),'# Technical design\nUse the existing boundary.\n');
 await writeFile(path.join(root,'planning/changes',changeId,'tasks.md'),'- [ ] 1.1 Implement login\n- [ ] 1.2 Implement workbench\n');
 for(const kind of ['prd','spec','design','tasks']){
  state.approvals[kind]={hash:await approvalHash(root,state,kind),binding:'document-v6',decision:'accept-record',recorded:true,at:new Date().toISOString()};
 }
 return state;
}

function baseState(extra={}){
 return {
  schemaVersion:6,
  changeId,
  prdPath:`docs/prd/${changeId}.md`,
  stage:'implementation',
  status:'in-progress',
  pendingApproval:null,
  pendingReview:null,
  approvals:{},
  taskEvidence:{},
  clarifications:[],
  version:0,
  history:[],
  ui:false,
  stack:'backend',
  designCheck:null,
  usageBudget:{maxBillableTokens:6_000_000,maxApiCalls:1200,enforce:false},
  reviewerPolicy:{allowMainAgentFallback:false,maxRoundsPerRoleStage:3},
  evidencePolicy:{mode:'manual'},
  designConstraintsHash:'constraints-v1',
  designStandardsHash:'standards-v1',
  designInStarReferencesHash:'references-v1',
  ...extra
 };
}

async function writeState(root,state){
 await writeFile(path.join(root,'planning/workflows',`${changeId}.json`),JSON.stringify(state,null,2)+'\n');
}

test('schema 6 rejects single-task completion while a batch remains',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const state=await approveDocuments(root,baseState());
 await writeState(root,state);
 await assert.rejects(workflowRun({action:'complete-task',project:root,changeId,expectedVersion:0,taskId:'1.1',evidence:{summary:'login',files:[{path:'src/app.js'}]}}),/complete-tasks/);
 const result=await workflowRun({action:'complete-tasks',project:root,changeId,expectedVersion:0,tasks:[
  {taskId:'1.1',evidence:{summary:'login',files:[{path:'src/app.js'}]}},
  {taskId:'1.2',evidence:{summary:'workbench',files:[{path:'src/app.js'}]}}
 ]});
 assert.equal(result.lastTaskBatch.count,2);
 assert.match(await readFile(path.join(root,'planning/changes',changeId,'tasks.md'),'utf8'),/- \[x\] 1\.2/);
});

test('source-only design/tasks reopen is redirected to refresh-evidence',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const state=await approveDocuments(root,baseState({implementationReview:{sourceHash:'old'}}));
 await writeState(root,state);
 await assert.rejects(workflowRun({action:'reopen',project:root,changeId,expectedVersion:0,stage:'tasks',reason:'Source-only change'}),/refresh-evidence/);
 const refreshed=await workflowRun({action:'refresh-evidence',project:root,changeId,expectedVersion:0,reason:'Source-only change'});
 assert.equal(refreshed.stage,'implementation');
});

test('request snapshot session reuses one snapshot per action',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const first=await sourceSnapshot(root),second=await sourceSnapshot(root);
 assert.notEqual(first,second);
 const cached=await withSnapshotSession(async()=>[await sourceSnapshot(root),await sourceSnapshot(root)]);
 assert.equal(cached[0],cached[1]);
});

test('fresh workflows keep a single trace write',async t=>{
 const root=await project();
 const traceId='trace-change';
 t.after(()=>rm(root,{recursive:true,force:true}));
 await workflowRun({action:'start',project:root,changeId:traceId,document:'# PRD\nTrace fixture.\n',ui:false,stack:'backend'});
 await access(path.join(root,`.workflow/traces/${traceId}.jsonl`));
 await assert.rejects(access(path.join(root,'.workflow/traces.jsonl')),{code:'ENOENT'});
});

function qualityConfig(){
 return {
  schemaVersion:3,
  verification:{
   profiles:{commit:['build-check'],implementation:['affected-test'],full:['build-check','all-test']},
   layers:{L1:['affected-test'],L2:['all-test']},
   cache:{enabled:true,buildOutputs:[]}
  },
  tools:{checks:{
   'build-check':{kind:'build',command:process.execPath,args:['-e','process.exit(0)'],toolVersion:'fixture-1'},
   'affected-test':{kind:'test',command:process.execPath,args:['-e','process.exit(0)'],incremental:true,toolVersion:'fixture-1'},
   'all-test':{kind:'test',command:process.execPath,args:['-e','process.exit(0)'],toolVersion:'fixture-1'}
  }}
 };
}

test('L1 cache key ignores unrelated changed files',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'.instar-quality.json'),JSON.stringify(qualityConfig(),null,2)+'\n');
 const first=await qualityRun({action:'engineering-verify',project:root,profile:'implementation',layer:'L1',files:['src/app.js']});
 assert.equal(first.cache.hits,0);
 await writeFile(path.join(root,'src/unrelated.js'),'export const unrelated = true;\n');
 const second=await qualityRun({action:'engineering-verify',project:root,profile:'implementation',layer:'L1',files:['src/app.js']});
 assert.equal(second.cache.hits,1);
 assert.equal(second.checks[0].cacheHit,true);
});

test('warning dispositions are validated and only accept warnings',()=>{
 const warning={severity:'warning',message:'Missing error state'};
 assert.equal(hasUnresolvedFindings([warning]),true);
 assert.equal(hasUnresolvedFindings([{...warning,disposition:{decision:'accepted',reason:'Tracked in backlog',owner:'product-owner',expiresAt:'2099-12-31'}}]),false);
 assert.equal(hasUnresolvedFindings([{...warning,severity:'critical',disposition:{decision:'accepted',reason:'Still blocking',owner:'product-owner',expiresAt:'2099-12-31'}}]),true);
 assert.equal(hasUnresolvedFindings([{...warning,disposition:{decision:'accepted',reason:'Expired',owner:'product-owner',expiresAt:'2000-01-01'}}]),true);
 assert.throws(()=>validateReviewFinding({...warning,disposition:{decision:'accepted'}}),/disposition\.reason|disposition\.owner|disposition\.expiresAt/);
});
