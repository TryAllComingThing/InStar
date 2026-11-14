import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run as workflowRun} from '../runtime/workflow-controller/index.mjs';
import {observeChangedSourcePaths} from '../runtime/workflow-controller/files.mjs';
import {approvalHash} from '../runtime/workflow-controller/documents.mjs';
import {run as qualityRun} from '../runtime/quality-controller/index.mjs';
import {deriveObservedImpact,effectiveUi} from '../runtime/shared/risk-policy.mjs';
import {validateVerificationLayers} from '../runtime/shared/verification-layers.mjs';
import {validatePreviewRuntime} from '../runtime/shared/preview-runtime.mjs';
import {normalizeUsage} from '../runtime/shared/usage-telemetry.mjs';

const changeId='phase3-change';

async function project(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'instar-phase3-')));
 await mkdir(path.join(root,'src'),{recursive:true});
 await mkdir(path.join(root,'planning/workflows'),{recursive:true});
 await mkdir(path.join(root,'planning/changes'),{recursive:true});
 await mkdir(path.join(root,'planning/specs'),{recursive:true});
 await mkdir(path.join(root,'docs/prd'),{recursive:true});
 await writeFile(path.join(root,'.instar.json'),JSON.stringify({schemaVersion:1},null,2)+'\n');
 await writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{}},null,2)+'\n');
 await writeFile(path.join(root,'src/app.js'),'export const value = 1;\n');
 return root;
}

async function start(root,extra={}){
 await workflowRun({action:'start',project:root,changeId,document:'# Phase 3 PRD\n',ui:false,stack:'backend',...extra});
 return JSON.parse(await readFile(path.join(root,'planning/workflows',`${changeId}.json`),'utf8'));
}

async function writeImplementationFixture(root,state,{source='src/Login.vue'}={}){
 const dir=path.join(root,'planning/changes',changeId);
 await mkdir(path.join(dir,'specs/search'),{recursive:true});
 await writeFile(path.join(dir,'proposal.md'),'## Why\nLogin and workbench.\n');
 await writeFile(path.join(dir,'specs/search/spec.md'),'## Requirements\nUsers can sign in.\n');
 await writeFile(path.join(dir,'technical-design.md'),'# Technical design\nUse the existing authentication boundary.\n');
 await writeFile(path.join(dir,'tasks.md'),'- [x] 1.1 Implement login and workbench\n');
 await writeFile(path.join(root,source),'<template><main>Login</main></template>\n');
 state.stage='implementation';
 state.status='in-progress';
 state.taskEvidence={'1.1':{evidence:{summary:'Implemented login',files:[{path:source,line:1}]},at:new Date().toISOString()}};
 state.designConstraintsHash='constraints-v1';
 state.designStandardsHash='standards-v1';
 state.designInStarReferencesHash='references-v1';
 for(const kind of ['prd','spec','design','tasks']){
  state.approvals[kind]={hash:await approvalHash(root,state,kind),binding:'document-v6',decision:'accept-record',recorded:true,at:new Date().toISOString()};
 }
 await writeFile(path.join(root,'planning/workflows',`${changeId}.json`),JSON.stringify(state,null,2)+'\n');
 return state;
}

function baseQualityConfig(checks,extra={}){
 return {schemaVersion:3,verification:{profiles:{commit:['build-check'],implementation:['build-check'],full:['build-check']},...extra},tools:{checks}};
}

test('observed UI source changes cannot bypass UI gates with ui:false',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const state=await start(root);
 assert.equal(state.ui,false);
 await writeImplementationFixture(root,state);
 await assert.rejects(workflowRun({action:'submit-implementation',project:root,changeId,expectedVersion:state.version}),/Observed UI changes require ui:true/);
 assert.equal(effectiveUi({ui:false,risk:{observedImpact:['ui']}}),true);
});

