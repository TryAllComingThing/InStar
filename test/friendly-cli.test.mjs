import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {parseWorkflowArgs} from '../runtime/workflow-controller/friendly-cli.mjs';
import {laneDefinition,riskMinimumLane} from '../runtime/shared/efficiency.mjs';
import {run as runWorkflow} from '../runtime/workflow-controller/index.mjs';

const root=path.resolve(import.meta.dirname,'..');

async function fixture(t){
 const created=await mkdtemp(path.join(tmpdir(),'instar-cli-'));
 const project=await import('node:fs/promises').then(fs=>fs.realpath(created));
 t.after(()=>rm(project,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 return project;
}

test('micro and quick lanes expose smaller targets while keeping risk floors',()=>{
 assert.deepEqual(laneDefinition('micro').targetMinutes,[10,20]);
 assert.equal(laneDefinition('micro').budgets.totalTokens,12000000);
 assert.deepEqual(laneDefinition('quick').targetMinutes,[20,30]);
 assert.equal(laneDefinition('quick').budgets.qualityGateRuns,1);
 assert.equal(riskMinimumLane('L1'),'micro');
 assert.equal(riskMinimumLane('L2'),'standard');
 assert.equal(riskMinimumLane('L3'),'regulated');
});

test('micro lane can start a small L1 workflow without lowering L2/L3 floors',async t=>{
 const project=await fixture(t),document=path.join(project,'prd.md');
 await writeFile(document,'# PRD\nTiny copy update.\n');
 const started=await runWorkflow({action:'start',project,changeId:'tiny-copy',lane:'micro',affectedPaths:['src/tiny.js'],document:'# PRD\nTiny copy update.\n'});
 assert.equal(started.efficiency.lane,'micro');
 assert.equal(started.efficiency.targetMinutes[1],20);
 assert.equal(started.efficiency.riskFloor,'micro');
});

test('friendly CLI parses flow, document, discovery and dry-run commands',async t=>{
 const project=await fixture(t),document=path.join(project,'prd.md'),input=path.join(project,'request.json');
 await writeFile(document,'# PRD\nTiny update.\n');
 await writeFile(input,JSON.stringify({action:'write-tasks',contextHash:'abc',document:'- [ ] 1.1 Update copy.'}));
 const status=await parseWorkflowArgs(['flow','status','--project',project,'--change','tiny-copy','--json'],root);
 assert.equal(status.type,'inspect');
 assert.equal(status.command,'status');
 assert.equal(status.mode.json,true);
 assert.equal(status.project,project);
 const start=await parseWorkflowArgs(['flow','start','--project',project,'--change','tiny-copy','--document',document,'--profile','micro','--affected','src/tiny.js','--dry-run'],root);
 assert.equal(start.type,'workflow');
 assert.equal(start.request.lane,'micro');
 assert.deepEqual(start.request.affectedPaths,['src/tiny.js']);
 assert.equal(start.mode.dryRun,true);
 assert.match(start.request.document,/Tiny update/);
 const action=await parseWorkflowArgs(['flow','action','write-tasks','--project',project,'--input',input],root);
 assert.equal(action.request.action,'write-tasks');
 assert.equal(action.request.contextHash,'abc');
 const standards=await parseWorkflowArgs(['find','standards','--project',project,'--path','src/orders.ts','--changed'],root);
 assert.equal(standards.request.action,'standards-context');
 assert.deepEqual(standards.request.paths,['src/orders.ts']);
 assert.equal(standards.changed,true);
 const doc=await parseWorkflowArgs(['doc','show','--project',project,'--kind','design','--change','tiny-copy'],root);
 assert.equal(doc.kind,'design');
 const cost=await parseWorkflowArgs(['cost','show','--project',project],root);
 assert.equal(cost.command,'cost');
 const resume=await parseWorkflowArgs(['flow','context','--project',project,'--change','tiny-copy','--resume','--brief'],root);
 assert.equal(resume.resume,true);
 assert.equal(resume.mode.brief,true);
 const help=await parseWorkflowArgs(['flow','start','--help','--json'],root);
 assert.equal(help.type,'help');
 assert.equal(help.topic,'flow start');
 assert.equal(help.mode.json,true);
 const mismatchInput=path.join(project,'mismatch.json');
 await writeFile(mismatchInput,JSON.stringify({action:'write-tasks',project:path.join(project,'elsewhere')}));
 await assert.rejects(parseWorkflowArgs(['flow','action','write-tasks','--project',project,'--input',mismatchInput],root),/does not match/);
});

test('instar explain and cost lanes are available through the top-level command',()=>{
 const explain=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'explain','--json'],{cwd:root,encoding:'utf8'});
 assert.equal(explain.status,0,explain.stderr);
 const payload=JSON.parse(explain.stdout);
 assert.match(payload.text,/project-owned rules first/);
 const lanes=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'cost','lanes','--json'],{cwd:root,encoding:'utf8'});
 assert.equal(lanes.status,0,lanes.stderr);
 assert.deepEqual(JSON.parse(lanes.stdout).lanes.map(item=>item.lane),['micro','quick','fast','standard','regulated']);
 const brief=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'cost','lanes','--brief'],{cwd:root,encoding:'utf8'});
 assert.equal(brief.status,0,brief.stderr);
 assert.deepEqual(brief.stdout.trim().split('\n').map(line=>line.split(' ')[0]),['micro','quick','fast','standard','regulated']);
 const compact=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'cost','lanes','--json','--brief'],{cwd:root,encoding:'utf8'});
 assert.equal(compact.status,0,compact.stderr);
 assert.equal(compact.stdout.trim().split('\n').length,1);
 const help=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'flow','start','--help','--json'],{cwd:root,encoding:'utf8'});
 assert.equal(help.status,0,help.stderr);
 assert.match(JSON.parse(help.stdout).text,/Usage: instar flow/);
 const textError=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'flow','start'],{cwd:root,encoding:'utf8'});
 assert.equal(textError.status,1);
 assert.match(textError.stderr,/^BLOCK:/);
 const jsonError=spawnSync(process.execPath,[path.join(root,'bin/instar.mjs'),'flow','start','--json'],{cwd:root,encoding:'utf8'});
 assert.equal(jsonError.status,1);
 assert.equal(JSON.parse(jsonError.stderr).status,'BLOCK');
});
