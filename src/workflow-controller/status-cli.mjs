import path from 'node:path';
import {run} from './index.mjs';
import {json} from './files.mjs';
import {readDirectoryVerified} from '../shared/path-safety.mjs';

const usage='Usage: instar status --project <path> [--change <changeId>] [--json]';

async function latestActive(project){
 const entries=await readDirectoryVerified(project,'planning/workflows',{label:'planning/workflows'});
 const files=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).map(entry=>entry.name).sort();
 let best=null;
 for(const file of files){const state=await json(project,`planning/workflows/${file}`);if(state.status==='completed')continue;const at=state.history?.at(-1)?.at||'';if(!best||at>best.at)best={changeId:state.changeId,at};}
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
