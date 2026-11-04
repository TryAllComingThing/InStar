import {fs,path,safe,exists,assertTree} from './files.mjs';

export function normalizeWritePaths(paths){
 if(!Array.isArray(paths)||!paths.length||paths.length>2000)throw Error('Invalid transaction write set');
 for(const value of paths)if(typeof value!=='string'||value.length>2048||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..')||!(value==='planning'||value.startsWith('planning/')||value==='docs/prd'||value.startsWith('docs/prd/')||value==='.workflow/context-manifests'||value.startsWith('.workflow/context-manifests/')||value==='.workflow/evidence-graphs'||value.startsWith('.workflow/evidence-graphs/')||value==='.instar/context'||value.startsWith('.instar/context/')||value==='.workflow/traces.jsonl'))throw Error('Invalid transaction write path');
 const unique=[...new Set(paths)].sort();
 return unique.filter(p=>!unique.some(parent=>parent!==p&&p.startsWith(parent+'/')));
}
export async function assertTarget(root,relative){
 let current=root;const parts=relative.split('/');
 for(let i=0;i<parts.length;i++){
  current=safe(current,parts[i]);let stat;try{stat=await fs.lstat(current);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(stat.isSymbolicLink())throw Error(`Symlink not supported: ${relative}`);
  if(i<parts.length-1&&!stat.isDirectory())throw Error(`Unsafe output path: ${relative}`);
  if(i===parts.length-1){if(stat.isDirectory())await assertTree(root,relative);else if(!stat.isFile())throw Error(`Unsupported transaction target: ${relative}`);}
 }
}
export async function missingParents(root,paths){
 const result=new Set();for(const file of paths){let parent=path.posix.dirname(file);while(parent!=='.'){if(!await exists(safe(root,parent)))result.add(parent);parent=path.posix.dirname(parent);}}
 return [...result].sort((a,b)=>b.split('/').length-a.split('/').length||a.localeCompare(b));
}
export async function workflowWritePaths(root,id,action){
 const paths=[`planning/workflows/${id}.json`,`docs/prd/${id}.md`,`planning/changes/${id}`,`planning/archive/${id}`,'.workflow/traces.jsonl'];
 if(['create-spec','save-spec','write-design','write-tasks'].includes(action))paths.push(`.instar/context/${id}`);
 if(action==='write-design')paths.push(`.workflow/context-manifests/${id}`);
 if(action==='submit-quality-review')paths.push(`.workflow/evidence-graphs/${id}`);
 if(action==='archive'){
  const {discoverSpecFiles}=await import('../openspec-min/src/utils/spec-discovery.js');
  for(const item of await discoverSpecFiles(safe(root,`planning/changes/${id}/specs`)))paths.push(`planning/specs/${item.id}`);
 }
 return normalizeWritePaths(paths);
}
