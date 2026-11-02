import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {baselineContext,adoptRules,validateRuleReferences} from '../src/shared/project-baseline.mjs';
import {matches,readProjectFile} from '../src/shared/project-baseline.mjs';
import {baselineCheck} from '../src/shared/project-baseline.mjs';
import {run as workflow} from '../runtime/workflow-controller/index.mjs';

async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'baseline-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));await fs.mkdir(path.join(root,'docs/project-baseline'),{recursive:true});return root;}

test('glob semantics cover zero directory depth and native separators',()=>{
 for(const [pattern,file] of [['**/*.ts','index.ts'],['src/**/a.ts','src/a.ts'],['src/**/a.ts','src/deep/a.ts'],['src/**','src\\a.ts']])assert.equal(matches(pattern,file),true);
 assert.equal(matches('src/*.ts','src/deep/a.ts'),false);
});
test('policy readers reject directory and non-directory parents',async t=>{
 const root=await fixture(t);await assert.rejects(readProjectFile(root,'docs/project-baseline'),/regular file/);
 await fs.writeFile(path.join(root,'leaf'),'data');await assert.rejects(readProjectFile(root,'leaf/child'),/regular file/);
});
test('baseline-check detects missing IDs without writing policy',async t=>{
 const root=await fixture(t),base=path.join(root,'docs/project-baseline');
 await fs.writeFile(path.join(base,'coding.md'),'# Coding');await fs.writeFile(path.join(base,'INDEX.md'),'[Coding](coding.md)');
 await fs.writeFile(path.join(base,'rules.json'),JSON.stringify({schemaVersion:1,rules:[{id:'CODE-001',statement:'Names',scope:['**'],status:'observed',document:'docs/project-baseline/coding.md'}]}));
 assert.equal((await baselineCheck(root)).status,'BLOCK');await fs.appendFile(path.join(base,'coding.md'),'\nCODE-001');assert.equal((await baselineCheck(root)).status,'WARN');
});
test('optional baseline, scoped routing, adoption and stale evidence',async t=>{
 const root=await fixture(t);assert.equal((await baselineContext(root)).present,false);
 const file=path.join(root,'docs/project-baseline/rules.json');
 await fs.writeFile(path.join(root,'docs/project-baseline/architecture.md'),'# Architecture\n');
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,rules:[{id:'ARCH-001',status:'observed',statement:'Use public entry',scope:['src/orders/**'],document:'docs/project-baseline/architecture.md'}]}));
 const before=await baselineContext(root);assert.equal((await baselineContext(root,['src/other/a.js'])).rules.length,0);
 assert.equal((await baselineContext(root,['src/orders/a.js'])).rules.length,1);
 await assert.rejects(adoptRules(root,{ids:['ARCH-001']}),/confirmation/);
 const adopted=await adoptRules(root,{confirm:true,by:'maintainer',reason:'Agreed module boundary',ids:['ARCH-001'],fingerprint:before.fingerprint});
 assert.equal(adopted.rules[0].status,'adopted');
 assert.throws(()=>validateRuleReferences(adopted,[]),/Missing adopted/);
 validateRuleReferences(adopted,[{id:'ARCH-001',status:'PASS',evidence:'Uses public entry'}]);
 await assert.rejects(adoptRules(root,{confirm:true,by:'m',reason:'r',ids:['ARCH-001'],fingerprint:before.fingerprint}),/stale/);
 await fs.appendFile(path.join(root,'docs/project-baseline/architecture.md'),'Updated');
 assert.notEqual((await baselineContext(root)).fingerprint,adopted.fingerprint);
});
test('reject duplicate IDs, unsafe documents and fabricated adoption',async t=>{
 const root=await fixture(t);const file=path.join(root,'docs/project-baseline/rules.json');
 const rule={id:'CODE-001',statement:'Names',status:'adopted',scope:['src/**'],document:'../outside.md'};
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,rules:[rule]}));
 await assert.rejects(baselineContext(root),/approval/);
 rule.status='observed';await fs.writeFile(file,JSON.stringify({schemaVersion:1,rules:[rule]}));await assert.rejects(baselineContext(root),/path/);
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,rules:[rule,rule]}));await assert.rejects(baselineContext(root),/Invalid baseline rule/);
});
test('workflow exposes baseline routing without a change ID and preserves absent-registry compatibility',async t=>{
 const root=await fixture(t);
 const result=await workflow({action:'baseline-context',project:root,paths:['src/a.ts']});
 assert.equal(result.present,false);
 await assert.rejects(workflow({action:'baseline-adopt',project:root,ids:['ARCH-001']}),/confirmation/);
});
