import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {initialEfficiency,laneDefinition,recommendedLane,summarizeEfficiency,validateMetrics} from '../runtime/shared/efficiency.mjs';
import {loadStandardsIndex,parseStandardSections,selectStandards} from '../runtime/shared/standards-index.mjs';
import {loadSkillsIndex,selectSkills} from '../runtime/shared/skills-index.mjs';
import {inspectWorkflow} from '../runtime/shared/workflow-status.mjs';
import {run} from '../runtime/workflow-controller/index.mjs';

const proposal='## Why\nUsers need secure OA access.\n## What Changes\nAdd login and homepage.\n## Capabilities\nlogin,homepage\n## Impact\nVue frontend and Python API.';
const delta='## Purpose\nAllow authorized employees to sign in and reach the OA homepage.\n## ADDED Requirements\n### Requirement: Secure login\nThe system SHALL authenticate employees and reject invalid credentials.\n#### Scenario: Valid login\n- **WHEN** valid credentials are submitted\n- **THEN** the homepage is available.\n';
const design='## Context\nOA login and homepage.\n## Goals / Non-Goals\nSecure access; no unrelated features.\n## Decisions\nUse the existing API and Vue layout.\n## Project Constraints\nFollow project authentication rules.\n## Architecture\nVue client calls a Python authentication API.\n## File Change Plan\nUpdate frontend/src/views/Login.vue and backend/app/api/auth.py.\n## Risks / Trade-offs\nCredential handling and authorization.\n## Migration Plan\nAdditive rollout.';
const localReuse=[{need:'OA login and homepage implementation search',searched:['frontend','backend'],candidates:[],decision:'local-new',reason:'No capability inventory is configured',verification:'Focused frontend and backend checks'}];
const report={summary:'Reviewed the OA login and homepage change.',source:'efficiency fixture',issues:[],unverified:[]};

