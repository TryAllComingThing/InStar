import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,cp,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run} from '../runtime/discovery-controller/index.mjs';
import {validateDiscoveredSpec} from '../runtime/openspec-min/src/discovery/validate.js';
import {run as workflow} from '../runtime/workflow-controller/index.mjs';
import {createSpecChange,runSpecVerifyGate} from '../runtime/openspec-min/entry.js';

const source = 'export function search(orders, query) {\n  return orders.filter(order => order.name.includes(query));\n}\n';
const document = '# Order search\n\n## Purpose\nRecords the current local order search.\n\n## Requirements\n\n### Requirement: Search orders\nThe UI SHALL filter orders whose names contain the query.\n\n#### Scenario: Matching name\n- **WHEN** the query is part of an order name\n- **THEN** that order is included.\n\n## Known limitations\nRemote APIs are not implemented in this fixture.\n';
async function fixture(t) {
  const project = await mkdtemp(path.join(tmpdir(),'instar-discover-'));
  t.after(()=>rm(project,{recursive:true,force:true}));
  await mkdir(path.join(project,'src'));
  await writeFile(path.join(project,'src/orders.js'),source);
  return project;
}
async function request(project,extra={}) {
  const context = await run({action:'context',project,...extra});
  return {action:'capture',project,scopes:context.scopes,contextHash:context.contextHash,specs:{'orders/search':document},evidence:{'orders/search':[{requirement:'Search orders',path:'src/orders.js',startLine:1,endLine:3,excerpt:'return orders.filter(order => order.name.includes(query));'}]},reviewedFiles:['src/orders.js'],limitations:['Static source analysis only']};
}

