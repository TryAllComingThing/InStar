import {fs,path,safe,pluginRoot,projectRoot,exists,read,json,hash,atomic,putJson,lock} from './files.mjs';
import {mergeAgentRegistrations,parseProjectAgentConfig} from '../shared/agent-config.mjs';
const managed=[['templates/engineering/frontend-conventions.md','docs/engineering/frontend-conventions.md'],['templates/engineering/testing.md','docs/engineering/testing.md'],...['architect','developer','ui-reviewer','code-reviewer'].flatMap(name=>[[`templates/agents/${name}.toml`,`.codex/agents/${name}.toml`],[`agents/${name}.md`,`.codex/agents/${name}.md`]]),['templates/agents/spec-reviewer.toml','.codex/agents/spec-reviewer.toml'],['templates/agents/frontend-reviewer.toml','.codex/agents/frontend-reviewer.toml']];
export async function initialize(input,{preview=false}={}){
 const root=await projectRoot(input,{initialized:false});
 async function apply(){
  const result={project:root,created:[],updated:[],unchanged:[],conflicts:[],preview,agents:{status:'pending',registered:[],missing:[],conflicts:[],trustNote:'Codex loads project-level .codex configuration only after the project is trusted.'}};
  const configPath='.instar.json';const old=await exists(safe(root,configPath))?await json(root,configPath):{schemaVersion:1,managed:{}};
  if(old.schemaVersion!==1||!old.managed||typeof old.managed!=='object')throw Error('Unsupported project configuration');
  delete old.managed['.codex/config.toml']; // Project config is user-owned; manage only our individual role files.
  const version=JSON.parse(await read(pluginRoot,'.codex-plugin/plugin.json')).version;
  const writes=[];
  for(const [source,dest] of managed){
   const content=await read(pluginRoot,source);
   if(await exists(safe(root,dest))){const actual=await read(root,dest);if(actual===content)result.unchanged.push(dest);else{result.conflicts.push({path:dest,reason:'Existing content preserved; compare with plugin template'});continue;}}
   else{result.created.push(dest);writes.push([dest,content]);}
   old.managed[dest]=hash(content);
  }
  const agentConfigPath='.codex/config.toml';
  const configTemplate=await read(pluginRoot,'templates/agents/codex-config.toml');
  const allDesired=parseProjectAgentConfig(configTemplate).agents;
  const desired=allDesired;
  try{
   const configExists=await exists(safe(root,agentConfigPath));
   const existingConfig=configExists?await read(root,agentConfigPath):'';
   const merged=mergeAgentRegistrations(existingConfig,desired);
   const allConflicts=merged.conflicts;
   const registered=merged.registered.filter(name=>!merged.conflicts.some(item=>item.role===name));
   const missing=Object.keys(desired).filter(name=>!registered.includes(name));
   result.agents={...result.agents,status:missing.length||allConflicts.length?'conflict':'ready',registered,missing,conflicts:allConflicts};
   for(const item of allConflicts)result.conflicts.push({path:agentConfigPath,reason:item.reason||`Agent role ${item.role} is already registered with config_file ${item.existing||'(unset)'}`,expected:item.expected});
   if(merged.added){writes.push([agentConfigPath,merged.text]);(configExists?result.updated:result.created).push(agentConfigPath);}
   else if(configExists)result.unchanged.push(agentConfigPath);
  }catch(error){
   result.agents={...result.agents,status:'invalid-config',registered:[],missing:Object.keys(desired),conflicts:[{path:agentConfigPath,reason:error.message}]};
   result.conflicts.push({path:agentConfigPath,reason:`Codex Agent registrations were not changed: ${error.message}`});
  }
  const markerStart='<!-- instar:start -->',markerEnd='<!-- instar:end -->';
  const guidance=await read(pluginRoot,'templates/AGENTS.md');
  const block=`${markerStart}\n${guidance.trim()}\n${markerEnd}`;
  const existing=await exists(safe(root,'AGENTS.md'))?await read(root,'AGENTS.md'):'';
  if(existing.includes(markerStart)||existing.includes(markerEnd)){
   if(existing.includes(block))result.unchanged.push('AGENTS.md');else result.conflicts.push({path:'AGENTS.md',reason:'Managed guidance differs or markers are incomplete; preserved for review'});
  }else{writes.push(['AGENTS.md',`${existing}${existing&&!existing.endsWith('\n')?'\n':''}\n${block}\n`]);result.created.push('AGENTS.md guidance');}
  // Validate all destinations before performing writes. Existing files are never replaced.
  for(const [dest] of writes)safe(root,dest);
  for(const dir of ['planning/specs','planning/changes','planning/archive','planning/workflows','docs/prd','.workflow'])safe(root,dir);
  if(!preview){
   for(const [dest,content] of writes)await atomic(root,dest,content);
   for(const dir of ['planning/specs','planning/changes','planning/archive','planning/workflows','docs/prd','.workflow'])await fs.mkdir(safe(root,dir),{recursive:true});
   await putJson(root,'.instar.json',{...old,pluginVersion:version});
  }
  return result;
 }
 return preview?apply():lock(root,apply);
}
