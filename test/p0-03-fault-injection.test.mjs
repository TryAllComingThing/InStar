import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run} from '../runtime/workflow-controller/index.mjs';
import {fs as workflowFs} from '../runtime/workflow-controller/files.mjs';

const cli=new URL('../runtime/workflow-controller/cli.mjs',import.meta.url);
const confirmation={text:'Approved by FI fixture',source:'human FI test'};

async function fixture(t,name){
 const project=await mkdtemp(path.join(os.tmpdir(),`instar-fi-${name}-`));t.after(()=>rm(project,{recursive:true,force:true}));return project;
}
function fresh(project,input){
 const result=spawnSync(process.execPath,[cli.pathname,'-'],{cwd:project,input:JSON.stringify({project,...input}),encoding:'utf8'});
 return {result,value:result.stdout?JSON.parse(result.stdout):null,error:result.stderr?JSON.parse(result.stderr):null};
}
const questions={action:'request-clarification',questions:[{id:'roles',question:'Which roles?'},{id:'data',question:'Which data?'}]};

test('FI-01 restart while waiting for clarification preserves partial answers',async t=>{
 const project=await fixture(t,'fi01');
 assert.equal(fresh(project,{changeId:'fi01',action:'start',document:'# PRD\nSearch.'}).result.status,0);
 assert.equal(fresh(project,{changeId:'fi01',expectedVersion:1,...questions}).result.status,0);
 assert.equal(fresh(project,{changeId:'fi01',expectedVersion:2,action:'answer-clarification',answers:[{id:'roles',answer:'Staff'}]}).result.status,0);
 const resumed=fresh(project,{changeId:'fi01',action:'state'});assert.equal(resumed.result.status,0);assert.equal(resumed.value.status,'waiting-clarification');assert.equal(resumed.value.clarifications.find(q=>q.id==='roles').answer,'Staff');assert.equal(resumed.value.clarifications.find(q=>q.id==='data').answer,null);
 const blocked=fresh(project,{changeId:'fi01',expectedVersion:3,action:'submit-prd'});assert.notEqual(blocked.result.status,0);assert.match(blocked.result.stderr,/clarification/);
});

test('FI-02 restart before approval preserves hash and rejects duplicate approval',async t=>{
 const project=await fixture(t,'fi02');
 assert.equal(fresh(project,{changeId:'fi02',action:'start',document:'# PRD\nSearch.'}).result.status,0);assert.equal(fresh(project,{changeId:'fi02',expectedVersion:1,action:'submit-prd'}).result.status,0);
 const pending=fresh(project,{changeId:'fi02',action:'state'});assert.equal(pending.result.status,0);assert.equal(pending.value.pendingApproval,'prd');const hash=pending.value.pendingReview.hash;
 const approved=fresh(project,{changeId:'fi02',action:'approve',expectedVersion:pending.value.version,reviewHash:hash,confirmation});assert.equal(approved.result.status,0);assert.equal(approved.value.stage,'spec');
 const duplicate=fresh(project,{changeId:'fi02',action:'approve',expectedVersion:approved.value.version,reviewHash:hash,confirmation});assert.notEqual(duplicate.result.status,0);assert.match(duplicate.result.stderr,/hash|unavailable|approval/);
});

test('FI-03 approval state write failure rolls back atomically',async t=>{
 const project=await fixture(t,'fi03');let state;
 const call=async(action,extra={})=>{const result=await run({project,changeId:'fi03',action,expectedVersion:state?.version,...extra});if(result.version!==undefined)state=result;return result;};
 await call('start',{document:'# PRD\nSearch.'});await call('submit-prd');const before=JSON.parse(JSON.stringify(state));const original=workflowFs.rename;let injected=false;
 workflowFs.rename=async(from,to)=>{if(!injected&&to.endsWith('/planning/workflows/fi03.json')){injected=true;throw Error('Injected approval state write failure');}return original(from,to);};
 try{await assert.rejects(call('approve',{reviewHash:state.pendingReview.hash,confirmation}),/Injected approval state write failure/);}finally{workflowFs.rename=original;}
 const recovered=await run({project,changeId:'fi03',action:'state'});assert.equal(recovered.version,before.version);assert.equal(recovered.pendingApproval,'prd');assert.deepEqual(recovered.approvals,before.approvals);assert.equal(await readFile(path.join(project,'.workflow/pending.json')).catch(e=>e.code),'ENOENT');
 const transactions=await (await import('node:fs/promises')).readdir(path.join(project,'.workflow/transactions'));assert.ok(transactions.length);let journal=null;for(const id of transactions){try{const candidate=JSON.parse(await readFile(path.join(project,'.workflow/transactions',id,'result.json')));if(candidate.status==='rolled-back')journal=candidate;}catch{}}assert.equal(journal?.status,'rolled-back');
});
