// Verify the actual release in a relocated directory, without installing dependencies.
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,rm,readFile,writeFile,readdir,access,lstat,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=fileURLToPath(new URL('../release/',import.meta.url));
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
async function sameTree(left,right,label){
 const ls=await lstat(left),rs=await lstat(right);
 assert.equal(rs.isSymbolicLink(),ls.isSymbolicLink(),`${label}: entry type drift`);
 if(ls.isSymbolicLink()){assert.equal(await readlink(right),await readlink(left),`${label}: link drift`);return;}
 if(ls.isFile()){assert(rs.isFile(),`${label}: packaged entry is not a file`);assert.deepEqual(await readFile(right),await readFile(left),`${label}: content drift`);return;}
 assert(ls.isDirectory(),`${label}: unsupported source entry`);assert(rs.isDirectory(),`${label}: packaged entry is not a directory`);
 const a=(await readdir(left,{withFileTypes:true})).filter(e=>e.name!=='.DS_Store').sort((x,y)=>x.name.localeCompare(y.name));
 const b=(await readdir(right,{withFileTypes:true})).filter(e=>e.name!=='.DS_Store').sort((x,y)=>x.name.localeCompare(y.name));
 assert.deepEqual(b.map(e=>e.name),a.map(e=>e.name),`${label}: entry list drift`);
 for(let i=0;i<a.length;i++){
  const x=a[i],ap=path.join(left,x.name),bp=path.join(right,x.name);await sameTree(ap,bp,`${label}/${x.name}`);
 }
}
const temp=await mkdtemp(path.join(tmpdir(),'instar-release-'));
try {
 const marketplace=JSON.parse(await readFile(path.join(source,'.agents/plugins/marketplace.json'),'utf8'));
 assert.equal(marketplace.name,'instar-local');
 const entry=marketplace.plugins.find(p=>p.name==='instar');
 assert.equal(entry.source.source,'local');assert.equal(entry.source.path,'./plugins/instar');
 const plugin=path.join(temp,'plugin'),project=path.join(temp,'project');
 await cp(path.resolve(source,entry.source.path),plugin,{recursive:true});await mkdir(project);
 for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md','README.md','runtime','skills','standards','docs','.codex-plugin','hooks','commands','assets','logs','bin'])await sameTree(path.join(sourceRoot,name),path.join(plugin,name),`release/${name}`);
 await assert.rejects(access(path.join(plugin,'design-system')),{code:'ENOENT'});
 const manifest=JSON.parse(await readFile(path.join(plugin,'.codex-plugin/plugin.json'),'utf8'));
 assert.equal(manifest.name,'instar');
 await assert.rejects(access(path.join(plugin,'assets/templates')),{code:'ENOENT'});
 assert.equal((await readdir(path.join(plugin,'skills'),{withFileTypes:true})).filter(x=>x.isDirectory()).length,20);
 for(const file of ['.codex-plugin/plugin.json','hooks/hooks.json','hooks/quality-hook.mjs','commands/doctor.md','commands/design-check.md','commands/extract-design-md.md','runtime/quality-controller/cli.mjs','runtime/shared/redaction.mjs','runtime/shared/bounded-input.mjs','runtime/quality-controller/ci.mjs','runtime/workflow-controller/evaluation.mjs','LICENSE','README.md','docs/LOCAL_TESTING.md','docs/EVALUATION.md','runtime/openspec-min/node_modules/zod/package.json','runtime/node_modules/smol-toml/package.json',...['proposal','spec','design','tasks'].map(n=>`runtime/openspec-min/artifact-templates/${n}.md`)])await access(path.join(plugin,file));
 function call(input){
  const r=spawnSync(process.execPath,[path.join(plugin,'runtime/workflow-controller/cli.mjs'),'-'],{cwd:temp,input:JSON.stringify({project,...input}),encoding:'utf8',env:{...process.env,NODE_PATH:''}});
  assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
 }
 // Exercise the actual new entrypoint from a relocated release.
 await writeFile(path.join(project,'search.js'),'export const search = (items, q) => items.filter(item => item.includes(q));\n');
 function discover(input){
  const r=spawnSync(process.execPath,[path.join(plugin,'bin/instar.mjs'),'spec-discover','-'],{cwd:temp,input:JSON.stringify({project,...input}),encoding:'utf8',env:{...process.env,NODE_PATH:''}});
  assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
 }
 const discoveryContext=discover({action:'context',scopes:['search.js']});
 const discovery=discover({action:'capture',scopes:['search.js'],contextHash:discoveryContext.contextHash,
  specs:{search:'# Search\n## Purpose\nCurrent local search behavior.\n## Requirements\n### Requirement: Search items\nThe system SHALL include matching items.\n#### Scenario: Match\nWHEN the item includes the query THEN the item is returned.\n'},
  evidence:{search:[{requirement:'Search items',path:'search.js',startLine:1,endLine:1,excerpt:'items.filter(item => item.includes(q))'}]},reviewedFiles:['search.js'],limitations:['Release fixture; no model inference tested']});
 assert.equal(discovery.status,'PASS');assert.match(await readFile(path.join(project,'planning/specs/search/spec.md'),'utf8'),/Discovery evidence/);
 await assert.rejects(access(path.join(project,'.instar.json')),{code:'ENOENT'});
 await access(path.join(plugin,'skills/spec-discover/references/upstream-explore.ts'));
 await access(path.join(plugin,'runtime/openspec-min/LICENSE'));
 const changeId='release-smoke';
 const state=call({action:'start',changeId,document:'# PRD\n发布包隔离测试：订单筛选。'});
 call({action:'trace-skill',changeId,skill:'write-a-prd',event:'started',invocationId:'release-smoke-prd-1',stage:'prd',summary:'Drafting release smoke PRD'});
 const criteria=['problem-outcome','scope-boundaries','user-journey-states','measurable-acceptance','risks-dependencies'].map(id=>({id,status:'PASS',reason:'Covered in smoke fixture',evidence:['订单筛选']}));
 const evaluation=call({action:'evaluate-quality',changeId,expectedVersion:state.version,stage:'prd',evaluator:'release smoke fixture',criteria});
 assert.equal(evaluation.status,'PASS');assert.equal(evaluation.score,100);
 call({action:'trace-skill',changeId,skill:'write-a-prd',event:'completed',invocationId:'release-smoke-prd-1',stage:'prd',summary:'Smoke PRD drafted'});
 const pending=call({action:'submit-prd',changeId,expectedVersion:state.version});
 assert.equal(pending.pendingApproval,'prd');
 const events=(await readFile(path.join(project,'.workflow/traces.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(events.map(x=>x.type),['workflow-action','skill-invocation','quality-evaluation','skill-invocation','workflow-action']);
 assert.equal(call({action:'state',changeId}).version,pending.version);
 assert.match(await readFile(path.join(project,'docs/prd/release-smoke.md'),'utf8'),/订单筛选/);
 console.log('PASS: release marketplace, twenty skills, standalone spec discovery, workflow, bundled dependencies, relocated CLI and UTF-8 PRD review.');
} finally {await rm(temp,{recursive:true,force:true});}
