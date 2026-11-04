import {symlinkAvailable} from './symlink-support.mjs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {run as qualityRun} from '../runtime/quality-controller/index.mjs';
import {reuseContext,reusePlanHash,validateReusePlan} from '../src/shared/code-reuse.mjs';
import {readEvidenceGraph} from '../runtime/shared/evidence-graph.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir,symlink,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run} from '../runtime/workflow-controller/index.mjs';
import {transaction,putJson,lock,fs} from '../runtime/workflow-controller/files.mjs';
const proposal='## Why\nUsers need search.\n## What Changes\nAdd search.\n## Capabilities\nsearch\n## Impact\nFrontend.';
const delta='## Purpose\nEnable users to find relevant orders using clear and consistent search behavior.\n## ADDED Requirements\n### Requirement: Search\nThe system SHALL search orders.\n#### Scenario: Match\n- **WHEN** a matching query is entered\n- **THEN** matching orders appear.\n';
const design='## Context\nOrder list.\n## Goals / Non-Goals\nFind orders.\n## Decisions\nUse existing list API.\n## Project Constraints\nFollow root AGENTS.md.\n## Architecture\nExisting order module with local state.\n## File Change Plan\nUpdate src/views/orders/OrderList.vue.\n## Risks / Trade-offs\nNetwork errors.\n## Migration Plan\nAdditive rollout.';
const tasks='- [ ] 1.1 Implement search; acceptance: matching query test passes.';
const localReuse=[{need:'Search for an existing implementation before creating a local module',searched:['src','docs/project-baseline/capabilities'],candidates:[],decision:'local-new',reason:'No fresh capability index or suitable public capability was found',verification:'Architecture review and focused tests'}];
const report={summary:'Reviewed documents against requirements.',source:'test fixture reviewer',issues:[],unverified:[]};
const checks=[{kind:'test',name:'search test',outcome:'passed',evidence:'fixture simulated test result'},{kind:'browser',name:'search journey',outcome:'passed',evidence:'fixture simulated browser result'}];
async function setup(t){const project=await fs.realpath(await mkdtemp(path.join(os.tmpdir(),'frontend-plugin-')));t.after(()=>rm(project,{recursive:true,force:true,maxRetries:20,retryDelay:100}));const base={project,changeId:'add-search'};let state;
 return {project,base,get state(){return state;},async call(action,extra={}){if(action==='write-design'&&extra.reuseDecisions===undefined)extra={...extra,reuseDecisions:localReuse};const result=await run({...base,action,expectedVersion:state?.version,...extra});if(result.version)state=result;return result;},async context(){return run({...base,action:'context'});},async approve(){return this.call('approve',{reviewHash:state.pendingReview.hash,intentId:state.pendingReview.intentId,challenge:state.pendingReview.challenge,confirmation:{text:'Approved fixture',source:'test only'}});}};}
async function toSpec(f,{affectedPaths=[]}={}){await f.call('start',{document:'# PRD\nSearch orders.',...(affectedPaths.length?{affectedPaths}:{})});await f.call('submit-prd');await f.approve();const c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});}

