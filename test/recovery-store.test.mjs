import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {transaction,atomic,lock} from '../runtime/workflow-controller/files.mjs';
import {restore} from '../runtime/workflow-controller/files.mjs';
import {recoveryStore} from '../runtime/workflow-controller/recovery.mjs';
test('recovery inventory, preview and confirmed cleanup preserve pending safety',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'recovery-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:20}));
 await lock(root,()=>transaction(root,()=>atomic(root,'planning/example.md','recovery test')));
 const inventory=await recoveryStore(root,{action:'recovery-status'});assert.equal(inventory.entries.length,1);const ids=inventory.entries.map(e=>e.id);
 assert.equal((await recoveryStore(root,{action:'prune-recovery',ids})).status,'PREVIEW');
 await assert.rejects(recoveryStore(root,{action:'prune-recovery',ids,preview:false}),/confirmation/);
 await fs.writeFile(path.join(root,'.workflow/pending.json'),'{}');await assert.rejects(recoveryStore(root,{action:'prune-recovery',ids,preview:false,confirm:true}),/pending/);await fs.unlink(path.join(root,'.workflow/pending.json'));
 assert.equal((await recoveryStore(root,{action:'prune-recovery',ids,preview:false,confirm:true})).removed.length,1);
 await fs.writeFile(path.join(root,'.instar-quality.json'),JSON.stringify({workflowRecovery:{maxBackupBytes:1}}));
 await assert.rejects(lock(root,()=>transaction(root,async()=>{})),/budget exceeded/);
 assert.equal(await fs.readFile(path.join(root,'planning/example.md'),'utf8'),'recovery test');
});
test('scoped backups ignore unrelated history and rollback only the write set',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'recovery-scope-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:20}));
 await fs.mkdir(path.join(root,'planning/archive'),{recursive:true});await fs.writeFile(path.join(root,'planning/archive/history.md'),'x'.repeat(128*1024));await fs.writeFile(path.join(root,'planning/current.md'),'old');
 await fs.writeFile(path.join(root,'.instar-quality.json'),JSON.stringify({workflowRecovery:{maxBackupBytes:32}}));
 await assert.rejects(lock(root,()=>transaction(root,async()=>{
  await atomic(root,'planning/current.md','new');await fs.appendFile(path.join(root,'planning/archive/history.md'),'unrelated external change');throw Error('injected');
 },{writePaths:['planning/current.md']})),/injected/);
 assert.equal(await fs.readFile(path.join(root,'planning/current.md'),'utf8'),'old');assert.match(await fs.readFile(path.join(root,'planning/archive/history.md'),'utf8'),/external change$/);
 const inventory=await recoveryStore(root,{action:'recovery-status'});const record=JSON.parse(await fs.readFile(path.join(root,'.workflow/transactions',inventory.entries[0].id,'result.json'),'utf8'));
 assert.deepEqual(record.writePaths,['planning/current.md']);assert.equal(record.schemaVersion,2);
 await assert.rejects(lock(root,()=>transaction(root,()=>atomic(root,'planning/other.md','bad'),{writePaths:['planning/current.md']})),/outside transaction/);
});
test('interrupted scoped transaction restores files and removes only newly created empty parents',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'recovery-crash-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:20}));
 const moduleUrl=pathToFileURL(path.resolve('runtime/workflow-controller/files.mjs')).href;
 const program=`import {transaction,atomic} from ${JSON.stringify(moduleUrl)};await transaction(${JSON.stringify(root)},async()=>{await atomic(${JSON.stringify(root)},'planning/changes/crash/new.md','partial');process.exit(23);},{writePaths:['planning/changes/crash']});`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:15000});assert.equal(child.status,23,child.stderr);
 const record=JSON.parse(await fs.readFile(path.join(root,'.workflow/pending.json'),'utf8'));assert.equal(record.schemaVersion,2);
 await fs.mkdir(path.join(root,'docs'),{recursive:true});await fs.writeFile(path.join(root,'docs/keep.md'),'unrelated');
 await restore(root,record);await assert.rejects(fs.access(path.join(root,'planning')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(root,'docs/keep.md'),'utf8'),'unrelated');
 // Recovery is idempotent if a caller restarts before removing pending.json.
 await restore(root,record);
});
