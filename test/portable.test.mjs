import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('relocated release runtime initializes and starts a change without source or external dependencies',async t=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'frontend-portable-'));t.after(()=>rm(temp,{recursive:true,force:true}));const plugin=path.join(temp,'plugin'),project=path.join(temp,'project');await mkdir(plugin);await mkdir(project);
 for(const name of ['runtime','.codex-plugin','templates','agents','skills'])await cp(new URL(`../${name}`,import.meta.url),path.join(plugin,name),{recursive:true});
 for(const input of [{action:'initialize',project},{action:'start',project,changeId:'portable-check',document:'# PRD\nPortable workflow.'},{action:'submit-prd',project,changeId:'portable-check',expectedVersion:1}]){
  const result=spawnSync(process.execPath,[path.join(plugin,'runtime/workflow-controller/cli.mjs'),'-'],{input:JSON.stringify(input),encoding:'utf8',cwd:temp});assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);assert.ok(output.project||output.version);
 }
 assert.equal(JSON.parse(await readFile(path.join(project,'planning/workflows/portable-check.json'),'utf8')).pendingApproval,'prd');
 for(const name of ['proposal','spec','design','tasks'])assert.ok(await readFile(path.join(plugin,'runtime/openspec-min/artifact-templates',name+'.md'),'utf8'));
});