test('executable i18n login code is not treated as copy-only',()=>{
 const observed=deriveObservedImpact(['src/i18n/auth-login.js','src/locales/en-US.json']);
 assert.equal(observed.codeChanged,true);
 assert.equal(observed.impact.includes('authentication'),true);
 assert.equal(JSON.stringify(observed.impact)==='["copy"]',false);
});

test('full verification requires build even when intermediate layers are absent',()=>{
 const checks={'build-check':{kind:'build',command:process.execPath,args:['-e','process.exit(0)']},'test-check':{kind:'test',command:process.execPath,args:['-e','process.exit(0)']}};
 assert.throws(()=>validateVerificationLayers(baseQualityConfig({'test-check':checks['test-check']})),/build check/);
 assert.doesNotThrow(()=>validateVerificationLayers(baseQualityConfig(checks)));
});

test('intermediate cache persists argument hashes, never raw secrets',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const script=path.join(root,'check.mjs');
 await writeFile(script,"process.exit(0);\n");
 const checks={
  'affected-check':{kind:'test',command:process.execPath,args:[script,'--token=phase3-secret','{files}'],toolVersion:'fixture-1'},
  'unit-check':{kind:'test',command:process.execPath,args:[script],toolVersion:'fixture-1'},
  'build-check':{kind:'build',command:process.execPath,args:['-e','process.exit(0)'],toolVersion:'fixture-1'}
 };
 const config=baseQualityConfig(checks,{layers:{L1:['affected-check'],L2:['unit-check']},cache:{enabled:true,buildOutputs:['dist']}});
 config.verification.profiles={commit:['unit-check'],implementation:['affected-check','unit-check'],full:['build-check']};
 await writeFile(path.join(root,'.instar-quality.json'),JSON.stringify(config,null,2)+'\n');
 const report=await qualityRun({action:'frontend-verify',project:root,profile:'implementation',layer:'L1',files:['src/app.js']});
 assert.equal(report.status,'PASS',JSON.stringify(report));
 const cacheDir=path.join(root,'reports/cache/L1');
 const names=(await readdir(cacheDir)).filter(name=>name.endsWith('.json'));
 assert.equal(names.length,1);
 const text=await readFile(path.join(cacheDir,names[0]),'utf8');
 assert.doesNotMatch(text,/phase3-secret/);
 const cached=JSON.parse(text);
 assert.equal(typeof cached.components.command.argsHash,'string');
 assert.equal(cached.components.command.args,undefined);
});

test('preview command allowlist and environment injection fail closed',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const previous=process.env.INSTAR_HOOK_ALLOWED_COMMANDS;
 process.env.INSTAR_HOOK_ALLOWED_COMMANDS='node';
 t.after(()=>{if(previous===undefined)delete process.env.INSTAR_HOOK_ALLOWED_COMMANDS;else process.env.INSTAR_HOOK_ALLOWED_COMMANDS=previous;});
 assert.throws(()=>validatePreviewRuntime({command:'python3',args:[]}),/not allowed/);
 const checks={'build-check':{kind:'build',command:process.execPath,args:['-e','process.exit(0)'],toolVersion:'fixture-1'}};
 const config=baseQualityConfig(checks,{runtime:{command:'python3',args:['-m','http.server','{port}'],readyUrl:'http://127.0.0.1:{port}/',timeoutMs:1000}});
 await writeFile(path.join(root,'.instar-quality.json'),JSON.stringify(config,null,2)+'\n');
 const doctor=await qualityRun({action:'doctor',project:root});
 assert.equal(doctor.status,'BLOCK');
 assert.match(doctor.checks.find(check=>check.id==='quality-config').reason,/not allowed/);
 delete process.env.INSTAR_HOOK_ALLOWED_COMMANDS;
 assert.throws(()=>validatePreviewRuntime({command:process.execPath,args:[],env:{NODE_OPTIONS:'--require=./evil.js'}}),/forbidden/);
});