test('semantic evaluation reads nested capability specs and invalidates their fingerprint',async t=>{
 const f=await setup(t);await toSpec(f);const dir=path.join(f.project,'planning/changes/add-search/specs/orders/search');await mkdir(dir,{recursive:true});await fs.rename(path.join(f.project,'planning/changes/add-search/specs/search/spec.md'),path.join(dir,'spec.md'));
 const criteria=['prd-traceability','normative-requirements','behavior-scenarios','baseline-delta','architecture-impact'].map(id=>({id,status:'PASS',reason:'Nested spec reviewed',evidence:['The system SHALL search orders.']}));
 const first=await f.call('evaluate-quality',{stage:'spec',evaluator:'fixture',criteria});await fs.appendFile(path.join(dir,'spec.md'),'\nNested change.');
 const next=await f.call('evaluate-quality',{stage:'spec',evaluator:'fixture',criteria});assert.notEqual(first.fingerprint,next.fingerprint);
 const manifest=JSON.parse(await readFile(path.join(f.project,'reports/manifest.json'),'utf8'));
 const semantic=manifest.reports.filter(item=>item.kind==='semantic-quality'&&item.path==='reports/semantic-quality/add-search/spec.json');
 assert.equal(semantic.length,1);assert.equal(semantic[0].status,next.status);assert.equal(semantic[0].snapshotFingerprint,null);assert.match(semantic[0].hash,/^[a-f0-9]{64}$/);
});
async function toImplementation(f,options={}){await toSpec(f,options);await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();}
async function currentReview(f,{withReuse=true}={}){
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:f.project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 if(!await access(path.join(f.project,'.git')).then(()=>true,()=>false)){git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','Workflow fixture');git('add','.');git('commit','-m','fixture baseline');}
 const snapshot=await qualityRun({action:'snapshot',project:f.project});
 const reuse=withReuse?await reuseContext(f.project):null;
 const reuseReview=withReuse?{changeId:f.state.changeId,planHash:reusePlanHash(f.state.reuseDecisions||[]),fingerprint:reuse.fingerprint,decisions:f.state.reuseDecisions||[],checks:['reuse-existing','duplicate-implementation','shared-capability-design'].map(id=>({id,status:'PASS',evidence:'Fixture verified the bounded reuse search and approved decisions'}))}:undefined;
 return qualityRun({action:'quality-gate',project:f.project,review:{reviewer:'workflow fixture',fingerprint:snapshot.fingerprint,checks:['correctness','maintainability','architecture','security','performance','naming'].map(id=>({id,status:'PASS',evidence:'Fixture orchestration evidence'})),...(reuseReview?{reuseReview}:{})}});
}
async function submitVerification(f,verificationChecks=checks){await f.call('submit-quality-review',{report:await currentReview(f)});return f.call('submit-verification',{report,checks:verificationChecks});}

test('workflow rejects a stale or modified quality report before binding source',async t=>{
 const f=await setup(t);await toImplementation(f,{affectedPaths:['unindexed.js']});await f.call('complete-task',{taskId:'1.1',evidence:'Fixture'});await f.call('submit-implementation');
 const old=await currentReview(f);await writeFile(path.join(f.project,'unindexed.js'),'export const changed=true;');
 await assert.rejects(f.call('submit-quality-review',{report:old}),/stale/);
 const fresh=await currentReview(f);await assert.rejects(f.call('submit-quality-review',{report:{...fresh,projectRoot:'other'}}),/integrity/);
 await f.call('submit-quality-review',{report:fresh});
});

test('submit-quality-review reads a bounded workspace report and rejects path escape',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'Fixture'});await f.call('submit-implementation');
 const review=await currentReview(f);await mkdir(path.join(f.project,'reports'),{recursive:true});
 await writeFile(path.join(f.project,'reports/review-input.json'),JSON.stringify(review));
 await assert.rejects(f.call('submit-quality-review',{reportPath:'../outside.json'}),/workspace-relative/);
 await f.call('submit-quality-review',{reportPath:'reports/review-input.json'});
 assert.equal(f.state.qualityReview.reportId,review.id);assert.equal(f.state.qualityReview.status,review.status);
});

test('enabled reuse permits planned extension and binds review to approved decisions',async t=>{
 const f=await setup(t),entry='service.js',source='export const value=1;';
 await writeFile(path.join(f.project,entry),source);
 const sourceHash=createHash('sha256').update(source).digest('hex');
 await mkdir(path.join(f.project,'docs/project-baseline/capabilities'),{recursive:true});
 await writeFile(path.join(f.project,'docs/project-baseline/capabilities/index.json'),JSON.stringify({schemaVersion:1,enabled:true,capabilities:[{id:'CAP-SERVICE',name:'Service',summary:'Service value',entry,sourceHash,visibility:'public',status:'active'}]}));
 await toSpec(f,{affectedPaths:[entry]});await f.call('submit-spec',{report});await f.approve();let c=await f.context();
 const decisions=[{need:'Extend service',searched:[entry],candidates:['CAP-SERVICE'],selected:'CAP-SERVICE',decision:'extend',sourceHash,reason:'Same responsibility',verification:'Service contract test'}];
 await f.call('write-design',{contextHash:c.contextHash,document:design,reuseDecisions:decisions});c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();
 await writeFile(path.join(f.project,entry),'export const value=2;');
 await f.call('complete-task',{taskId:'1.1',evidence:'Updated contract test'});await f.call('submit-implementation');
 const context=await reuseContext(f.project),review={changeId:'add-search',planHash:reusePlanHash(decisions),decisions};
 await validateReusePlan(f.project,context,review);
 await assert.rejects(validateReusePlan(f.project,context,{...review,decisions:[{...decisions[0],decision:'local-new'}]}),/differ/);
 await assert.rejects(validateReusePlan(f.project,context,{...review,planHash:'old'}),/stale/);
});