function git(project,...args){const result=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;}
async function workflowFixture(t){
 const project=await fsRealpath(await mkdtemp(path.join(tmpdir(),'instar-efficiency-')));t.after(()=>rm(project,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 await mkdir(path.join(project,'frontend/src/views'),{recursive:true});await mkdir(path.join(project,'backend/app/api'),{recursive:true});
 await writeFile(path.join(project,'frontend/src/views/Login.vue'),'<template><form>Login</form></template>\n');
 await writeFile(path.join(project,'backend/app/api/auth.py'),'def login():\n    return None\n');
 git(project,'init','-b','main');git(project,'config','user.email','efficiency@example.invalid');git(project,'config','user.name','Efficiency test');git(project,'add','.');git(project,'commit','-m','fixture baseline');
 const base={project,changeId:'oa-login'};let state;
 return {project,base,get state(){return state;},async call(action,extra={}){if(action==='write-design'&&extra.reuseDecisions===undefined)extra={...extra,reuseDecisions:localReuse};const result=await run({...base,action,expectedVersion:state?.version,...extra});if(result.version)state=result;return result;},async context(extra={}){return run({...base,action:'context',...extra});},async approve(){return this.call('approve',{reviewHash:state.pendingReview.hash,intentId:state.pendingReview.intentId,challenge:state.pendingReview.challenge,confirmation:{text:'Approved fixture',source:'test only'}});}};
}
const fsRealpath=path=>import('node:fs/promises').then(fs=>fs.realpath(path));

test('efficiency lanes expose explicit response, tool, browser and token budgets',()=>{
 const fast=laneDefinition('fast');
 assert.deepEqual(fast.targetMinutes,[30,38]);
 assert.equal(fast.budgets.totalTokens,28000000);
 assert.equal(fast.budgets.modelResponses,120);
 assert.equal(fast.budgets.toolCalls,180);
 assert.equal(fast.budgets.browserActions,24);
 assert.equal(fast.budgets.semanticEvaluations,4);
 assert.throws(()=>validateMetrics({toolCalls:-1}),/Invalid efficiency metric/);
});

test('efficiency summaries aggregate terminal traces and warn on active rather than waiting time',()=>{
 const now=new Date('2026-11-03T12:00:00.000Z');
 const state={changeId:'oa-login',status:'in-progress',efficiency:initialEfficiency({lane:'fast',startedAt:'2026-11-03T10:00:00.000Z'})};
 const traces=[
  {type:'skill-invocation',changeId:'oa-login',invocationId:'a',event:'started',stage:'design',skill:'spec-design',metrics:{modelResponses:999}},
  {type:'skill-invocation',changeId:'oa-login',invocationId:'a',event:'completed',stage:'design',skill:'spec-design',bytes:2048,metrics:{durationMs:40*60*1000,modelResponses:121,toolCalls:181,inputTokens:15000000,outputTokens:5000000,browserActions:25}},
 ];
 const summary=summarizeEfficiency({state,traces,now});
 assert.equal(summary.usage.modelResponses,121);assert.equal(summary.usage.totalTokens,20000000);
 assert.equal(summary.usage.activeMs,40*60*1000);assert.equal(summary.usage.elapsedMs,120*60*1000);assert.equal(summary.usage.waitMs,80*60*1000);
 assert.equal(summary.status,'over-budget');
 assert.ok(summary.exceeded.some(item=>item.metric==='activeMinutes'));
 assert.ok(!summary.exceeded.some(item=>item.metric==='elapsedMinutes'));
 assert.ok(summary.exceeded.some(item=>item.metric==='modelResponses'));
 assert.equal(summary.observedBytes,2048);
 assert.equal(summary.observedBytesStatus,'observed');
 assert.equal(summary.byStage.design.usage.modelResponses,121);
 assert.equal(summary.byStage.design.usage.totalTokens,20000000);
 assert.equal(summary.bySkill['spec-design'].usage.toolCalls,181);
});

test('missing telemetry is reported as insufficient, never as zero or within-budget',()=>{
 const state={changeId:'oa-login',status:'in-progress',efficiency:initialEfficiency({lane:'fast',startedAt:'2026-11-03T10:00:00.000Z'})};
 const summary=summarizeEfficiency({state,traces:[],now:new Date('2026-11-03T12:00:00.000Z')});
 assert.equal(state.efficiency.metrics.totalTokens,null);
 assert.equal(summary.status,'insufficient-telemetry');
 assert.equal(summary.usage.totalTokens,null);
 assert.equal(summary.usage.modelResponses,null);
 assert.equal(summary.usage.activeMs,null);
 assert.equal(summary.observedBytes,null);
 assert.equal(summary.observedBytesStatus,'missing');
 assert.ok(summary.missingMetrics.includes('totalTokens'));
 assert.ok(summary.missingMetrics.includes('modelResponses'));
});

test('recommended lanes respect built-in and project risk floors',async t=>{
 assert.equal(recommendedLane({affectedPaths:['frontend/src/views/Login.vue']}),'fast');
 assert.equal(recommendedLane({affectedPaths:['backend/app/api/orders.py']}),'standard');
 assert.equal(recommendedLane({affectedPaths:['backend/auth/login.py']}),'regulated');
 assert.equal(recommendedLane({affectedPaths:['python/app/routers/auth.py']}),'regulated');
 assert.equal(recommendedLane({affectedPaths:['docs/ops/runbook.md'],riskPolicy:{rules:[{riskLevel:'L3',patterns:['docs/ops/**']}]}}),'regulated');
 const f=await workflowFixture(t);
 await assert.rejects(f.call('start',{lane:'fast',affectedPaths:['backend/auth/login.py'],document:'# PRD\nSecure login.'}),/risk-aware minimum regulated/);
 const started=await f.call('start',{affectedPaths:['backend/auth/login.py'],document:'# PRD\nSecure login.'});
 assert.equal(started.efficiency.lane,'regulated');assert.equal(started.efficiency.riskFloor,'regulated');
});

test('project architecture bounds AGENTS by nearest-first byte budget',async t=>{
 const f=await workflowFixture(t);
 await writeFile(path.join(f.project,'AGENTS.md'),`# Root guidance\n${'R'.repeat(1000)}`);
 await writeFile(path.join(f.project,'frontend/src/views/AGENTS.md'),`# Nearest guidance\n${'N'.repeat(20000)}`);
 await mkdir(path.join(f.project,'docs/archive/remote'),{recursive:true});
 await writeFile(path.join(f.project,'docs/archive/remote/AGENTS.md'),`# Distant guidance\n${'X'.repeat(20000)}`);
 for(let index=0;index<4;index++){const dir=path.join(f.project,`packages/module-${index}`);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'AGENTS.md'),`# Module ${index}\n${'M'.repeat(12000)}`);}
 await f.call('start',{document:'# PRD\nBounded guidance.',affectedPaths:['frontend/src/views/Login.vue']});await f.call('submit-prd');await f.approve();
 const context=await f.context(),architecture=context.context.projectArchitecture;
 assert.ok(architecture.guidanceBudget.totalBytes<=architecture.guidanceBudget.maxTotalBytes);
 assert.ok(Object.hasOwn(architecture.guidance,'AGENTS.md'));
 assert.ok(Object.hasOwn(architecture.guidance,'frontend/src/views/AGENTS.md'));
 assert.equal(architecture.guidanceTruncated,true);
 assert.ok(architecture.guidanceBudget.omittedCount>0||architecture.guidanceBudget.included.some(item=>item.truncated));
 assert.ok(!Object.hasOwn(architecture.guidance,'docs/archive/remote/AGENTS.md'));
});

