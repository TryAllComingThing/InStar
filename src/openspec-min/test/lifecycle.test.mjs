import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as api from '../dist/entry.js';
const proposal='## Why\nA useful business reason.\n## What Changes\nAdds behavior.\n## Capabilities\nuser-auth\n## Impact\nClients.';
const requirement=(name='Login',scenario='Success')=>`### Requirement: ${name}\nThe system SHALL authenticate users.\n\n#### Scenario: ${scenario}\n- **WHEN** credentials are valid\n- **THEN** authentication succeeds\n`;
const delta=`## Purpose\nAuthenticate users so that protected services can be accessed safely and consistently.\n\n## ADDED Requirements\n${requirement()}`;
const design='## Context\nExisting clients.\n## Goals / Non-Goals\nAuthentication.\n## Decisions\nUse existing provider.\n## Project Constraints\nUse existing auth module.\n## Architecture\nExtend the existing auth module.\n## File Change Plan\nUpdate src/auth/provider.ts.\n## Risks / Trade-offs\nProvider availability.\n## Migration Plan\nIncremental rollout.';
async function setup(t){const root=await mkdtemp(path.join(os.tmpdir(),'openspec-min-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,changeId:'add-login'};}
async function create(ref,doc=delta){await api.createSpecChange({...ref,prd:'Allow login.',generate:async()=>({proposal,specs:{'user-auth':doc}})});}
async function ready(ref){await api.generateDesignDoc({...ref,specReviewed:true,generate:async()=>design});await api.generateTaskList({...ref,generate:async()=>'- [ ] 1.1 Implement login; acceptance: successful login test passes.'});}
test('five exports and complete lifecycle with full archive',async t=>{
 assert.deepEqual(Object.keys(api).sort(),['createSpecChange','generateDesignDoc','generateTaskList','promoteToBaseline','runSpecVerifyGate'].sort());
 const ref=await setup(t);await create(ref);assert.equal((await api.runSpecVerifyGate(ref)).valid,true);await ready(ref);
 await assert.rejects(api.promoteToBaseline({...ref,accepted:true}),/complete/);
 await writeFile(path.join(ref.root,'changes',ref.changeId,'tasks.md'),'- [x] 1.1 Implement login; acceptance: successful login test passes.');
 const result=await api.promoteToBaseline({...ref,accepted:true});
 assert.match(await readFile(path.join(ref.root,'specs/user-auth/spec.md'),'utf8'),/Requirement: Login/);
 for(const name of ['proposal.md','technical-design.md','tasks.md','specs/user-auth/spec.md']) assert.ok(await readFile(path.join(result.archivePath,name),'utf8'));
 await assert.rejects(api.promoteToBaseline({...ref,accepted:true}));
});
test('invalid documents block design generation',async t=>{const ref=await setup(t);await create(ref,delta.replace('SHALL','should'));assert.equal((await api.runSpecVerifyGate(ref)).valid,false);let called=false;await assert.rejects(api.generateDesignDoc({...ref,specReviewed:true,generate:async()=>{called=true;return design;}}));assert.equal(called,false);});
test('review invalidated by spec changes',async t=>{const ref=await setup(t);await create(ref);await api.generateDesignDoc({...ref,specReviewed:true,generate:async()=>design});await writeFile(path.join(ref.root,'changes',ref.changeId,'proposal.md'),proposal+'\nChanged.');await assert.rejects(api.generateTaskList({...ref,generate:async()=>'- [ ] 1.1 Task'}),/changed/);});
test('duplicate creation preserves existing documents',async t=>{const ref=await setup(t);await create(ref);await assert.rejects(create(ref));assert.equal(await readFile(path.join(ref.root,'changes',ref.changeId,'proposal.md'),'utf8'),proposal);});
test('path traversal and symlink roots rejected',async t=>{const ref=await setup(t);await assert.rejects(create({...ref,changeId:'../bad'}),/identifier/);await symlink(os.tmpdir(),path.join(ref.root,'specs'));await assert.rejects(create(ref),/Symlink/);});
test('modified scenarios cannot silently disappear',async t=>{const ref=await setup(t);await mkdir(path.join(ref.root,'specs/user-auth'),{recursive:true});await writeFile(path.join(ref.root,'specs/user-auth/spec.md'),`# Authentication\n## Purpose\nUsers authenticate.\n## Requirements\n${requirement()}`);await create(ref,`## MODIFIED Requirements\n${requirement('Login','Different')}`);const gate=await api.runSpecVerifyGate(ref);assert.equal(gate.valid,false);assert.match(gate.issues.join(' '),/scenario/i);});
test('merge conflicts in one capability prevent all writes',async t=>{const ref=await setup(t);await api.createSpecChange({...ref,prd:'Change',generate:async()=>({proposal,specs:{'user-auth':delta,'other':`## MODIFIED Requirements\n${requirement()}`}})});assert.equal((await api.runSpecVerifyGate(ref)).valid,false);await assert.rejects(readFile(path.join(ref.root,'specs/user-auth/spec.md')));});
test('original merge supports add, modify, rename and remove together',async t=>{
 const ref=await setup(t);
 const {buildUpdatedSpec,findSpecUpdates}=await import('../dist/src/diff/merge.js');
 await mkdir(path.join(ref.root,'specs/user-auth'),{recursive:true});
 await writeFile(path.join(ref.root,'specs/user-auth/spec.md'),`# Authentication\n## Purpose\nUsers authenticate safely with stable behavior.\n## Requirements\n${requirement('Login')}\n${requirement('Legacy')}\n${requirement('Old name')}`);
 const doc=`## ADDED Requirements\n${requirement('Logout')}\n## MODIFIED Requirements\n${requirement('Login').replace('authenticate users','authenticate registered users')}\n## REMOVED Requirements\n### Requirement: Legacy\n**Reason**: Obsolete.\n**Migration**: Use Login.\n## RENAMED Requirements\n- FROM: \`### Requirement: Old name\`\n- TO: \`### Requirement: New name\`\n`;
 await create(ref,doc);assert.equal((await api.runSpecVerifyGate(ref)).valid,true);
 const updates=await findSpecUpdates(path.join(ref.root,'changes',ref.changeId),path.join(ref.root,'specs'));
 const result=await buildUpdatedSpec(updates[0],ref.changeId);
 assert.deepEqual(result.counts,{added:1,modified:1,removed:1,renamed:1});
 assert.match(result.rebuilt,/authenticate registered users/);assert.match(result.rebuilt,/Requirement: New name/);assert.doesNotMatch(result.rebuilt,/Requirement: Legacy|Requirement: Old name/);
});
test('archive rename failure rolls back baseline and preserves change',async t=>{
 const ref=await setup(t);await create(ref);await ready(ref);
 const tasks=path.join(ref.root,'changes',ref.changeId,'tasks.md');await writeFile(tasks,(await readFile(tasks,'utf8')).replace('[ ]','[x]'));
 const {promises:fs}=await import('node:fs');const original=fs.rename;
 fs.rename=async(from,to)=>{if(to===path.join(ref.root,'archive',ref.changeId)) throw new Error('Injected archive failure');return original(from,to);};
 try {await assert.rejects(api.promoteToBaseline({...ref,accepted:true}),/Injected archive failure/);} finally {fs.rename=original;}
 await assert.rejects(readFile(path.join(ref.root,'specs/user-auth/spec.md')));assert.equal(await readFile(path.join(ref.root,'changes',ref.changeId,'proposal.md'),'utf8'),proposal);
 await api.promoteToBaseline({...ref,accepted:true});
});
test('concurrent writer is blocked without losing lock ownership',async t=>{
 const ref=await setup(t);let release;let entered;
 const started=new Promise(resolve=>entered=resolve);const hold=new Promise(resolve=>release=resolve);
 const pending=api.createSpecChange({...ref,prd:'Login',generate:async()=>{entered();await hold;return {proposal,specs:{'user-auth':delta}};}});
 await started;await assert.rejects(create({...ref,changeId:'other-change'}),/EEXIST/);release();await pending;assert.equal((await api.runSpecVerifyGate(ref)).valid,true);
});
test('task edits other than completion markers invalidate promotion',async t=>{
 const ref=await setup(t);await create(ref);await ready(ref);await writeFile(path.join(ref.root,'changes',ref.changeId,'tasks.md'),'- [x] 1.1 Skipped the original work');await assert.rejects(api.promoteToBaseline({...ref,accepted:true}),/Task content changed/);
});
