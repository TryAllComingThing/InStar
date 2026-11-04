import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 applicableProjectStandards,
 loadProjectStandards,
 matchesStandardPath,
 validateComplianceMatrix,
 validateStandardsReferences,
} from '../runtime/shared/project-standards.mjs';
import {reviewItemsFor,run as runQuality} from '../runtime/quality-controller/index.mjs';
import {run as runWorkflow} from '../runtime/workflow-controller/index.mjs';

async function projectFixture(t){
 const created=await mkdtemp(path.join(tmpdir(),'instar-standards-'));
 const project=await import('node:fs/promises').then(fs=>fs.realpath(created));
 t.after(()=>rm(project,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 return project;
}

async function writeManifest(project,entries){
 await mkdir(path.join(project,'standards'),{recursive:true});
 await writeFile(path.join(project,'standards/index.json'),JSON.stringify({schemaVersion:1,entries},null,2)+'\n');
}

test('project standards manifest selects applicable mandatory rules and fingerprints only matching rules',async t=>{
 const project=await projectFixture(t);
 await mkdir(path.join(project,'standards/architecture'),{recursive:true});
 await mkdir(path.join(project,'standards/api'),{recursive:true});
 await mkdir(path.join(project,'standards/docs'),{recursive:true});
 await writeFile(path.join(project,'standards/architecture/ARCH.md'),'# Architecture\nUse public entries.\n');
 await writeFile(path.join(project,'standards/api/API.md'),'# API\nDefine contracts.\n');
 await writeFile(path.join(project,'standards/docs/DOCS.md'),'# Docs\nKeep docs current.\n');
 const entries=[
  {id:'ARCH-001',path:'standards/architecture/ARCH.md',mandatory:true,appliesTo:['src/**'],summary:'Use public entries.'},
  {id:'API-001',path:'standards/api/API.md',mandatory:true,appliesTo:['src/api/**'],summary:'Define API contracts.'},
  {id:'DOC-001',path:'standards/docs/DOCS.md',mandatory:true,appliesTo:['docs/**'],summary:'Keep docs current.'},
  {id:'STYLE-001',path:'standards/architecture/ARCH.md',mandatory:false,appliesTo:['src/**'],summary:'Naming style.'},
 ];
 await writeManifest(project,entries);
 const catalog=await loadProjectStandards(project,[]);
 assert.equal(catalog.manifestPresent,true);
 assert.equal(catalog.manifestPath,'standards/index.json');
 assert.deepEqual(catalog.entries.map(item=>item.id).sort(),['API-001','ARCH-001','DOC-001','STYLE-001']);
 assert.equal(matchesStandardPath('src/**','src/orders/index.ts'),true);
 assert.equal(matchesStandardPath('src/api/**','src/orders/index.ts'),false);
 const applicable=applicableProjectStandards(catalog,['src/orders/index.ts']);
 assert.deepEqual(applicable.entries.map(item=>item.id).sort(),['ARCH-001','STYLE-001']);
 assert.deepEqual(applicable.mandatoryEntries.map(item=>item.id),['ARCH-001']);
 const unknown=applicableProjectStandards(catalog,[]);
 assert.equal(unknown.status,'UNKNOWN');
 assert.deepEqual(unknown.mandatoryEntries,[]);
 assert.ok(unknown.unknownEntries.some(item=>item.id==='ARCH-001'));
 const before=applicable.fingerprint;
 await writeFile(path.join(project,'standards/docs/NEW.md'),'# New docs rule\n');
 await writeManifest(project,[...entries,{id:'DOC-002',path:'standards/docs/NEW.md',mandatory:true,appliesTo:['docs/**'],summary:'New docs rule.'}]);
 const refreshed=applicableProjectStandards(await loadProjectStandards(project,[]),['src/orders/index.ts']);
 assert.equal(refreshed.fingerprint,before,'unrelated standards must not invalidate the applicable design fingerprint');
 await writeFile(path.join(project,'standards/architecture/ARCH.md'),'# Architecture\nUse public entries and stable boundaries.\n');
 const changed=applicableProjectStandards(await loadProjectStandards(project,[]),['src/orders/index.ts']);
 assert.notEqual(changed.fingerprint,before,'changed applicable rule must invalidate design context');
});

test('compliance matrix and review references require every applicable mandatory rule',async()=>{
 const entries=[
  {id:'ARCH-001',path:'standards/architecture/ARCH.md',mandatory:true},
  {id:'API-001',path:'standards/api/API.md',mandatory:true},
 ];
 const document='## Compliance Matrix\n\n| Rule | Source | Status | Evidence |\n| --- | --- | --- | --- |\n| `ARCH-001` | `standards/architecture/ARCH.md` | PASS | Public entry retained |\n| `API-001` | `standards/api/API.md` | PASS | Contract updated |\n';
 const result=validateComplianceMatrix(document,entries);
 assert.equal(result.status,'PASS');
 assert.throws(()=>validateComplianceMatrix('## Context\nMissing matrix',entries),/Compliance Matrix section/);
 assert.throws(()=>validateComplianceMatrix(document.replace(/API-001.*\n/,''),entries),/missing mandatory project standard: API-001/);
 assert.throws(()=>validateComplianceMatrix(document.replace('PASS | Contract updated','MAYBE | Contract updated'),entries),/must be PASS, WARN or NA/);
 const references=validateStandardsReferences(entries,[
  {id:'ARCH-001',status:'PASS',evidence:'src/orders/index.ts uses the public entry point'},
  {id:'API-001',status:'PASS',evidence:'src/api/orders.ts defines the request contract'},
 ]);
 assert.equal(references.status,'PASS');
 assert.throws(()=>validateStandardsReferences(entries,[{id:'ARCH-001',status:'PASS',evidence:'only one'}]),/missing applicable mandatory project standard: API-001/);
 assert.throws(()=>validateStandardsReferences(entries,[{id:'UNKNOWN',status:'PASS',evidence:'x'}]),/Unknown or inapplicable/);
 assert.throws(()=>validateStandardsReferences(entries,[{id:'ARCH-001',status:'PASS',evidence:''}]),/requires evidence/);
});

test('configured standards roots drive workflow standards context and compliance checks',async t=>{
 const project=await projectFixture(t);
 await mkdir(path.join(project,'docs/engineering/rules'),{recursive:true});
 await writeFile(path.join(project,'docs/engineering/rules/API.md'),'# API rule\nUse explicit contracts.\n');
 await writeFile(path.join(project,'docs/engineering/index.json'),JSON.stringify({schemaVersion:1,entries:[{id:'API-001',path:'docs/engineering/rules/API.md',mandatory:true,appliesTo:['src/api/**'],summary:'Use explicit contracts.'}]},null,2)+'\n');
 await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main',context:{standards:['docs/engineering']},review:{language:'typescript',framework:'none'}},null,2)+'\n');
 const context=await runWorkflow({action:'standards-context',project,paths:['src/api/orders.ts']});
 assert.deepEqual(context.catalog.roots,['docs/engineering']);
 assert.deepEqual(context.applicable.mandatoryEntries.map(item=>item.id),['API-001']);
 const document='## Compliance Matrix\n\n| Rule | Source | Status | Evidence |\n| --- | --- | --- | --- |\n| `API-001` | `docs/engineering/rules/API.md` | PASS | Explicit request contract |\n';
 const checked=await runWorkflow({action:'standards-check',project,paths:['src/api/orders.ts'],document});
 assert.equal(checked.status,'PASS');
});

test('write-design rejects a missing Compliance Matrix for an applicable mandatory rule',async t=>{
 const project=await projectFixture(t);
 await mkdir(path.join(project,'standards/architecture'),{recursive:true});
 await writeFile(path.join(project,'standards/architecture/ARCH.md'),'# Architecture\nUse public module entry points.\n');
 await writeManifest(project,[{id:'ARCH-001',path:'standards/architecture/ARCH.md',mandatory:true,appliesTo:['src/**'],summary:'Use public module entry points.'}]);
 const base={project,changeId:'standards-flow'};let state;
 const call=async(action,extra={})=>{if(action==='write-design'&&extra.reuseDecisions===undefined)extra={...extra,reuseDecisions:[{need:'Check existing implementation',searched:['src'],candidates:[],decision:'local-new',reason:'No capability inventory',verification:'Focused tests'}]};const result=await runWorkflow({...base,action,expectedVersion:state?.version,...extra});if(result.version)state=result;return result;};
 const approve=()=>call('approve',{reviewHash:state.pendingReview.hash,intentId:state.pendingReview.intentId,challenge:state.pendingReview.challenge,confirmation:{text:'Approved fixture',source:'test'}});
 await call('start',{affectedPaths:['src/orders/index.ts'],document:'# PRD\nAdd order status.'});
 await call('submit-prd');await approve();
 let context=await call('context');
 await call('create-spec',{contextHash:context.contextHash,proposal:'## Why\nAdd status.\n## What Changes\nAdd status.\n## Capabilities\norders\n## Impact\nOrder module.',specs:{orders:'## Purpose\nExpose order status for existing consumers.\n\n## ADDED Requirements\n### Requirement: Status\nThe system SHALL expose order status.\n\n#### Scenario: Read\n- **WHEN** an order is read\n- **THEN** its status is returned\n'}});
 await call('submit-spec',{report:{summary:'Reviewed',source:'fixture',issues:[],unverified:[]}});await approve();
 context=await call('context');
 const sections=['Context','Goals / Non-Goals','Decisions','Project Constraints','Architecture','File Change Plan','Risks / Trade-offs','Migration Plan'];
 const withoutMatrix=sections.map(name=>`## ${name}\nFixture detail.`).join('\n');
 await assert.rejects(call('write-design',{contextHash:context.contextHash,document:withoutMatrix}),/Compliance Matrix section/);
 const withMatrix=`${withoutMatrix}\n\n## Compliance Matrix\n\n| Rule | Source | Status | Evidence |\n| --- | --- | --- | --- |\n| \`ARCH-001\` | \`standards/architecture/ARCH.md\` | PASS | src/orders/index.ts will use the public module entry point |\n`;
 const written=await call('write-design',{contextHash:context.contextHash,document:withMatrix});
 assert.equal(written.stage,'tasks');
 assert.equal(written.designCompliance.status,'PASS');
 assert.deepEqual(written.designCompliance.required,['ARCH-001']);
});

test('review profiles include React, Node, Rust and .NET-specific checks',()=>{
 const react=reviewItemsFor({review:{language:'typescript',framework:'react'}});
 assert.equal(react.includes('hooks-rules'),true);
 assert.equal(react.includes('effect-cleanup'),true);
 const multi=reviewItemsFor({review:{language:['typescript','python'],framework:['react']}});
 assert.equal(multi.includes('api-contract'),true);
 const node=reviewItemsFor({review:{language:'node',framework:'node'}});
 assert.equal(node.includes('async-errors'),true);
 assert.equal(node.includes('resource-cleanup'),true);
 assert.equal(reviewItemsFor({review:{language:'rust',framework:'none'}}).includes('unsafe-usage'),true);
 assert.equal(reviewItemsFor({review:{language:'csharp',framework:'dotnet'}}).includes('nullable-safety'),true);
});

test('quality review requires references for applicable mandatory standards',async t=>{
 const project=await projectFixture(t),entry='src/orders/index.ts';
 await mkdir(path.join(project,'src/orders'),{recursive:true});
 await mkdir(path.join(project,'standards/architecture'),{recursive:true});
 await writeFile(path.join(project,entry),'export const status = "new";\n');
 await writeFile(path.join(project,'standards/architecture/ARCH.md'),'# Architecture\nUse public module entry points.\n');
 await writeManifest(project,[{id:'ARCH-001',path:'standards/architecture/ARCH.md',mandatory:true,appliesTo:['src/**'],summary:'Use public module entry points.'}]);
 const reviewConfig={schemaVersion:2,packageManager:'npm',baseRef:'main',context:{},review:{language:'typescript',framework:'none'}};
 await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify(reviewConfig,null,2)+'\n');
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 git('init','-b','main');git('config','user.email','standards@example.invalid');git('config','user.name','Standards fixture');git('add','.');git('commit','-m','baseline');
 await writeFile(path.join(project,entry),'export const status = "updated";\n');
 const snapshot=await runQuality({action:'snapshot',project});
 const items=reviewItemsFor(reviewConfig);
 const review={reviewer:'standards-fixture',fingerprint:snapshot.fingerprint,checks:items.map(id=>({id,status:'PASS',evidence:`Reviewed ${entry} for ${id}`}))};
 await assert.rejects(runQuality({action:'quality-gate',project,review}),/standardsReferences/);
 const passed=await runQuality({action:'quality-gate',project,review:{...review,standardsReferences:[{id:'ARCH-001',status:'PASS',evidence:`${entry}:1 uses the public module entry point`}]}});
 assert.equal(passed.status,'PASS');
 assert.deepEqual(passed.standards.required,['ARCH-001']);
 assert.deepEqual(passed.standards.present,['ARCH-001']);
});

test('explicit standards conflicts are explained and supersession resolves them',async t=>{
 const project=await projectFixture(t);
 await mkdir(path.join(project,'standards/architecture'),{recursive:true});
 await writeFile(path.join(project,'standards/architecture/OLD.md'),'# Old\nServices own writes.\n');
 await writeFile(path.join(project,'standards/architecture/NEW.md'),'# New\nRepositories own writes.\n');
 const left={id:'ARCH-OLD',path:'standards/architecture/OLD.md',mandatory:true,appliesTo:['src/**'],summary:'Service writes.'};
 const right={id:'ARCH-NEW',path:'standards/architecture/NEW.md',mandatory:true,appliesTo:['src/**'],summary:'Repository writes.',conflictsWith:['ARCH-OLD']};
 await writeManifest(project,[left,right]);
 let applicable=applicableProjectStandards(await loadProjectStandards(project,[]),['src/orders/index.ts']);
 assert.equal(applicable.status,'CONFLICT');
 assert.equal(applicable.conflictStatus,'HUMAN_DECISION_REQUIRED');
 assert.equal(applicable.conflicts.length,1);
 assert.match(applicable.conflicts[0].resolution,/owner must reconcile/);
 const before=applicable.fingerprint;
 await writeManifest(project,[left,{...right,supersedes:['ARCH-OLD']}]);
 applicable=applicableProjectStandards(await loadProjectStandards(project,[]),['src/orders/index.ts']);
 assert.equal(applicable.conflictStatus,'RESOLVED');
 assert.equal(applicable.conflicts[0].winnerId,'ARCH-NEW');
 assert.notEqual(applicable.fingerprint,before);
 await writeManifest(project,[left,{...right,supersedes:['ARCH-UNKNOWN']}]);
 await assert.rejects(loadProjectStandards(project,[]),/references unknown rule: ARCH-UNKNOWN/);
});