test('enforced workflows fail closed when usage evidence is missing',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const state=await start(root);
 await rm(path.join(root,'reports/usage',`${changeId}.json`));
 await assert.rejects(workflowRun({action:'submit-prd',project:root,changeId,expectedVersion:state.version}),/Usage report is missing/);
 await writeFile(path.join(root,'reports/usage',`${changeId}.json`),JSON.stringify({changeId:'other-change',records:[],totals:{inputTokens:0,outputTokens:0,totalTokens:0},apiCalls:0}));
 await assert.rejects(workflowRun({action:'submit-prd',project:root,changeId,expectedVersion:state.version}),/changeId does not match/);
 await writeFile(path.join(root,'reports/usage',`${changeId}.json`),JSON.stringify({changeId,records:null,totals:{inputTokens:0,outputTokens:0,totalTokens:0},apiCalls:0}));
 await assert.rejects(workflowRun({action:'submit-prd',project:root,changeId,expectedVersion:state.version}),/records are missing/);
 await writeFile(path.join(root,'reports/usage',`${changeId}.json`),JSON.stringify({changeId,records:[],totals:{inputTokens:0,outputTokens:0,totalTokens:0},apiCalls:0}));
 await assert.rejects(workflowRun({action:'set-usage-budget',project:root,changeId,expectedVersion:state.version,reason:'oops'}),/usageBudget is required/);
 const cleared=await workflowRun({action:'set-usage-budget',project:root,changeId,expectedVersion:state.version,usageBudget:null,reason:'Explicit fixture authorization',authorization:'phase3-test'});
 assert.equal(cleared.usageBudget,null);
});

test('all active enforced workflows are budget-checked, not only the latest',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 await start(root);
 const older=JSON.parse(await readFile(path.join(root,'planning/workflows',`${changeId}.json`),'utf8'));
 older.changeId='older-enforced';
 older.history=[{at:'2026-01-01T00:00:00.000Z',action:'start'}];
 older.usageBudget={maxTokens:1,enforce:true};
 delete older.version;
 await writeFile(path.join(root,'planning/workflows/older-enforced.json'),JSON.stringify(older,null,2)+'\n');
 const newest=JSON.parse(await readFile(path.join(root,'planning/workflows',`${changeId}.json`),'utf8'));
 newest.history=[{at:'2026-02-01T00:00:00.000Z',action:'start'}];
 newest.usageBudget=null;
 await writeFile(path.join(root,'planning/workflows',`${changeId}.json`),JSON.stringify(newest,null,2)+'\n');
 await assert.rejects(qualityRun({action:'local-verify',project:root,profile:'commit'}),/Usage report is missing for enforced workflow older-enforced/);
 await mkdir(path.join(root,'reports/usage'),{recursive:true});
 await writeFile(path.join(root,'reports/usage/older-enforced.json'),JSON.stringify({changeId:'older-enforced',records:[],totals:{inputTokens:2,outputTokens:0,totalTokens:2},apiCalls:1,budget:{status:'within'}}));
 await assert.rejects(qualityRun({action:'local-verify',project:root,profile:'commit'}),/Usage budget exceeded for older-enforced/);
});

test('usage records are monotonic for the same identity',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 await start(root);
 const identity={project:root,changeId,action:'record-usage',source:'agent-session',sessionId:'session-1',apiCalls:1};
 const first=await workflowRun({...identity,usage:{inputTokens:100,cachedInputTokens:20,outputTokens:30,totalTokens:130}});
 assert.equal(first.totals.billableTokens,110);
 await assert.rejects(workflowRun({...identity,usage:{inputTokens:50,cachedInputTokens:0,outputTokens:20,totalTokens:70}}),/may only increase/);
});

