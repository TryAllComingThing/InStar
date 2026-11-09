import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir,rename,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run,initialize} from '../runtime/workflow-controller/index.mjs';
import {transaction,putJson,lock,fs,sourceSnapshot,hash,gcTransactions} from '../runtime/workflow-controller/files.mjs';
import {loadQualityConfig,snapshot as qualitySnapshot,reviewItemsFor} from '../runtime/quality-controller/index.mjs';
import {canonicalHash,contentHash} from '../runtime/shared/canonical.mjs';
import {inspectDesignSource} from '../runtime/shared/design-sources.mjs';
import {removeAgentRegistrations} from '../runtime/shared/agent-config.mjs';
const proposal='## Why\nUsers need search.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nFrontend.';
const delta='## Purpose\nEnable users to find relevant orders using clear and consistent search behavior.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search orders.\n#### Scenario: Match\n- **WHEN** a matching query is entered\n- **THEN** matching orders appear.\n';
const design='## Context\nOrder list.\n## Goals / Non-Goals\nFind orders.\n## Decisions\nUse existing list API.\n## Project Constraints\nFollow root AGENTS.md.\n## Architecture\nExisting order module with local state.\n## File Change Plan\nUpdate src/views/orders/OrderList.vue.\n## Risks / Trade-offs\nNetwork errors.\n## Migration Plan\nAdditive rollout.';
const tasks='- [ ] 1.1 Implement search; acceptance: matching query test passes.';
const report={summary:'Reviewed documents against requirements.',source:'test fixture reviewer',issues:[],unverified:[]};
const checks=[
 {kind:'lint',name:'lint',outcome:'passed',evidence:'fixture lint result',artifact:'reports/fixture/lint.json',source:'manual',manualReason:'fixture only'},
 {kind:'format',name:'format',outcome:'passed',evidence:'fixture format result',artifact:'reports/fixture/format.json',source:'manual',manualReason:'fixture only'},
 {kind:'test',name:'search test',outcome:'passed',evidence:'fixture simulated test result',artifact:'reports/fixture/test.json',source:'manual',manualReason:'fixture only'},
 {kind:'security',name:'security scan',outcome:'passed',evidence:'fixture security result',artifact:'reports/fixture/security.json',source:'manual',manualReason:'fixture only'},
 {kind:'browser',name:'search journey',outcome:'passed',evidence:'fixture simulated browser result',artifact:'reports/fixture/browser.json',source:'manual',manualReason:'fixture only'},
 {kind:'accessibility',name:'axe journey',outcome:'passed',evidence:'fixture simulated axe result',artifact:'reports/fixture/accessibility.json',source:'manual',manualReason:'fixture only'},
 {kind:'keyboard',name:'keyboard journey',outcome:'passed',evidence:'fixture simulated keyboard result',artifact:'reports/fixture/keyboard.json',source:'manual',manualReason:'fixture only'}
];
const artifactFixtures={
 lint:{status:'passed'},
 format:{status:'passed'},
 test:{status:'passed'},
 security:{status:'passed'},
 browser:{kind:'browser',status:'PASS',tool:'playwright',headless:true,journeys:[{route:'/',status:'PASS'}]},
 accessibility:{kind:'accessibility',status:'PASS',tool:'playwright-axe',routesScanned:1,violations:[],incomplete:[],results:[{route:'/',violations:[],incomplete:[]}]},
 keyboard:{kind:'keyboard',status:'PASS',journeys:[{route:'/',steps:['Tab'],expectedFocus:'#search',actualFocus:'#search'}]}
};
function gitInit(project){const git=(...args)=>{const result=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','InStar test');return async()=>{git('add','.');git('commit','-m','fixture baseline');};}
async function strictReport(project,profile,id,ids){
 const config=await loadQualityConfig(project),snapshot=await qualitySnapshot(project);
 const checks=await Promise.all(ids.map(async checkId=>{const spec=config.tools.checks[checkId],artifact=spec.artifact||`reports/fixture/${spec.kind}.json`,artifactHash=contentHash(await readFile(path.join(project,artifact)));return {id:checkId,status:'PASS',artifact,artifactHash};}));
 return {schemaVersion:1,kind:`engineering-verify-${profile}`,id,profile,status:'PASS',stable:true,at:new Date().toISOString(),snapshot,configHash:canonicalHash(config),checkDefinitions:Object.fromEntries(ids.map(checkId=>[checkId,canonicalHash(config.tools.checks[checkId])])),checks};
}
async function qualityGateReport(project,id='quality-1'){
 const config=await loadQualityConfig(project),snapshot=await qualitySnapshot(project);
 const review={schemaVersion:2,reviewer:'fixture-reviewer',executionMode:'subagent',fingerprint:snapshot.fingerprint,checks:reviewItemsFor(config).map(item=>({id:item,status:'PASS',evidence:'fixture review',references:[{path:'fixture.js',line:1}]})),findings:[],unverified:[]};
 return {schemaVersion:1,kind:'quality-gate',id,status:'PASS',stable:true,snapshot,configHash:canonicalHash(config),checks:[{id:'fixture-check',status:'INFO'}],review};
}
async function setup(t){const project=await fs.realpath(await mkdtemp(path.join(os.tmpdir(),'frontend-plugin-')));t.after(()=>rm(project,{recursive:true,force:true}));await initialize(project);await mkdir(path.join(project,'reports/fixture'),{recursive:true});await writeFile(path.join(project,'fixture.js'),'export const fixture = true;\n');for(const check of checks)await writeFile(path.join(project,check.artifact),JSON.stringify(artifactFixtures[check.kind]));await gitInit(project)();const base={project,changeId:'add-search'};let state,invocationSequence=0;
 const f={project,base,get state(){return state;},async skill(skill,stage='implementation',invocationId=`${skill}-${stage}-${++invocationSequence}`){const request={...base,action:'trace-skill',skill,stage,invocationId,summary:'fixture Skill evidence'};await run({...request,event:'started'});return run({...request,event:'completed'});},async agent(role,stage='verification',invocationId=`${role}-${stage}-${++invocationSequence}`,extra={}){const request={...base,action:'trace-agent',role,stage,invocationId,summary:'fixture reviewer evidence',executionMode:'subagent',reviewerSessionId:`reviewer-session-${invocationSequence}`,reviewedFiles:role==='spec-reviewer'?[`planning/changes/${base.changeId}/proposal.md`,`planning/changes/${base.changeId}/specs/search/spec.md`]:['fixture.js'],findings:[],unverified:[],...extra};await run({...request,event:'started'});return run({...request,event:'completed'});},async prepareImplementation(){const skills=state.stack==='fullstack'?['frontend-implement','engineering-implement']:state.stack==='frontend'?['frontend-implement']:['engineering-implement'];for(const skill of skills)await f.skill(skill,'implementation');await f.skill('quality-gate','implementation');for(const role of ['architect','code-reviewer'])await f.agent(role,'implementation');},async prepareVerification(){const skills=state.stack==='fullstack'?['frontend-verify','engineering-verify']:state.stack==='frontend'?['frontend-verify']:['engineering-verify'];for(const skill of skills)await f.skill(skill,'verification');for(const role of ['security-reviewer',...(state.stack==='frontend'||(state.stack==='fullstack'&&state.ui)?['frontend-reviewer']:[]),...(state.ui?['ui-reviewer']:[])])await f.agent(role,'verification');},async call(action,extra={}){const payload={...extra};if(action==='start'){payload.ui=payload.ui??false;payload.stack=payload.stack??'backend';}if(action==='complete-task'&&typeof payload.evidence==='string')payload.evidence={summary:payload.evidence,files:[{path:'fixture.js',line:1}]};if(action==='write-design'&&state?.ui&&!payload.skipDesignCheck){await f.skill('design-check','design');payload.designCheck=payload.designCheck??{constraints:'fixture UI constraints',coverage:['hierarchy','layout','states','tokens','responsive','accessibility'],sources:[{path:'fixture.js',role:'component'}]};}if(action==='submit-spec'&&!payload.skipSpecReview)await f.agent('spec-reviewer','spec');if(action==='submit-implementation'&&!payload.skipAutoQualityGate){try{await readFile(path.join(f.project,'.instar-quality.json'));}catch{await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main'}));}try{await readFile(path.join(f.project,'reports/quality-gate.json'));}catch{await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));}}if(action==='submit-implementation'&&!payload.skipImplementEvidence){await f.prepareImplementation();payload.report??=report;payload.checks??=checks;}if(action==='submit-verification'&&!payload.skipVerificationEvidence)await f.prepareVerification();if(action==='submit-verification'&&state?.pendingApproval==='implementation'&&!payload.skipImplementationApproval){const approved=await f.approve();if(approved.version)state=approved;}const result=await run({...base,action,expectedVersion:state?.version,...payload});if(result.version)state=result;return result;},async context(){return run({...base,action:'context'});},async approve(decision='accept-record',extra={}){return this.call('approve',{reviewHash:state.pendingReview.hash,decision,confirmation:{text:'Approved fixture',source:'test only'},...extra});}};
 return f;}
async function toSpec(f,startExtra={}){await f.call('start',{document:'# PRD\nSearch orders.',...startExtra});await f.call('submit-prd');await f.approve();const c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});}
async function toImplementation(f){await toSpec(f);await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();}
async function toUiImplementation(f){await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();}
test('all review boundaries and complete baseline/archive lifecycle',async t=>{const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await assert.rejects(f.call('create-spec',{proposal,specs:{search:delta}}),/unavailable/);await f.call('submit-prd');assert.equal(f.state.pendingApproval,'prd');await assert.rejects(f.call('approve',{reviewHash:'wrong',confirmation:{text:'yes',source:'fixture'}}),/hash/);await f.approve();let c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});await f.call('submit-spec',{report});assert.equal(f.state.pendingApproval,'spec');await assert.rejects(f.call('write-design',{document:design}),/unavailable/);await f.approve();c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});assert.equal(f.state.pendingApproval,'design');await assert.rejects(f.call('write-tasks',{document:tasks}),/unavailable/);await f.approve();c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});assert.equal(f.state.pendingApproval,'tasks');await assert.rejects(f.call('complete-task',{taskId:'1.1',evidence:'fixture'}),/unavailable/);await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'fixture test and review'});await f.call('submit-implementation');await f.call('submit-verification',{report,checks});assert.equal(f.state.pendingApproval,'acceptance');await assert.rejects(f.call('archive'),/unavailable/);await f.approve();await f.call('archive');assert.equal(f.state.status,'completed');for(const p of ['proposal.md','specs/search/spec.md','technical-design.md','tasks.md','workflow.json'])assert.ok(await readFile(path.join(f.project,'planning/archive/add-search',p),'utf8'));assert.match(await readFile(path.join(f.project,'planning/specs/search/spec.md'),'utf8'),/Requirement: Search/);await assert.rejects(f.call('reopen',{stage:'prd',reason:'late edit'}),/immutable/);});
test('acceptance cannot archive after source changes since verification',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'app.js'),'export const version = 1;');await toImplementation(f);
 await f.call('complete-task',{taskId:'1.1',evidence:'fixture tests passed'});await f.call('submit-implementation');
 await f.call('submit-verification',{report,checks});assert.ok(f.state.verification.sourceSnapshot.treeHash);await f.approve();
 await writeFile(path.join(f.project,'app.js'),'export const version = 2;');
 await assert.rejects(f.call('archive'),/Source tree changed after verification/);
});
test('initialization is non-destructive, idempotent, explicit and rejects symlinks',async t=>{const f=await setup(t);assert.equal((await initialize(f.project)).created.length,0);for(const file of ['.codex/config.toml','.codex/agents/architect.toml','.codex/agents/architect.md','.codex/agents/developer.toml','.codex/agents/ui-reviewer.toml','.codex/agents/code-reviewer.toml','.codex/agents/security-reviewer.toml','.codex/agents/security-reviewer.md','.codex/agents/spec-reviewer.toml','.codex/agents/frontend-reviewer.toml'])await readFile(path.join(f.project,file),'utf8');await writeFile(path.join(f.project,'docs/engineering/testing.md'),'custom');const result=await initialize(f.project);assert.equal(result.conflicts.length,1);assert.equal(await readFile(path.join(f.project,'docs/engineering/testing.md'),'utf8'),'custom');await assert.rejects(initialize('.'),/absolute/);const p=await mkdtemp(path.join(os.tmpdir(),'frontend-symlink-'));t.after(()=>rm(p,{recursive:true,force:true}));await symlink(os.tmpdir(),path.join(p,'docs'));await assert.rejects(initialize(p),/Symlink/);});
test('initialization installs only stack-applicable frontend and reviewer assets',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-stack-init-'));t.after(()=>rm(project,{recursive:true,force:true}));
 const backend=await initialize(project,{stack:'backend'});assert.equal(backend.stack,'backend');
 assert.deepEqual(backend.agents.registered,['architect','developer','code-reviewer','security-reviewer','spec-reviewer']);
 await readFile(path.join(project,'docs/engineering/testing.md'),'utf8');
 await readFile(path.join(project,'.codex/agents/architect.toml'),'utf8');
 await assert.rejects(readFile(path.join(project,'docs/engineering/frontend-conventions.md'),'utf8'),{code:'ENOENT'});
 await assert.rejects(readFile(path.join(project,'.codex/agents/ui-reviewer.toml'),'utf8'),{code:'ENOENT'});
 await assert.rejects(readFile(path.join(project,'.codex/agents/frontend-reviewer.toml'),'utf8'),{code:'ENOENT'});
 assert.doesNotMatch(await readFile(path.join(project,'.codex/config.toml'),'utf8'),/\[agents\.frontend-reviewer\]/);
 assert.match(await readFile(path.join(project,'AGENTS.md'),'utf8'),/# InStar development workflow/);
 const frontend=await initialize(project,{stack:'frontend'});assert.equal(frontend.stack,'frontend');
 await readFile(path.join(project,'docs/engineering/frontend-conventions.md'),'utf8');
 await readFile(path.join(project,'.codex/agents/ui-reviewer.toml'),'utf8');
 await readFile(path.join(project,'.codex/agents/frontend-reviewer.toml'),'utf8');
 assert.match(await readFile(path.join(project,'.codex/config.toml'),'utf8'),/\[agents\.frontend-reviewer\]/);
 assert.equal(JSON.parse(await readFile(path.join(project,'.instar.json'),'utf8')).stack,'frontend');
 assert.equal(JSON.parse(await readFile(path.join(project,'.instar.json'),'utf8')).installationScope,'frontend');
 const narrowed=await initialize(project,{stack:'backend'});assert.equal(narrowed.stack,'backend');
 assert.ok(narrowed.removed.includes('docs/engineering/frontend-conventions.md'));
 assert.ok(narrowed.removed.includes('.codex/agents/ui-reviewer.toml'));
 assert.ok(narrowed.removed.includes('.codex/agents/frontend-reviewer.toml'));
 assert.deepEqual(narrowed.agents.removed,['ui-reviewer','frontend-reviewer']);
 await assert.rejects(readFile(path.join(project,'docs/engineering/frontend-conventions.md'),'utf8'),{code:'ENOENT'});
 await assert.rejects(readFile(path.join(project,'.codex/agents/ui-reviewer.toml'),'utf8'),{code:'ENOENT'});
 const backendConfig=await readFile(path.join(project,'.codex/config.toml'),'utf8');assert.doesNotMatch(backendConfig,/\[agents\.ui-reviewer\]/);assert.doesNotMatch(backendConfig,/\[agents\.frontend-reviewer\]/);assert.match(backendConfig,/\[agents\.architect\]/);
 assert.equal(JSON.parse(await readFile(path.join(project,'.instar.json'),'utf8')).installationScope,'backend');
 await assert.rejects(initialize(project,{stack:'mobile'}),/stack must be/);
});
test('stack narrowing preserves locally modified managed assets',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-stack-preserve-'));t.after(()=>rm(project,{recursive:true,force:true}));await initialize(project,{stack:'fullstack'});
 await writeFile(path.join(project,'docs/engineering/frontend-conventions.md'),'team-owned conventions');
 const result=await initialize(project,{stack:'backend'});
 assert.ok(result.conflicts.some(item=>item.path==='docs/engineering/frontend-conventions.md'));
 assert.equal(await readFile(path.join(project,'docs/engineering/frontend-conventions.md'),'utf8'),'team-owned conventions');
 assert.ok(!result.removed.includes('docs/engineering/frontend-conventions.md'));
});
test('initialize upgrades only hash-verified legacy AGENTS guidance and preserves unverified or edited blocks',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-agents-migrate-'));t.after(()=>rm(project,{recursive:true,force:true}));await initialize(project,{stack:'fullstack'});
 const file=path.join(project,'AGENTS.md'),original=await readFile(file,'utf8'),start=original.indexOf('<!-- instar:start -->'),end=original.indexOf('<!-- instar:end -->')+'<!-- instar:end -->'.length;
 const prefix=original.slice(0,start),suffix=original.slice(end),legacy='<!-- instar:start -->\n# Frontend development workflow\nLegacy managed guidance.\n<!-- instar:end -->';
 await writeFile(file,`${prefix}${legacy}${suffix}`);
 const configPath=path.join(project,'.instar.json'),config=JSON.parse(await readFile(configPath,'utf8'));delete config.managed['AGENTS.md#instar:block'];await writeFile(configPath,JSON.stringify(config));
 const unverified=await initialize(project,{stack:'fullstack'});assert.ok(unverified.conflicts.some(item=>item.path==='AGENTS.md'&&/no recorded hash/.test(item.reason)));assert.equal(await readFile(file,'utf8'),`${prefix}${legacy}${suffix}`);
 config.managed['AGENTS.md#instar:block']=hash(legacy);await writeFile(configPath,JSON.stringify(config));
 const migrated=await initialize(project,{stack:'fullstack'});assert.ok(migrated.updated.includes('AGENTS.md'));const upgraded=await readFile(file,'utf8');assert.match(upgraded,/# InStar development workflow/);assert.doesNotMatch(upgraded,/Legacy managed guidance/);
 await writeFile(file,upgraded.replace('# InStar development workflow','# Team edited managed heading'));
 const preserved=await initialize(project,{stack:'fullstack'});assert.ok(preserved.conflicts.some(item=>item.path==='AGENTS.md'));assert.match(await readFile(file,'utf8'),/# Team edited managed heading/);
});
test('project Codex agent registrations merge safely and report conflicts or invalid TOML',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'frontend-agent-config-'));t.after(()=>rm(project,{recursive:true,force:true}));await mkdir(path.join(project,'.codex'),{recursive:true});
 const existing='model = "codex-test"\n\n[agents]\nmax_threads = 2\n';await writeFile(path.join(project,'.codex/config.toml'),existing);
 const merged=await initialize(project);assert.equal(merged.agents.status,'ready');assert.deepEqual(merged.agents.registered,['architect','developer','ui-reviewer','code-reviewer','security-reviewer','spec-reviewer','frontend-reviewer']);assert.deepEqual(merged.updated,['.codex/config.toml']);
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
 await assert.rejects(run({...invoke,action:'trace-skill',invocationId:'prd-large',outcome:{data:'x'.repeat(5000)}}),/outcome exceeds/);
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
 const context=await f.context();await f.call('write-design',{contextHash:context.contextHash,document:design});await f.approve();
 const taskContext=await f.context();await f.call('write-tasks',{contextHash:taskContext.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'tasks');
});
test('Spec context honors configured canonical architecture, design and token paths',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'project-docs/system.md'),'# Canonical architecture');await writeFile(path.join(f.project,'project-docs/ui.md'),'# Canonical design');await writeFile(path.join(f.project,'project-docs/tokens.css'),'--color-primary: blue;');await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main',context:{architecture:'project-docs/system.md',design:'project-docs/ui.md',tokens:['project-docs/tokens.css']}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();const c=await f.context();assert.equal(c.context.projectArchitecture.guidance['project-docs/system.md'],'# Canonical architecture');assert.equal(c.context.projectArchitecture.guidance['project-docs/ui.md'],'# Canonical design');assert.equal(c.context.projectArchitecture.guidance['project-docs/tokens.css'],'--color-primary: blue;');assert.deepEqual(c.context.projectArchitecture.tokenSources,['project-docs/tokens.css']);assert.equal(c.context.projectArchitecture.guidance['.context/ARCHITECTURE.md'],undefined);});
test('Spec context rejects missing, symlinked and non-file Token sources',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main',context:{tokens:'project-docs/tokens.css'}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(MISSING\)/);await writeFile(path.join(f.project,'outside.css'),'--color-primary: blue;');await symlink(path.join(f.project,'outside.css'),path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);await rm(path.join(f.project,'project-docs/tokens.css'));await mkdir(path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);});
test('document and implementation verification block missing evidence',async t=>{const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report:{...report,unverified:['business mapping missing']}});assert.equal(f.state.status,'blocked');await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();c=await f.context();await assert.rejects(f.call('write-tasks',{contextHash:c.contextHash,document:tasks+'\n- [ ] 1.1 Duplicate'}),/duplicate/);await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await assert.rejects(f.call('submit-implementation'),/evidence/);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await f.call('submit-verification',{report,checks:checks.map(c=>({...c,outcome:'not-verified'}))});assert.equal(f.state.status,'blocked');await assert.rejects(f.call('approve',{reviewHash:'none',confirmation:{text:'yes',source:'fixture'}}),/hash/);await f.call('submit-verification',{report,checks});assert.equal(f.state.pendingApproval,'acceptance');});
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
 c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'tasks');
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
 await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'tasks');
 assert.equal(f.state.approvals.tasks,undefined);
});