test('missing capability inventory still requires a review receipt bound to design decisions',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'Fixture implementation'});await f.call('submit-implementation');
 await assert.rejects(f.call('submit-quality-review',{report:await currentReview(f,{withReuse:false})}),/Reuse review required/);
 const reportWithReuse=await currentReview(f);await f.call('submit-quality-review',{report:reportWithReuse});
 assert.equal(f.state.qualityReview.reportId,reportWithReuse.id);
});
test('quality review binds an evidence graph and reopen advances the evidence epoch',async t=>{
 const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'Fixture implementation'});await f.call('submit-implementation');
 await f.call('submit-quality-review',{report:await currentReview(f)});
 const first=await readEvidenceGraph(f.project,f.state.evidenceGraph.path),epoch=f.state.evidenceEpoch,generation=f.state.generationId;
 assert.equal(first.snapshotFingerprint,f.state.qualityReview.sourceSnapshot.fingerprint);
 assert.equal(first.evidenceEpoch,epoch);assert.equal(first.generationId,generation);
 assert.ok(first.nodes.some(node=>node.id==='artifact.prd'));
 await f.call('reopen',{stage:'implementation',reason:'Evidence regeneration test'});
 assert.equal(f.state.evidenceEpoch,epoch+1);assert.equal(f.state.evidenceGraph,undefined);
 assert.ok(f.state.supersededEvidence.some(item=>item.fingerprint===first.fingerprint));
 await f.call('submit-implementation');await f.call('submit-quality-review',{report:await currentReview(f)});
 assert.equal(f.state.evidenceEpoch,epoch+1);assert.notEqual(f.state.evidenceGraph.path,`${f.state.evidenceGraph.path.split('/').slice(0,-1).join('/')}/${epoch}-${generation}.json`);
 const second=await readEvidenceGraph(f.project,f.state.evidenceGraph.path);assert.notEqual(second.fingerprint,first.fingerprint);
});
test('quality review rejects changed source outside the declared affectedPaths',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'app.js'),'export const version = 1;\n');
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:f.project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 git('init','-b','main');git('config','user.email','scope@example.invalid');git('config','user.name','Scope fixture');git('add','.');git('commit','-m','scope baseline');
 await toImplementation(f,{affectedPaths:['app.js']});
 await writeFile(path.join(f.project,'app.js'),'export const version = 1;\nexport const changed = true;\n');await writeFile(path.join(f.project,'extra.js'),'export const undeclared = true;\n');
 await f.call('complete-task',{taskId:'1.1',evidence:'Fixture scope test'});await f.call('submit-implementation');
 await assert.rejects(f.call('submit-quality-review',{report:await currentReview(f)}),/outside affectedPaths: extra\.js/);
});

