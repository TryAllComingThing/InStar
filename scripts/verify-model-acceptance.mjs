import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {reuseContext} from '../runtime/shared/code-reuse.mjs';
import {readProjectFile} from '../runtime/shared/project-baseline.mjs';

const root=fileURLToPath(new URL('../reports/model-acceptance/next-batch/',import.meta.url));
const hash=text=>createHash('sha256').update(text).digest('hex');
const manifest=JSON.parse(await readFile(path.join(root,'source-manifest.json'),'utf8'));
const checks=[];
for(const source of manifest.sources){
 if(source.project==='incremental'&&source.file==='docs/project-baseline/capabilities/index.json')continue;
 const actual=await readFile(path.join(root,source.project,source.file),'utf8');
 checks.push({check:'original-source-preserved',project:source.project,file:source.file,passed:hash(actual)===source.sha256});
}
for(const project of ['reuse-core','incremental']){
 const context=await reuseContext(path.join(root,project));
 checks.push({check:'disabled-valid-index-with-current-hashes',project,passed:context.enabled===false&&context.capabilities.length>0&&context.capabilities.every(c=>c.fresh)});
}
const incremental=JSON.parse(await readFile(path.join(root,'incremental/docs/project-baseline/capabilities/index.json'),'utf8'));
const originalDate={id:'CAP-DATE',name:'Date key',summary:'UTC date key',entry:'src/date.mjs',sourceHash:manifest.sources.find(s=>s.project==='incremental'&&s.file==='src/date.mjs').sha256,status:'active',visibility:'public'};
checks.push({check:'unrelated-capability-preserved',passed:JSON.stringify(incremental.capabilities.find(c=>c.id==='CAP-DATE'))===JSON.stringify(originalDate)});
const base=path.join(root,'baseline');
for(const domain of ['architecture','domain','api','database','coding','security-runtime']){
 const doc=await readFile(path.join(base,`docs/project-baseline/${domain}.md`),'utf8');
 const evidence=JSON.parse(await readFile(path.join(base,`docs/project-baseline/evidence/${domain}.json`),'utf8'));
 checks.push({check:'readable-domain-output',domain,passed:!/[?]{3,}|\uFFFD/.test(doc+JSON.stringify(evidence))});
 for(const finding of evidence.findings||[])for(const source of finding.sources||[]){
  const text=await readProjectFile(base,source.path);const selection=text.split(/\r?\n/).slice(source.startLine-1,source.endLine).join('\n');
  checks.push({check:'exact-evidence-excerpt',id:finding.id,passed:typeof source.excerpt==='string'&&source.excerpt.trim().length>0&&selection.includes(source.excerpt)});
 }
}
const testRuns=[];
for(const [project,file] of [['reuse-core','test/requests.test.mjs'],['baseline','test/orders.test.mjs']]){
 const result=spawnSync(process.execPath,['--test',file],{cwd:path.join(root,project),encoding:'utf8',timeout:15000});
 testRuns.push({project,command:`node --test ${file}`,exitCode:result.status,output:result.stdout,stderr:result.stderr});checks.push({check:'existing-fixture-test',project,passed:result.status===0});
}
const probe=spawnSync(process.execPath,['--input-type=module','-e',"import {listOrders} from './src/orders/index.mjs';console.log(JSON.stringify(['0','101','1.5','abc'].map(limit=>({input:limit,actual:String(listOrders({limit}).limit)}))));"],{cwd:base,encoding:'utf8',timeout:15000});
testRuns.push({project:'baseline',command:'evaluator probe of invalid limits at public module entry',exitCode:probe.status,output:probe.stdout,stderr:probe.stderr});
checks.push({check:'contract-conflict-reproduced',passed:probe.status===0&&probe.stdout.includes('NaN')&&probe.stdout.includes('101')});
const artifactHashes=[];
async function walk(current){for(const e of await readdir(current,{withFileTypes:true})){const file=path.join(current,e.name);if(e.isDirectory())await walk(file);else if(e.isFile()&&!file.endsWith('verification.json'))artifactHashes.push({path:path.relative(root,file).replaceAll('\\','/'),sha256:hash(await readFile(file))});}}
await walk(root);
const skillSnapshots=[];for(const skill of ['project-discover','reuse-discover']){const file=fileURLToPath(new URL(`../skills/${skill}/SKILL.md`,import.meta.url));skillSnapshots.push({skill,sha256:hash(await readFile(file)),timing:'Evaluation-time snapshot after corrective guidance updates; exact initial invocation snapshot was not captured'});}
const report={generatedAt:new Date().toISOString(),modelIdentity:'Independent Codex subagent invocations; exact model/version not exposed to evaluator',nodeVersion:process.version,status:checks.every(c=>c.passed)?'PASS':'FAIL',scope:'Deterministic artifact and source checks; semantic decisions evaluated separately in report.md, not human product acceptance',skillSnapshots,checks,testRuns,artifactHashes};
await writeFile(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(c=>!c.passed)}));
if(report.status!=='PASS')process.exitCode=1;
