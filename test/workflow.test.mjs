import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run,initialize} from '../runtime/workflow-controller/index.mjs';
import {transaction,putJson,lock,fs} from '../runtime/workflow-controller/files.mjs';
const proposal='## Why\nUsers need search.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nFrontend.';
const delta='## Purpose\nEnable users to find relevant orders using clear and consistent search behavior.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search orders.\n#### Scenario: Match\n- **WHEN** a matching query is entered\n- **THEN** matching orders appear.\n';
const design='## Context\nOrder list.\n## Goals / Non-Goals\nFind orders.\n## Decisions\nUse existing list API.\n## Project Constraints\nFollow root AGENTS.md.\n## Architecture\nExisting order module with local state.\n## File Change Plan\nUpdate src/views/orders/OrderList.vue.\n## Risks / Trade-offs\nNetwork errors.\n## Migration Plan\nAdditive rollout.';
const tasks='- [ ] 1.1 Implement search; acceptance: matching query test passes.';
const report={summary:'Reviewed documents against requirements.',source:'test fixture reviewer',issues:[],unverified:[]};
const checks=[{kind:'test',name:'search test',outcome:'passed',evidence:'fixture simulated test result'},{kind:'browser',name:'search journey',outcome:'passed',evidence:'fixture simulated browser result'}];
async function setup(t){const project=await fs.realpath(await mkdtemp(path.join(os.tmpdir(),'frontend-plugin-')));t.after(()=>rm(project,{recursive:true,force:true}));await initialize(project);const base={project,changeId:'add-search'};let state;
 return {project,base,get state(){return state;},async call(action,extra={}){const result=await run({...base,action,expectedVersion:state?.version,...extra});if(result.version)state=result;return result;},async context(){return run({...base,action:'context'});},async approve(){return this.call('approve',{reviewHash:state.pendingReview.hash,confirmation:{text:'Approved fixture',source:'test only'}});}};}