test('Codex session usage imports parent and subagent records with billable totals',async t=>{
 const root=await project(),sessions=await mkdtemp(path.join(os.tmpdir(),'instar-phase3-sessions-'));
 t.after(async()=>{await rm(root,{recursive:true,force:true});await rm(sessions,{recursive:true,force:true});});
 await start(root);
 const rootMeta={timestamp:'2026-11-04T01:00:00.000Z',type:'session_meta',payload:{id:'root-session-1'}};
 const rootUsage={timestamp:'2026-11-04T01:00:01.000Z',type:'token_usage_record',payload:{response_id:'root-response',usage:{input_tokens:100,cached_input_tokens:20,output_tokens:30,reasoning_output_tokens:10,total_tokens:130}}};
 const childMeta={timestamp:'2026-11-04T01:01:00.000Z',type:'session_meta',payload:{id:'rollout-child-session-1',parent_thread_id:'rollout-root-session-1',source:{subagent:{thread_spawn:{agent_role:'reviewer'}}}}};
 const childUsage={timestamp:'2026-11-04T01:01:01.000Z',type:'token_usage_record',payload:{response_id:'child-response',usage:{input_tokens:50,cached_input_tokens:0,output_tokens:20,reasoning_output_tokens:5,total_tokens:70}}};
 await writeFile(path.join(sessions,'rollout-root-session-1.jsonl'),[rootMeta,rootUsage].map(JSON.stringify).join('\n')+'\n');
 await writeFile(path.join(sessions,'rollout-child-session-1.jsonl'),[childMeta,childUsage].map(JSON.stringify).join('\n')+'\n');
 const result=await workflowRun({action:'import-session-usage',project:root,changeId,sessionId:'root-session-1',sessionsRoot:sessions});
 assert.equal(result.status,'PASS');
 assert.equal(result.telemetry.sessions.length,2);
 assert.equal(result.usage.records.length,2);
 assert.equal(result.usage.totals.totalTokens,200);
 assert.equal(result.usage.totals.billableTokens,180);
 assert.equal(result.usage.byAgent.reviewer.billableTokens,70);
});

test('non-Git projects remain usable with workspace baselines',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const state=await start(root);
 assert.equal(state.stage,'prd');
 const initial=await observeChangedSourcePaths(root,{changeId});
 assert.equal(initial.mode,'baseline');
 assert.deepEqual(initial.paths,[]);
 await writeFile(path.join(root,'src/Login.vue'),'<template><main>Login</main></template>\n');
 const observed=await observeChangedSourcePaths(root,{changeId});
 assert.equal(observed.mode,'baseline');
 assert.deepEqual(observed.paths,['src/Login.vue']);
 assert.equal(deriveObservedImpact(observed.paths).impact.includes('ui'),true);
});

test('doctor reports workflow adoption gaps without pretending they are healthy',async t=>{
 const root=await project();
 t.after(()=>rm(root,{recursive:true,force:true}));
 const checks={'build-check':{kind:'build',command:process.execPath,args:['-e','process.exit(0)'],toolVersion:'fixture-1'}};
 await writeFile(path.join(root,'.instar-quality.json'),JSON.stringify(baseQualityConfig(checks),null,2)+'\n');
 await writeFile(path.join(root,'planning/workflows/legacy.json'),JSON.stringify({schemaVersion:5,changeId:'legacy',status:'in-progress',ui:false,stack:'backend',usageBudget:{maxApiCalls:10,enforce:true}},null,2)+'\n');
 const doctor=await qualityRun({action:'doctor',project:root});
 const adoption=doctor.checks.find(check=>check.id==='workflow-adoption');
 assert.equal(adoption.status,'WARN');
 assert.deepEqual(adoption.legacySchemas,['legacy']);
 assert.deepEqual(adoption.legacyBudgets,['legacy']);
 assert.deepEqual(adoption.missingUsageReports,['legacy']);
});

test('billable tokens exclude cached input and include output',()=>{
 const usage=normalizeUsage({inputTokens:100,cachedInputTokens:20,outputTokens:30,reasoningOutputTokens:10,totalTokens:130});
 assert.equal(usage.billableTokens,110);
 assert.equal(usage.totalTokens,130);
});
