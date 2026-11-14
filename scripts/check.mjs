import {readFile,readdir,access,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {parse} from 'smol-toml';
import {artifactTemplatePairs} from './sync-templates.mjs';
import {skillNames,releaseEntries} from './inventory.mjs';
import {validateSkills} from './skill-contract.mjs';
const root=new URL('../',import.meta.url);
async function markdownFiles(dir){
 const files=[];
 async function walk(relative){
  for(const item of await readdir(new URL(`${relative}/`,root),{withFileTypes:true})){
   const next=`${relative}/${item.name}`;
   if(item.isDirectory())await walk(next);
   else if(item.isFile()&&item.name.endsWith('.md'))files.push(next);
  }
 }
 await walk(dir);
 return files.sort();
}
function markdownTargets(text,indexFile){
 const targets=new Set();
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const value=match[1].split('#')[0].trim();
  if(!value||/^(https?:|mailto:|\/)/.test(value)||value.includes('<'))continue;
  targets.add(path.posix.normalize(path.posix.join(path.posix.dirname(indexFile),value)));
 }
 return targets;
}
async function assertIndexCoverage(indexFiles,dir){
 const indexes=new Set(indexFiles),covered=new Set();
 for(const indexFile of indexFiles)for(const target of markdownTargets(await readFile(new URL(indexFile,root),'utf8'),indexFile))covered.add(target);
 const missing=(await markdownFiles(dir)).filter(file=>!indexes.has(file)&&!covered.has(file));
 assert.deepEqual(missing,[],`${indexFiles.join(' or ')} must index every Markdown reference under ${dir}/`);
}
async function sameTree(left,right,label){
 const visible=e=>e.name!=='.DS_Store'&&!/\.d\.(?:ts|mts|cts)$/.test(e.name);
 const a=(await readdir(left,{withFileTypes:true})).filter(visible).sort((x,y)=>x.name.localeCompare(y.name));
 const b=(await readdir(right,{withFileTypes:true})).filter(visible).sort((x,y)=>x.name.localeCompare(y.name));
 assert.deepEqual(b.map(e=>e.name),a.map(e=>e.name),`${label}: entry list drift`);
 for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i],ap=path.join(left,x.name),bp=path.join(right,y.name),as=await lstat(ap),bs=await lstat(bp);
  assert(!as.isSymbolicLink(),`${label}/${x.name}: source symlink is not allowed`);
  assert(!bs.isSymbolicLink(),`${label}/${x.name}: packaged symlink is not allowed`);
  if(as.isDirectory())await sameTree(ap,bp,`${label}/${x.name}`);
  else{assert(as.isFile(),`${label}/${x.name}: unsupported source entry`);assert(bs.isFile(),`${label}/${x.name}: packaged entry is not a file`);assert.deepEqual(await readFile(bp),await readFile(ap),`${label}/${x.name}: content drift`);}
 }
}
for(const name of ['quality-controller','workflow-controller','micro-controller','quick-controller','shared','discovery-controller'])await sameTree(fileURLToPath(new URL(`src/${name}/`,root)),fileURLToPath(new URL(`runtime/${name}/`,root)),`runtime/${name}`);
await sameTree(fileURLToPath(new URL('src/openspec-min/src/skills/',root)),fileURLToPath(new URL('src/openspec-min/dist/src/skills/',root)),'openspec-min/dist/src/skills');
async function treeBytes(dir){let total=0;for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);assert(!item.isSymbolicLink(),`runtime: symlink is not allowed: ${full}`);if(item.isDirectory())total+=await treeBytes(full);else if(item.isFile())total+=(await lstat(full)).size;else assert.fail(`runtime: unsupported entry: ${full}`);}return total;}
async function assertNoRuntimeNoise(dir,label){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);assert(!item.isSymbolicLink(),`${label}: symlink must not be packaged: ${full}`);assert(item.name!=='.DS_Store',`${label}: .DS_Store must not be packaged: ${full}`);assert(!/\.d\.(?:ts|mts|cts)$/.test(item.name),`${label}: declaration files must not be packaged: ${full}`);assert(!/\.map$/.test(item.name),`${label}: source maps must not be packaged: ${full}`);assert(!/\.cjs$/.test(item.name),`${label}: CommonJS files must not be packaged: ${full}`);if(item.isDirectory())await assertNoRuntimeNoise(full,label);}}
await assertNoRuntimeNoise(fileURLToPath(new URL('runtime/',root)),'runtime');
for(const entry of releaseEntries)await access(new URL(entry,root));
assert((await treeBytes(fileURLToPath(new URL('runtime/openspec-min/node_modules/zod/',root))))<6*1024*1024,'Bundled Zod runtime exceeded 6 MiB; inspect build pruning');
const names=skillNames;
assert.deepEqual((await readdir(new URL('skills/',root),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort(),names.sort());
for(const name of names){const p=new URL(`skills/${name}/SKILL.md`,root),s=await readFile(p,'utf8');assert(s.startsWith(`---\nname: ${name}\n`));assert(/\ndescription: .+/.test(s));}
await validateSkills(fileURLToPath(new URL('skills/',root)));
const internalSkills=await validateSkills(fileURLToPath(new URL('src/openspec-min/src/skills/',root)),{pluginRoot:fileURLToPath(new URL('src/openspec-min/',root))});
assert.deepEqual(internalSkills.names,['openspec-min-design','openspec-min-propose','openspec-min-tasks','openspec-min-verify']);
const visualDesignSkill=await readFile(new URL('skills/extract-design-md/SKILL.md',root),'utf8');assert.match(visualDesignSkill,/project root\s+DESIGN\.md/);assert.match(visualDesignSkill,/`\.\/DESIGN\.md`/);assert.doesNotMatch(visualDesignSkill,/Place it at\s+`\.stitch\/DESIGN\.md`/);
async function links(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())await links(p);else if(item.name.endsWith('.md')&&!p.endsWith('/upstream.md')){const text=await readFile(p,'utf8');for(const m of text.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(m[1])||m[1].includes('<'))continue;await access(path.resolve(path.dirname(p),m[1].split('#')[0]));}}}}
await links(fileURLToPath(new URL('skills/',root)));
await links(fileURLToPath(new URL('design-guidance/',root)));
await links(fileURLToPath(new URL('standards/',root)));
await assertIndexCoverage(['standards/README.md','standards/languages/README.md'],'standards');
const expectedStandards=['standards/README.md','standards/api/api.md','standards/architecture/fsd-layers.md','standards/architecture/overview.md','standards/coding/guidelines.md','standards/common/security.md','standards/common/testing.md','standards/database/MIGRATIONS.md','standards/database/postgresql.md','standards/database/query.md','standards/database/schema.md','standards/languages/README.md','standards/languages/css.md','standards/languages/go.md','standards/languages/java.md','standards/languages/javascript.md','standards/languages/python.md','standards/languages/rust.md','standards/languages/typescript.md','standards/languages/vue3.md'].sort();
assert.deepEqual(await markdownFiles('standards'),expectedStandards,'standards/ must keep only the consolidated reference set');
for(const file of ['standards/api/DESIGN.md','standards/api/DESIGN-SPEC.md','standards/api/INTERFACE-DESIGN.md','standards/api/SECURITY.md','standards/database/DESIGN.md','standards/database/DESIGN-SPEC.md','standards/database/QUERY-SPEC.md','standards/architecture/design-principles.md','standards/architecture/module-boundaries.md','standards/architecture/dependency-direction.md','standards/coding/error-handling.md','standards/coding/imports.md','standards/coding/naming.md','standards/coding/typescript.md','standards/css/bem.md','standards/css/theming.md','standards/testing/component.md','standards/testing/e2e.md','standards/testing/unit.md'])await assert.rejects(access(new URL(file,root)),{code:'ENOENT'});
await assertIndexCoverage(['design-guidance/DESIGN.md'],'design-guidance');
await assert.rejects(access(new URL('design-guidance/themes',root)),{code:'ENOENT'});
for(const file of ['docs/plugin-arch.md','docs/QUALITY.md','docs/LOCAL_TESTING.md']){const full=fileURLToPath(new URL(file,root)),source=await readFile(full,'utf8');for(const match of source.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(match[1])||match[1].includes('<'))continue;await access(path.resolve(path.dirname(full),match[1].split('#')[0]));}}
const api=await import('../runtime/openspec-min/entry.js');assert.deepEqual(Object.keys(api).sort(),['createSpecChange','runSpecVerifyGate','generateDesignDoc','generateTaskList','promoteToBaseline'].sort());
const packageManifest=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const manifest=JSON.parse(await readFile(new URL('.codex-plugin/plugin.json',root),'utf8'));
assert.equal(manifest.name,'instar');assert.equal(manifest.version,packageManifest.version,'plugin manifest version must match package.json');assert.equal(manifest.skills,'./skills/');assert.equal(manifest.hooks,'./hooks/hooks.json');
const docsIndex=await readFile(new URL('docs/README.md',root),'utf8');
const docsCapabilities=await readFile(new URL('docs/CAPABILITIES.md',root),'utf8');
assert(docsIndex.includes(packageManifest.version),'docs/README.md version must match package.json');
assert(docsCapabilities.includes(`v${packageManifest.version.split('.').slice(0,2).join('.')}`),'docs/CAPABILITIES.md major/minor version must match package.json');
assert.match(await readFile(new URL('LICENSE',root),'utf8'),/InStar Contributors/);
assert.match(await readFile(new URL('src/openspec-min/LICENSE',root),'utf8'),/OpenSpec Contributors/);
const index=JSON.parse(await readFile(new URL('plugin.json',root),'utf8'));assert.equal(index.manifest,'./.codex-plugin/plugin.json');assert.equal(index.kind,'instar-engineering-index');assert.equal(index.$schema,undefined);
await access(new URL('assets/policy.json',root));
await assert.rejects(access(new URL('logs/.gitkeep',root)),{code:'ENOENT'});
await assert.rejects(access(new URL('assets/templates/',root)),{code:'ENOENT'});
const hooks=JSON.parse(await readFile(new URL('hooks/hooks.json',root),'utf8'));
assert.deepEqual(Object.keys(hooks.hooks).sort(),['SessionEnd']);
for(const file of ['hooks/quality-hook.mjs','runtime/shared/agent-config.mjs','runtime/shared/token-sources.mjs','runtime/shared/usage-telemetry.mjs','runtime/shared/bounded-input.mjs','runtime/shared/run-command.mjs','runtime/shared/path-safety.mjs','runtime/shared/file-lock.mjs','runtime/node_modules/smol-toml/package.json','runtime/quality-controller/cli.mjs','runtime/workflow-controller/evidence.mjs','runtime/workflow-controller/visualize.mjs','runtime/workflow-controller/status-cli.mjs','templates/quality/security-check.mjs','templates/quality/a11y-check.mjs','templates/quality/README.md','commands/doctor.md','commands/design-check.md','commands/extract-design-md.md','agents/architect.md','agents/developer.md','agents/ui-reviewer.md','agents/code-reviewer.md','agents/security-reviewer.md','templates/agents/codex-config.toml','templates/agents/architect.toml','templates/agents/developer.toml','templates/agents/ui-reviewer.toml','templates/agents/code-reviewer.toml','templates/agents/security-reviewer.toml','standards/README.md','standards/architecture/overview.md','standards/architecture/fsd-layers.md','standards/coding/guidelines.md','standards/languages/vue3.md','standards/languages/README.md','standards/languages/css.md','standards/languages/typescript.md','standards/languages/javascript.md','standards/languages/python.md','standards/languages/go.md','standards/languages/java.md','standards/languages/rust.md','standards/common/security.md','standards/common/testing.md','standards/api/api.md','standards/database/schema.md','standards/database/query.md','standards/database/MIGRATIONS.md','design-guidance/DESIGN.md','design-guidance/rules/visual-language.md','design-guidance/rules/components-and-interaction.md','design-guidance/rules/layout-and-responsive.md','design-guidance/rules/accessibility.md','design-guidance/rules/theming.md','design-guidance/rules/tokens.md','design-guidance/rules/review-checklist.md'])await access(new URL(file,root));
await access(new URL('runtime/quality-controller/friendly-cli.mjs',root));
await access(new URL('templates/quality/keyboard-check.mjs',root));
for(const file of ['runtime/discovery-controller/cli.mjs','runtime/openspec-min/src/discovery/validate.js','runtime/openspec-min/src/discovery/instructions.js','runtime/openspec-min/LICENSE','commands/spec-discover.md','skills/spec-discover/LICENSE','skills/spec-discover/assets/upstream-explore.ts'])await access(new URL(file,root));
for(const entry of await readdir(new URL('commands/',root),{withFileTypes:true})){
 if(!entry.isFile()||!entry.name.endsWith('.md'))continue;
 const source=await readFile(new URL(`commands/${entry.name}`,root),'utf8');
 assert.doesNotMatch(source,/\.\.\//,`commands/${entry.name}: relative paths break when Codex migrates commands into nested Skills`);
}
for(const skill of ['spec-propose','spec-design','spec-tasks','spec-verify'])await access(new URL(`skills/${skill}/LICENSE`,root));
for(const pair of artifactTemplatePairs){const canonical=await readFile(new URL(pair[0],root),'utf8');for(const copy of pair.slice(1))assert.equal(await readFile(new URL(copy,root),'utf8'),canonical,`Artifact template drift: ${pair[0]} != ${copy}`);}
const provenanceSnapshots=[
 ['skills/spec-explore/assets/provenance.json','skills/spec-explore/assets/upstream.md','5bc03c568d0348c61b37f0647167252db5be1775ff5742ca9760b4e03ab9a5ac'],
 ['skills/spec-discover/assets/provenance.json','skills/spec-discover/assets/upstream-explore.ts','41f98bbf9e139d270d0e7bf4364feff264680ca253b32bf11032db4b12c2117d'],
];
for(const [manifestFile,snapshotFile,expectedHash] of provenanceSnapshots){
 const provenance=JSON.parse(await readFile(new URL(manifestFile,root),'utf8'));
 for(const field of ['source','upstreamRepository','upstreamPath','upstreamUrl','license','snapshotSha256'])assert.equal(typeof provenance[field],'string',`${manifestFile}: ${field} must be a string`);
 assert.equal(provenance.upstreamRepository,'https://github.com/Fission-AI/OpenSpec');
 assert.match(provenance.upstreamUrl,/^https:\/\/github\.com\/Fission-AI\/OpenSpec\//);
 assert.equal(provenance.license,'MIT');
 assert.equal(provenance.snapshotSha256,expectedHash,`${manifestFile}: unexpected snapshot identity`);
 if(provenance.observedHead!==undefined)assert.match(provenance.observedHead,/^[a-f0-9]{40}$/);
 const actual=createHash('sha256').update(await readFile(new URL(snapshotFile,root))).digest('hex');
 assert.equal(actual,provenance.snapshotSha256,`${manifestFile}: snapshot hash drift; record a reviewed provenance update`);
}
const agentConfig=parse(await readFile(new URL('templates/agents/codex-config.toml',root),'utf8'));
assert.equal(typeof agentConfig.agents,'object');
const agentTemplates=(await readdir(new URL('templates/agents/',root),{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.toml')&&entry.name!=='codex-config.toml').map(entry=>`agents/${entry.name}`).sort();
const registeredAgents=new Set();
const inlineAgentContracts=new Set(['spec-reviewer','frontend-reviewer']);
for(const [name,registration] of Object.entries(agentConfig.agents)){
 assert.match(name,/^[a-z][a-z0-9-]*$/,`Invalid Agent registration name: ${name}`);
 assert.equal(typeof registration.description,'string',`${name}: description is required`);
 assert.match(registration.description,/\S/,`${name}: description is empty`);
 assert.match(registration.config_file,/^agents\/[a-z][a-z0-9-]*\.toml$/,`${name}: config_file must be a safe relative Agent path`);
 assert(!registeredAgents.has(registration.config_file),`${registration.config_file}: registered more than once`);
 registeredAgents.add(registration.config_file);
 const role=parse(await readFile(new URL(`templates/${registration.config_file}`,root),'utf8'));
 assert.equal(role.name,name,`${registration.config_file}: name does not match its registration`);
 assert.equal(typeof role.description,'string',`${registration.config_file}: description is required`);
 assert.match(role.description,/\S/,`${registration.config_file}: description is empty`);
 if(!inlineAgentContracts.has(name))await access(new URL(`agents/${name}.md`,root));
}
assert.deepEqual([...registeredAgents].sort(),agentTemplates,'Every Agent template must be registered exactly once');
assert.deepEqual((await readdir(new URL('agents/',root),{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.md')).map(entry=>entry.name).sort(),Object.keys(agentConfig.agents).filter(name=>!inlineAgentContracts.has(name)).map(name=>`${name}.md`).sort(),'Agent contracts must match registered roles without orphans');
await assert.rejects(access(new URL('src/openspec-min/artifact-templates/design.md',root)),{code:'ENOENT'});
await assert.rejects(access(new URL('runtime/openspec-min/src/engine/artifacts/index.js',root)),{code:'ENOENT'});
await assert.rejects(access(new URL('runtime/openspec-min/src/engine/artifacts/change.schema.js',root)),{code:'ENOENT'});
for(const file of ['mini/index.js','v4-mini/index.js','v4/mini/index.js','compile.js'])await assert.rejects(access(new URL(`runtime/openspec-min/node_modules/zod/${file}`,root)),{code:'ENOENT'});
const zodExports=JSON.parse(await readFile(new URL('runtime/openspec-min/node_modules/zod/package.json',root),'utf8')).exports;
for(const subpath of ['./mini','./compile','./locales','./v3','./v4-mini','./v4/mini'])assert(!(subpath in zodExports),`Bundled Zod metadata exposes pruned subpath: ${subpath}`);
for(const subpath of ['.','./package.json','./v4','./v4/core','./v4/locales','./v4/locales/*'])assert(subpath in zodExports,`Bundled Zod metadata is missing retained subpath: ${subpath}`);
await access(new URL('runtime/openspec-min/node_modules/zod/v4/locales/index.js',root));
const proposalTemplate=await readFile(new URL('skills/spec-propose/assets/proposal.md',root),'utf8');
assert.match(proposalTemplate,/Architecture impact \(exploration\)/);
assert.match(await readFile(new URL('skills/spec-propose/SKILL.md',root),'utf8'),/Carry forward the architecture impact summary.*proposal\.md/s);
const designSystem=await readdir(new URL('design-guidance/',root),{withFileTypes:true});assert(designSystem.filter(entry=>entry.name!=='.DS_Store').every(entry=>entry.isDirectory()||entry.name.endsWith('.md')));
const contextSource=await readFile(new URL('src/workflow-controller/documents.mjs',root),'utf8');
for(const reference of ['design-guidance/DESIGN.md','design-guidance/rules/visual-language.md','standards/api/api.md','standards/database/schema.md','standards/database/query.md','standards/languages/typescript.md'])assert(contextSource.includes(reference));
const standardsReadme=await readFile(new URL('standards/README.md',root),'utf8');
const controllerSection=standardsReadme.split('## Controller-selected references')[1]?.split('\n## ')[0];
assert(controllerSection,'standards/README.md must declare controller-selected references');
const declaredControllerReferences=[...markdownTargets(controllerSection,'standards/README.md')].filter(file=>file.startsWith('standards/')&&file.endsWith('.md')).sort();
const wiredControllerReferences=[...new Set([...contextSource.matchAll(/standards\/[A-Za-z0-9._/-]+\.md/g)].map(match=>match[0]))].sort();
assert.deepEqual(declaredControllerReferences,wiredControllerReferences,'standards/README.md controller-selection claims must exactly match src/workflow-controller/documents.mjs');
assert(!((await readFile(new URL('src/quality-controller/index.mjs',root),'utf8')).includes('design-guidance/profiles')));
console.log(`Validated ${names.length} skills, links, sole install manifest, hooks, standards, design guidance and runtime exports.`);