test('UI design-check and verification evidence are enforced before acceptance',async t=>{
 const f=await setup(t);await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();let c=await f.context();
 const documents=c.context.instarReferences.documents;
 for(const file of ['design-guidance/DESIGN.md','design-guidance/rules/visual-language.md','design-guidance/rules/components-and-interaction.md','design-guidance/rules/layout-and-responsive.md','design-guidance/rules/accessibility.md','design-guidance/rules/tokens.md','design-guidance/rules/review-checklist.md'])assert.ok(documents[file],file);
 assert.equal(documents['design-guidance/rules/theming.md'],undefined);
 assert.equal(c.context.designReferenceMode,'bootstrap');
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,skipDesignCheck:true}),/design-check/);
 await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 await assert.rejects(f.call('submit-implementation',{skipImplementEvidence:true}),/frontend-implement/);
 await f.call('submit-implementation');
 await assert.rejects(f.call('submit-verification',{report,checks,skipVerificationEvidence:true}),/frontend-verify|quality-gate|architect/);
});
test('backend design context omits plugin UI design references',async t=>{
 const f=await setup(t);await toSpec(f,{ui:false,stack:'backend'});await f.call('submit-spec',{report});await f.approve();
 const c=await f.context();assert.equal(c.context.designReferenceMode,false);assert.equal(c.context.instarReferences.documents['design-guidance/DESIGN.md'],undefined);assert.ok(Object.keys(c.context.instarReferences.documents).length);
});
test('reference selection ignores generation instructions and substring matches',async t=>{
 const f=await setup(t);
 await f.call('start',{document:'# PRD\nSearch capital and trust the latest data.',ui:false,stack:'backend'});
 await f.call('submit-prd');await f.approve();
 const documents=Object.keys((await f.context()).context.instarReferences.documents);
 for(const file of ['standards/api/api.md','standards/database/schema.md','standards/database/query.md','standards/common/security.md','standards/common/testing.md','standards/languages/rust.md'])assert.equal(documents.includes(file),false,file);
});
test('reference selection includes matching language, API, database, security, CSS and testing packs',async t=>{
 const f=await setup(t);
 for(const dir of ['src/api','src/auth','src/components','migrations'])await mkdir(path.join(f.project,dir),{recursive:true});
 await writeFile(path.join(f.project,'src/api/orders.ts'),'export const orders = [];\n');
 await writeFile(path.join(f.project,'src/auth/session.ts'),'export const session = null;\n');
 await writeFile(path.join(f.project,'src/components/Order.vue'),'<template><div /></template>\n');
 await writeFile(path.join(f.project,'src/styles.css'),'.order { color: currentColor; }\n');
 await writeFile(path.join(f.project,'src/orders.test.ts'),'export const tested = true;\n');
 await writeFile(path.join(f.project,'migrations/001.sql'),'SELECT 1;\n');
 await writeFile(path.join(f.project,'postgresql.conf'),'# fixture\n');
 await f.call('start',{document:'# PRD\nSearch orders.',ui:true,stack:'frontend'});await f.call('submit-prd');await f.approve();
 const documents=Object.keys((await f.context()).context.instarReferences.documents);
 for(const file of ['standards/languages/typescript.md','standards/languages/javascript.md','standards/languages/vue3.md','standards/languages/css.md','standards/api/api.md','standards/database/schema.md','standards/database/query.md','standards/database/MIGRATIONS.md','standards/database/postgresql.md','standards/common/security.md','standards/common/testing.md'])assert.equal(documents.includes(file),true,file);
});
test('project design sources suppress plugin visual and theming references',async t=>{
 const f=await setup(t);
 await writeFile(path.join(f.project,'DESIGN.md'),'# Project design contract');
 await mkdir(path.join(f.project,'frontend/design-system'),{recursive:true});await writeFile(path.join(f.project,'frontend/design-system/DESIGN.md'),'# Project design system');
 await mkdir(path.join(f.project,'frontend/src/styles'),{recursive:true});await writeFile(path.join(f.project,'frontend/src/styles/tokens.css'),':root { --color-primary: blue; }');
 await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();
 const c=await f.context(),documents=c.context.instarReferences.documents;
 assert.equal(c.context.projectArchitecture.design,'DESIGN.md');assert.equal(c.context.projectArchitecture.designSystem,'frontend/design-system/DESIGN.md');assert.ok(c.context.projectArchitecture.tokens.includes('frontend/src/styles/tokens.css'));
 assert.equal(c.context.designReferenceMode,'quality');
 assert.equal(documents['design-guidance/DESIGN.md'],undefined);assert.equal(documents['design-guidance/rules/visual-language.md'],undefined);assert.equal(documents['design-guidance/rules/theming.md'],undefined);
 assert.ok(documents['design-guidance/rules/accessibility.md']);assert.ok(documents['design-guidance/rules/tokens.md']);assert.ok(documents['design-guidance/rules/review-checklist.md']);
});