test('Policy Pack selects a small Vue/Python/security card set without full bodies',async()=>{
 const index=await loadStandardsIndex();
 const pack=await selectStandards({affectedPaths:['frontend/src/views/Login.vue','backend/app/api/auth.py'],context:'OA login homepage Vue 3 Python API password token authorization browser test',stage:'design'});
 const ids=pack.selected.map(item=>item.id);
 assert.ok(pack.selected.length<=index.maxSelected);
 assert.ok(pack.budget.inlineBytes<=index.maxInlineBytes);
 assert.ok(ids.includes('language.vue3')&&ids.includes('language.python')&&ids.includes('api.security')&&ids.includes('common.testing'));
 assert.ok(ids.includes('architecture.overview'));
 assert.ok(pack.mandatory.includes('architecture.overview'));
 assert.equal(pack.selected.find(item=>item.id==='architecture.overview').mandatory,true);
 assert.ok(pack.selected.every(item=>item.appliesTo.length>0));
 assert.ok(!ids.some(id=>/language\.(go|rust|java)/.test(id)));
 assert.ok(pack.selected.every(item=>item.detailLoaded===false&&!('content' in item)&&item.summary.length<=500));
 assert.ok(pack.selected.every(item=>item.sections.length>0&&item.sectionCount>=item.sections.length&&item.ruleRefs.every(ref=>ref.startsWith(`${item.id}#`))));
 const sectioned=await readFile(path.join(process.cwd(),'standards/api/INTERFACE-DESIGN.md'),'utf8');
 const sections=parseStandardSections(sectioned);
 assert.ok(sections.length>1);
 for(const section of sections){assert.ok(section.startLine<=section.endLine);assert.ok(section.hash.length===64);assert.ok(section.bytes>0);}
 const fullBytes=(await Promise.all(index.entries.map(async entry=>(await readFile(path.join(process.cwd(),entry.path))).length))).reduce((sum,value)=>sum+value,0);
 assert.ok(pack.budget.inlineBytes<fullBytes/4,`inline ${pack.budget.inlineBytes} should be much smaller than ${fullBytes}`);
});

