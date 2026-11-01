import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run} from '../runtime/workflow-controller/index.mjs';

const proposal='## Why\nSearch required.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nAPI.';
const spec='## Purpose\nSearch.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search.\n#### Scenario: Match\n- **WHEN** a query is submitted\n- **THEN** matching items are returned.\n';
const report={summary:'Workflow review complete',source:'P0-03 fixture',issues:[],unverified:[]};

async function fixture(t,name){
 const project=await mkdtemp(path.join(os.tmpdir(),`instar-p0-03-${name}-`));
 t.after(()=>rm(project,{recursive:true,force:true}));
 
 let state;
 const call=async(action,extra={})=>{const result=await run({project,changeId:name,action,expectedVersion:state?.version,...extra});if(result.version!==undefined)state=result;return result;};
 return {project,call,get state(){return state;}};
}
const confirmation={text:'Approved by P0-03 fixture',source:'human test fixture'};
async function startWithQuestions(f){await f.call('start',{document:'# PRD\nSearch.'});return f.call('request-clarification',{questions:[{id:'roles',question:'Which roles?'},{id:'data',question:'Which data?'}]});}
async function answerAll(f){await f.call('answer-clarification',{answers:[{id:'roles',answer:'Staff'}]});return f.call('answer-clarification',{answers:[{id:'data',answer:'Orders'}]});}
async function approveCurrent(f){return f.call('approve',{reviewHash:f.state.pendingReview.hash,confirmation});}
async function submitSpec(f){const context=await f.call('context');await f.call('create-spec',{contextHash:context.contextHash,proposal,specs:{search:spec}});return f.call('submit-spec',{report});}

test('WF-01 clarification enters waiting state',async t=>{
 const f=await fixture(t,'wf01');await startWithQuestions(f);assert.equal(f.state.status,'waiting-clarification');assert.equal(f.state.clarifications.length,2);assert.equal(f.state.pendingApproval,null);
});
test('WF-02 partial clarification blocks PRD submission',async t=>{
 const f=await fixture(t,'wf02');await startWithQuestions(f);await f.call('answer-clarification',{answers:[{id:'roles',answer:'Staff'}]});await assert.rejects(f.call('submit-prd'),/clarification/);assert.equal(f.state.status,'waiting-clarification');
});
test('WF-03 duplicate clarification answer is rejected without overwrite',async t=>{
 const f=await fixture(t,'wf03');await startWithQuestions(f);await f.call('answer-clarification',{answers:[{id:'roles',answer:'Staff'}]});await assert.rejects(f.call('answer-clarification',{answers:[{id:'roles',answer:'Managers'}]}),/already answered/);assert.equal(f.state.clarifications.find(q=>q.id==='roles').answer,'Staff');
});
test('WF-04 complete clarification allows PRD approval state',async t=>{
 const f=await fixture(t,'wf04');await startWithQuestions(f);await answerAll(f);await f.call('submit-prd');assert.equal(f.state.status,'awaiting-approval');assert.equal(f.state.pendingApproval,'prd');
});
test('WF-05 wrong PRD approval hash is rejected',async t=>{
 const f=await fixture(t,'wf05');await startWithQuestions(f);await answerAll(f);await f.call('submit-prd');await assert.rejects(f.call('approve',{reviewHash:'wrong-hash',confirmation}),/hash/);assert.equal(f.state.pendingApproval,'prd');
});
test('WF-06 rejected PRD returns to modification flow and cannot create SPEC',async t=>{
 const f=await fixture(t,'wf06');await startWithQuestions(f);await answerAll(f);await f.call('submit-prd');await f.call('request-changes',{feedback:'Clarify scope'});assert.equal(f.state.stage,'prd');assert.equal(f.state.pendingApproval,null);await assert.rejects(f.call('create-spec',{proposal,specs:{search:spec}}),/unavailable|approval/);
});
test('WF-07 correct PRD hash enters SPEC',async t=>{
 const f=await fixture(t,'wf07');await startWithQuestions(f);await answerAll(f);await f.call('submit-prd');await approveCurrent(f);assert.equal(f.state.stage,'spec');assert.equal(typeof f.state.approvals.prd.hash,'string');
});
test('WF-08 unapproved SPEC blocks design',async t=>{
 const f=await fixture(t,'wf08');await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');await approveCurrent(f);await submitSpec(f);assert.equal(f.state.pendingApproval,'spec');await assert.rejects(f.call('write-design',{document:'## Context\nSearch'}),/unavailable|approval/);
});
test('WF-09 correct SPEC approval enters design',async t=>{
 const f=await fixture(t,'wf09');await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');await approveCurrent(f);await submitSpec(f);await approveCurrent(f);assert.equal(f.state.stage,'design');assert.equal(typeof f.state.approvals.spec.hash,'string');
});
test('WF-10 approved PRD edit invalidates state and downstream authorization',async t=>{
 const f=await fixture(t,'wf10');await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');await approveCurrent(f);const oldPrdApproval=f.state.approvals.prd.hash;await f.call('reopen',{stage:'prd',reason:'Business scope changed'});await f.call('save-prd',{document:'# PRD\nChanged scope.'});assert.deepEqual(f.state.approvals,{});await assert.rejects(f.call('approve',{reviewHash:oldPrdApproval,confirmation}),/hash/);await assert.rejects(f.call('create-spec',{proposal,specs:{search:spec}}),/unavailable|approval/);await assert.rejects(f.call('write-design',{document:'## Context\nSearch'}),/unavailable|approval/);await assert.rejects(f.call('submit-implementation'),/unavailable|approval/);
});
test('WF-11 approved SPEC edit invalidates design and implementation authorization',async t=>{
 const f=await fixture(t,'wf11');await f.call('start',{document:'# PRD\nSearch.'});await f.call('submit-prd');await approveCurrent(f);await submitSpec(f);await approveCurrent(f);const oldSpecApproval=f.state.approvals.spec.hash;await f.call('reopen',{stage:'spec',reason:'SPEC behavior changed'});const context=await f.call('context');await f.call('save-spec',{contextHash:context.contextHash,proposal,specs:{search:spec+'\nUpdated.'}});assert.equal(f.state.stage,'spec');assert.equal(f.state.approvals.spec,undefined);await assert.rejects(f.call('approve',{reviewHash:oldSpecApproval,confirmation}),/hash/);await assert.rejects(f.call('write-design',{contextHash:context.contextHash,document:'## Context\nSearch'}),/unavailable|approval/);await assert.rejects(f.call('write-tasks',{contextHash:context.contextHash,document:'- [ ] 1.1 Implement search'}),/unavailable|approval/);
});
test('WF-12 state restores across restart during clarification and approval',async t=>{
 const f=await fixture(t,'wf12');await startWithQuestions(f);const waiting=await run({project:f.project,changeId:'wf12',action:'state'});assert.equal(waiting.status,'waiting-clarification');assert.equal(waiting.clarifications.filter(q=>!q.answer).length,2);await answerAll(f);await f.call('submit-prd');const pending=await run({project:f.project,changeId:'wf12',action:'state'});assert.equal(pending.pendingApproval,'prd');await run({project:f.project,changeId:'wf12',action:'approve',expectedVersion:pending.version,reviewHash:pending.pendingReview.hash,confirmation});const resumed=await run({project:f.project,changeId:'wf12',action:'state'});assert.equal(resumed.stage,'spec');assert.equal(resumed.approvals.prd.hash,pending.pendingReview.hash);
});