test('project design-system README is discovered as a design source',async t=>{
 const f=await setup(t);await mkdir(path.join(f.project,'frontend/design-system'),{recursive:true});await writeFile(path.join(f.project,'frontend/design-system/README.md'),'# Project design system\nUse the existing components and tokens.');
 await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();
 const c=await f.context(),documents=c.context.instarReferences.documents;
 assert.equal(c.context.projectArchitecture.designSystem,'frontend/design-system/README.md');
 assert.equal(c.context.projectArchitecture.designSystemDirectory,'frontend/design-system');
 assert.equal(c.context.designReferenceMode,'quality');
 assert.equal(documents['design-guidance/rules/visual-language.md'],undefined);
 assert.ok(documents['design-guidance/rules/accessibility.md']);
});

test('project design-system directory without a manifest suppresses plugin visual references',async t=>{
 const f=await setup(t);await mkdir(path.join(f.project,'src/design-system/components'),{recursive:true});await writeFile(path.join(f.project,'src/design-system/components/Button.vue'),'<template><button /></template>\n');
 await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();
 const c=await f.context(),documents=c.context.instarReferences.documents;
 assert.equal(c.context.projectArchitecture.designSystem,null);
 assert.equal(c.context.projectArchitecture.designSystemDirectory,'src/design-system');
 assert.equal(c.context.designReferenceMode,'quality');
 assert.equal(documents['design-guidance/rules/visual-language.md'],undefined);
 assert.ok(documents['design-guidance/rules/accessibility.md']);
 assert.equal(c.context.designWarnings[0].code,'project-design-system-manifest-missing');
 assert.equal(c.context.designWarnings[0].directory,'src/design-system');
});