async function toSpec(f){await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');await f.approve();const c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});}
async function toImplementation(f){await toSpec(f);await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();}
test('all review boundaries and complete baseline/archive lifecycle',async t=>{const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await assert.rejects(f.call('create-spec',{proposal,specs:{search:delta}}),/unavailable/);await f.call('submit-prd');assert.equal(f.state.pendingApproval,'prd');await assert.rejects(f.call('approve',{reviewHash:'wrong',confirmation:{text:'yes',source:'fixture'}}),/hash/);await f.approve();let c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});await f.call('submit-spec',{report});assert.equal(f.state.pendingApproval,'spec');await assert.rejects(f.call('write-design',{document:design}),/unavailable/);await f.approve();c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});assert.equal(f.state.pendingApproval,'implementation');await assert.rejects(f.call('complete-task',{taskId:'1.1',evidence:'fixture'}),/unavailable/);await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'fixture test and review'});await f.call('submit-implementation');await f.call('submit-verification',{report,checks});assert.equal(f.state.pendingApproval,'acceptance');await assert.rejects(f.call('archive'),/unavailable/);await f.approve();await f.call('archive');assert.equal(f.state.status,'completed');for(const p of ['proposal.md','specs/search/spec.md','technical-design.md','tasks.md','workflow.json'])assert.ok(await readFile(path.join(f.project,'planning/archive/add-search',p),'utf8'));assert.match(await readFile(path.join(f.project,'planning/specs/search/spec.md'),'utf8'),/Requirement: Search/);await assert.rejects(f.call('reopen',{stage:'prd',reason:'late edit'}),/immutable/);});
test('acceptance cannot archive after source changes since verification',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'app.js'),'export const version = 1;');await toImplementation(f);
 await f.call('complete-task',{taskId:'1.1',evidence:'fixture tests passed'});await f.call('submit-implementation');
 await f.call('submit-verification',{report,checks});assert.ok(f.state.verification.sourceSnapshot.treeHash);await f.approve();
 await writeFile(path.join(f.project,'app.js'),'export const version = 2;');
 await assert.rejects(f.call('archive'),/Source tree changed after verification/);
});
test('initialization is non-destructive, idempotent, explicit and rejects symlinks',async t=>{const f=await setup(t);assert.equal((await initialize(f.project)).created.length,0);for(const file of ['.codex/config.toml','.codex/agents/architect.toml','.codex/agents/architect.md','.codex/agents/developer.toml','.codex/agents/ui-reviewer.toml','.codex/agents/code-reviewer.toml','.codex/agents/spec-reviewer.toml','.codex/agents/frontend-reviewer.toml'])await readFile(path.join(f.project,file),'utf8');await writeFile(path.join(f.project,'docs/engineering/testing.md'),'custom');const result=await initialize(f.project);assert.equal(result.conflicts.length,1);assert.equal(await readFile(path.join(f.project,'docs/engineering/testing.md'),'utf8'),'custom');await assert.rejects(initialize('.'),/absolute/);const p=await mkdtemp(path.join(os.tmpdir(),'frontend-symlink-'));t.after(()=>rm(p,{recursive:true,force:true}));await symlink(os.tmpdir(),path.join(p,'docs'));await assert.rejects(initialize(p),/Symlink/);});
test('project Codex agent registrations merge safely and report conflicts or invalid TOML',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'frontend-agent-config-'));t.after(()=>rm(project,{recursive:true,force:true}));await mkdir(path.join(project,'.codex'),{recursive:true});
 const existing='model = "codex-test"\n\n[agents]\nmax_threads = 2\n';await writeFile(path.join(project,'.codex/config.toml'),existing);
 const merged=await initialize(project);assert.equal(merged.agents.status,'ready');assert.deepEqual(merged.agents.registered,['architect','developer','ui-reviewer','code-reviewer','spec-reviewer','frontend-reviewer']);assert.deepEqual(merged.updated,['.codex/config.toml']);
 const config=await readFile(path.join(project,'.codex/config.toml'),'utf8');assert.ok(config.startsWith(existing));assert.match(config,/max_threads = 2/);const {parseProjectAgentConfig}=await import('../runtime/shared/agent-config.mjs');const parsed=parseProjectAgentConfig(config);assert.equal(parsed.agents.architect.config_file,'agents/architect.toml');assert.equal(parsed.agents['code-reviewer'].config_file,'agents/code-reviewer.toml');assert.equal(parsed.agents['spec-reviewer'].config_file,'agents/spec-reviewer.toml');assert.equal(parsed.agents['frontend-reviewer'].config_file,'agents/frontend-reviewer.toml');
 assert.equal((await initialize(project)).updated.length,0);assert.equal((await readFile(path.join(project,'.codex/config.toml'),'utf8')).match(/\[agents\.architect\]/g).length,1);
 const conflict=await mkdtemp(path.join(os.tmpdir(),'frontend-agent-conflict-'));t.after(()=>rm(conflict,{recursive:true,force:true}));await mkdir(path.join(conflict,'.codex'),{recursive:true});await writeFile(path.join(conflict,'.codex/config.toml'),'[agents.architect]\nconfig_file = "agents/custom.toml"\n');const conflictResult=await initialize(conflict);assert.equal(conflictResult.agents.status,'conflict');assert.deepEqual(conflictResult.agents.missing,['architect']);assert.match(await readFile(path.join(conflict,'.codex/config.toml'),'utf8'),/agents\/custom.toml/);
 const invalid=await mkdtemp(path.join(os.tmpdir(),'frontend-agent-invalid-'));t.after(()=>rm(invalid,{recursive:true,force:true}));await mkdir(path.join(invalid,'.codex'),{recursive:true});await writeFile(path.join(invalid,'.codex/config.toml'),'[agents.architect\n');const invalidResult=await initialize(invalid);assert.equal(invalidResult.agents.status,'invalid-config');assert.equal(await readFile(path.join(invalid,'.codex/config.toml'),'utf8'),'[agents.architect\n');
});
test('stale versions, stale approvals and context changes are rejected',async t=>{const f=await setup(t);await f.call('start',{document:'PRD'});await assert.rejects(f.call('submit-prd',{expectedVersion:0}),/expectedVersion/);await f.call('submit-prd');await writeFile(path.join(f.project,'docs/prd/add-search.md'),'changed');await assert.rejects(f.approve(),/stale/);await f.call('reopen',{stage:'prd',reason:'requirements updated'});await f.call('submit-prd');await f.approve();const c=await f.context();await writeFile(path.join(f.project,'docs/prd/add-search.md'),'changed again');await assert.rejects(f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}}),/stale/);});
test('Skill invocation traces and semantic assessments are auditable and artifact-bound',async t=>{
 const f=await setup(t);const invoke={project:f.project,changeId:'add-search',skill:'write-a-prd',invocationId:'prd-1',summary:'Drafting the PRD',event:'started',stage:'prd'};
 await run({...invoke,action:'trace-skill'});await f.call('start',{document:'# PRD\nSearch orders.'});
 await run({...invoke,action:'trace-skill',invocationId:'prd-secret',summary:'token: sk-abcdefghijklmnopqrstuvwxyz1234567890',outcome:{api_key:'never-persist',result:'ok'}});
 await assert.rejects(run({...invoke,action:'trace-skill',outcome:{data:'x'.repeat(5000)}}),/outcome exceeds/);
 const criteria=['problem-outcome','scope-boundaries','user-journey-states','measurable-acceptance','risks-dependencies'].map(id=>({id,status:'PASS',reason:'Covered by PRD',evidence:['Search orders.']}));
 await assert.rejects(run({...f.base,action:'evaluate-quality',expectedVersion:f.state.version,stage:'prd',evaluator:'test reviewer',criteria:criteria.map((x,i)=>i?x:{...x,evidence:['missing excerpt']})}),/not present/);
 const result=await run({...f.base,action:'evaluate-quality',expectedVersion:f.state.version,stage:'prd',evaluator:'test reviewer',criteria});
 assert.equal(result.status,'PASS');assert.equal(result.fingerprint.length,64);
 await run({...invoke,action:'trace-skill',event:'completed',summary:'PRD drafted',outcome:'success'});
 await f.call('submit-prd');
 const trace=(await readFile(path.join(f.project,'.workflow/traces.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(trace.map(x=>x.type),['skill-invocation','workflow-action','skill-invocation','quality-evaluation','skill-invocation','workflow-action']);
 assert.equal(trace[2].summary.includes('sk-abcdefghijklmnopqrstuvwxyz'),false);
 assert.equal(trace[2].outcome.api_key,'[REDACTED]');
 assert.equal(trace[3].artifactFingerprint,result.fingerprint);
 await writeFile(path.join(f.project,'docs/prd/add-search.md'),'# PRD changed');
 const changedCriteria=criteria.map(x=>({...x,evidence:['# PRD changed']}));
 const stale=await run({...f.base,action:'evaluate-quality',expectedVersion:f.state.version,stage:'prd',evaluator:'test reviewer',criteria:changedCriteria});
 assert.notEqual(stale.fingerprint,result.fingerprint);
});
test('reopening tasks preserves design fingerprints and requires design refresh after guidance changes',async t=>{
 const f=await setup(t);await toImplementation(f);
 const originalDesign=await readFile(path.join(f.project,'planning/changes/add-search/technical-design.md'),'utf8');
 const designFingerprint=f.state.designConstraintsHash;assert.ok(designFingerprint);
 await f.call('reopen',{stage:'tasks',reason:'Split the delivery tasks more clearly.'});
 assert.equal(f.state.designConstraintsHash,designFingerprint);
 assert.equal(await readFile(path.join(f.project,'planning/changes/add-search/technical-design.md'),'utf8'),originalDesign);
 await f.context();
 await writeFile(path.join(f.project,'AGENTS.md'),`${await readFile(path.join(f.project,'AGENTS.md'),'utf8')}\n## Updated architecture constraint\nKeep search behavior inside the existing feature.\n`);
 await assert.rejects(f.context(),/Project architecture guidance changed after technical design/);
 await f.call('reopen',{stage:'design',reason:'Architecture guidance changed after the design was written.'});
 await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/technical-design.md')),/ENOENT/);
 const context=await f.context();await f.call('write-design',{contextHash:context.contextHash,document:design});
 const taskContext=await f.context();await f.call('write-tasks',{contextHash:taskContext.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'implementation');
});
test('Spec context honors configured canonical architecture, design and token paths',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'project-docs/system.md'),'# Canonical architecture');await writeFile(path.join(f.project,'project-docs/ui.md'),'# Canonical design');await writeFile(path.join(f.project,'project-docs/tokens.css'),'--color-primary: blue;');await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({context:{architecture:'project-docs/system.md',design:'project-docs/ui.md',tokens:['project-docs/tokens.css']}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();const c=await f.context();assert.equal(c.context.projectArchitecture.guidance['project-docs/system.md'],'# Canonical architecture');assert.equal(c.context.projectArchitecture.guidance['project-docs/ui.md'],'# Canonical design');assert.equal(c.context.projectArchitecture.guidance['project-docs/tokens.css'],'--color-primary: blue;');assert.deepEqual(c.context.projectArchitecture.tokenSources,['project-docs/tokens.css']);assert.equal(c.context.projectArchitecture.guidance['.context/ARCHITECTURE.md'],undefined);});
test('Spec context rejects missing, symlinked and non-file Token sources',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({context:{tokens:'project-docs/tokens.css'}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(MISSING\)/);await writeFile(path.join(f.project,'outside.css'),'--color-primary: blue;');await symlink(path.join(f.project,'outside.css'),path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);await rm(path.join(f.project,'project-docs/tokens.css'));await mkdir(path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);});
test('document and implementation verification block missing evidence',async t=>{const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report:{...report,unverified:['business mapping missing']}});assert.equal(f.state.status,'blocked');await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await assert.rejects(f.call('write-tasks',{contextHash:c.contextHash,document:tasks+'\n- [ ] 1.1 Duplicate'}),/duplicate/);await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await assert.rejects(f.call('submit-implementation'),/evidence/);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await f.call('submit-verification',{report,checks:checks.map(c=>({...c,outcome:'not-verified'}))});assert.equal(f.state.status,'blocked');await assert.rejects(f.call('approve',{reviewHash:'none',confirmation:{text:'yes',source:'fixture'}}),/hash/);await f.call('submit-verification',{report,checks});assert.equal(f.state.pendingApproval,'acceptance');});
test('reopen invalidates downstream plans and retains snapshot',async t=>{const f=await setup(t);await toImplementation(f);await f.call('reopen',{stage:'spec',reason:'scope correction'});assert.deepEqual(Object.keys(f.state.approvals),['prd']);await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/technical-design.md')));const dirs=await readdir(path.join(f.project,'.workflow/transactions'));let found=false;for(const dir of dirs){try{await readFile(path.join(f.project,'.workflow/transactions',dir,'before/planning/changes/add-search/technical-design.md'));found=true;}catch{}}assert(found);const c=await f.context();await f.call('save-spec',{contextHash:c.contextHash,proposal:proposal+'\nCorrection',specs:{search:delta}});await f.call('submit-spec',{report});assert.equal(f.state.pendingApproval,'spec');});
test('failed state write rolls back generated documents and permits retry',async t=>{const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report});await f.approve();const c=await f.context();const original=fs.rename;let injected=false;fs.rename=async(from,to)=>{if(!injected&&to===path.join(f.project,'planning/workflows/add-search.json')){injected=true;throw Error('Injected state failure');}return original(from,to);};try{await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design}),/Injected/);}finally{fs.rename=original;}await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/technical-design.md')));await f.call('write-design',{contextHash:c.contextHash,document:design});assert.equal(f.state.stage,'tasks');});
test('project lock prevents concurrent mutations and recovery validates journal identity',async t=>{const f=await setup(t);await lock(f.project,async()=>{await assert.rejects(f.call('start',{document:'PRD'}),/EEXIST/);});await f.call('start',{document:'PRD'});const id='11111111-1111-1111-1111-111111111111',backup=`.workflow/transactions/${id}`;await fs.cp(path.join(f.project,'planning'),path.join(f.project,backup,'before/planning'),{recursive:true});await fs.cp(path.join(f.project,'docs/prd'),path.join(f.project,backup,'before/docs/prd'),{recursive:true});await putJson(f.project,'.workflow/pending.json',{id,backup,present:{planning:true,'docs/prd':true}});await writeFile(path.join(f.project,'docs/prd/add-search.md'),'interrupted');await assert.rejects(f.call('submit-prd'),/Interrupted/);await assert.rejects(f.call('recover',{transactionId:'wrong',reason:'fixture'}),/mismatch/);await f.call('recover',{transactionId:id,reason:'fixture interrupted transaction'});assert.equal(await readFile(path.join(f.project,'docs/prd/add-search.md'),'utf8'),'PRD');});

