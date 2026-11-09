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
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