test('designCheck records source metadata and invalidates design approval when source content changes',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'DESIGN.md'),'# Project design contract\nUse the existing blue accent.');
 await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();const c=await f.context();
 await f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'Use the project design contract.',coverage:['hierarchy','layout','states','tokens','responsive','accessibility'],sources:[{path:'DESIGN.md',role:'design-contract'}]}});
 const source=f.state.designCheck.sources[0];
 assert.deepEqual(Object.keys(source).sort(),['bytes','path','role','sha256','type']);
 assert.equal(source.path,'DESIGN.md');assert.equal(source.role,'design-contract');assert.equal(source.type,'text/markdown');assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.ok(source.bytes>0);
 assert.deepEqual(f.state.designCheck.coverage,['hierarchy','layout','states','tokens','responsive','accessibility']);
 await f.approve();
 await writeFile(path.join(f.project,'DESIGN.md'),'# Revised project design contract\nUse the green accent.');
 await assert.rejects(f.call('write-tasks',{contextHash:c.contextHash,document:tasks}),/design approval missing or stale/);
});

test('designCheck rejects unsafe and mismatched sources while normalizing legacy strings',async t=>{
 const f=await setup(t);await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();const c=await f.context();
 const coverage=['hierarchy','layout','states','tokens','responsive','accessibility'];
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'missing coverage',sources:[{path:'fixture.js',role:'component'}]}}),/coverage must list/);
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'bad role',coverage,sources:[{path:'package.json',role:'design-contract'}]}}),/does not allow this file type/);
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'bad token',coverage,sources:[{path:'package.json',role:'tokens'}]}}),/requires a stylesheet or token-like path/);
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'bad source',coverage,sources:[{path:'missing.md',role:'design-contract'}]}}),/is missing/);
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'bad reuse',coverage,sources:['fixture.js']},designReuse:[{kind:'bad',name:'bad'}]}),/designReuse/);
 await f.call('write-design',{contextHash:c.contextHash,document:design,designCheck:{constraints:'legacy string',coverage,sources:['fixture.js']},designReuse:[{kind:'component',name:'Button',path:'fixture.js',note:'reuse existing component'}]});
 assert.equal(f.state.designReuse[0].name,'Button');assert.equal(f.state.designReuse[0].kind,'component');
 assert.equal(f.state.designCheck.sources[0].role,'component');assert.match(f.state.designCheck.sources[0].sha256,/^[a-f0-9]{64}$/);
});

test('designCheck source inspection rejects symbolic links',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'instar-design-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'source.css'),'.button { color: blue; }');await symlink(path.join(root,'source.css'),path.join(root,'linked.css'));
 await assert.rejects(inspectDesignSource(root,{path:'linked.css',role:'component'}),/must not use symbolic links/);
});

test('legacy design source inference keeps design-system components and tokens usable',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'instar-design-legacy-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'src/design-system'),{recursive:true});
 await writeFile(path.join(root,'src/design-system/Button.vue'),'<template><button /></template>');
 await writeFile(path.join(root,'src/design-system/tokens.css'),':root { --color-primary: blue; }');
 await writeFile(path.join(root,'src/design-system/DESIGN.md'),'# Project design system');
 const component=await inspectDesignSource(root,'src/design-system/Button.vue',{inferLegacy:true});
 const tokens=await inspectDesignSource(root,'src/design-system/tokens.css',{inferLegacy:true});
 const manifest=await inspectDesignSource(root,'src/design-system/DESIGN.md',{inferLegacy:true});
 assert.equal(component.role,'component');
 assert.equal(tokens.role,'tokens');
 assert.equal(manifest.role,'design-system');
});

