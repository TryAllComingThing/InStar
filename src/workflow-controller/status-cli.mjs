import path from 'node:path';
import {readdir,readFile} from 'node:fs/promises';
import {run} from './index.mjs';
import {safe} from './files.mjs';

const usage='Usage: instar status --project <path> [--change <changeId>] [--json]';

async function latestActive(project){
 const dir=await safe(project,'planning/workflows');
 const files=(await readdir(dir)).filter(name=>name.endsWith('.json')).sort();
 let best=null;
 for(const file of files){const state=JSON.parse(await readFile(await safe(project,`planning/workflows/${file}`),'utf8'));if(state.status==='completed')continue;const at=state.history?.at(-1)?.at||'';if(!best||at>best.at)best={changeId:state.changeId,at};}
 return best?.changeId||null;
}

export async function main(args,cwd=process.cwd()){
 let project=path.resolve(cwd),changeId=null,json=false;
 try{
  if(args.includes('--help')||args.includes('-h')){console.log(usage);return;}
  for(let index=0;index<args.length;index++){
   const token=args[index];
   if(token==='--json'){json=true;continue;}
   if(!['--project','--change'].includes(token))throw Error(`Unknown option: ${token}. ${usage}`);
   if(index+1>=args.length||args[index+1].startsWith('--'))throw Error(`Option requires a value: ${token}`);
   const value=args[++index];
   if(token==='--project')project=path.resolve(cwd,value);else changeId=value;
  }
  if(!changeId)changeId=await latestActive(project);
  if(!changeId)throw Error('No active workflow found; pass --change <changeId>');
  const result=await run({project,changeId,action:'visualize'});
  console.log(json?JSON.stringify(result,null,2):result.markdown);
 }catch(error){
  if(json){console.error(JSON.stringify({status:'BLOCK',error:error.message},null,2));process.exitCode=1;return;}
  throw error;
 }
}
