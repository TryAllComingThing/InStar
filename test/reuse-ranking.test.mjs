import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {reuseContext,validateReuseDecisions} from '../runtime/shared/code-reuse.mjs';
import {reuseQueryFor} from '../runtime/workflow-controller/documents.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
test('reuse context ranks a bounded candidate set and preserves the inventory fingerprint',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'instar-reuse-rank-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 await mkdir(path.join(root,'docs/project-baseline/capabilities'),{recursive:true});await mkdir(path.join(root,'src'),{recursive:true});
 const capabilities=[];
 for(let index=1;index<=40;index++){
  const entry=`src/cap-${index}.js`,source=`export const value${index}=${index};`;await writeFile(path.join(root,entry),source);
  capabilities.push({id:`CAP-${String(index).padStart(2,'0')}`,name:index===7?'Login form':'Capability '+index,summary:index===7?'Secure OA login form and password flow':'Generic capability '+index,entry,sourceHash:hash(source),visibility:index===7?'public':'internal',status:'active',owner:index===7?'identity':'shared'});
 }
 await writeFile(path.join(root,'docs/project-baseline/capabilities/index.json'),JSON.stringify({schemaVersion:1,enabled:true,capabilities}));
 const first=await reuseContext(root,{query:'secure login password',limit:5}),second=await reuseContext(root,{query:'unrelated reporting',limit:5});
 assert.equal(first.fingerprint,second.fingerprint);assert.equal(first.candidateLimit,5);assert.equal(first.candidates.length,5);assert.equal(first.candidateTotal,40);assert.equal(first.candidatesTruncated,true);
 assert.equal(first.candidates[0].id,'CAP-07');assert.ok(first.candidates[0].reasons.length>0);
 assert.equal((await reuseContext(root,{query:'login',limit:99})).candidateLimit,30);
});

test('selected capabilities require contract and caller evidence when declared',()=>{
 const context={enabled:true,state:'enabled',capabilities:[{id:'CAP-LOGIN',currentHash:hash('source'),fresh:true,status:'active',visibility:'public',contractFiles:['src/login.d.ts'],consumers:['src/app.js']}]};
 const decision={need:'Login',searched:['src'],candidates:['CAP-LOGIN'],selected:'CAP-LOGIN',decision:'reuse',sourceHash:hash('source'),reason:'Contract matches',verification:'Run login checks'};
 assert.throws(()=>validateReuseDecisions(context,[decision]),/contractEvidence/);
 assert.throws(()=>validateReuseDecisions(context,[{...decision,contractEvidence:'Contract checked'}]),/callerEvidence/);
 assert.doesNotThrow(()=>validateReuseDecisions(context,[{...decision,contractEvidence:'Contract checked',callerEvidence:'Two callers checked'}]));
});

test('workflow reuse query prioritizes PRD, requirement headings and affected paths',()=>{
 const query=reuseQueryFor({affectedPaths:['src/auth/session.js']},{
  prd:'# Secure login\nREQ-001 Users need password rotation.',
  proposal:'## Why\nReplace duplicate login logic.',
  specs:{auth:'## ADDED Requirements\n### Requirement: Session rotation\n#### Scenario: Expire\n'},
 });
 assert.match(query,/Secure login/);
 assert.match(query,/Session rotation/);
 assert.match(query,/src\/auth\/session\.js/);
 assert.ok(query.length<=1200);
});
