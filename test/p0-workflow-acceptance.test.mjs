import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run} from '../runtime/workflow-controller/index.mjs';

const cli=new URL('../runtime/workflow-controller/cli.mjs',import.meta.url);
const proposal='## Why\nSearch required.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nAPI.';
const spec='## Purpose\nSearch.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search.\n#### Scenario: Match\n- **WHEN** a query is submitted\n- **THEN** matching items are returned.\n';
const review={summary:'Reviewed fixture',source:'P0 workflow acceptance',issues:[],unverified:[]};
const confirmation={text:'Approved by workflow acceptance fixture',source:'human test fixture'};

async function fixture(t,name){
 const project=await mkdtemp(path.join(os.tmpdir(),`instar-p0-workflow-${name}-`));t.after(()=>rm(project,{recursive:true,force:true}));let state;
 const call=async(action,extra={})=>{const result=await run({project,changeId:name,action,expectedVersion:state?.version,...extra});if(result.version!==undefined)state=result;return result;};
 return {project,call,get state(){return state;}};
}
async function approve(f){return f.call('approve',{reviewHash:f.state.pendingReview.hash,confirmation});}
async function prdApproved(f){await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');await approve(f);}
async function specPending(f){const context=await f.call('context');await f.call('create-spec',{contextHash:context.contextHash,proposal,specs:{search:spec}});await f.call('submit-spec',{report:review});}
function invoke(project,input){return spawnSync(process.execPath,[cli.pathname,'-'],{cwd:project,input:JSON.stringify({project,...input}),encoding:'utf8'});}

test('WF-13 repeated answer is rejected and original clarification remains',async t=>{
 const f=await fixture(t,'wf13');await f.call('start',{document:'# PRD\nSearch.'});await f.call('request-clarification',{questions:[{id:'roles',question:'Which roles?'},{id:'data',question:'Which data?'}]});await f.call('answer-clarification',{answers:[{id:'roles',answer:'Staff'}]});
 await assert.rejects(f.call('answer-clarification',{answers:[{id:'roles',answer:'Managers'}]}),/already answered/);
 assert.equal(f.state.clarifications.find(q=>q.id==='roles').answer,'Staff');assert.equal(f.state.status,'waiting-clarification');
});

test('WF-14 rejected PRD and SPEC require fresh review after edits',async t=>{
 const f=await fixture(t,'wf14-prd');await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');const oldPrdHash=f.state.pendingReview.hash;await f.call('request-changes',{feedback:'Clarify scope'});await f.call('save-prd',{document:'# PRD\nSearch with revised scope.'});await f.call('submit-prd');assert.notEqual(f.state.pendingReview.hash,oldPrdHash);await assert.rejects(f.call('approve',{reviewHash:oldPrdHash,confirmation}),/hash/);await approve(f);assert.equal(f.state.stage,'spec');
 const g=await fixture(t,'wf14-spec');await prdApproved(g);await specPending(g);const oldSpecHash=g.state.pendingReview.hash;await g.call('request-changes',{feedback:'Clarify matching behavior'});const context=await g.call('context');await g.call('save-spec',{contextHash:context.contextHash,proposal,specs:{search:spec+'\nUpdated behavior.'}});await g.call('submit-spec',{report:review});assert.notEqual(g.state.pendingReview.hash,oldSpecHash);await assert.rejects(g.call('approve',{reviewHash:oldSpecHash,confirmation}),/hash/);await approve(g);assert.equal(g.state.stage,'design');
});

test('WF-15 process reload preserves waiting clarification and approval state',async t=>{
 const clarification=await fixture(t,'wf15-clarification');let result=invoke(clarification.project,{changeId:'wf15-clarification',action:'start',document:'# PRD\nSearch.'});assert.equal(result.status,0);result=invoke(clarification.project,{changeId:'wf15-clarification',expectedVersion:1,action:'request-clarification',questions:[{id:'roles',question:'Which roles?'},{id:'data',question:'Which data?'}]});assert.equal(result.status,0);let resumed=invoke(clarification.project,{changeId:'wf15-clarification',action:'state'});assert.equal(resumed.status,0);let state=JSON.parse(resumed.stdout);assert.equal(state.status,'waiting-clarification');assert.equal(state.version,2);assert.equal(state.clarifications.length,2);
 const approval=await fixture(t,'wf15-approval');result=invoke(approval.project,{changeId:'wf15-approval',action:'start',document:'# PRD\nSearch.'});assert.equal(result.status,0);result=invoke(approval.project,{changeId:'wf15-approval',expectedVersion:1,action:'submit-prd'});assert.equal(result.status,0);const pending=JSON.parse(result.stdout);resumed=invoke(approval.project,{changeId:'wf15-approval',action:'state'});assert.equal(resumed.status,0);state=JSON.parse(resumed.stdout);assert.equal(state.status,'awaiting-approval');assert.equal(state.version,pending.version);assert.equal(state.pendingReview.hash,pending.pendingReview.hash);
});

test('WF-16 unapproved or revised requirements cannot enter controlled development',async t=>{
 const f=await fixture(t,'wf16');const design='## Context\nSearch.\n## Goals / Non-Goals\nFind items.\n## Decisions\nUse existing search.\n## Project Constraints\nKeep current module.\n## Architecture\nExisting search module.\n## File Change Plan\nUpdate search.\n## Risks / Trade-offs\nNone.\n## Migration Plan\nNone.';await f.call('start',{document:'# PRD\nSearch.'});await assert.rejects(f.call('create-spec',{proposal,specs:{search:spec}}),/unavailable|approval/);await f.call('submit-prd');await assert.rejects(f.call('create-spec',{proposal,specs:{search:spec}}),/unavailable|approval/);await approve(f);await specPending(f);await assert.rejects(f.call('write-design',{document:design}),/unavailable|approval/);await approve(f);const context=await f.call('context');await f.call('write-design',{contextHash:context.contextHash,document:design});await f.call('write-tasks',{contextHash:(await f.call('context')).contextHash,document:'- [ ] 1.1 Implement search; acceptance: test passes.'});await f.call('reopen',{stage:'prd',reason:'Requirements changed'});await assert.rejects(f.call('write-design',{document:design}),/unavailable|approval/);await assert.rejects(f.call('complete-task',{taskId:'1.1',evidence:'unauthorized'}),/unavailable|approval/);
});