test('trace-agent requires code references and a final-source snapshot',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});
 await assert.rejects(run({...f.base,action:'trace-agent',role:'code-reviewer',event:'completed',invocationId:'missing-start',summary:'missing',executionMode:'subagent',reviewerSessionId:'reviewer-missing',reviewedFiles:['fixture.js'],findings:[],unverified:[]}),/started/);
 await run({...f.base,action:'trace-agent',role:'code-reviewer',event:'started',invocationId:'review-1',summary:'start',executionMode:'subagent',reviewerSessionId:'reviewer-1'});
 await assert.rejects(run({...f.base,action:'trace-agent',role:'code-reviewer',event:'completed',invocationId:'review-1',summary:'bad',executionMode:'subagent',reviewerSessionId:'reviewer-1',reviewedFiles:[],findings:[],unverified:[]}),/reviewedFiles/);
 await run({...f.base,action:'trace-agent',role:'code-reviewer',event:'completed',invocationId:'review-1',summary:'done',executionMode:'subagent',reviewerSessionId:'reviewer-1',reviewedFiles:['fixture.js'],findings:[],unverified:[]});
});

test('Codex session usage is imported into per-change token and API-call records',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});const sessions=await mkdtemp(path.join(os.tmpdir(),'instar-sessions-'));t.after(()=>rm(sessions,{recursive:true,force:true}));
 const session='rollout-test-session-1.jsonl';const rows=[
  {timestamp:'2026-11-04T01:00:00.000Z',type:'token_usage_record',payload:{response_id:'resp-1',usage:{input_tokens:100,cached_input_tokens:20,output_tokens:30,reasoning_output_tokens:10,total_tokens:130}}},
  {timestamp:'2026-11-04T01:00:01.000Z',type:'token_usage_record',payload:{response_id:'resp-2',usage:{input_tokens:50,cached_input_tokens:0,output_tokens:20,reasoning_output_tokens:5,total_tokens:70}}}
 ];
 await writeFile(path.join(sessions,session),rows.map(JSON.stringify).join('\n')+'\n');
 const result=await run({...f.base,action:'import-session-usage',sessionId:'session-1',sessionsRoot:sessions});assert.equal(result.status,'PASS');assert.equal(result.usage.apiCalls,2);assert.equal(result.usage.totals.totalTokens,200);
 const report=JSON.parse(await readFile(path.join(f.project,'reports/usage/add-search.json'),'utf8'));assert.equal(report.apiCalls,2);assert.equal(report.totals.inputTokens,150);assert.equal(report.totals.outputTokens,50);
});

test('Spec submission requires a completed reviewer bound to the current proposal and deltas',async t=>{
 const f=await setup(t);await toSpec(f);
 await assert.rejects(f.call('submit-spec',{report,skipSpecReview:true}),/spec-reviewer/);
 await f.agent('spec-reviewer','spec',undefined,{findings:[{severity:'critical',message:'Scenario does not cover failure.',path:'planning/changes/add-search/specs/search/spec.md',line:1}]});
 await assert.rejects(f.call('submit-spec',{report,skipSpecReview:true}),/critical/);
 await f.agent('spec-reviewer','spec',undefined,{findings:[{severity:'warning',message:'Add an empty-result scenario.',path:'planning/changes/add-search/specs/search/spec.md',line:1}]});
 await assert.rejects(f.call('submit-spec',{report,skipSpecReview:true}),/warning/);
 const c=await f.context();
 await f.call('save-spec',{contextHash:c.contextHash,proposal,specs:{search:delta.replace('matching orders appear.','matching orders appear after a revision.')}});
 await assert.rejects(f.call('submit-spec',{report,skipSpecReview:true}),/stale/);
});

test('human review decisions support accept-record, accept-no-record and reject',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');
 await f.approve('accept-no-record');
 assert.equal(f.state.approvals.prd.decision,'accept-no-record');assert.equal(f.state.approvals.prd.recorded,false);assert.equal(f.state.approvals.prd.confirmation,undefined);
 let c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});await f.call('submit-spec',{report});
 await f.approve('reject',{feedback:'Add the empty-result scenario before approval.'});
 assert.equal(f.state.stage,'spec');assert.equal(f.state.pendingApproval,null);assert.equal(f.state.approvals.spec,undefined);
 c=await f.context();await f.call('save-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});await f.call('submit-spec',{report});
 await f.approve();
 assert.equal(f.state.approvals.spec.decision,'accept-record');assert.equal(f.state.approvals.spec.recorded,true);assert.equal(f.state.approvals.spec.confirmation.source,'test only');
});

test('empty projects skip architecture exploration without skipping classification or gates',async t=>{
 const f=await setup(t);await rm(path.join(f.project,'fixture.js'));
 await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');await f.approve();
 const c=await f.context();
 assert.equal(c.context.emptyProject,true);assert.equal(c.context.explorationSkipped,true);assert.equal(c.context.instarReferences.skipped,true);assert.deepEqual(c.context.instarReferences.documents,{});
});

test('strict verification evidence binds checks to the configured report, report id and artifact hash',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 const implementationIds=['lint-check','format-check','test-check'],fullIds=[...implementationIds,'security-check'];
 const configured={schemaVersion:3,baseRef:'main',verification:{profiles:{commit:fullIds,implementation:implementationIds,full:fullIds}},tools:{checks:Object.fromEntries([
  ['lint-check','lint'],['format-check','format'],['test-check','test'],['security-check','security']
 ].map(([id,kind])=>[id,{kind,command:process.execPath,args:['-e','process.exit(0)']}]))}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(configured));
 const commit=gitInit(f.project);await commit();
 await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(await strictReport(f.project,'implementation','implementation-1',implementationIds)));
 await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));
 const implementationChecks=implementationIds.map(id=>({checkId:id,reportId:'implementation-1',kind:id.replace('-check',''),name:id,outcome:'passed',evidence:`${id} passed`,artifact:`reports/fixture/${id.replace('-check','')}.json`}));
 await f.call('submit-implementation',{report,checks:implementationChecks});
 await f.approve();
 await writeFile(path.join(f.project,'reports/engineering-verify-full.json'),JSON.stringify(await strictReport(f.project,'full','verify-1',fullIds)));
 const strictChecks=fullIds.map(id=>({checkId:id,reportId:'verify-1',kind:id.replace('-check',''),name:id,outcome:'passed',evidence:`${id} passed`,artifact:`reports/fixture/${id.replace('-check','')}.json`}));
 await f.call('submit-verification',{report,checks:strictChecks});
 assert.equal(f.state.verification.evidence.mode,'strict');assert.equal(f.state.verification.evidence.reportId,'verify-1');
 assert.equal(f.state.verification.evidence.reportHash.length,64);assert.equal(f.state.verification.checks.every(item=>item.source==='project-command'&&item.artifactHash.length===64),true);
 await f.approve();await writeFile(path.join(f.project,'reports/fixture/lint.json'),JSON.stringify({status:'tampered'}));
 await assert.rejects(f.call('archive'),/artifact changed after evidence was recorded/);
});

test('strict evidence rejects reused or mismatched artifacts and incomplete quality-gate reviews',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 const ids=['lint-check','format-check','test-check'];
 const configured={schemaVersion:3,baseRef:'main',verification:{profiles:{commit:[...ids,'security-check'],implementation:ids,full:[...ids,'security-check']}},tools:{checks:Object.fromEntries([...ids,'security-check'].map(id=>[id,{kind:id.replace('-check',''),command:process.execPath,args:['-e','process.exit(0)']}]))}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(configured));const commit=gitInit(f.project);await commit();
 await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(await strictReport(f.project,'implementation','implementation-bind',ids)));
 const gate=await qualityGateReport(f.project);gate.review.checks=[];await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(gate));
 const checksFor=reportId=>ids.map(id=>({checkId:id,reportId,kind:id.replace('-check',''),name:id,outcome:'passed',evidence:'fixture passed',artifact:`reports/fixture/${id.replace('-check','')}.json`}));
 await assert.rejects(f.call('submit-implementation',{checks:checksFor('implementation-bind')}),/Review checklist incomplete/);
 await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));
 const reused=await strictReport(f.project,'implementation','implementation-bind',ids);reused.checks[1].artifact=reused.checks[0].artifact;await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(reused));
 await assert.rejects(f.call('submit-implementation',{checks:checksFor('implementation-bind')}),/reuses artifact/);
 await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(await strictReport(f.project,'implementation','implementation-bind',ids)));
 const mismatch=checksFor('implementation-bind').map((item,index)=>index?item:{...item,artifact:'reports/fixture/test.json'});
 await assert.rejects(f.call('submit-implementation',{checks:mismatch}),/artifact must match the generated report/);
});

