import {readFile,readdir,access,lstat,readlink} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
async function sameTree(left,right,label){
 const a=(await readdir(left,{withFileTypes:true})).filter(e=>e.name!=='.DS_Store').sort((x,y)=>x.name.localeCompare(y.name));
 const b=(await readdir(right,{withFileTypes:true})).filter(e=>e.name!=='.DS_Store').sort((x,y)=>x.name.localeCompare(y.name));
 assert.deepEqual(b.map(e=>e.name),a.map(e=>e.name),`${label}: entry list drift`);
 for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i],ap=path.join(left,x.name),bp=path.join(right,y.name),as=await lstat(ap),bs=await lstat(bp);
  assert.equal(bs.isSymbolicLink(),as.isSymbolicLink(),`${label}/${x.name}: entry type drift`);
  if(as.isSymbolicLink())assert.equal(await readlink(bp),await readlink(ap),`${label}/${x.name}: link drift`);
  else if(as.isDirectory())await sameTree(ap,bp,`${label}/${x.name}`);
  else{assert(as.isFile(),`${label}/${x.name}: unsupported source entry`);assert(bs.isFile(),`${label}/${x.name}: packaged entry is not a file`);assert.deepEqual(await readFile(bp),await readFile(ap),`${label}/${x.name}: content drift`);}
 }
}
for(const name of ['quality-controller','workflow-controller','shared','discovery-controller'])await sameTree(new URL(`src/${name}/`,root).pathname,new URL(`runtime/${name}/`,root).pathname,`runtime/${name}`);
async function treeBytes(dir){let total=0;for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())total+=await treeBytes(full);else if(item.isFile())total+=(await lstat(full)).size;}return total;}
assert((await treeBytes(new URL('runtime/openspec-min/node_modules/zod/',root).pathname))<6*1024*1024,'Bundled Zod runtime exceeded 6 MiB; inspect build pruning');
const names=['requirements-workflow','write-a-prd','spec-explore','spec-discover','spec-propose','spec-verify','spec-design','spec-tasks','engineering-implement','frontend-implement','frontend-verify','engineering-verify','design-check','extract-design-md','quality-gate','quality-evaluation','ci','context-optimizer','engineering-research','systematic-debugging'];
assert.deepEqual((await readdir(new URL('skills/',root),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort(),names.sort());
for(const name of names){const p=new URL(`skills/${name}/SKILL.md`,root),s=await readFile(p,'utf8');assert(s.startsWith(`---\nname: ${name}\n`));assert(/\ndescription: .+/.test(s));}
const visualDesignSkill=await readFile(new URL('skills/extract-design-md/SKILL.md',root),'utf8');assert.match(visualDesignSkill,/project root DESIGN\.md/);assert.match(visualDesignSkill,/`\.\/DESIGN\.md`/);assert.doesNotMatch(visualDesignSkill,/Place it at\s+`\.stitch\/DESIGN\.md`/);
async function links(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())await links(p);else if(item.name.endsWith('.md')&&!p.endsWith('/upstream.md')){const text=await readFile(p,'utf8');for(const m of text.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(m[1])||m[1].includes('<'))continue;await access(path.resolve(path.dirname(p),m[1].split('#')[0]));}}}}
await links(new URL('skills/',root).pathname);
await links(new URL('standards/',root).pathname);
for(const file of ['docs/plugin-arch.md','docs/QUALITY.md','docs/LOCAL_TESTING.md']){const full=new URL(file,root),source=await readFile(full,'utf8');for(const match of source.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(match[1])||match[1].includes('<'))continue;await access(path.resolve(path.dirname(full.pathname),match[1].split('#')[0]));}}
const api=await import('../runtime/openspec-min/entry.js');assert.deepEqual(Object.keys(api).sort(),['createSpecChange','runSpecVerifyGate','generateDesignDoc','generateTaskList','promoteToBaseline'].sort());
const manifest=JSON.parse(await readFile(new URL('.codex-plugin/plugin.json',root),'utf8'));
assert.equal(manifest.name,'instar');assert.equal(manifest.version,'2.4.0');assert.equal(manifest.skills,'./skills/');assert.equal(manifest.hooks,'./hooks/hooks.json');
const index=JSON.parse(await readFile(new URL('plugin.json',root),'utf8'));assert.equal(index.manifest,'./.codex-plugin/plugin.json');assert.equal(index.kind,'instar-engineering-index');assert.equal(index.$schema,undefined);
await access(new URL('assets/policy.json',root));
await assert.rejects(access(new URL('assets/templates/',root)),{code:'ENOENT'});
const hooks=JSON.parse(await readFile(new URL('hooks/hooks.json',root),'utf8'));
assert.deepEqual(Object.keys(hooks.hooks).sort(),['PreToolUse','SessionEnd']);
for(const file of ['hooks/quality-hook.mjs','runtime/shared/token-sources.mjs','runtime/shared/bounded-input.mjs','runtime/node_modules/smol-toml/package.json','runtime/quality-controller/cli.mjs','runtime/quality-controller/ci.mjs','commands/doctor.md','commands/design-check.md','commands/extract-design-md.md','standards/README.md','standards/architecture/overview.md','standards/languages/vue3.md','standards/languages/README.md','standards/languages/typescript.md','standards/languages/javascript.md','standards/languages/python.md','standards/languages/go.md','standards/languages/java.md','standards/languages/rust.md','standards/common/security.md','standards/common/testing.md','standards/api/DESIGN.md','standards/api/SECURITY.md','standards/database/DESIGN.md','standards/database/MIGRATIONS.md'])await access(new URL(file,root));
await access(new URL('runtime/quality-controller/friendly-cli.mjs',root));
for(const file of ['runtime/discovery-controller/cli.mjs','runtime/openspec-min/src/discovery/validate.js','runtime/openspec-min/src/discovery/instructions.js','runtime/openspec-min/LICENSE','commands/spec-discover.md','skills/spec-discover/LICENSE','skills/spec-discover/references/upstream-explore.ts'])await access(new URL(file,root));
const artifactTemplatePairs=[
 ['skills/spec-propose/assets/proposal.md','src/openspec-min/artifact-templates/proposal.md','src/openspec-min/src/skills/propose/assets/proposal.md'],
 ['skills/spec-propose/assets/spec.md','src/openspec-min/artifact-templates/spec.md','src/openspec-min/src/skills/propose/assets/spec.md'],
 ['skills/spec-tasks/assets/tasks.md','src/openspec-min/artifact-templates/tasks.md','src/openspec-min/src/skills/tasks/assets/tasks.md'],
 ['skills/spec-design/assets/technical-design.md','src/openspec-min/src/skills/design/assets/technical-design.md'],
];
for(const pair of artifactTemplatePairs){const canonical=await readFile(new URL(pair[0],root),'utf8');for(const copy of pair.slice(1))assert.equal(await readFile(new URL(copy,root),'utf8'),canonical,`Artifact template drift: ${pair[0]} != ${copy}`);}
const proposalTemplate=await readFile(new URL('skills/spec-propose/assets/proposal.md',root),'utf8');
assert.match(proposalTemplate,/Architecture impact \(exploration\)/);
assert.match(await readFile(new URL('skills/spec-propose/SKILL.md',root),'utf8'),/Carry forward the architecture impact summary.*proposal\.md/s);
const contextSource=await readFile(new URL('src/workflow-controller/documents.mjs',root),'utf8');
for(const reference of ['standards/api/DESIGN.md','standards/database/DESIGN.md','standards/languages/typescript.md'])assert(contextSource.includes(reference));
assert(!contextSource.includes('design-system/'));
assert(!((await readFile(new URL('src/quality-controller/index.mjs',root),'utf8')).includes('design-system/profiles')));
console.log(`Validated ${names.length} skills, links, sole install manifest, hooks, standards and runtime exports.`);
