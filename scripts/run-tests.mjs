import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const roots=['test','src/openspec-min/test'];
const files=[];
for(const root of roots){
 for(const item of (await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(item.isFile()&&item.name.endsWith('.test.mjs'))files.push(path.join(root,item.name));
 }
}
if(!files.length)throw Error('No test files found');
const mode=process.argv[2]||'--all';
const slow=new Set(['workflow.test.mjs','quality.test.mjs','discovery.test.mjs','integration.test.mjs']);
const selected=mode==='--fast'?files.filter(file=>!slow.has(path.basename(file))):files;
if(mode!=='--all'&&mode!=='--fast')throw Error('Test runner accepts --all or --fast');
const result=spawnSync(process.execPath,['--test',...selected],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