test('discovery preview is read-only; capture creates baselines without initialization or PRD',async t=>{
  const project=await fixture(t), input=await request(project);
  const before=await readdir(project);
  const preview=await run({...input,preview:true});
  assert.equal(preview.status,'PREVIEW');assert.deepEqual(await readdir(project),before);
  assert.equal(preview.changes[0].path,'planning/specs/orders/search/spec.md');
  const result=await run(input);
  assert.equal(result.status,'PASS');assert.equal(result.reviewStatus,'not-human-reviewed');
  const saved=await readFile(path.join(project,'planning/specs/orders/search/spec.md'),'utf8');
  assert.match(saved,/## Discovery evidence/);assert.match(saved,/src\/orders.js/);
  assert.equal(validateDiscoveredSpec('orders/search',saved).requirements.length,1);
  const report=JSON.parse(await readFile(path.join(project,result.reportPath),'utf8'));
  assert.deepEqual(report.coverage.reviewedFiles,['src/orders.js']);
  assert.equal(report.evidence['orders/search'][0].excerpt,undefined);
  for(const file of ['.instar.json','docs/prd','planning/changes','planning/workflows'])await assert.rejects(access(path.join(project,file)),{code:'ENOENT'});
  assert.equal(await readFile(path.join(project,'src/orders.js'),'utf8'),source);
});

test('scope discovery preserves ancestor guidance, exclusions and honest unreviewed coverage',async t=>{
  const project=await fixture(t);
  await writeFile(path.join(project,'AGENTS.md'),'Project rules');
  await writeFile(path.join(project,'src/AGENTS.md'),'Module rules');
  await writeFile(path.join(project,'src/unused.js'),'export const unused = true;');
  await writeFile(path.join(project,'.env'),'PRIVATE_DATA=never-read');
  await mkdir(path.join(project,'node_modules'));await writeFile(path.join(project,'node_modules/private.js'),'secret');
  await symlink(path.join(project,'src/orders.js'),path.join(project,'src/link.js'));
  const context=await run({action:'context',project,scopes:['src']});
  assert.ok(context.inventory['AGENTS.md']);assert.ok(context.inventory['src/AGENTS.md']);
  assert.equal(context.inventory['.env'],undefined);assert.equal(context.inventory['src/link.js'],undefined);
  assert.ok(context.omitted.some(x=>x.path==='src/link.js'));
  const result=await run({...await request(project,{scopes:['src']}),preview:true});
  assert.ok(result.coverage.unreviewedFiles.includes('src/unused.js'));
  await assert.rejects(run({action:'context',project,scopes:['../outside']}),/relative/);
  await assert.rejects(run({action:'context',project,scopes:['.env']}),/Excluded/);
  await assert.rejects(run({action:'context',project,scopes:['src/link.js']}),/Symlink/i);
});

test('source edits, additions, deletions and baseline edits invalidate capture context',async t=>{
  for(const mutation of ['edit','add','delete','baseline']) {
    const project=await fixture(t), input=await request(project);
    if(mutation==='edit')await writeFile(path.join(project,'src/orders.js'),source+'// changed\n');
    if(mutation==='add')await writeFile(path.join(project,'src/new.js'),'export const newBehavior = true;');
    if(mutation==='delete')await rm(path.join(project,'src/orders.js'));
    if(mutation==='baseline'){await mkdir(path.join(project,'planning/specs/other'),{recursive:true});await writeFile(path.join(project,'planning/specs/other/spec.md'),document);}
    await assert.rejects(run(input),/context changed/);
    await assert.rejects(access(path.join(project,'planning/specs/orders/search/spec.md')),{code:'ENOENT'});
  }
});

test('invalid evidence and unreviewed sources never create planning files',async t=>{
  const project=await fixture(t), original=await request(project);
  for(const modify of [
    x=>x.evidence['orders/search'][0].excerpt='invented implementation',
    x=>x.evidence['orders/search'][0].endLine=900,
    x=>x.evidence['orders/search'][0].requirement='Unknown behavior',
    x=>x.evidence['orders/search'][0].path='src/missing.js',
    x=>x.evidence['orders/search']=[],
    x=>x.reviewedFiles=[],
  ]) {const input=structuredClone(original);modify(input);await assert.rejects(run(input));}
  await assert.rejects(access(path.join(project,'planning')),{code:'ENOENT'});
});

test('explicit baseline update preserves unrelated specs and retains previous content in backups',async t=>{
  const project=await fixture(t);await run(await request(project));
  const target=path.join(project,'planning/specs/orders/search/spec.md');
  const previous=await readFile(target,'utf8');
  await mkdir(path.join(project,'planning/specs/other'),{recursive:true});await writeFile(path.join(project,'planning/specs/other/spec.md'),document);
  const input=await request(project);input.specs['orders/search']=document.replace('Records the current','Documents the existing');
  await assert.rejects(run(input),/Existing baseline protected/);
  const result=await run({...input,update:['orders/search']});
  assert.equal(result.changes[0].operation,'update');
  assert.equal(await readFile(path.join(project,'planning/specs/other/spec.md'),'utf8'),document);
  const transactions=await readdir(path.join(project,'.workflow/transactions'));
  const backups=[];
  for(const id of transactions){try{backups.push(await readFile(path.join(project,'.workflow/transactions',id,'before/planning/specs/orders/search/spec.md'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
  assert.ok(backups.includes(previous));
});

test('main-spec validation rejects deltas, duplicates, missing and fenced-only scenarios',()=>{
  assert.equal(validateDiscoveredSpec('orders/search',document).requirements[0].name,'Search orders');
  for(const invalid of [
    document.replace('## Requirements','## ADDED Requirements'),
    document.replace('The UI SHALL','The UI should'),
    document.replace('**THEN**','**LATER**'),
    document.replace('#### Scenario: Matching name','#### Example: Matching name'),
    document.replace('#### Scenario: Matching name','```\n#### Scenario: Matching name').replace('## Known limitations','```\n## Known limitations'),
    document.replace('## Known limitations','### Requirement: Search orders\nThe UI MUST filter.\n#### Scenario: Duplicate\nWHEN queried THEN filtered\n\n## Known limitations'),
    document.replace('## Known limitations','### Requirement: Extra\nThe UI MUST filter.\n#### Scenario: Empty\n\n## Known limitations'),
  ]) assert.throws(()=>validateDiscoveredSpec('orders/search',invalid));
  assert.throws(()=>validateDiscoveredSpec('orders/search',document.replace('## Purpose','<!--\n## Purpose\n-->\n## Purpose')),/comments cannot contain Markdown headings/);
  const commentedFence=document.replace('## Purpose','<!-- ``` -->\n## Purpose');
  assert.equal(validateDiscoveredSpec('orders/search',commentedFence).requirements.length,1);
  const duplicateScenario=document.replace('## Known limitations','#### Scenario: Matching name\n- **WHEN** another matching query is entered\n- **THEN** matching orders appear.\n\n## Known limitations');
  assert.throws(()=>validateDiscoveredSpec('orders/search',duplicateScenario),/duplicate or empty scenario name/i);
  const duplicateRequirement=document.replace('## Known limitations','### Requirement: Search orders\nThe UI MUST filter matching orders.\n#### Scenario: Other match\n- **WHEN** a matching query is entered\n- **THEN** matching orders appear.\n\n## Known limitations');
  assert.throws(()=>validateDiscoveredSpec('orders/search',duplicateRequirement),/duplicates the requirement/i);
});

test('scenario-only baseline edits are reported in preview',async t=>{
  const project=await fixture(t), twoScenarios=document.replace('\n## Known limitations','\n#### Scenario: No match\n- **WHEN** no order name matches\n- **THEN** no orders are included.\n\n## Known limitations');
  const initial=await request(project);initial.specs['orders/search']=twoScenarios;await run(initial);
  const input=await request(project);input.update=['orders/search'];
  input.specs['orders/search']=document;
  const preview=await run({...input,preview:true});
  assert.deepEqual(preview.changes[0].requirementChanges.scenarios.removed,['Search orders/No match']);
});

test('invalid unrelated baselines are reported without blocking scoped discovery',async t=>{
  const project=await fixture(t);await mkdir(path.join(project,'planning/specs/unrelated'),{recursive:true});
  await writeFile(path.join(project,'planning/specs/unrelated/spec.md'),'not a valid main spec');
  const context=await run({action:'context',project,scopes:['src']});
  assert.equal(context.baselineIndex.unrelated.invalid !== undefined,true);
  assert.ok(context.baselineIssues.some(x=>x.path==='planning/specs/unrelated/spec.md'));
  assert.ok(context.omitted.some(x=>x.path==='planning'));
});

test('baseline roots and workflow lock directories reject symlinks',async t=>{
  const project=await fixture(t), outside=await mkdtemp(path.join(tmpdir(),'instar-outside-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await mkdir(path.join(outside,'specs'),{recursive:true});
  await symlink(outside,path.join(project,'planning'));
  await assert.rejects(run({action:'context',project}),/Symlinks are unsupported|Unsafe baseline directory/);
  await rm(path.join(project,'planning'));
  const input=await request(project);
  await symlink(outside,path.join(project,'.workflow'));
  await assert.rejects(run(input),/Symlink/);
  assert.deepEqual(await readdir(outside),['specs']);
});

test('all documents validate before writing, and unsafe output links are rejected',async t=>{
  const project=await fixture(t), input=await request(project);
  input.specs['another']='invalid document';
  await assert.rejects(run(input));await assert.rejects(access(path.join(project,'planning')),{code:'ENOENT'});
  const outside=await mkdtemp(path.join(tmpdir(),'instar-discover-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await symlink(outside,path.join(project,'planning'));
  await assert.rejects(run({action:'context',project}),/Symlink/i);
  assert.deepEqual(await readdir(outside),[]);
});

test('ordinary write failure rolls back the whole baseline package',async t=>{
  const project=await fixture(t);
  await mkdir(path.join(project,'planning/specs'),{recursive:true});
  await writeFile(path.join(project,'planning/discovery'),'obstruct report directory');
  const input=await request(project);
  await assert.rejects(run(input),/Unsafe output path|ENOTDIR/);
  assert.deepEqual(await readdir(path.join(project,'planning/specs')),[]);
  assert.equal(await readFile(path.join(project,'planning/discovery'),'utf8'),'obstruct report directory');
  await assert.rejects(access(path.join(project,'.workflow/pending.json')),{code:'ENOENT'});
});

test('standalone interrupted discovery can recover without initialization',async t=>{
  const project=await fixture(t), id='12345678-1234-1234-1234-123456789012';
  const backup=`.workflow/transactions/${id}`;
  await mkdir(path.join(project,backup,'before/planning/specs/orders/search'),{recursive:true});
  await writeFile(path.join(project,backup,'before/planning/specs/orders/search/spec.md'),document);
  await mkdir(path.join(project,'planning'),{recursive:true});await writeFile(path.join(project,'planning/partial.md'),'partial');
  await writeFile(path.join(project,'.workflow/pending.json'),JSON.stringify({id,backup,present:{planning:true,'docs/prd':false}}));
  await assert.rejects(run({action:'context',project}),/Recovery required/);
  await assert.rejects(run({action:'recover',project,transactionId:'wrong',reason:'fixture'}),/mismatch/);
  assert.equal((await run({action:'recover',project,transactionId:id,reason:'fixture interrupted capture'})).recovered,id);
  assert.equal(await readFile(path.join(project,'planning/specs/orders/search/spec.md'),'utf8'),document);
  await assert.rejects(access(path.join(project,'planning/partial.md')),{code:'ENOENT'});
});

test('captured baseline works with existing workflow context and OpenSpec MODIFIED gate',async t=>{
  const project=await fixture(t);await run(await request(project));
  const s=await workflow({action:'start',project,changeId:'new-search',document:'# PRD\nChange search behavior.'});
  const pending=await workflow({action:'submit-prd',project,changeId:'new-search',expectedVersion:s.version});
  await workflow({action:'approve',project,changeId:'new-search',expectedVersion:pending.version,reviewHash:pending.pendingReview.hash,confirmation:{text:'Approved fixture PRD',source:'test'}});
  const ctx=await workflow({action:'context',project,changeId:'new-search'});
  assert.match(ctx.context.baseline['orders/search'],/Discovery evidence/);
  const ref={root:path.join(project,'planning'),changeId:'modified-search'};
  await createSpecChange({...ref,prd:'Change search',generate:async()=>({proposal:'# Change\n## Why\nImprove search\n## What Changes\nCase insensitive matching\n## Capabilities\norders/search\n## Impact\nSearch only',specs:{'orders/search':'## MODIFIED Requirements\n### Requirement: Search orders\nThe UI SHALL match names without case sensitivity.\n#### Scenario: Matching name\nWHEN a query matches THEN the order is included.\n#### Scenario: Different case\nWHEN case differs THEN the order is included.\n'}})});
  const gate=await runSpecVerifyGate(ref);assert.equal(gate.valid,true,JSON.stringify(gate.issues));
});

test('relocated plugin CLI exposes discovery and captures UTF-8 specs with bundled runtime only',async t=>{
  const project=await fixture(t), parent=await mkdtemp(path.join(tmpdir(),'instar-discovery-cli-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const plugin=path.join(parent,'plugin with spaces');await mkdir(plugin);
  for(const name of ['runtime','bin'])await cp(new URL(`../${name}`,import.meta.url),path.join(plugin,name),{recursive:true});
  function cli(args,input){return spawnSync(process.execPath,[path.join(plugin,'bin/instar.mjs'),'spec-discover',...args],{cwd:project,input,encoding:'utf8',env:{...process.env,NODE_PATH:''}});}
  const context=cli(['--scope','src']);assert.equal(context.status,0,context.stderr);
  const input=await request(project,{scopes:['src']});input.specs['orders/search']=document.replace('Order search','订单搜索');
  const result=cli(['-'],JSON.stringify(input));assert.equal(result.status,0,result.stderr);
  assert.match(await readFile(path.join(project,'planning/specs/orders/search/spec.md'),'utf8'),/订单搜索/);
  const invalid=cli(['--unknown']);assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stderr).status,'BLOCK');
  const oversized=cli(['-'],' '.repeat(8*1024*1024+1));assert.equal(oversized.status,1);assert.match(JSON.parse(oversized.stderr).error,/exceeds 8388608 byte limit|Input exceeds 8388608 byte limit/);
});
