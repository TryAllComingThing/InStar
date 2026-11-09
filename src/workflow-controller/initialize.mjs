import {fs,path,safe,pluginRoot,projectRoot,exists,read,json,hash,atomic,putJson,lock} from './files.mjs';
import {mergeAgentRegistrations,parseProjectAgentConfig,removeAgentRegistrations} from '../shared/agent-config.mjs';
const allReviewRoles=['architect','developer','ui-reviewer','code-reviewer','security-reviewer','spec-reviewer','frontend-reviewer'];
const frontendOnlyReviewRoles=new Set(['ui-reviewer','frontend-reviewer']);
const stacks=new Set(['frontend','backend','fullstack']);
const agentsBlockKey='AGENTS.md#instar:block';
const removableManagedAsset=/^(?:\.codex\/agents\/[a-z0-9-]+\.(?:toml|md)|docs\/engineering\/(?:testing|frontend-conventions)\.md)$/;
async function pruneEmptyParents(root,destinations){
 const dirs=new Set();
 for(const dest of destinations){let dir=path.posix.dirname(dest);while(dir&&dir!=='.'){dirs.add(dir);dir=path.posix.dirname(dir);}}
 for(const dir of [...dirs].sort((a,b)=>b.length-a.length)){
  try{const entries=await fs.readdir(safe(root,dir));if(!entries.length)await fs.rmdir(safe(root,dir));}
  catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTEMPTY')throw error;}
 }
}
function installationFor(stack){
 const frontend=stack!=='backend';
 const roles=allReviewRoles.filter(name=>frontend||!frontendOnlyReviewRoles.has(name));
 const managed=[['templates/engineering/testing.md','docs/engineering/testing.md']];
 if(frontend)managed.push(['templates/engineering/frontend-conventions.md','docs/engineering/frontend-conventions.md']);
 for(const name of roles){
  managed.push([`templates/agents/${name}.toml`,`.codex/agents/${name}.toml`]);
  if(name!=='spec-reviewer'&&name!=='frontend-reviewer')managed.push([`agents/${name}.md`,`.codex/agents/${name}.md`]);
 }
 return {managed,roles,frontend};
}
function previousRolesFor(old){
 const result=new Set();
 if(stacks.has(old?.stack))for(const role of installationFor(old.stack).roles)result.add(role);
 for(const dest of Object.keys(old?.managed||{})){
  const match=/^\.codex\/agents\/([a-z0-9-]+)\.toml$/.exec(dest);
  if(match&&allReviewRoles.includes(match[1]))result.add(match[1]);
 }
 return [...result];
}
export async function initialize(input,{preview=false,stack='fullstack'}={}){
 if(!stacks.has(stack))throw Error('stack must be frontend, backend or fullstack');
 const root=await projectRoot(input,{initialized:false});
 const assets=installationFor(stack);
 async function apply(){
  const result={project:root,stack,created:[],updated:[],unchanged:[],removed:[],conflicts:[],preview,agents:{status:'pending',registered:[],missing:[],removed:[],conflicts:[],trustNote:'Codex loads project-level .codex configuration only after the project is trusted.'}};
  const configPath='.instar.json';const old=await exists(safe(root,configPath))?await json(root,configPath):{schemaVersion:1,managed:{}};
  if(old.schemaVersion!==1||!old.managed||typeof old.managed!=='object')throw Error('Unsupported project configuration');
  delete old.managed['.codex/config.toml']; // Project config is user-owned; manage only our individual role files.
  const previousRoles=previousRolesFor(old);
  const version=JSON.parse(await read(pluginRoot,'.codex-plugin/plugin.json')).version;
  const writes=[],removals=[];
  const desiredDestinations=new Set(assets.managed.map(([,dest])=>dest));
  for(const [source,dest] of assets.managed){
   const content=await read(pluginRoot,source);
   if(await exists(safe(root,dest))){
    const actual=await read(root,dest),actualHash=hash(actual);
    if(actual===content)result.unchanged.push(dest);
    else if(old.managed[dest]&&actualHash===old.managed[dest]){writes.push([dest,content]);result.updated.push(dest);}
    else{result.conflicts.push({path:dest,reason:'Existing content preserved because it differs from the managed copy; compare with plugin template'});continue;}
   }
   else{result.created.push(dest);writes.push([dest,content]);}
   old.managed[dest]=hash(content);
  }
  for(const dest of Object.keys(old.managed)){
   if(dest.includes('#')||desiredDestinations.has(dest))continue;
   if(!removableManagedAsset.test(dest)){result.conflicts.push({path:dest,reason:'Managed path is outside the plugin asset allowlist; preserved'});continue;}
   const oldHash=old.managed[dest];delete old.managed[dest];
   if(!await exists(safe(root,dest)))continue;
   const stat=await fs.lstat(safe(root,dest));
   if(!stat.isFile()){result.conflicts.push({path:dest,reason:'Previously managed path is no longer a regular file; preserved'});continue;}
   const actual=await read(root,dest);
   if(oldHash&&hash(actual)===oldHash){removals.push(dest);result.removed.push(dest);}
   else result.conflicts.push({path:dest,reason:'Managed asset is no longer applicable but was modified locally; preserved'});
  }
  const agentConfigPath='.codex/config.toml';
  const configTemplate=await read(pluginRoot,'templates/agents/codex-config.toml');
  const allDesired=parseProjectAgentConfig(configTemplate).agents;
  const desired=Object.fromEntries(assets.roles.map(name=>{if(!allDesired[name])throw Error(`Missing reviewer template registration: ${name}`);return [name,allDesired[name]];}));
  try{
   const configExists=await exists(safe(root,agentConfigPath));
   const existingConfig=configExists?await read(root,agentConfigPath):'';
   const expectedFiles=Object.fromEntries(allReviewRoles.map(name=>[name,`agents/${name}.toml`]));
   const disabledRoles=previousRoles.filter(name=>!assets.roles.includes(name));
   const cleaned=removeAgentRegistrations(existingConfig,disabledRoles,expectedFiles);
   const merged=mergeAgentRegistrations(cleaned.text,desired);
   const allConflicts=[...cleaned.conflicts,...merged.conflicts];
   const registered=merged.registered.filter(name=>!merged.conflicts.some(item=>item.role===name));
   const missing=Object.keys(desired).filter(name=>!registered.includes(name));
   result.agents={...result.agents,status:missing.length||allConflicts.length?'conflict':'ready',registered,missing,removed:cleaned.removed,conflicts:allConflicts};
   for(const item of cleaned.conflicts)result.conflicts.push({path:agentConfigPath,reason:`Agent role ${item.role} uses a custom registration and was preserved while changing installation scope`,expected:item.expected});
   for(const item of merged.conflicts)result.conflicts.push({path:agentConfigPath,reason:item.reason||`Agent role ${item.role} is already registered with config_file ${item.existing||'(unset)'}`,expected:item.expected});
   if(merged.text!==existingConfig){writes.push([agentConfigPath,merged.text]);(configExists?result.updated:result.created).push(agentConfigPath);}
   else if(configExists)result.unchanged.push(agentConfigPath);
  }catch(error){
   result.agents={...result.agents,status:'invalid-config',registered:[],missing:Object.keys(desired),conflicts:[{path:agentConfigPath,reason:error.message}]};
   result.conflicts.push({path:agentConfigPath,reason:`Codex Agent registrations were not changed: ${error.message}`});
  }
  const markerStart='<!-- instar:start -->',markerEnd='<!-- instar:end -->';
  const guidance=await read(pluginRoot,'templates/AGENTS.md');
  const block=`${markerStart}\n${guidance.trim()}\n${markerEnd}`;
  const existing=await exists(safe(root,'AGENTS.md'))?await read(root,'AGENTS.md'):'';
  const starts=existing.split(markerStart).length-1,ends=existing.split(markerEnd).length-1;
  if(starts||ends){
   const start=existing.indexOf(markerStart),end=existing.indexOf(markerEnd);
   if(starts!==1||ends!==1||end<start){result.conflicts.push({path:'AGENTS.md',reason:'Managed guidance markers are incomplete or ambiguous; preserved for review'});delete old.managed[agentsBlockKey];}
   else{
    const currentBlock=existing.slice(start,end+markerEnd.length);
    if(currentBlock===block){result.unchanged.push('AGENTS.md');old.managed[agentsBlockKey]=hash(block);}
    else if(old.managed[agentsBlockKey]&&hash(currentBlock)===old.managed[agentsBlockKey]){writes.push(['AGENTS.md',`${existing.slice(0,start)}${block}${existing.slice(end+markerEnd.length)}`]);result.updated.push('AGENTS.md');old.managed[agentsBlockKey]=hash(block);}
    else{result.conflicts.push({path:'AGENTS.md',reason:old.managed[agentsBlockKey]?'Managed guidance was edited locally; preserved for review':'Managed guidance has no recorded hash; preserved for review'});delete old.managed[agentsBlockKey];}
   }
  }else{writes.push(['AGENTS.md',`${existing}${existing&&!existing.endsWith('\n')?'\n':''}\n${block}\n`]);result.created.push('AGENTS.md guidance');old.managed[agentsBlockKey]=hash(block);}
  // Validate all destinations before performing writes. Existing files are never replaced.
  for(const [dest] of writes)safe(root,dest);
  for(const dest of removals)safe(root,dest);
  for(const dir of ['planning/specs','planning/changes','planning/archive','planning/workflows','docs/prd','.workflow'])safe(root,dir);
  if(!preview){
   for(const [dest,content] of writes)await atomic(root,dest,content);
   for(const dest of removals)await fs.rm(safe(root,dest),{force:true});
   await pruneEmptyParents(root,removals);
   for(const dir of ['planning/specs','planning/changes','planning/archive','planning/workflows','docs/prd','.workflow'])await fs.mkdir(safe(root,dir),{recursive:true});
   await putJson(root,'.instar.json',{...old,pluginVersion:version,stack,installationScope:stack});
  }
  return result;
 }
 return preview?apply():lock(root,apply);
}