test('standards routing rejects path-incompatible language cards',async()=>{
 const frontend=await selectStandards({affectedPaths:['frontend/src/views/Login.vue'],context:'Vue login page',stage:'design'});
 const frontendIds=frontend.selected.map(item=>item.id);
 assert.ok(frontendIds.includes('language.vue3'));
 assert.ok(!frontendIds.includes('language.python'));
 const backend=await selectStandards({affectedPaths:['backend/app/api/auth.py'],context:'Python login API',stage:'design'});
 const backendIds=backend.selected.map(item=>item.id);
 assert.ok(backendIds.includes('language.python'));
 assert.ok(!backendIds.includes('language.vue3'));
});

test('coarse Vue and Python directories expand through the project tree before matching standards',async()=>{
 const pack=await selectStandards({affectedPaths:['vue','python'],projectTree:'vue/src/views/Login.vue\npython/app/routers/auth.py\npython/requirements.txt',context:'Vue 3 login and Python FastAPI authentication API',stage:'design'});
 const ids=pack.selected.map(item=>item.id);
 assert.deepEqual(pack.applicability.expanded.map(item=>item.input),['vue','python']);
 assert.ok(ids.includes('language.vue3'));
 assert.ok(ids.includes('language.python'));
 assert.ok(ids.includes('api.security'));
 const unresolved=await selectStandards({affectedPaths:['new-area'],context:'Unknown area',stage:'design'});
 assert.ok(unresolved.unknowns.length>0);
 assert.equal(unresolved.complete,false);
});

test('Skill routing returns compact entries and defers detail loading',async()=>{
 const index=await loadSkillsIndex();
 assert.equal(index.routes.flatMap(item=>item.referenceDetails).length,23);
 assert.equal(index.routes.find(item=>item.name==='spec-discover').referenceDetails.find(item=>item.authority==='archive').path,'skills/spec-discover/references/upstream-explore.ts');
 const route=await run({action:'route-skills',context:'OA Vue login frontend browser test quality review security',stage:'verification'});
 assert.ok(route.selected.length>0&&route.selected.length<=route.maxSelected);
 assert.ok(route.selected.some(item=>item.name==='quality-gate'));
 assert.ok(route.selected.some(item=>item.name==='frontend-verify'));
 assert.ok(route.selected.every(item=>item.stages.includes('verification')));
 assert.ok(route.selected.every(item=>item.triggerHits>=route.minTriggerHits));
 assert.equal(route.budget.detailBytesLoaded,0);
 assert.ok(route.budget.referenceIndexBytes>0&&route.budget.referenceIndexBytes<route.budget.referenceBytes);
 assert.ok(route.selected.every(item=>item.detailLoaded===false&&item.entryBytes>0&&item.path.endsWith('/SKILL.md')));
 const gate=route.selected.find(item=>item.name==='quality-gate');
 assert.ok(gate.references.includes('skills/quality-gate/references/review-matrix.md'));
 assert.ok(gate.referenceDetails.every(item=>item.deferred===true&&item.summary&&item.loadWhen&&item.stages.includes('verification')));
 const selected=await selectSkills({context:'需要澄清需求并比较方案',stage:'spec'});
 assert.ok(selected.selected.some(item=>item.name==='spec-explore'));
 assert.equal(selected.budget.referenceBytes>0,true);
 const explore=selected.selected.find(item=>item.name==='spec-explore');
 assert.ok(explore.referenceOmitted.some(item=>item.path.endsWith('/planning-discovery.md')));
});