test('legacy quality configuration uses labelled manual evidence',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main'}));
 await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation',{report,checks});
 assert.equal(f.state.evidencePolicy.mode,'manual');assert.equal(f.state.implementationReview.evidence.mode,'manual');await f.approve();
});

test('strict evidence rejects stale reports and quality-gate evidence',async t=>{
 const configured={schemaVersion:3,baseRef:'main',verification:{profiles:{commit:['lint-check','format-check','test-check','security-check'],implementation:['lint-check','format-check','test-check'],full:['lint-check','format-check','test-check','security-check']}},tools:{checks:Object.fromEntries([
  ['lint-check','lint'],['format-check','format'],['test-check','test'],['security-check','security']
 ].map(([id,kind])=>[id,{kind,command:process.execPath,args:['-e','process.exit(0)']}]))}};
 async function prepared(configBeforeStart=false){const f=await setup(t);if(configBeforeStart)await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(configured));await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});if(!configBeforeStart)await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(configured));const commit=gitInit(f.project);await commit();const implementationIds=['lint-check','format-check','test-check'];await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(await strictReport(f.project,'implementation','implementation-stale',implementationIds)));await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));const checks=implementationIds.map(checkId=>({checkId,reportId:'implementation-stale',kind:configured.tools.checks[checkId].kind,name:checkId,outcome:'passed',evidence:`${checkId} passed`,artifact:`reports/fixture/${configured.tools.checks[checkId].kind}.json`}));return {f,checks};}
 const source=await prepared();await writeFile(path.join(source.f.project,'fixture.js'),'export const fixture = "changed";\n');
 await assert.rejects(source.f.call('submit-implementation',{checks:source.checks}),/Strict verification implementation report is stale/);
 const configuration=await prepared();const changed=JSON.parse(JSON.stringify(configured));changed.tools.checks['lint-check'].args=['-e','process.exit(1)'];await writeFile(path.join(configuration.f.project,'.instar-quality.json'),JSON.stringify(changed));
 await assert.rejects(configuration.f.call('submit-implementation',{checks:configuration.checks}),/stale|different quality configuration/);
 const gate=await prepared();const staleGate=await qualityGateReport(gate.f.project,'quality-stale');staleGate.snapshot={...staleGate.snapshot,fingerprint:'old'};await writeFile(path.join(gate.f.project,'reports/quality-gate.json'),JSON.stringify(staleGate));
 await assert.rejects(gate.f.call('submit-implementation',{checks:gate.checks}),/Quality-gate evidence is stale/);
 const removed=await prepared(true);await rm(path.join(removed.f.project,'.instar-quality.json'));
 await assert.rejects(removed.f.call('submit-implementation',{checks:removed.checks,skipAutoQualityGate:true}),/Quality configuration was removed/);
});

test('strict verification rejects unconfigured checks, mismatched report ids and missing required kinds',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 const implementationIds=['lint-check','format-check','test-check'],fullIds=['lint-check','format-check','test-check','security-check'];
 const configured={schemaVersion:3,baseRef:'main',verification:{profiles:{commit:fullIds,implementation:implementationIds,full:fullIds}},tools:{checks:{'lint-check':{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']},'test-check':{kind:'test',command:process.execPath,args:['-e','process.exit(0)']},'format-check':{kind:'format',command:process.execPath,args:['-e','process.exit(0)']},'security-check':{kind:'security',command:process.execPath,args:['-e','process.exit(0)']}}}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(configured));
 const commit=gitInit(f.project);await commit();
 await writeFile(path.join(f.project,'reports/engineering-verify-implementation.json'),JSON.stringify(await strictReport(f.project,'implementation','implementation-2',implementationIds)));
 await writeFile(path.join(f.project,'reports/engineering-verify-full.json'),JSON.stringify(await strictReport(f.project,'full','verify-2',fullIds)));
 await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));
 const implementationChecks=[{checkId:'lint-check',reportId:'implementation-2',kind:'lint',name:'lint',outcome:'passed',evidence:'lint passed',artifact:'reports/fixture/lint.json'},{checkId:'format-check',reportId:'implementation-2',kind:'format',name:'format',outcome:'passed',evidence:'format passed',artifact:'reports/fixture/format.json'},{checkId:'test-check',reportId:'implementation-2',kind:'test',name:'test',outcome:'passed',evidence:'test passed',artifact:'reports/fixture/test.json'}];
 await f.call('submit-implementation',{report,checks:implementationChecks});
 const valid=[{checkId:'lint-check',reportId:'verify-2',kind:'lint',name:'lint',outcome:'passed',evidence:'lint passed',artifact:'reports/fixture/lint.json'},{checkId:'test-check',reportId:'verify-2',kind:'test',name:'test',outcome:'passed',evidence:'test passed',artifact:'reports/fixture/test.json'}];
 await assert.rejects(f.call('submit-verification',{report,checks:valid}),/Verification checks missing: security|no security check|missing required security/);
 const fullValid=[...valid,{checkId:'format-check',reportId:'verify-2',kind:'format',name:'format',outcome:'passed',evidence:'format passed',artifact:'reports/fixture/format.json'},{checkId:'security-check',reportId:'verify-2',kind:'security',name:'security',outcome:'passed',evidence:'security passed',artifact:'reports/fixture/security.json'}];
 const unknown=[...fullValid,{checkId:'not-configured',reportId:'verify-2',kind:'security',name:'security-extra',outcome:'passed',evidence:'x',artifact:'reports/fixture/security.json'}];
 await assert.rejects(f.call('submit-verification',{report,checks:unknown}),/not configured/);
 const wrongReport=fullValid.map(item=>({...item,reportId:'wrong'}));
 await assert.rejects(f.call('submit-verification',{report,checks:wrongReport}),/must reference report/);
});

test('reviewer fallback is blocked by default and requires an explicit workflow opt-in',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');await f.approve();const c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});
 await f.agent('spec-reviewer','spec',undefined,{executionMode:'main-agent-fallback',fallbackReason:'No subagent available in this fixture'});
 await assert.rejects(f.call('submit-spec',{report,skipSpecReview:true}),/subagent/);
 const g=await setup(t);await g.call('start',{document:'# PRD\nSearch orders.',allowMainAgentFallback:true});await g.call('submit-prd');await g.approve();const gc=await g.context();await g.call('create-spec',{contextHash:gc.contextHash,proposal,specs:{search:delta}});
 await g.agent('spec-reviewer','spec',undefined,{executionMode:'main-agent-fallback',fallbackReason:'Explicitly allowed by fixture'});
 await g.call('submit-spec',{report,skipSpecReview:true});assert.equal(g.state.pendingApproval,'spec');
});

test('manual verification evidence is labelled for legacy quality configuration',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await f.prepareVerification();
 const unlabelled=checks.map(({source,manualReason,...item})=>item);
 await assert.rejects(f.call('submit-verification',{report,checks:unlabelled,skipVerificationEvidence:true}),/source: manual/);
 await f.call('submit-verification',{report,checks,skipVerificationEvidence:true});assert.equal(f.state.verification.evidence.mode,'manual');
});

