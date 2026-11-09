import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {run,initialize} from '../runtime/workflow-controller/index.mjs';
import {reviewItemsFor} from '../runtime/quality-controller/index.mjs';
const proposal='## Why\nSearch required.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nAPI.';
const spec='## Purpose\nSearch.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search.\n#### Scenario: Matching\n- **WHEN** a query is submitted\n- **THEN** matching items are returned.\n';
const report={summary:'Review complete',source:'integration test',issues:[],unverified:[]};
async function fixture(t){const project=await mkdtemp(path.join(os.tmpdir(),'instar-flow-'));t.after(()=>rm(project,{recursive:true,force:true}));await initialize(project);let state;const call=async(action,extra={})=>{const result=await run({project,changeId:'search',action,expectedVersion:state?.version,...extra});if(result.version!==undefined)state=result;return result;};const agent=async(role,stage)=>{const invocationId=`${role}-${stage}`;const request={project,changeId:'search',action:'trace-agent',role,stage,invocationId,summary:'fixture reviewer',executionMode:'subagent',reviewerSessionId:`reviewer-${role}`,reviewedFiles:role==='spec-reviewer'?['planning/changes/search/proposal.md','planning/changes/search/specs/search/spec.md']:['fixture.js'],findings:[],unverified:[]};await run({...request,event:'started'});return run({...request,event:'completed'});};return {project,call,agent,get state(){return state;},approve:()=>call('approve',{reviewHash:state.pendingReview.hash,decision:'accept-record',confirmation:{text:'Approved',source:'human fixture'}})};}
test('cross stack review excludes Vue for Python Java Go, retains Vue for Vue and universal for unknown',()=>{
 const vue=reviewItemsFor({review:{language:'typescript',framework:'vue'}});
 assert.ok(vue.includes('v-for-key'));assert.ok(!vue.includes('transactions'));
 for(const language of ['python','java','go']){const items=reviewItemsFor({review:{language,framework:'none'}});assert.ok(items.includes('transactions'));assert.ok(!items.includes('v-for-key'));assert.ok(!items.includes('watch-cleanup'));}
 const unknown=reviewItemsFor({});assert.ok(!unknown.includes('v-for-key'));assert.ok(unknown.includes('security'));
});
test('clarification blocks PRD submission, approval and SPEC until answered',async t=>{
 const f=await fixture(t);await f.call('start',{ui:false,stack:'backend',document:'# PRD\nSearch.'});await f.call('request-clarification',{questions:[{id:'q1',question:'Which roles?'},{id:'q2',question:'Which data?'}]});
 assert.equal(f.state.status,'waiting-clarification');await assert.rejects(f.call('submit-prd'),/clarification/);
 await f.call('answer-clarification',{answers:[{id:'q1',answer:'Staff'}]});assert.equal(f.state.status,'waiting-clarification');
 await assert.rejects(f.call('submit-prd'),/clarification/);await f.call('answer-clarification',{answers:[{id:'q2',answer:'Orders'}]});
 await f.call('submit-prd');await assert.rejects(f.call('approve',{reviewHash:'stale',decision:'accept-record',confirmation:{text:'ok',source:'test'}}),/hash/);await f.approve();
 const ctx=await f.call('context');await f.call('create-spec',{contextHash:ctx.contextHash,proposal,specs:{search:spec}});await f.agent('spec-reviewer','spec');await f.call('submit-spec',{report});assert.equal(f.state.pendingApproval,'spec');await f.approve();assert.equal(f.state.stage,'design');
 await f.call('reopen',{stage:'prd',reason:'Requirements changed'});assert.equal(f.state.stage,'prd');assert.deepEqual(f.state.approvals,{});assert.deepEqual(f.state.clarifications,[]);
 await f.call('save-prd',{document:'# PRD\nNew requirements.'});await f.call('submit-prd');await assert.rejects(f.call('approve',{reviewHash:'old',decision:'accept-record',confirmation:{text:'ok',source:'test'}}),/hash/);
 assert.match(await readFile(path.join(f.project,'docs/prd/search.md'),'utf8'),/New requirements/);
});