test('repeated PRD and Spec revisions require approval of each current submission',async t=>{
 const f=await setup(t);
 await f.call('start',{document:'# PRD\nSearch orders.'});
 await f.call('submit-prd');
 for(let round=1;round<=3;round++){
  const oldHash=f.state.pendingReview.hash;
  await assert.rejects(f.call('save-prd',{document:'unreviewed overwrite'}),/unavailable/);
  await f.call('request-changes',{feedback:`PRD review round ${round}: clarify matching.`});
  assert.equal(f.state.pendingApproval,null);
  await assert.rejects(f.call('approve',{reviewHash:oldHash,confirmation:{text:'Old version',source:'fixture'}}),/hash/);
  await f.call('save-prd',{document:`# PRD\nSearch orders. Matching clarification ${round}.`});
  await f.call('submit-prd');
  assert.notEqual(f.state.pendingReview.hash,oldHash);
  await assert.rejects(f.call('approve',{reviewHash:oldHash,confirmation:{text:'Old version',source:'fixture'}}),/hash/);
  await assert.rejects(f.call('create-spec',{proposal,specs:{search:delta}}),/unavailable/);
  await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/proposal.md')),/ENOENT/);
 }
 await f.approve();
 let c=await f.context();
 await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});
 await f.call('submit-spec',{report});
 const prdHash=f.state.approvals.prd.hash;
 for(let round=1;round<=3;round++){
  const oldHash=f.state.pendingReview.hash;
  const stale=await f.context();
  await assert.rejects(f.call('save-spec',{contextHash:stale.contextHash,proposal,specs:{search:delta}}),/unavailable/);
  await f.call('request-changes',{feedback:`Spec review round ${round}: clarify scenario.`});
  await assert.rejects(f.call('save-spec',{contextHash:stale.contextHash,proposal,specs:{search:delta}}),/context changed/);
  c=await f.context();
  const revised=delta.replace('matching orders appear.',`matching orders appear with clarification ${round}.`);
  await f.call('save-spec',{contextHash:c.contextHash,proposal,specs:{search:revised}});
  await assert.rejects(f.call('write-design',{document:design}),/unavailable/);
  await f.call('submit-spec',{report});
  assert.equal(f.state.gate.valid,true);
  assert.equal(f.state.pendingApproval,'spec');
  assert.equal(f.state.approvals.prd.hash,prdHash);
  assert.notEqual(f.state.pendingReview.hash,oldHash);
  await assert.rejects(f.call('approve',{reviewHash:oldHash,confirmation:{text:'Old version',source:'fixture'}}),/hash/);
  await assert.rejects(f.call('write-design',{document:design}),/unavailable/);
  await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/technical-design.md')),/ENOENT/);
 }
 await f.approve();
 c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'implementation');
 assert.equal(f.state.history.filter(x=>x.action==='request-changes').length,6);
 await assert.rejects(f.call('complete-task',{taskId:'1.1',evidence:'not authorized'}),/unavailable/);
});

test('business feedback after design returns to PRD review and regenerates downstream documents',async t=>{
 const f=await setup(t);await toImplementation(f);
 const oldSpecHash=f.state.approvals.spec.hash;
 await f.call('reopen',{stage:'prd',reason:'Human feedback changes business acceptance criteria.'});
 assert.deepEqual(f.state.approvals,{});
 for(const file of ['proposal.md','technical-design.md','tasks.md'])await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search',file)),/ENOENT/);
 await f.call('save-prd',{document:'# PRD\nSearch orders with revised business criteria.'});
 await f.call('submit-prd');
 await assert.rejects(f.call('approve',{reviewHash:oldSpecHash,confirmation:{text:'Obsolete approval',source:'fixture'}}),/hash/);
 await assert.rejects(f.call('create-spec',{proposal,specs:{search:delta}}),/unavailable/);
 await f.approve();let c=await f.context();
 await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});
 await f.call('submit-spec',{report});
 await assert.rejects(f.call('write-design',{document:design}),/unavailable/);
 await f.approve();c=await f.context();
 await f.call('write-design',{contextHash:c.contextHash,document:design});
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'implementation');
 assert.equal(f.state.approvals.implementation,undefined);
});