test('start records a lane, traces aggregate, and complete-tasks applies one atomic batch',async t=>{
 const f=await workflowFixture(t);
 const started=await f.call('start',{lane:'fast',affectedPaths:['frontend/src/views/Login.vue','frontend/src/views/Home.vue'],document:'# PRD\nSecure OA login and homepage.'});
 assert.equal(started.efficiency.lane,'fast');assert.equal(started.efficiency.budgets.totalTokens,28000000);
 await f.call('submit-prd');await f.approve();let context=await f.context();const compact=await f.context({knownContextHash:context.contextHash});assert.equal(compact.contextDiff.unchanged,true);assert.equal(compact.contextDiff.cache,'hit');assert.equal(compact.context,undefined);await writeFile(path.join(f.project,'AGENTS.md'),'# Project rules\nKeep contracts explicit.\n');const changed=await f.context({knownContextHash:context.contextHash});assert.equal(changed.contextDiff.changed,true);assert.equal(changed.contextDiff.cache,'miss');assert.ok(changed.context);await rm(path.join(f.project,'AGENTS.md'));context=await f.context();await f.call('create-spec',{contextHash:context.contextHash,proposal,specs:{auth:delta}});await f.call('submit-spec',{report});await f.approve();context=await f.context();await f.call('write-design',{contextHash:context.contextHash,document:design});context=await f.context();
 const tasks='- [ ] 1.1 Implement secure login.\n- [ ] 1.2 Implement authorized homepage.\n';await f.call('write-tasks',{contextHash:context.contextHash,document:tasks});await f.approve();
 await f.call('trace-skill',{skill:'engineering-implement',invocationId:'impl-1',event:'started',summary:'Implement OA login',stage:'implementation'});
 await f.call('trace-skill',{skill:'engineering-implement',invocationId:'impl-1',event:'completed',summary:'OA implementation complete',stage:'implementation',metrics:{modelResponses:6,toolCalls:12,browserActions:4,inputTokens:1000,outputTokens:200}});
 const before=await inspectWorkflow(f.project,{changeId:'oa-login'});
 assert.equal(before.next.action,'complete-tasks');assert.deepEqual(before.efficiency.usage.modelResponses,6);assert.deepEqual(before.tasks.remaining.map(item=>item.id),['1.1','1.2']);
 await assert.rejects(f.call('complete-tasks',{tasks:[{taskId:'1.1',evidence:'unit test passes'},{taskId:'9.9',evidence:'unknown'}]}),/Task missing/);
 assert.doesNotMatch(await readFile(path.join(f.project,'planning/changes/oa-login/tasks.md'),'utf8'),/\[x\]/);assert.deepEqual(f.state.taskEvidence,{});
 await f.call('complete-tasks',{tasks:[{taskId:'1.1',evidence:'login unit test passes'},{taskId:'1.2',evidence:'authorization component test passes'}]});
 const completed=await readFile(path.join(f.project,'planning/changes/oa-login/tasks.md'),'utf8');
 assert.equal((completed.match(/\[x\]/g)||[]).length,2);assert.deepEqual(Object.keys(f.state.taskEvidence).sort(),['1.1','1.2']);
 assert.equal((await inspectWorkflow(f.project,{changeId:'oa-login'})).next.action,'submit-implementation');
});

test('save-prd recalculates risk and never lowers the lane floor',async t=>{
 const f=await workflowFixture(t);
 await f.call('start',{lane:'fast',affectedPaths:['frontend/src/views/Login.vue'],document:'# PRD\nSecure OA login.'});
 await assert.rejects(f.call('save-prd',{affectedPaths:['backend/app/api/auth.py'],document:'# PRD\nSecure OA login and authentication API.'}),/minimum to regulated/);
 assert.equal(f.state.risk.level,'L1');assert.equal(f.state.efficiency.lane,'fast');
 const saved=await f.call('save-prd',{affectedPaths:['backend/app/api/auth.py'],lane:'regulated',document:'# PRD\nSecure OA login and authentication API.'});
 assert.equal(saved.risk.level,'L3');assert.equal(saved.efficiency.lane,'regulated');assert.equal(saved.efficiency.riskFloor,'regulated');assert.equal(saved.efficiency.budgets.totalTokens,100000000);
});