test('implementation approval gates extended quality and binds its source snapshot',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 await f.call('submit-implementation');
 assert.equal(f.state.pendingApproval,'implementation');
 assert.deepEqual(f.state.implementationReview.reviews,['architect','code-reviewer']);
 await assert.rejects(f.call('submit-verification',{report,checks,skipImplementationApproval:true,skipVerificationEvidence:true}),/unavailable|implementation approval/);
 await f.approve();assert.equal(f.state.stage,'verification');
 await writeFile(path.join(f.project,'fixture.js'),'export const fixture = "changed";\n');
 await assert.rejects(f.call('submit-verification',{report,checks}),/Source changed after implementation approval/);
});

test('frontend verification requires frontend-reviewer',async t=>{
 const f=await setup(t);await toSpec(f,{ui:true,stack:'frontend'});await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});await f.approve();c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await f.approve();
 await f.skill('frontend-verify','verification');await f.agent('security-reviewer','verification');await f.agent('ui-reviewer','verification');
 await assert.rejects(f.call('submit-verification',{report,checks,skipVerificationEvidence:true}),/frontend-reviewer/);
 await f.agent('frontend-reviewer','verification');
 await f.call('submit-verification',{report,checks,skipVerificationEvidence:true});assert.equal(f.state.pendingApproval,'acceptance');
});

test('source snapshot rejects symlinks explicitly',async t=>{
 const f=await setup(t);await symlink(path.join(f.project,'fixture.js'),path.join(f.project,'linked-fixture.js'));
 await assert.rejects(sourceSnapshot(f.project),/Symlink not supported in source snapshot/);
});

test('usage records expose stage, skill and agent attribution',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.',usageBudget:{maxTokens:100,maxApiCalls:1}});
 await run({...f.base,action:'record-usage',stage:'prd',skill:'write-a-prd',source:'fixture',apiCalls:2,usage:{inputTokens:100,cachedInputTokens:20,outputTokens:10,reasoningOutputTokens:5,totalTokens:110}});
 await run({...f.base,action:'record-usage',stage:'design',agent:'architect',source:'fixture',apiCalls:1,usage:{inputTokens:50,outputTokens:5,totalTokens:55}});
 const report=JSON.parse(await readFile(path.join(f.project,'reports/usage/add-search.json'),'utf8'));
 assert.equal(report.byStage.prd.totalTokens,110);assert.equal(report.byStage.design.totalTokens,55);assert.equal(report.bySkill['write-a-prd'].apiCalls,2);assert.equal(report.byAgent.architect.totalTokens,55);assert.equal(report.budget.status,'exceeded');assert.equal(report.budget.maxTokens,100);
});

test('enforced usage budget blocks transitions until the budget is updated',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.',usageBudget:{maxTokens:50,enforce:true}});
 await run({...f.base,action:'record-usage',stage:'prd',source:'fixture',usage:{inputTokens:60,outputTokens:10,totalTokens:70}});
 await assert.rejects(f.call('submit-prd'),/Usage budget exceeded/);
 await f.call('set-usage-budget',{usageBudget:{maxTokens:100,enforce:true}});
 await f.call('submit-prd');assert.equal(f.state.pendingApproval,'prd');
});

test('workflow visualization and schema migration preserve state while invalidating old approvals',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});
 const view=await run({...f.base,action:'visualize'});assert.match(view.markdown,/Stage: prd/);assert.equal(view.summary.changeId,'add-search');
 const file=path.join(f.project,'planning/workflows/add-search.json');const state=JSON.parse(await readFile(file,'utf8'));state.schemaVersion=1;state.approvals={prd:{hash:'old'}};await writeFile(file,JSON.stringify(state));
 const legacy=await run({...f.base,action:'state'});assert.ok(legacy.compatibility.some(item=>item.code==='legacy-workflow-schema'));
 const migrated=await run({...f.base,action:'migrate',expectedVersion:1,reason:'Upgrade fixture to strict evidence',ui:false,stack:'backend'});
 assert.equal(migrated.schemaVersion,5);assert.deepEqual(migrated.approvals,{});assert.equal(migrated.migration.from,1);assert.equal(migrated.migration.to,5);
});

test('legacy design.md is reported in state and context without changing workflow state',async t=>{
 const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report});await f.approve();const c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});
 const dir=path.join(f.project,'planning/changes/add-search');await rename(path.join(dir,'technical-design.md'),path.join(dir,'design.md'));
 const state=await run({...f.base,action:'state'});assert.deepEqual(state.compatibility.map(item=>item.code),['legacy-design-document']);assert.equal(state.compatibility[0].replacement,'planning/changes/add-search/technical-design.md');
 const context=await run({...f.base,action:'context'});assert.deepEqual(context.compatibility.map(item=>item.code),['legacy-design-document']);assert.equal(context.context.technicalDesign,design);
 assert.equal((await run({...f.base,action:'state'})).version,state.version,'reading compatibility warnings must not persist state');
});

test('start, migration and human approval require explicit classification and decision',async t=>{
 const f=await setup(t);
 await assert.rejects(run({...f.base,action:'start',ui:false,document:'# PRD\nSearch orders.'}),/stack/);
 await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');
 await assert.rejects(run({...f.base,action:'approve',expectedVersion:f.state.version,reviewHash:f.state.pendingReview.hash,confirmation:{text:'Approved',source:'fixture'}}),/decision/);
 const file=path.join(f.project,'planning/workflows/add-search.json'),state=JSON.parse(await readFile(file,'utf8'));state.schemaVersion=1;await writeFile(file,JSON.stringify(state));
 await assert.rejects(run({...f.base,action:'migrate',expectedVersion:state.version,reason:'fixture'}),/ui boolean/);
 await assert.rejects(run({...f.base,action:'migrate',expectedVersion:state.version,reason:'fixture',ui:false}),/stack/);
});

test('every required reviewer role blocks critical findings and unverified checks',async t=>{
 const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
 for(const role of ['architect','code-reviewer']){
  const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
  await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main'}));await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));await f.prepareImplementation();await delay();
  await f.agent(role,'implementation',undefined,{findings:[{severity:'critical',message:'Blocking design defect.'}]});
  await assert.rejects(f.call('submit-implementation',{skipAutoQualityGate:true,skipImplementEvidence:true,report,checks}),/unresolved critical/);
 }
 for(const [role,ui] of [['security-reviewer',false],['ui-reviewer',true],['frontend-reviewer',true]]){
  const f=await setup(t);ui?await toUiImplementation(f):await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await f.approve();await f.prepareVerification();await delay();
  await f.agent(role,'verification',undefined,{findings:[{severity:'critical',message:'Blocking verification defect.'}]});
  await assert.rejects(f.call('submit-verification',{report,checks,skipVerificationEvidence:true}),/unresolved critical/);
 }
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main'}));await writeFile(path.join(f.project,'reports/quality-gate.json'),JSON.stringify(await qualityGateReport(f.project)));await f.prepareImplementation();await delay();
 await f.agent('architect','implementation',undefined,{unverified:['Call chain not inspected']});
 await assert.rejects(f.call('submit-implementation',{skipAutoQualityGate:true,skipImplementEvidence:true,report,checks}),/unverified/);
});

test('UI evidence schemas reject fake browser, accessibility and keyboard artifacts',async t=>{
 const f=await setup(t);await toUiImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});
 await writeFile(path.join(f.project,'reports/fixture/browser.json'),JSON.stringify({status:'passed'}));
 await assert.rejects(f.call('submit-implementation'),/browser artifact/);
 await writeFile(path.join(f.project,'reports/fixture/browser.json'),JSON.stringify({...artifactFixtures.browser,journeys:[{route:'/',status:'FAIL'}]}));
 await assert.rejects(f.call('submit-implementation'),/browser artifact/);
 await writeFile(path.join(f.project,'reports/fixture/browser.json'),JSON.stringify(artifactFixtures.browser));
 await f.call('submit-implementation');await f.approve();
 await writeFile(path.join(f.project,'reports/fixture/accessibility.json'),JSON.stringify({status:'passed'}));
 await assert.rejects(f.call('submit-verification',{report,checks}),/accessibility artifact/);
 await writeFile(path.join(f.project,'reports/fixture/accessibility.json'),JSON.stringify({...artifactFixtures.accessibility,results:[]}));
 await assert.rejects(f.call('submit-verification',{report,checks}),/accessibility artifact/);
 await writeFile(path.join(f.project,'reports/fixture/accessibility.json'),JSON.stringify(artifactFixtures.accessibility));
 await writeFile(path.join(f.project,'reports/fixture/keyboard.json'),JSON.stringify({status:'passed'}));
 await assert.rejects(f.call('submit-verification',{report,checks}),/keyboard artifact/);
 await writeFile(path.join(f.project,'reports/fixture/keyboard.json'),JSON.stringify({...artifactFixtures.keyboard,journeys:[{route:'/',steps:['Tab'],expectedFocus:'#search',actualFocus:'#cancel'}]}));
 await assert.rejects(f.call('submit-verification',{report,checks}),/keyboard artifact/);
});

