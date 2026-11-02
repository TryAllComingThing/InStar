import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {reuseContext,validateReuseDecisions,validateReuseReview} from '../src/shared/code-reuse.mjs';
import {run} from '../runtime/workflow-controller/index.mjs';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reuse-'));t.after(()=>fs.rm(root,{force:true,recursive:true}));
 await fs.mkdir(path.join(root,'docs/project-baseline/capabilities'),{recursive:true});
 await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'src/public.js'),'export const query=()=>[];');
 const sourceHash=createHash('sha256').update('export const query=()=>[];').digest('hex');
 const entry={id:'CAP-QUERY',name:'Query',summary:'Query items',entry:'src/public.js',visibility:'public',status:'active',sourceHash};
 const file=path.join(root,'docs/project-baseline/capabilities/index.json');
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,enabled:true,capabilities:[entry]}));
 const decision={need:'List items',searched:['src'],candidates:[entry.id],decision:'reuse',selected:entry.id,sourceHash,reason:'Same contract',verification:'Run consumer test'};
 return {root,file,entry,decision};
}
test('source freshness, valid decisions and workflow context',async t=>{
 const f=await fixture(t);let context=await reuseContext(f.root);
 validateReuseDecisions(context,[f.decision]);assert.equal(context.capabilities[0].fresh,true);
 assert.equal((await run({action:'reuse-context',project:f.root})).enabled,true);
 await fs.appendFile(path.join(f.root,f.entry.entry),'\n// changed');context=await reuseContext(f.root);
 assert.equal(context.capabilities[0].fresh,false);assert.throws(()=>validateReuseDecisions(context,[f.decision]),/stale/);
});
test('explicit implementation and contract files participate in freshness',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'src/implementation.js'),'export const actual=1;');
 f.entry.sourceFiles=['src/implementation.js'];f.entry.sourceHashes={'src/implementation.js':createHash('sha256').update('export const actual=1;').digest('hex')};
 await fs.writeFile(f.file,JSON.stringify({schemaVersion:1,enabled:true,capabilities:[f.entry]}));const before=await reuseContext(f.root);assert.equal(before.capabilities[0].fresh,true);
 await fs.appendFile(path.join(f.root,'src/implementation.js'),'\n// changed');const after=await reuseContext(f.root);assert.equal(after.capabilities[0].fresh,false);assert.notEqual(before.fingerprint,after.fingerprint);
});
test('internal boundaries and shared extraction need explicit justification',async t=>{
 const f=await fixture(t);f.entry.visibility='internal';await fs.writeFile(f.file,JSON.stringify({schemaVersion:1,enabled:true,capabilities:[f.entry]}));
 const c=await reuseContext(f.root);assert.throws(()=>validateReuseDecisions(c,[f.decision]),/boundary/);
 validateReuseDecisions(c,[{...f.decision,boundaryEvidence:'Caller is in same module'}]);
 assert.throws(()=>validateReuseDecisions(c,[{...f.decision,decision:'extract-shared'}]),/owner/);
 validateReuseDecisions(c,[{...f.decision,decision:'local-new',candidates:[],reason:'Different business semantics'}]);
});
test('review rejects missing checks and stale fingerprint, optional mode preserves compatibility',async t=>{
 const f=await fixture(t),c=await reuseContext(f.root);
 const review={fingerprint:c.fingerprint,decisions:[f.decision],checks:['reuse-existing','duplicate-implementation','shared-capability-design'].map(id=>({id,status:'PASS',evidence:'Reviewed current source and callers'}))};
 validateReuseReview(c,review);assert.throws(()=>validateReuseReview(c,{...review,fingerprint:'old'}),/stale/);
 assert.throws(()=>validateReuseReview(c,{...review,checks:[]}),/missing/);
 validateReuseReview({enabled:false},undefined);
 f.entry.entry='../outside';await fs.writeFile(f.file,JSON.stringify({schemaVersion:1,enabled:true,capabilities:[f.entry]}));
 await assert.rejects(reuseContext(f.root),/Invalid baseline path/);
});