test('disabled capability inventory does not invalidate task generation',async t=>{
 const f=await setup(t);await mkdir(path.join(f.project,'docs/project-baseline/capabilities'),{recursive:true});
 const file=path.join(f.project,'docs/project-baseline/capabilities/index.json');await writeFile(file,JSON.stringify({schemaVersion:1,enabled:false,capabilities:[]}));
 await toSpec(f);await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});
 await writeFile(file,JSON.stringify({schemaVersion:1,enabled:false,capabilities:[],note:'inventory maintenance'}));
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'No governance opt-in'});
});
test('missing capability inventory requires a bounded search and local-new decision',async t=>{
 const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report});await f.approve();let c=await f.context();
 assert.equal(c.context.contextManifest.reuse.state,'missing');assert.match(c.context.contextManifest.fingerprint,/^[a-f0-9]{64}$/);
 await assert.rejects(f.call('write-design',{contextHash:c.contextHash,document:design,reuseDecisions:[]}),/Reuse decisions required/);
 await f.call('write-design',{contextHash:c.contextHash,document:design,reuseDecisions:localReuse});
 assert.equal(f.state.reuseIndexState,'missing');
});
test('design context manifest is persisted and required for task generation',async t=>{
 const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report});await f.approve();let c=await f.context();
 await f.call('write-design',{contextHash:c.contextHash,document:design});
 const file=path.join(f.project,'.workflow/context-manifests/add-search/design.json');
 const persisted=JSON.parse(await readFile(file,'utf8'));
 assert.equal(persisted.fingerprint,f.state.designContextManifestHash);
 await writeFile(file,JSON.stringify({...persisted,fingerprint:'0'.repeat(64)})+'\n');
 await assert.rejects(f.context(),/Persisted design context manifest is stale/);
 await writeFile(file,JSON.stringify(persisted,null,2)+'\n');
 c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'implementation');
});
test('a current semantic BLOCK prevents approval',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');
 const criteria=['problem-outcome','scope-boundaries','user-journey-states','measurable-acceptance','risks-dependencies'].map((id,index)=>({id,status:index===0?'BLOCK':'PASS',reason:'Fixture review',evidence:['Search orders.']}));
 await f.call('evaluate-quality',{stage:'prd',evaluator:'fixture',criteria});
 await assert.rejects(f.approve(),/Semantic quality gate is BLOCK/);
});
test('approval intent is one-time and challenge-bound',async t=>{
 const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await f.call('submit-prd');
 const pending=f.state.pendingReview;
 await assert.rejects(f.call('approve',{reviewHash:pending.hash,intentId:pending.intentId,challenge:'wrong',confirmation:{text:'Approved',source:'fixture'}}),/intent or challenge/);
 await f.approve();
 await assert.rejects(f.call('approve',{reviewHash:pending.hash,intentId:pending.intentId,challenge:pending.challenge,confirmation:{text:'Approved',source:'fixture'}}),/hash/);
});
test('all review boundaries and complete baseline/archive lifecycle',async t=>{const f=await setup(t);await f.call('start',{document:'# PRD\nSearch orders.'});await assert.rejects(f.call('create-spec',{proposal,specs:{search:delta}}),/unavailable/);await f.call('submit-prd');assert.equal(f.state.pendingApproval,'prd');await assert.rejects(f.call('approve',{reviewHash:'wrong',confirmation:{text:'yes',source:'fixture'}}),/hash/);await f.approve();let c=await f.context();await f.call('create-spec',{contextHash:c.contextHash,proposal,specs:{search:delta}});await f.call('submit-spec',{report});assert.equal(f.state.pendingApproval,'spec');await assert.rejects(f.call('write-design',{document:design}),/unavailable/);await f.approve();c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});assert.equal(f.state.pendingApproval,'implementation');await assert.rejects(f.call('complete-task',{taskId:'1.1',evidence:'fixture'}),/unavailable/);await f.approve();await f.call('complete-task',{taskId:'1.1',evidence:'fixture test and review'});await f.call('submit-implementation');await submitVerification(f);assert.equal(f.state.pendingApproval,'acceptance');await assert.rejects(f.call('archive'),/unavailable/);await f.approve();await f.call('archive');assert.equal(f.state.status,'completed');for(const p of ['proposal.md','specs/search/spec.md','technical-design.md','tasks.md','workflow.json'])assert.ok(await readFile(path.join(f.project,'planning/archive/add-search',p),'utf8'));assert.match(await readFile(path.join(f.project,'planning/specs/search/spec.md'),'utf8'),/Requirement: Search/);await assert.rejects(f.call('reopen',{stage:'prd',reason:'late edit'}),/immutable/);});
test('acceptance cannot archive after source changes since verification',async t=>{
 const f=await setup(t);await writeFile(path.join(f.project,'app.js'),'export const version = 1;');await toImplementation(f,{affectedPaths:['app.js']});
 await f.call('complete-task',{taskId:'1.1',evidence:'fixture tests passed'});await f.call('submit-implementation');
 await submitVerification(f);assert.ok(f.state.verification.sourceSnapshot.treeHash);await f.approve();
 await writeFile(path.join(f.project,'app.js'),'export const version = 2;');
 await assert.rejects(f.call('archive'),/Source tree changed after verification/);
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
 await writeFile(path.join(f.project,'AGENTS.md'),'# Project rules\n\n## Updated architecture constraint\nKeep search behavior inside the existing feature.\n');
 await assert.rejects(f.context(),/Project architecture guidance changed after technical design/);
 await f.call('reopen',{stage:'design',reason:'Architecture guidance changed after the design was written.'});
 await assert.rejects(readFile(path.join(f.project,'planning/changes/add-search/technical-design.md')),/ENOENT/);
 const context=await f.context();await f.call('write-design',{contextHash:context.contextHash,document:design});
 const taskContext=await f.context();await f.call('write-tasks',{contextHash:taskContext.contextHash,document:tasks});
 assert.equal(f.state.pendingApproval,'implementation');
});
test('Spec context honors configured canonical architecture, design and token paths',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'project-docs/system.md'),'# Canonical architecture');await writeFile(path.join(f.project,'project-docs/ui.md'),'# Canonical design');await writeFile(path.join(f.project,'project-docs/tokens.css'),'--color-primary: blue;');await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({context:{architecture:'project-docs/system.md',design:'project-docs/ui.md',tokens:['project-docs/tokens.css']}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();const c=await f.context();assert.equal(c.context.projectArchitecture.guidance['project-docs/system.md'],'# Canonical architecture');assert.equal(c.context.projectArchitecture.guidance['project-docs/ui.md'],'# Canonical design');assert.equal(c.context.projectArchitecture.guidance['project-docs/tokens.css'],'--color-primary: blue;');assert.deepEqual(c.context.projectArchitecture.tokenSources,['project-docs/tokens.css']);assert.equal(c.context.projectArchitecture.guidance['.context/ARCHITECTURE.md'],undefined);});
test('Spec context rejects missing, symlinked and non-file Token sources',async t=>{const f=await setup(t);await mkdir(path.join(f.project,'project-docs'),{recursive:true});await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({context:{tokens:'project-docs/tokens.css'}}));await f.call('start',{document:'PRD'});await f.call('submit-prd');await f.approve();await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(MISSING\)/);await writeFile(path.join(f.project,'outside.css'),'--color-primary: blue;');await t.test('reject linked Token',async t=>{if(!await symlinkAvailable(t))return;await symlink(path.join(f.project,'outside.css'),path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);await rm(path.join(f.project,'project-docs/tokens.css'));});await mkdir(path.join(f.project,'project-docs/tokens.css'));await assert.rejects(f.context(),/Invalid project Token source: project-docs\/tokens\.css \(UNSAFE\)/);});
test('document and implementation verification block missing evidence',async t=>{const f=await setup(t);await toSpec(f);await f.call('submit-spec',{report:{...report,unverified:['business mapping missing']}});assert.equal(f.state.status,'blocked');await f.call('submit-spec',{report});await f.approve();let c=await f.context();await f.call('write-design',{contextHash:c.contextHash,document:design});c=await f.context();await assert.rejects(f.call('write-tasks',{contextHash:c.contextHash,document:tasks+'\n- [ ] 1.1 Duplicate'}),/duplicate/);await f.call('write-tasks',{contextHash:c.contextHash,document:tasks});await f.approve();await assert.rejects(f.call('submit-implementation'),/evidence/);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await assert.rejects(f.call('submit-verification',{report,checks}),/quality-gate/);await submitVerification(f,checks.map(c=>({...c,outcome:'not-verified'})));assert.equal(f.state.status,'blocked');await assert.rejects(f.call('approve',{reviewHash:'none',confirmation:{text:'yes',source:'fixture'}}),/hash/);await submitVerification(f);assert.equal(f.state.pendingApproval,'acceptance');});

test('verification allows non-applicable browser checks for CLI projects',async t=>{const f=await setup(t);await toImplementation(f);await f.call('complete-task',{taskId:'1.1',evidence:'fixture'});await f.call('submit-implementation');await submitVerification(f,[{kind:'test',name:'CLI test',outcome:'passed',evidence:'fixture CLI test result'},{kind:'browser',name:'Browser journey',applicable:false,outcome:'not-applicable',evidence:'CLI project has no browser surface'}]);assert.equal(f.state.pendingApproval,'acceptance');assert.equal(f.state.verification.checks[1].applicable,false);});
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

test('stale controller lock is reclaimed so a killed operation does not self-block',async t=>{
 const f=await setup(t);
 const exited=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});
 await mkdir(path.join(f.project,'.workflow'),{recursive:true});
 await writeFile(path.join(f.project,'.workflow/controller.lock'),JSON.stringify({pid:exited.pid,at:new Date(Date.now()-1000).toISOString()}));
 await f.call('start',{document:'# PRD\nRecover from stale lock.'});
 assert.equal(f.state.stage,'prd');
});