test('schema strict policy cannot be downgraded and session usage keeps stage attribution',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:3,baseRef:'main',verification:{profiles:{commit:['lint'],implementation:['lint'],full:['lint']}},tools:{checks:{lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']}}}}));
 await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({schemaVersion:2,packageManager:'npm',baseRef:'main'}));await f.prepareImplementation();
 await assert.rejects(f.call('submit-implementation',{skipImplementEvidence:true,report,checks,skipAutoQualityGate:true}),/downgraded/);
 const usage=await setup(t);await usage.call('start',{document:'# PRD\nSearch orders.'});
 for(const stage of ['prd','design'])await run({...usage.base,action:'record-usage',sessionId:'same-session',source:'same-source',stage,usage:{inputTokens:10,outputTokens:5,totalTokens:15}});
 const reportFile=JSON.parse(await readFile(path.join(usage.project,'reports/usage/add-search.json'),'utf8'));
 assert.equal(reportFile.byStage.prd.totalTokens,15);assert.equal(reportFile.byStage.design.totalTokens,15);assert.equal(reportFile.totals.totalTokens,30);
});

test('sensitive configuration, managed deletion and nested generated paths are bounded',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});const config={schemaVersion:2,packageManager:'npm',baseRef:'main'};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({...config,context:{design:'.env.design.md'}}));
 await assert.rejects(loadQualityConfig(f.project),/non-sensitive/);
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({...config,context:{sessionState:'.context/PROJECT_STATE.md'}}));
 await assert.rejects(loadQualityConfig(f.project),/\.instar\/session/);
 const managed=JSON.parse(await readFile(path.join(f.project,'.instar.json'),'utf8'));managed.managed['important.txt']=hash('keep');await writeFile(path.join(f.project,'.instar.json'),JSON.stringify(managed));await writeFile(path.join(f.project,'important.txt'),'keep');
 const narrowed=await initialize(f.project,{stack:'backend'});assert.ok(narrowed.conflicts.some(item=>item.path==='important.txt'));assert.equal(await readFile(path.join(f.project,'important.txt'),'utf8'),'keep');
 const before=await sourceSnapshot(f.project);for(const dir of ['src/node_modules','src/dist','src/reports'])await mkdir(path.join(f.project,dir),{recursive:true});await writeFile(path.join(f.project,'src/node_modules/nested.js'),'ignored');await writeFile(path.join(f.project,'src/dist/nested.js'),'ignored');await writeFile(path.join(f.project,'src/reports/nested.json'),'{}');assert.equal((await sourceSnapshot(f.project)).treeHash,before.treeHash);
});

test('source snapshot ignores OS metadata and gitignored files but still detects source edits',async t=>{
 const f=await setup(t);
 await writeFile(path.join(f.project,'.gitignore'),'.DS_Store\nignored-cache/\n');
 const before=await sourceSnapshot(f.project);
 await writeFile(path.join(f.project,'.DS_Store'),'finder metadata');
 await mkdir(path.join(f.project,'ignored-cache'),{recursive:true});
 await writeFile(path.join(f.project,'ignored-cache','generated.bin'),'generated');
 const after=await sourceSnapshot(f.project);
 assert.equal(after.treeHash,before.treeHash);
 await writeFile(path.join(f.project,'source-change.js'),'export const changed = true;\n');
 assert.notEqual((await sourceSnapshot(f.project)).treeHash,after.treeHash);
});

test('workflow traces are sharded per change while preserving the legacy aggregate',async t=>{
 const f=await setup(t);
 await f.call('start',{document:'# PRD\nSearch orders.'});
 const shard=path.join(f.project,'.workflow/traces/add-search.jsonl');
 assert.match(await readFile(shard,'utf8'),/workflow-action/);
 assert.match(await readFile(path.join(f.project,'.workflow/traces.jsonl'),'utf8'),/workflow-action/);
 await f.call('submit-prd');
 assert.equal((await readFile(shard,'utf8')).trim().split('\n').length,2);
});

test('transaction cleanup retains recent committed backups and refuses pending recovery journals',async t=>{
 const f=await setup(t);
 await f.call('start',{document:'# PRD\nSearch orders.'});
 const root=path.join(f.project,'.workflow/transactions');
 for(const [index,at] of ['2026-01-01T00:00:00.000Z','2026-02-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'].entries()){
  const dir=path.join(root,`11111111-1111-1111-1111-${String(index).padStart(12,'0')}`);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'result.json'),JSON.stringify({status:'committed',at}));
 }
 const result=await gcTransactions(f.project,{retain:2});
 assert.ok(result.removed.length>=2);
 await writeFile(path.join(f.project,'.workflow/pending.json'),JSON.stringify({id:'pending'}));
 await assert.rejects(gcTransactions(f.project,{retain:2}),/pending/);
});
test('recovery never rolls back a transaction whose result is committed',async t=>{
 const f=await setup(t),id='22222222-2222-2222-2222-222222222222',backup=`.workflow/transactions/${id}`;
 await mkdir(path.join(f.project,backup,'before/planning/workflows'),{recursive:true});
 await writeFile(path.join(f.project,backup,'before/planning/workflows/committed.json'),'OLD');
 await writeFile(path.join(f.project,'planning/workflows/committed.json'),'NEW');
 await putJson(f.project,`${backup}/result.json`,{id,backup,status:'committed'});
 await putJson(f.project,'.workflow/pending.json',{id,backup,present:{planning:true,'docs/prd':false}});
 const result=await f.call('recover',{transactionId:id,reason:'committed before journal cleanup'});
 assert.equal(result.committed,true);
 assert.equal(await readFile(path.join(f.project,'planning/workflows/committed.json'),'utf8'),'NEW');
 await assert.rejects(readFile(path.join(f.project,'.workflow/pending.json')),{code:'ENOENT'});
});
test('workflow source snapshot includes configured ignored verification inputs',async t=>{
 const project=await fs.realpath(await mkdtemp(path.join(os.tmpdir(),'instar-snapshot-inputs-')));
 t.after(()=>rm(project,{recursive:true,force:true}));
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','InStar test');
 await writeFile(path.join(project,'.gitignore'),'vendor/\n');await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify({schemaVersion:3,verification:{inputs:['vendor/state.json']}}));
 await mkdir(path.join(project,'vendor'));await writeFile(path.join(project,'vendor/state.json'),'one');
 git('add','.');git('commit','-m','baseline');
 const before=await sourceSnapshot(project);await writeFile(path.join(project,'vendor/state.json'),'two');const after=await sourceSnapshot(project);
 assert.notEqual(after.treeHash,before.treeHash);
});

test('agent registration removal preserves dotted and inline TOML layouts',async ()=>{
 for(const text of ['agents.ui-reviewer.config_file = "agents/ui-reviewer.toml"\n','[agents]\nui-reviewer = { config_file = "agents/ui-reviewer.toml" }\n']){
  const result=removeAgentRegistrations(text,['ui-reviewer'],{'ui-reviewer':'agents/ui-reviewer.toml'});
  assert.deepEqual(result.removed,[]);assert.equal(result.text,text);assert.equal(result.conflicts.length,1);
 }
});
